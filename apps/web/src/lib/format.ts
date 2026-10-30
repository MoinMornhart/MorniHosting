import { isGameId, type SoftwareId } from '@mornihosting/shared';
import i18n from '@/i18n';

const KB = 1024;
const MB = KB * KB;
const GB = MB * KB;
const SECOND_MS = 1000;
const MINUTE_MS = SECOND_MS * 60; // eslint-disable-line ts-patterns/no-magic-numbers -- seconds per minute
const HOUR_MS = MINUTE_MS * 60; // eslint-disable-line ts-patterns/no-magic-numbers -- minutes per hour
const DAY_MS = HOUR_MS * 24; // eslint-disable-line ts-patterns/no-magic-numbers -- hours per day
const ONE_DECIMAL = 1;

function locale(): string {
  return i18n.language === 'en' ? 'en-GB' : 'de-DE';
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(locale(), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

/** 3,1 GB / 512 MB / 18 KB */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${formatNumber(bytes / GB, ONE_DECIMAL)} GB`;
  if (bytes >= MB) return `${formatNumber(bytes / MB, bytes >= (MB * KB) / 10 ? 0 : ONE_DECIMAL)} MB`; // eslint-disable-line ts-patterns/no-magic-numbers -- drop decimals from about 100 MB on
  if (bytes >= KB) return `${formatNumber(bytes / KB)} KB`;
  return `${formatNumber(bytes)} B`;
}

export function formatMemoryMb(mb: number): string {
  return mb >= KB ? `${formatNumber(mb / KB, ONE_DECIMAL)} GB` : `${formatNumber(mb)} MB`;
}

export function formatGbFromMb(mb: number): string {
  return formatNumber(mb / KB, ONE_DECIMAL);
}

/** "3 Std. 12 Min." / "3 h 12 min" */
export function formatDuration(ms: number): string {
  const t = i18n.t.bind(i18n);
  // The page clock ticks once a minute, so a server that just started can lie slightly in its future.
  const span = Math.max(0, ms);
  const days = Math.floor(span / DAY_MS);
  const hours = Math.floor((span % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((span % HOUR_MS) / MINUTE_MS);
  const parts = [
    days ? t('time.days', { count: days }) : '',
    hours ? t('time.hours', { count: hours }) : '',
    !days ? t('time.minutes', { count: minutes }) : '',
  ].filter(Boolean);
  return parts.join(' ');
}

const RELATIVE_STEPS: readonly (readonly [number, Intl.RelativeTimeFormatUnit])[] = [
  [DAY_MS, 'day'],
  [HOUR_MS, 'hour'],
  [MINUTE_MS, 'minute'],
];

/** "vor 2 Minuten" / "in 3 hours" */
export function formatRelative(iso: string): string {
  const diff = Date.parse(iso) - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const step = RELATIVE_STEPS.find(([size]) => Math.abs(diff) >= size);
  if (!step) return rtf.format(0, 'minute');
  return rtf.format(Math.round(diff / step[0]), step[1]);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(locale(), { timeStyle: 'short' }).format(new Date(iso));
}

/** "1,2 Mio." / "12K" */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Version as people read it: Minecraft "1.21.4" as is, other games' image choices translated ("Stabil"). */
export function versionLabel(software: SoftwareId, version: string): string {
  return isGameId(software) ? i18n.t(`games.versions.${version}`, { defaultValue: version }) : version;
}
