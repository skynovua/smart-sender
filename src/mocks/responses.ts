import { HttpResponse } from 'msw';
import type { ZodType } from 'zod';

import type {
  ApiErrorResponse,
  ApiErrorStatus,
  ApiErrorType,
  ValidationErrors,
} from '@/api/contracts';

const errorTypes: Record<ApiErrorStatus, ApiErrorType> = {
  400: 'BadRequestException',
  401: 'AuthenticationException',
  404: 'NotFoundException',
  419: 'TokenMismatchException',
  422: 'ValidationException',
};

export function errorResponse(status: ApiErrorStatus, message: string, payload?: ValidationErrors) {
  return HttpResponse.json<ApiErrorResponse>(
    {
      error: {
        type: errorTypes[status],
        message,
        ...(payload ? { payload } : {}),
      },
    },
    { status },
  );
}

export function validationResponse(payload: ValidationErrors) {
  return errorResponse(422, 'The given data was invalid.', payload);
}

export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
  invalidStatus: 400 | 422 = 422,
): Promise<
  { data: T; response?: never } | { data?: never; response: HttpResponse<ApiErrorResponse> }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: errorResponse(400, 'The request body must be valid JSON.') };
  }

  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };

  if (invalidStatus === 400) {
    return { response: errorResponse(400, 'The request body is invalid.') };
  }

  const errors: ValidationErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '_form');
    (errors[field] ??= []).push(issue.message);
  }
  return { response: validationResponse(errors) };
}
