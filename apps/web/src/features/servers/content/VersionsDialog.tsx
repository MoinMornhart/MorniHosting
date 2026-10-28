import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketProject, MarketVersion, ServerDetail } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { Pill } from '@/components/ui/pill';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { errorText } from '@/lib/query';
import { cn } from '@/lib/utils';
import { SOURCE_LABELS } from './sources';

const SHOWN_GAME_VERSIONS = 4;

/** All versions of one project; the newest one that fits is preselected. */
export function VersionsDialog({
  server,
  project,
  onOpenChange,
  installing,
  onInstall,
}: {
  server: ServerDetail;
  project: MarketProject | null;
  onOpenChange: (open: boolean) => void;
  installing: boolean;
  onInstall: (versionId: string | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  const { data, error, isPending } = useQuery({
    queryKey: ['market-versions', server.id, project?.source, project?.id],
    queryFn: () =>
      api<MarketVersion[]>(
        `/api/servers/${server.id}/market/${project?.source}/${encodeURIComponent(project?.id ?? '')}/versions`,
      ),
    enabled: project !== null,
  });
  const recommended =
    data?.find((v) => v.compatible && v.channel === 'release') ?? data?.find((v) => v.compatible);
  const selected = chosen ?? recommended?.id ?? null;

  const list = (): ReactElement => {
    if (isPending) return <Skeleton className="h-48" />;
    if (error) return <p className="text-sm text-destructive">{errorText(error)}</p>;
    if (!data.length) return <p className="text-sm text-muted-foreground">{t('market.noVersions')}</p>;
    return (
      <ul
        className="grid max-h-[45dvh] gap-1 overflow-y-auto"
        role="radiogroup"
        aria-label={t('market.versions')}
      >
        {data.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              role="radio"
              aria-checked={selected === v.id}
              onClick={() => setChosen(v.id)}
              className={cn(
                'flex w-full flex-wrap items-center gap-2 rounded-[10px] border px-3 py-2 text-left text-sm transition-colors',
                selected === v.id ? 'border-primary bg-accent/60' : 'border-transparent hover:bg-secondary',
              )}
            >
              <b className="min-w-0 flex-1 truncate font-semibold">{v.name}</b>
              {v.channel === 'release' ? null : <Pill tone="warn">{t(`market.channel.${v.channel}`)}</Pill>}
              <Pill tone={v.compatible ? 'ok' : 'neutral'} dot={false}>
                {v.compatible
                  ? t('market.fits')
                  : v.gameVersions.slice(-SHOWN_GAME_VERSIONS).join(', ') || t('common.unknown')}
              </Pill>
              {v.publishedAt ? (
                <span className="w-full text-[12px] text-muted-foreground">
                  {formatDateTime(v.publishedAt)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const selectedVersion = data?.find((v) => v.id === selected);
  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) setChosen(null);
        onOpenChange(open);
      }}
    >
      <DialogContent wide>
        <DialogTitle>{project?.name}</DialogTitle>
        <DialogDescription>
          {project?.summary} {project ? `· ${SOURCE_LABELS[project.source]}` : ''}
        </DialogDescription>
        {list()}
        {selectedVersion && !selectedVersion.compatible ? (
          <p className="rounded-[12px] bg-warning-soft px-3 py-2 text-sm text-warning">
            {t('market.notFitWarning')}
          </p>
        ) : null}
        <DialogFooter className="justify-between">
          {project ? (
            <Button variant="ghost" asChild>
              <a href={project.url} target="_blank" rel="noreferrer noopener">
                <ExternalLink />
                {t('content.projectPage')}
              </a>
            </Button>
          ) : null}
          <Button
            disabled={installing || !selected || project?.installable === false}
            onClick={() => onInstall(selected === recommended?.id ? undefined : (selected ?? undefined))}
          >
            <Download />
            {installing
              ? t('market.installing')
              : t('market.installVersion', { version: selectedVersion?.name ?? '' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
