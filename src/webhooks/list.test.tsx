import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, test, vi } from 'vitest';

import { App } from '@/app/app';
import { createAppRouter } from '@/app/router';
import { AuthSession } from '@/auth/session';
import { createWebhooks, mockCredentials } from '@/mocks/fixtures';
import { resetMockApi } from '@/mocks/handlers';
import { server } from '@/mocks/server';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

async function openWebhooks(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth = new AuthSession(queryClient);
  await auth.signIn(mockCredentials);
  const appRouter = createAppRouter(
    { auth, queryClient },
    createMemoryHistory({ initialEntries: [path] }),
  );
  const view = render(<App appRouter={appRouter} />);
  await screen.findByRole('heading', { name: 'Вебхуки' });
  return { ...view, appRouter, user: userEvent.setup() };
}

async function searchFor(user: ReturnType<typeof userEvent.setup>, search: string) {
  const input = screen.getByLabelText('Пошук за назвою');
  await user.clear(input);
  await user.type(input, search);
  await user.keyboard('{Enter}');
}

function visibleRows() {
  return within(screen.getByRole('table', { name: 'Список вебхуків' }))
    .getAllByRole('row')
    .slice(1);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test('shows ten rows per page, their status/URL, and the eight-row last page', async () => {
  const { user, appRouter } = await openWebhooks();
  await screen.findByText('Payment webhook 01');
  expect(visibleRows()).toHaveLength(10);
  expect(screen.getByText('https://example.com/webhooks/1')).toBeInTheDocument();
  expect(within(visibleRows()[0]!).getByText('Активний')).toBeInTheDocument();
  expect(within(visibleRows()[2]!).getByText('Неактивний')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Попередня' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Наступна' }));
  await screen.findByText('Subscription webhook 11');
  expect(appRouter.state.location.search.page).toBe('2');
  expect(visibleRows()).toHaveLength(10);
  await user.click(screen.getByRole('button', { name: 'Наступна' }));
  await screen.findByText('Customer webhook 21');
  expect(visibleRows()).toHaveLength(8);
  expect(screen.getByText('Усього: 28 · Сторінка 3 з 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Наступна' })).toBeDisabled();
});

test('case-insensitive search resets the page and clearing it restores all results', async () => {
  const { user, appRouter } = await openWebhooks('/?page=3');
  await screen.findByText('Customer webhook 21');
  await searchFor(user, '  pAyMeNt  ');
  await screen.findByText('Payment webhook 01');
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('pAyMeNt');
  expect(appRouter.state.location.search).toEqual({ page: '1', search: 'pAyMeNt' });
  expect(visibleRows()).toHaveLength(10);
  expect(screen.getByText('Усього: 10 · Сторінка 1 з 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Наступна' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Скинути пошук' }));
  await screen.findByText('Усього: 28 · Сторінка 1 з 3');
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('');
  expect(appRouter.state.location.search).toEqual({ page: '1', search: '' });
});

test('back and forward restore the search field, page, and results together', async () => {
  const { user, appRouter } = await openWebhooks('/?page=2&search=webhook');
  await screen.findByText('Subscription webhook 11');
  await searchFor(user, 'Customer');
  await screen.findByText('Customer webhook 20');
  await act(async () => {
    appRouter.history.back();
  });
  await screen.findByText('Subscription webhook 11');
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('webhook');
  expect(appRouter.state.location.search).toEqual({ page: '2', search: 'webhook' });
  await act(async () => {
    appRouter.history.forward();
  });
  await screen.findByText('Customer webhook 20');
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('Customer');
  expect(appRouter.state.location.search).toEqual({ page: '1', search: 'Customer' });
});

test('a new application session restores the list from the saved URL', async () => {
  const first = await openWebhooks('/?page=2&search=webhook');
  await screen.findByText('Subscription webhook 11');
  const url = first.appRouter.state.location.href;
  first.unmount();
  resetMockApi();
  const second = await openWebhooks(url);
  await screen.findByText('Subscription webhook 11');
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('webhook');
  expect(screen.getByText('Усього: 28 · Сторінка 2 з 3')).toBeInTheDocument();
  expect(second.appRouter.state.location.href).toBe(url);
});

test.each(['abc', '0', '-1', '2.5', '9007199254740992'])(
  'invalid page %s falls back to the first page',
  async (page) => {
    await openWebhooks(`/?page=${page}`);
    await screen.findByText('Payment webhook 01');
    expect(screen.getByText('Усього: 28 · Сторінка 1 з 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Попередня' })).toBeDisabled();
  },
);

test('an out-of-range page is clamped and replaced in the URL', async () => {
  const { appRouter } = await openWebhooks('/?page=999&search=Customer');
  await screen.findByText('Customer webhook 20');
  await waitFor(() => expect(appRouter.state.location.search.page).toBe('1'));
  expect(visibleRows()).toHaveLength(9);
  expect(screen.getByText('Усього: 9 · Сторінка 1 з 1')).toBeInTheDocument();
});

test('a numeric search term in a directly opened URL stays a string', async () => {
  await openWebhooks('/?page=1&search=01');
  await screen.findByText('Payment webhook 01');
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('01');
  expect(visibleRows()).toHaveLength(1);
});

test('no matches show the empty state and allow clearing the search', async () => {
  const { user } = await openWebhooks('/?search=no-matching-webhook');
  await screen.findByRole('heading', { name: 'Вебхуків не знайдено' });
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Пагінація вебхуків' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Скинути пошук' }));
  await screen.findByText('Payment webhook 01');
});

test('a transient network error shows a retry action that reloads the list', async () => {
  const fail = vi.fn(() => HttpResponse.error());
  server.use(http.get('*/v1/webhooks', fail));
  const { user } = await openWebhooks();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося завантажити вебхуки.');
  expect(fail).toHaveBeenCalledTimes(1);
  server.resetHandlers();
  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
  await screen.findByText('Payment webhook 01');
});

test('shows loading and ignores a slow response for an obsolete search', async () => {
  const pending = deferred();
  const started = deferred();
  const finished = deferred();
  server.use(
    http.get('*/v1/webhooks', async ({ request }) => {
      if (new URL(request.url).searchParams.get('search') !== '') return;
      started.resolve();
      await pending.promise;
      finished.resolve();
      return HttpResponse.json({
        data: createWebhooks().slice(0, 10),
        paging: { pages: { current: 1, last: 3 }, results: { total: 28, limitation: 10 } },
      });
    }),
  );
  const { user } = await openWebhooks();
  await started.promise;
  expect(await screen.findByRole('status')).toHaveTextContent('Завантажуємо вебхуки…');
  await searchFor(user, 'Customer');
  await screen.findByText('Customer webhook 20');
  await act(async () => {
    pending.resolve();
    await finished.promise;
  });
  expect(screen.getByText('Customer webhook 20')).toBeInTheDocument();
  expect(screen.queryByText('Payment webhook 01')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('Customer');
});

test('history navigation discards an unapplied search draft even when the applied filter stays the same', async () => {
  const { user, appRouter } = await openWebhooks('/?page=1&search=webhook');
  await screen.findByText('Payment webhook 01');
  await user.click(screen.getByRole('button', { name: 'Наступна' }));
  await screen.findByText('Subscription webhook 11');
  const input = screen.getByLabelText('Пошук за назвою');
  await user.clear(input);
  await user.type(input, 'Customer');

  await act(async () => {
    appRouter.history.back();
  });
  await screen.findByText('Payment webhook 01');
  expect(screen.getByLabelText('Пошук за назвою')).toHaveValue('webhook');
  expect(appRouter.state.location.search).toEqual({ page: '1', search: 'webhook' });
});
