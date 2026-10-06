import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, test, vi } from 'vitest';

import { SessionChangedError } from '@/api/errors';
import { createMockApi } from '@/mocks/create-mock-api';
import { createWebhooks } from '@/mocks/fixtures';
import { validationResponse } from '@/mocks/responses';
import { server } from '@/mocks/server';
import { renderAuthenticatedApp } from '@/test/render-authenticated-app';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

async function openEdit(path = '/webhooks/11/edit?page=2&search=webhook') {
  const view = await renderAuthenticatedApp(path);
  await screen.findByRole('heading', { name: 'Редагування вебхука' });
  return view;
}

async function changeName(user: Awaited<ReturnType<typeof openEdit>>['user'], value: string) {
  const input = screen.getByLabelText('Назва');
  await user.clear(input);
  if (value) await user.type(input, value);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test('loads the selected webhook from the list and saves name/URL without losing list parameters', async () => {
  const { user, appRouter, auth } = await renderAuthenticatedApp('/?page=2&search=webhook');
  const link = await screen.findByRole('link', { name: 'Редагувати Subscription webhook 11' });
  await user.click(link);
  expect(await screen.findByLabelText('Назва')).toHaveValue('Subscription webhook 11');
  expect(screen.getByLabelText('URL')).toHaveValue('https://example.com/webhooks/11');
  await changeName(user, 'Subscription webhook updated');
  await user.clear(screen.getByLabelText('URL'));
  await user.type(screen.getByLabelText('URL'), 'https://example.com/new-endpoint');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await screen.findByRole('link', { name: 'Редагувати Subscription webhook updated' });
  expect(screen.getByText('https://example.com/new-endpoint')).toBeInTheDocument();
  expect(appRouter.state.location.href).toBe('/?page=2&search=webhook');
  expect(await auth.api.getWebhook(11)).toMatchObject({
    active: true,
    name: 'Subscription webhook updated',
    url: 'https://example.com/new-endpoint',
  });
});

test('empty names and non-HTTP URLs are rejected before making a PUT request', async () => {
  const put = vi.fn(() => HttpResponse.error());
  server.use(http.put('*/v1/webhooks/:id', put));
  const { user } = await openEdit();
  await changeName(user, '   ');
  await user.clear(screen.getByLabelText('URL'));
  await user.type(screen.getByLabelText('URL'), 'ftp://example.com');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  expect(await screen.findByText('Введіть назву вебхука.')).toBeInTheDocument();
  expect(screen.getByText('Введіть коректний HTTP або HTTPS URL.')).toBeInTheDocument();
  expect(put).not.toHaveBeenCalled();
});

test('server 422 messages appear beside both fields and a corrected form can be saved', async () => {
  let attempts = 0;
  server.use(
    http.put('*/v1/webhooks/:id', () => {
      if (++attempts === 1)
        return validationResponse({
          name: ['This name is reserved.'],
          url: ['This endpoint is unavailable.'],
        });
      return;
    }),
  );
  const { user } = await openEdit();
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  expect(await screen.findByText('This name is reserved.')).toBeInTheDocument();
  expect(screen.getByText('This endpoint is unavailable.')).toBeInTheDocument();
  expect(screen.getByLabelText('Назва')).toHaveFocus();
  expect(screen.getByLabelText('URL')).toHaveAttribute('aria-invalid', 'true');
  await changeName(user, 'Webhook corrected');
  await user.clear(screen.getByLabelText('URL'));
  await user.type(screen.getByLabelText('URL'), 'http://example.com/corrected');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await screen.findByRole('link', { name: 'Редагувати Webhook corrected' });
  expect(attempts).toBe(2);
});

test('renaming the only match refreshes the cached filtered list to its empty state', async () => {
  const { user, appRouter } = await renderAuthenticatedApp('/?page=1&search=01');
  await user.click(await screen.findByRole('link', { name: 'Редагувати Payment webhook 01' }));
  await screen.findByRole('heading', { name: 'Редагування вебхука' });
  await changeName(user, 'Payment renamed');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await screen.findByRole('heading', { name: 'Вебхуків не знайдено' });
  expect(appRouter.state.location.href).toBe('/?page=1&search=01');
  await user.click(screen.getByRole('button', { name: 'Скинути пошук' }));
  await screen.findByRole('link', { name: 'Редагувати Payment renamed' });
});

test('cancel returns to the list and does not save the draft', async () => {
  const put = vi.fn(() => HttpResponse.error());
  server.use(http.put('*/v1/webhooks/:id', put));
  const { user, appRouter } = await openEdit();
  await changeName(user, 'Unsubmitted draft');
  await user.click(screen.getByRole('link', { name: 'Скасувати' }));
  await screen.findByRole('link', { name: 'Редагувати Subscription webhook 11' });
  expect(appRouter.state.location.href).toBe('/?page=2&search=webhook');
  expect(put).not.toHaveBeenCalled();
});

test.each(['999', 'abc', '0'])(
  'missing or invalid webhook id %s shows a not-found page',
  async (id) => {
    const { user } = await renderAuthenticatedApp(`/webhooks/${id}/edit?page=2&search=webhook`);
    await screen.findByRole('heading', { name: 'Вебхук не знайдено' });
    expect(screen.queryByRole('button', { name: 'Зберегти' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'До списку вебхуків' }));
    await screen.findByText('Subscription webhook 11');
  },
);

test('a detail load failure can be retried', async () => {
  server.use(http.get('*/v1/webhooks/:id', () => HttpResponse.error()));
  const { user } = await renderAuthenticatedApp('/webhooks/11/edit');
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося завантажити вебхук.');
  server.resetHandlers();
  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
  expect(await screen.findByLabelText('Назва')).toHaveValue('Subscription webhook 11');
});

test('a failed save keeps the draft so it can be retried', async () => {
  server.use(http.put('*/v1/webhooks/:id', () => HttpResponse.error()));
  const { user } = await openEdit();
  await changeName(user, 'Webhook draft retained');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося зберегти зміни.');
  expect(screen.getByLabelText('Назва')).toHaveValue('Webhook draft retained');
  server.resetHandlers();
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await screen.findByRole('link', { name: 'Редагувати Webhook draft retained' });
});

test('a pending save cannot be submitted twice', async () => {
  const pending = deferred();
  const put = vi.fn(async () => {
    await pending.promise;
    return;
  });
  server.use(http.put('*/v1/webhooks/:id', put));
  const { user } = await openEdit();
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  const submit = await screen.findByRole('button', { name: 'Зберігаємо…' });
  expect(submit).toBeDisabled();
  expect(screen.getByLabelText('Назва')).toHaveAttribute('readonly');
  await user.click(submit);
  expect(put).toHaveBeenCalledTimes(1);
  pending.resolve();
  await screen.findByText('Subscription webhook 11');
});

test('a background refetch does not replace a dirty form draft', async () => {
  const { user, queryClient } = await openEdit();
  await changeName(user, 'My unsaved draft');
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['webhooks', 'detail', 11] });
  });
  expect(screen.getByLabelText('Назва')).toHaveValue('My unsaved draft');
});

test('a late save after logout cannot repopulate the cache or return to a private page', async () => {
  const pending = deferred();
  const started = deferred();
  server.use(
    http.put('*/v1/webhooks/:id', async () => {
      started.resolve();
      await pending.promise;
      return HttpResponse.json({ ...createWebhooks()[10], name: 'Late update' });
    }),
  );
  const { user, auth, queryClient, appRouter } = await openEdit();
  const save = vi.spyOn(auth.api, 'updateWebhook');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await started.promise;
  await user.click(screen.getByRole('button', { name: 'Вийти' }));
  await screen.findByRole('heading', { name: 'Вхід' });
  await act(async () => {
    pending.resolve();
    await expect(save.mock.results[0]!.value).rejects.toBeInstanceOf(SessionChangedError);
  });
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(auth.getUser()).toBeNull();
  expect(appRouter.state.location.pathname).toBe('/login');
});

test('an expired session is renewed and the edit still saves successfully', async () => {
  let now = 0;
  server.use(...createMockApi({ now: () => now }).handlers);
  const { user } = await openEdit();
  now = 30_000;
  await changeName(user, 'Webhook renewed session');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await screen.findByRole('link', { name: 'Редагувати Webhook renewed session' });
  expect(screen.getByRole('button', { name: 'Вийти' })).toBeInTheDocument();
});

test('leaving a pending save does not redirect a user back to the old list parameters', async () => {
  const pending = deferred();
  const started = deferred();
  server.use(
    http.put('*/v1/webhooks/:id', async () => {
      started.resolve();
      await pending.promise;
      return;
    }),
  );
  const { user, appRouter, queryClient } = await openEdit();
  await changeName(user, 'Webhook saved later');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await started.promise;
  await user.click(screen.getByRole('link', { name: 'Скасувати' }));
  await screen.findByText('Subscription webhook 11');
  const search = screen.getByLabelText('Пошук за назвою');
  await user.clear(search);
  await user.type(search, 'Customer');
  await user.click(screen.getByRole('button', { name: 'Знайти' }));
  await screen.findByText('Customer webhook 20');
  pending.resolve();
  await waitFor(() =>
    expect(queryClient.getQueryData(['webhooks', 'detail', 11])).toMatchObject({
      name: 'Webhook saved later',
    }),
  );
  await waitFor(() => expect(queryClient.isFetching({ queryKey: ['webhooks', 'list'] })).toBe(0));
  expect(appRouter.state.location.href).toBe('/?page=1&search=Customer');
  // Reopen the updated record to observe completion of the pending save.
  await act(async () => {
    await appRouter.navigate({
      to: '/webhooks/$id/edit',
      params: { id: '11' },
      search: { page: 1, search: 'Customer' },
    });
  });
  await waitFor(() => expect(screen.getByLabelText('Назва')).toHaveValue('Webhook saved later'));
  expect(appRouter.state.location.pathname).toBe('/webhooks/11/edit');
});

test('a failed background reload preserves the dirty draft and can be retried without resetting it', async () => {
  const { user, queryClient } = await openEdit();
  await changeName(user, 'Webhook draft survives reload failure');
  server.use(http.get('*/v1/webhooks/:id', () => HttpResponse.error()));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['webhooks', 'detail', 11] });
  });
  const alert = await screen.findByRole('alert');
  expect(screen.getByLabelText('Назва')).toHaveValue('Webhook draft survives reload failure');
  expect(alert).toHaveTextContent('Не вдалося оновити дані вебхука.');
  server.resetHandlers();
  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Назва')).toHaveValue('Webhook draft survives reload failure');
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await screen.findByRole('link', { name: 'Редагувати Webhook draft survives reload failure' });
});
