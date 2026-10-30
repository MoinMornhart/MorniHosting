import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Save, Send, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  MAIL_SECURITY,
  type MailSecurity,
  type MailSettingsInput,
  type MailSettingsView,
  type MailTestResult,
} from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Pill } from '@/components/ui/pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { errorText } from '@/lib/query';
import { statusQuery } from '@/features/auth/session';

const mailQuery = { queryKey: ['mail'], queryFn: () => api<MailSettingsView>('/api/mail') } as const;
/** Usual port for each kind of encryption: "starttls" 587, "tls" 465, "none" 25. */
const PORT_FOR: Readonly<Record<MailSecurity, number>> = { starttls: 587, tls: 465, none: 25 };

interface Draft extends Omit<MailSettingsInput, 'password'> {
  password: string;
}

function Toggle(props: {
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly title: string;
  readonly hint: string;
}): ReactElement {
  return (
    <label className="flex items-start gap-3 rounded-[12px] border border-border p-3">
      <Switch checked={props.checked} onCheckedChange={props.onChange} className="mt-0.5" />
      <span>
        <b className="block text-sm font-semibold">{props.title}</b>
        <span className="text-[13px] text-muted-foreground">{props.hint}</span>
      </span>
    </label>
  );
}

/** Admin area → E-Mail: the mail server, what the panel may send, and a test button. */
export function MailCard(): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery(mailQuery);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (data) {
      const { configured: _c, passwordSet: _p, linksPossible: _l, ...rest } = data;
      setDraft({ ...rest, password: '' });
    }
  }, [data]);

  const refresh = (view: MailSettingsView): void => {
    queryClient.setQueryData(mailQuery.queryKey, view);
    void queryClient.invalidateQueries({ queryKey: statusQuery.queryKey });
  };
  const save = useMutation({
    mutationFn: (body: Draft) =>
      api<MailSettingsView>('/api/mail', {
        method: 'PUT',
        body: { ...body, ...(body.password ? {} : { password: undefined }) },
      }),
    onSuccess: (view) => {
      refresh(view);
      toast.success(t('mail.saved'));
    },
  });
  const remove = useMutation({
    mutationFn: () => api<void>('/api/mail', { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailQuery.queryKey });
      void queryClient.invalidateQueries({ queryKey: statusQuery.queryKey });
      toast.success(t('mail.removed'));
    },
  });
  const test = useMutation({
    mutationFn: () =>
      api<MailTestResult>('/api/mail/test', {
        method: 'POST',
        body: testTo.trim() ? { to: testTo.trim() } : {},
      }),
    onSuccess: (result) => toast.success(t('mail.testSent', { to: result.sentTo })),
  });

  if (!data || !draft) return <Card className="h-64 animate-pulse p-6" aria-busy />;
  const set = (patch: Partial<Draft>): void => setDraft({ ...draft, ...patch });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    save.mutate(draft);
  };
  const error = save.error ?? remove.error ?? test.error;

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <form onSubmit={submit} className="grid gap-5">
        <CardHeader className="mb-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Mail className="size-4 text-primary" aria-hidden />
            {t('mail.title')}
            <Pill tone={data.configured ? 'ok' : 'neutral'}>
              {data.configured ? t('mail.on') : t('mail.off')}
            </Pill>
          </CardTitle>
          <CardDescription>{t('mail.text')}</CardDescription>
        </CardHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field id="mail-host" label={t('mail.host')} hint={t('mail.hostHint')}>
            <Input
              id="mail-host"
              value={draft.host}
              onChange={(e) => set({ host: e.target.value })}
              placeholder="smtp.example.de"
              autoComplete="off"
              required
            />
          </Field>
          <Field id="mail-port" label={t('mail.port')}>
            <Input
              id="mail-port"
              inputMode="numeric"
              value={draft.port}
              onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, '')) || 0 })} // eslint-disable-line ts-patterns/require-regex-example -- digits only: "58a7" → "587"
              required
            />
          </Field>
        </div>
        <Field id="mail-security" label={t('mail.security')} hint={t('mail.securityHint')}>
          <Select
            value={draft.security}
            onValueChange={(value) =>
              set({ security: value as MailSecurity, port: PORT_FOR[value as MailSecurity] })
            }
          >
            <SelectTrigger id="mail-security">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAIL_SECURITY.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`mail.securityKinds.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="mail-user" label={t('mail.user')}>
            <Input
              id="mail-user"
              value={draft.user}
              onChange={(e) => set({ user: e.target.value })}
              placeholder="noreply@mornihosting.de"
              autoComplete="off"
            />
          </Field>
          <Field
            id="mail-password"
            label={t('mail.password')}
            hint={data.passwordSet ? t('mail.passwordKept') : t('mail.passwordHint')}
          >
            <Input
              id="mail-password"
              type="password"
              value={draft.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={data.passwordSet ? '••••••••' : ''}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <Field id="mail-from" label={t('mail.from')} hint={t('mail.fromHint')}>
          <Input
            id="mail-from"
            value={draft.from}
            onChange={(e) => set({ from: e.target.value })}
            placeholder="MorniHosting <noreply@mornihosting.de>"
            required
          />
        </Field>

        {!data.linksPossible ? (
          <p role="note" className="rounded-[10px] bg-warning-soft px-3 py-2 text-sm">
            {t('mail.needsDomain')}
          </p>
        ) : null}
        <div className="grid gap-3">
          <Toggle
            checked={draft.registration}
            onChange={(registration) => set({ registration })}
            title={t('mail.registration')}
            hint={t('mail.registrationHint')}
          />
          {draft.registration ? (
            <Toggle
              checked={draft.registrationOrders}
              onChange={(registrationOrders) => set({ registrationOrders })}
              title={t('mail.registrationOrders')}
              hint={t('mail.registrationOrdersHint')}
            />
          ) : null}
          <Toggle
            checked={draft.crashMails}
            onChange={(crashMails) => set({ crashMails })}
            title={t('mail.crashMails')}
            hint={t('mail.crashMailsHint')}
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">
            {errorText(error)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            <Save />
            {t('common.save')}
          </Button>
          {data.configured ? (
            <Button
              type="button"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 />
              {t('mail.remove')}
            </Button>
          ) : null}
        </div>

        {data.configured ? (
          <div className="grid gap-3 border-t border-border pt-5">
            <Field id="mail-test" label={t('mail.testTitle')} hint={t('mail.testHint')}>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="mail-test"
                  type="email"
                  className="min-w-0 flex-1"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder={t('mail.testPlaceholder')}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={test.isPending}
                  onClick={() => test.mutate()}
                >
                  <Send />
                  {t('mail.testSend')}
                </Button>
              </div>
            </Field>
          </div>
        ) : null}

        <details className="rounded-[12px] border border-border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{t('mail.helpTitle')}</summary>
          <ul className="mt-3 grid gap-2 text-muted-foreground">
            <li>{t('mail.helpInwx')}</li>
            <li>{t('mail.helpIonos')}</li>
            <li>{t('mail.helpGmail')}</li>
          </ul>
        </details>
      </form>
    </Card>
  );
}
