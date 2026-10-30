import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  Mic,
  Blocks,
  Check,
  Cpu,
  Gauge,
  Globe,
  Puzzle,
  Rocket,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  CREATABLE_SOFTWARE,
  SOFTWARE,
  recommendedMemoryMb,
  type CreateServerInput,
  type ServerSummary,
  type SoftwareId,
  type VersionOption,
} from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox, Skeleton, Slider } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/art';
import { GameCard } from '@/components/game-card';
import { blockOf, McBlock } from '@/components/mc-block';
import { hasProjectLogo, ProjectLogo } from '@/components/project-logo';
import { api } from '@/lib/api';
import { formatMemoryMb } from '@/lib/format';
import { errorText } from '@/lib/query';
import { cn } from '@/lib/utils';
import { hostQuery } from '@/features/dashboard/HostStrip';
import { toNetbirdName, useAddressAutomation } from '@/features/netbird/netbird';
import { GEYSER_SOFTWARE } from '../settings/GeyserCard';
import { VOICE_CHAT_SOFTWARE } from '../settings/VoiceChatCard';
import { serversQuery } from '../live';

/** What can be ordered, like at a hoster: Java, Bedrock, or a Java server Bedrock players can join (Geyser). */
const GAMES = ['java', 'bedrock', 'crossplay'] as const;
type Game = (typeof GAMES)[number];

const MB_PER_GB = 1024;
/**
 * Card-like buttons take the text colour of the card. Set inline, because some app viewers (the demo inside
 * the Claude app on iPhone) give buttons their own dark text colour that would otherwise win.
 */
export const OWN_TEXT_COLOUR = { color: 'inherit' } as const;
/* eslint-disable ts-patterns/no-magic-numbers -- the package table: GB, about how many players, and its stone */
type Tier =
  'stone' | 'copper' | 'iron' | 'gold' | 'emerald' | 'diamond' | 'amethyst' | 'redstone' | 'netherite';
/** The packages: memory and about how many players it carries (vanilla/Paper, a few plugins). */
const PLANS: readonly { readonly gb: number; readonly players: number; readonly tier: Tier }[] = [
  { gb: 2, players: 4, tier: 'stone' },
  { gb: 3, players: 6, tier: 'copper' },
  { gb: 4, players: 8, tier: 'iron' },
  { gb: 5, players: 10, tier: 'gold' },
  { gb: 6, players: 15, tier: 'emerald' },
  { gb: 8, players: 20, tier: 'diamond' },
  { gb: 10, players: 40, tier: 'amethyst' },
  { gb: 12, players: 50, tier: 'redstone' },
  { gb: 16, players: 100, tier: 'netherite' },
];
/** Each package is a Minecraft ore: the bigger, the rarer. The glow behind it takes the ore's colour. */
const TIER_GLOW: Readonly<Record<Tier, string>> = {
  stone: '#94a3b8',
  copper: '#ea7a3b',
  iron: '#e2c3a6',
  gold: '#facc15',
  emerald: '#22c55e',
  diamond: '#22d3ee',
  amethyst: '#a855f7',
  redstone: '#ef4444',
  netherite: '#a8a29e',
};
/* eslint-enable ts-patterns/no-magic-numbers */
const FALLBACK_PLAN_GB = 2;
/** Rough rule for a custom size between the packages: two players per GB. */
const PLAYERS_PER_GB = 2;
const MEMORY_STEP_MB = 512;
const MEMORY_MIN_MB = 1024;
const MEMORY_CAP_MB = 32768;
const FALLBACK_HOST_MB = 16384;
const PORT_SEARCH_LIMIT = 200;
const EULA_URL = 'https://www.minecraft.net/eula';
const BACKUP_TIME = '04:00';

const ADJECTIVES = ['mutiger', 'flinker', 'goldener', 'wilder', 'schlauer', 'gruener', 'stolzer', 'leiser'];
const NOUNS = ['creeper', 'schleim', 'enderman', 'axolotl', 'golem', 'fuchs', 'panda', 'drache'];

/** A fun name to start with, like hosters prefill: "goldener-axolotl". */
function suggestName(): string {
  const pick = (list: readonly string[]): string => list[Math.floor(Math.random() * list.length)] ?? '';
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

function nextFreePort(base: number, servers: readonly ServerSummary[]): number {
  const used = new Set(servers.map((s) => s.port));
  const candidates = Array.from({ length: PORT_SEARCH_LIMIT }, (_, i) => base + i);
  return candidates.find((p) => !used.has(p)) ?? base;
}

function isGame(value: string | null): value is Game {
  return GAMES.some((g) => g === value);
}

function Section({
  number,
  icon,
  title,
  text,
  children,
}: {
  number: number;
  icon: ReactNode;
  title: string;
  text: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="grid gap-4 border-b border-border p-5 last:border-b-0 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-primary">
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-bold">
            {number}. {title}
          </h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Step 0: which game, like the hoster's game selection. */
function GamePicker({ onPick }: { onPick: (game: Game) => void }): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">{t('order.pickTitle')}</h1>
        <p className="mt-1 text-muted-foreground">{t('order.pickText')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {GAMES.map((g) => (
          <GameCard key={g} game={g} onStart={() => onPick(g)} />
        ))}
      </div>
      <Button asChild variant="ghost" className="justify-self-start">
        <Link to="/servers/import">
          <Upload />
          {t('create.importInstead')}
        </Link>
      </Button>
    </div>
  );
}

/** Every add-on shows its picture in the same tile: the project's logo, or a symbol when it has none. */
function AddOnTile({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-border bg-background shadow-sm">
      {children}
    </span>
  );
}

/** The software's own logo where its project allows it (Paper, Velocity), otherwise its Minecraft block. */
function SoftwareIcon({ id }: { id: SoftwareId }): ReactElement {
  const block = <McBlock kind={blockOf(id)} className="size-6" />;
  // Same box for every software, so logos and blocks line up.
  return (
    <span className="grid size-6 shrink-0 place-items-center">
      {hasProjectLogo(id) ? <ProjectLogo project={id} className="size-5" fallback={block} /> : block}
    </span>
  );
}

function AddOn({
  title,
  text,
  on,
  locked,
  recommended,
  icon,
  onChange,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  on: boolean;
  locked?: boolean;
  recommended?: boolean;
  onChange: (on: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-secondary/60 px-4 py-3',
        on && 'border-primary/60 bg-accent',
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold">
          {title}
          {recommended ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              {t('order.recommended')}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <span className="text-sm font-semibold text-muted-foreground">{t('order.included')}</span>
      <Button
        type="button"
        size="sm"
        variant={on ? 'secondary' : 'default'}
        disabled={locked}
        onClick={() => onChange(!on)}
      >
        {on ? <Check /> : null}
        {on ? t('order.added') : t('order.add')}
      </Button>
    </div>
  );
}

/** Ordering a server like at a hoster: package, software, name, add-ons – and an order summary. Free, it's yours. */
export function CreateServerPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const gameParam = params.get('game');
  const game: Game | null = isGame(gameParam) ? gameParam : null;
  const { data: servers = [] } = useQuery(serversQuery);
  const { data: host } = useQuery(hostQuery);
  const address = useAddressAutomation();

  const edition = game === 'bedrock' ? 'bedrock' : 'java';
  const softwareChoices = CREATABLE_SOFTWARE[edition].filter(
    (id) => game !== 'crossplay' || GEYSER_SOFTWARE.includes(id),
  );
  const [softwarePick, setSoftwarePick] = useState<SoftwareId | null>(null);
  const software: SoftwareId =
    softwarePick && softwareChoices.includes(softwarePick) ? softwarePick : (softwareChoices[0] ?? 'paper');
  const [version, setVersion] = useState('');
  const [showUnstable, setShowUnstable] = useState(false);
  const [memoryPick, setMemoryPick] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [subdomain, setSubdomain] = useState(suggestName);
  const [displayName, setDisplayName] = useState('');
  const [portPick, setPortPick] = useState<number | null>(null);
  const [addOns, setAddOns] = useState({ geyser: false, voice: false, backups: true });
  const [startNow, setStartNow] = useState(true);
  const [eula, setEula] = useState(false);

  const versions = useQuery({
    queryKey: ['versions', software],
    queryFn: () => api<VersionOption[]>(`/api/versions/${software}`),
    enabled: game !== null,
  });
  const versionList = useMemo(
    () => (versions.data ?? []).filter((v) => showUnstable || v.stable),
    [versions.data, showUnstable],
  );
  const latestStable = versions.data?.find((v) => v.stable)?.id ?? '';
  const chosenVersion = version || latestStable;

  const recommendedMb = recommendedMemoryMb(software);
  const recommendedPlan = PLANS.find((p) => p.gb * MB_PER_GB >= recommendedMb) ?? PLANS[PLANS.length - 1];
  const memoryMb = memoryPick ?? (recommendedPlan?.gb ?? FALLBACK_PLAN_GB) * MB_PER_GB;
  const hostTotal = host?.memoryTotalMb ?? FALLBACK_HOST_MB;
  const hostFree = host ? host.memoryTotalMb - host.memoryUsedMb : null;
  const maxMemory = Math.max(
    MEMORY_MIN_MB,
    Math.min(MEMORY_CAP_MB, Math.floor(hostTotal / MEMORY_STEP_MB) * MEMORY_STEP_MB),
  );
  const plan = custom ? undefined : PLANS.find((p) => p.gb * MB_PER_GB === memoryMb);
  const players = plan?.players ?? Math.max(1, Math.round((memoryMb / MB_PER_GB) * PLAYERS_PER_GB));

  const defaultPort = SOFTWARE[software].defaultPort;
  const port = portPick ?? nextFreePort(defaultPort, servers);
  const geyserPossible = edition === 'java' && GEYSER_SOFTWARE.includes(software);
  const voicePossible = VOICE_CHAT_SOFTWARE.includes(software);
  const geyser = game === 'crossplay' || (geyserPossible && addOns.geyser);
  const voice = voicePossible && addOns.voice;
  const addressName = toNetbirdName(subdomain, '');
  const name = displayName.trim() || subdomain.trim();
  const hostname = address && addressName ? `${addressName}.${address.domain}` : null;

  const create = useMutation({
    mutationFn: async () => {
      const body: CreateServerInput = {
        name,
        edition,
        software,
        version: chosenVersion,
        memoryMb,
        port,
        eula: true,
        autoStart: true,
        startNow,
        ...(address && addressName ? { netbirdName: addressName } : {}),
      };
      const server = await api<ServerSummary>('/api/servers', { method: 'POST', body });
      // The add-ons from the order; a failing one does not stop the server from being there.
      await Promise.allSettled([
        geyser ? api(`/api/servers/${server.id}/geyser`, { method: 'PUT', body: { enabled: true } }) : null,
        voice ? api(`/api/servers/${server.id}/voicechat`, { method: 'PUT', body: { enabled: true } }) : null,
        addOns.backups
          ? api(`/api/servers/${server.id}/schedules`, {
              method: 'POST',
              body: {
                name: t('order.backupName'),
                action: 'backup',
                spec: { kind: 'daily', time: BACKUP_TIME },
                enabled: true,
              },
            })
          : null,
      ]);
      return server;
    },
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: serversQuery.queryKey });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate(`/servers/${server.id}`);
    },
    onError: () => undefined,
  });

  if (!game) return <GamePicker onPick={(g) => setParams({ game: g })} />;

  const ready = Boolean(chosenVersion) && Boolean(name) && eula && (!address || Boolean(addressName));
  const features = [
    { key: 'panel', icon: Blocks },
    { key: 'instant', icon: Rocket },
    { key: 'secure', icon: ShieldCheck },
    { key: 'fast', icon: Zap },
  ] as const;

  return (
    <div className="grid gap-5">
      <header className="grid gap-3 rounded-[16px] border border-border bg-card bg-[radial-gradient(ellipse_at_0%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
            <McBlock kind={game === 'bedrock' ? 'diamond' : 'grass'} className="size-11" />
            {t(`order.title.${game}`)}
          </h1>
          <Link
            to="/servers/new"
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-4" />
            {t('order.backToGames')}
          </Link>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {features.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-center gap-1.5">
              <Icon className="size-4 text-primary" aria-hidden />
              {t(`landing.perks.${key}`)}
            </li>
          ))}
        </ul>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-[16px] border border-border bg-card">
          <Section
            number={1}
            icon={<Gauge className="size-5" />}
            title={t('order.performance')}
            text={t('order.performanceText')}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PLANS.map((p) => {
                const mb = p.gb * MB_PER_GB;
                const selected = !custom && memoryMb === mb;
                const tooBig = mb > hostTotal;
                return (
                  <button
                    key={p.gb}
                    type="button"
                    aria-pressed={selected}
                    disabled={tooBig}
                    style={OWN_TEXT_COLOUR}
                    onClick={() => {
                      setCustom(false);
                      setMemoryPick(mb);
                    }}
                    className={cn(
                      'group relative grid justify-items-center gap-2 rounded-[14px] border border-border bg-secondary/50 px-3 py-4 text-center text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-40',
                      selected && 'border-primary bg-accent ring-1 ring-primary',
                    )}
                  >
                    {p === recommendedPlan ? (
                      <span className="absolute -top-2.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                        {t('order.recommended')}
                      </span>
                    ) : null}
                    <span
                      className="grid size-[76px] place-items-center rounded-full"
                      style={{
                        background: `radial-gradient(circle, ${TIER_GLOW[p.tier]}55, transparent 68%)`,
                      }}
                    >
                      <McBlock
                        kind={p.tier}
                        className="size-[60px] transition-transform group-hover:-translate-y-0.5 group-hover:scale-110"
                      />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {t(`order.tiers.${p.tier}`)}
                    </span>
                    <span className="-mt-1 text-xl font-extrabold">
                      {p.gb} GB <span className="text-muted-foreground">RAM</span>
                    </span>
                    <span className="flex items-center gap-1 rounded-[8px] border border-border px-2 py-0.5 text-xs">
                      ~{p.players} <Users className="size-3.5" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold">{t('landing.free')}</span>
                  </button>
                );
              })}
            </div>
            <div
              className={cn(
                'grid gap-3 rounded-[14px] border border-dashed border-border p-4',
                custom && 'border-solid border-primary bg-accent',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <Settings2 className="size-4 text-primary" aria-hidden />
                  {t('order.custom')}
                </span>
                {custom ? (
                  <span className="text-sm font-semibold">
                    {formatMemoryMb(memoryMb)} · ~{players} {t('order.players')}
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setCustom(true)}>
                    {t('order.customize')}
                  </Button>
                )}
              </div>
              {custom ? (
                <>
                  <Slider
                    value={[memoryMb]}
                    min={MEMORY_MIN_MB}
                    max={maxMemory}
                    step={MEMORY_STEP_MB}
                    onValueChange={([value]) => setMemoryPick(value ?? memoryMb)}
                    aria-label={t('order.custom')}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatMemoryMb(MEMORY_MIN_MB)}</span>
                    <span>{formatMemoryMb(maxMemory)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('order.customText')}</p>
              )}
            </div>
            <p
              className={cn(
                'text-sm',
                hostFree !== null && memoryMb > hostFree ? 'text-warning' : 'text-muted-foreground',
              )}
            >
              {hostFree !== null && memoryMb > hostFree
                ? t('create.ramWarn')
                : t('order.recommendation', {
                    software: SOFTWARE[software].label,
                    ram: formatMemoryMb(recommendedMb),
                  })}
            </p>
          </Section>

          <Section
            number={2}
            icon={<Cpu className="size-5" />}
            title={t('order.software')}
            text={t('order.softwareText')}
          >
            {softwareChoices.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {softwareChoices.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={software === id}
                    style={OWN_TEXT_COLOUR}
                    onClick={() => {
                      setSoftwarePick(id);
                      setVersion('');
                      setPortPick(null);
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-[10px] border border-border bg-secondary/60 px-3 py-2 text-sm font-semibold hover:border-primary',
                      software === id && 'border-primary bg-accent',
                    )}
                    title={t(`create.software.${id}`)}
                  >
                    <SoftwareIcon id={id} />
                    {SOFTWARE[id].label}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">{t(`create.software.${software}`)}</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-[180px] gap-2 text-sm font-semibold">
                {t('order.version')}
                {versions.isPending ? (
                  <Skeleton className="h-10" />
                ) : (
                  <Select value={chosenVersion} onValueChange={setVersion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {versionList.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.id === latestStable ? `${v.id} · ${t('create.latest')}` : v.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
                <Switch checked={showUnstable} onCheckedChange={setShowUnstable} />
                {t('create.showUnstable')}
              </label>
            </div>
            {versions.error ? (
              <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">
                {t('create.versionsFailed')} {errorText(versions.error)}
              </p>
            ) : null}
          </Section>

          <Section
            number={3}
            icon={<Globe className="size-5" />}
            title={t('order.name')}
            text={t('order.nameText')}
          >
            <div className="flex items-stretch overflow-hidden rounded-[12px] border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <input
                id="server-address"
                aria-label={t('order.name')}
                value={subdomain}
                maxLength={40}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setSubdomain(e.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-base outline-none"
              />
              {address ? (
                <span className="flex items-center border-l border-input bg-secondary px-3 font-mono text-sm text-muted-foreground">
                  .{address.domain}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {hostname ? t('order.addressReady', { hostname }) : t('order.noDomain')}
            </p>
            {hostname && (edition === 'bedrock' || geyser) ? (
              <p className="rounded-[10px] bg-secondary px-3 py-2 text-sm text-muted-foreground">
                {edition === 'bedrock'
                  ? t('order.bedrockJoin', { hostname, port })
                  : t('order.geyserJoin', { hostname })}
              </p>
            ) : null}
            <Field id="server-name" label={t('order.displayName')} hint={t('order.displayNameHint')}>
              <Input
                id="server-name"
                maxLength={40}
                value={displayName}
                placeholder={subdomain}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
          </Section>

          <Section
            number={4}
            icon={<Puzzle className="size-5" />}
            title={t('order.addOns')}
            text={t('order.addOnsText')}
          >
            {edition === 'java' ? (
              <AddOn
                icon={
                  <AddOnTile>
                    <ProjectLogo
                      project="geyser"
                      className="size-7 rounded-[6px]"
                      fallback={<Badge glyph="crossplay" className="size-7" />}
                    />
                  </AddOnTile>
                }
                title={t('order.geyser')}
                text={geyserPossible ? t('order.geyserText') : t('order.notForSoftware')}
                on={geyser}
                locked={game === 'crossplay' || !geyserPossible}
                recommended={game !== 'crossplay' && geyserPossible}
                onChange={(on) => setAddOns({ ...addOns, geyser: on })}
              />
            ) : null}
            <AddOn
              icon={
                <AddOnTile>
                  <ProjectLogo
                    project="voicechat"
                    className="size-7 rounded-[6px]"
                    fallback={<Mic className="size-5 text-primary" aria-hidden />}
                  />
                </AddOnTile>
              }
              title={t('order.voice')}
              text={voicePossible ? t('order.voiceText') : t('order.notForSoftware')}
              on={voice}
              locked={!voicePossible}
              onChange={(on) => setAddOns({ ...addOns, voice: on })}
            />
            <AddOn
              icon={
                <AddOnTile>
                  <Archive className="size-5 text-primary" aria-hidden />
                </AddOnTile>
              }
              title={t('order.backups')}
              text={t('order.backupsText', { time: BACKUP_TIME })}
              on={addOns.backups}
              recommended
              onChange={(on) => setAddOns({ ...addOns, backups: on })}
            />
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-muted-foreground">
                {t('order.advanced')}
              </summary>
              <div className="mt-3 max-w-[220px]">
                <Field
                  id="server-port"
                  label={t('create.port')}
                  hint={t('create.portHint', { port: defaultPort })}
                >
                  <Input
                    id="server-port"
                    type="number"
                    inputMode="numeric"
                    value={port}
                    onChange={(e) => setPortPick(Number(e.target.value) || null)}
                  />
                </Field>
              </div>
            </details>
          </Section>
        </div>

        <aside className="grid gap-4 rounded-[16px] border border-border bg-card p-5 lg:sticky lg:top-4">
          <h2 className="text-lg font-bold">{t('order.summary')}</h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-3 border-b border-border pb-3">
              <dt>
                <b className="block">{t(`order.title.${game}`)}</b>
                <span className="font-mono text-xs uppercase text-muted-foreground">{name || '–'}</span>
              </dt>
              <dd className="font-semibold">{t('landing.free')}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border pb-3">
              <dt className="text-muted-foreground">{t('order.performance')}</dt>
              <dd className="text-right font-semibold">
                {formatMemoryMb(memoryMb)} · ~{players} {t('order.players')}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border pb-3">
              <dt className="text-muted-foreground">{t('order.software')}</dt>
              <dd className="text-right font-semibold">
                {SOFTWARE[software].label} {chosenVersion}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border pb-3">
              <dt className="text-muted-foreground">{t('order.address')}</dt>
              <dd className="break-all text-right font-mono text-xs font-semibold">
                {hostname ?? `Port ${port}`}
              </dd>
            </div>
            {geyser || voice || addOns.backups ? (
              <div className="flex justify-between gap-3 border-b border-border pb-3">
                <dt className="text-muted-foreground">{t('order.addOns')}</dt>
                <dd className="grid text-right font-semibold">
                  {geyser ? <span>{t('order.geyser')}</span> : null}
                  {voice ? <span>{t('order.voice')}</span> : null}
                  {addOns.backups ? <span>{t('order.backups')}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('order.price')}
            </div>
            <div className="text-3xl font-extrabold">
              0,00 €{' '}
              <span className="text-base font-semibold text-muted-foreground">/ {t('order.month')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('order.priceNote')}</p>
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={startNow} onCheckedChange={(v) => setStartNow(v === true)} />
            {t('order.startNow')}
          </label>
          <div className="flex items-start gap-2.5 text-sm">
            <Checkbox id="eula" checked={eula} onCheckedChange={(v) => setEula(v === true)} />
            <label htmlFor="eula">
              {t('create.eula')}{' '}
              <a
                href={EULA_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                {t('create.eulaLink')}
              </a>
            </label>
          </div>
          {create.error ? (
            <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">{errorText(create.error)}</p>
          ) : null}
          <Button size="lg" disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            <Rocket />
            {create.isPending ? t('create.creating') : t('create.submit')}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5" />
            {t('order.changeLater')}
          </p>
        </aside>
      </div>
    </div>
  );
}
