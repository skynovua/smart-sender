import { useEffect, useRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { UpdateWebhookRequest, Webhook } from '@/api/contracts';
import { ApiError, SessionChangedError } from '@/api/errors';
import { Icon } from '@/ui/icon';
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
        className="button-secondary mt-4"
      >
        Спробувати ще раз
      </button>
    </div>
  );

  return (
    <section className="max-w-5xl">
      <Link to="/" search={params} className="button-ghost -ml-4">
        <Icon name="arrowLeft" className="size-4" />
        До списку вебхуків
      </Link>
      <div className="mt-7">
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
      <p className="eyebrow mb-3">Налаштування інтеграції</p>
      <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
        Редагування вебхука
      </h1>
      <p className="mt-3 text-sm text-muted">Змініть назву або URL для отримання подій.</p>
      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_220px]">
        <form
          onSubmit={(event) => void handleSubmit(submit)(event)}
          noValidate
          className="overflow-hidden rounded-xl border border-border bg-surface"
        >
          <div className="border-b border-border px-6 py-5 sm:px-8">
            <h2 className="text-sm font-semibold">Основні параметри</h2>
            <p className="mt-1.5 text-xs text-muted">
              Назва інтеграції та адреса отримувача подій.
            </p>
          </div>
          <div className="space-y-7 px-6 py-7 sm:px-8">
            <div>
              <label htmlFor="webhook-name" className="field-label">
                Назва
              </label>
              <input
                {...register('name')}
                id="webhook-name"
                type="text"
                readOnly={isSubmitting}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'name-error' : undefined}
                className="field mt-2.5"
              />
              {errors.name && (
                <p id="name-error" role="alert" className="mt-2 text-sm text-danger">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="webhook-url" className="field-label">
                URL
              </label>
              <input
                {...register('url')}
                id="webhook-url"
                type="url"
                readOnly={isSubmitting}
                aria-invalid={Boolean(errors.url)}
                aria-describedby={errors.url ? 'url-error' : 'url-hint'}
                className="field mt-2.5 font-mono sm:text-xs"
              />
              {errors.url ? (
                <p id="url-error" role="alert" className="mt-2 text-sm text-danger">
                  {errors.url.message}
                </p>
              ) : (
                <p id="url-hint" className="mt-3 text-xs leading-5 text-muted">
                  Адреса має починатися з http:// або https://.
                </p>
              )}
            </div>
            {errors.root && (
              <p role="alert" className="text-sm text-danger">
                {errors.root.message}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4 sm:px-8">
            <Link to="/" search={params} className="button-ghost">
              Скасувати
            </Link>
            <button type="submit" disabled={isSubmitting} className="button-primary">
              {isSubmitting ? 'Зберігаємо…' : 'Зберегти'}
              <Icon name="arrowRight" className="size-4" />
            </button>
          </div>
        </form>
        <aside aria-label="Інформація про вебхук" className="border-l border-border py-1 pl-6">
          <p className="eyebrow">Вибраний вебхук</p>
          <p className="mt-4 font-mono text-lg text-accent">
            #{webhook.id.toString().padStart(2, '0')}
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted">
            <span
              aria-hidden="true"
              className={
                webhook.active
                  ? 'size-1.5 rounded-full bg-mid-azure'
                  : 'size-1.5 rounded-full bg-muted'
              }
            />
            {webhook.active ? 'Активний' : 'Неактивний'}
          </div>
          <div className="mt-8 border-t border-border pt-6">
            <Icon name="globe" className="mb-3 size-5 text-mid-azure" />
            <p className="text-sm font-medium">Адреса отримувача</p>
            <p className="mt-2 text-xs leading-6 text-muted">
              Вкажіть URL застосунку, який має отримувати події цього вебхука.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
