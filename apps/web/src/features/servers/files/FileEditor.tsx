import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/legacy-modes/mode/javascript';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror, { EditorView, keymap, type Extension } from '@uiw/react-codemirror';
import { ArrowLeft, Download, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { errorText } from '@/lib/query';
import { useResolvedTheme } from '@/features/shell/theme';
import { downloadUrl, extensionOf } from './file-kinds';

interface FileContent {
  readonly content: string;
  readonly size: number;
  readonly modifiedAt: string;
}

const LANGUAGES: Readonly<Record<string, () => Extension>> = {
  json: () => json(),
  mcmeta: () => json(),
  yml: () => yaml(),
  yaml: () => yaml(),
  properties: () => StreamLanguage.define(properties),
  conf: () => StreamLanguage.define(properties),
  cfg: () => StreamLanguage.define(properties),
  ini: () => StreamLanguage.define(properties),
  toml: () => StreamLanguage.define(toml),
  sh: () => StreamLanguage.define(shell),
  js: () => StreamLanguage.define(javascript),
};

const EDITOR_THEME = EditorView.theme({
  '&': { fontSize: '13px', height: '100%' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, monospace' },
  '.cm-gutters': { borderRight: 'none' },
});

/** The text editor for one file: syntax colours, Ctrl+S to save, a warning before leaving unsaved changes. */
export default function FileEditor({
  serverId,
  path,
  onClose,
}: {
  serverId: string;
  path: string;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const queryClient = useQueryClient();
  const [text, setText] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { data, error, isPending } = useQuery({
    queryKey: ['file', serverId, path],
    queryFn: () =>
      api<FileContent>(`/api/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const save = useMutation({
    mutationFn: (content: string) =>
      api(`/api/servers/${serverId}/files/content`, { method: 'PUT', body: { path, content } }),
    onSuccess: async (_r, content) => {
      queryClient.setQueryData<FileContent>(['file', serverId, path], (prev) =>
        prev ? { ...prev, content } : prev,
      );
      setText(null);
      toast.success(t('files.savedFile', { name: path.split('/').at(-1) }));
      await queryClient.invalidateQueries({ queryKey: ['files', serverId] });
    },
  });
  const value = text ?? data?.content ?? '';
  const dirty = text !== null && text !== data?.content;
  const saveRef = useRef<() => void>(() => undefined);
  saveRef.current = () => {
    if (dirty && !save.isPending) save.mutate(value);
  };

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const extensions = useMemo(() => {
    const language = LANGUAGES[extensionOf(path)];
    return [
      EDITOR_THEME,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            saveRef.current();
            return true;
          },
        },
      ]),
      ...(language ? [language()] : []),
    ];
  }, [path]);

  const name = path.split('/').at(-1) ?? path;
  const header = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <Button variant="ghost" size="sm" onClick={() => (dirty ? setLeaving(true) : onClose())}>
        <ArrowLeft />
        {t('common.back')}
      </Button>
      <div className="min-w-0 flex-1">
        <b className="block truncate font-mono text-[13px]">{path}</b>
        {data ? <span className="text-[12px] text-muted-foreground">{formatBytes(data.size)}</span> : null}
      </div>
      {dirty ? <Pill tone="warn">{t('files.unsaved')}</Pill> : null}
      <Button variant="secondary" size="sm" asChild>
        <a href={downloadUrl(serverId, path)} download>
          <Download />
          <span className="max-sm:sr-only">{t('common.download')}</span>
        </a>
      </Button>
      <Button size="sm" disabled={!dirty || save.isPending} onClick={() => saveRef.current()}>
        <Save />
        {t('common.save')}
        <kbd className="ml-1 hidden rounded bg-black/15 px-1 text-[11px] font-medium sm:inline">
          {t('files.saveShortcut')}
        </kbd>
      </Button>
    </div>
  );

  const body = (): ReactElement => {
    if (isPending) return <Skeleton className="m-4 h-[420px]" />;
    if (error) {
      const binary = error instanceof ApiError && ['binary_file', 'file_too_large'].includes(error.code);
      return (
        <EmptyState
          className="m-4"
          title={binary ? t('files.cannotEdit') : errorText(error)}
          text={binary ? t('files.cannotEditText') : undefined}
          action={
            <Button asChild>
              <a href={downloadUrl(serverId, path)} download>
                <Download />
                {t('common.download')}
              </a>
            </Button>
          }
        />
      );
    }
    return (
      <CodeMirror
        value={value}
        onChange={setText}
        theme={theme}
        extensions={extensions}
        aria-label={name}
        className="h-[calc(100dvh-290px)] min-h-[420px] overflow-hidden"
        height="100%"
        basicSetup={{ foldGutter: true, highlightActiveLine: true }}
      />
    );
  };

  return (
    <Card className="overflow-hidden">
      {header}
      {body()}
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t('files.leaveTitle')}
        description={t('files.leaveText', { name })}
        confirmLabel={t('files.discard')}
        onConfirm={onClose}
      />
    </Card>
  );
}
