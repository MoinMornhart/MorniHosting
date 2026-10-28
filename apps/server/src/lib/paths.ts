import fs from 'node:fs';
import path from 'node:path';
import { AppError } from './errors.js';
import { HTTP_BAD_REQUEST } from './http-status.js';

/** Thrown for any path that would leave the folder it belongs to (../, absolute paths, symlinks out). */
const outsideError = (): AppError => new AppError(HTTP_BAD_REQUEST, 'path_outside');

const NUL = '\0';

/**
 * Turns a user-supplied relative path into an absolute path inside `root`.
 * "plugins/../server.properties" is fine; "../other-server" and "/etc/passwd" are rejected.
 */
export function resolveInside(root: string, relative: string): string {
  if (relative.includes(NUL)) throw outsideError();
  const cleaned = relative.replaceAll('\\', '/').replace(/^\/+/, ''); // eslint-disable-line ts-patterns/require-regex-example -- drops leading slashes: "/world/level.dat" → "world/level.dat"
  const absolute = path.resolve(root, cleaned);
  const fromRoot = path.relative(root, absolute);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw outsideError();
  return absolute;
}

/** Like resolveInside, and also refuses paths that reach outside through a symbolic link. */
export function resolveInsideReal(root: string, relative: string): string {
  const absolute = resolveInside(root, relative);
  const realRoot = fs.realpathSync(root);
  const existing = nearestExisting(absolute);
  const realExisting = fs.realpathSync(existing);
  const fromRoot = path.relative(realRoot, realExisting);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw outsideError();
  return absolute;
}

function nearestExisting(absolute: string): string {
  if (fs.existsSync(absolute)) return absolute;
  const parent = path.dirname(absolute);
  return parent === absolute ? absolute : nearestExisting(parent);
}

/** Path relative to root with forward slashes, for the API. */
export function toRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}
