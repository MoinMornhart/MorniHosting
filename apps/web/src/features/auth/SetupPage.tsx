import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { passwordSchema, usernameSchema, type MeResponse } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { api } from '@/lib/api';
import { errorText } from '@/lib/query';
import { cn } from '@/lib/utils';
import { setLanguage, type Language } from '@/i18n';
import { AuthLayout } from './AuthLayout';
import { adoptMe, meQuery, statusQuery } from './session';

const STEPS = ['stepLanguage', 'stepAccount', 'stepDone'] as const;
const STEP_ACCOUNT = 1;
const STEP_DONE = 2;

function Steps({ current }: { current: number }): ReactElement {
  const { t } = useTranslation();
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs font-semibold">
      {STEPS.map((key, i) => (
        <li key={key} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full',
              i < current && 'bg-primary text-primary-foreground',
              i === current && 'bg-accent text-foreground ring-2 ring-primary',
              i > current && 'bg-muted text-muted-foreground',
            )}
          >
            {i < current ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn('hidden sm:inline', i !== current && 'text-muted-foreground')}>
            {t(`setup.${key}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function SetupPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery(statusQuery);
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api<MeResponse>('/api/setup', {
        method: 'POST',
        body: { username, password, locale: i18n.language === 'en' ? 'en' : 'de' },
      }),
    onSuccess: (me) => {
      adoptMe(me);
      queryClient.setQueryData(meQuery.queryKey, me);
      void queryClient.invalidateQueries({ queryKey: statusQuery.queryKey });
      setStep(STEP_DONE);
    },
    onError: () => undefined,
  });

  if (status.data && !status.data.setupRequired && step !== STEP_DONE) return <Navigate to="/" replace />;

  const usernameOk = usernameSchema.safeParse(username).success;
  const passwordOk = passwordSchema.safeParse(password).success;
  const matches = password === repeat;
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (usernameOk && passwordOk && matches) create.mutate();
  };
  const pickLanguage = (language: Language): void => {
    setLanguage(language);
    setStep(STEP_ACCOUNT);
  };

  return (
    <AuthLayout>
      <Steps current={step} />
      {step === 0 ? (
        <div className="grid gap-5">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]">{t('setup.title')}</h1>
            <p className="mt-1 text-muted-foreground">{t('setup.subtitle')}</p>
          </div>
          <div className="grid gap-1">
            <h2 className="font-semibold">{t('setup.languageTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('setup.languageHint')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['de', 'en'] as const).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => pickLanguage(language)}
                className={cn(
                  'rounded-[12px] border border-input bg-secondary px-4 py-4 text-left font-semibold hover:border-primary',
                  i18n.language === language && 'border-primary bg-accent',
                )}
              >
                {language === 'de' ? 'Deutsch' : 'English'}
              </button>
            ))}
          </div>
          {status.data && !status.data.docker.ok ? (
            <p className="flex gap-2 rounded-[10px] bg-warning-soft px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              {t('setup.dockerWarning')}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === STEP_ACCOUNT ? (
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]">{t('setup.accountTitle')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('setup.accountHint')}</p>
          </div>
          <Field
            id="username"
            label={t('setup.username')}
            hint={t('setup.usernameHint')}
            error={touched && !usernameOk ? t('setup.usernameHint') : undefined}
          >
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              value={username}
              aria-invalid={touched && !usernameOk}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field
            id="password"
            label={t('setup.password')}
            hint={t('setup.passwordHint')}
            error={touched && !passwordOk ? t('setup.passwordHint') : undefined}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              aria-invalid={touched && !passwordOk}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field
            id="repeat"
            label={t('setup.passwordRepeat')}
            error={touched && !matches ? t('setup.passwordMismatch') : undefined}
          >
            <Input
              id="repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              aria-invalid={touched && !matches}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
          {create.error ? (
            <p role="alert" className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">
              {errorText(create.error)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(0)}>
              {t('common.back')}
            </Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {t('setup.create')}
            </Button>
          </div>
        </form>
      ) : null}

      {step === STEP_DONE ? (
        <div className="grid gap-5">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]">{t('setup.doneTitle')}</h1>
            <p className="mt-1 text-muted-foreground">{t('setup.doneText')}</p>
          </div>
          <Button asChild size="lg">
            <Link to="/servers/new">
              <Plus />
              {t('setup.firstServer')}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">{t('setup.toDashboard')}</Link>
          </Button>
        </div>
      ) : null}
    </AuthLayout>
  );
}
