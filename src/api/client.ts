import type {
  LoginRequest,
  LoginResponse,
  UpdateWebhookRequest,
  User,
  Webhook,
  WebhookList,
  WebhookListParams,
} from './contracts';
import { readApiError, SessionChangedError } from './errors';
import { getDeviceFingerprint } from './fingerprint';

interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  getFingerprint?: () => string;
  onSessionEnd?: () => void;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  json?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal | undefined;
}

// A cancelled consumer must not cancel a recovery operation shared by other requests.
function waitForShared(operation: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return operation;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly getFingerprint: () => string;
  private readonly onSessionEnd: () => void;
  private csrfToken: string | null = null;
  private csrfGeneration = 0;
  private csrfFlight: Promise<void> | null = null;
  private rotationGeneration = 0;
  private rotationFlight: Promise<void> | null = null;
  private revokeFlight: Promise<void> | null = null;
  private sessionEpoch = 0;
  private sessionEnded = false;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? globalThis.location?.origin ?? 'http://localhost';
    // Preserve the native browser receiver and use fetch after MSW has started.
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.getFingerprint = options.getFingerprint ?? getDeviceFingerprint;
    this.onSessionEnd = options.onSessionEnd ?? (() => {});
  }

  async signIn(
    credentials: Pick<LoginRequest, 'email' | 'password'>,
    captchaToken = 'mock-captcha',
  ): Promise<User> {
    // A late revoke must finish before it can affect a new session on the same device.
    const previousEpoch = this.sessionEpoch;
    if (this.revokeFlight) {
      await this.revokeFlight.catch(() => {});
      this.assertCurrent(previousEpoch);
    }
    const epoch = ++this.sessionEpoch;
    this.sessionEnded = false;
    this.rotationGeneration = 0;
    this.rotationFlight = null;

    try {
      const fingerprint = this.getFingerprint();
      const { device_session_token } = await this.perform<LoginResponse>(
        '/auth/login',
        {
          method: 'POST',
          json: { ...credentials, fingerprint },
          headers: { 'X-Captcha-Token': captchaToken },
        },
        epoch,
      );
      await this.perform<void>(
        '/auth/token/issue',
        {
          method: 'POST',
          json: { device_session_token, fingerprint },
        },
        epoch,
      );
      return await this.perform<User>('/v1/me', {}, epoch);
    } catch (error) {
      if (epoch === this.sessionEpoch) this.endSession();
      throw error;
    }
  }

  signOut(): Promise<void> {
    this.endSession();
    if (this.revokeFlight) return this.revokeFlight;
    const epoch = this.sessionEpoch;
    const flight = this.revoke(epoch).finally(() => {
      if (this.revokeFlight === flight) this.revokeFlight = null;
    });
    this.revokeFlight = flight;
    return flight;
  }

  getMe(signal?: AbortSignal): Promise<User> {
    return this.request('/v1/me', { signal });
  }

  getWebhooks(params: WebhookListParams, signal?: AbortSignal): Promise<WebhookList> {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      search: params.search,
    });
    return this.request(`/v1/webhooks?${query}`, { signal });
  }

  getWebhook(id: number, signal?: AbortSignal): Promise<Webhook> {
    return this.request(`/v1/webhooks/${id}`, { signal });
  }

  updateWebhook(id: number, values: UpdateWebhookRequest, signal?: AbortSignal): Promise<Webhook> {
    return this.request(`/v1/webhooks/${id}`, { method: 'PUT', json: values, signal });
  }

  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.perform<T>(path, options, this.sessionEpoch);
  }

  private assertCurrent(epoch: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (epoch !== this.sessionEpoch) throw new SessionChangedError();
  }

  private endSession() {
    if (this.sessionEnded) return;
    this.sessionEnded = true;
    this.sessionEpoch++;
    this.rotationFlight = null;
    this.onSessionEnd();
  }

  private async revoke(epoch: number) {
    await this.perform<void>(
      '/auth/token/revoke',
      {
        method: 'POST',
        json: { fingerprint: this.getFingerprint() },
      },
      epoch,
    );
  }

  private async loadCsrf() {
    const response = await this.fetch(new URL('/csrf', this.baseUrl), {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!response.ok) throw await readApiError(response);
    const token = response.headers.get('X-CSRF-TOKEN');
    if (!token) throw new Error('The CSRF response is missing X-CSRF-TOKEN.');
    this.csrfToken = token;
    this.csrfGeneration++;
  }

  private ensureCsrf(observedGeneration?: number): Promise<void> {
    if (
      this.csrfToken &&
      (observedGeneration === undefined || observedGeneration !== this.csrfGeneration)
    )
      return Promise.resolve();
    if (this.csrfFlight) return this.csrfFlight;

    const flight = this.loadCsrf().finally(() => {
      if (this.csrfFlight === flight) this.csrfFlight = null;
    });
    this.csrfFlight = flight;
    return flight;
  }

  private async rotate(epoch: number) {
    try {
      await this.perform<void>(
        '/auth/token/rotate',
        {
          method: 'POST',
          json: { fingerprint: this.getFingerprint() },
        },
        epoch,
      );
      this.assertCurrent(epoch);
      this.rotationGeneration++;
    } catch (error) {
      if (epoch === this.sessionEpoch) this.endSession();
      throw error;
    }
  }

  private recoverSession(observedGeneration: number, epoch: number): Promise<void> {
    this.assertCurrent(epoch);
    // A delayed 401 may belong to a session that has already been renewed.
    if (observedGeneration !== this.rotationGeneration) return Promise.resolve();
    if (this.rotationFlight) return this.rotationFlight;

    const flight = this.rotate(epoch).finally(() => {
      if (this.rotationFlight === flight) this.rotationFlight = null;
    });
    this.rotationFlight = flight;
    return flight;
  }

  private async perform<T>(path: string, options: RequestOptions, epoch: number): Promise<T> {
    const method = options.method ?? 'GET';
    const protectedRequest = path.startsWith('/v1/');
    const body = options.json === undefined ? undefined : JSON.stringify(options.json);
    let authRetries = 0;
    let csrfRetries = 0;

    this.assertCurrent(epoch, options.signal);
    if (protectedRequest && this.sessionEnded) throw new SessionChangedError();
    await waitForShared(this.ensureCsrf(), options.signal);

    while (true) {
      this.assertCurrent(epoch, options.signal);
      const observedRotation = this.rotationGeneration;
      const observedCsrf = this.csrfGeneration;
      const headers = new Headers(options.headers);
      headers.set('X-Requested-With', 'XMLHttpRequest');
      if (['POST', 'PUT'].includes(method)) headers.set('X-CSRF-TOKEN', this.csrfToken ?? '');
      if (body !== undefined) headers.set('Content-Type', 'application/json');

      const response = await this.fetch(new URL(path, this.baseUrl), {
        method,
        headers,
        credentials: 'include',
        ...(body !== undefined ? { body } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      this.assertCurrent(epoch, options.signal);

      if (response.status === 419 && ['POST', 'PUT'].includes(method) && csrfRetries === 0) {
        csrfRetries++;
        await waitForShared(this.ensureCsrf(observedCsrf), options.signal);
        continue;
      }

      if (response.status === 401 && protectedRequest) {
        if (authRetries === 0) {
          authRetries++;
          await waitForShared(this.recoverSession(observedRotation, epoch), options.signal);
          continue;
        }
        const error = await readApiError(response);
        this.assertCurrent(epoch, options.signal);
        this.endSession();
        throw error;
      }

      if (!response.ok) {
        const error = await readApiError(response);
        this.assertCurrent(epoch, options.signal);
        throw error;
      }

      const text = await response.text();
      this.assertCurrent(epoch, options.signal);
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }
}
