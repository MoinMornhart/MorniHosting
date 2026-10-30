import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, PlugZap, Save, Unplug } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DNS_PROVIDERS, type DnsProvider, type DnsStatus, type DnsZoneOption } from '@mornihosting/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Pill } from '@/components/ui/pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { errorText } from '@/lib/query';
import { dnsStatusQuery } from '@/features/dns/dns';

const PROVIDER_LABEL: Readonly<Record<DnsProvider, string>> = { cloudflare: 'Cloudflare', ionos: 'IONOS' };

function ConnectForm({
  status,
  onDone,
  onCancel,
}: {
  status: DnsStatus;
  onDone: (next: DnsStatus) => void;
  onCancel: (() => void) | null;
}): ReactElement {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<DnsProvider>(status.provider ?? 'cloudflare');
  const [token, setToken] = useState('');
  const [zoneId, setZoneId] = useState('');
  const keepToken = status.configured && status.provider === provider;
  const body = { provider, ...(token.trim() ? { token: token.trim() } : {}) };
  const discover = useMutation({
    mutationFn: () => api<{ zones: DnsZoneOption[] }>('/api/dns/discover', { method: 'POST', body }),
    onSuccess: ({ zones }) =>
      setZoneId(zones.find((z) => z.name === status.domain)?.id ?? zones[0]?.id ?? ''),
  });
  const save = useMutation({
    mutationFn: () => api<DnsStatus>('/api/dns', { method: 'PUT', body: { ...body, zoneId } }),
    onSuccess: (next) => {
      toast.success(t('dnsAuto.connected'));
      onDone(next);
    },
  });
  const zones = discover.data?.zones;
  const error = save.error ?? discover.error;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <label className="grid gap-2 text-sm font-semibold">
          {t('dnsAuto.provider')}
          <Select
            value={provider}
            onValueChange={(value) => {
              setProvider(value as DnsProvider);
              discover.reset();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DNS_PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Field
          id="dns-token"
          label={t('dnsAuto.tokenLabel')}
          hint={keepToken ? t('dnsAuto.tokenKeep') : t(`dnsAuto.tokenHint.${provider}`)}
        >
          <Input
            id="dns-token"
            type="password"
            autoComplete="off"
            value={token}
            placeholder={keepToken ? '••••••••' : ''}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={zones ? 'secondary' : 'default'}
          disabled={discover.isPending || (!token.trim() && !keepToken)}
          onClick={() => discover.mutate()}
        >
          <PlugZap />
          {discover.isPending ? t('dnsAuto.connecting') : t('dnsAuto.connect')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
      {zones && !zones.length ? (
        <p className="rounded-[12px] bg-warning-soft px-3 py-2.5 text-sm text-warning">
          {t('dnsAuto.noZones')}
        </p>
      ) : null}
      {zones?.length ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-2 text-sm font-semibold">
            {t('dnsAuto.domain')}
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button type="button" disabled={!zoneId || save.isPending} onClick={() => save.mutate()}>
            <Save />
            {save.isPending ? t('dnsAuto.saving') : t('common.save')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">{errorText(error)}</p>
      ) : null}
    </div>
  );
}

/** Admin area: an own domain without NetBird – the panel writes the DNS records and keeps the IP current. */
export function DnsDomainCard(): ReactElement | null {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: status } = useQuery(dnsStatusQuery);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const refresh = async (next: DnsStatus): Promise<void> => {
    queryClient.setQueryData(dnsStatusQuery.queryKey, next);
    setEditing(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['server'] }),
      queryClient.invalidateQueries({ queryKey: ['connection'] }),
    ]);
  };
  const disconnect = useMutation({
    mutationFn: () => api<DnsStatus>('/api/dns', { method: 'DELETE' }),
    onSuccess: async (next) => {
      toast.success(t('dnsAuto.disconnected'));
      await refresh(next);
    },
  });
  if (!status) return null;
  // NetBird hands out the addresses already; otherwise the summary, or the form while connecting.
  const blocked = status.netbirdActive && !status.configured;
  const showSummary = status.configured && !editing;
  const checked = status.ipCheckedAt
    ? new Date(status.ipCheckedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Card id="own-domain" className="grid scroll-mt-4 gap-4 p-5 sm:p-6">
      <CardHeader className="mb-0">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Globe className="size-4 text-primary" aria-hidden />
          {t('dnsAuto.title')}
          {status.configured ? (
            <Pill tone="ok">{t('dnsAuto.connectedPill')}</Pill>
          ) : (
            <Pill>{t('dnsAuto.notConnected')}</Pill>
          )}
        </CardTitle>
      </CardHeader>
      <CardDescription>{t('dnsAuto.text')}</CardDescription>
      {blocked ? (
        <p className="rounded-[12px] bg-secondary px-3 py-2.5 text-sm">{t('dnsAuto.netbirdActive')}</p>
      ) : null}
      {showSummary ? (
        <>
          <p className="rounded-[12px] bg-secondary px-3 py-2.5 text-sm">
            <Trans
              i18nKey="dnsAuto.summary"
              values={{
                domain: status.domain,
                provider: status.provider ? PROVIDER_LABEL[status.provider] : '',
                ip: status.ip ?? '–',
                time: checked ?? '–',
              }}
              components={{ b: <b className="font-mono font-semibold" /> }}
            />
          </p>
          <p className="text-[13px] text-muted-foreground">{t('dnsAuto.portNote')}</p>
          {status.error ? (
            <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">
              {t(`errors.${status.error.code}`, status.error.params)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              {t('dnsAuto.change')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disconnect.isPending}
              onClick={() => setConfirm(true)}
            >
              <Unplug />
              {t('dnsAuto.disconnect')}
            </Button>
          </div>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={t('dnsAuto.disconnectTitle')}
            description={t('dnsAuto.disconnectText')}
            confirmLabel={t('dnsAuto.disconnect')}
            destructive
            onConfirm={() => disconnect.mutate()}
          />
        </>
      ) : null}
      {!blocked && !showSummary ? (
        <ConnectForm
          status={status}
          onDone={(next) => void refresh(next)}
          onCancel={status.configured ? () => setEditing(false) : null}
        />
      ) : null}
    </Card>
  );
}
