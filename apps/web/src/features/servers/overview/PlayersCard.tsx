import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ServerDetail } from '@mornihosting/shared';
import { PlayerHead } from '@/components/server-visuals';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

const EMPTY_TEXT: Readonly<Record<string, string>> = {
  running: 'players.nobody',
  starting: 'players.starting',
};

export function PlayersCard({
  server,
  canManage,
}: {
  server: ServerDetail;
  canManage: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const live = server.live;
  return (
    <Card className="p-5">
      <CardHeader>
        <CardTitle>{t('players.online')}</CardTitle>
        <span className="tabular text-[13px] text-muted-foreground">
          {live.playersOnline} / {live.playersMax}
        </span>
      </CardHeader>
      {live.players.length ? (
        <ul className="grid gap-1">
          {live.players.map((name) => (
            <li key={name} className="flex items-center gap-2.5 rounded-[8px] px-1 py-1.5">
              <PlayerHead name={name} className="size-[26px]" />
              <b className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t(EMPTY_TEXT[live.state] ?? 'players.serverOff')}</p>
      )}
      {canManage ? (
        <Link
          to="players"
          className="mt-3 inline-block text-[13px] font-semibold text-primary hover:underline"
        >
          {t('players.manage')}
        </Link>
      ) : null}
    </Card>
  );
}
