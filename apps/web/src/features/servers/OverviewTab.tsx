import { lazy, Suspense, type ReactElement } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { useServer } from './ServerLayout';
import { ConnectionCard } from './overview/ConnectionCard';
import { ConsolePreview } from './overview/ConsolePreview';
import { CrashCard } from './overview/CrashCard';
import { KpiStrip } from './overview/KpiStrip';
import { PlayersCard } from './overview/PlayersCard';
import { StatusBanner } from './overview/StatusBanner';

const StatsChart = lazy(() => import('./overview/StatsChart'));

export function OverviewTab(): ReactElement {
  const { server, can } = useServer();
  const showCrash = server.crash && (server.live.state === 'crashed' || server.live.state === 'stopped');
  return (
    <>
      {showCrash && server.crash ? (
        <CrashCard serverId={server.id} crash={server.crash} canControl={can('control')} />
      ) : null}
      <StatusBanner server={server} canConsole={can('console')} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4">
          <ConnectionCard server={server} />
          <KpiStrip server={server} />
          {can('console') ? <ConsolePreview serverId={server.id} /> : null}
          <Suspense fallback={<Skeleton className="h-[280px] rounded-[16px]" />}>
            <StatsChart serverId={server.id} />
          </Suspense>
        </div>
        <div className="grid min-w-0 gap-4">
          <PlayersCard server={server} canManage={can('players')} />
        </div>
      </div>
    </>
  );
}
