import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

import type { AuthSession } from '@/auth/session';
import { useUser } from '@/auth/use-user';
import { Icon } from '@/ui/icon';

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
      <header className="border-b border-border bg-canvas px-5 sm:px-8">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-4">
          <Link to="/" search={{ page: 1, search: '' }} className="brand-link sm:gap-3 sm:text-lg">
            <span className="brand-mark">
              <Icon name="webhook" className="size-6" />
            </span>
            <span>
              Smart Sender<span className="text-mid-azure">.</span>
            </span>
          </Link>
          {user && (
            <div className="flex items-center gap-3 sm:gap-5">
              <span className="hidden text-sm text-muted sm:block">{user.name}</span>
              <span
                aria-hidden="true"
                className="hidden size-9 place-items-center rounded-full border border-border bg-surface text-xs font-semibold text-accent sm:grid"
              >
                {user.name.slice(0, 1)}
              </span>
              <button
                type="button"
                onClick={() => {
                  // Local logout completes even when the revoke request fails.
                  void auth.signOut().catch(() => {});
                }}
                className="button-ghost"
              >
                <Icon name="logout" className="size-4" />
                Вийти
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        {user && (
          <aside className="hidden w-56 shrink-0 flex-col border-r border-border px-5 py-10 lg:flex">
            <p className="eyebrow px-3">Робочий простір</p>
            <nav aria-label="Основна навігація" className="mt-5">
              <Link
                to="/"
                search={{ page: 1, search: '' }}
                className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/15 px-3 py-3 text-sm font-medium text-accent"
              >
                <Icon name="webhook" className="size-5" />
                Вебхуки
              </Link>
            </nav>
            <div className="mt-auto pt-20">
              <p className="px-3 text-xs leading-5 text-muted">
                Smart Sender
                <br />
                Простір ваших інтеграцій
              </p>
            </div>
          </aside>
        )}
        <main
          className={
            user
              ? 'min-h-[calc(100svh-5rem)] min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-10 xl:px-12'
              : 'w-full px-5 sm:px-8'
          }
        >
          <Outlet />
        </main>
      </div>
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
        className="mt-4 inline-block text-accent underline"
      >
        На головну
      </Link>
    </section>
  );
}
