import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditEntry } from '@mornihosting/shared';
import { EmptyState, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/features/auth/session';
import { serversQuery } from '@/features/servers/live';

const PAGE = 50;
const ALL = 'all';
const DETAIL_KEYS_SHOWN = 3;
const DETAIL_VALUE_MAX = 60;

/** One readable line from the details object: "name: Survival · kind: manual". */
function detailText(details: Readonly<Record<string, unknown>>): string {
  return Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, DETAIL_KEYS_SHOWN)
    .map(([k, v]) => `${k}: ${(Array.isArray(v) ? v.join(', ') : String(v)).slice(0, DETAIL_VALUE_MAX)}`)
    .join(' · ');
}

/** Who did what and when, for the whole panel. */
export function AuditPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { me } = useSession();
  const [serverId, setServerId] = useState(ALL);
  const { data: servers } = useQuery(serversQuery);
  const log = useInfiniteQuery({
    queryKey: ['audit', serverId],
    queryFn: ({ pageParam }) =>
      api<AuditEntry[]>(
        `/api/audit?limit=${PAGE}${serverId === ALL ? '' : `&serverId=${serverId}`}${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === PAGE ? last.at(-1)?.id : undefined),
    enabled: me.user.isAdmin,
  });
  if (!me.user.isAdmin) return <EmptyState title={t('errors.admin_only')} />;
  const entries = log.data?.pages.flat() ?? [];
  const actionText = (action: string): string => {
    const key = `audit.actions.${action.replaceAll('.', '_')}`;
    return i18n.exists(key) ? t(key) : action;
  };

  const body = (): ReactElement => {
    if (log.isPending) return <Skeleton className="h-96 rounded-[16px]" />;
    if (!entries.length) return <EmptyState icon={<ScrollText />} title={t('audit.empty')} />;
    return (
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-[12px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-semibold">{t('audit.when')}</th>
              <th className="py-2 font-semibold">{t('audit.who')}</th>
              <th className="py-2 font-semibold">{t('audit.what')}</th>
              <th className="hidden py-2 pr-4 font-semibold lg:table-cell">{t('audit.details')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border/60 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {formatDateTime(e.at)}
                </td>
                <td className="py-2.5 pr-3">
                  <b className="font-semibold">{e.username ?? t('audit.system')}</b>
                  {e.ip ? <span className="block text-[12px] text-muted-foreground">{e.ip}</span> : null}
                </td>
                <td className="py-2.5 pr-3">
                  {actionText(e.action)}
                  {e.serverName ? (
                    <span className="block text-[12px] text-muted-foreground">{e.serverName}</span>
                  ) : null}
                </td>
                <td className="hidden max-w-[360px] py-2.5 pr-4 text-[12px] text-muted-foreground lg:table-cell">
                  <span className="line-clamp-2 break-all">{detailText(e.details)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title={t('nav.audit')}
        subtitle={t('audit.subtitle')}
        actions={
          <Select value={serverId} onValueChange={setServerId}>
            <SelectTrigger className="w-56" aria-label={t('audit.filter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('audit.allEntries')}</SelectItem>
              {(servers ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {body()}
      {log.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={log.isFetchingNextPage}
            onClick={() => void log.fetchNextPage()}
          >
            {t('audit.more')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
