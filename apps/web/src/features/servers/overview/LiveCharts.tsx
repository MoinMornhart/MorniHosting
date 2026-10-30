import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, YAxis } from 'recharts';
import type { ServerDetail } from '@mornihosting/shared';
import { formatBytes } from '@/lib/format';
import { useLiveHistory, type LiveSample } from '../live';

const CHART_HEIGHT = 170;
const FULL_PERCENT = 100;
const MB_PER_GB = 1024;
const AXIS_FONT = 11;
const AXIS_WIDTH = 52;
const LINE_WIDTH = 2;
const FILL_OPACITY = 0.35;
const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: AXIS_FONT };
const EDGE = 8;
const MARGIN = { top: EDGE, right: EDGE, bottom: 0, left: 0 };
const IN_COLOUR = '#eab308';
const OUT_COLOUR = '#22c55e';
const CPU_COLOUR = '#3b82f6';
const MEM_COLOUR = '#6366f1';

/** Bytes moved between two samples (the counters only grow; a restart starts them at 0 again). */
function delta(now: number | null, before: number | null): number {
  return now !== null && before !== null && now >= before ? now - before : 0;
}

function traffic(samples: readonly LiveSample[]): { rx: number; tx: number }[] {
  return samples.map((s, i) => ({
    rx: delta(s.rx, samples[i - 1]?.rx ?? s.rx),
    tx: delta(s.tx, samples[i - 1]?.tx ?? s.tx),
  }));
}

function ChartCard({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="grid gap-2 rounded-[14px] border border-border bg-card px-4 pb-3 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[16px] font-semibold">{title}</h3>
        {legend}
      </div>
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Dot({ colour, label }: { colour: string; label: string }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className="size-2.5 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}

/** CPU, memory and network of the last few minutes, as hosters show them under the console. */
export default function LiveCharts({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const samples = useLiveHistory(server.id);
  const cpu = samples.map((s) => ({ v: s.cpu }));
  const mem = samples.map((s) => ({ v: s.mem / MB_PER_GB }));
  const net = traffic(samples);
  const memMax = server.memoryMb / MB_PER_GB;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ChartCard title={t('stats.cpu')}>
        <AreaChart data={cpu} margin={MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <YAxis
            domain={[0, FULL_PERCENT]}
            tick={AXIS_TICK}
            width={AXIS_WIDTH}
            tickFormatter={(v: number) => `${v} %`}
            axisLine={false}
            tickLine={false}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={CPU_COLOUR}
            strokeWidth={LINE_WIDTH}
            fill={CPU_COLOUR}
            fillOpacity={FILL_OPACITY}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartCard>
      <ChartCard title={t('stats.memory')}>
        <AreaChart data={mem} margin={MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <YAxis
            domain={[0, memMax]}
            tick={AXIS_TICK}
            width={AXIS_WIDTH}
            tickFormatter={(v: number) => `${v.toFixed(1)} GB`}
            axisLine={false}
            tickLine={false}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={MEM_COLOUR}
            strokeWidth={LINE_WIDTH}
            fill={MEM_COLOUR}
            fillOpacity={FILL_OPACITY}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartCard>
      <ChartCard
        title={t('stats.network')}
        legend={
          <span className="flex gap-3">
            <Dot colour={IN_COLOUR} label={t('stats.netInShort')} />
            <Dot colour={OUT_COLOUR} label={t('stats.netOutShort')} />
          </span>
        }
      >
        <AreaChart data={net} margin={MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <YAxis
            tick={AXIS_TICK}
            width={AXIS_WIDTH}
            tickFormatter={(v: number) => formatBytes(v)}
            axisLine={false}
            tickLine={false}
          />
          <Area
            type="monotone"
            dataKey="tx"
            stroke={OUT_COLOUR}
            strokeWidth={LINE_WIDTH}
            fill={OUT_COLOUR}
            fillOpacity={FILL_OPACITY}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="rx"
            stroke={IN_COLOUR}
            strokeWidth={LINE_WIDTH}
            fill={IN_COLOUR}
            fillOpacity={FILL_OPACITY}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartCard>
    </div>
  );
}
