import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

import type { AuthSession } from '@/auth/session';
import { useUser } from '@/auth/use-user';

export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthSession;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  const { auth } = Route.useRouteContext();
  const user = useUser(auth);

  return (
    <div className="min-h-svh bg-canvas text-ink">
      <div aria-hidden="true" className="h-1 bg-brand-gradient" />
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <Link
            to="/"
            search={{ page: 1, search: '' }}
            className="font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Smart Sender
          </Link>
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted">{user.name}</span>
              <button
                type="button"
                onClick={() => {
                  // Local logout completes even when the revoke request fails.
                  void auth.signOut().catch(() => {});
                }}
                className="rounded-lg border border-input-border px-3 py-2 text-sm font-medium hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Вийти
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Outlet />
      </main>
    </div>
  );
}

function NotFoundPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Сторінку не знайдено</h1>
      <Link
        to="/"
        search={{ page: 1, search: '' }}
        className="mt-4 inline-block text-primary underline"
      >
        На головну
      </Link>
    </section>
  );
}
