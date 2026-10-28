import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import {
  SOFTWARE,
  isValidInterval,
  scheduleToCron,
  type ScheduleAction,
  type ScheduleEntry,
  type ScheduleInput,
} from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { BackupService } from '../backups/service.js';
import type { AppContext } from '../context.js';
import { schedules } from '../db/schema.js';
import { badRequest, conflict, errorMessage, notFound } from '../lib/errors.js';
import { MS_PER_MINUTE, MS_PER_SECOND, nowIso, sleep } from '../lib/units.js';
import type { ServerService } from '../servers/service.js';

/**
 * Runs restarts, backups and commands on a friendly schedule. Croner turns the cron expression into the
 * next run time; our own timer fires early enough to warn players before a restart or stop.
 */

type Row = typeof schedules.$inferSelect;

/** setTimeout cannot wait longer than this (about 24.8 days); longer waits are chained. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/* eslint-disable ts-patterns/no-magic-numbers -- the countdown steps players see, in minutes */
const WARN_STEPS_MINUTES: readonly number[] = [60, 30, 15, 10, 5, 3, 2, 1];
/* eslint-enable ts-patterns/no-magic-numbers */
const FINAL_WARNING_SECONDS = 10;
const WARNED_ACTIONS: readonly ScheduleAction[] = ['restart', 'stop'];

const WARNINGS = {
  de: {
    restart: (m: number) => `Der Server startet in ${m} ${m === 1 ? 'Minute' : 'Minuten'} neu.`,
    stop: (m: number) => `Der Server wird in ${m} ${m === 1 ? 'Minute' : 'Minuten'} gestoppt.`,
    restartNow: `Der Server startet in ${FINAL_WARNING_SECONDS} Sekunden neu!`,
    stopNow: `Der Server stoppt in ${FINAL_WARNING_SECONDS} Sekunden!`,
  },
  en: {
    restart: (m: number) => `The server restarts in ${m} ${m === 1 ? 'minute' : 'minutes'}.`,
    stop: (m: number) => `The server stops in ${m} ${m === 1 ? 'minute' : 'minutes'}.`,
    restartNow: `The server restarts in ${FINAL_WARNING_SECONDS} seconds!`,
    stopNow: `The server stops in ${FINAL_WARNING_SECONDS} seconds!`,
  },
} as const;

interface Armed {
  readonly token: symbol;
  readonly nextRunAt: Date;
  timer: NodeJS.Timeout;
}

export interface ScheduleService {
  readonly init: () => void;
  readonly shutdown: () => void;
  readonly list: (serverId: string) => ScheduleEntry[];
  readonly create: (serverId: string, input: ScheduleInput, actor: Actor) => ScheduleEntry;
  readonly update: (serverId: string, id: number, input: ScheduleInput, actor: Actor) => ScheduleEntry;
  readonly setEnabled: (serverId: string, id: number, enabled: boolean, actor: Actor) => ScheduleEntry;
  readonly remove: (serverId: string, id: number, actor: Actor) => void;
  readonly runNow: (serverId: string, id: number, actor: Actor) => Promise<ScheduleEntry>;
}

export function createScheduleService(
  ctx: AppContext,
  servers: ServerService,
  backups: BackupService,
): ScheduleService {
  const { db } = ctx;
  const armed = new Map<number, Armed>();
  const timezone = (): string => ctx.settings.get().timezone || ctx.config.timezone;
  const actorFor = (row: Row): Actor => ({ userId: null, username: `⏱ ${row.name}`, ip: null });

  const rowOf = (serverId: string, id: number): Row => {
    const row = db.select().from(schedules).where(eq(schedules.id, id)).get();
    if (!row || row.serverId !== serverId) throw notFound();
    return row;
  };

  const toEntry = (row: Row): ScheduleEntry => ({
    id: row.id,
    name: row.name,
    action: row.action,
    command: row.command,
    spec: row.spec,
    enabled: row.enabled,
    warnMinutes: row.warnMinutes,
    nextRunAt: armed.get(row.id)?.nextRunAt.toISOString() ?? null,
    lastRunAt: row.lastRunAt,
    lastResult: row.lastResult,
  });

  const validate = (input: ScheduleInput): void => {
    if (input.spec.kind === 'interval' && !isValidInterval(input.spec.unit, input.spec.every)) {
      throw badRequest('invalid_interval');
    }
    if (input.action === 'command' && !input.command?.trim()) throw badRequest('command_required');
  };

  const say = async (row: Row, text: string): Promise<void> => {
    const server = servers.row(row.serverId);
    if (!servers.isRunning(row.serverId) || SOFTWARE[server.software].proxy) return;
    try {
      await servers.command(row.serverId, `say ${text}`, null);
    } catch (err) {
      ctx.log.warn({ err, scheduleId: row.id }, 'schedule warning not delivered');
    }
  };

  /** Counts down to `at`, telling players at sensible steps (10, 5, 1 minutes, 10 seconds). */
  const warnPlayers = async (row: Row, at: number, stillValid: () => boolean): Promise<void> => {
    if (!WARNED_ACTIONS.includes(row.action) || !row.warnMinutes) return;
    const texts = WARNINGS[ctx.settings.get().defaultLocale];
    const kind = row.action === 'stop' ? 'stop' : 'restart';
    const steps = WARN_STEPS_MINUTES.filter((m) => m <= row.warnMinutes);
    await steps.reduce(async (previous, minutes) => {
      await previous;
      await sleep(Math.max(0, at - minutes * MS_PER_MINUTE - Date.now()));
      if (stillValid()) await say(row, texts[kind](minutes));
    }, Promise.resolve());
    await sleep(Math.max(0, at - FINAL_WARNING_SECONDS * MS_PER_SECOND - Date.now()));
    if (stillValid()) await say(row, kind === 'stop' ? texts.stopNow : texts.restartNow);
    await sleep(Math.max(0, at - Date.now()));
  };

  const ACTIONS: Readonly<Record<ScheduleAction, (row: Row, actor: Actor) => Promise<void>>> = {
    restart: async (row, actor) => {
      // A server someone stopped on purpose stays off.
      if (servers.isRunning(row.serverId)) await servers.restart(row.serverId, actor);
    },
    stop: async (row, actor) => {
      if (servers.isRunning(row.serverId)) await servers.stop(row.serverId, actor);
    },
    start: async (row, actor) => {
      if (!servers.isRunning(row.serverId)) await servers.start(row.serverId, actor);
    },
    backup: async (row, actor) => {
      const result = await backups.create(row.serverId, 'scheduled', actor);
      if (result.status !== 'done') throw new Error(result.error ?? 'backup failed');
    },
    command: async (row, actor) => {
      if (!servers.isRunning(row.serverId)) throw conflict('server_not_running');
      await servers.command(row.serverId, row.command ?? '', actor);
    },
  };

  const execute = async (row: Row, actor: Actor): Promise<void> => {
    const result = await (async (): Promise<'ok' | 'failed'> => {
      try {
        await ACTIONS[row.action](row, actor);
        return 'ok';
      } catch (err) {
        ctx.log.warn({ err: errorMessage(err), scheduleId: row.id }, 'schedule failed');
        return 'failed';
      }
    })();
    db.update(schedules)
      .set({ lastRunAt: nowIso(), lastResult: result })
      .where(eq(schedules.id, row.id))
      .run();
  };

  const disarm = (id: number): void => {
    const current = armed.get(id);
    if (current) clearTimeout(current.timer);
    armed.delete(id);
  };

  const arm = (row: Row): void => {
    disarm(row.id);
    if (!row.enabled) return;
    const next = new Cron(row.cron, { paused: true, timezone: timezone() }).nextRun();
    if (!next) return;
    const token = Symbol(row.name);
    const warnMs = WARNED_ACTIONS.includes(row.action) ? row.warnMinutes * MS_PER_MINUTE : 0;
    const fireAt = next.getTime() - warnMs;
    const entry: Armed = { token, nextRunAt: next, timer: setTimeout(() => undefined, 0) };
    const stillValid = (): boolean => armed.get(row.id)?.token === token;
    const fire = async (): Promise<void> => {
      const fresh = db.select().from(schedules).where(eq(schedules.id, row.id)).get();
      if (!fresh || !stillValid()) return;
      await warnPlayers(fresh, next.getTime(), stillValid);
      if (stillValid()) await execute(fresh, actorFor(fresh));
      const latest = db.select().from(schedules).where(eq(schedules.id, row.id)).get();
      if (latest && stillValid()) arm(latest);
    };
    const wait = (): void => {
      const delay = fireAt - Date.now();
      entry.timer =
        delay > MAX_TIMEOUT_MS
          ? setTimeout(wait, MAX_TIMEOUT_MS)
          : setTimeout(() => void fire(), Math.max(0, delay));
    };
    clearTimeout(entry.timer);
    armed.set(row.id, entry);
    wait();
  };

  const save = (serverId: string, input: ScheduleInput) => ({
    serverId,
    name: input.name,
    action: input.action,
    command: input.action === 'command' ? (input.command?.trim() ?? null) : null,
    spec: input.spec,
    cron: scheduleToCron(input.spec),
    enabled: input.enabled,
    warnMinutes: WARNED_ACTIONS.includes(input.action) ? input.warnMinutes : 0,
  });

  return {
    init: () => {
      db.select().from(schedules).all().forEach(arm);
      ctx.events.on('server.deleted', ({ serverId }) =>
        [...armed.keys()].forEach((id) => {
          const row = db.select().from(schedules).where(eq(schedules.id, id)).get();
          if (!row || row.serverId === serverId) disarm(id);
        }),
      );
    },

    shutdown: () => [...armed.keys()].forEach(disarm),

    list: (serverId) => {
      servers.row(serverId);
      return db.select().from(schedules).where(eq(schedules.serverId, serverId)).all().map(toEntry);
    },

    create: (serverId, input, actor) => {
      servers.row(serverId);
      validate(input);
      const row = db.insert(schedules).values(save(serverId, input)).returning().get();
      arm(row);
      ctx.audit.record(actor, 'schedule.create', serverId, {
        name: row.name,
        action: row.action,
        cron: row.cron,
      });
      return toEntry(row);
    },

    update: (serverId, id, input, actor) => {
      rowOf(serverId, id);
      validate(input);
      const row = db
        .update(schedules)
        .set(save(serverId, input))
        .where(eq(schedules.id, id))
        .returning()
        .get();
      arm(row);
      ctx.audit.record(actor, 'schedule.update', serverId, {
        name: row.name,
        action: row.action,
        cron: row.cron,
      });
      return toEntry(row);
    },

    setEnabled: (serverId, id, enabled, actor) => {
      rowOf(serverId, id);
      const row = db.update(schedules).set({ enabled }).where(eq(schedules.id, id)).returning().get();
      arm(row);
      ctx.audit.record(actor, enabled ? 'schedule.enable' : 'schedule.disable', serverId, { name: row.name });
      return toEntry(row);
    },

    remove: (serverId, id, actor) => {
      const row = rowOf(serverId, id);
      disarm(id);
      db.delete(schedules).where(eq(schedules.id, id)).run();
      ctx.audit.record(actor, 'schedule.delete', serverId, { name: row.name });
    },

    runNow: async (serverId, id, actor) => {
      const row = rowOf(serverId, id);
      ctx.audit.record(actor, 'schedule.run', serverId, { name: row.name });
      await execute(row, actor);
      return toEntry(rowOf(serverId, id));
    },
  };
}
