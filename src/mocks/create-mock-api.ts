import { http, HttpResponse } from 'msw';
import { z } from 'zod';

import type {
  ApiErrorResponse,
  DeviceRequest,
  IssueSessionRequest,
  LoginRequest,
  LoginResponse,
  UpdateWebhookRequest,
  User,
  Webhook,
  WebhookList,
} from '@/api/contracts';

import { createWebhooks, mockCredentials, mockUser } from './fixtures';
import { errorResponse, parseBody, validationResponse } from './responses';

const SESSION_DURATION_MS = 30_000;
const PAGE_SIZE = 10;
const CSRF_TOKEN = 'smart-sender-mock-csrf';

const fingerprintSchema = z
  .string()
  .regex(/^[\da-f]{32}$/i, 'The fingerprint must contain 32 hexadecimal characters.')
  .toLowerCase();

const loginSchema: z.ZodType<LoginRequest> = z.object({
  email: z.email('The email must be valid.'),
  password: z.string().min(1, 'The password is required.'),
  fingerprint: fingerprintSchema,
});

const issueSchema: z.ZodType<IssueSessionRequest> = z.object({
  device_session_token: z.string().min(1, 'The device session token is required.'),
  fingerprint: fingerprintSchema,
});

const deviceSchema: z.ZodType<DeviceRequest> = z.object({ fingerprint: fingerprintSchema });

const updateSchema: z.ZodType<UpdateWebhookRequest> = z.object({
  name: z.string().trim().min(1, 'The name is required.'),
  url: z
    .string()
    .trim()
    .regex(/^https?:\/\//i, 'The url must be a valid HTTP or HTTPS URL.')
    .pipe(
      z.url({
        protocol: /^https?$/,
        error: 'The url must be a valid HTTP or HTTPS URL.',
      }),
    ),
});

interface MockApiOptions {
  now?: () => number;
}

export function createMockApi({ now = Date.now }: MockApiOptions = {}) {
  let webhooks = createWebhooks();
  let deviceGrant: { token: string; fingerprint: string } | null = null;
  // Session credentials stay inside the mock, never in a response or browser storage.
  let session: { fingerprint: string; expiresAt: number } | null = null;

  function guard(request: Request, protectedRequest = false) {
    if (request.headers.get('X-Requested-With') !== 'XMLHttpRequest') {
      return errorResponse(400, 'The X-Requested-With header is required.');
    }
    if (
      ['POST', 'PUT'].includes(request.method) &&
      request.headers.get('X-CSRF-TOKEN') !== CSRF_TOKEN
    ) {
      return errorResponse(419, 'CSRF token mismatch.');
    }
    if (protectedRequest && (!session || now() >= session.expiresAt)) {
      return errorResponse(401, 'Unauthenticated.');
    }
    return undefined;
  }

  const handlers = [
    http.get('*/csrf', ({ request }) => {
      const failure = guard(request);
      if (failure) return failure;
      return new HttpResponse(null, { status: 204, headers: { 'X-CSRF-TOKEN': CSRF_TOKEN } });
    }),

    http.post<never, LoginRequest, LoginResponse | ApiErrorResponse>(
      '*/auth/login',
      async ({ request }) => {
        const failure = guard(request);
        if (failure) return failure;
        const body = await parseBody(request, loginSchema);
        if (body.response) return body.response;
        if (!request.headers.get('X-Captcha-Token')?.trim()) {
          return validationResponse({ captcha: ['The captcha token is required.'] });
        }
        if (
          body.data.email !== mockCredentials.email ||
          body.data.password !== mockCredentials.password
        ) {
          return validationResponse({ password: ['The provided credentials are incorrect.'] });
        }

        deviceGrant = { token: crypto.randomUUID(), fingerprint: body.data.fingerprint };
        return HttpResponse.json<LoginResponse>({ device_session_token: deviceGrant.token });
      },
    ),

    http.post('*/auth/token/issue', async ({ request }) => {
      const failure = guard(request);
      if (failure) return failure;
      const body = await parseBody(request, issueSchema);
      if (body.response) return body.response;
      if (
        !deviceGrant ||
        deviceGrant.token !== body.data.device_session_token ||
        deviceGrant.fingerprint !== body.data.fingerprint
      ) {
        return validationResponse({
          device_session_token: ['The device session token is invalid.'],
        });
      }

      session = { fingerprint: body.data.fingerprint, expiresAt: now() + SESSION_DURATION_MS };
      deviceGrant = null;
      return new HttpResponse(null, { status: 200 });
    }),

    http.post('*/auth/token/rotate', async ({ request }) => {
      const failure = guard(request);
      if (failure) return failure;
      const body = await parseBody(request, deviceSchema, 400);
      if (body.response) return body.response;
      if (!session || session.fingerprint !== body.data.fingerprint) {
        return errorResponse(400, 'The session cannot be rotated.');
      }

      // Expiry blocks protected requests but does not revoke the ability to rotate.
      session.expiresAt = now() + SESSION_DURATION_MS;
      return new HttpResponse(null, { status: 200 });
    }),

    http.post('*/auth/token/revoke', async ({ request }) => {
      const failure = guard(request);
      if (failure) return failure;
      const body = await parseBody(request, deviceSchema, 400);
      if (body.response) return body.response;
      if (session?.fingerprint === body.data.fingerprint) session = null;
      if (deviceGrant?.fingerprint === body.data.fingerprint) deviceGrant = null;
      return new HttpResponse(null, { status: 204 });
    }),

    http.get<never, never, User | ApiErrorResponse>('*/v1/me', ({ request }) => {
      const failure = guard(request, true);
      if (failure) return failure;
      return HttpResponse.json<User>(mockUser);
    }),

    http.get<never, never, WebhookList | ApiErrorResponse>('*/v1/webhooks', ({ request }) => {
      const failure = guard(request, true);
      if (failure) return failure;
      const params = new URL(request.url).searchParams;
      const search = (params.get('search') ?? '').trim().toLowerCase();
      const matches = webhooks.filter((webhook) => webhook.name.toLowerCase().includes(search));
      const requestedPage = Number(params.get('page') ?? 1);
      const last = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
      const current =
        Number.isSafeInteger(requestedPage) && requestedPage > 0
          ? Math.min(requestedPage, last)
          : 1;

      return HttpResponse.json<WebhookList>({
        data: matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
        paging: {
          pages: { current, last },
          results: { total: matches.length, limitation: PAGE_SIZE },
        },
      });
    }),

    http.get<{ id: string }, never, Webhook | ApiErrorResponse>(
      '*/v1/webhooks/:id',
      ({ request, params }) => {
        const failure = guard(request, true);
        if (failure) return failure;
        const webhook = webhooks.find((item) => String(item.id) === params.id);
        if (!webhook) return errorResponse(404, 'The webhook was not found.');
        return HttpResponse.json<Webhook>(webhook);
      },
    ),

    http.put<{ id: string }, UpdateWebhookRequest, Webhook | ApiErrorResponse>(
      '*/v1/webhooks/:id',
      async ({ request, params }) => {
        const failure = guard(request, true);
        if (failure) return failure;
        const webhook = webhooks.find((item) => String(item.id) === params.id);
        if (!webhook) return errorResponse(404, 'The webhook was not found.');
        const body = await parseBody(request, updateSchema);
        if (body.response) return body.response;

        webhook.name = body.data.name;
        webhook.url = body.data.url;
        return HttpResponse.json<Webhook>(webhook);
      },
    ),
  ];

  return {
    handlers,
    reset() {
      webhooks = createWebhooks();
      deviceGrant = null;
      session = null;
    },
  };
}
