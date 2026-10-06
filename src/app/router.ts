import { createRouter, type RouterHistory } from '@tanstack/react-router';

import { AuthSession } from '@/auth/session';
import type { RouterContext } from '@/routes/__root';
import { routeTree } from '@/routeTree.gen';

import { queryClient } from './query-client';

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    ...(history ? { history } : {}),
  });
}

export const router = createAppRouter({ queryClient, auth: new AuthSession(queryClient) });

export type AppRouter = typeof router;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
