import { useEffect, useRef, useState } from 'react';
import { onMessage, subscribeConsole } from '@/lib/ws';

const MAX_LINES = 2000;

export interface ConsoleFeed {
  /** All lines currently held, oldest first. */
  readonly lines: readonly string[];
  /** Increases on every change; consumers compare it to know what is new. */
  readonly version: number;
  /** True once the server sent its backlog. */
  readonly ready: boolean;
  /** Number of lines dropped from the front since the last reset. */
  readonly dropped: number;
  /** Increases whenever the backlog is replaced (reconnect, first load). */
  readonly resets: number;
}

/** Live console lines of one server over the shared WebSocket. */
export function useConsole(serverId: string, enabled: boolean): ConsoleFeed {
  const buffer = useRef<{ lines: string[]; dropped: number; resets: number }>({
    lines: [],
    dropped: 0,
    resets: 0,
  });
  const [state, setState] = useState<ConsoleFeed>({
    lines: [],
    version: 0,
    ready: false,
    dropped: 0,
    resets: 0,
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const store = buffer.current;
    const publish = (ready: boolean): void =>
      setState((prev) => ({
        lines: store.lines,
        version: prev.version + 1,
        ready: ready || prev.ready,
        dropped: store.dropped,
        resets: store.resets,
      }));
    const off = onMessage((message) => {
      if (message.type === 'console-history' && message.serverId === serverId) {
        store.lines = [...message.lines].slice(-MAX_LINES);
        store.dropped = 0;
        store.resets += 1;
        publish(true);
      }
      if (message.type === 'console' && message.serverId === serverId) {
        const next = [...store.lines, message.line];
        const overflow = Math.max(0, next.length - MAX_LINES);
        store.lines = overflow ? next.slice(overflow) : next;
        store.dropped += overflow;
        publish(false);
      }
    });
    const unsubscribe = subscribeConsole(serverId);
    return () => {
      off();
      unsubscribe();
    };
  }, [serverId, enabled]);

  return state;
}
