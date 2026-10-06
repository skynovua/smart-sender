export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  active: boolean;
  created_at: string;
}

export interface WebhookList {
  data: Webhook[];
  paging: {
    pages: { current: number; last: number };
    results: { total: number; limitation: number };
  };
}

export interface LoginRequest {
  email: string;
  password: string;
  fingerprint: string;
}

export interface LoginResponse {
  device_session_token: string;
}

export interface IssueSessionRequest {
  device_session_token: string;
  fingerprint: string;
}

export interface DeviceRequest {
  fingerprint: string;
}

export interface WebhookListParams {
  page: number;
  limit: 10;
  search: string;
}

export interface UpdateWebhookRequest {
  name: string;
  url: string;
}

export type ApiErrorStatus = 400 | 401 | 404 | 419 | 422;

export type ApiErrorType =
  | 'BadRequestException'
  | 'AuthenticationException'
  | 'NotFoundException'
  | 'TokenMismatchException'
  | 'ValidationException';

export type ValidationErrors = Record<string, string[]>;

export interface ApiErrorResponse {
  error: {
    type: ApiErrorType;
    message: string;
    payload?: ValidationErrors;
  };
}
