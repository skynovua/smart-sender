import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { validateWebhookSearch, webhookListOptions } from '@/webhooks/queries';

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
      <h1 className="text-3xl font-semibold tracking-tight">Вебхуки</h1>
      <p className="mt-2 text-slate-600">Керування вебхуками.</p>
      <form
        key={`${params.page}:${params.search}`}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const search = String(new FormData(event.currentTarget).get('search') ?? '').trim();
          void navigate({ search: { page: 1, search } });
        }}
        className="mt-8 flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="webhook-search" className="block text-sm font-medium">
            Пошук за назвою
          </label>
          <input
            id="webhook-search"
            name="search"
            type="search"
            defaultValue={params.search}
            placeholder="Наприклад, Payment"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-blue-600"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Знайти
        </button>
        {params.search && (
          <button
            type="button"
            onClick={() => void navigate({ search: { page: 1, search: '' } })}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Скинути пошук
          </button>
        )}
      </form>

      <div
        className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"
        aria-busy={isFetching}
      >
        {isPending ? (
          <p role="status" className="p-8 text-slate-600">
            Завантажуємо вебхуки…
          </p>
        ) : isError ? (
          <div className="p-8">
            <p role="alert" className="text-red-700">
              Не вдалося завантажити вебхуки.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="mt-4 rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-50"
            >
              Спробувати ще раз
            </button>
          </div>
        ) : data.data.length === 0 ? (
          <div className="p-8">
            <h2 className="font-semibold">Вебхуків не знайдено</h2>
            <p className="mt-2 text-slate-600">
              {params.search
                ? 'Спробуйте іншу назву або скиньте пошук.'
                : 'Список вебхуків порожній.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Список вебхуків</caption>
                <thead className="border-b border-slate-200 text-slate-600">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-medium">
                      Назва
                    </th>
                    <th scope="col" className="px-6 py-4 font-medium">
                      URL
                    </th>
                    <th scope="col" className="px-6 py-4 font-medium">
                      Статус
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.data.map((webhook) => (
                    <tr key={webhook.id}>
                      <th scope="row" className="px-6 py-4 font-medium">
                        <Link
                          to="/webhooks/$id/edit"
                          params={{ id: String(webhook.id) }}
                          search={params}
                          aria-label={`Редагувати ${webhook.name}`}
                          className="text-blue-700 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4"
                        >
                          {webhook.name}
                        </Link>
                      </th>
                      <td className="max-w-md px-6 py-4 break-all text-slate-600">{webhook.url}</td>
                      <td className="px-6 py-4">
                        <span
                          className={
                            webhook.active
                              ? 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
                              : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600'
                          }
                        >
                          {webhook.active ? 'Активний' : 'Неактивний'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Пагінація вебхуків"
              className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-6 py-4"
            >
              <p className="text-sm text-slate-600">
                Усього: {data.paging.results.total} · Сторінка {data.paging.pages.current} з{' '}
                {data.paging.pages.last}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={data.paging.pages.current <= 1}
                  onClick={() =>
                    void navigate({ search: { ...params, page: data.paging.pages.current - 1 } })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Попередня
                </button>
                <button
                  type="button"
                  disabled={data.paging.pages.current >= data.paging.pages.last}
                  onClick={() =>
                    void navigate({ search: { ...params, page: data.paging.pages.current + 1 } })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Наступна
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}
