import fs from 'node:fs';
import path from 'node:path';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { SOFTWARE, type BackupEntry, type BackupSettings } from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { AppContext } from '../context.js';
import { backups, DEFAULT_BACKUP_SETTINGS, servers as serverTable } from '../db/schema.js';
import { conflict, errorMessage, notFound } from '../lib/errors.js';
import { createKeyedLock } from '../lib/locks.js';
import { BYTES_PER_GB, MS_PER_SECOND, nowIso, sleep } from '../lib/units.js';
import { createZip, extractZip } from '../lib/zip.js';
import type { ServerService } from '../servers/service.js';

/**
 * ZIP backups of a server folder. While the server runs, Minecraft is told to flush and pause saving
 * so the world on disk is consistent. Restoring keeps a safety copy of the current state first.
 */

type Kind = BackupEntry['kind'];
type Row = typeof backups.$inferSelect;

/** Never worth saving: temporary upload/download files and the world lock. */
const ALWAYS_EXCLUDED: readonly string[] = ['**/*.uploading', '**/.*.download', '**/session.lock'];
const SAVE_SETTLE_SECONDS = 3;
const RESTORE_MAX_GB = 256;
const RESTORE_MAX_ENTRIES = 2_000_000;
const SAFETY_COPIES_KEPT = 1;
/** "2026-10-28T01:30:05.123": down to the millisecond, so two quick backups never share a name. */
const TIMESTAMP_LENGTH = 23;
// A leading "./" or "/" in an exclusion: matches the start of "/logs/" and "./cache"; nothing in "logs/".
// https://regex101.com/?regex=%5E%5C.%3F%5C%2F%2B&testString=%2Flogs%2F
const LEADING_SLASH = /^\.?\/+/;

export interface BackupService {
  readonly init: () => void;
  readonly list: (serverId: string) => BackupEntry[];
  /** Starts a backup; resolves when the ZIP is finished (or failed). */
  readonly create: (serverId: string, kind: Kind, actor: Actor) => Promise<BackupEntry>;
  /** Starts a backup in the background and returns the running entry right away. */
  readonly start: (serverId: string, kind: Kind, actor: Actor) => BackupEntry;
  readonly restore: (serverId: string, backupId: number, actor: Actor) => Promise<void>;
  readonly remove: (serverId: string, backupId: number, actor: Actor) => void;
  readonly file: (serverId: string, backupId: number) => { path: string; name: string };
  readonly settings: (serverId: string) => BackupSettings;
  readonly updateSettings: (serverId: string, settings: BackupSettings, actor: Actor) => BackupSettings;
  readonly totalBytes: (serverId: string) => number;
}

/** "logs/" → everything below logs; "*.log" → that pattern in every folder; "world/x" → the path itself. */
export function toGlobs(pattern: string): string[] {
  const clean = pattern.trim().replace(LEADING_SLASH, '');
  if (!clean) return [];
  if (clean.endsWith('/')) return [`${clean}**`];
  if (!clean.includes('/')) return [`**/${clean}`, `**/${clean}/**`];
  return [clean, `${clean}/**`];
}

const toEntry = (r: Row): BackupEntry => ({
  id: r.id,
  fileName: r.fileName,
  sizeBytes: r.sizeBytes,
  createdAt: r.createdAt,
  kind: r.kind,
  status: r.status,
  error: r.error,
});

export function createBackupService(ctx: AppContext, servers: ServerService): BackupService {
  const { db } = ctx;
  const withLock = createKeyedLock();
  const dirOf = (serverId: string): string => path.join(ctx.config.dataDir, 'backups', serverId);
  const rowsOf = (serverId: string): Row[] =>
    db.select().from(backups).where(eq(backups.serverId, serverId)).orderBy(desc(backups.id)).all();
  const rowOf = (serverId: string, backupId: number): Row => {
    const row = db
      .select()
      .from(backups)
      .where(and(eq(backups.serverId, serverId), eq(backups.id, backupId)))
      .get();
    if (!row) throw notFound('backup_not_found');
    return row;
  };

  const settings = (serverId: string): BackupSettings =>
    servers.row(serverId).backupSettings ?? DEFAULT_BACKUP_SETTINGS;

  /** Keeps the newest `keep` normal backups and one safety copy; deletes the rest. */
  const applyRetention = (serverId: string): void => {
    const done = rowsOf(serverId).filter((r) => r.status === 'done');
    const keep = settings(serverId).keep;
    const normal = done.filter((r) => r.kind !== 'before-restore').slice(keep);
    const safety = done.filter((r) => r.kind === 'before-restore').slice(SAFETY_COPIES_KEPT);
    const old = [...normal, ...safety];
    old.forEach((r) => fs.rmSync(path.join(dirOf(serverId), r.fileName), { force: true }));
    if (old.length)
      db.delete(backups)
        .where(
          inArray(
            backups.id,
            old.map((r) => r.id),
          ),
        )
        .run();
  };

  /** Asks the game to write everything to disk and pause saving; returns how to resume. */
  const pauseSaving = async (serverId: string): Promise<() => Promise<void>> => {
    const row = servers.row(serverId);
    const software = SOFTWARE[row.software];
    if (!servers.isRunning(serverId) || software.proxy) return async () => undefined;
    const bedrock = row.edition === 'bedrock';
    const quiet = async (command: string): Promise<void> => {
      try {
        await servers.quietCommand(serverId, command);
      } catch (err) {
        ctx.log.warn({ err, serverId, command }, 'backup: save command failed');
      }
    };
    await quiet(bedrock ? 'save hold' : 'save-off');
    // Java answers "save-all flush" only after writing; Bedrock needs a moment to prepare its files.
    if (bedrock) await sleep(SAVE_SETTLE_SECONDS * MS_PER_SECOND);
    else await quiet('save-all flush');
    return () => quiet(bedrock ? 'save resume' : 'save-on');
  };

  const run = async (serverId: string, row: Row, actor: Actor): Promise<BackupEntry> => {
    const target = path.join(dirOf(serverId), row.fileName);
    const resume = await pauseSaving(serverId);
    try {
      const exclude = [...ALWAYS_EXCLUDED, ...settings(serverId).exclude.flatMap(toGlobs)];
      const size = await createZip(servers.dir(serverId), ['.'], target, exclude);
      db.update(backups).set({ status: 'done', sizeBytes: size }).where(eq(backups.id, row.id)).run();
      ctx.audit.record(actor, 'backup.create', serverId, { file: row.fileName, kind: row.kind });
      ctx.events.emit('backup.done', { serverId, backupId: row.id, sizeBytes: size });
      applyRetention(serverId);
    } catch (err) {
      fs.rmSync(target, { force: true });
      const error = errorMessage(err);
      db.update(backups).set({ status: 'failed', error }).where(eq(backups.id, row.id)).run();
      ctx.events.emit('backup.failed', { serverId, backupId: row.id, error });
      ctx.log.error({ err, serverId }, 'backup failed');
    } finally {
      await resume();
    }
    return toEntry(rowOf(serverId, row.id));
  };

  const begin = (serverId: string, kind: Kind): Row => {
    servers.row(serverId);
    if (rowsOf(serverId).some((r) => r.status === 'running')) throw conflict('backup_running');
    const stamp = nowIso()
      .slice(0, TIMESTAMP_LENGTH)
      .replace('T', '_')
      .replaceAll(':', '-')
      .replace('.', '-');
    const fileName = `${kind === 'before-restore' ? 'vor-wiederherstellung' : 'backup'}-${stamp}.zip`;
    fs.mkdirSync(dirOf(serverId), { recursive: true });
    return db.insert(backups).values({ serverId, fileName, kind, status: 'running' }).returning().get();
  };

  const create = async (serverId: string, kind: Kind, actor: Actor): Promise<BackupEntry> => {
    const row = begin(serverId, kind);
    return withLock(serverId, () => run(serverId, row, actor));
  };

  return {
    init: () => {
      // Backups that were running when the panel stopped can never finish.
      const stale = db.select().from(backups).where(eq(backups.status, 'running')).all();
      stale.forEach((r) => fs.rmSync(path.join(dirOf(r.serverId), r.fileName), { force: true }));
      if (stale.length) {
        db.update(backups)
          .set({ status: 'failed', error: 'interrupted' })
          .where(
            inArray(
              backups.id,
              stale.map((r) => r.id),
            ),
          )
          .run();
      }
    },

    list: (serverId) => {
      servers.row(serverId);
      return rowsOf(serverId).map(toEntry);
    },

    create,

    start: (serverId, kind, actor) => {
      const row = begin(serverId, kind);
      void withLock(serverId, () => run(serverId, row, actor));
      return toEntry(row);
    },

    restore: async (serverId, backupId, actor) => {
      const backup = rowOf(serverId, backupId);
      if (backup.status !== 'done') throw notFound('backup_not_found');
      const wasRunning = servers.isRunning(serverId);
      if (wasRunning) await servers.stopAndWait(serverId, actor);
      const safety = await create(serverId, 'before-restore', actor);
      if (safety.status !== 'done') throw conflict('backup_failed');
      await withLock(serverId, async () => {
        const dir = servers.dir(serverId);
        fs.readdirSync(dir).forEach((name) =>
          fs.rmSync(path.join(dir, name), { recursive: true, force: true }),
        );
        await extractZip(path.join(dirOf(serverId), backup.fileName), dir, {
          maxBytes: RESTORE_MAX_GB * BYTES_PER_GB,
          maxEntries: RESTORE_MAX_ENTRIES,
        });
      });
      ctx.audit.record(actor, 'backup.restore', serverId, { file: backup.fileName });
      if (wasRunning) await servers.start(serverId, actor);
    },

    remove: (serverId, backupId, actor) => {
      const backup = rowOf(serverId, backupId);
      if (backup.status === 'running') throw conflict('backup_running');
      fs.rmSync(path.join(dirOf(serverId), backup.fileName), { force: true });
      db.delete(backups).where(eq(backups.id, backup.id)).run();
      ctx.audit.record(actor, 'backup.delete', serverId, { file: backup.fileName });
    },

    file: (serverId, backupId) => {
      const backup = rowOf(serverId, backupId);
      const file = path.join(dirOf(serverId), backup.fileName);
      if (backup.status !== 'done' || !fs.existsSync(file)) throw notFound('backup_not_found');
      return { path: file, name: backup.fileName };
    },

    settings,

    updateSettings: (serverId, next, actor) => {
      servers.row(serverId);
      db.update(serverTable).set({ backupSettings: next }).where(eq(serverTable.id, serverId)).run();
      ctx.audit.record(actor, 'backup.settings', serverId, { keep: next.keep, exclude: next.exclude });
      applyRetention(serverId);
      return next;
    },

    totalBytes: (serverId) =>
      rowsOf(serverId)
        .filter((r) => r.status === 'done')
        .reduce((sum, r) => sum + r.sizeBytes, 0),
  };
}
