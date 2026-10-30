import fs from 'node:fs';
import path from 'node:path';
import {
  DEMO_GAME_FILES,
  demoBootLines,
  demoGameCommand,
  demoJoinLine,
  demoLeaveLine,
  gameOf,
  type GameInfo,
} from '@mornihosting/shared';
import type { ContainerSpec } from './driver.js';

/**
 * Pretend servers for the other games: console lines from game-demo.ts, a save folder and answers to the
 * commands the panel sends. Only for tests and demo mode; nothing here talks to a real game.
 */

export interface FakeGameHost {
  readonly log: (text: string) => void;
  /** Runs `fn` after `steps` simulated steps while the container is still running. */
  readonly later: (steps: number, fn: () => void) => void;
  readonly exit: (code: number) => void;
  readonly players: Set<string>;
}

const EXIT_OK = 0;

export function isFakeGame(spec: ContainerSpec): GameInfo | null {
  return gameOf(spec.labels['mornihosting.edition'] ?? '');
}

export function prepareGameFiles(spec: ContainerSpec, game: GameInfo): void {
  DEMO_GAME_FILES[game.id].forEach((file) => {
    const full = path.join(spec.dataDir, file);
    if (fs.existsSync(full)) return;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.endsWith('.json') ? '{}\n' : 'fake save');
  });
  fs.mkdirSync(path.join(spec.dataDir, 'logs'), { recursive: true });
}

export function bootGame(host: FakeGameHost, spec: ContainerSpec, game: GameInfo, onReady: () => void): void {
  const mainPort = spec.ports[0]?.containerPort ?? game.ports[0].defaultPort;
  const lines = demoBootLines(game, { version: spec.image.split(':')[1] ?? '', port: mainPort });
  lines.forEach((text, i) => host.later(i + 1, () => host.log(text)));
  host.later(lines.length + 1, onReady);
}

export function gameJoin(host: FakeGameHost, game: GameInfo, name: string): void {
  host.players.add(name);
  host.log(demoJoinLine(game, name));
}

export function gameLeave(host: FakeGameHost, game: GameInfo, name: string): void {
  host.players.delete(name);
  host.log(demoLeaveLine(game, name));
}

export function gameCommand(host: FakeGameHost, game: GameInfo, command: string): string {
  const result = demoGameCommand(game, command, [...host.players]);
  result.lines.forEach((line) => host.log(line));
  if (result.quits) host.later(1, () => host.exit(EXIT_OK));
  return result.answer;
}
