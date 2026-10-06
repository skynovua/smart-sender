import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError, SessionChangedError } from '@/api/errors';
import { safeReturnTo } from '@/auth/return-to';

const loginSchema = z.object({
  email: z.string().trim().pipe(z.email('Введіть коректну електронну адресу.')),
  password: z.string().min(1, 'Введіть пароль.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeReturnTo(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.getUser()) throw redirect({ href: search.redirect, replace: true });
  },
  component: LoginPage,
});

function LoginPage() {
  const { auth } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await auth.signIn(values);
      await router.navigate({ href: search.redirect, replace: true });
    } catch (error) {
      if (error instanceof SessionChangedError) return;
      if (error instanceof ApiError && error.status === 422) {
        let hasFieldError = false;
        for (const field of ['email', 'password'] as const) {
          const message = error.fieldErrors[field]?.[0];
          if (message) {
            setError(field, { type: 'server', message }, { shouldFocus: !hasFieldError });
            hasFieldError = true;
          }
        }
        if (hasFieldError) return;
      }
      setError('root', {
        message: 'Не вдалося увійти. Перевірте з’єднання та спробуйте ще раз.',
      });
    }
  });

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Вхід</h1>
      <p className="mt-2 text-sm text-muted">Увійдіть, щоб керувати вебхуками.</p>
      <form onSubmit={(event) => void submit(event)} noValidate className="mt-8 space-y-5">
        <fieldset className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Електронна адреса
            </label>
            <input
              {...register('email')}
              id="email"
              type="email"
              autoComplete="username"
              readOnly={isSubmitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className="mt-2 w-full rounded-lg border border-input-border px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-primary aria-invalid:border-danger"
            />
            {errors.email && (
              <p id="email-error" role="alert" className="mt-2 text-sm text-danger">
                {errors.email.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Пароль
            </label>
            <input
              {...register('password')}
              id="password"
              type="password"
              autoComplete="current-password"
              readOnly={isSubmitting}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className="mt-2 w-full rounded-lg border border-input-border px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-primary aria-invalid:border-danger"
            />
            {errors.password && (
              <p id="password-error" role="alert" className="mt-2 text-sm text-danger">
                {errors.password.message}
              </p>
            )}
          </div>
          {errors.root && (
            <p role="alert" className="text-sm text-danger">
              {errors.root.message}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-surface hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait"
          >
            {isSubmitting ? 'Входимо…' : 'Увійти'}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
