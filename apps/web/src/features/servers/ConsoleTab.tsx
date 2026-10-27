import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { ConsoleView } from './console/ConsoleView';
import { useServer } from './ServerLayout';

export default function ConsoleTab(): ReactElement {
  const { t } = useTranslation();
  const { server, can } = useServer();
  if (!can('console')) return <EmptyState title={t('console.noPermission')} />;
  const running = server.live.state === 'running' || server.live.state === 'starting';
  return (
    <Card className="p-4 sm:p-5">
      <ConsoleView
        serverId={server.id}
        edition={server.edition}
        players={server.live.players}
        running={running}
        canSend={can('commands')}
        className="h-[calc(100dvh-300px)] min-h-[420px]"
      />
    </Card>
  );
}
