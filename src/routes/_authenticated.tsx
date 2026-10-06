import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { useUser } from '@/auth/use-user';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.getUser()) {
      throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { auth } = Route.useRouteContext();
  const user = useUser(auth);
  return user ? <Outlet /> : null;
}
