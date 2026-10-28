import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq, lt, ne } from 'drizzle-orm';
import {
  BUILTIN_ROLES,
  CREATABLE_SOFTWARE,
  SOFTWARE,
  type CreateServerInput,
  type ServerDetail,
  type ServerLive,
  type ServerState,
  type ServerSummary,
  type UpdateServerInput,
} from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { UserRow } from '../auth/context.js';
import type { AppContext } from '../context.js';
import { roles, serverAccess, servers, stats } from '../db/schema.js';
import { randomToken } from '../lib/crypto.js';
import { AppError, badRequest, conflict, errorMessage, notFound } from '../lib/errors.js';
import { HTTP_CONFLICT } from '../lib/http-status.js';
import { BYTES_PER_MB, MS_PER_DAY, MS_PER_SECOND, nowIso, sleep } from '../lib/units.js';
import { createKeyedLock } from '../lib/locks.js';
import { analyseCrash } from './crash.js';
import { isPanelNoise, isStartFinished, parseListAnswer, parseTps, playerEventOf } from './log-parse.js';
import {
  buildContainerSpec,
  commandChannelFor,
  displayAddress,
  imageFor,
  serverDir,
  type ServerRow,
} from './spec.js';

export interface ServerService {
  readonly init: () => Promise<void>;
  readonly shutdown: () => void;
  readonly list: (user: UserRow) => ServerSummary[];
  readonly row: (id: string) => ServerRow;
  readonly rowWithSecrets: (id: string) => ServerRow;
  readonly summary: (id: string) => ServerSummary;
  readonly detail: (id: string, user: UserRow) => ServerDetail;
  readonly create: (input: CreateServerInput, actor: Actor, creator: UserRow) => Promise<ServerSummary>;
  readonly createFromImport: (
    input: Omit<CreateServerInput, 'eula' | 'startNow'> & { id: string },
    actor: Actor,
    creator: UserRow,
  ) => ServerSummary;
  readonly update: (id: string, patch: UpdateServerInput, actor: Actor) => ServerSummary;
  readonly remove: (id: string, deleteFiles: boolean, actor: Actor) => Promise<void>;
  readonly start: (id: string, actor: Actor) => Promise<void>;
  readonly stop: (id: string, actor: Actor) => Promise<void>;
  readonly restart: (id: string, actor: Actor) => Promise<void>;
  readonly kill: (id: string, actor: Actor) => Promise<void>;
  /** Stops and waits until the process is gone (backups, restores, world resets need that). */
  readonly stopAndWait: (id: string, actor: Actor) => Promise<boolean>;
  readonly command: (id: string, command: string, actor: Actor | null) => Promise<string>;
  /** Runs a command without showing it in the console (status polling, player list). */
  readonly quietCommand: (id: string, command: string) => Promise<string>;
  readonly live: (id: string) => ServerLive;
  readonly logs: (id: string) => readonly string[];
  readonly dir: (id: string) => string;
  readonly isRunning: (id: string) => boolean;
  readonly setExtraPorts: (id: string, ports: ServerRow['extraPorts']) => void;
  readonly setGeyser: (id: string, enabled: boolean) => void;
  readonly newId: () => string;
}

interface Runtime {
  state: ServerState;
  players: Set<string>;
  playersMax: number;
  logs: string[];
  stopLogs: (() => void) | null;
  cpu: number | null;
  memMb: number | null;
  tps: number | null;
  startedAt: string | null;
  progress: number | null;
  stopRequested: boolean;
  /** Log lines that arrive before this time are history; they must not fire webhooks again. */
  quietUntil: number;
}

const LOG_BUFFER_LINES = 1000;
const ATTACH_TAIL_LINES = 300;
const STATS_INTERVAL_SECONDS = 10;
const TPS_EVERY_TICKS = 3;
const LIST_EVERY_TICKS = 6;
const PERSIST_EVERY_TICKS = 6;
const STATS_RETENTION_DAYS = 7;
const STOP_TIMEOUT_SECONDS = 60;
const DOCKER_STOP_GRACE_SECONDS = 30;
const POLL_INTERVAL_MS = 500;
const REPLAY_QUIET_MS = 3000;
const CRASH_EXCERPT_LINES = 12;
const DIE_SETTLE_MS = 750;
/** Old statistics are pruned once an hour (360 ticks of 10 seconds). */
const PURGE_EVERY_TICKS = 360;
const ID_BYTES = 5;
const RCON_PASSWORD_BYTES = 18;
const DEFAULT_MAX_PLAYERS = 20;
const ECHO_PREFIX = '\u001b[36m> ';
const ANSI_RESET = '\u001b[0m';
const PANEL_PREFIX = '\u001b[33m[MorniHosting]\u001b[0m ';

const ACTIVE_STATES: readonly ServerState[] = ['starting', 'running'];

function emptyRuntime(): Runtime {
  return {
    state: 'stopped',
    players: new Set(),
    playersMax: DEFAULT_MAX_PLAYERS,
    logs: [],
    stopLogs: null,
    cpu: null,
    memMb: null,
    tps: null,
    startedAt: null,
    progress: null,
    stopRequested: false,
    quietUntil: 0,
  };
}

export function createServerService(ctx: AppContext): ServerService {
  const { db, config, docker, events, settings, audit, secrets, log } = ctx;
  const runtimes = new Map<string, Runtime>();
  const timers: { stats: NodeJS.Timeout | null; tick: number } = { stats: null, tick: 0 };
  const unsubscribers: (() => void)[] = [];

  const rt = (id: string): Runtime => {
    const existing = runtimes.get(id);
    if (existing) return existing;
    const fresh = emptyRuntime();
    runtimes.set(id, fresh);
    return fresh;
  };

  const row = (id: string): ServerRow => {
    const found = db.select().from(servers).where(eq(servers.id, id)).get();
    if (!found) throw notFound('server_not_found');
    return found;
  };

  const rowWithSecrets = (id: string): ServerRow => {
    const r = row(id);
    return { ...r, rconPassword: secrets.decrypt(r.rconPassword) };
  };

  const live = (id: string): ServerLive => {
    const r = rt(id);
    return {
      state: r.state,
      playersOnline: r.players.size,
      playersMax: r.playersMax,
      players: [...r.players].sort((a, b) => a.localeCompare(b)),
      cpuPercent: r.cpu,
      memoryMb: r.memMb,
      tps: r.tps,
      startedAt: r.startedAt,
      progress: r.progress,
    };
  };

  const publishLive = (id: string): void => events.emit('server.live', { serverId: id, live: live(id) });

  const setState = (id: string, state: ServerState): void => {
    const r = rt(id);
    const previous = r.state;
    if (previous === state) return;
    r.state = state;
    if (!ACTIVE_STATES.includes(state)) {
      r.players.clear();
      r.cpu = null;
      r.memMb = null;
      r.tps = null;
      r.progress = null;
    }
    if (state === 'running') r.progress = null;
    events.emit('server.state', { serverId: id, state, previous });
    publishLive(id);
  };

  const appendLog = (id: string, line: string): void => {
    const r = rt(id);
    r.logs.push(line);
    if (r.logs.length > LOG_BUFFER_LINES) r.logs.splice(0, r.logs.length - LOG_BUFFER_LINES);
    events.emit('server.log', { serverId: id, line });
  };

  const panelLog = (id: string, text: string): void => appendLog(id, PANEL_PREFIX + text);

  const handleLine = (id: string, line: string): void => {
    if (isPanelNoise(line)) return;
    appendLog(id, line);
    const r = rt(id);
    if (r.state === 'starting' && isStartFinished(line)) setState(id, 'running');
    const player = playerEventOf(line);
    if (!player) return;
    const quiet = Date.now() < r.quietUntil;
    if (player.kind === 'join') r.players.add(player.player);
    else r.players.delete(player.player);
    if (!quiet)
      events.emit(player.kind === 'join' ? 'player.joined' : 'player.left', {
        serverId: id,
        player: player.player,
      });
    publishLive(id);
  };

  const detachLogs = (id: string): void => {
    const r = rt(id);
    r.stopLogs?.();
    r.stopLogs = null;
  };

  const attachLogs = async (id: string, containerId: string, tail: number | 'all'): Promise<void> => {
    detachLogs(id);
    const stop = await docker.followLogs(containerId, tail, (line) => handleLine(id, line));
    rt(id).stopLogs = stop;
  };

  const withLock = createKeyedLock();

  const addressOf = (r: ServerRow): string => {
    const s = settings.get();
    const host = r.domain || s.publicAddress || s.lanIp || 'localhost';
    return displayAddress(host, r.port, SOFTWARE[r.software].defaultPort);
  };

  const summaryOf = (r: ServerRow): ServerSummary => ({
    id: r.id,
    name: r.name,
    edition: r.edition,
    software: r.software,
    version: r.version,
    memoryMb: r.memoryMb,
    port: r.port,
    address: addressOf(r),
    autoStart: r.autoStart,
    hasIcon: fs.existsSync(path.join(serverDir(config, r.id), 'server-icon.png')),
    live: live(r.id),
    crash: r.crash ?? null,
    createdAt: r.createdAt,
  });

  const assertPortFree = (port: number, protocol: 'tcp' | 'udp', exceptId: string | null): void => {
    const others = db
      .select()
      .from(servers)
      .where(exceptId ? ne(servers.id, exceptId) : undefined)
      .all();
    const taken = others.find(
      (o) =>
        (o.port === port && SOFTWARE[o.software].protocol === protocol) ||
        o.extraPorts.some((p) => p.port === port && p.protocol === protocol),
    );
    if (taken) throw conflict('port_taken', { port, server: taken.name });
  };

  const newId = (): string => randomBytes(ID_BYTES).toString('hex');

  const grantOwner = (creator: UserRow, serverId: string): void => {
    if (creator.isAdmin) return;
    const owner = db.select().from(roles).where(eq(roles.builtIn, 'owner')).get();
    if (owner) db.insert(serverAccess).values({ userId: creator.id, serverId, roleId: owner.id }).run();
  };

  const startError = (id: string, err: unknown): void => {
    const message = errorMessage(err);
    // Docker reports a taken host port as "port is already allocated" or "address already in use".
    const portTaken =
      message.includes('port is already allocated') || message.includes('address already in use');
    const crash = {
      at: nowIso(),
      ruleId: portTaken ? 'port-in-use' : 'start-failed',
      params: { message },
      excerpt: rt(id).logs.slice(-CRASH_EXCERPT_LINES),
    };
    db.update(servers).set({ crash, desiredRunning: false }).where(eq(servers.id, id)).run();
    panelLog(id, `Start fehlgeschlagen: ${message}`);
    setState(id, 'crashed');
    events.emit('server.crashed', { serverId: id, crash });
  };

  const bootContainer = async (id: string): Promise<void> => {
    const r = rowWithSecrets(id);
    const runtime = rt(id);
    runtime.stopRequested = false;
    runtime.progress = 0;
    setState(id, 'starting');
    panelLog(id, `Server wird gestartet (${SOFTWARE[r.software].label} ${r.version}) …`);
    await docker.ensureNetwork(config.mcNetwork);
    await docker.ensureImage(r.image, (percent) => {
      const current = rt(id);
      if (percent !== null && percent !== current.progress) {
        current.progress = percent;
        publishLive(id);
      }
    });
    if (r.containerId) await docker.removeContainer(r.containerId);
    fs.mkdirSync(serverDir(config, id), { recursive: true });
    const spec = buildContainerSpec(config, r, settings.get().timezone);
    const containerId = await docker.createContainer(spec);
    db.update(servers)
      .set({ containerId, crash: null, desiredRunning: true, updatedAt: nowIso() })
      .where(eq(servers.id, id))
      .run();
    await docker.start(containerId);
    // Attach after starting: a container that never ran has no live log stream yet.
    await attachLogs(id, containerId, 'all');
    rt(id).startedAt = nowIso();
    rt(id).progress = null;
    publishLive(id);
  };

  const startInternal = async (id: string): Promise<void> => {
    if (rt(id).state === 'running') return;
    try {
      await bootContainer(id);
    } catch (err) {
      log.warn({ err, serverId: id }, 'server start failed');
      startError(id, err);
    }
  };

  const waitForExit = async (containerId: string, timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    const poll = async (): Promise<boolean> => {
      const state = await docker.inspect(containerId);
      if (!state?.running) return true;
      if (Date.now() > deadline) return false;
      await sleep(POLL_INTERVAL_MS);
      return poll();
    };
    return poll();
  };

  const stopInternal = async (id: string): Promise<boolean> => {
    const r = rowWithSecrets(id);
    const runtime = rt(id);
    db.update(servers).set({ desiredRunning: false }).where(eq(servers.id, id)).run();
    if (!r.containerId || !ACTIVE_STATES.includes(runtime.state)) {
      setState(id, 'stopped');
      return true;
    }
    runtime.stopRequested = true;
    setState(id, 'stopping');
    panelLog(id, 'Server wird sauber heruntergefahren: Welt speichern, dann stoppen …');
    const channel = commandChannelFor(r);
    const isJavaServer = r.edition === 'java' && !SOFTWARE[r.software].proxy;
    try {
      if (isJavaServer) await docker.sendCommand(r.containerId, 'save-all', channel);
      await docker.sendCommand(r.containerId, SOFTWARE[r.software].proxy ? 'end' : 'stop', channel);
    } catch (err) {
      log.info({ err, serverId: id }, 'stop command not delivered, falling back to docker stop');
    }
    const exited = await waitForExit(r.containerId, STOP_TIMEOUT_SECONDS * MS_PER_SECOND);
    if (!exited) await docker.stop(r.containerId, DOCKER_STOP_GRACE_SECONDS);
    setState(id, 'stopped');
    return exited;
  };

  const onContainerDied = async (containerId: string): Promise<void> => {
    const r = db.select().from(servers).where(eq(servers.containerId, containerId)).get();
    if (!r) return;
    const runtime = rt(r.id);
    // The die event can overtake the last log lines; give the log stream a moment to drain.
    await sleep(DIE_SETTLE_MS);
    // During a restart the next container may already be running; this exit is old news then.
    const current = db
      .select({ containerId: servers.containerId })
      .from(servers)
      .where(eq(servers.id, r.id))
      .get();
    if (current?.containerId !== containerId) return;
    detachLogs(r.id);
    if (runtime.stopRequested || runtime.state === 'stopped') {
      setState(r.id, 'stopped');
      return;
    }
    const state = await docker.inspect(containerId);
    const crash = analyseCrash({
      lines: runtime.logs,
      oomKilled: state?.oomKilled ?? false,
      exitCode: state?.exitCode ?? null,
      memoryMb: r.memoryMb,
      javaTag: r.javaTag,
    });
    db.update(servers).set({ crash, desiredRunning: false }).where(eq(servers.id, r.id)).run();
    panelLog(r.id, 'Der Server wurde unerwartet beendet. Der Absturz-Helfer zeigt dir die Ursache.');
    setState(r.id, 'crashed');
    events.emit('server.crashed', { serverId: r.id, crash });
  };

  const quietCommand = async (id: string, command: string): Promise<string> => {
    const r = rowWithSecrets(id);
    if (!r.containerId || !ACTIVE_STATES.includes(rt(id).state)) throw conflict('server_not_running');
    return docker.sendCommand(r.containerId, command, commandChannelFor(r));
  };

  const syncPlayers = async (id: string): Promise<void> => {
    const answer = parseListAnswer(await quietCommand(id, 'list'));
    if (!answer) return;
    const runtime = rt(id);
    runtime.players = new Set(answer.players);
    runtime.playersMax = answer.max;
  };

  const sampleTps = async (id: string, r: ServerRow): Promise<void> => {
    const command = SOFTWARE[r.software].tpsCommand;
    if (!command) return;
    const tps = parseTps(await quietCommand(id, command));
    if (tps !== null) rt(id).tps = tps;
  };

  const sampleOne = async (r: ServerRow, tick: number): Promise<void> => {
    if (!r.containerId) return;
    const runtime = rt(r.id);
    const s = await docker.stats(r.containerId);
    if (s) {
      runtime.cpu = s.cpuPercent;
      runtime.memMb = s.memoryBytes / BYTES_PER_MB;
    }
    const isRunningJava = runtime.state === 'running' && r.edition === 'java' && !SOFTWARE[r.software].proxy;
    if (isRunningJava && !(tick % TPS_EVERY_TICKS)) await sampleTps(r.id, r);
    if (isRunningJava && !(tick % LIST_EVERY_TICKS)) await syncPlayers(r.id);
    if (!(tick % PERSIST_EVERY_TICKS)) {
      db.insert(stats)
        .values({
          serverId: r.id,
          at: Date.now(),
          cpu: runtime.cpu,
          memMb: runtime.memMb,
          players: runtime.players.size,
          tps: runtime.tps,
        })
        .run();
    }
    publishLive(r.id);
  };

  const sampleAll = async (): Promise<void> => {
    timers.tick += 1;
    const tick = timers.tick;
    const active = db
      .select()
      .from(servers)
      .all()
      .filter((r) => ACTIVE_STATES.includes(rt(r.id).state));
    await Promise.all(
      active.map(async (r) => {
        try {
          await sampleOne(r, tick);
        } catch (err) {
          log.debug({ err, serverId: r.id }, 'stats sample failed');
        }
      }),
    );
    if (!(tick % PURGE_EVERY_TICKS)) {
      db.delete(stats)
        .where(lt(stats.at, Date.now() - STATS_RETENTION_DAYS * MS_PER_DAY))
        .run();
    }
  };

  const reconcile = async (r: ServerRow): Promise<void> => {
    const state = r.containerId ? await docker.inspect(r.containerId) : null;
    if (state?.running && r.containerId) {
      const runtime = rt(r.id);
      runtime.state = 'starting';
      runtime.startedAt = state.startedAt;
      runtime.quietUntil = Date.now() + REPLAY_QUIET_MS;
      await attachLogs(r.id, r.containerId, ATTACH_TAIL_LINES);
      return;
    }
    if (r.desiredRunning && r.autoStart) await withLock(r.id, () => startInternal(r.id));
  };

  const ensureBuiltinRoles = (): void => {
    BUILTIN_ROLES.forEach((role) => {
      const existing = db.select().from(roles).where(eq(roles.builtIn, role.key)).get();
      if (!existing) {
        db.insert(roles)
          .values({ name: role.key, description: '', permissions: [...role.permissions], builtIn: role.key })
          .run();
      }
    });
  };

  const service: ServerService = {
    init: async () => {
      ensureBuiltinRoles();
      unsubscribers.push(
        docker.onContainerEvent((event) => {
          if (event.action !== 'die') return;
          void (async () => {
            try {
              await onContainerDied(event.containerId);
            } catch (err) {
              log.error({ err }, 'handling container exit failed');
            }
          })();
        }),
      );
      try {
        await docker.ensureNetwork(config.mcNetwork);
      } catch (err) {
        log.warn({ err }, 'docker not reachable at startup');
      }
      const all = db.select().from(servers).all();
      await Promise.all(
        all.map(async (r) => {
          try {
            await reconcile(r);
          } catch (err) {
            log.warn({ err, serverId: r.id }, 'could not reconcile server');
          }
        }),
      );
      timers.stats = setInterval(() => {
        void sampleAll();
      }, STATS_INTERVAL_SECONDS * MS_PER_SECOND);
    },
    shutdown: () => {
      if (timers.stats) clearInterval(timers.stats);
      unsubscribers.forEach((u) => u());
      [...runtimes.keys()].forEach(detachLogs);
    },
    list: (user) => {
      const visible = ctx.access.visibleServerIds(user);
      return db
        .select()
        .from(servers)
        .all()
        .filter((r) => visible === 'all' || visible.has(r.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(summaryOf);
    },
    row,
    rowWithSecrets,
    summary: (id) => summaryOf(row(id)),
    detail: (id, user) => {
      const r = row(id);
      return {
        ...summaryOf(r),
        javaTag: r.javaTag,
        domain: r.domain,
        image: r.image,
        geyser: r.geyser,
        permissions: ctx.access.permissionsFor(user, id),
      };
    },
    create: async (input, actor, creator) => {
      const info = SOFTWARE[input.software];
      if (!CREATABLE_SOFTWARE[input.edition].includes(input.software))
        throw badRequest('software_edition_mismatch');
      assertPortFree(input.port, info.protocol, null);
      const id = newId();
      const base = {
        id,
        name: input.name,
        edition: input.edition,
        software: input.software,
        version: input.version,
        memoryMb: input.memoryMb,
        port: input.port,
        javaTag: null,
        autoStart: input.autoStart,
      };
      db.insert(servers)
        .values({
          ...base,
          rconPassword: secrets.encrypt(randomToken(RCON_PASSWORD_BYTES)),
          image: imageFor(config, base),
        })
        .run();
      fs.mkdirSync(serverDir(config, id), { recursive: true });
      grantOwner(creator, id);
      audit.record(actor, 'server.create', id, {
        name: input.name,
        software: input.software,
        version: input.version,
      });
      if (input.startNow) {
        rt(id).state = 'starting';
        void withLock(id, () => startInternal(id));
      }
      return summaryOf(row(id));
    },
    createFromImport: (input, actor, creator) => {
      const info = SOFTWARE[input.software];
      assertPortFree(input.port, info.protocol, null);
      const base = { ...input, javaTag: null };
      db.insert(servers)
        .values({
          ...base,
          rconPassword: secrets.encrypt(randomToken(RCON_PASSWORD_BYTES)),
          image: imageFor(config, base),
        })
        .run();
      grantOwner(creator, input.id);
      audit.record(actor, 'server.import', input.id, { name: input.name, software: input.software });
      return summaryOf(row(input.id));
    },
    update: (id, patch, actor) => {
      const current = row(id);
      if (patch.port !== undefined && patch.port !== current.port) {
        assertPortFree(patch.port, SOFTWARE[current.software].protocol, id);
      }
      const next = {
        name: patch.name ?? current.name,
        memoryMb: patch.memoryMb ?? current.memoryMb,
        port: patch.port ?? current.port,
        autoStart: patch.autoStart ?? current.autoStart,
        domain: patch.domain === undefined ? current.domain : patch.domain || null,
        javaTag: patch.javaTag === undefined ? current.javaTag : patch.javaTag,
        version: patch.version ?? current.version,
      };
      const image = imageFor(config, {
        software: current.software,
        version: next.version,
        javaTag: next.javaTag,
      });
      db.update(servers)
        .set({ ...next, image, updatedAt: nowIso() })
        .where(eq(servers.id, id))
        .run();
      audit.record(
        actor,
        'server.update',
        id,
        Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      );
      return summaryOf(row(id));
    },
    remove: async (id, deleteFiles, actor) => {
      const r = row(id);
      await withLock(id, async () => {
        rt(id).stopRequested = true;
        if (r.containerId) {
          const state = await docker.inspect(r.containerId);
          if (state?.running) await docker.kill(r.containerId);
          await docker.removeContainer(r.containerId);
        }
      });
      detachLogs(id);
      db.delete(servers).where(eq(servers.id, id)).run();
      db.delete(stats).where(eq(stats.serverId, id)).run();
      const dirs = ['servers', 'backups', 'trash'].map((d) => path.join(config.dataDir, d, id));
      if (deleteFiles) {
        dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
      } else {
        const archive = path.join(config.dataDir, 'archive', `${r.name.replace(/[^\w.-]+/g, '_')}-${id}`); // eslint-disable-line ts-patterns/require-regex-example -- anything but word characters, dot and dash becomes "_": "Mein Server!" → "Mein_Server_"
        fs.mkdirSync(path.dirname(archive), { recursive: true });
        if (fs.existsSync(dirs[0] ?? '')) fs.renameSync(dirs[0] ?? '', archive);
      }
      runtimes.delete(id);
      audit.record(actor, 'server.delete', null, { serverId: id, name: r.name, deleteFiles });
      events.emit('server.deleted', { serverId: id });
    },
    start: async (id, actor) => {
      row(id);
      if (ACTIVE_STATES.includes(rt(id).state)) throw conflict('server_already_running');
      audit.record(actor, 'server.start', id);
      rt(id).state = 'starting';
      publishLive(id);
      void withLock(id, () => startInternal(id));
    },
    stop: async (id, actor) => {
      row(id);
      audit.record(actor, 'server.stop', id);
      void withLock(id, async () => {
        await stopInternal(id);
      });
    },
    stopAndWait: async (id, actor) => {
      row(id);
      audit.record(actor, 'server.stop', id);
      return withLock(id, () => stopInternal(id));
    },
    restart: async (id, actor) => {
      row(id);
      audit.record(actor, 'server.restart', id);
      void withLock(id, async () => {
        await stopInternal(id);
        await startInternal(id);
      });
    },
    kill: async (id, actor) => {
      const r = row(id);
      audit.record(actor, 'server.kill', id);
      await withLock(id, async () => {
        db.update(servers).set({ desiredRunning: false }).where(eq(servers.id, id)).run();
        rt(id).stopRequested = true;
        if (r.containerId) {
          const state = await docker.inspect(r.containerId);
          if (state?.running) await docker.kill(r.containerId);
        }
        panelLog(id, 'Server wurde sofort beendet.');
        setState(id, 'stopped');
      });
    },
    command: async (id, command, actor) => {
      if (!ACTIVE_STATES.includes(rt(id).state)) throw conflict('server_not_running');
      appendLog(id, `${ECHO_PREFIX}${command}${ANSI_RESET}`);
      try {
        const answer = await quietCommand(id, command);
        answer
          .split('\n')
          .map((l) => l.trimEnd())
          .filter(Boolean)
          .forEach((l) => appendLog(id, l));
        if (actor) audit.record(actor, 'server.command', id, { command });
        return answer;
      } catch (err) {
        if (err instanceof AppError) throw err;
        panelLog(id, `Befehl konnte nicht gesendet werden: ${errorMessage(err)}`);
        throw new AppError(HTTP_CONFLICT, 'command_failed', { message: errorMessage(err) });
      }
    },
    quietCommand,
    live,
    logs: (id) => rt(id).logs,
    dir: (id) => serverDir(config, id),
    isRunning: (id) => ACTIVE_STATES.includes(rt(id).state),
    setExtraPorts: (id, ports) => {
      db.update(servers).set({ extraPorts: ports }).where(eq(servers.id, id)).run();
    },
    setGeyser: (id, enabled) => {
      db.update(servers).set({ geyser: enabled }).where(eq(servers.id, id)).run();
    },
    newId,
  };
  return service;
}
