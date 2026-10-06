// @vitest-environment node
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, test, vi } from 'vitest';

import { createMockApi } from '@/mocks/create-mock-api';
import { mockCredentials, mockUser } from '@/mocks/fixtures';
import { errorResponse } from '@/mocks/responses';
import { server } from '@/mocks/server';

import { ApiClient } from './client';
import type { LoginResponse } from './contracts';
import { ApiError, SessionChangedError } from './errors';
import { getDeviceFingerprint } from './fingerprint';

const fingerprint = '0123456789abcdef0123456789abcdef';
let now = 0;
let onSessionEnd = vi.fn<() => void>();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function pathname(input: Parameters<typeof fetch>[0]) {
  return new URL(input instanceof Request ? input.url : String(input)).pathname;
}

function client(network: typeof fetch = fetch) {
  return new ApiClient({
    baseUrl: 'http://localhost',
    fetch: network,
    getFingerprint: () => fingerprint,
    onSessionEnd,
  });
}

function countCalls(network: ReturnType<typeof vi.fn<typeof fetch>>, path: string) {
  return network.mock.calls.filter(([input]) => pathname(input) === path).length;
}

// Both real mock responses must be 401 before the client can start recovery.
function parallel401Fetch(holdListUntil?: Promise<void>) {
  const both401s = deferred();
  let initial401s = 0;
  return vi.fn<typeof fetch>(async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 401 && pathname(input).startsWith('/v1/') && initial401s < 2) {
      initial401s++;
      if (initial401s === 2) both401s.resolve();
      await both401s.promise;
      if (pathname(input) === '/v1/webhooks') await holdListUntil;
    }
    return response;
  });
}

beforeEach(() => {
  now = 0;
  onSessionEnd = vi.fn<() => void>();
  server.use(...createMockApi({ now: () => now }).handlers);
});

test('sign-in uses CSRF, login, issue and me in order and only stores the fingerprint', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const network = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const api = new ApiClient({
    baseUrl: 'http://localhost',
    fetch: network,
    getFingerprint: () => getDeviceFingerprint(storage),
    onSessionEnd,
  });

  expect(await api.signIn(mockCredentials)).toEqual(mockUser);
  expect(network.mock.calls.map(([input]) => pathname(input))).toEqual([
    '/csrf',
    '/auth/login',
    '/auth/token/issue',
    '/v1/me',
  ]);
  now = 30_000;
  expect(await api.getMe()).toEqual(mockUser);
  await expect(api.signOut()).resolves.toBeUndefined();
  expect(values.size).toBe(1);
  const stored = values.get('smart-sender:fingerprint');
  expect(stored).toMatch(/^[\da-f]{32}$/);
  for (const [input, init] of network.mock.calls) {
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(init?.credentials).toBe('include');
    if (pathname(input).startsWith('/auth/')) {
      expect(headers.get('X-CSRF-TOKEN')).toBeTruthy();
      expect(JSON.parse(String(init?.body)).fingerprint).toBe(stored);
    }
  }
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
});

test('parallel initial requests wait for one CSRF initialization', async () => {
  const network = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const api = client(network);
  const login = () =>
    api.request<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { ...mockCredentials, fingerprint },
      headers: { 'X-Captcha-Token': 'test-captcha' },
    });
  const responses = await Promise.all([login(), login()]);
  expect(responses.every((response) => typeof response.device_session_token === 'string')).toBe(
    true,
  );
  expect(countCalls(network, '/csrf')).toBe(1);
  expect(countCalls(network, '/auth/login')).toBe(2);
  expect(pathname(network.mock.calls[0]![0])).toBe('/csrf');
});

test('two parallel 401s share exactly one rotate and both requests retry successfully', async () => {
  const network = parallel401Fetch();
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  now = 30_000;

  const [user, list] = await Promise.all([
    api.getMe(),
    api.getWebhooks({ page: 1, limit: 10, search: '' }),
  ]);

  expect(user).toEqual(mockUser);
  expect(list.data).toHaveLength(10);
  expect(countCalls(network, '/auth/token/rotate')).toBe(1);
  expect(countCalls(network, '/v1/me')).toBe(2);
  expect(countCalls(network, '/v1/webhooks')).toBe(2);
  expect(onSessionEnd).not.toHaveBeenCalled();
});

test('a delayed 401 reuses an already completed rotation instead of rotating again', async () => {
  const releaseList = deferred();
  const network = parallel401Fetch(releaseList.promise);
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  now = 30_000;

  const user = api.getMe();
  const list = api.getWebhooks({ page: 1, limit: 10, search: '' });
  expect(await user).toEqual(mockUser);
  releaseList.resolve();
  expect((await list).data).toHaveLength(10);
  expect(countCalls(network, '/auth/token/rotate')).toBe(1);
  expect(onSessionEnd).not.toHaveBeenCalled();
});

test('a failed shared rotate rejects both requests and ends the local session once', async () => {
  const network = parallel401Fetch();
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  now = 30_000;
  server.use(http.post('*/auth/token/rotate', () => errorResponse(400, 'Cannot rotate.')));

  const results = await Promise.allSettled([
    api.getMe(),
    api.getWebhooks({ page: 1, limit: 10, search: '' }),
  ]);
  for (const result of results) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 400 });
  }
  expect(countCalls(network, '/auth/token/rotate')).toBe(1);
  expect(countCalls(network, '/v1/me')).toBe(1);
  expect(countCalls(network, '/v1/webhooks')).toBe(1);
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
  await expect(api.getMe()).rejects.toBeInstanceOf(SessionChangedError);
  expect(countCalls(network, '/v1/me')).toBe(1);
});

test('a repeated 401 ends the session without a second rotate', async () => {
  const network = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  server.use(http.get('*/v1/me', () => errorResponse(401, 'Unauthenticated.')));

  await expect(api.getMe()).rejects.toMatchObject({ status: 401 });
  expect(countCalls(network, '/v1/me')).toBe(2);
  expect(countCalls(network, '/auth/token/rotate')).toBe(1);
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
});

test('a 401 from rotate never starts another rotate', async () => {
  const network = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  now = 30_000;
  server.use(http.post('*/auth/token/rotate', () => errorResponse(401, 'Unauthenticated.')));

  await expect(api.getMe()).rejects.toMatchObject({ status: 401 });
  expect(countCalls(network, '/auth/token/rotate')).toBe(1);
  expect(countCalls(network, '/v1/me')).toBe(1);
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
});

test('419 and 401 recovery have separate bounded retries and preserve the PUT body', async () => {
  const network = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  now = 30_000;
  server.use(
    http.put('*/v1/webhooks/1', () => errorResponse(419, 'CSRF token mismatch.'), { once: true }),
  );
  const values = { name: 'Updated', url: 'https://example.com/updated' };

  expect(await api.updateWebhook(1, values)).toMatchObject(values);
  expect(countCalls(network, '/v1/webhooks/1')).toBe(3);
  expect(countCalls(network, '/csrf')).toBe(1);
  expect(countCalls(network, '/auth/token/rotate')).toBe(1);
  const bodies = network.mock.calls
    .filter(([input]) => pathname(input) === '/v1/webhooks/1')
    .map(([, init]) => init?.body);
  expect(bodies).toEqual(Array(3).fill(JSON.stringify(values)));
  expect(onSessionEnd).not.toHaveBeenCalled();
});

test('a repeated 419 stops after one CSRF retry without ending a valid session', async () => {
  const network = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  server.use(http.put('*/v1/webhooks/1', () => errorResponse(419, 'CSRF token mismatch.')));

  await expect(
    api.updateWebhook(1, { name: 'Updated', url: 'https://example.com' }),
  ).rejects.toMatchObject({ status: 419 });
  expect(countCalls(network, '/v1/webhooks/1')).toBe(2);
  expect(countCalls(network, '/csrf')).toBe(1);
  expect(onSessionEnd).not.toHaveBeenCalled();
});

test('parallel 419s share one CSRF refresh before retrying their writes', async () => {
  const both419s = deferred();
  let failures = 0;
  const network = vi.fn<typeof fetch>(async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 419) {
      failures++;
      if (failures === 2) both419s.resolve();
      await both419s.promise;
    }
    return response;
  });
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  server.use(
    http.put('*/v1/webhooks/1', () => errorResponse(419, 'CSRF token mismatch.'), { once: true }),
    http.put('*/v1/webhooks/2', () => errorResponse(419, 'CSRF token mismatch.'), { once: true }),
  );
  const values = { name: 'Updated', url: 'https://example.com/updated' };
  const results = await Promise.all([api.updateWebhook(1, values), api.updateWebhook(2, values)]);
  expect(results.map(({ id }) => id)).toEqual([1, 2]);
  expect(countCalls(network, '/csrf')).toBe(1);
  expect(countCalls(network, '/v1/webhooks/1')).toBe(2);
  expect(countCalls(network, '/v1/webhooks/2')).toBe(2);
  expect(onSessionEnd).not.toHaveBeenCalled();
});

test('cancelling one request does not cancel the rotate needed by another request', async () => {
  const rotateStarted = deferred();
  const releaseRotate = deferred();
  const initialFetch = parallel401Fetch();
  const network = vi.fn<typeof fetch>(async (input, init) => {
    const response = await initialFetch(input, init);
    if (pathname(input) === '/auth/token/rotate') {
      rotateStarted.resolve();
      await releaseRotate.promise;
    }
    return response;
  });
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  now = 30_000;
  const controller = new AbortController();
  const cancelled = api.getMe(controller.signal).catch((error: unknown) => error);
  const list = api.getWebhooks({ page: 1, limit: 10, search: '' });

  await rotateStarted.promise;
  controller.abort();
  expect(await cancelled).toMatchObject({ name: 'AbortError' });
  releaseRotate.resolve();
  expect((await list).data).toHaveLength(10);
  expect(countCalls(network, '/auth/token/rotate')).toBe(1);
  expect(onSessionEnd).not.toHaveBeenCalled();
});

test('a late 401 from before logout cannot rotate or invalidate a new sign-in', async () => {
  const oldResponseReady = deferred();
  const releaseOldResponse = deferred();
  let held = false;
  const network = vi.fn<typeof fetch>(async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 401 && pathname(input) === '/v1/me' && !held) {
      held = true;
      oldResponseReady.resolve();
      await releaseOldResponse.promise;
    }
    return response;
  });
  const api = client(network);
  await api.signIn(mockCredentials);
  now = 30_000;
  const oldRequest = api.getMe().catch((error: unknown) => error);
  await oldResponseReady.promise;
  await api.signOut();
  expect(await api.signIn(mockCredentials)).toEqual(mockUser);
  releaseOldResponse.resolve();
  expect(await oldRequest).toBeInstanceOf(SessionChangedError);
  expect(await api.getMe()).toEqual(mockUser);
  expect(countCalls(network, '/auth/token/rotate')).toBe(0);
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
});

test('logout clears the local session even if revoke fails on the network', async () => {
  const api = client();
  await api.signIn(mockCredentials);
  server.use(http.post('*/auth/token/revoke', () => HttpResponse.error()));
  await expect(api.signOut()).rejects.toThrow();
  await expect(api.getMe()).rejects.toBeInstanceOf(SessionChangedError);
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
  expect(await api.signIn(mockCredentials)).toEqual(mockUser);
});

test('logout can cancel a sign-in started in the same tick before credentials are sent', async () => {
  const network = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const api = client(network);
  const signIn = api.signIn(mockCredentials).catch((error: unknown) => error);
  await expect(api.signOut()).resolves.toBeUndefined();
  expect(await signIn).toBeInstanceOf(SessionChangedError);
  expect(countCalls(network, '/auth/login')).toBe(0);
  expect(countCalls(network, '/auth/token/issue')).toBe(0);
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
});

test('new sign-in waits until a pending revoke has completed', async () => {
  const revokeStarted = deferred();
  const releaseRevoke = deferred();
  const network = vi.fn<typeof fetch>(async (input, init) => {
    if (pathname(input) === '/auth/token/revoke') {
      revokeStarted.resolve();
      await releaseRevoke.promise;
    }
    return fetch(input, init);
  });
  const api = client(network);
  await api.signIn(mockCredentials);
  network.mockClear();
  const signOut = api.signOut();
  await revokeStarted.promise;
  const signIn = api.signIn(mockCredentials);
  expect(countCalls(network, '/auth/login')).toBe(0);
  releaseRevoke.resolve();
  await expect(signOut).resolves.toBeUndefined();
  expect(await signIn).toEqual(mockUser);
  expect(await api.getMe()).toEqual(mockUser);
  expect(onSessionEnd).toHaveBeenCalledTimes(1);
});

test('validation and not-found errors expose typed details without logging out a valid session', async () => {
  const api = client();
  await expect(api.signIn({ ...mockCredentials, password: 'wrong' })).rejects.toMatchObject({
    status: 422,
    type: 'ValidationException',
    fieldErrors: { password: ['The provided credentials are incorrect.'] },
  });
  expect(await api.signIn(mockCredentials)).toEqual(mockUser);
  onSessionEnd.mockClear();
  await expect(api.getWebhook(999)).rejects.toBeInstanceOf(ApiError);
  await expect(api.updateWebhook(1, { name: '', url: 'ftp://example.com' })).rejects.toMatchObject({
    status: 422,
    fieldErrors: { name: expect.any(Array), url: expect.any(Array) },
  });
  expect(onSessionEnd).not.toHaveBeenCalled();
});

test('default fetch keeps the browser receiver and picks up interception installed after construction', async () => {
  const network = globalThis.fetch.bind(globalThis);
  const api = new ApiClient({
    baseUrl: 'http://localhost',
    getFingerprint: () => fingerprint,
  });
  const intercepted = vi.spyOn(globalThis, 'fetch').mockImplementation(function (
    this: typeof globalThis,
    input,
    init,
  ) {
    expect(this).toBe(globalThis);
    return network(input, init);
  });

  expect(await api.signIn(mockCredentials)).toEqual(mockUser);
  expect(intercepted).toHaveBeenCalledTimes(4);
});
