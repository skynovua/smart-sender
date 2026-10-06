import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  return (
    <div className="min-h-svh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <Link
          to="/"
          className="font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Smart Sender
        </Link>
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
      <Link to="/" className="mt-4 inline-block text-blue-700 underline">
        На головну
      </Link>
    </section>
  );
}
