import type { GameId, GameInfo } from './games.js';

/**
 * Made-up console output for the other games, used by the panel's pretend Docker (tests, demo mode) and the
 * demo website. The lines look like the real servers print them, so the panel's log patterns match.
 */

const TIME_LENGTH = 19;

export function demoClock(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, TIME_LENGTH);
}

/** Factorio counts seconds since start in front of every line ("   1.234 Info …"). */
function uptime(step: number): string {
  // eslint-disable-next-line ts-patterns/no-magic-numbers -- Factorio pads the uptime to 8 characters with 3 decimals
  return (step * 0.731).toFixed(3).padStart(8);
}

interface DemoBootInput {
  readonly version: string;
  readonly port: number;
}

const BOOT: Readonly<Record<GameId, (input: DemoBootInput) => readonly string[]>> = {
  factorio: ({ version, port }) => [
    `${uptime(0)} 2026-10-30 Factorio ${version === 'latest' ? '2.1.4' : '2.0.72'} (build 83000, linux64, headless)`,
    `${uptime(1)} Mods to be loaded: base, elevated-rails, quality, space-age`,
    `${uptime(2)} Loading map /factorio/saves/world.zip: 1843222 bytes.`,
    `${uptime(3)} Info ServerMultiplayerManager.cpp:983: Hosting game at IP ADDR:({0.0.0.0:${port}})`,
    `${uptime(4)} Info RemoteCommandProcessor.cpp:131: Starting RCON interface at IP ADDR:({0.0.0.0:27015})`,
    `${uptime(5)} Info ServerMultiplayerManager.cpp:808: updateTick(0) changing state from(CreatingGame) to(InGame)`,
  ],
};

const JOIN: Readonly<Record<GameId, (name: string) => string>> = {
  factorio: (name) => `${demoClock()} [JOIN] ${name} joined the game`,
};

const LEAVE: Readonly<Record<GameId, (name: string) => string>> = {
  factorio: (name) => `${demoClock()} [LEAVE] ${name} left the game`,
};

/** Files a fresh server of the game has, so the file manager is not empty. */
export const DEMO_GAME_FILES: Readonly<Record<GameId, readonly string[]>> = {
  factorio: ['saves/world.zip', 'config/server-settings.json', 'mods/mod-list.json'],
};

export function demoBootLines(game: GameInfo, input: DemoBootInput): readonly string[] {
  return BOOT[game.id](input);
}

export function demoJoinLine(game: GameInfo, name: string): string {
  return JOIN[game.id](name);
}

export function demoLeaveLine(game: GameInfo, name: string): string {
  return LEAVE[game.id](name);
}

export interface DemoCommandResult {
  readonly answer: string;
  /** Lines the server prints to its console. */
  readonly lines: readonly string[];
  readonly quits: boolean;
}

/** What the game answers; unknown text is chat (that is what Factorio and the Source games do with "say"). */
export function demoGameCommand(
  game: GameInfo,
  command: string,
  players: readonly string[],
): DemoCommandResult {
  const trimmed = command.trim();
  if (game.listCommand && trimmed === game.listCommand) {
    const answer = [`Online players (${players.length}):`, ...players.map((n) => `  ${n} (online)`)].join(
      '\n',
    );
    return { answer, lines: [], quits: false };
  }
  if (game.saveCommand && trimmed === game.saveCommand)
    return { answer: 'Saving map', lines: [`${demoClock()} [SAVE] Saving map as world`], quits: false };
  if (game.stopCommand && trimmed === game.stopCommand)
    return { answer: '', lines: [`${demoClock()} Quitting: remote-quit.`], quits: true };
  return { answer: '', lines: [`${demoClock()} [CHAT] <server>: ${trimmed}`], quits: false };
}
