import { EventEmitter } from 'node:events';
import type { CrashInfo, ServerLive, ServerState } from '@mornihosting/shared';

export interface PanelEvents {
  'server.state': { serverId: string; state: ServerState; previous: ServerState };
  'server.live': { serverId: string; live: ServerLive };
  'server.log': { serverId: string; line: string };
  'server.crashed': { serverId: string; crash: CrashInfo };
  'server.deleted': { serverId: string };
  'player.joined': { serverId: string; player: string };
  'player.left': { serverId: string; player: string };
  'backup.done': { serverId: string; backupId: number; sizeBytes: number };
  'backup.failed': { serverId: string; backupId: number; error: string };
}

export type PanelEventName = keyof PanelEvents;
export type PanelListener<TName extends PanelEventName> = (payload: PanelEvents[TName]) => void;

export interface EventBus {
  readonly on: <TName extends PanelEventName>(name: TName, listener: PanelListener<TName>) => () => void;
  readonly emit: <TName extends PanelEventName>(name: TName, payload: PanelEvents[TName]) => void;
}

/** In-process event bus: services publish what happened, the WebSocket hub, webhooks and stats listen. */
export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    on: (name, listener) => {
      emitter.on(name, listener);
      return () => emitter.off(name, listener);
    },
    emit: (name, payload) => {
      emitter.emit(name, payload);
    },
  };
}
