import { z } from 'zod';

import type { ApiErrorResponse, ApiErrorType, ValidationErrors } from './contracts';

const errorSchema = z.object({
  error: z.object({
    type: z.enum([
      'BadRequestException',
      'AuthenticationException',
      'NotFoundException',
      'TokenMismatchException',
      'ValidationException',
    ]),
    message: z.string(),
    payload: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export class ApiError extends Error {
  readonly status: number;
  readonly type: ApiErrorType | undefined;
  readonly fieldErrors: ValidationErrors;

  constructor(status: number, body?: ApiErrorResponse) {
    super(body?.error.message ?? `Request failed (${status}).`);
    this.name = 'ApiError';
    this.status = status;
    this.type = body?.error.type;
    this.fieldErrors = status === 422 ? (body?.error.payload ?? {}) : {};
  }
}

export class SessionChangedError extends Error {
  constructor() {
    super('The session changed while the request was in progress.');
    this.name = 'SessionChangedError';
  }
}

export async function readApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = errorSchema.safeParse(body);
  if (!parsed.success) return new ApiError(response.status);
  const { type, message, payload } = parsed.data.error;
  return new ApiError(response.status, {
    error: { type, message, ...(payload ? { payload } : {}) },
  });
}
