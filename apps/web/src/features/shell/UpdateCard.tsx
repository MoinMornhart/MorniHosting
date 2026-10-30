import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { UpdateInfo } from '@mornihosting/shared';
import { api } from '@/lib/api';

const CHECK_MINUTES = 30;
const MS_PER_MINUTE = 60000;

export const updateQuery = {
  queryKey: ['update'],
  queryFn: () => api<UpdateInfo>('/api/system/update'),
} as const;

/** Shown in the sidebar when there is something new on GitHub, or while an update runs. */
export function UpdateCard(): ReactElement | null {
  const { t } = useTranslation();
  const { data } = useQuery({ ...updateQuery, retry: false, refetchInterval: CHECK_MINUTES * MS_PER_MINUTE });
  if (!data || (!data.available && !data.updating)) return null;
  return (
    <Link
      to="/settings#update"
      className="grid gap-1 rounded-[10px] bg-accent p-3 text-[13px] transition-colors hover:bg-accent/80"
    >
      {data.updating ? (
        <b className="flex items-center gap-1.5 font-semibold">
          <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
          {t('update.running')}
        </b>
      ) : (
        <>
          <b className="font-semibold">
            {data.behind ? t('update.behind', { count: data.behind }) : t('update.newer')}
          </b>
          <span className="text-muted-foreground">{t('update.text')}</span>
          <span className="font-semibold text-primary">{t('update.show')}</span>
        </>
      )}
    </Link>
  );
}
