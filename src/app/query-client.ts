import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    // The API client will own the bounded 401/419 recovery policy.
    queries: { retry: false },
    mutations: { retry: false },
  },
});
