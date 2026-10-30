import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { WorldInfo } from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { FileService } from '../files/service.js';
import { assertSafeName } from '../files/service.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { extractZip, listZip } from '../lib/zip.js';
import { commonPrefix } from './import.js';
import { readPropertiesFile, writePropertiesFile } from './properties-file.js';
import { assertMinecraft } from './spec.js';
import type { ServerService } from './service.js';

/** Worlds: list, upload a ZIP, switch the active one, reset with a new seed. */

const LEVEL_FILE = 'level.dat';
const DIMENSION_SUFFIXES: readonly string[] = ['_nether', '_the_end'];
const MAX_WORLD_ENTRIES = 500000;
const DEFAULT_LEVEL = 'world';

function sizeOf(absolute: string): number {
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(absolute).reduce((sum, child) => sum + sizeOf(path.join(absolute, child)), 0);
}

// Trailing ".zip", any case: matches "Welt.ZIP", not "zip-welt".
// https://regex101.com/?regex=%5C.zip%24&flags=i&testString=Welt.ZIP
const ZIP_SUFFIX = /\.zip$/i;
// Runs of characters that are not letters, digits, space, dot or dash: in "Meine Welt!" it matches "!".
// https://regex101.com/?regex=%5B%5E%5Cw%20.-%5D%2B&flags=g&testString=Meine%20Welt!
const UNSAFE_CHARS = /[^\w .-]+/g;
/** How many numbered names ("world-2", "world-3", …) to try before falling back to a timestamp. */
const NAME_ATTEMPTS = 50;
const FIRST_SUFFIX = 2;

export interface WorldService {
  readonly list: (serverId: string) => WorldInfo[];
  readonly upload: (
    serverId: string,
    fileName: string,
    stream: Readable,
    maxBytes: number,
    actor: Actor,
  ) => Promise<WorldInfo>;
  readonly activate: (serverId: string, name: string, actor: Actor) => void;
  readonly reset: (serverId: string, seed: string | undefined, actor: Actor) => Promise<void>;
}

export function createWorldService(
  servers: ServerService,
  files: FileService,
  audit: {
    record: (a: Actor, action: string, serverId?: string | null, details?: Record<string, unknown>) => void;
  },
): WorldService {
  const worldRoot = (serverId: string): string => {
    assertMinecraft(servers.row(serverId));
    const dir = servers.dir(serverId);
    return servers.row(serverId).edition === 'bedrock' ? path.join(dir, 'worlds') : dir;
  };
  const activeName = (serverId: string): string =>
    readPropertiesFile(servers.dir(serverId)).values['level-name'] ||
    (servers.row(serverId).edition === 'bedrock' ? 'Bedrock level' : DEFAULT_LEVEL);

  const list = (serverId: string): WorldInfo[] => {
    const root = worldRoot(serverId);
    if (!fs.existsSync(root)) return [];
    const active = activeName(serverId);
    return fs
      .readdirSync(root)
      .filter((name) => fs.existsSync(path.join(root, name, LEVEL_FILE)))
      .filter(
        (name) =>
          !DIMENSION_SUFFIXES.some(
            (s) => name.endsWith(s) && fs.existsSync(path.join(root, name.slice(0, -s.length), LEVEL_FILE)),
          ),
      )
      .map((name) => {
        const dims = [name, ...DIMENSION_SUFFIXES.map((s) => name + s)]
          .map((d) => path.join(root, d))
          .filter((d) => fs.existsSync(d));
        return {
          name,
          active: name === active,
          sizeBytes: dims.reduce((sum, d) => sum + sizeOf(d), 0),
          modifiedAt: fs.statSync(path.join(root, name, LEVEL_FILE)).mtime.toISOString(),
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  };

  const requireStopped = (serverId: string): void => {
    if (servers.isRunning(serverId)) throw conflict('server_must_be_stopped');
  };

  return {
    list,
    upload: async (serverId, fileName, stream, maxBytes, actor) => {
      const root = worldRoot(serverId);
      const base = fileName.replace(ZIP_SUFFIX, '').replace(UNSAFE_CHARS, '_').trim() || 'world';
      const numbered = Array.from({ length: NAME_ATTEMPTS }, (_, i) => `${base}-${i + FIRST_SUFFIX}`);
      const name =
        [base, ...numbered].find((n) => !fs.existsSync(path.join(root, n))) ?? `${base}-${Date.now()}`;
      assertSafeName(name);
      const temp = path.join(root, `.${name}.zip`);
      fs.mkdirSync(root, { recursive: true });
      try {
        await pipeline(stream, fs.createWriteStream(temp));
        const prefix = commonPrefix(await listZip(temp, MAX_WORLD_ENTRIES));
        await extractZip(temp, path.join(root, name), { maxBytes, maxEntries: MAX_WORLD_ENTRIES }, prefix);
      } finally {
        fs.rmSync(temp, { force: true });
      }
      if (!fs.existsSync(path.join(root, name, LEVEL_FILE))) {
        fs.rmSync(path.join(root, name), { recursive: true, force: true });
        throw badRequest('world_invalid');
      }
      audit.record(actor, 'world.upload', serverId, { name });
      const info = list(serverId).find((w) => w.name === name);
      if (!info) throw notFound('world_not_found');
      return info;
    },
    activate: (serverId, name, actor) => {
      requireStopped(serverId);
      assertSafeName(name);
      if (!list(serverId).some((w) => w.name === name)) throw notFound('world_not_found');
      writePropertiesFile(servers.dir(serverId), { 'level-name': name });
      audit.record(actor, 'world.activate', serverId, { name });
    },
    reset: async (serverId, seed, actor) => {
      requireStopped(serverId);
      const active = activeName(serverId);
      const root = worldRoot(serverId);
      const rel = path.relative(servers.dir(serverId), root);
      const targets = [active, ...DIMENSION_SUFFIXES.map((s) => active + s)]
        .map((d) => (rel ? `${rel}/${d}` : d))
        .filter((d) => fs.existsSync(path.join(servers.dir(serverId), d)));
      files.remove(serverId, targets);
      writePropertiesFile(servers.dir(serverId), { 'level-seed': seed ?? '' });
      audit.record(actor, 'world.reset', serverId, { name: active, seed: seed ?? '' });
    },
  };
}
