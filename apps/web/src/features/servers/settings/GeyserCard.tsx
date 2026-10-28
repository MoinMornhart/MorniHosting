import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCw, Smartphone } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ServerDetail, SoftwareId } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useServerAction } from '@/features/dashboard/ServerCard';

/** Server software that Geyser and Floodgate exist for. */
export const GEYSER_SOFTWARE: readonly SoftwareId[] = [
  'paper',
  'purpur',
  'custom',
  'velocity',
  'fabric',
  'neoforge',
];

interface GeyserResult {
  readonly enabled: boolean;
  readonly port: number | null;
  readonly restartRequired: boolean;
}

/** One switch so friends on phones, consoles and Windows (Bedrock) can join a Java server. */
export function GeyserCard({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const restart = useServerAction(server.id);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api<GeyserResult>(`/api/servers/${server.id}/geyser`, { method: 'PUT', body: { enabled } }),
    onSuccess: async (result) => {
      toast.success(result.enabled ? t('geyser.enabled', { port: result.port }) : t('geyser.disabled'));
      setRestartNeeded(result.restartRequired);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['server', server.id] }),
        queryClient.invalidateQueries({ queryKey: ['content', server.id] }),
      ]);
    },
  });
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader className="mb-1">
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-4 text-primary" aria-hidden />
          {t('geyser.title')}
        </CardTitle>
        <Switch
          checked={server.geyser}
          disabled={toggle.isPending}
          aria-label={t('geyser.title')}
          onCheckedChange={(on) => toggle.mutate(on)}
        />
      </CardHeader>
      <CardDescription>{t('geyser.text')}</CardDescription>
      {toggle.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('geyser.installing')}</p>
      ) : null}
      {server.geyser && server.geyserPort ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Pill tone="ok">{t('geyser.on')}</Pill>
          <span className="text-muted-foreground">{t('geyser.portInfo', { port: server.geyserPort })}</span>
        </div>
      ) : null}
      {restartNeeded && server.live.state === 'running' ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[12px] bg-warning-soft px-3 py-2 text-sm text-warning">
          <span className="flex-1">{t('settings.restartToApply')}</span>
          <Button
            size="sm"
            disabled={restart.isPending}
            onClick={() => {
              restart.mutate('restart');
              setRestartNeeded(false);
            }}
          >
            <RotateCw />
            {t('actions.restart')}
          </Button>
        </div>
      ) : null}
      <p className="mt-4 text-[13px] text-muted-foreground">{t('geyser.routerHint')}</p>
    </Card>
  );
}
