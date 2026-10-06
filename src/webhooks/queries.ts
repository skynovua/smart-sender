import { queryOptions } from '@tanstack/react-query';

import type { ApiClient } from '@/api/client';

export interface WebhookSearch {
  page: number;
  search: string;
}

export function validateWebhookSearch(values: Record<string, unknown>): WebhookSearch {
  const page =
    typeof values.page === 'number' || typeof values.page === 'string' ? Number(values.page) : 1;
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    search: typeof values.search === 'string' ? values.search.trim() : '',
  };
}

export function webhookListOptions(api: ApiClient, params: WebhookSearch) {
  return queryOptions({
    queryKey: ['webhooks', 'list', params],
    queryFn: ({ signal }) => api.getWebhooks({ ...params, limit: 10 }, signal),
  });
}
