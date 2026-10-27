import { z } from 'zod';

export const SCHEDULE_ACTIONS = ['restart', 'backup', 'command', 'start', 'stop'] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

const FIVE = 5;
const TEN = 10;
const FIFTEEN = 15;
const TWENTY = 20;
const THIRTY = 30;
const TWO = 2;
const THREE = 3;
const FOUR = 4;
const SIX = 6;
const EIGHT = 8;
const TWELVE = 12;

/** Only divisors of 60 and 24, so "every N" means exactly that around the clock. */
export const INTERVAL_MINUTES: readonly number[] = [FIVE, TEN, FIFTEEN, TWENTY, THIRTY];
export const INTERVAL_HOURS: readonly number[] = [1, TWO, THREE, FOUR, SIX, EIGHT, TWELVE];

const LAST_WEEKDAY = 6;
const LAST_SAFE_MONTH_DAY = 28;

// 24-hour clock time "HH:MM": matches "04:00" and "23:59"; rejects "24:00", "4:00" and "12:60".
// https://regex101.com/?flavor=javascript&regex=%5E%28%5B01%5D%5Cd%7C2%5B0-3%5D%29%3A%5B0-5%5D%5Cd%24&flags=gm&testString=04%3A00%0A23%3A59%0A24%3A00%0A4%3A00%0A12%3A60
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timeSchema = z.string().regex(TIME_PATTERN, 'time');

export const scheduleSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interval'),
    unit: z.enum(['minutes', 'hours']),
    every: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('daily'), time: timeSchema }),
  z.object({
    kind: z.literal('weekly'),
    days: z.array(z.number().int().min(0).max(LAST_WEEKDAY)).min(1),
    time: timeSchema,
  }),
  z.object({
    kind: z.literal('monthly'),
    day: z.number().int().min(1).max(LAST_SAFE_MONTH_DAY),
    time: timeSchema,
  }),
]);
export type ScheduleSpec = z.infer<typeof scheduleSpecSchema>;

const INTERVAL_CHOICES: Readonly<Record<'minutes' | 'hours', readonly number[]>> = {
  minutes: INTERVAL_MINUTES,
  hours: INTERVAL_HOURS,
};

export function isValidInterval(unit: 'minutes' | 'hours', every: number): boolean {
  return INTERVAL_CHOICES[unit].includes(every);
}

function splitTime(time: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return { hour, minute };
}

type SpecOf<TKind extends ScheduleSpec['kind']> = Extract<ScheduleSpec, { kind: TKind }>;

const CRON_BY_KIND: Readonly<{ [TKind in ScheduleSpec['kind']]: (spec: SpecOf<TKind>) => string }> = {
  interval: (spec) => (spec.unit === 'minutes' ? `*/${spec.every} * * * *` : `0 */${spec.every} * * *`),
  daily: (spec) => {
    const { hour, minute } = splitTime(spec.time);
    return `${minute} ${hour} * * *`;
  },
  weekly: (spec) => {
    const { hour, minute } = splitTime(spec.time);
    const days = [...new Set(spec.days)].sort((a, b) => a - b).join(',');
    return `${minute} ${hour} * * ${days}`;
  },
  monthly: (spec) => {
    const { hour, minute } = splitTime(spec.time);
    return `${minute} ${hour} ${spec.day} * *`;
  },
};

/** Turns the friendly schedule from the UI into a 5-field cron expression. */
export function scheduleToCron(spec: ScheduleSpec): string {
  // The Record above maps each kind to the handler for exactly that variant, so the cast is safe.
  const toCron = CRON_BY_KIND[spec.kind] as (s: ScheduleSpec) => string;
  return toCron(spec);
}
