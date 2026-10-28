import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ScheduleEntry, ScheduleInput } from '@mornihosting/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useServer } from '../ServerLayout';
import { describeSpec } from './describe';
import { emptyInput, inputOf, ScheduleDialog } from './ScheduleDialog';

const DEFAULT_WARN = 5;
const BACKUP_HOURS = 6;

/** Ready-made schedules for the most common wishes: one click each. */
const PRESETS: readonly { key: string; input: Omit<ScheduleInput, 'name'> }[] = [
  {
    key: 'nightlyRestart',
    input: {
      action: 'restart',
      spec: { kind: 'daily', time: '04:00' },
      enabled: true,
      warnMinutes: DEFAULT_WARN,
    },
  },
  {
    key: 'backupEvery6h',
    input: {
      action: 'backup',
      spec: { kind: 'interval', unit: 'hours', every: BACKUP_HOURS },
      enabled: true,
      warnMinutes: 0,
    },
  },
  {
    key: 'nightlyBackup',
    input: { action: 'backup', spec: { kind: 'daily', time: '03:30' }, enabled: true, warnMinutes: 0 },
  },
];

export default function SchedulesTab(): ReactElement {
  const { t } = useTranslation();
  const { server, can } = useServer();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ entry: ScheduleEntry | null } | null>(null);
  const [deleting, setDeleting] = useState<ScheduleEntry | null>(null);
  const base = `/api/servers/${server.id}/schedules`;
  const key = ['schedules', server.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api<ScheduleEntry[]>(base) });
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: ({ input, id }: { input: ScheduleInput; id: number | null }) =>
      api<ScheduleEntry>(id ? `${base}/${id}` : base, { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: async (entry) => {
      toast.success(t('schedules.saved', { name: entry.name }));
      await refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api<ScheduleEntry>(`${base}/${id}`, { method: 'PATCH', body: { enabled } }),
    onSuccess: refresh,
  });
  const run = useMutation({
    mutationFn: (entry: ScheduleEntry) => api<ScheduleEntry>(`${base}/${entry.id}/run`, { method: 'POST' }),
    onSuccess: async (entry) => {
      if (entry.lastResult === 'ok') toast.success(t('schedules.ranOk', { name: entry.name }));
      else toast.error(t('schedules.ranFailed', { name: entry.name }));
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (entry: ScheduleEntry) => api(`${base}/${entry.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  // Built once per opened dialog, so a background refresh does not reset what the user typed.
  const initial = useMemo(() => (dialog?.entry ? inputOf(dialog.entry) : emptyInput()), [dialog]);

  if (!can('schedules')) return <EmptyState title={t('server.noPermission')} />;
  if (!data) return <Skeleton className="h-80 rounded-[16px]" />;

  const presets = (
    <div className="grid gap-2">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <Sparkles className="size-4 text-primary" aria-hidden />
        {t('schedules.presets')}
      </span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant="secondary"
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ input: { ...p.input, name: t(`schedules.preset.${p.key}`) }, id: null })
            }
          >
            <Plus />
            {t(`schedules.preset.${p.key}`)}
          </Button>
        ))}
      </div>
    </div>
  );

  const list = (): ReactElement => {
    if (!data.length) {
      return (
        <EmptyState
          icon={<CalendarClock />}
          title={t('schedules.emptyTitle')}
          text={t('schedules.emptyText')}
          action={
            <Button onClick={() => setDialog({ entry: null })}>
              <Plus />
              {t('schedules.new')}
            </Button>
          }
        />
      );
    }
    return (
      <Card className="divide-y divide-border overflow-hidden">
        {data.map((entry) => (
          <div
            key={entry.id}
            className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !entry.enabled && 'opacity-60')}
          >
            <span className="grid size-10 place-items-center rounded-[10px] bg-accent text-primary">
              <CalendarClock className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm font-semibold">{entry.name}</b>
              <p className="truncate text-[12px] text-muted-foreground">
                {t(`schedules.actions.${entry.action}`)} · {describeSpec(entry.spec, t)}
                {entry.command ? ` · /${entry.command}` : ''}
                {entry.warnMinutes ? ` · ${t('schedules.warnShort', { count: entry.warnMinutes })}` : ''}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted-foreground">
                {entry.nextRunAt ? (
                  <span title={formatDateTime(entry.nextRunAt)}>
                    {t('schedules.next', { when: formatRelative(entry.nextRunAt) })}
                  </span>
                ) : null}
                {entry.lastRunAt ? (
                  <span className="inline-flex items-center gap-1">
                    {entry.lastResult === 'failed' ? (
                      <CircleAlert className="size-3.5 text-destructive" aria-hidden />
                    ) : (
                      <CircleCheck className="size-3.5 text-success" aria-hidden />
                    )}
                    {t(entry.lastResult === 'failed' ? 'schedules.lastFailed' : 'schedules.last', {
                      when: formatRelative(entry.lastRunAt),
                    })}
                  </span>
                ) : null}
              </p>
            </div>
            <Switch
              checked={entry.enabled}
              aria-label={t('schedules.enabledFor', { name: entry.name })}
              onCheckedChange={(enabled) => toggle.mutate({ id: entry.id, enabled })}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('files.actionsFor', { name: entry.name })}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => run.mutate(entry)}>
                  <Play />
                  {t('schedules.runNow')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ entry })}>
                  <Pencil />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setDeleting(entry)}>
                  <Trash2 />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </Card>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setDialog({ entry: null })}>
          <Plus />
          {t('schedules.new')}
        </Button>
        <span className="text-[13px] text-muted-foreground">{t('schedules.timezoneNote')}</span>
      </div>
      {presets}
      {list()}
      <ScheduleDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        editing={Boolean(dialog?.entry)}
        initial={initial}
        onSubmit={async (input) => {
          await save.mutateAsync({ input, id: dialog?.entry?.id ?? null });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('schedules.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('schedules.deleteText')}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting);
        }}
      />
    </div>
  );
}
