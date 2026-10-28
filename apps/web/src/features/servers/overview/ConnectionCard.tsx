import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleHelp,
  CircleX,
  ExternalLink,
  Link2,
  RefreshCw,
  Mic,
  Smartphone,
  TriangleAlert,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  SOFTWARE,
  type ConnectionInfo,
  type ReachabilityResult,
  type ServerDetail,
} from '@mornihosting/shared';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

function withPort(host: string, port: number, defaultPort: number): string {
  return port === defaultPort ? host : `${host}:${port}`;
}

const REACH_STYLE = {
  reachable: { icon: CircleCheck, box: 'bg-success-soft', dot: 'bg-success text-background' },
  unreachable: { icon: CircleX, box: 'bg-warning-soft', dot: 'bg-warning text-background' },
  unknown: { icon: CircleHelp, box: 'bg-secondary', dot: 'bg-muted text-muted-foreground' },
} as const;

/** The IP card: the address to share, copy buttons, and whether friends can reach the server from outside. */
export function ConnectionCard({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [help, setHelp] = useState(false);
  const { data } = useQuery({
    queryKey: ['connection', server.id],
    queryFn: () => api<ConnectionInfo>(`/api/servers/${server.id}/connection`),
  });
  const check = useMutation({
    mutationFn: () =>
      api<ReachabilityResult>(`/api/servers/${server.id}/connection/check`, { method: 'POST' }),
    onSuccess: (result) =>
      queryClient.setQueryData<ConnectionInfo>(['connection', server.id], (prev) =>
        prev ? { ...prev, reachable: result } : prev,
      ),
  });
  if (!data) return <Skeleton className="h-[260px] rounded-[16px]" />;

  const defaultPort = SOFTWARE[server.software].defaultPort;
  const host = data.domain ?? data.publicIp ?? data.lanIp;
  // With a domain friends use the tunnel's port (NetBird, playit.gg) if one is set; via the IP the server port.
  const sharePort = data.domain ? data.sharePort : data.port;
  const shareAddress = host ? withPort(host, sharePort, defaultPort) : null;
  const voicePort = server.voicePublicPort ?? server.voicePort;
  const running = server.live.state === 'running';
  const reach = data.reachable;
  const status = reach?.status ?? 'unknown';
  const style = REACH_STYLE[status];
  const protocol = data.protocol.toUpperCase();
  const lan = data.lanIp ?? t('connection.lanUnknown');
  const reachText: Readonly<Record<typeof status, string>> = {
    reachable: t('connection.reachableText', { time: reach ? formatRelative(reach.checkedAt) : '' }),
    unreachable: t('connection.unreachableText', { protocol, port: data.port, lanIp: lan }),
    unknown: running ? t('connection.unknownText') : t('connection.notRunning'),
  };

  const idleCheckLabel = reach ? t('connection.recheck') : t('connection.check');
  const checkLabel = check.isPending ? t('connection.checking') : idleCheckLabel;

  const rows: readonly { label: string; value: string | null }[] = [
    { label: t('connection.publicIp'), value: data.publicIp ? `${data.publicIp}:${data.port}` : null },
    { label: t('connection.lanIp'), value: data.lanIp ? `${data.lanIp}:${data.port}` : null },
    { label: t('connection.port'), value: `${data.port} · ${protocol}` },
  ];

  return (
    <Card className="overflow-hidden" aria-labelledby="conn-title">
      <div className="grid gap-3 p-5">
        <span id="conn-title" className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Link2 className="size-4" />
          {t('connection.addressForFriends')}
        </span>
        {shareAddress ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="break-all font-mono text-[26px] font-semibold leading-tight tracking-[-0.01em]">
              {shareAddress}
            </span>
            <CopyButton
              text={shareAddress}
              variant="default"
              size="default"
              showLabel
              toastText={t('card.addressCopied')}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-semibold text-muted-foreground">
              {t('connection.noPublicAddress')}
            </span>
            <Button asChild variant="secondary" size="sm">
              <Link to="settings#s-domain">{t('connection.setAddress')}</Link>
            </Button>
          </div>
        )}
        {server.geyser && server.geyserPort && host ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-secondary px-3 py-2 text-[13px]">
            <Smartphone className="size-4 text-primary" aria-hidden />
            <span className="text-muted-foreground">{t('connection.bedrock')}</span>
            <span className="font-mono font-semibold">{host}</span>
            <span className="text-muted-foreground">{t('connection.bedrockPort')}</span>
            <span className="font-mono font-semibold">{server.geyserPort}</span>
            <CopyButton text={host} className="size-7" toastText={t('card.addressCopied')} />
          </div>
        ) : null}
        {server.voiceChat && voicePort ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-secondary px-3 py-2 text-[13px]">
            <Mic className="size-4 text-primary" aria-hidden />
            <span className="text-muted-foreground">{t('connection.voiceChat')}</span>
            <span className="font-mono font-semibold">{t('connection.voicePort', { port: voicePort })}</span>
          </div>
        ) : null}
      </div>
      <div className="grid border-t border-border sm:grid-cols-3 sm:divide-x [&>*+*]:border-t sm:[&>*+*]:border-t-0">
        {rows.map((row) => (
          <div key={row.label} className="grid min-w-0 gap-1 px-5 py-3.5">
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className="flex items-center gap-1.5 font-mono text-sm font-medium">
              <span className="min-w-0 break-all">{row.value ?? '–'}</span>
              {row.value && row.label !== t('connection.port') ? (
                <CopyButton text={row.value} className="size-7" />
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <div className={cn('flex flex-wrap items-center gap-3 px-5 py-3.5', style.box)}>
        <span className={cn('grid size-[30px] shrink-0 place-items-center rounded-full', style.dot)}>
          <style.icon className="size-4" />
        </span>
        <div className="min-w-[200px] flex-1 text-[13px]">
          <b className="block text-sm">{t(`connection.${status}`)}</b>
          <span className="text-muted-foreground">{reachText[status]}</span>
        </div>
        {running ? (
          <Button variant="ghost" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
            <RefreshCw className={cn(check.isPending && 'animate-spin')} />
            {checkLabel}
          </Button>
        ) : null}
        {status === 'unreachable' ? (
          <Button variant="ghost" size="sm" onClick={() => setHelp(true)}>
            <TriangleAlert />
            {t('connection.portForwardHelp')}
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <a
            href="https://playit.gg"
            target="_blank"
            rel="noreferrer noopener"
            title={t('connection.playitText')}
          >
            <ExternalLink />
            {t('connection.playit')}
          </a>
        </Button>
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>{t('connection.portForwardTitle')}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-foreground">
            {t('connection.portForwardSteps', { protocol, port: data.port, lanIp: lan })}
          </DialogDescription>
          <p className="text-sm text-muted-foreground">{t('connection.playitText')}</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
