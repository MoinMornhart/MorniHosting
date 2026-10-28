import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import { LOCALES, type Locale, type PanelSettings } from '@mornihosting/shared';
import { EmptyState, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { Pill } from '@/components/ui/pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useSession } from '@/features/auth/session';
import { UpdateSection } from './UpdateSection';

const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { de: 'Deutsch', en: 'English' };

function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  title: ReactNode;
  hint: ReactNode;
}): ReactElement {
  return (
    <label className="flex items-start gap-3 rounded-[12px] border border-border p-3">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        <b className="block text-sm font-semibold">{title}</b>
        <span className="text-[13px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/** Panel-wide settings: how the server address is shown, the CurseForge key, time zone and language. */
export function PanelSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const { me } = useSession();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['panel-settings'],
    queryFn: () => api<PanelSettings>('/api/settings'),
    enabled: me.user.isAdmin,
  });
  const [draft, setDraft] = useState<PanelSettings | null>(null);
  const [cfKey, setCfKey] = useState('');
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const { hash } = useLocation();
  const loaded = draft !== null;
  useEffect(() => {
    if (hash && loaded)
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, loaded]);
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<PanelSettings>('/api/settings', { method: 'PUT', body }),
    onSuccess: async (result) => {
      toast.success(t('common.saved'));
      setCfKey('');
      queryClient.setQueryData(['panel-settings'], result);
      await queryClient.invalidateQueries({ queryKey: ['market-sources'] });
    },
  });

  if (!me.user.isAdmin) return <EmptyState title={t('errors.admin_only')} />;
  if (!draft) return <Skeleton className="h-96 rounded-[16px]" />;
  const set = (patch: Partial<PanelSettings>): void => setDraft({ ...draft, ...patch });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const { curseforgeConfigured: _ignored, ...rest } = draft;
    save.mutate({ ...rest, ...(cfKey.trim() ? { curseforgeApiKey: cfKey.trim() } : {}) });
  };

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-5">
      <PageHeader title={t('panelSettings.title')} subtitle={t('panelSettings.subtitle')} />

      <Card className="grid gap-4 p-5 sm:p-6">
        <CardHeader className="mb-0">
          <CardTitle>{t('panelSettings.addressTitle')}</CardTitle>
        </CardHeader>
        <CardDescription>{t('panelSettings.addressText')}</CardDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="ps-public"
            label={t('panelSettings.publicAddress')}
            hint={t('panelSettings.publicAddressHint')}
          >
            <Input
              id="ps-public"
              value={draft.publicAddress}
              placeholder="mc.example.de"
              onChange={(e) => set({ publicAddress: e.target.value })}
            />
          </Field>
          <Field id="ps-lan" label={t('panelSettings.lanIp')} hint={t('panelSettings.lanIpHint')}>
            <Input
              id="ps-lan"
              value={draft.lanIp}
              placeholder="192.168.178.20"
              onChange={(e) => set({ lanIp: e.target.value })}
            />
          </Field>
        </div>
        <Toggle
          checked={draft.publicIpLookup}
          onChange={(on) => set({ publicIpLookup: on })}
          title={t('panelSettings.publicIpLookup')}
          hint={t('panelSettings.publicIpLookupHint')}
        />
        <Toggle
          checked={draft.reachabilityCheck}
          onChange={(on) => set({ reachabilityCheck: on })}
          title={t('panelSettings.reachability')}
          hint={t('panelSettings.reachabilityHint')}
        />
      </Card>

      <Card className="grid gap-4 p-5 sm:p-6">
        <CardHeader className="mb-0">
          <CardTitle className="flex items-center gap-2">
            CurseForge
            {draft.curseforgeConfigured ? (
              <Pill tone="ok">{t('panelSettings.keySet')}</Pill>
            ) : (
              <Pill>{t('panelSettings.keyMissing')}</Pill>
            )}
          </CardTitle>
        </CardHeader>
        <CardDescription>{t('panelSettings.curseforgeText')}</CardDescription>
        <Field
          id="ps-cf"
          label={t('panelSettings.curseforgeKey')}
          hint={draft.curseforgeConfigured ? t('panelSettings.keyKeep') : undefined}
        >
          <Input
            id="ps-cf"
            type="password"
            autoComplete="off"
            value={cfKey}
            onChange={(e) => setCfKey(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="grid gap-4 p-5 sm:p-6">
        <CardHeader className="mb-0">
          <CardTitle>{t('panelSettings.generalTitle')}</CardTitle>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            {t('panelSettings.timezone')}
            <Select value={draft.timezone} onValueChange={(v) => set({ timezone: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z.replaceAll('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[13px] font-normal text-muted-foreground">
              {t('panelSettings.timezoneHint')}
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            {t('panelSettings.language')}
            <Select value={draft.defaultLocale} onValueChange={(v) => set({ defaultLocale: v as Locale })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LANGUAGE_NAMES[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[13px] font-normal text-muted-foreground">
              {t('panelSettings.languageHint')}
            </span>
          </label>
        </div>
        <Toggle
          checked={draft.checkUpdates}
          onChange={(on) => set({ checkUpdates: on })}
          title={t('panelSettings.checkUpdates')}
          hint={t('panelSettings.checkUpdatesHint')}
        />
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          <Save />
          {t('common.save')}
        </Button>
      </div>
      <UpdateSection />
    </form>
  );
}
