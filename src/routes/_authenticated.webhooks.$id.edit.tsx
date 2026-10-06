import { useEffect, useRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { UpdateWebhookRequest, Webhook } from '@/api/contracts';
import { ApiError, SessionChangedError } from '@/api/errors';
import { validateWebhookSearch, webhookDetailOptions } from '@/webhooks/queries';

const editSchema = z.object({
  name: z.string().trim().min(1, 'Введіть назву вебхука.'),
  url: z
    .string()
    .trim()
    .regex(/^https?:\/\//i, 'Введіть коректний HTTP або HTTPS URL.')
    .pipe(z.url({ protocol: /^https?$/, error: 'Введіть коректний HTTP або HTTPS URL.' })),
});

export const Route = createFileRoute('/_authenticated/webhooks/$id/edit')({
  validateSearch: validateWebhookSearch,
  component: WebhookEditPage,
});

function WebhookEditPage() {
  const { id: rawId } = Route.useParams();
  const id = Number(rawId);
  const validId = /^\d+$/.test(rawId) && Number.isSafeInteger(id) && id > 0;
  const { auth } = Route.useRouteContext();
  const params = Route.useSearch();
  const { data, error, isPending, isError, isFetching, refetch } = useQuery({
    ...webhookDetailOptions(auth.api, id),
    enabled: validId,
  });
  const notFound = !validId || (error instanceof ApiError && error.status === 404);

  const errorNotice = (
    <div className={data ? 'mb-6' : undefined}>
      <p role="alert" className="text-danger">
        {data ? 'Не вдалося оновити дані вебхука.' : 'Не вдалося завантажити вебхук.'}
      </p>
      <button
        type="button"
        onClick={() => void refetch()}
        disabled={isFetching}
        className="mt-4 rounded-lg border border-input-border px-4 py-2 font-medium hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50"
      >
        Спробувати ще раз
      </button>
    </div>
  );

  return (
    <section className="mx-auto max-w-xl">
      <Link
        to="/"
        search={params}
        className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        До списку вебхуків
      </Link>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {notFound ? (
          <h1 className="text-2xl font-semibold">Вебхук не знайдено</h1>
        ) : isPending ? (
          <p role="status" className="text-muted">
            Завантажуємо вебхук…
          </p>
        ) : isError && !data ? (
          errorNotice
        ) : data ? (
          <>
            {isError && errorNotice}
            <WebhookEditForm key={data.id} webhook={data} />
          </>
        ) : null}
      </div>
    </section>
  );
}

function WebhookEditForm({ webhook }: { webhook: Webhook }) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { auth, queryClient } = Route.useRouteContext();
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const mutation = useMutation({
    mutationFn: (values: UpdateWebhookRequest) => auth.api.updateWebhook(webhook.id, values),
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateWebhookRequest>({
    resolver: zodResolver(editSchema),
    // Background refetches must not overwrite a user's draft.
    defaultValues: { name: webhook.name, url: webhook.url },
  });

  const submit = async (values: UpdateWebhookRequest) => {
    const user = auth.getUser();
    try {
      const updated = await mutation.mutateAsync(values);
      if (!user || auth.getUser() !== user) throw new SessionChangedError();
      await queryClient.cancelQueries({
        queryKey: webhookDetailOptions(auth.api, webhook.id).queryKey,
      });
      if (auth.getUser() !== user) throw new SessionChangedError();
      queryClient.setQueryData(webhookDetailOptions(auth.api, webhook.id).queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: ['webhooks', 'list'] });
      if (auth.getUser() !== user) throw new SessionChangedError();
      if (mounted.current) await navigate({ to: '/', search: params });
    } catch (error) {
      if (error instanceof SessionChangedError) return;
      if (error instanceof ApiError && error.status === 422) {
        let hasFieldError = false;
        for (const field of ['name', 'url'] as const) {
          const message = error.fieldErrors[field]?.[0];
          if (message) {
            setError(field, { type: 'server', message }, { shouldFocus: !hasFieldError });
            hasFieldError = true;
          }
        }
        if (hasFieldError) return;
      }
      setError('root', { message: 'Не вдалося зберегти зміни. Спробуйте ще раз.' });
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Редагування вебхука</h1>
      <p className="mt-2 text-sm text-muted">Змініть назву або URL для отримання подій.</p>
      <form
        onSubmit={(event) => void handleSubmit(submit)(event)}
        noValidate
        className="mt-8 space-y-5"
      >
        <div>
          <label htmlFor="webhook-name" className="block text-sm font-medium">
            Назва
          </label>
          <input
            {...register('name')}
            id="webhook-name"
            type="text"
            readOnly={isSubmitting}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className="mt-2 w-full rounded-lg border border-input-border bg-canvas px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-focus aria-invalid:border-danger"
          />
          {errors.name && (
            <p id="name-error" role="alert" className="mt-2 text-sm text-danger">
              {errors.name.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="webhook-url" className="block text-sm font-medium">
            URL
          </label>
          <input
            {...register('url')}
            id="webhook-url"
            type="url"
            readOnly={isSubmitting}
            aria-invalid={Boolean(errors.url)}
            aria-describedby={errors.url ? 'url-error' : 'url-hint'}
            className="mt-2 w-full rounded-lg border border-input-border bg-canvas px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-focus aria-invalid:border-danger"
          />
          {errors.url ? (
            <p id="url-error" role="alert" className="mt-2 text-sm text-danger">
              {errors.url.message}
            </p>
          ) : (
            <p id="url-hint" className="mt-2 text-sm text-muted">
              Адреса має починатися з http:// або https://.
            </p>
          )}
        </div>
        {errors.root && (
          <p role="alert" className="text-sm text-danger">
            {errors.root.message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary px-4 py-2.5 font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? 'Зберігаємо…' : 'Зберегти'}
          </button>
          <Link
            to="/"
            search={params}
            className="rounded-lg border border-input-border px-4 py-2.5 font-medium hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Скасувати
          </Link>
        </div>
      </form>
    </>
  );
}
