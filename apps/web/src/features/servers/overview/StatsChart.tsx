import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StatsPoint } from '@mornihosting/shared';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatNumber, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const RANGES = ['1h', '24h', '7d'] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Readonly<Record<Range, string>> = {
  '1h': 'stats.lastHour',
  '24h': 'stats.last24h',
  '7d': 'stats.last7d',
};
const METRICS = ['cpu', 'mem', 'tps', 'players'] as const;
type Metric = (typeof METRICS)[number];
const METRIC_LABEL: Readonly<Record<Metric, string>> = {
  cpu: 'stats.cpu',
  mem: 'stats.memory',
  tps: 'stats.tps',
  players: 'stats.players',
};
const REFRESH_MS = 60000;
const CHART_HEIGHT = 200;
const MB_PER_GB = 1024;
const ONE_DECIMAL = 1;
const DECIMAL_METRICS: ReadonlySet<Metric> = new Set(['mem', 'tps']);
const DAY_RANGE: Range = '7d';
const AXIS_FONT = 11;
const TOOLTIP_FONT = 12;
const TOOLTIP_RADIUS = 10;
const CHART_MARGIN_TOP = 6;
const CHART_MARGIN_RIGHT = 6;
const CHART_MARGIN_LEFT = -18;
const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: AXIS_FONT };
const CHART_MARGIN = { top: CHART_MARGIN_TOP, right: CHART_MARGIN_RIGHT, bottom: 0, left: CHART_MARGIN_LEFT };
const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: TOOLTIP_RADIUS,
  fontSize: TOOLTIP_FONT,
};

/** History of one value over the chosen period, drawn as a single green area. */
export default function StatsChart({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>('1h');
  const [metric, setMetric] = useState<Metric>('cpu');
  const { data = [] } = useQuery({
    queryKey: ['stats', serverId, range],
    queryFn: () => api<StatsPoint[]>(`/api/servers/${serverId}/stats?range=${range}`),
    refetchInterval: REFRESH_MS,
  });
  const points = data.map((p) => ({
    t: p.t,
    value: metric === 'mem' && p.mem !== null ? p.mem / MB_PER_GB : p[metric],
  }));
  const unit: Readonly<Record<Metric, string>> = { cpu: '%', mem: 'GB', tps: '', players: '' };
  // Bedrock servers have no TPS command, so the button only shows when there are TPS values.
  const metrics = METRICS.filter((m) => m !== 'tps' || data.some((p) => p.tps !== null));
  const decimals = DECIMAL_METRICS.has(metric) ? ONE_DECIMAL : 0;
  const tickFormat = (iso: string): string =>
    range === DAY_RANGE ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }) : formatTime(iso);

  return (
    <Card className="p-5">
      <CardHeader className="flex-wrap">
        <CardTitle>{t('stats.title')}</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground',
                metric === m && 'bg-accent text-foreground',
              )}
            >
              {t(METRIC_LABEL[m])}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground',
                range === r && 'bg-accent text-foreground',
              )}
            >
              {t(RANGE_LABEL[r])}
            </button>
          ))}
        </div>
      </CardHeader>
      {points.length ? (
        <div style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id={`fill-${serverId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tickFormatter={tickFormat}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={48}
                allowDecimals={DECIMAL_METRICS.has(metric)}
                tickFormatter={(v: number) => formatNumber(v, decimals)}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(iso: string) => new Date(iso).toLocaleString()}
                formatter={(value: number) => [
                  `${formatNumber(value, decimals)} ${unit[metric]}`,
                  t(METRIC_LABEL[metric]),
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill={`url(#fill-${serverId})`}
                connectNulls
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('stats.noData')}</p>
      )}
    </Card>
  );
}
