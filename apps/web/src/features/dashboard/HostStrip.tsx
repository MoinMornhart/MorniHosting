import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { HostInfo } from '@mornihosting/shared';
import { Card } from '@/components/ui/card';
import { Progress, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { formatGbFromMb, formatNumber } from '@/lib/format';

const REFRESH_MS = 10000;
const FULL = 100;

export const hostQuery = { queryKey: ['host'], queryFn: () => api<HostInfo>('/api/host') } as const;

function Cell({
  label,
  value,
  unit,
  percent,
}: {
  label: string;
  value: string;
  unit: string;
  percent: number | null;
}): ReactElement {
  return (
    <div className="grid content-start gap-1.5 px-5 py-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="tabular text-xl font-bold leading-tight">
        {value} <small className="text-[13px] font-medium text-muted-foreground">{unit}</small>
      </span>
      {percent !== null ? <Progress value={percent} /> : null}
    </div>
  );
}

export function HostStrip(): ReactElement {
  const { t } = useTranslation();
  const { data } = useQuery({ ...hostQuery, refetchInterval: REFRESH_MS });
  if (!data) return <Skeleton className="h-[106px] rounded-[16px]" />;
  const memPercent = data.memoryTotalMb ? (data.memoryUsedMb / data.memoryTotalMb) * FULL : null;
  const diskPercent =
    data.diskTotalGb && data.diskUsedGb !== null ? (data.diskUsedGb / data.diskTotalGb) * FULL : null;
  return (
    <Card className="grid grid-cols-2 divide-border overflow-hidden md:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))] md:divide-x [&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-t-0">
      <div className="grid content-start gap-1.5 px-5 py-4">
        <span className="text-[13px] text-muted-foreground">{t('dashboard.host')}</span>
        <span className="truncate text-xl font-bold leading-tight">{data.name}</span>
      </div>
      <Cell
        label={t('dashboard.cpu')}
        value={data.cpuPercent === null ? '–' : `${formatNumber(data.cpuPercent)} %`}
        unit={t('dashboard.ofCores', { count: data.cpuCores })}
        percent={data.cpuPercent}
      />
      <Cell
        label={t('dashboard.memory')}
        value={formatGbFromMb(data.memoryUsedMb)}
        unit={t('dashboard.ofTotal', { total: formatGbFromMb(data.memoryTotalMb) })}
        percent={memPercent}
      />
      <Cell
        label={t('dashboard.disk')}
        value={data.diskUsedGb === null ? '–' : formatNumber(data.diskUsedGb)}
        unit={
          data.diskTotalGb === null ? '' : t('dashboard.ofTotal', { total: formatNumber(data.diskTotalGb) })
        }
        percent={diskPercent}
      />
    </Card>
  );
}
