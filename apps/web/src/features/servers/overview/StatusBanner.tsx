import { SquareTerminal } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ServerDetail } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

const TICK_MS = 30000;
const INDETERMINATE = 60;

const EMOJI: Readonly<Record<string, string>> = {
  running: '🎉',
  starting: '⏳',
  installing: '📦',
  stopping: '💾',
  stopped: '😴',
  crashed: '🩹',
};

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The friendly one-line answer to "what is my server doing?". */
export function StatusBanner({
  server,
  canConsole,
}: {
  server: ServerDetail;
  canConsole: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const now = useNow();
  const live = server.live;
  const state = live.state;
  const players = live.playersOnline
    ? t('banner.players', { count: live.playersOnline })
    : t('banner.playersNone');
  const sub: Readonly<Record<string, string>> = {
    running: t('banner.runningSub', {
      duration: live.startedAt ? formatDuration(now - Date.parse(live.startedAt)) : '–',
      players,
    }),
    starting: t('banner.startingSub'),
    installing: t('banner.startingSub'),
    stopping: t('banner.stoppingSub'),
    stopped: t('banner.stoppedSub'),
    crashed: t('banner.crashedSub'),
  };
  const busy = state === 'starting' || state === 'installing';
  return (
    <section
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-[16px] px-5 py-[18px]',
        state === 'crashed' ? 'bg-destructive-soft' : 'bg-accent',
      )}
      aria-live="polite"
    >
      <span className="text-[30px] leading-none" aria-hidden>
        {EMOJI[state]}
      </span>
      <div className="min-w-[200px] flex-1">
        <div className="text-xl font-bold leading-tight">
          {live.progress !== null && busy
            ? t('banner.installing')
            : t(`banner.${state === 'installing' ? 'starting' : state}`)}
        </div>
        <p className="mt-0.5 text-muted-foreground">{sub[state]}</p>
        {busy ? (
          <Progress
            value={live.progress ?? INDETERMINATE}
            tone="warning"
            className={cn('mt-3 max-w-md', live.progress === null && 'animate-pulse')}
          />
        ) : null}
      </div>
      {canConsole ? (
        <Button asChild variant="secondary">
          <Link to="console">
            <SquareTerminal />
            {t('actions.openConsole')}
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
