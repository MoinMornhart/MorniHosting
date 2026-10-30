import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Rocket, Search, Upload } from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
  CREATABLE_SOFTWARE,
  SOFTWARE,
  recommendedMemoryMb,
  type CreateServerInput,
  type Edition,
  type ServerSummary,
  type SoftwareId,
  type VersionOption,
} from '@mornihosting/shared';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox, Skeleton, Slider } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatMemoryMb } from '@/lib/format';
import { blockForServer, blockIcon } from '@/lib/pixel';
import { errorText } from '@/lib/query';
import { cn } from '@/lib/utils';
import { hostQuery } from '@/features/dashboard/HostStrip';
import { NetbirdNameInput } from '@/features/netbird/NetbirdNameInput';
import { toNetbirdName, useAddressAutomation } from '@/features/netbird/netbird';
import { serversQuery } from '../live';

const STEPS = ['stepEdition', 'stepSoftware', 'stepVersion', 'stepSize', 'stepName'] as const;
const STEP_SOFTWARE = 1;
const STEP_VERSION = 2;
const STEP_SIZE = 3;
const STEP_NAME = 4;
const MEMORY_STEP_MB = 512;
const MEMORY_MIN_MB = 512;
const MEMORY_CAP_MB = 32768;
const MEMORY_SLIDER_MIN_MAX_MB = 1024;
const FALLBACK_HOST_MB = 16384;
const MAX_VISIBLE_VERSIONS = 60;
const PORT_SEARCH_LIMIT = 200;
const EULA_URL = 'https://www.minecraft.net/eula';

function Choice({
  selected,
  onClick,
  icon,
  title,
  text,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  title: ReactNode;
  text: ReactNode;
  badge?: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex items-start gap-3 rounded-[14px] border border-input bg-card p-4 text-left transition-colors hover:border-primary',
        selected && 'border-primary bg-accent ring-1 ring-primary',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-bold">
          {title}
          {badge}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
      </span>
      {selected ? <Check className="size-5 shrink-0 text-primary" /> : null}
    </button>
  );
}

function nextFreePort(base: number, servers: readonly ServerSummary[]): number {
  const used = new Set(servers.map((s) => s.port));
  const candidates = Array.from({ length: PORT_SEARCH_LIMIT }, (_, i) => base + i);
  return candidates.find((p) => !used.has(p)) ?? base;
}

export function CreateServerPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: servers = [] } = useQuery(serversQuery);
  const { data: host } = useQuery(hostQuery);
  const [step, setStep] = useState(0);
  const [edition, setEdition] = useState<Edition>('java');
  const [software, setSoftware] = useState<SoftwareId>('paper');
  const [version, setVersion] = useState('');
  const [showUnstable, setShowUnstable] = useState(false);
  const [filter, setFilter] = useState('');
  const [memoryMb, setMemoryMb] = useState(recommendedMemoryMb('paper'));
  const [name, setName] = useState('');
  const [port, setPort] = useState<number | null>(null);
  const [startNow, setStartNow] = useState(true);
  const [eula, setEula] = useState(false);
  const netbird = useAddressAutomation();
  /** null while the address simply follows the server name. */
  const [netbirdName, setNetbirdName] = useState<string | null>(null);
  const chosenNetbirdName = (netbirdName ?? toNetbirdName(name)).trim();

  const versions = useQuery({
    queryKey: ['versions', software],
    queryFn: () => api<VersionOption[]>(`/api/versions/${software}`),
  });
  const visibleVersions = useMemo(
    () =>
      (versions.data ?? [])
        .filter((v) => showUnstable || v.stable)
        .filter((v) => v.id.toLowerCase().includes(filter.toLowerCase()))
        .slice(0, MAX_VISIBLE_VERSIONS),
    [versions.data, showUnstable, filter],
  );
  const latestStable = versions.data?.find((v) => v.stable)?.id ?? '';
  const chosenVersion = version || latestStable;
  const defaultPort = SOFTWARE[software].defaultPort;
  const chosenPort = port ?? nextFreePort(defaultPort, servers);
  const hostTotal = host?.memoryTotalMb ?? FALLBACK_HOST_MB;
  const hostFree = host ? host.memoryTotalMb - host.memoryUsedMb : null;
  const maxMemory = Math.max(
    MEMORY_SLIDER_MIN_MAX_MB,
    Math.min(MEMORY_CAP_MB, Math.floor(hostTotal / MEMORY_STEP_MB) * MEMORY_STEP_MB),
  );

  const create = useMutation({
    mutationFn: () => {
      const body: CreateServerInput = {
        name: name.trim(),
        edition,
        software,
        version: chosenVersion,
        memoryMb,
        port: chosenPort,
        eula: true,
        autoStart: true,
        startNow,
        ...(netbird && chosenNetbirdName ? { netbirdName: chosenNetbirdName } : {}),
      };
      return api<ServerSummary>('/api/servers', { method: 'POST', body });
    },
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: serversQuery.queryKey });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate(`/servers/${server.id}`);
    },
    onError: () => undefined,
  });

  const pickEdition = (value: Edition): void => {
    const first = CREATABLE_SOFTWARE[value][0] ?? 'paper';
    setEdition(value);
    setSoftware(first);
    setVersion('');
    setPort(null);
    setMemoryMb(recommendedMemoryMb(first));
    setStep(value === 'bedrock' ? STEP_VERSION : STEP_SOFTWARE);
  };
  const pickSoftware = (value: SoftwareId): void => {
    setSoftware(value);
    setVersion('');
    setPort(null);
    setMemoryMb(recommendedMemoryMb(value));
    setStep(STEP_VERSION);
  };

  const canNext: Readonly<Record<number, boolean>> = {
    0: true,
    [STEP_SOFTWARE]: true,
    [STEP_VERSION]: Boolean(chosenVersion),
    [STEP_SIZE]: true,
    [STEP_NAME]: Boolean(name.trim()) && eula,
  };
  const back = (): void =>
    setStep((s) => (edition === 'bedrock' && s === STEP_VERSION ? 0 : Math.max(0, s - 1)));

  return (
    <>
      <PageHeader
        title={t('create.title')}
        subtitle={t('create.subtitle')}
        actions={
          <Button asChild variant="ghost">
            <Link to="/servers/import">
              <Upload />
              {t('create.importInstead')}
            </Link>
          </Button>
        }
      />
      <ol className="flex flex-wrap gap-2 text-xs font-semibold">
        {STEPS.map((key, i) => (
          <li
            key={key}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5',
              i < step && 'bg-accent text-foreground',
              i === step && 'bg-primary text-primary-foreground',
              i > step && 'bg-muted text-muted-foreground',
            )}
          >
            {i < step ? <Check className="size-3.5" /> : <span>{i + 1}</span>}
            {t(`create.${key}`)}
          </li>
        ))}
      </ol>

      <Card className="grid gap-5 p-5 sm:p-6">
        {step === 0 ? (
          <>
            <h2 className="text-xl font-bold">{t('create.editionTitle')}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Choice
                selected={edition === 'java'}
                onClick={() => pickEdition('java')}
                icon={<img src={blockIcon('grass')} alt="" className="pixelated size-12 rounded-[10px]" />}
                title={t('create.java')}
                text={t('create.javaText')}
              />
              <Choice
                selected={edition === 'bedrock'}
                onClick={() => pickEdition('bedrock')}
                icon={<img src={blockIcon('pumpkin')} alt="" className="pixelated size-12 rounded-[10px]" />}
                title={t('create.bedrock')}
                text={t('create.bedrockText')}
              />
            </div>
          </>
        ) : null}

        {step === STEP_SOFTWARE ? (
          <>
            <h2 className="text-xl font-bold">{t('create.softwareTitle')}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {CREATABLE_SOFTWARE[edition].map((id) => (
                <Choice
                  key={id}
                  selected={software === id}
                  onClick={() => pickSoftware(id)}
                  icon={
                    <img
                      src={blockIcon(blockForServer(id, id))}
                      alt=""
                      className="pixelated size-10 rounded-[9px]"
                    />
                  }
                  title={SOFTWARE[id].label}
                  text={t(`create.software.${id}`)}
                  badge={
                    SOFTWARE[id].recommended ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
                        {t('create.recommended')}
                      </span>
                    ) : null
                  }
                />
              ))}
            </div>
          </>
        ) : null}

        {step === STEP_VERSION ? (
          <>
            <div>
              <h2 className="text-xl font-bold">{t('create.versionTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('create.versionHint')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="1.21"
                  className="pl-9"
                  aria-label={t('common.search')}
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Switch checked={showUnstable} onCheckedChange={setShowUnstable} />
                {t('create.showUnstable')}
              </label>
            </div>
            {versions.isPending ? <Skeleton className="h-40" /> : null}
            {versions.error ? (
              <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">
                {t('create.versionsFailed')} {errorText(versions.error)}
              </p>
            ) : null}
            <div
              className="grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-6"
              role="radiogroup"
              aria-label={t('create.versionTitle')}
            >
              {visibleVersions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={chosenVersion === v.id}
                  onClick={() => setVersion(v.id)}
                  className={cn(
                    'rounded-[10px] border border-input bg-secondary px-3 py-2 text-left font-mono text-sm hover:border-primary',
                    chosenVersion === v.id && 'border-primary bg-accent font-semibold',
                  )}
                >
                  {v.id}
                  {v.id === latestStable ? (
                    <span className="ml-1 font-sans text-[11px] text-primary">· {t('create.latest')}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === STEP_SIZE ? (
          <>
            <div>
              <h2 className="text-xl font-bold">{t('create.sizeTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('create.sizeHint', { recommended: formatMemoryMb(recommendedMemoryMb(software)) })}
              </p>
            </div>
            <div className="grid gap-3">
              <span className="tabular text-4xl font-extrabold tracking-[-0.02em]">
                {formatMemoryMb(memoryMb)}
              </span>
              <Slider
                value={[memoryMb]}
                min={MEMORY_MIN_MB}
                max={maxMemory}
                step={MEMORY_STEP_MB}
                onValueChange={([value]) => setMemoryMb(value ?? memoryMb)}
                aria-label={t('create.sizeTitle')}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatMemoryMb(MEMORY_MIN_MB)}</span>
                <span>{formatMemoryMb(maxMemory)}</span>
              </div>
              {hostFree !== null ? (
                <p className={cn('text-sm', memoryMb > hostFree ? 'text-warning' : 'text-muted-foreground')}>
                  {memoryMb > hostFree
                    ? t('create.ramWarn')
                    : t('create.ramFree', { free: formatMemoryMb(hostFree) })}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {step === STEP_NAME ? (
          <>
            <h2 className="text-xl font-bold">{t('create.nameTitle')}</h2>
            <div className="grid gap-4 md:grid-cols-[1fr_200px]">
              <Field id="server-name" label={t('create.name')}>
                <Input
                  id="server-name"
                  autoFocus
                  maxLength={40}
                  value={name}
                  placeholder={t('create.namePlaceholder')}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field
                id="server-port"
                label={t('create.port')}
                hint={t('create.portHint', { port: defaultPort })}
              >
                <Input
                  id="server-port"
                  type="number"
                  inputMode="numeric"
                  value={chosenPort}
                  onChange={(e) => setPort(Number(e.target.value) || null)}
                />
              </Field>
            </div>
            {netbird?.domain ? (
              <Field
                id="server-netbird"
                label={t('netbirdAuto.fieldLabel')}
                hint={t('netbirdAuto.createHint')}
              >
                <NetbirdNameInput
                  id="server-netbird"
                  value={netbirdName ?? toNetbirdName(name)}
                  domain={netbird.domain}
                  onChange={setNetbirdName}
                />
              </Field>
            ) : null}
            <div className="grid gap-2 rounded-[12px] bg-secondary p-4 text-sm">
              <b>{t('create.summary')}</b>
              <span className="text-muted-foreground">
                {edition === 'java' ? t('create.java') : t('create.bedrock')} · {SOFTWARE[software].label}{' '}
                {chosenVersion} · {formatMemoryMb(memoryMb)} · Port {chosenPort}
              </span>
            </div>
            <label className="flex items-center gap-2.5 text-sm font-semibold">
              <Switch checked={startNow} onCheckedChange={setStartNow} />
              {t('create.startNow')}
            </label>
            <div className="flex items-center gap-2.5 text-sm">
              <Checkbox id="eula" checked={eula} onCheckedChange={(v) => setEula(v === true)} />
              <label htmlFor="eula" className="font-semibold">
                {t('create.eula')}
              </label>
              <a
                href={EULA_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                {t('create.eulaLink')}
              </a>
            </div>
            {create.error ? (
              <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">
                {errorText(create.error)}
              </p>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
          <Button variant="secondary" disabled={step === 0} onClick={back}>
            <ChevronLeft />
            {t('common.back')}
          </Button>
          {step < STEP_NAME ? (
            <Button disabled={!canNext[step]} onClick={() => setStep((s) => s + 1)}>
              {t('common.next')}
              <ChevronRight />
            </Button>
          ) : (
            <Button disabled={!canNext[STEP_NAME] || create.isPending} onClick={() => create.mutate()}>
              <Rocket />
              {create.isPending ? t('create.creating') : t('create.submit')}
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
