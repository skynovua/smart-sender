import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError, SessionChangedError } from '@/api/errors';
import { safeReturnTo } from '@/auth/return-to';
import { Icon } from '@/ui/icon';

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
    <section className="mx-auto grid min-h-[calc(100svh-5rem)] max-w-6xl items-center gap-12 py-12 lg:grid-cols-[1.15fr_1fr] lg:gap-20 lg:py-12">
      <div className="login-art hidden lg:block">
        <p className="eyebrow mb-7 text-mid-azure">Простір для ваших інтеграцій</p>
        <h2 className="text-5xl leading-[1.1] font-semibold tracking-[-0.045em] xl:text-6xl">
          Ваші інтеграції.
          <br />
          <span className="text-mid-azure">Під контролем.</span>
        </h2>
        <p className="mt-6 max-w-sm text-base leading-7 text-muted">
          Керуйте вебхуками та налаштовуйте адреси, на які ваш застосунок отримуватиме події.
        </p>
        <div aria-hidden="true" className="mt-14 flex max-w-sm items-start">
          {(['Подія', 'Вебхук', 'Застосунок'] as const).map((label, index) => (
            <div key={label} className="flex flex-1 items-start last:flex-none">
              <div className="text-center">
                <span
                  className={
                    index === 1
                      ? 'grid size-16 place-items-center rounded-2xl border border-mid-azure/40 bg-primary text-on-primary shadow-[0_0_50px_#00638e33]'
                      : 'grid size-16 place-items-center rounded-2xl border border-border bg-surface text-accent'
                  }
                >
                  <Icon name={index === 2 ? 'globe' : 'webhook'} className="size-7" />
                </span>
                <p className="mt-4 text-xs text-muted">{label}</p>
              </div>
              {index < 2 && <span className="mt-8 h-px flex-1 bg-brand-gradient" />}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-7 sm:p-10">
        <p className="eyebrow mb-4">Ваш робочий простір</p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">Вхід</h1>
        <p className="mt-2 text-sm text-muted">Увійдіть, щоб керувати вебхуками.</p>
        <form onSubmit={(event) => void submit(event)} noValidate className="mt-8 space-y-5">
          <fieldset className="space-y-5">
            <div>
              <label htmlFor="email" className="field-label">
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
                className="field mt-2"
              />
              {errors.email && (
                <p id="email-error" role="alert" className="mt-2 text-sm text-danger">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="field-label">
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
                className="field mt-2"
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
            <button type="submit" disabled={isSubmitting} className="button-primary mt-2 w-full">
              {isSubmitting ? 'Входимо…' : 'Увійти'}
              <Icon name="arrowRight" className="size-4" />
            </button>
          </fieldset>
        </form>
      </div>
    </section>
  );
}
