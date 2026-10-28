import type { TFunction } from 'i18next';
import type { ScheduleSpec } from '@mornihosting/shared';
import i18n from '@/i18n';

/** A Sunday, so day index 0..6 maps to Sunday..Saturday like cron. */
const SUNDAY = Date.UTC(2024, 0, 7); // eslint-disable-line ts-patterns/no-magic-numbers -- 7 January 2024 was a Sunday
const DAY_MS = 86_400_000;
/** Monday first, as people read a week. */
export const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0]; // eslint-disable-line ts-patterns/no-magic-numbers -- cron weekday numbers

export function weekdayName(day: number, width: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'de-DE', {
    weekday: width,
    timeZone: 'UTC',
  }).format(new Date(SUNDAY + day * DAY_MS));
}

const DESCRIBE: {
  readonly [K in ScheduleSpec['kind']]: (spec: Extract<ScheduleSpec, { kind: K }>, t: TFunction) => string;
} = {
  interval: (spec, t) => t(`schedules.every.${spec.unit}`, { count: spec.every }),
  daily: (spec, t) => t('schedules.dailyAt', { time: spec.time }),
  weekly: (spec, t) =>
    t('schedules.weeklyAt', {
      days: WEEK_ORDER.filter((d) => spec.days.includes(d))
        .map((d) => weekdayName(d))
        .join(', '),
      time: spec.time,
    }),
  monthly: (spec, t) => t('schedules.monthlyAt', { day: spec.day, time: spec.time }),
};

/** "Täglich um 04:00", "Alle 6 Stunden", "Mo, Mi, Fr um 20:00" */
export function describeSpec(spec: ScheduleSpec, t: TFunction): string {
  const describe = DESCRIBE[spec.kind] as (s: ScheduleSpec, tt: TFunction) => string;
  return describe(spec, t);
}
