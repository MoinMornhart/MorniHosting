import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, Package, Search } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  SOFTWARE,
  type Compatibility,
  type InstallResult,
  type MarketProject,
  type MarketSearchResult,
  type MarketSort,
  type MarketSource,
  type ServerDetail,
} from '@mornihosting/shared';
import { EmptyState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton, Tip } from '@/components/ui/misc';
import { Pill, type PillTone } from '@/components/ui/pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatCompact, formatRelative } from '@/lib/format';
import { errorText } from '@/lib/query';
import { cn } from '@/lib/utils';
import { SOURCE_LABELS, SOURCE_ORDER } from './sources';
import { VersionsDialog } from './VersionsDialog';

const SEARCH_DELAY_MS = 350;
const SORTS: readonly MarketSort[] = ['downloads', 'updated', 'relevance'];
const COMPAT_TONE: Readonly<Record<Compatibility, PillTone>> = { yes: 'ok', unknown: 'neutral', no: 'warn' };

interface SourceInfo {
  readonly source: MarketSource;
  readonly available: boolean;
  readonly reason: 'software' | 'key' | null;
}

export interface InstallOutcome {
  readonly result: InstallResult;
  readonly name: string;
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function ProjectIcon({ project }: { project: MarketProject }): ReactElement {
  const [failed, setFailed] = useState(false);
  if (project.iconUrl && !failed) {
    return (
      <img
        src={project.iconUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-12 shrink-0 rounded-[12px] bg-secondary object-cover"
      />
    );
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-accent text-primary">
      <Package className="size-6" aria-hidden />
    </span>
  );
}

/** Search the marketplaces and install with one click; only versions that fit the server are offered. */
export function Marketplace({
  server,
  onInstalled,
}: {
  server: ServerDetail;
  onInstalled: (outcome: InstallOutcome) => void;
}): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<MarketSource>('modrinth');
  const [text, setText] = useState('');
  const [sort, setSort] = useState<MarketSort>('downloads');
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [details, setDetails] = useState<MarketProject | null>(null);
  const q = useDebounced(text.trim());
  const software = SOFTWARE[server.software];
  const target = `${software.label} ${server.version}`;

  const { data: sources } = useQuery({
    queryKey: ['market-sources', server.id],
    queryFn: () => api<SourceInfo[]>(`/api/servers/${server.id}/market/sources`),
  });
  const offered = (sources ?? []).filter((s) => s.reason !== 'software');
  const params = new URLSearchParams({
    source,
    q,
    sort,
    page: String(page),
    compatibleOnly: String(compatibleOnly),
  });
  const search = useQuery({
    queryKey: ['market', server.id, source, q, sort, page, compatibleOnly],
    queryFn: () => api<MarketSearchResult>(`/api/servers/${server.id}/market/search?${params.toString()}`),
    enabled: offered.some((s) => s.source === source && s.available),
    placeholderData: keepPreviousData,
    staleTime: 60_000, // eslint-disable-line ts-patterns/no-magic-numbers -- search results may be a minute old
  });
  useEffect(() => setPage(0), [source, q, sort, compatibleOnly]);

  const install = useMutation({
    mutationFn: ({ project, versionId }: { project: MarketProject; versionId?: string }) =>
      api<InstallResult>(`/api/servers/${server.id}/market/install`, {
        method: 'POST',
        body: { source: project.source, projectId: project.id, ...(versionId ? { versionId } : {}) },
      }),
    onSuccess: async (result, { project }) => {
      setDetails(null);
      onInstalled({ result, name: project.name });
      await queryClient.invalidateQueries({ queryKey: ['content', server.id] });
      await queryClient.invalidateQueries({ queryKey: ['market', server.id] });
    },
  });

  const pages = search.data ? Math.ceil(search.data.total / search.data.pageSize) : 0;

  const results = (): ReactElement => {
    const current = offered.find((s) => s.source === source);
    if (current?.reason === 'key') {
      return <EmptyState title={t('market.keyMissingTitle')} text={t('market.keyMissingText')} />;
    }
    if (search.isPending) {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
            <Skeleton key={k} className="h-36 rounded-[16px]" />
          ))}
        </div>
      );
    }
    if (search.error) return <EmptyState title={errorText(search.error)} />;
    if (!search.data.hits.length) {
      return <EmptyState icon={<Search />} title={t('market.noResults')} text={t('market.noResultsText')} />;
    }
    return (
      <div className={cn('grid gap-3 md:grid-cols-2', search.isFetching && 'opacity-70')}>
        {search.data.hits.map((project) => (
          <Card key={`${project.source}-${project.id}`} className="flex flex-col gap-3 p-4">
            <div className="flex gap-3">
              <ProjectIcon project={project} />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setDetails(project)}
                  className="block max-w-full truncate text-left font-semibold hover:text-primary"
                >
                  {project.name}
                </button>
                <p className="truncate text-[12px] text-muted-foreground">
                  {[
                    project.author ? t('market.by', { author: project.author }) : '',
                    t('market.downloads', { count: formatCompact(project.downloads) }),
                    project.updatedAt ? formatRelative(project.updatedAt) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <p className="line-clamp-2 min-h-[2.5em] text-sm text-muted-foreground">{project.summary}</p>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
              <Pill tone={COMPAT_TONE[project.compatible]}>
                {t(`market.compat.${project.compatible}`, { target })}
              </Pill>
              <InstallButton
                project={project}
                busy={install.isPending && install.variables.project.id === project.id}
                disabled={install.isPending}
                onInstall={() => install.mutate({ project })}
              />
            </div>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('market.sources')}>
        {SOURCE_ORDER.filter((s) => offered.some((o) => o.source === s)).map((s) => {
          const info = offered.find((o) => o.source === s);
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              onClick={() => setSource(s)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                source === s
                  ? 'border-primary bg-accent text-foreground'
                  : 'border-input text-muted-foreground hover:bg-secondary hover:text-foreground',
                info?.reason === 'key' && 'border-dashed',
              )}
            >
              {SOURCE_LABELS[s]}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(`market.searchPlaceholder.${software.content === 'mods' ? 'mods' : 'plugins'}`)}
            aria-label={t('common.search')}
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as MarketSort)}>
          <SelectTrigger aria-label={t('market.sort')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`market.sorts.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <label className="flex items-center gap-2 font-semibold text-foreground">
          <Switch checked={compatibleOnly} onCheckedChange={setCompatibleOnly} />
          {t('market.onlyCompatible', { target })}
        </label>
        <span>{t(`market.sourceNote.${source}`)}</span>
      </div>

      {results()}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
            {t('common.back')}
          </Button>
          <span className="tabular text-sm text-muted-foreground">
            {t('market.page', { page: page + 1, pages })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('common.next')}
            <ChevronRight />
          </Button>
        </div>
      ) : null}

      <VersionsDialog
        server={server}
        project={details}
        onOpenChange={(o) => !o && setDetails(null)}
        installing={install.isPending}
        onInstall={(versionId) => details && install.mutate({ project: details, versionId })}
      />
    </div>
  );
}

function InstallButton({
  project,
  busy,
  disabled,
  onInstall,
}: {
  project: MarketProject;
  busy: boolean;
  disabled: boolean;
  onInstall: () => void;
}): ReactElement {
  const { t } = useTranslation();
  if (project.installed) {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Check />
        {t('market.installed')}
      </Button>
    );
  }
  if (!project.installable) {
    return (
      <Tip content={t('market.externalHint')}>
        <Button size="sm" variant="outline" asChild>
          <a href={project.url} target="_blank" rel="noreferrer noopener">
            <ExternalLink />
            {t('market.external')}
          </a>
        </Button>
      </Tip>
    );
  }
  return (
    <Button size="sm" disabled={disabled} onClick={onInstall}>
      <Download className={cn(busy && 'animate-bounce')} />
      {busy ? t('market.installing') : t('market.install')}
    </Button>
  );
}

export function useInstallFeedback(): (outcome: InstallOutcome) => void {
  const { t } = useTranslation();
  return ({ result, name }) => {
    const deps = result.installed.filter((i) => i.dependency).map((i) => i.name);
    toast.success(t('market.installedToast', { name }), {
      description: deps.length ? t('market.withDependencies', { names: deps.join(', ') }) : undefined,
    });
    if (result.manual.length) {
      toast.warning(t('market.manualTitle'), {
        description: result.manual.map((m) => (m.url ? `${m.name}: ${m.url}` : m.name)).join('\n'),
        duration: 20_000, // eslint-disable-line ts-patterns/no-magic-numbers -- long enough to copy the links
      });
    }
  };
}
