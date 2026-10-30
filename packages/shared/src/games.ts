/**
 * Games other than Minecraft. Each one runs in a container from a fixed, well-maintained image; the panel
 * only ever starts images listed here (see `allowedGameImages`). Minecraft stays in software.ts.
 *
 * For these games the server's `edition` and `software` both hold the game id.
 */

export const GAME_IDS = ['factorio'] as const;
export type GameId = (typeof GAME_IDS)[number];

/** How console commands reach the game: Source RCON over the internal network, the process' stdin, or not at all. */
export type GameConsole = 'rcon' | 'stdin' | 'none';

export interface GamePort {
  /** Stored as extra port purpose `game-<key>`; "main" is the server's own port. */
  readonly key: string;
  readonly defaultPort: number;
  readonly protocol: 'tcp' | 'udp';
  /** Uses the same number as the main port, just the other protocol (e.g. a game's TCP query next to UDP). */
  readonly sameAsMain?: boolean;
  /** The image reads its listening port from this variable; inside and outside port are then the same. */
  readonly env?: string;
}

export type GameFieldKind = 'text' | 'secret' | 'number' | 'boolean';

/** A setting the person may fill in when ordering or later; it becomes an environment variable. */
export interface GameField {
  readonly key: string;
  readonly env: string;
  readonly kind: GameFieldKind;
  /** Value when nothing was entered (as the image expects it); undefined = variable is left out. */
  readonly fallback?: string;
  /** Shown in the order form already, not only in the server settings. */
  readonly onOrder?: boolean;
  /** Link to the page where the person gets the value (token pages). */
  readonly helpUrl?: string;
}

export interface GameVersion {
  readonly id: string;
  readonly stable: boolean;
}

export interface GameInfo {
  readonly id: GameId;
  readonly label: string;
  /** Docker image without tag. */
  readonly image: string;
  readonly versions: readonly GameVersion[];
  /** Folder inside the container that holds everything worth keeping (the server folder is mounted there). */
  readonly mountPath: string;
  /** All ports players need; the first one is the server's main port. */
  readonly ports: readonly [GamePort, ...GamePort[]];
  readonly console: GameConsole;
  /** RCON port inside the container (reached over the panel's network, never published). */
  readonly rconPort?: number;
  /** Variables that tell the image where RCON listens and which password it takes. */
  readonly rconEnv?: { readonly port?: string; readonly password?: string };
  /** File (relative to the server folder) the image reads its RCON password from; the panel writes it. */
  readonly rconPasswordFile?: string;
  /** Fixed variables (user id, accepting licences, …). */
  readonly env: Readonly<Record<string, string>>;
  readonly fields: readonly GameField[];
  /** Memory packages in GB; `recommendedGb` is the one marked as recommended. */
  readonly packagesGb: readonly number[];
  readonly recommendedGb: number;
  /** About how many players a GB carries, for the package cards. */
  readonly playersPerGb: number;
  readonly maxPlayers: number;
  /** Runs on the JVM: the container needs room beyond the heap. */
  readonly jvm?: boolean;
  /** Command that writes the world to disk (before backups and stopping). */
  readonly saveCommand?: string;
  /** Command that shuts the server down cleanly; without one the container gets SIGTERM. */
  readonly stopCommand?: string;
  /** Command whose answer lists the players online (parsed with `logPatterns.listEntry`). */
  readonly listCommand?: string;
  readonly logPatterns: {
    /** The server is ready for players. */
    readonly ready: RegExp;
    /** Group 1 = player name. */
    readonly join?: RegExp;
    readonly leave?: RegExp;
    /** One player in the answer to `listCommand`; group 1 = name. */
    readonly listEntry?: RegExp;
  };
  /** Steam app id, for the header picture (loaded at runtime, never stored in the repository). */
  readonly steamAppId?: number;
  /** Rough first download, so the order page can warn. */
  readonly downloadGb: number;
  /** Folder (relative to the server folder) where saves live, shown in the file manager hints. */
  readonly savesDir?: string;
}

/** The image's user id; the panel runs as the same id so both can read and write the server folder. */
const RUN_UID = '1000';

/* eslint-disable ts-patterns/no-magic-numbers -- the catalog: ports, sizes and player counts as the games define them */
const FACTORIO_PORT = 34197;
const FACTORIO_RCON = 27015;

// Factorio is ready: "  12.345 Info ServerMultiplayerManager.cpp:983: Matching server connection resumed"
// or "changing state from(CreatingGame) to(InGame)"; rejects "changing state from(Ready) to(PreparedToHostGame)".
// https://regex101.com/?flavor=javascript&regex=Matching%20server%20connection%20resumed%7Cto%5C(InGame%5C)&flags=gm&testString=%20%2012.345%20Info%20ServerMultiplayerManager.cpp%3A983%3A%20Matching%20server%20connection%20resumed%0Achanging%20state%20from(CreatingGame)%20to(InGame)%0Achanging%20state%20from(Ready)%20to(PreparedToHostGame)
const FACTORIO_READY = /Matching server connection resumed|to\(InGame\)/;
// Factorio join: "2026-10-30 12:00:01 [JOIN] Lena joined the game" → "Lena".
// https://regex101.com/?flavor=javascript&regex=%5C%5BJOIN%5C%5D%20(%5CS%2B)%20joined%20the%20game&flags=gm&testString=2026-10-30%2012%3A00%3A01%20%5BJOIN%5D%20Lena%20joined%20the%20game%0A%5BCHAT%5D%20Lena%3A%20hi
const FACTORIO_JOIN = /\[JOIN\] (\S+) joined the game/;
// Factorio leave: "2026-10-30 12:30:00 [LEAVE] Lena left the game" → "Lena".
// https://regex101.com/?flavor=javascript&regex=%5C%5BLEAVE%5C%5D%20(%5CS%2B)%20left%20the%20game&flags=gm&testString=2026-10-30%2012%3A30%3A00%20%5BLEAVE%5D%20Lena%20left%20the%20game%0A%5BJOIN%5D%20Lena%20joined%20the%20game
const FACTORIO_LEAVE = /\[LEAVE\] (\S+) left the game/;
// Answer to "/players online": one line per player, "  Lena (online)" → "Lena"; rejects "Online players (1):".
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs%2B(%5CS%2B)%20%5C(online%5C)%24&flags=gm&testString=Online%20players%20(1)%3A%0A%20%20Lena%20(online)
const FACTORIO_LIST_ENTRY = /^\s+(\S+) \(online\)$/;

export const GAMES: Readonly<Record<GameId, GameInfo>> = Object.freeze({
  factorio: {
    id: 'factorio',
    label: 'Factorio',
    image: 'factoriotools/factorio',
    versions: [
      { id: 'stable', stable: true },
      { id: 'latest', stable: false },
    ],
    mountPath: '/factorio',
    ports: [{ key: 'main', defaultPort: FACTORIO_PORT, protocol: 'udp', env: 'PORT' }],
    console: 'rcon',
    rconPort: FACTORIO_RCON,
    rconEnv: { port: 'RCON_PORT' },
    env: {
      PUID: RUN_UID,
      PGID: RUN_UID,
      GENERATE_NEW_SAVE: 'true',
      SAVE_NAME: 'world',
      LOAD_LATEST_SAVE: 'true',
    },
    fields: [
      { key: 'username', env: 'USERNAME', kind: 'text', helpUrl: 'https://factorio.com/profile' },
      { key: 'token', env: 'TOKEN', kind: 'secret', helpUrl: 'https://factorio.com/profile' },
      { key: 'updateMods', env: 'UPDATE_MODS_ON_START', kind: 'boolean', fallback: 'false' },
      { key: 'spaceAge', env: 'DLC_SPACE_AGE', kind: 'boolean', fallback: 'true', onOrder: true },
    ],
    packagesGb: [2, 3, 4, 6, 8],
    recommendedGb: 3,
    playersPerGb: 4,
    maxPlayers: 64,
    saveCommand: '/server-save',
    stopCommand: '/quit',
    listCommand: '/players online',
    logPatterns: {
      ready: FACTORIO_READY,
      join: FACTORIO_JOIN,
      leave: FACTORIO_LEAVE,
      listEntry: FACTORIO_LIST_ENTRY,
    },
    rconPasswordFile: 'config/rconpw',
    steamAppId: 427520,
    downloadGb: 1,
    savesDir: 'saves',
  },
} satisfies Record<GameId, GameInfo>);
/* eslint-enable ts-patterns/no-magic-numbers */

export function isGameId(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}

/** The game behind an edition or software id, or null for Minecraft. */
export function gameOf(id: string): GameInfo | null {
  return isGameId(id) ? GAMES[id] : null;
}

/** Every image the panel may start for a game, as "repository:tag". */
export function allowedGameImages(): readonly string[] {
  return Object.values(GAMES).flatMap((g) => g.versions.map((v) => `${g.image}:${v.id}`));
}

/** Image for a game version; unknown versions fall back to the first (stable) one. */
export function gameImage(game: GameInfo, version: string): string {
  const known = game.versions.find((v) => v.id === version) ?? game.versions[0];
  return `${game.image}:${known?.id ?? 'latest'}`;
}

/** Steam's header picture of a game, or null. Loaded at runtime only. */
export function steamHeaderUrl(game: GameInfo): string | null {
  return game.steamAppId
    ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steamAppId}/header.jpg`
    : null;
}
