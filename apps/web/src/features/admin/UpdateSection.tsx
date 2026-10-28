import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, CircleCheck, ExternalLink } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { UpdateInfo } from '@mornihosting/shared';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Pill } from '@/components/ui/pill';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { updateQuery } from '@/features/shell/UpdateCard';
import { ReleaseNotes } from './ReleaseNotes';

const MANUAL_COMMAND = 'update';
const MANUAL_COMMAND_VM = 'sudo /opt/mornihosting/update.sh';

/** Version, release notes and the update button (or how to update on the host). */
export function UpdateSection(): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ ...updateQuery, retry: false });
  const run = useMutation({
    mutationFn: () => api<UpdateInfo>('/api/system/update', { method: 'POST' }),
    onSuccess: (info) => {
      toast.success(t('update.started'));
      queryClient.setQueryData(updateQuery.queryKey, info);
    },
  });
  if (!data) return <Skeleton id="update" className="h-40 rounded-[16px]" />;
  return (
    <Card id="update" className="grid scroll-mt-4 gap-4 p-5 sm:p-6">
      <CardHeader className="mb-0">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t('update.title')}
          {data.available ? (
            <Pill tone="accent">{t('update.available', { version: data.latest })}</Pill>
          ) : (
            <Pill tone="ok" dot={false}>
              <CircleCheck className="size-3" aria-hidden />
              {t('update.upToDate')}
            </Pill>
          )}
        </CardTitle>
      </CardHeader>
      <CardDescription>
        {t('update.current', { version: data.current })}
        {data.checkedAt ? ` · ${t('update.checked', { when: formatRelative(data.checkedAt) })}` : ''}
      </CardDescription>
      {data.available && data.notes ? <ReleaseNotes text={data.notes} /> : null}
      {data.available && data.canSelfUpdate ? (
        <Button
          className="justify-self-start"
          disabled={run.isPending || data.updating}
          onClick={() => run.mutate()}
        >
          <ArrowUpCircle />
          {data.updating ? t('update.running') : t('update.now')}
        </Button>
      ) : null}
      {data.canSelfUpdate ? null : (
        <div className="grid gap-2 text-sm">
          <span className="text-muted-foreground">{t('update.manual')}</span>
          {[MANUAL_COMMAND, MANUAL_COMMAND_VM].map((cmd) => (
            <div key={cmd} className="flex items-center gap-2 rounded-[10px] bg-secondary px-3 py-1.5">
              <code className="min-w-0 flex-1 font-mono text-[13px]">{cmd}</code>
              <CopyButton text={cmd} className="size-7" />
            </div>
          ))}
        </div>
      )}
      {data.url ? (
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden />
          {t('update.releaseNotes')}
        </a>
      ) : null}
    </Card>
  );
}
