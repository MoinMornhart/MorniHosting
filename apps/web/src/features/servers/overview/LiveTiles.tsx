import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerDetail } from '@mornihosting/shared';
import { formatBytes, formatMemoryMb, formatNumber } from '@/lib/format';

const KIB = 1024;
const BYTES_PER_MB = KIB * KIB;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const PERCENT_DIGITS = 1;

/** "23h 15m 25s", or "2d 3h 4m" after a day, like a stopwatch. */
function stopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const days = Math.floor(total / SECONDS_PER_DAY);
  const hours = Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = total % SECONDS_PER_MINUTE;
  return days ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`;
}

/** The time since the start, ticking every second. */
function useUptime(startedAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), MS_PER_SECOND);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return startedAt ? stopwatch(now - Date.parse(startedAt)) : null;
}

function Tile({
  icon: Icon,
  label,
  value,
  of,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  of?: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-border bg-card px-4 py-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-secondary text-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-[14px] text-muted-foreground">{label}</span>
        <span className="tabular truncate text-[20px] font-bold leading-tight">
          {value}
          {of ? <small className="ml-1 text-[13px] font-semibold text-muted-foreground">/ {of}</small> : null}
        </span>
      </span>
    </div>
  );
}

/** Six tiles under the console: running time, CPU, memory, disk and network in and out. */
export function LiveTiles({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const live = server.live;
  const uptime = useUptime(live.startedAt);
  const none = '–';
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('stats.title')}>
      <Tile icon={Clock} label={t('stats.uptime')} value={uptime ?? none} />
      <Tile
        icon={Cpu}
        label={t('stats.cpu')}
        value={live.cpuPercent === null ? none : `${formatNumber(live.cpuPercent, PERCENT_DIGITS)} %`}
      />
      <Tile
        icon={MemoryStick}
        label={t('stats.memory')}
        value={live.memoryMb === null ? none : formatMemoryMb(live.memoryMb)}
        of={formatMemoryMb(server.memoryMb)}
      />
      <Tile
        icon={HardDrive}
        label={t('stats.disk')}
        value={live.diskMb == null ? none : formatBytes(live.diskMb * BYTES_PER_MB)}
      />
      <Tile
        icon={ArrowDownToLine}
        label={t('stats.netIn')}
        value={live.netRxBytes == null ? none : formatBytes(live.netRxBytes)}
      />
      <Tile
        icon={ArrowUpFromLine}
        label={t('stats.netOut')}
        value={live.netTxBytes == null ? none : formatBytes(live.netTxBytes)}
      />
    </div>
  );
}
