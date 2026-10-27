import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { FileEntry, TrashEntry } from '@mornihosting/shared';
import type { Config } from '../config.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { HTTP_PAYLOAD_TOO_LARGE } from '../lib/http-status.js';
import { resolveInsideReal, toRelative } from '../lib/paths.js';
import { BYTES_PER_MB, MS_PER_DAY } from '../lib/units.js';
import { createZip, extractZip } from '../lib/zip.js';

/** The file manager: everything stays inside one server's folder; deleting moves to a trash. */

/** Unpacked ZIP content may be this many times the upload limit. */
export const UNPACK_FACTOR = 2;

export interface FileService {
  readonly list: (serverId: string, relative: string) => FileEntry[];
  readonly read: (
    serverId: string,
    relative: string,
  ) => { content: string; size: number; modifiedAt: string };
  readonly write: (serverId: string, relative: string, content: string) => void;
  readonly mkdir: (serverId: string, relative: string) => void;
  readonly rename: (serverId: string, from: string, to: string) => void;
  readonly remove: (serverId: string, paths: readonly string[]) => number;
  readonly upload: (
    serverId: string,
    directory: string,
    fileName: string,
    stream: Readable,
  ) => Promise<FileEntry>;
  readonly zip: (serverId: string, paths: readonly string[], name: string) => Promise<FileEntry>;
  readonly unzip: (serverId: string, zipPath: string, destination: string) => Promise<number>;
  readonly absolute: (serverId: string, relative: string) => string;
  readonly trash: (serverId: string) => TrashEntry[];
  readonly restore: (serverId: string, trashId: string) => void;
  readonly purge: (serverId: string, trashId: string | null) => void;
  readonly purgeOld: () => void;
}

const MAX_EDIT_MB = 5;
const MAX_EDIT_BYTES = MAX_EDIT_MB * BYTES_PER_MB;
const BINARY_SNIFF_BYTES = 8000;
const TRASH_ID_BYTES = 6;
const TRASH_KEEP_DAYS = 7;
const META_FILE = 'meta.json';
const ITEM_DIR = 'item';
const MAX_ZIP_ENTRIES = 100000;
/** Folders where only plugin/mod files may be dropped in directly. */
const CONTENT_DIRS: readonly string[] = ['plugins', 'mods'];
const CONTENT_EXTENSIONS: readonly string[] = ['.jar', '.zip', '.disabled'];
// File names: no slashes, no control characters, not "." or "..". "config.yml" ok; "a/b" and ".." rejected.
// https://regex101.com/?flavor=javascript&regex=%5E(%3F!%5C.%7B1%2C2%7D%24)%5B%5E%2F%5C%5C%5Cx00-%5Cx1f%5D%7B1%2C255%7D%24&flags=gm&testString=config.yml%0Aa%2Fb%0A..
// eslint-disable-next-line no-control-regex -- control characters are exactly what the pattern forbids
const SAFE_NAME = /^(?!\.{1,2}$)[^/\\\x00-\x1f]{1,255}$/;

interface TrashMeta {
  readonly originalPath: string;
  readonly name: string;
  readonly type: 'file' | 'dir';
  readonly deletedAt: string;
  readonly size: number;
}

function entryOf(root: string, absolute: string): FileEntry {
  const stat = fs.statSync(absolute);
  return {
    name: path.basename(absolute),
    path: toRelative(root, absolute),
    type: stat.isDirectory() ? 'dir' : 'file',
    size: stat.isDirectory() ? 0 : stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function sizeOf(absolute: string): number {
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(absolute).reduce((sum, child) => sum + sizeOf(path.join(absolute, child)), 0);
}

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

export function assertSafeName(name: string): void {
  if (!SAFE_NAME.test(name)) throw badRequest('invalid_name');
}

export function createFileService(config: Config): FileService {
  const rootOf = (serverId: string): string => {
    const root = path.join(config.dataDir, 'servers', serverId);
    fs.mkdirSync(root, { recursive: true });
    return root;
  };
  const trashRoot = (serverId: string): string => path.join(config.dataDir, 'trash', serverId);
  const absolute = (serverId: string, relative: string): string =>
    resolveInsideReal(rootOf(serverId), relative);

  const assertContentUpload = (root: string, directory: string, fileName: string): void => {
    const rel = toRelative(root, directory);
    const ok = CONTENT_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext));
    if (CONTENT_DIRS.includes(rel) && !ok) throw badRequest('extension_not_allowed');
  };

  const moveToTrash = (serverId: string, target: string): void => {
    const root = rootOf(serverId);
    const id = `${Date.now()}-${randomBytes(TRASH_ID_BYTES).toString('hex')}`;
    const dir = path.join(trashRoot(serverId), id);
    fs.mkdirSync(dir, { recursive: true });
    const stat = fs.statSync(target);
    const meta: TrashMeta = {
      originalPath: toRelative(root, target),
      name: path.basename(target),
      type: stat.isDirectory() ? 'dir' : 'file',
      deletedAt: new Date().toISOString(),
      size: sizeOf(target),
    };
    fs.renameSync(target, path.join(dir, ITEM_DIR));
    fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify(meta));
  };

  const readMeta = (dir: string): TrashMeta | null => {
    try {
      // Written by moveToTrash above in this exact shape.
      return JSON.parse(fs.readFileSync(path.join(dir, META_FILE), 'utf8')) as TrashMeta;
    } catch {
      return null;
    }
  };

  const service: FileService = {
    absolute,
    list: (serverId, relative) => {
      const root = rootOf(serverId);
      const dir = absolute(serverId, relative);
      if (!fs.existsSync(dir)) throw notFound();
      if (!fs.statSync(dir).isDirectory()) throw badRequest('not_a_directory');
      return fs
        .readdirSync(dir)
        .map((name) => path.join(dir, name))
        .filter((p) => !fs.lstatSync(p).isSymbolicLink())
        .map((p) => entryOf(root, p))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)); // eslint-disable-line ts-patterns/no-nested-ternary -- folders first, then by name
    },
    read: (serverId, relative) => {
      const file = absolute(serverId, relative);
      if (!fs.existsSync(file)) throw notFound();
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw badRequest('not_a_file');
      if (stat.size > MAX_EDIT_BYTES) throw new AppError(HTTP_PAYLOAD_TOO_LARGE, 'file_too_large');
      const buffer = fs.readFileSync(file);
      if (looksBinary(buffer)) throw badRequest('binary_file');
      return { content: buffer.toString('utf8'), size: stat.size, modifiedAt: stat.mtime.toISOString() };
    },
    write: (serverId, relative, content) => {
      const file = absolute(serverId, relative);
      if (fs.existsSync(file) && !fs.statSync(file).isFile()) throw badRequest('not_a_file');
      if (Buffer.byteLength(content) > MAX_EDIT_BYTES)
        throw new AppError(HTTP_PAYLOAD_TOO_LARGE, 'file_too_large');
      assertSafeName(path.basename(file));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    },
    mkdir: (serverId, relative) => {
      const dir = absolute(serverId, relative);
      assertSafeName(path.basename(dir));
      if (fs.existsSync(dir)) throw conflict('file_exists');
      fs.mkdirSync(dir, { recursive: true });
    },
    rename: (serverId, from, to) => {
      const source = absolute(serverId, from);
      const target = absolute(serverId, to);
      if (!fs.existsSync(source)) throw notFound();
      assertSafeName(path.basename(target));
      if (fs.existsSync(target)) throw conflict('file_exists');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(source, target);
    },
    remove: (serverId, paths) => {
      const root = rootOf(serverId);
      const targets = paths.map((p) => absolute(serverId, p)).filter((p) => p !== root && fs.existsSync(p));
      targets.forEach((target) => moveToTrash(serverId, target));
      return targets.length;
    },
    upload: async (serverId, directory, fileName, stream) => {
      const root = rootOf(serverId);
      const dir = absolute(serverId, directory);
      assertSafeName(fileName);
      assertContentUpload(root, dir, fileName);
      fs.mkdirSync(dir, { recursive: true });
      const target = absolute(serverId, path.join(toRelative(root, dir), fileName));
      const temp = `${target}.uploading`;
      try {
        await pipeline(stream, fs.createWriteStream(temp));
        if ((stream as Readable & { truncated?: boolean }).truncated)
          throw new AppError(HTTP_PAYLOAD_TOO_LARGE, 'file_too_large');
        fs.renameSync(temp, target);
      } catch (err) {
        fs.rmSync(temp, { force: true });
        throw err;
      }
      return entryOf(root, target);
    },
    zip: async (serverId, paths, name) => {
      const root = rootOf(serverId);
      const zipName = name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`;
      assertSafeName(zipName);
      const first = absolute(serverId, paths[0] ?? '.');
      const target = path.join(path.dirname(first), zipName);
      // Re-resolve the target so a zip name can never point outside the server folder.
      absolute(serverId, toRelative(root, target));
      if (fs.existsSync(target)) throw conflict('file_exists');
      const relatives = paths.map((p) => toRelative(root, absolute(serverId, p)));
      await createZip(root, relatives, target);
      return entryOf(root, target);
    },
    unzip: async (serverId, zipPath, destination) => {
      const file = absolute(serverId, zipPath);
      const dest = absolute(serverId, destination);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw notFound();
      const result = await extractZip(file, dest, {
        maxBytes: config.maxUploadBytes * UNPACK_FACTOR,
        maxEntries: MAX_ZIP_ENTRIES,
      });
      return result.files;
    },
    trash: (serverId) => {
      const root = trashRoot(serverId);
      if (!fs.existsSync(root)) return [];
      return fs
        .readdirSync(root)
        .map((id) => ({ id, meta: readMeta(path.join(root, id)) }))
        .filter((e): e is { id: string; meta: TrashMeta } => e.meta !== null)
        .map(({ id, meta }) => ({ id, ...meta }))
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    },
    restore: (serverId, trashId) => {
      assertSafeName(trashId);
      const dir = path.join(trashRoot(serverId), trashId);
      const meta = readMeta(dir);
      if (!meta) throw notFound();
      const target = absolute(serverId, meta.originalPath);
      if (fs.existsSync(target)) throw conflict('file_exists');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(path.join(dir, ITEM_DIR), target);
      fs.rmSync(dir, { recursive: true, force: true });
    },
    purge: (serverId, trashId) => {
      if (trashId === null) {
        fs.rmSync(trashRoot(serverId), { recursive: true, force: true });
        return;
      }
      assertSafeName(trashId);
      fs.rmSync(path.join(trashRoot(serverId), trashId), { recursive: true, force: true });
    },
    purgeOld: () => {
      const base = path.join(config.dataDir, 'trash');
      if (!fs.existsSync(base)) return;
      const cutoff = Date.now() - TRASH_KEEP_DAYS * MS_PER_DAY;
      fs.readdirSync(base).forEach((serverId) =>
        fs
          .readdirSync(path.join(base, serverId))
          .map((id) => path.join(base, serverId, id))
          .filter((dir) => Date.parse(readMeta(dir)?.deletedAt ?? '') < cutoff)
          .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
      );
    },
  };
  return service;
}
