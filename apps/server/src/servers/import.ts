import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { Edition, SoftwareId } from '@mornihosting/shared';
import { notFound } from '../lib/errors.js';
import { extractZip, listZip } from '../lib/zip.js';
import { MS_PER_HOUR } from '../lib/units.js';
import { minecraftVersionForNeoForge } from './versions.js';

/** Importing an existing server: unpack the upload into a staging folder and guess what it is. */

export interface ImportDetection {
  readonly stagingId: string;
  readonly edition: Edition;
  readonly software: SoftwareId;
  readonly version: string | null;
  readonly files: number;
  readonly bytes: number;
  readonly worlds: readonly string[];
  readonly plugins: number;
  readonly mods: number;
}

const STAGING_BYTES = 6;
const MAX_ENTRIES = 200000;
const STAGING_MAX_AGE_MS = MS_PER_HOUR;
const LOG_HEAD_BYTES = 8192;

// Paper/Purpur jar names carry the game version: "paper-1.21.4-232.jar" → "1.21.4"; "purpur-26.3-12.jar" → "26.3".
// https://regex101.com/?flavor=javascript&regex=%5E(%3F%3Apaper%7Cpurpur)-(%5Cd%2B(%3F%3A%5C.%5Cd%2B)%2B)-%5Cd%2B%5C.jar%24&flags=gm&testString=paper-1.21.4-232.jar%0Apurpur-26.3-12.jar%0Apaper.jar
const PAPER_JAR = /^(?:paper|purpur)-(\d+(?:\.\d+)+)-\d+\.jar$/;
// Paper's version_history.json: "git-Paper-232 (MC: 1.21.4)" → "1.21.4".
// https://regex101.com/?flavor=javascript&regex=MC%3A%20(%5B%5Cd.%5D%2B)&flags=gm&testString=git-Paper-232%20(MC%3A%201.21.4)%0Agit-Paper-232
const MC_IN_HISTORY = /MC: ([\d.]+)/;
// First lines of a server log: "Starting minecraft server version 1.21.4" → "1.21.4".
// https://regex101.com/?flavor=javascript&regex=Starting%20minecraft%20server%20version%20(%5CS%2B)&flags=gm&testString=%5B12%3A00%3A00%5D%20%5BServer%20thread%2FINFO%5D%3A%20Starting%20minecraft%20server%20version%201.21.4%0AStarting%20server
const LOG_VERSION = /Starting minecraft server version (\S+)/;
// Forge library folder names: "1.20.1-47.2.0" → "1.20.1".
// https://regex101.com/?flavor=javascript&regex=%5E(%5Cd%2B(%3F%3A%5C.%5Cd%2B)%2B)-&flags=gm&testString=1.20.1-47.2.0%0A47.2.0
const FORGE_LIB = /^(\d+(?:\.\d+)+)-/;

function stagingRoot(dataDir: string): string {
  return path.join(dataDir, 'tmp', 'import');
}

export function stagingDir(dataDir: string, stagingId: string): string {
  // Ids are hex we generated; anything else cannot name a staging folder.
  if (!/^[0-9a-f]+$/.test(stagingId)) throw notFound(); // eslint-disable-line ts-patterns/require-regex-example -- hex only: "a1b2c3" ok, "../x" rejected
  const dir = path.join(stagingRoot(dataDir), stagingId);
  if (!fs.existsSync(dir)) throw notFound();
  return dir;
}

/** If every entry sits in one top folder (ZIP of a folder), return "Folder/" so it can be stripped. */
export function commonPrefix(names: readonly string[]): string {
  const tops = new Set(names.map((n) => n.replaceAll('\\', '/').split('/')[0] ?? ''));
  const nested = names.every((n) => n.replaceAll('\\', '/').includes('/'));
  const [only] = [...tops];
  return tops.size === 1 && nested && only ? `${only}/` : '';
}

function list(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function readHead(file: string): string {
  try {
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(LOG_HEAD_BYTES);
    const read = fs.readSync(fd, buffer, 0, LOG_HEAD_BYTES, 0);
    fs.closeSync(fd);
    return buffer.toString('utf8', 0, read);
  } catch {
    return '';
  }
}

const SOFTWARE_TESTS: readonly (readonly [SoftwareId, (dir: string, files: readonly string[]) => boolean])[] =
  [
    ['bedrock', (_d, files) => files.includes('bedrock_server') || files.includes('bedrock_server.exe')],
    ['velocity', (_d, files) => files.includes('velocity.toml')],
    ['neoforge', (d) => fs.existsSync(path.join(d, 'libraries', 'net', 'neoforged', 'neoforge'))],
    [
      'forge',
      (d, files) =>
        fs.existsSync(path.join(d, 'libraries', 'net', 'minecraftforge', 'forge')) ||
        files.some((f) => f.startsWith('forge-')),
    ],
    [
      'fabric',
      (d, files) => files.includes('fabric-server-launch.jar') || fs.existsSync(path.join(d, '.fabric')),
    ],
    ['purpur', (_d, files) => files.some((f) => f.startsWith('purpur'))],
    [
      'paper',
      (_d, files) => files.some((f) => f.startsWith('paper')) || files.includes('version_history.json'),
    ],
  ];

function detectSoftware(dir: string): SoftwareId {
  const files = list(dir);
  return SOFTWARE_TESTS.find(([, test]) => test(dir, files))?.[0] ?? 'vanilla';
}

function detectVersion(dir: string, software: SoftwareId): string | null {
  if (software === 'bedrock') return 'LATEST';
  const files = list(dir);
  const fromJar = files.map((f) => f.match(PAPER_JAR)?.[1]).find(Boolean);
  const history = readHead(path.join(dir, 'version_history.json')).match(MC_IN_HISTORY)?.[1];
  const forgeLibs = list(path.join(dir, 'libraries', 'net', 'minecraftforge', 'forge'));
  const fromForge = forgeLibs.map((v) => v.match(FORGE_LIB)?.[1]).find(Boolean);
  const neoLibs = list(path.join(dir, 'libraries', 'net', 'neoforged', 'neoforge'));
  const fromNeo = neoLibs.map(minecraftVersionForNeoForge).find(Boolean);
  const fromLog = readHead(path.join(dir, 'logs', 'latest.log')).match(LOG_VERSION)?.[1];
  return history ?? fromJar ?? fromNeo ?? fromForge ?? fromLog ?? null;
}

function worldsIn(dir: string): string[] {
  const javaWorlds = list(dir).filter((d) => fs.existsSync(path.join(dir, d, 'level.dat')));
  const bedrockWorlds = list(path.join(dir, 'worlds')).filter((d) =>
    fs.existsSync(path.join(dir, 'worlds', d, 'level.dat')),
  );
  return [...javaWorlds, ...bedrockWorlds];
}

const countJars = (dir: string): number => list(dir).filter((f) => f.endsWith('.jar')).length;

/** Removes staging folders older than an hour (abandoned imports). */
function cleanStaging(dataDir: string): void {
  const root = stagingRoot(dataDir);
  list(root)
    .map((name) => path.join(root, name))
    .filter((dir) => Date.now() - fs.statSync(dir).mtimeMs > STAGING_MAX_AGE_MS)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}

/** Saves the uploaded ZIP, unpacks it into a fresh staging folder and reports what it found. */
export async function stageImport(
  dataDir: string,
  upload: Readable,
  maxBytes: number,
): Promise<ImportDetection> {
  cleanStaging(dataDir);
  const stagingId = randomBytes(STAGING_BYTES).toString('hex');
  const dir = path.join(stagingRoot(dataDir), stagingId);
  const zipFile = `${dir}.zip`;
  fs.mkdirSync(path.dirname(zipFile), { recursive: true });
  try {
    await pipeline(upload, fs.createWriteStream(zipFile));
    const prefix = commonPrefix(await listZip(zipFile, MAX_ENTRIES));
    const totals = await extractZip(zipFile, dir, { maxBytes, maxEntries: MAX_ENTRIES }, prefix);
    const software = detectSoftware(dir);
    return {
      stagingId,
      edition: software === 'bedrock' ? 'bedrock' : 'java',
      software,
      version: detectVersion(dir, software),
      files: totals.files,
      bytes: totals.bytes,
      worlds: worldsIn(dir),
      plugins: countJars(path.join(dir, 'plugins')),
      mods: countJars(path.join(dir, 'mods')),
    };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(zipFile, { force: true });
  }
}
