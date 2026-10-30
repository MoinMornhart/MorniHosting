import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  SOFTWARE,
  SWITCHABLE_SOFTWARE,
  type ServerDetail,
  type SoftwareId,
  type VersionOption,
} from '@mornihosting/shared';
import { EmptyState } from '@/components/page';
import { SoftwareLogo } from '@/components/software-logo';
import { TabIntro } from '@/components/tab-intro';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useServer } from '../ServerLayout';

function useVersions(software: SoftwareId): {
  list: readonly VersionOption[];
  latest: string;
  pending: boolean;
} {
  const { data, isPending } = useQuery({
    queryKey: ['versions', software],
    queryFn: () => api<VersionOption[]>(`/api/versions/${software}`),
  });
  const list = (data ?? []).filter((v) => v.stable);
  return { list, latest: list[0]?.id ?? '', pending: isPending };
}

/** Choose a version for one software and save it (switching the software if it is another one). */
function VersionPicker({
  server,
  software,
  onDone,
}: {
  server: ServerDetail;
  software: SoftwareId;
  onDone?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { list, latest, pending } = useVersions(software);
  const [picked, setPicked] = useState('');
  const switching = software !== server.software;
  const fallback = switching ? latest : server.version;
  const version = list.some((v) => v.id === picked) ? picked : fallback;
  const save = useMutation({
    mutationFn: () =>
      api<ServerDetail>(`/api/servers/${server.id}`, {
        method: 'PATCH',
        body: switching ? { software, version } : { version },
      }),
    onSuccess: async () => {
      toast.success(t('version.saved', { software: SOFTWARE[software].label, version }));
      await queryClient.invalidateQueries({ queryKey: ['server', server.id] });
      await queryClient.invalidateQueries({ queryKey: ['servers'] });
      onDone?.();
    },
    onError: (err) => toast.error(err instanceof ApiError ? t(`errors.${err.code}`) : t('errors.generic')),
  });
  if (pending) return <Skeleton className="h-10 w-72" />;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={version} onValueChange={setPicked}>
        <SelectTrigger className="w-56" aria-label={t('version.pick')}>
          <SelectValue placeholder={t('order.pickVersion')} />
        </SelectTrigger>
        <SelectContent>
          {list.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.id === latest ? `${v.id} · ${t('create.latest')}` : v.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={!version || save.isPending || (!switching && version === server.version)}
        onClick={() => save.mutate()}
      >
        {switching ? t('version.switch', { software: SOFTWARE[software].label }) : t('version.install')}
      </Button>
    </div>
  );
}

/** Which software and Minecraft version a server runs, and switching to another one, like at a hoster. */
export default function VersionTab(): ReactElement {
  const { t } = useTranslation();
  const { server, can } = useServer();
  const [target, setTarget] = useState<SoftwareId | null>(null);
  if (!can('config')) return <EmptyState title={t('server.noPermission')} />;
  const current = server.software;
  const switchable = SWITCHABLE_SOFTWARE.includes(current);
  const running = server.live.state !== 'stopped' && server.live.state !== 'crashed';
  const addOnsOn = server.geyser || server.voiceChat;
  const blocker = [running ? t('version.stopFirst') : '', addOnsOn ? t('version.addOnsOff') : ''].filter(
    Boolean,
  );
  return (
    <>
      <TabIntro title={t('version.title')} text={t('version.text')} />
      <section className="grid gap-4 rounded-[14px] border border-l-4 border-border border-l-primary bg-card p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <SoftwareLogo id={current} className="size-14" />
        <div className="grid gap-3">
          <div>
            <h3 className="text-[19px] font-semibold">
              {t('version.current', { software: SOFTWARE[current].label })}
            </h3>
            <p className="text-muted-foreground">{t('version.installed', { version: server.version })}</p>
          </div>
          <VersionPicker key={`${server.software}-${server.version}`} server={server} software={current} />
        </div>
      </section>
      {switchable ? (
        <section className="grid gap-3">
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t('version.available')}
            <span className="h-px flex-1 bg-border" />
          </div>
          {blocker.length ? (
            <p className="rounded-[12px] bg-warning-soft px-4 py-3 text-sm text-warning">
              {blocker.join(' ')}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('version.switchHint')}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SWITCHABLE_SOFTWARE.map((id) => {
              const isCurrent = id === current;
              const open = target === id && !isCurrent;
              return (
                <div
                  key={id}
                  className={cn(
                    'grid gap-3 rounded-[14px] border border-l-4 border-border border-l-border bg-card p-4',
                    isCurrent && 'border-l-primary',
                  )}
                >
                  <button
                    type="button"
                    disabled={isCurrent || blocker.length > 0}
                    onClick={() => setTarget(open ? null : id)}
                    style={{ color: 'inherit' }}
                    className="flex items-center gap-4 text-left disabled:cursor-default"
                  >
                    <SoftwareLogo id={id} className="size-12" />
                    <span className="grid min-w-0 gap-0.5">
                      <b className="flex items-center gap-2 text-[17px] font-semibold">
                        {SOFTWARE[id].label}
                        {isCurrent ? (
                          <Check className="size-4 text-primary" aria-label={t('version.running')} />
                        ) : null}
                      </b>
                      <span className="text-sm text-muted-foreground">{t(`create.software.${id}`)}</span>
                    </span>
                  </button>
                  {open ? (
                    <VersionPicker server={server} software={id} onDone={() => setTarget(null)} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
