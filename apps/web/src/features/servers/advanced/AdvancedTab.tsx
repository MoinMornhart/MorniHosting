import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/page';
import { TabIntro } from '@/components/tab-intro';
import { CopyButton } from '@/components/copy-button';
import { formatDateTime } from '@/lib/format';
import { useServer } from '../ServerLayout';
import { DangerZone } from '../settings/DangerZone';

/** Details for helpers and support (IDs, container image) and deleting the server. */
export default function AdvancedTab(): ReactElement {
  const { t } = useTranslation();
  const { server, can } = useServer();
  if (!can('config')) return <EmptyState title={t('server.noPermission')} />;
  const rows: readonly { label: string; value: string }[] = [
    { label: t('advanced.serverId'), value: server.id },
    { label: t('advanced.container'), value: `mh-${server.id}` },
    { label: t('advanced.image'), value: server.image },
    { label: t('advanced.created'), value: formatDateTime(server.createdAt) },
  ];
  return (
    <>
      <TabIntro title={t('advanced.title')} text={t('advanced.text')} />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="grid gap-3 rounded-[14px] border border-border bg-card p-5">
          <h3 className="text-[15px] font-bold uppercase tracking-wide">{t('advanced.debug')}</h3>
          <dl className="grid gap-2">
            {rows.map((r) => (
              <div key={r.label} className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-sm text-muted-foreground">{r.label}</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <code className="min-w-0 break-all rounded-[6px] bg-background px-2 py-1 font-mono text-[13px]">
                    {r.value}
                  </code>
                  <CopyButton text={r.value} className="size-7" />
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <DangerZone server={server} />
      </div>
    </>
  );
}
