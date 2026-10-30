import { useQuery } from '@tanstack/react-query';
import { Package, Plus, RotateCw } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { SOFTWARE } from '@mornihosting/shared';
import { EmptyState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { useServerAction } from '@/features/dashboard/ServerCard';
import { useServer } from '../ServerLayout';
import { contentQuery, InstalledList } from './InstalledList';
import { Marketplace, useInstallFeedback, type InstallOutcome } from './Marketplace';
import { TabIntro } from '@/components/tab-intro';

type View = 'installed' | 'browse';

/** Plugins or mods of one server: what is installed, and the marketplace to find more. */
export default function ContentTab(): ReactElement {
  const { t } = useTranslation();
  const { server, can } = useServer();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'browse' ? 'browse' : 'installed';
  const [restartNeeded, setRestartNeeded] = useState(false);
  const restart = useServerAction(server.id);
  const feedback = useInstallFeedback();
  const { data: installed } = useQuery(contentQuery(server.id));
  const state = server.live.state;
  const kind = SOFTWARE[server.software].content === 'mods' ? 'mods' : 'plugins';

  useEffect(() => {
    if (state !== 'running') setRestartNeeded(false);
  }, [state]);

  if (!can('plugins')) return <EmptyState title={t('server.noPermission')} />;
  if (SOFTWARE[server.software].content === 'none')
    return <EmptyState title={t('errors.no_content_support')} />;

  const changed = (): void => {
    if (state === 'running') setRestartNeeded(true);
  };
  const installedOutcome = (outcome: InstallOutcome): void => {
    feedback(outcome);
    changed();
  };

  return (
    <div className="grid gap-4">
      <TabIntro
        title={t(`server.tabs.${kind}`)}
        text={t(`content.intro.${kind}`)}
        action={
          view === 'browse' ? (
            <Button variant="secondary" onClick={() => setParams({})}>
              <Package />
              {t('content.installed', { count: installed?.length ?? 0 })}
            </Button>
          ) : (
            <Button onClick={() => setParams({ view: 'browse' })}>
              <Plus />
              {t(`content.add.${kind}`)}
            </Button>
          )
        }
      />
      {restartNeeded ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          <span className="flex-1 font-medium text-warning">{t(`content.restartHint.${kind}`)}</span>
          <Button
            size="sm"
            disabled={restart.isPending}
            onClick={() => {
              restart.mutate('restart');
              setRestartNeeded(false);
            }}
          >
            <RotateCw />
            {t('actions.restart')}
          </Button>
        </div>
      ) : null}

      {view === 'browse' ? (
        <Marketplace server={server} onInstalled={installedOutcome} />
      ) : (
        <InstalledList server={server} onChanged={changed} onBrowse={() => setParams({ view: 'browse' })} />
      )}
    </div>
  );
}
