import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Link2, Network, PlugZap, Save, Unplug } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NETBIRD_DEFAULT_API, type NetbirdDiscovery, type NetbirdStatus } from '@mornihosting/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Pill } from '@/components/ui/pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { errorText } from '@/lib/query';
import { NetbirdNameInput } from '@/features/netbird/NetbirdNameInput';
import { netbirdStatusQuery } from '@/features/netbird/netbird';

const PANEL_NAME = 'panel';
const DEFAULT_PANEL_PORT = 8080;

/** First choice: the domain already in use, else a confirmed own domain, else whatever NetBird has. */
function preferredDomain(found: NetbirdDiscovery, current: string | null): string {
  const confirmed = found.domains.filter((d) => d.validated);
  const own = confirmed.find((d) => d.custom) ?? confirmed[0] ?? found.domains[0];
  return current ?? own?.domain ?? '';
}

function ConnectForm({
  status,
  onDone,
  onCancel,
}: {
  status: NetbirdStatus;
  onDone: (next: NetbirdStatus) => void;
  onCancel: (() => void) | null;
}): ReactElement {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [apiUrl, setApiUrl] = useState(status.apiUrl);
  const [domain, setDomain] = useState('');
  const [peerId, setPeerId] = useState('');
  const body = { apiUrl: apiUrl.trim(), ...(token.trim() ? { token: token.trim() } : {}) };
  const discover = useMutation({
    mutationFn: () => api<NetbirdDiscovery>('/api/netbird/discover', { method: 'POST', body }),
    onSuccess: (found) => {
      setDomain(preferredDomain(found, status.domain));
      setPeerId(status.peerId ?? found.suggestedPeerId ?? found.peers[0]?.id ?? '');
    },
  });
  const save = useMutation({
    mutationFn: () =>
      api<NetbirdStatus>('/api/netbird', { method: 'PUT', body: { ...body, domain, peerId } }),
    onSuccess: (next) => {
      toast.success(t('netbirdAuto.connected'));
      onDone(next);
    },
  });
  const found = discover.data;
  const error = save.error ?? discover.error;

  return (
    <div className="grid gap-4">
      <Field
        id="nb-token"
        label={t('netbirdAuto.tokenLabel')}
        hint={status.configured ? t('netbirdAuto.tokenKeep') : t('netbirdAuto.tokenHint')}
      >
        <Input
          id="nb-token"
          type="password"
          autoComplete="off"
          value={token}
          placeholder={status.configured ? '••••••••' : 'nbp_…'}
          onChange={(e) => setToken(e.target.value)}
        />
      </Field>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-muted-foreground">
          {t('netbirdAuto.ownServer')}
        </summary>
        <div className="mt-3">
          <Field id="nb-api" label={t('netbirdAuto.apiUrl')} hint={t('netbirdAuto.apiUrlHint')}>
            <Input
              id="nb-api"
              value={apiUrl}
              placeholder={NETBIRD_DEFAULT_API}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </Field>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={found ? 'secondary' : 'default'}
          disabled={discover.isPending || (!token.trim() && !status.configured)}
          onClick={() => discover.mutate()}
        >
          <PlugZap />
          {discover.isPending ? t('netbirdAuto.connecting') : t('netbirdAuto.connect')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
      {found && !found.domains.length ? (
        <p className="rounded-[12px] bg-warning-soft px-3 py-2.5 text-sm text-warning">
          {t('netbirdAuto.noDomains')}
        </p>
      ) : null}
      {found?.domains.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            {t('netbirdAuto.domain')}
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {found.domains.map((d) => (
                  <SelectItem key={d.domain} value={d.domain} disabled={!d.validated}>
                    {d.validated ? d.domain : `${d.domain} ${t('netbirdAuto.domainPending')}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[13px] font-normal text-muted-foreground">
              {t('netbirdAuto.domainHint')}
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            {t('netbirdAuto.machine')}
            <Select value={peerId} onValueChange={setPeerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {found.peers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.ip} · {p.connected ? t('netbirdAuto.online') : t('netbirdAuto.offline')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[13px] font-normal text-muted-foreground">
              {t('netbirdAuto.machineHint')}
            </span>
          </label>
          <div className="flex justify-end sm:col-span-2">
            <Button
              type="button"
              disabled={save.isPending || !domain || !peerId}
              onClick={() => save.mutate()}
            >
              <Save />
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">{errorText(error)}</p>
      ) : null}
    </div>
  );
}

function PanelAddress({
  status,
  domain,
  panelDomain,
}: {
  status: NetbirdStatus;
  domain: string;
  panelDomain: string;
}): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // The address the panel already has (e.g. hosting.moinmornhart.de) gives the name, otherwise "panel".
  const known = status.panelAddress ?? (panelDomain.endsWith(`.${domain}`) ? panelDomain : null);
  const [name, setName] = useState(known?.slice(0, -(domain.length + 1)) ?? PANEL_NAME);
  const [port, setPort] = useState(String(Number(window.location.port) || DEFAULT_PANEL_PORT));
  const setup = useMutation({
    mutationFn: () =>
      api<NetbirdStatus>('/api/netbird/panel', {
        method: 'POST',
        body: { name: name.trim(), port: Number(port) },
      }),
    onSuccess: async (next) => {
      toast.success(t('netbirdAuto.panelDone', { address: next.panelAddress }));
      queryClient.setQueryData(netbirdStatusQuery.queryKey, next);
      await queryClient.invalidateQueries({ queryKey: ['panel-settings'] });
    },
  });
  return (
    <div className="grid gap-3 rounded-[12px] border border-border p-3 sm:p-4">
      <b className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4 text-primary" aria-hidden />
        {t('netbirdAuto.panelTitle')}
      </b>
      <p className="text-[13px] text-muted-foreground">{t('netbirdAuto.panelText')}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
        <Field id="nb-panel" label={t('netbirdAuto.panelName')}>
          <NetbirdNameInput
            id="nb-panel"
            value={name}
            domain={domain}
            onChange={setName}
            onEnter={() => setup.mutate()}
          />
        </Field>
        <Field id="nb-panel-port" label={t('netbirdAuto.panelPort')}>
          <Input
            id="nb-panel-port"
            inputMode="numeric"
            value={port}
            onChange={(e) => setPort(e.target.value.trim())}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          disabled={setup.isPending || !name.trim()}
          onClick={() => setup.mutate()}
        >
          <Save />
          {t('netbirdAuto.panelButton')}
        </Button>
      </div>
      {status.panelAddress ? (
        <a
          href={`https://${status.panelAddress}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden />
          https://{status.panelAddress}
        </a>
      ) : null}
      {setup.error ? (
        <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">{errorText(setup.error)}</p>
      ) : null}
    </div>
  );
}

/** Admin area: connect NetBird once, then every server only needs a name to get its address. */
export function NetbirdAutomationCard({ panelDomain }: { panelDomain: string }): ReactElement | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: status } = useQuery(netbirdStatusQuery);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const disconnect = useMutation({
    mutationFn: () => api<NetbirdStatus>('/api/netbird', { method: 'DELETE' }),
    onSuccess: async (next) => {
      toast.success(t('netbirdAuto.disconnected'));
      queryClient.setQueryData(netbirdStatusQuery.queryKey, next);
      await queryClient.invalidateQueries({ queryKey: ['server'] });
    },
  });
  if (!status) return null;
  const done = async (next: NetbirdStatus): Promise<void> => {
    queryClient.setQueryData(netbirdStatusQuery.queryKey, next);
    setEditing(false);
    await queryClient.invalidateQueries({ queryKey: ['server'] });
  };
  const domain = status.domain ?? '';

  return (
    <Card id="netbird" className="grid scroll-mt-4 gap-4 p-5 sm:p-6">
      <CardHeader className="mb-0">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Network className="size-4 text-primary" aria-hidden />
          {t('netbirdAuto.title')}
          {status.configured ? (
            <Pill tone="ok">{t('netbirdAuto.connectedPill')}</Pill>
          ) : (
            <Pill>{t('netbirdAuto.notConnected')}</Pill>
          )}
        </CardTitle>
      </CardHeader>
      <CardDescription>{t('netbirdAuto.text')}</CardDescription>
      {status.configured && !editing ? (
        <>
          <p className="rounded-[12px] bg-secondary px-3 py-2.5 text-sm">
            <Trans
              i18nKey="netbirdAuto.summary"
              values={{ domain, machine: status.peerName }}
              components={{ b: <b className="font-mono font-semibold" /> }}
            />
          </p>
          <p className="text-[13px] text-muted-foreground">{t('netbirdAuto.portNote', { domain })}</p>
          <PanelAddress status={status} domain={domain} panelDomain={panelDomain} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              {t('netbirdAuto.change')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disconnect.isPending}
              onClick={() => setConfirm(true)}
            >
              <Unplug />
              {t('netbirdAuto.disconnect')}
            </Button>
          </div>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={t('netbirdAuto.disconnectTitle')}
            description={t('netbirdAuto.disconnectText')}
            confirmLabel={t('netbirdAuto.disconnect')}
            destructive
            onConfirm={() => disconnect.mutate()}
          />
        </>
      ) : (
        <ConnectForm
          status={status}
          onDone={(next) => void done(next)}
          onCancel={status.configured ? () => setEditing(false) : null}
        />
      )}
    </Card>
  );
}
