import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { UpdateInfo } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const CHECK_MINUTES = 30;
const MS_PER_MINUTE = 60000;

export const updateQuery = {
  queryKey: ['update'],
  queryFn: () => api<UpdateInfo>('/api/system/update'),
} as const;

/** Shown in the sidebar when GitHub has a newer release. */
export function UpdateCard(): ReactElement | null {
  const { t } = useTranslation();
  const { data } = useQuery({ ...updateQuery, retry: false, refetchInterval: CHECK_MINUTES * MS_PER_MINUTE });
  const run = useMutation({
    mutationFn: () => api<UpdateInfo>('/api/system/update', { method: 'POST' }),
    onSuccess: () => toast.success(t('update.started')),
  });
  if (!data?.available || !data.latest) return null;
  return (
    <div className="grid gap-1.5 rounded-[10px] bg-accent p-3 text-[13px]">
      <b className="font-semibold">{t('update.available', { version: data.latest })}</b>
      <span className="text-muted-foreground">{t('update.text')}</span>
      {data.canSelfUpdate ? (
        <Button
          size="sm"
          className="justify-self-start"
          disabled={run.isPending || data.updating}
          onClick={() => run.mutate()}
        >
          {data.updating ? t('update.running') : t('update.now')}
        </Button>
      ) : (
        <a href="/settings#update" className="font-semibold text-primary hover:underline">
          {t('update.howTo')}
        </a>
      )}
    </div>
  );
}
