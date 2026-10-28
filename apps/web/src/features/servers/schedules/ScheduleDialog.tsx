import { Archive, Play, RotateCw, Square, SquareTerminal, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  INTERVAL_HOURS,
  INTERVAL_MINUTES,
  SCHEDULE_ACTIONS,
  type ScheduleAction,
  type ScheduleEntry,
  type ScheduleInput,
  type ScheduleSpec,
} from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { describeSpec, WEEK_ORDER, weekdayName } from './describe';

const ACTION_ICONS: Readonly<Record<ScheduleAction, LucideIcon>> = {
  restart: RotateCw,
  backup: Archive,
  command: SquareTerminal,
  start: Play,
  stop: Square,
};
const KINDS: readonly ScheduleSpec['kind'][] = ['interval', 'daily', 'weekly', 'monthly'];
const WARN_CHOICES: readonly number[] = [0, 1, 5, 10, 15, 30]; // eslint-disable-line ts-patterns/no-magic-numbers -- minutes offered in the select
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1); // eslint-disable-line ts-patterns/no-magic-numbers -- every month has at least 28 days
const DEFAULT_TIME = '04:00';
const DEFAULT_HOURS = 6;
const DEFAULT_WARN = 5;
const WARNED: readonly ScheduleAction[] = ['restart', 'stop'];

/** Interval choices as one list: "every 5 minutes" … "every 12 hours". */
const INTERVALS: readonly { unit: 'minutes' | 'hours'; every: number }[] = [
  ...INTERVAL_MINUTES.map((every) => ({ unit: 'minutes' as const, every })),
  ...INTERVAL_HOURS.map((every) => ({ unit: 'hours' as const, every })),
];

const DEFAULT_SPECS: { readonly [K in ScheduleSpec['kind']]: Extract<ScheduleSpec, { kind: K }> } = {
  interval: { kind: 'interval', unit: 'hours', every: DEFAULT_HOURS },
  daily: { kind: 'daily', time: DEFAULT_TIME },
  weekly: { kind: 'weekly', days: [1, 3, 5], time: DEFAULT_TIME }, // eslint-disable-line ts-patterns/no-magic-numbers -- Monday, Wednesday, Friday
  monthly: { kind: 'monthly', day: 1, time: DEFAULT_TIME },
};

export function emptyInput(): ScheduleInput {
  return { name: '', action: 'restart', spec: DEFAULT_SPECS.daily, enabled: true, warnMinutes: DEFAULT_WARN };
}

export function inputOf(entry: ScheduleEntry): ScheduleInput {
  return {
    name: entry.name,
    action: entry.action,
    command: entry.command ?? undefined,
    spec: entry.spec,
    enabled: entry.enabled,
    warnMinutes: entry.warnMinutes,
  };
}

function timeOf(spec: ScheduleSpec): string {
  return 'time' in spec ? spec.time : DEFAULT_TIME;
}

/** The schedule form: what should happen, and when – in plain words, no cron. */
export function ScheduleDialog({
  open,
  onOpenChange,
  initial,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ScheduleInput;
  editing: boolean;
  onSubmit: (input: ScheduleInput) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const [input, setInput] = useState<ScheduleInput>(initial);
  const [nameTouched, setNameTouched] = useState(editing);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setInput(initial);
    setNameTouched(editing);
  }, [open, initial, editing]);

  const autoName = `${t(`schedules.actions.${input.action}`)} · ${describeSpec(input.spec, t)}`;
  const name = nameTouched ? input.name : autoName;
  const set = (patch: Partial<ScheduleInput>): void => setInput((prev) => ({ ...prev, ...patch }));
  const setKind = (kind: ScheduleSpec['kind']): void => {
    const next = DEFAULT_SPECS[kind];
    set({ spec: 'time' in next ? { ...next, time: timeOf(input.spec) } : next });
  };
  const setTime = (time: string): void => {
    if ('time' in input.spec && time) set({ spec: { ...input.spec, time } });
  };
  const spec = input.spec;
  const valid =
    Boolean(name.trim()) &&
    (input.action !== 'command' || Boolean(input.command?.trim())) &&
    (spec.kind !== 'weekly' || spec.days.length > 0);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await onSubmit({
        ...input,
        name: name.trim(),
        warnMinutes: WARNED.includes(input.action) ? input.warnMinutes : 0,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogTitle>{editing ? t('schedules.editTitle') : t('schedules.newTitle')}</DialogTitle>
        <DialogDescription>{t('schedules.dialogText')}</DialogDescription>
        <form onSubmit={(e) => void submit(e)} className="grid gap-5">
          <div className="grid gap-2">
            <Label>{t('schedules.what')}</Label>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
              role="radiogroup"
              aria-label={t('schedules.what')}
            >
              {SCHEDULE_ACTIONS.map((action) => {
                const Icon = ACTION_ICONS[action];
                return (
                  <button
                    key={action}
                    type="button"
                    role="radio"
                    aria-checked={input.action === action}
                    onClick={() => set({ action })}
                    className={cn(
                      'grid justify-items-center gap-1.5 rounded-[12px] border px-2 py-3 text-[13px] font-semibold transition-colors',
                      input.action === action
                        ? 'border-primary bg-accent'
                        : 'border-input hover:bg-secondary',
                    )}
                  >
                    <Icon className="size-5 text-primary" aria-hidden />
                    {t(`schedules.actions.${action}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {input.action === 'command' ? (
            <Field id="schedule-command" label={t('schedules.command')} hint={t('schedules.commandHint')}>
              <Input
                id="schedule-command"
                value={input.command ?? ''}
                onChange={(e) => set({ command: e.target.value.replace(/^\//, '') })} // eslint-disable-line ts-patterns/require-regex-example -- drops a typed leading slash: "/say hi" → "say hi"
                placeholder="say Denkt an die Abstimmung!"
                className="font-mono"
              />
            </Field>
          ) : null}

          <div className="grid gap-2">
            <Label>{t('schedules.when')}</Label>
            <div
              className="inline-flex flex-wrap gap-1 rounded-[12px] border border-border bg-secondary p-1"
              role="radiogroup"
              aria-label={t('schedules.when')}
            >
              {KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={spec.kind === kind}
                  onClick={() => setKind(kind)}
                  className={cn(
                    'rounded-[9px] px-3 py-1.5 text-sm font-semibold text-muted-foreground',
                    spec.kind === kind && 'bg-card text-foreground shadow-card',
                  )}
                >
                  {t(`schedules.kinds.${kind}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {spec.kind === 'interval' ? (
                <Select
                  value={`${spec.unit}:${spec.every}`}
                  onValueChange={(v) => {
                    const [unit, every] = v.split(':');
                    set({
                      spec: {
                        kind: 'interval',
                        unit: unit === 'minutes' ? 'minutes' : 'hours',
                        every: Number(every),
                      },
                    });
                  }}
                >
                  <SelectTrigger className="w-56" aria-label={t('schedules.kinds.interval')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((i) => (
                      <SelectItem key={`${i.unit}:${i.every}`} value={`${i.unit}:${i.every}`}>
                        {t(`schedules.every.${i.unit}`, { count: i.every })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {spec.kind === 'weekly' ? (
                <div className="flex flex-wrap gap-1" role="group" aria-label={t('schedules.days')}>
                  {WEEK_ORDER.map((day) => {
                    const on = spec.days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set({
                            spec: {
                              ...spec,
                              days: on ? spec.days.filter((d) => d !== day) : [...spec.days, day],
                            },
                          })
                        }
                        className={cn(
                          'size-10 rounded-[10px] border text-[13px] font-semibold',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-secondary',
                        )}
                      >
                        {weekdayName(day)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {spec.kind === 'monthly' ? (
                <Select
                  value={String(spec.day)}
                  onValueChange={(v) => set({ spec: { ...spec, day: Number(v) } })}
                >
                  <SelectTrigger className="w-40" aria-label={t('schedules.dayOfMonth')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {t('schedules.dayN', { day: d })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {'time' in spec ? (
                <label className="grid gap-1 text-[13px] text-muted-foreground">
                  {t('schedules.time')}
                  <Input
                    type="time"
                    value={spec.time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-32"
                  />
                </label>
              ) : null}
            </div>
          </div>

          {WARNED.includes(input.action) ? (
            <label className="grid gap-2 text-sm font-semibold">
              {t('schedules.warn')}
              <Select
                value={String(input.warnMinutes)}
                onValueChange={(v) => set({ warnMinutes: Number(v) })}
              >
                <SelectTrigger className="sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WARN_CHOICES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m ? t('schedules.warnN', { count: m }) : t('schedules.warnNone')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          <Field id="schedule-name" label={t('common.name')}>
            <Input
              id="schedule-name"
              value={name}
              maxLength={40}
              onChange={(e) => {
                setNameTouched(true);
                set({ name: e.target.value });
              }}
            />
          </Field>

          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || busy}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
