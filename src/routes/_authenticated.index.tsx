import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { Icon } from '@/ui/icon';
import { Skeleton } from '@/ui/skeleton';
import { validateWebhookSearch, webhookListOptions } from '@/webhooks/queries';
import { WebhookListSkeleton, WebhookTable } from '@/webhooks/table';

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: validateWebhookSearch,
  component: WebhooksPage,
});

function WebhooksPage() {
  const { auth } = Route.useRouteContext();
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    webhookListOptions(auth.api, params),
  );

  const current = data?.paging.pages.current;
  useEffect(() => {
    // The server clamps pages after filtering; keep the URL consistent with the result.
    if (current !== undefined && current !== params.page) {
      void navigate({ search: { ...params, page: current }, replace: true });
    }
  }, [current, navigate, params]);

  return (
    <section>
      <p className="eyebrow mb-3">Інтеграції</p>
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Вебхуки</h1>
        <span className="inline-flex h-[26px] min-w-9 items-center justify-center rounded-md border border-border bg-surface px-2 font-mono text-xs text-muted">
          {data ? data.paging.results.total : isPending ? <Skeleton className="h-3 w-4" /> : '—'}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted">Керування вебхуками.</p>
      <form
        key={`${params.page}:${params.search}`}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const search = String(new FormData(event.currentTarget).get('search') ?? '').trim();
          void navigate({ search: { page: 1, search } });
        }}
        className="mt-8 flex flex-wrap items-center gap-3 rounded-t-xl border border-border bg-surface px-5 py-4"
      >
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
          <label htmlFor="webhook-search" className="sr-only">
            Пошук за назвою
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          />
          <input
            id="webhook-search"
            name="search"
            type="search"
            defaultValue={params.search}
            placeholder="Пошук вебхуків…"
            className="field pl-10"
          />
        </div>
        <button type="submit" className="button-secondary">
          Знайти
        </button>
        {params.search && (
          <button
            type="button"
            onClick={() => void navigate({ search: { page: 1, search: '' } })}
            className="button-ghost"
          >
            Скинути пошук
          </button>
        )}
        <span className="ml-auto hidden text-xs text-muted sm:block">10 на сторінці</span>
      </form>

      <div
        className="min-h-[694px] overflow-hidden rounded-b-xl border border-t-0 border-border bg-surface"
        aria-busy={isFetching}
      >
        {isError && data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
            <p role="alert" className="text-sm text-danger">
              Не вдалося оновити вебхуки. Показуємо останні завантажені дані.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="button-secondary"
            >
              Спробувати ще раз
            </button>
          </div>
        )}
        {isPending ? (
          <WebhookListSkeleton />
        ) : isError && !data ? (
          <div className="flex min-h-[693px] flex-col items-center justify-center p-8 text-center">
            <p role="alert" className="text-danger">
              Не вдалося завантажити вебхуки.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="button-secondary mt-4"
            >
              Спробувати ще раз
            </button>
          </div>
        ) : data.data.length === 0 ? (
          <div className="flex min-h-[693px] flex-col items-center justify-center p-8 text-center">
            <h2 className="font-semibold">Вебхуків не знайдено</h2>
            <p className="mt-2 text-muted">
              {params.search
                ? 'Спробуйте іншу назву або скиньте пошук.'
                : 'Список вебхуків порожній.'}
            </p>
          </div>
        ) : (
          <>
            <WebhookTable>
              <tbody className="divide-y divide-border/50">
                {data.data.map((webhook) => (
                  <tr key={webhook.id} className="group hover:bg-charcoal/30">
                    <th scope="row" className="px-6 py-3 font-medium">
                      <Link
                        to="/webhooks/$id/edit"
                        params={{ id: String(webhook.id) }}
                        search={params}
                        aria-label={`Редагувати ${webhook.name}`}
                        className="inline-flex items-center gap-3 rounded-sm text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-mid-azure">
                          <Icon name="webhook" className="size-4" />
                        </span>
                        {webhook.name}
                        <Icon
                          name="arrowRight"
                          className="size-3.5 shrink-0 text-muted opacity-0 group-hover:opacity-100"
                        />
                      </Link>
                    </th>
                    <td className="max-w-lg px-6 py-3 font-mono text-xs break-all text-muted">
                      {webhook.url}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          webhook.active
                            ? 'inline-flex items-center gap-2 rounded-md border border-mid-azure/20 bg-primary/15 px-2.5 py-1 text-xs font-medium text-light-azure'
                            : 'inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted'
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={
                            webhook.active
                              ? 'size-1.5 rounded-full bg-mid-azure'
                              : 'size-1.5 rounded-full bg-muted'
                          }
                        />
                        {webhook.active ? 'Активний' : 'Неактивний'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </WebhookTable>
            <nav
              aria-label="Пагінація вебхуків"
              className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-6 py-4"
            >
              <p className="text-xs text-muted">
                Усього: {data.paging.results.total} · Сторінка {data.paging.pages.current} з{' '}
                {data.paging.pages.last}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={data.paging.pages.current <= 1}
                  onClick={() =>
                    void navigate({ search: { ...params, page: data.paging.pages.current - 1 } })
                  }
                  className="button-secondary"
                >
                  <Icon name="chevronLeft" className="size-4" />
                  Попередня
                </button>
                <button
                  type="button"
                  disabled={data.paging.pages.current >= data.paging.pages.last}
                  onClick={() =>
                    void navigate({ search: { ...params, page: data.paging.pages.current + 1 } })
                  }
                  className="button-secondary"
                >
                  Наступна
                  <Icon name="chevronRight" className="size-4" />
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}
