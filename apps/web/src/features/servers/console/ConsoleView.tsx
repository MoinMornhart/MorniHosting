import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { useMutation } from '@tanstack/react-query';
import { ArrowDownToLine, Copy, Eraser, Search, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isGameId, type Edition } from '@mornihosting/shared';
import { copyText } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tip } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { colourLine, stripAnsi } from './colors';
import { BEDROCK_COMMANDS, JAVA_COMMANDS, completions } from './commands';
import { useConsole } from './useConsole';

const FONT_SIZE = 13;
const SCROLLBACK = 5000;
const HISTORY_LIMIT = 100;
const MAX_SUGGESTIONS = 6;
const LINE_HEIGHT = 1.35;

const THEME = {
  background: '#0a0f0d',
  foreground: '#cfd8d3',
  cursor: '#0a0f0d',
  selectionBackground: '#10b98155',
  // Minecraft's §0 (black) and §8 (dark grey) must stay readable on the dark terminal.
  black: '#8a9993',
  red: '#fb8a8a',
  green: '#34d399',
  yellow: '#f6b54e',
  blue: '#7cb7ff',
  magenta: '#d6a0ff',
  cyan: '#7fd8ff',
  white: '#cfd8d3',
  brightBlack: '#9aa8a2',
  brightRed: '#ff9e9e',
  brightGreen: '#58e0a4',
  brightYellow: '#ffd27a',
  brightBlue: '#9ccaff',
  brightMagenta: '#e2b8ff',
  brightCyan: '#a5e6ff',
  brightWhite: '#f3f7f5',
};

function historyKey(serverId: string): string {
  return `mh-cmd-history:${serverId}`;
}

function loadHistory(serverId: string): string[] {
  try {
    const raw = localStorage.getItem(historyKey(serverId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveHistory(serverId: string, history: readonly string[]): void {
  try {
    localStorage.setItem(historyKey(serverId), JSON.stringify(history.slice(-HISTORY_LIMIT)));
  } catch {
    // Without storage the history lasts for this visit only.
  }
}

export interface ConsoleViewProps {
  readonly serverId: string;
  readonly edition: Edition;
  readonly players: readonly string[];
  readonly running: boolean;
  readonly canSend: boolean;
  readonly className?: string;
}

/** The live console: a real terminal for the log, a command line with history and Tab completion. */
export function ConsoleView({
  serverId,
  edition,
  players,
  running,
  canSend,
  className,
}: ConsoleViewProps): ReactElement {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<{ terminal: Terminal; fit: FitAddon; search: SearchAddon } | null>(null);
  const written = useRef({ resets: -1, absolute: 0 });
  const feed = useConsole(serverId, true);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>(() => loadHistory(serverId));
  const [cursor, setCursor] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    if (!host.current) return undefined;
    const terminal = new Terminal({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      scrollback: SCROLLBACK,
      convertEol: true,
      disableStdin: true,
      cursorStyle: 'underline',
      cursorInactiveStyle: 'none',
      theme: THEME,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(host.current);
    fit.fit();
    term.current = { terminal, fit, search };
    written.current = { resets: -1, absolute: 0 };
    const onScroll = terminal.onScroll(() => {
      const buffer = terminal.buffer.active;
      setAtBottom(buffer.viewportY >= buffer.baseY);
    });
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      onScroll.dispose();
      terminal.dispose();
      term.current = null;
    };
  }, []);

  useEffect(() => {
    const current = term.current;
    if (!current || !feed.ready) return;
    const state = written.current;
    if (state.resets !== feed.resets) {
      current.terminal.reset();
      state.resets = feed.resets;
      state.absolute = feed.dropped;
    }
    const start = Math.max(0, state.absolute - feed.dropped);
    const fresh = feed.lines.slice(start);
    if (fresh.length) current.terminal.write(fresh.map(colourLine).join('\r\n') + '\r\n');
    state.absolute = feed.dropped + feed.lines.length;
  }, [feed]);

  const send = useMutation({
    mutationFn: (cmd: string) =>
      api<{ answer: string }>(`/api/servers/${serverId}/command`, { method: 'POST', body: { command: cmd } }),
  });

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    // Minecraft takes commands without the slash; other games (Factorio "/players") need it.
    const cmd = isGameId(edition) ? command.trim() : command.trim().replace(/^\//, ''); // eslint-disable-line ts-patterns/require-regex-example -- drops one leading slash: "/list" → "list"
    if (!cmd) return;
    const next = [...history.filter((h) => h !== cmd), cmd];
    setHistory(next);
    saveHistory(serverId, next);
    setCursor(null);
    setCommand('');
    send.mutate(cmd);
    term.current?.terminal.scrollToBottom();
  };

  const suggestions = command
    ? completions(
        command,
        isGameId(edition) ? [] : edition === 'bedrock' ? BEDROCK_COMMANDS : JAVA_COMMANDS,
        players,
      ).slice(0, MAX_SUGGESTIONS)
    : [];

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault();
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setCommand(history[next] ?? '');
    }
    if (e.key === 'ArrowDown' && cursor !== null) {
      e.preventDefault();
      const next = cursor + 1;
      setCursor(next >= history.length ? null : next);
      setCommand(next >= history.length ? '' : (history[next] ?? ''));
    }
    if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault();
      setCommand(suggestions[0] ?? command);
    }
  };

  const runSearch = (value: string, backwards = false): void => {
    setQuery(value);
    const search = term.current?.search;
    if (!search || !value) return;
    const options = {
      decorations: {
        matchOverviewRuler: '#f6b54e',
        activeMatchColorOverviewRuler: '#10b981',
        matchBackground: '#f6b54e55',
        activeMatchBackground: '#10b98188',
      },
    };
    if (backwards) search.findPrevious(value, options);
    else search.findNext(value, options);
  };

  const copyAll = async (): Promise<void> => {
    if (await copyText(feed.lines.map(stripAnsi).join('\n'))) toast.success(t('console.copiedAll'));
  };

  let hint: string | null = null;
  if (!running) hint = t('console.notRunning');
  else if (!canSend) hint = t('console.noCommandPermission');

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {searchOpen ? (
          <Input
            autoFocus
            value={query}
            placeholder={t('console.search')}
            aria-label={t('console.search')}
            className="h-8 max-w-64"
            onChange={(e) => runSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(query, e.shiftKey);
              if (e.key === 'Escape') setSearchOpen(false);
            }}
          />
        ) : null}
        <div className="ml-auto flex gap-1">
          <Tip content={t('console.search')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('console.search')}
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Search />
            </Button>
          </Tip>
          <Tip content={t('console.copyAll')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('console.copyAll')}
              onClick={() => void copyAll()}
            >
              <Copy />
            </Button>
          </Tip>
          <Tip content={t('console.clear')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('console.clear')}
              onClick={() => term.current?.terminal.clear()}
            >
              <Eraser />
            </Button>
          </Tip>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[12px] bg-console p-3">
        <div ref={host} className="h-full min-h-[240px] w-full" />
        {!atBottom ? (
          <Button
            size="sm"
            className="absolute bottom-3 right-3 shadow-float"
            onClick={() => {
              term.current?.terminal.scrollToBottom();
              setAtBottom(true);
            }}
          >
            <ArrowDownToLine />
            {t('console.jumpToEnd')}
          </Button>
        ) : null}
      </div>
      <form onSubmit={submit} className="grid gap-2">
        <div className="flex gap-2">
          <label htmlFor={`cmd-${serverId}`} className="sr-only">
            {t('console.placeholder')}
          </label>
          <Input
            id={`cmd-${serverId}`}
            value={command}
            disabled={!running || !canSend}
            autoComplete="off"
            spellCheck={false}
            placeholder={hint ?? t('console.placeholder')}
            className="font-mono text-[13px]"
            onChange={(e) => {
              setCommand(e.target.value);
              setCursor(null);
            }}
            onKeyDown={onKeyDown}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!running || !canSend || !command.trim() || send.isPending}
          >
            <SendHorizontal />
            {t('console.send')}
          </Button>
        </div>
        {suggestions.length ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Tab">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCommand(s)}
                className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                {s.trim()}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('console.history')}</p>
        )}
      </form>
    </div>
  );
}
