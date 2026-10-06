// @vitest-environment node
import { beforeEach, expect, test } from 'vitest';

import type { ApiErrorResponse, LoginResponse, Webhook, WebhookList } from '@/api/contracts';

import { createMockApi } from './create-mock-api';
import { mockCredentials } from './fixtures';
import { server } from './server';

const origin = 'http://localhost';
const fingerprint = '0123456789abcdef0123456789abcdef';
const otherFingerprint = 'abcdef0123456789abcdef0123456789';
let now = 0;
let csrf = '';

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'XMLHttpRequest');
  if (!headers.has('X-CSRF-TOKEN')) headers.set('X-CSRF-TOKEN', csrf);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(`${origin}${path}`, { ...init, headers });
}

function post(path: string, body: unknown, headers?: HeadersInit) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    ...(headers ? { headers } : {}),
  });
}

async function login() {
  const response = await post(
    '/auth/login',
    { ...mockCredentials, fingerprint },
    {
      'X-Captcha-Token': 'test-captcha',
    },
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<LoginResponse>;
}

async function startSession() {
  const token = await login();
  const response = await post('/auth/token/issue', { ...token, fingerprint });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('');
}

beforeEach(async () => {
  now = 0;
  server.use(...createMockApi({ now: () => now }).handlers);
  const response = await request('/csrf');
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  csrf = response.headers.get('X-CSRF-TOKEN') ?? '';
  expect(csrf).not.toBe('');
});

test('a session expires at 30 seconds, can be rotated, and cannot be rotated after revoke', async () => {
  expect((await request('/v1/me')).status).toBe(401);
  expect((await post('/auth/token/rotate', { fingerprint })).status).toBe(400);
  await login();
  expect((await post('/auth/token/rotate', { fingerprint })).status).toBe(400);

  await startSession();
  now = 29_999;
  expect((await request('/v1/me')).status).toBe(200);
  now = 30_000;
  expect((await request('/v1/me')).status).toBe(401);
  expect((await request('/v1/webhooks')).status).toBe(401);
  expect(
    (
      await request('/v1/webhooks/1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated', url: 'https://example.com' }),
      })
    ).status,
  ).toBe(401);

  const rotated = await post('/auth/token/rotate', { fingerprint });
  expect(rotated.status).toBe(200);
  expect(await rotated.text()).toBe('');
  now = 59_999;
  expect((await request('/v1/me')).status).toBe(200);
  now = 60_000;
  expect((await request('/v1/me')).status).toBe(401);
  expect((await post('/auth/token/rotate', { fingerprint })).status).toBe(200);
  expect((await post('/auth/token/revoke', { fingerprint })).status).toBe(204);
  expect((await request('/v1/me')).status).toBe(401);
  expect((await post('/auth/token/rotate', { fingerprint })).status).toBe(400);
  expect((await post('/auth/token/revoke', { fingerprint })).status).toBe(204);
});

test('device grants are bound to the fingerprint and consumed once', async () => {
  const token = await login();
  expect(
    (await post('/auth/token/issue', { ...token, fingerprint: otherFingerprint })).status,
  ).toBe(422);
  expect((await post('/auth/token/issue', { ...token, fingerprint })).status).toBe(200);
  expect((await post('/auth/token/issue', { ...token, fingerprint })).status).toBe(422);
  expect((await post('/auth/token/rotate', { fingerprint: otherFingerprint })).status).toBe(400);
  expect((await post('/auth/token/revoke', { fingerprint: otherFingerprint })).status).toBe(204);
  expect((await request('/v1/me')).status).toBe(200);
});

test('CSRF is checked before consuming grants, updating data, or revoking a session', async () => {
  const token = await login();
  const rejected = await post(
    '/auth/token/issue',
    { ...token, fingerprint },
    { 'X-CSRF-TOKEN': '' },
  );
  expect(rejected.status).toBe(419);
  expect(await rejected.json()).toEqual({
    error: { type: 'TokenMismatchException', message: 'CSRF token mismatch.' },
  });
  expect((await post('/auth/token/issue', { ...token, fingerprint })).status).toBe(200);

  const rejectedEdit = await request('/v1/webhooks/1', {
    method: 'PUT',
    headers: { 'X-CSRF-TOKEN': 'incorrect' },
    body: JSON.stringify({ name: 'Changed', url: 'https://changed.example.com' }),
  });
  expect(rejectedEdit.status).toBe(419);
  const unchanged = (await (await request('/v1/webhooks/1')).json()) as Webhook;
  expect(unchanged.name).toBe('Payment webhook 01');

  expect((await post('/auth/token/revoke', { fingerprint }, { 'X-CSRF-TOKEN': '' })).status).toBe(
    419,
  );
  expect((await request('/v1/me')).status).toBe(200);
});

test('login requires captcha and returns field errors for incorrect credentials', async () => {
  const withoutCaptcha = await post('/auth/login', { ...mockCredentials, fingerprint });
  expect(withoutCaptcha.status).toBe(422);
  const captchaError = (await withoutCaptcha.json()) as ApiErrorResponse;
  expect(captchaError.error.payload?.captcha).toEqual(['The captcha token is required.']);

  const incorrect = await post(
    '/auth/login',
    { ...mockCredentials, password: 'wrong', fingerprint },
    {
      'X-Captcha-Token': 'anything-nonempty',
    },
  );
  expect(incorrect.status).toBe(422);
  const validation = (await incorrect.json()) as ApiErrorResponse;
  expect(validation.error.type).toBe('ValidationException');
  expect(validation.error.payload?.password).toHaveLength(1);
  expect((await request('/v1/me')).status).toBe(401);
});

test('lists use stable ordering, fixed page size, and case-insensitive filtered totals', async () => {
  await startSession();
  const page = (await (await request('/v1/webhooks?page=2&limit=99')).json()) as WebhookList;
  expect(page.data.map(({ id }) => id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  expect(page.paging).toEqual({
    pages: { current: 2, last: 3 },
    results: { total: 28, limitation: 10 },
  });

  const filtered = (await (
    await request('/v1/webhooks?page=1&search=pAyMeNt')
  ).json()) as WebhookList;
  expect(filtered.data).toHaveLength(10);
  expect(filtered.paging.results.total).toBe(10);

  const empty = (await (
    await request('/v1/webhooks?page=99&search=missing')
  ).json()) as WebhookList;
  expect(empty).toEqual({
    data: [],
    paging: { pages: { current: 1, last: 1 }, results: { total: 0, limitation: 10 } },
  });
  for (const invalid of ['0', '-1', 'abc', '1.5']) {
    const list = (await (await request(`/v1/webhooks?page=${invalid}`)).json()) as WebhookList;
    expect(list.paging.pages.current).toBe(1);
  }
  const outOfRange = (await (await request('/v1/webhooks?page=99')).json()) as WebhookList;
  expect(outOfRange.paging.pages.current).toBe(3);
  expect(outOfRange.data).toHaveLength(8);
});

test('editing validates fields and changes filtered results without changing activity or creation date', async () => {
  await startSession();
  for (const url of [
    'invalid-url',
    'ftp://example.com',
    'javascript:alert(1)',
    'http:example.com',
  ]) {
    const invalid = await request('/v1/webhooks/1', {
      method: 'PUT',
      body: JSON.stringify({ name: '   ', url }),
    });
    expect(invalid.status).toBe(422);
    const error = (await invalid.json()) as ApiErrorResponse;
    expect(error.error.payload?.name).toHaveLength(1);
    expect(error.error.payload?.url).toHaveLength(1);
  }

  const response = await request('/v1/webhooks/1', {
    method: 'PUT',
    body: JSON.stringify({
      name: ' Updated customer ',
      url: 'http://example.com/new',
      active: false,
    }),
  });
  expect(response.status).toBe(200);
  const updated = (await response.json()) as Webhook;
  expect(updated).toMatchObject({
    id: 1,
    name: 'Updated customer',
    url: 'http://example.com/new',
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  });
  expect(await (await request('/v1/webhooks/1')).json()).toEqual(updated);
  const filtered = (await (await request('/v1/webhooks?search=payment')).json()) as WebhookList;
  expect(filtered.paging.results.total).toBe(9);
});

test('unknown webhook IDs are protected before returning 404', async () => {
  expect((await request('/v1/webhooks/999')).status).toBe(401);
  await startSession();
  const response = await request('/v1/webhooks/999');
  expect(response.status).toBe(404);
  expect(((await response.json()) as ApiErrorResponse).error.type).toBe('NotFoundException');
  expect(
    (
      await request('/v1/webhooks/999', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated', url: 'https://example.com' }),
      })
    ).status,
  ).toBe(404);
});

test('missing request headers, malformed JSON, and invalid fingerprints produce contract errors', async () => {
  expect((await fetch(`${origin}/csrf`)).status).toBe(400);
  const malformed = await request('/auth/login', { method: 'POST', body: '{' });
  expect(malformed.status).toBe(400);
  expect(((await malformed.json()) as ApiErrorResponse).error.type).toBe('BadRequestException');

  const response = await post(
    '/auth/login',
    { ...mockCredentials, fingerprint: 'invalid' },
    {
      'X-Captcha-Token': 'test-captcha',
    },
  );
  expect(response.status).toBe(422);
  expect(((await response.json()) as ApiErrorResponse).error.payload?.fingerprint).toHaveLength(1);
});
