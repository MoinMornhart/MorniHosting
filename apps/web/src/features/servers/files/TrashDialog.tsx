import { useMutation } from '@tanstack/react-query';
import { RotateCcw, Trash2, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TrashEntry } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatBytes, formatRelative } from '@/lib/format';
import { iconFor } from './file-kinds';

/** Deleted files stay here for 7 days; one click brings them back. */
export function TrashDialog({
  open,
  onOpenChange,
  serverId,
  entries,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  entries: readonly TrashEntry[];
  onChanged: () => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const base = `/api/servers/${serverId}/trash`;
  const restore = useMutation({
    mutationFn: (entry: TrashEntry) => api(`${base}/${entry.id}/restore`, { method: 'POST' }),
    onSuccess: async (_r, entry) => {
      toast.success(t('files.restored', { name: entry.name }));
      await onChanged();
    },
  });
  const purge = useMutation({
    mutationFn: (entry: TrashEntry | null) => api(entry ? `${base}/${entry.id}` : base, { method: 'DELETE' }),
    onSuccess: onChanged,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogTitle>{t('files.trash')}</DialogTitle>
        <DialogDescription>{t('files.trashText')}</DialogDescription>
        {entries.length ? (
          <ul className="grid max-h-[50dvh] gap-1 overflow-y-auto">
            {entries.map((entry) => {
              const Icon = iconFor(entry);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-secondary"
                >
                  <Icon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold">{entry.originalPath}</b>
                    <span className="text-[12px] text-muted-foreground">
                      {t('files.deletedAgo', { when: formatRelative(entry.deletedAt) })} ·{' '}
                      {formatBytes(entry.size)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(entry)}
                  >
                    <RotateCcw />
                    {t('common.restore')}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('files.deleteForever', { name: entry.name })}
                    onClick={() => purge.mutate(entry)}
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[12px] bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
            {t('files.trashEmpty')}
          </p>
        )}
        <DialogFooter>
          {entries.length ? (
            <Button variant="destructive" disabled={purge.isPending} onClick={() => purge.mutate(null)}>
              <Trash2 />
              {t('files.emptyTrash')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
