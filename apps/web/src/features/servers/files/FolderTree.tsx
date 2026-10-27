import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Folder, FolderOpen, House } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileEntry } from '@mornihosting/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const INDENT_PX = 14;
const BASE_PAD_PX = 6;

function Children({
  serverId,
  dir,
  depth,
  current,
  onOpen,
}: {
  serverId: string;
  dir: string;
  depth: number;
  current: string;
  onOpen: (dir: string) => void;
}): ReactElement | null {
  const { data } = useQuery({
    queryKey: ['files', serverId, dir],
    queryFn: () => api<FileEntry[]>(`/api/servers/${serverId}/files?path=${encodeURIComponent(dir)}`),
  });
  const folders = (data ?? []).filter((e) => e.type === 'dir');
  if (!folders.length) return null;
  return (
    <ul role="group">
      {folders.map((folder) => (
        <Node
          key={folder.path}
          serverId={serverId}
          entry={folder}
          depth={depth}
          current={current}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}

function Node({
  serverId,
  entry,
  depth,
  current,
  onOpen,
}: {
  serverId: string;
  entry: FileEntry;
  depth: number;
  current: string;
  onOpen: (dir: string) => void;
}): ReactElement {
  const onPath = current === entry.path || current.startsWith(`${entry.path}/`);
  const [open, setOpen] = useState(onPath);
  const expanded = open || onPath;
  const active = current === entry.path;
  return (
    <li role="treeitem" aria-expanded={expanded} aria-selected={active}>
      <div
        className={cn(
          'flex items-center gap-1 rounded-[8px] pr-2 text-[13px] hover:bg-secondary',
          active && 'bg-accent font-semibold text-foreground',
        )}
        style={{ paddingLeft: BASE_PAD_PX + depth * INDENT_PX }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setOpen(!expanded)}
          className="grid size-5 place-items-center rounded text-muted-foreground"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            onOpen(entry.path);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
        >
          {expanded ? (
            <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <Folder className="size-4 shrink-0 text-primary" aria-hidden />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
      </div>
      {expanded ? (
        <Children serverId={serverId} dir={entry.path} depth={depth + 1} current={current} onOpen={onOpen} />
      ) : null}
    </li>
  );
}

/** Folder tree beside the file list; folders load when opened. */
export function FolderTree({
  serverId,
  current,
  onOpen,
}: {
  serverId: string;
  current: string;
  onOpen: (dir: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div role="tree" aria-label={t('files.tree')}>
      <button
        type="button"
        onClick={() => onOpen('')}
        className={cn(
          'mb-0.5 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] font-semibold hover:bg-secondary',
          current === '' && 'bg-accent',
        )}
      >
        <House className="size-4 text-muted-foreground" aria-hidden />
        {t('files.root')}
      </button>
      <Children serverId={serverId} dir="" depth={0} current={current} onOpen={onOpen} />
    </div>
  );
}
