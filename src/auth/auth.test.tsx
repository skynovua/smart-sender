import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, test, vi } from 'vitest';

import { ApiError } from '@/api/errors';
import { App } from '@/app/app';
import { createAppRouter } from '@/app/router';
import { mockCredentials, mockUser } from '@/mocks/fixtures';
import { errorResponse } from '@/mocks/responses';
import { server } from '@/mocks/server';

import { AuthSession } from './session';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

async function openApp(path = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const auth = new AuthSession(queryClient);
  const appRouter = createAppRouter(
    { queryClient, auth },
    createMemoryHistory({ initialEntries: [path] }),
  );
  render(<App appRouter={appRouter} />);
  await screen.findByRole('heading', { name: 'Вхід' });
  return { auth, queryClient, appRouter, user: userEvent.setup() };
}

async function fillLogin(
  user: ReturnType<typeof userEvent.setup>,
  password = mockCredentials.password,
) {
  await user.type(screen.getByLabelText('Електронна адреса'), mockCredentials.email);
  await user.type(screen.getByLabelText('Пароль'), password);
  await user.click(screen.getByRole('button', { name: 'Увійти' }));
}

test('protects the page and returns to its original URL after the complete login flow', async () => {
  const target = '/?page=2&search=webhook';
  const { user, auth, appRouter } = await openApp(target);
  expect(appRouter.state.location.pathname).toBe('/login');
  expect(appRouter.state.location.search.redirect).toBe(target);
  expect(screen.queryByText('Керування вебхуками.')).not.toBeInTheDocument();

  await fillLogin(user);
  await screen.findByText('Керування вебхуками.');
  expect(auth.getUser()).toEqual(mockUser);
  expect(screen.getByText(mockUser.name)).toBeInTheDocument();
  expect(appRouter.state.location.href).toBe(target);
});

test('validates empty fields before making a login request', async () => {
  const login = vi.fn(() => HttpResponse.json({}, { status: 500 }));
  server.use(http.post('*/auth/login', login));
  const { user } = await openApp();
  await user.click(screen.getByRole('button', { name: 'Увійти' }));

  expect(await screen.findByText('Введіть коректну електронну адресу.')).toBeInTheDocument();
  expect(screen.getByText('Введіть пароль.')).toBeInTheDocument();
  expect(screen.getByLabelText('Електронна адреса')).toHaveAttribute('aria-invalid', 'true');
  expect(login).not.toHaveBeenCalled();
});

test('shows the server password error and allows a successful retry', async () => {
  const { user } = await openApp();
  await fillLogin(user, 'incorrect-password');
  expect(await screen.findByText('The provided credentials are incorrect.')).toBeInTheDocument();
  const password = screen.getByLabelText('Пароль');
  expect(password).toHaveFocus();
  expect(password).toHaveAttribute('aria-invalid', 'true');

  await user.clear(password);
  await user.type(password, mockCredentials.password);
  await user.click(screen.getByRole('button', { name: 'Увійти' }));
  await screen.findByText('Керування вебхуками.');
});

test('blocks duplicate submissions while login is pending', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const login = vi.fn(async () => {
    await pending;
    return HttpResponse.error();
  });
  server.use(http.post('*/auth/login', login));
  const { user } = await openApp();
  await fillLogin(user);
  const submit = await screen.findByRole('button', { name: 'Входимо…' });
  expect(submit).toBeDisabled();
  expect(screen.getByLabelText('Електронна адреса')).toHaveAttribute('readonly');
  await user.click(submit);
  expect(login).toHaveBeenCalledTimes(1);
  release();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося увійти');
  expect(screen.getByRole('button', { name: 'Увійти' })).toBeEnabled();
});

test('logout clears the user and private query cache even if revoke fails', async () => {
  const { user, auth, queryClient } = await openApp();
  await fillLogin(user);
  await screen.findByText('Керування вебхуками.');
  queryClient.setQueryData(['webhooks'], { private: true });
  const revoke = vi.fn(() => HttpResponse.error());
  server.use(http.post('*/auth/token/revoke', revoke));

  await user.click(screen.getByRole('button', { name: 'Вийти' }));
  await screen.findByRole('heading', { name: 'Вхід' });
  expect(auth.getUser()).toBeNull();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(screen.queryByText(mockUser.name)).not.toBeInTheDocument();
  await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
});

test('a failed rotation clears user/cache and redirects to login', async () => {
  const { user, auth, queryClient, appRouter } = await openApp('/?page=2');
  await fillLogin(user);
  await screen.findByText('Керування вебхуками.');
  queryClient.setQueryData(['webhooks'], { private: true });
  server.use(
    http.get('*/v1/me', () => errorResponse(401, 'Expired.')),
    http.post('*/auth/token/rotate', () => errorResponse(400, 'Revoked.')),
  );

  await act(async () => {
    await expect(auth.api.getMe()).rejects.toBeInstanceOf(ApiError);
  });
  await screen.findByRole('heading', { name: 'Вхід' });
  expect(auth.getUser()).toBeNull();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(appRouter.state.location.search.redirect).toBe('/?page=2&search=');
});

test.each(['https://evil.example', '//evil.example', '/\\evil.example', '/login'])(
  'rejects unsafe or looping return destination %s',
  async (destination) => {
    const { user, appRouter } = await openApp(`/login?redirect=${encodeURIComponent(destination)}`);
    await fillLogin(user);
    await screen.findByText('Керування вебхуками.');
    expect(appRouter.state.location.href).toBe('/?page=1&search=');
  },
);
