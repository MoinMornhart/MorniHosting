import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Save, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { NetbirdPurpose, NetbirdServerInfo, ServerDetail } from '@mornihosting/shared';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { api } from '@/lib/api';
import { errorText } from '@/lib/query';
import { NetbirdNameInput } from './NetbirdNameInput';

const ORDER: readonly NetbirdPurpose[] = ['main', 'geyser', 'voice'];

/** The server's name in NetBird: typing "survival" is all it takes, the panel sets up the rest. */
export function NetbirdServerField({
  server,
  domain,
}: {
  server: ServerDetail;
  domain: string;
}): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(server.netbird?.name ?? '');
  const save = useMutation({
    mutationFn: (name: string | null) =>
      api<{ netbird: NetbirdServerInfo | null }>(`/api/servers/${server.id}/netbird`, {
        method: 'PUT',
        body: { name },
      }),
    onSuccess: async (result) => {
      toast.success(result.netbird ? t('netbirdAuto.serverSaved') : t('netbirdAuto.serverRemoved'));
      setDraft(result.netbird?.name ?? '');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['server', server.id] }),
        queryClient.invalidateQueries({ queryKey: ['connection', server.id] }),
      ]);
    },
  });
  const name = draft.trim();
  const submit = (): void => save.mutate(name || null);
  const services = [...(server.netbird?.services ?? [])].sort(
    (a, b) => ORDER.indexOf(a.purpose) - ORDER.indexOf(b.purpose),
  );
  const failure = save.error ? errorText(save.error) : null;
  const lastError = server.netbird?.error
    ? t(`errors.${server.netbird.error.code}`, server.netbird.error.params)
    : null;

  return (
    <div className="grid gap-2 md:col-span-2">
      <Field
        id={`nb-name-${server.id}`}
        label={t('netbirdAuto.fieldLabel')}
        hint={t('netbirdAuto.fieldHint')}
      >
        <div className="flex flex-wrap gap-2">
          <NetbirdNameInput
            id={`nb-name-${server.id}`}
            value={draft}
            domain={domain}
            onChange={setDraft}
            onEnter={submit}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={save.isPending || name === (server.netbird?.name ?? '')}
            onClick={submit}
          >
            <Save />
            {save.isPending ? t('netbirdAuto.saving') : t('common.save')}
          </Button>
          {server.netbird ? (
            <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              <Trash2 />
              {t('netbirdAuto.remove')}
            </Button>
          ) : null}
        </div>
      </Field>
      {services.length ? (
        <ul className="grid gap-1.5 rounded-[12px] bg-secondary px-3 py-2 text-[13px]">
          {services.map((s) => {
            const address = s.port ? `${s.domain}:${s.port}` : s.domain;
            return (
              <li key={s.purpose} className="flex flex-wrap items-center gap-2">
                <Globe className="size-4 text-primary" aria-hidden />
                <span className="text-muted-foreground">{t(`netbirdAuto.purpose.${s.purpose}`)}</span>
                <code className="font-mono font-semibold">{address}</code>
                <CopyButton text={address} className="size-7" />
              </li>
            );
          })}
        </ul>
      ) : null}
      {(failure ?? lastError) ? (
        <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">{failure ?? lastError}</p>
      ) : null}
    </div>
  );
}
