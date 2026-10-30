import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowDownToLine } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { SOFTWARE, type ServerDetail, type ServerSummary } from '@mornihosting/shared';
import { CommandLine } from '@/components/command-line';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { NetbirdNameInput } from '@/features/netbird/NetbirdNameInput';
import { toNetbirdName } from '@/features/netbird/netbird';
import { serverQuery, serversQuery } from '@/features/servers/live';

/**
 * Step-by-step guide for NetBird's reverse proxy: own domain, HTTPS for the panel, and TCP/UDP
 * services for the Minecraft servers, filled in with this panel's real addresses and ports.
 */

const NETBIRD_INSTALL = 'curl -fsSL https://pkgs.netbird.io/install.sh | sh';
const NETBIRD_UP = 'netbird up --setup-key <DEIN-SETUP-KEY>';
const LXC_TUN =
  'lxc.cgroup2.devices.allow: c 10:200 rwm\nlxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file';
const CNAME_TARGET = 'eu.proxy.netbird.io';
const DEFAULT_PANEL_PORT = '8080';
const FALLBACK_BASE = 'mc.deine-domain.de';
const DEFAULT_PANEL_NAME = 'panel';
const SRV_EXAMPLE = 'survival';
interface Row {
  readonly key: string;
  readonly label: string;
  readonly mode: 'TCP' | 'UDP';
  readonly port: number;
  readonly sub: string;
}

function rowsFor(servers: readonly ServerSummary[], details: readonly (ServerDetail | undefined)[]): Row[] {
  return servers.flatMap((s, i) => {
    const detail = details[i];
    const base = toNetbirdName(s.name);
    const main: Row = {
      key: s.id,
      label: s.name,
      mode: SOFTWARE[s.software].protocol === 'udp' ? 'UDP' : 'TCP',
      port: s.port,
      sub: base,
    };
    const geyser: Row[] = detail?.geyserPort
      ? [
          {
            key: `${s.id}-g`,
            label: `${s.name} · Bedrock (Geyser)`,
            mode: 'UDP',
            port: detail.geyserPort,
            sub: `${base}-bedrock`,
          },
        ]
      : [];
    const voice: Row[] = detail?.voicePort
      ? [
          {
            key: `${s.id}-v`,
            label: `${s.name} · Voice-Chat`,
            mode: 'UDP',
            port: detail.voicePort,
            sub: `${base}-voice`,
          },
        ]
      : [];
    return [main, ...geyser, ...voice];
  });
}

function Value({ children }: { children: string }): ReactElement {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-[8px] bg-secondary px-2 py-0.5 align-middle">
      <code className="min-w-0 break-all font-mono text-[13px] font-semibold">{children}</code>
      <CopyButton text={children} className="size-6" />
    </span>
  );
}

function Block({ children }: { children: string }): ReactElement {
  return <CommandLine text={children} block={children.includes('\n')} />;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }): ReactElement {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="grid size-7 place-items-center rounded-full bg-accent text-sm font-bold text-primary">
        {n}
      </span>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-sm">
        <b className="text-[15px] font-semibold">{title}</b>
        {children}
      </div>
    </li>
  );
}

export function NetBirdGuide({
  panelDomain,
  lanIp,
  onUsePanelDomain,
}: {
  panelDomain: string;
  lanIp: string;
  onUsePanelDomain: (domain: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  // "hosting.moinmornhart.de" → name "hosting" in front of the NetBird domain "moinmornhart.de".
  const [base, setBase] = useState(() => panelDomain.split('.').slice(1).join('.') || '');
  const [panelName, setPanelName] = useState(
    () => (panelDomain.includes('.') && panelDomain.split('.')[0]) || '',
  );
  const { data: servers = [] } = useQuery(serversQuery);
  const details = useQueries({ queries: servers.map((s) => serverQuery(s.id)) }).map((q) => q.data);
  const domain = base.trim().toLowerCase() || FALLBACK_BASE;
  const panelPort = window.location.port || DEFAULT_PANEL_PORT;
  const target = lanIp || t('netbird.thisMachine');
  const panelSub = toNetbirdName(panelName, DEFAULT_PANEL_NAME);
  const panelAddress = `${panelSub}.${domain}`;
  const rows = rowsFor(servers, details);
  const srvName = `${rows.find((r) => r.mode === 'TCP')?.sub ?? SRV_EXAMPLE}.${domain}`;
  const link = <b className="font-semibold text-foreground" />;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <p className="text-sm text-muted-foreground">{t('netbird.intro')}</p>
      <p className="rounded-[12px] bg-accent px-3 py-2.5 text-sm">
        <Trans
          i18nKey="netbird.autoHint"
          components={{ a: <a href="#netbird" className="font-semibold text-primary hover:underline" /> }}
        />
      </p>
      <Field id="nb-base" label={t('netbird.base')} hint={t('netbird.baseHint')}>
        <Input
          id="nb-base"
          value={base}
          placeholder={FALLBACK_BASE}
          autoComplete="off"
          onChange={(e) => setBase(e.target.value)}
        />
      </Field>
      <Field id="nb-panel-name" label={t('netbird.panelName')} hint={t('netbird.panelNameHint')}>
        <NetbirdNameInput
          id="nb-panel-name"
          value={panelName}
          placeholder={DEFAULT_PANEL_NAME}
          domain={domain}
          onChange={setPanelName}
        />
      </Field>
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <Step n={1} title={t('netbird.step1Title')}>
          <p className="text-muted-foreground">{t('netbird.step1Text')}</p>
          <Block>{NETBIRD_INSTALL}</Block>
          <Block>{NETBIRD_UP}</Block>
          <p className="text-muted-foreground">{t('netbird.step1Lxc')}</p>
          <Block>{LXC_TUN}</Block>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step1Router" values={{ ip: target }} components={{ b: link }} />
          </p>
        </Step>
        <Step n={2} title={t('netbird.step2Title')}>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step2Add" components={{ b: link }} />
          </p>
          <p>
            <Value>{domain}</Value>
          </p>
          <p className="text-muted-foreground">{t('netbird.step2Dns')}</p>
          <div className="grid gap-1.5 rounded-[10px] border border-border p-3 text-[13px]">
            <span>
              {t('netbird.dnsType')} <Value>CNAME</Value>
            </span>
            <span>
              {t('netbird.dnsName')} <Value>{`*.${domain}`}</Value>
            </span>
            <span>
              {t('netbird.dnsValue')} <Value>{CNAME_TARGET}</Value>
            </span>
          </div>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step2Verify" components={{ b: link }} />
          </p>
        </Step>
        <Step n={3} title={t('netbird.step3Title')}>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step3Add" components={{ b: link }} />
          </p>
          <ul className="grid gap-1.5 text-[13px]">
            <li>
              {t('netbird.mode')} <Value>HTTP</Value> · {t('netbird.subdomain')} <Value>{panelSub}</Value> ·{' '}
              {t('netbird.baseDomain')} <Value>{domain}</Value>
            </li>
            <li>
              {t('netbird.target')} <Value>{target}</Value> · {t('netbird.protocol')} <Value>HTTP</Value> ·{' '}
              {t('netbird.port')} <Value>{panelPort}</Value>
            </li>
          </ul>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step3Host" components={{ b: link }} />
          </p>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step3Auth" components={{ b: link }} />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t('netbird.step3Result')}</span>
            <Value>{`https://${panelAddress}`}</Value>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onUsePanelDomain(panelAddress)}
            >
              <ArrowDownToLine />
              {t('netbird.usePanelDomain')}
            </Button>
          </div>
        </Step>
        <Step n={4} title={t('netbird.step4Title')}>
          <p className="text-muted-foreground">{t('netbird.step4Text')}</p>
          {rows.length ? (
            <ul className="grid gap-2">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="grid gap-1.5 rounded-[10px] border border-border px-3 py-2.5 text-[13px]"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="font-semibold">{r.label}</b>
                    <span className="rounded-[6px] bg-accent px-1.5 py-0.5 font-mono text-[12px] font-bold text-primary">
                      {r.mode}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span>
                      {t('netbird.subdomain')} <Value>{r.sub}</Value>
                    </span>
                    <span>
                      {t('netbird.colTarget')} <Value>{`${target}:${r.port}`}</Value>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t('netbird.noServers')}</p>
          )}
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step4Port" components={{ b: link }} />
          </p>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step4Srv" values={{ name: srvName }} components={{ b: link }} />
          </p>
        </Step>
        <Step n={5} title={t('netbird.step5Title')}>
          <p className="text-muted-foreground">
            <Trans i18nKey="netbird.step5Text" values={{ address: panelAddress }} components={{ b: link }} />
          </p>
        </Step>
      </ol>
    </div>
  );
}
