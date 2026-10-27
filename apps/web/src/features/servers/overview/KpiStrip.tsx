import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerDetail } from '@mornihosting/shared';
import { Sparkline } from '@/components/sparkline';
import { Card } from '@/components/ui/card';
import { formatGbFromMb, formatNumber } from '@/lib/format';
import { useLiveHistory } from '../live';

const FULL_PERCENT = 100;
const MAX_TPS = 20;
const TPS_GOOD = 19;
const TPS_OK = 15;
const ONE_DECIMAL = 1;

function Kpi({
  label,
  value,
  unit,
  chart,
}: {
  label: string;
  value: string;
  unit?: string;
  chart?: ReactNode;
}): ReactElement {
  return (
    <div className="grid content-start gap-1 px-5 py-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="tabular text-[22px] font-bold leading-tight">
        {value}{' '}
        {unit ? <small className="text-[13px] font-medium text-muted-foreground">{unit}</small> : null}
      </span>
      {chart}
    </div>
  );
}

export function KpiStrip({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const samples = useLiveHistory(server.id);
  const live = server.live;
  const running = live.state === 'running';
  const tps = live.tps;
  const tpsLabel =
    tps === null
      ? undefined
      : ([
          [TPS_GOOD, t('stats.tpsGood')],
          [TPS_OK, t('stats.tpsOk')],
        ]
          .find(([min]) => tps >= Number(min))?.[1]
          ?.toString() ?? t('stats.tpsBad'));
  return (
    <Card
      className="grid grid-cols-2 md:grid-cols-4 [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t md:[&>*+*]:border-l md:[&>*:nth-child(n+3)]:border-t-0"
      aria-label={t('stats.title')}
    >
      <Kpi
        label={t('stats.players')}
        value={running ? String(live.playersOnline) : '–'}
        unit={running ? `/ ${live.playersMax}` : undefined}
      />
      <Kpi
        label={t('stats.memory')}
        value={live.memoryMb === null ? '–' : formatGbFromMb(live.memoryMb)}
        unit={`/ ${formatGbFromMb(server.memoryMb)} GB`}
        chart={running ? <Sparkline values={samples.map((s) => s.mem)} max={server.memoryMb} /> : undefined}
      />
      <Kpi
        label={t('stats.cpu')}
        value={live.cpuPercent === null ? '–' : `${formatNumber(live.cpuPercent)} %`}
        chart={running ? <Sparkline values={samples.map((s) => s.cpu)} max={FULL_PERCENT} /> : undefined}
      />
      <Kpi
        label={t('stats.tps')}
        value={tps === null ? '–' : formatNumber(Math.min(MAX_TPS, tps), ONE_DECIMAL)}
        unit={tpsLabel}
      />
    </Card>
  );
}
