import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '@/app/app';
import { createAppRouter } from '@/app/router';
import { AuthSession } from '@/auth/session';
import { mockCredentials } from '@/mocks/fixtures';

export async function renderAuthenticatedApp(path = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const auth = new AuthSession(queryClient);
  await auth.signIn(mockCredentials);
  const appRouter = createAppRouter(
    { auth, queryClient },
    createMemoryHistory({ initialEntries: [path] }),
  );
  const view = render(<App appRouter={appRouter} />);
  return { ...view, auth, queryClient, appRouter, user: userEvent.setup() };
}
