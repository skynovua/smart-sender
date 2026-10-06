import { useEffect } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { useUser } from '@/auth/use-user';

import { router, type AppRouter } from './router';

export function App({ appRouter = router }: { appRouter?: AppRouter }) {
  const { auth, queryClient } = appRouter.options.context;
  const user = useUser(auth);

  useEffect(() => {
    void appRouter.invalidate();
  }, [appRouter, user]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  );
}
