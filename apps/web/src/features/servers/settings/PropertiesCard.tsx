import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCode2, Lock, RotateCw, Save, TriangleAlert } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  MANAGED_PROPERTY_KEYS,
  PROPERTY_GROUPS,
  propertyFieldsFor,
  type PropertyField,
  type ServerDetail,
} from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton, Tip } from '@/components/ui/misc';
import { Tag } from '@/components/ui/pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useServerAction } from '@/features/dashboard/ServerCard';
import { MotdEditor, MotdPreview } from './MotdEditor';

interface PropertiesResponse {
  readonly values: Record<string, string>;
  readonly running: boolean;
}

/** Shown in the worlds card instead, so the active world is changed in one place. */
const HIDDEN_KEYS: readonly string[] = ['level-name'];

function Control({
  field,
  value,
  onChange,
  server,
}: {
  field: PropertyField;
  value: string;
  onChange: (value: string) => void;
  server: ServerDetail;
}): ReactElement {
  const { t } = useTranslation();
  const id = `prop-${field.key}`;
  const controls: Readonly<Record<PropertyField['type'], () => ReactElement>> = {
    bool: () => <Switch id={id} checked={value === 'true'} onCheckedChange={(on) => onChange(String(on))} />,
    enum: () => (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((option) => (
            <SelectItem key={option} value={option}>
              {t(`props.${field.key}.options.${option}`, { defaultValue: option })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    int: () => (
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={field.min}
        max={field.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular sm:w-40"
      />
    ),
    string: () => (
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="sm:w-72" />
    ),
    motd: () => (
      <MotdEditor
        id={id}
        value={value}
        onChange={onChange}
        preview={
          <MotdPreview
            motd={value}
            name={server.name}
            serverId={server.id}
            software={server.software}
            hasIcon={server.hasIcon}
            players={`${server.live.playersOnline}/${server.live.playersMax || '20'}`}
          />
        }
      />
    ),
  };
  return controls[field.type]();
}

function invalid(field: PropertyField, value: string): boolean {
  if (field.type !== 'int') return false;
  const n = Number(value);
  return (
    !value.trim() ||
    !Number.isInteger(n) ||
    (field.min !== undefined && n < field.min) ||
    (field.max !== undefined && n > field.max)
  );
}

/** server.properties as a form: grouped, each setting explained in plain words. */
export function PropertiesCard({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const restart = useServerAction(server.id);
  const [draft, setDraft] = useState<Readonly<Record<string, string>>>({});
  const [saved, setSaved] = useState(false);
  const key = ['properties', server.id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api<PropertiesResponse>(`/api/servers/${server.id}/properties`),
  });
  const save = useMutation({
    mutationFn: (values: Readonly<Record<string, string>>) =>
      api<PropertiesResponse & { restartRequired: boolean }>(`/api/servers/${server.id}/properties`, {
        method: 'PUT',
        body: { values },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData<PropertiesResponse>(key, { values: result.values, running: result.running });
      setDraft({});
      setSaved(result.restartRequired);
      toast.success(t('common.saved'));
    },
  });

  if (!data) return <Skeleton className="h-[480px] rounded-[16px]" />;
  const fields = propertyFieldsFor(server.edition).filter((f) => !HIDDEN_KEYS.includes(f.key));
  const valueOf = (field: PropertyField): string =>
    draft[field.key] ?? data.values[field.key] ?? field.defaultValue;
  const changes = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== (data.values[k] ?? '')));
  const hasErrors = fields.some((f) => invalid(f, valueOf(f)));
  const managed = MANAGED_PROPERTY_KEYS.filter((k) => data.values[k] !== undefined);
  const changeCount = Object.keys(changes).length;
  const needsRestart = saved && server.live.state === 'running';
  const statusText = [
    { when: changeCount > 0, text: () => t('settings.properties.changes', { count: changeCount }) },
    { when: needsRestart, text: () => t('settings.restartToApply') },
    { when: true, text: () => t('settings.properties.noChanges') },
  ]
    .find((s) => s.when)
    ?.text();

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader className="mb-1 flex-wrap">
        <CardTitle>{t('settings.properties.title')}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="../files?edit=server.properties">
            <FileCode2 />
            {t('settings.properties.openFile')}
          </Link>
        </Button>
      </CardHeader>
      <CardDescription className="mb-5">{t('settings.properties.text')}</CardDescription>

      <div className="grid grid-cols-1 gap-7">
        {PROPERTY_GROUPS.map((group) => {
          const inGroup = fields.filter((f) => f.group === group);
          if (!inGroup.length) return null;
          return (
            <section key={group} aria-labelledby={`group-${group}`} className="grid grid-cols-1 gap-1">
              <h4
                id={`group-${group}`}
                className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                {t(`settings.properties.groups.${group}`)}
              </h4>
              {inGroup.map((field) => {
                const value = valueOf(field);
                const changed =
                  draft[field.key] !== undefined && draft[field.key] !== (data.values[field.key] ?? '');
                const wide = field.type === 'motd';
                return (
                  <div
                    key={field.key}
                    className={cn(
                      'grid grid-cols-1 gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-secondary/50',
                      wide ? '' : 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
                      changed && 'bg-accent/40',
                    )}
                  >
                    <div className="min-w-0">
                      <Label htmlFor={`prop-${field.key}`} className="flex flex-wrap items-center gap-2">
                        {t(`props.${field.key}.label`)}
                        <code className="font-mono text-[11px] font-normal text-muted-foreground">
                          {field.key}
                        </code>
                        {field.caution ? (
                          <Tip content={t(`props.${field.key}.caution`)}>
                            <TriangleAlert
                              className="size-3.5 text-warning"
                              aria-label={t('settings.properties.caution')}
                            />
                          </Tip>
                        ) : null}
                      </Label>
                      <p className="mt-1 text-[13px] text-muted-foreground">{t(`props.${field.key}.hint`)}</p>
                      {invalid(field, value) ? (
                        <p className="mt-1 text-[13px] text-destructive" role="alert">
                          {t('settings.properties.range', { min: field.min, max: field.max })}
                        </p>
                      ) : null}
                    </div>
                    <Control
                      field={field}
                      value={value}
                      server={server}
                      onChange={(next) => setDraft((d) => ({ ...d, [field.key]: next }))}
                    />
                  </div>
                );
              })}
            </section>
          );
        })}
        {managed.length ? (
          <section className="grid gap-2">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              {t('settings.properties.managed')}
            </h4>
            <p className="text-[13px] text-muted-foreground">{t('settings.properties.managedText')}</p>
            <div className="flex flex-wrap gap-1.5">
              {managed.map((k) => (
                <Tag key={k}>
                  <Lock className="size-3" aria-hidden />
                  {k}={k.includes('password') ? '••••••' : data.values[k]}
                </Tag>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="sticky bottom-3 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-popover/95 p-3 shadow-float backdrop-blur">
        <p className="text-sm text-muted-foreground">{statusText}</p>
        <div className="flex gap-2">
          {needsRestart && !changeCount ? (
            <Button
              variant="secondary"
              disabled={restart.isPending}
              onClick={() => {
                restart.mutate('restart');
                setSaved(false);
              }}
            >
              <RotateCw />
              {t('actions.restart')}
            </Button>
          ) : null}
          {changeCount ? (
            <Button variant="ghost" onClick={() => setDraft({})}>
              {t('common.cancel')}
            </Button>
          ) : null}
          <Button disabled={!changeCount || hasErrors || save.isPending} onClick={() => save.mutate(changes)}>
            <Save />
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
