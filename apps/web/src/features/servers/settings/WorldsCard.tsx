import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Globe2, RefreshCcw, Upload } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ServerDetail, WorldInfo } from '@mornihosting/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Progress, Skeleton, Tip } from '@/components/ui/misc';
import { Pill } from '@/components/ui/pill';
import { api, upload } from '@/lib/api';
import { formatBytes, formatRelative } from '@/lib/format';
import { toastError } from '@/lib/query';
import { downloadUrl } from '../files/file-kinds';

const PERCENT = 100;

/** All worlds of the server: which one is played, upload a new one, start fresh with a seed. */
export function WorldsCard({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [seed, setSeed] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const key = ['worlds', server.id];
  const base = `/api/servers/${server.id}/worlds`;
  const stopped = server.live.state === 'stopped' || server.live.state === 'crashed';
  const { data } = useQuery({ queryKey: key, queryFn: () => api<WorldInfo[]>(base) });
  const afterChange = async (worlds: WorldInfo[]): Promise<void> => {
    queryClient.setQueryData(key, worlds);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['properties', server.id] }),
      queryClient.invalidateQueries({ queryKey: ['files', server.id] }),
      queryClient.invalidateQueries({ queryKey: ['trash', server.id] }),
    ]);
  };
  const activate = useMutation({
    mutationFn: (name: string) => api<WorldInfo[]>(`${base}/activate`, { method: 'POST', body: { name } }),
    onSuccess: async (worlds, name) => {
      toast.success(t('settings.worlds.activated', { name }));
      await afterChange(worlds);
    },
  });
  const reset = useMutation({
    mutationFn: () =>
      api<WorldInfo[]>(`${base}/reset`, { method: 'POST', body: seed.trim() ? { seed: seed.trim() } : {} }),
    onSuccess: async (worlds) => {
      toast.success(t('settings.worlds.resetDone'));
      setSeed('');
      await afterChange(worlds);
    },
  });

  const uploadWorld = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file, file.name);
    setProgress(0);
    try {
      const world = await upload<WorldInfo>(`${base}/upload`, form, (p) =>
        setProgress((p.loaded / Math.max(p.total, 1)) * PERCENT),
      );
      toast.success(t('settings.worlds.uploaded', { name: world.name }));
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      toastError(err);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const stoppedHint = stopped ? undefined : t('settings.worlds.stopFirst');
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader className="mb-1 flex-wrap">
        <CardTitle>{t('settings.worlds.title')}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={progress !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Upload />
            {t('settings.worlds.upload')}
          </Button>
          <Tip content={stoppedHint ?? t('settings.worlds.resetHint')}>
            <span>
              <Button size="sm" variant="destructive" disabled={!stopped} onClick={() => setResetOpen(true)}>
                <RefreshCcw />
                {t('settings.worlds.reset')}
              </Button>
            </span>
          </Tip>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => void uploadWorld(e.target.files?.[0])}
        />
      </CardHeader>
      <CardDescription className="mb-4">{t('settings.worlds.text')}</CardDescription>
      {progress !== null ? <Progress value={progress} className="mb-4" /> : null}
      {data ? (
        <ul className="grid gap-2">
          {data.map((world) => (
            <li
              key={world.name}
              className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-3 py-2.5"
            >
              <span className="grid size-9 place-items-center rounded-[10px] bg-accent text-primary">
                <Globe2 className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <b className="flex items-center gap-2 truncate text-sm font-semibold">
                  {world.name}
                  {world.active ? <Pill tone="ok">{t('settings.worlds.active')}</Pill> : null}
                </b>
                <span className="text-[12px] text-muted-foreground">
                  {formatBytes(world.sizeBytes)} · {formatRelative(world.modifiedAt)}
                </span>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                asChild
                aria-label={t('settings.worlds.download', { name: world.name })}
              >
                <a
                  href={downloadUrl(
                    server.id,
                    server.edition === 'bedrock' ? `worlds/${world.name}` : world.name,
                  )}
                  download
                >
                  <Download />
                </a>
              </Button>
              {world.active ? (
                <Check className="size-4 text-success" aria-hidden />
              ) : (
                <Tip content={stoppedHint ?? t('settings.worlds.activateHint')}>
                  <span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!stopped || activate.isPending}
                      onClick={() => activate.mutate(world.name)}
                    >
                      {t('settings.worlds.activate')}
                    </Button>
                  </span>
                </Tip>
              )}
            </li>
          ))}
          {data.length ? null : <p className="text-sm text-muted-foreground">{t('settings.worlds.none')}</p>}
        </ul>
      ) : (
        <Skeleton className="h-28" />
      )}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('settings.worlds.resetTitle')}
        description={t('settings.worlds.resetText')}
        confirmLabel={t('settings.worlds.reset')}
        onConfirm={async () => {
          await reset.mutateAsync();
        }}
      >
        <Field id="world-seed" label={t('settings.worlds.seed')} hint={t('settings.worlds.seedHint')}>
          <Input
            id="world-seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="-4172144997902289642"
          />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}
