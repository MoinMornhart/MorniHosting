/* eslint-disable ts-patterns/no-magic-numbers -- demo timings, made-up live values and HTTP status codes */
import type {
  MeResponse,
  PanelSettings,
  PasskeyEntry,
  RoleEntry,
  ServerDetail,
  ServerLive,
  ServerPermission,
  SystemStatus,
  UpdateInfo,
  UserListEntry,
  WsClientMessage,
  WsServerMessage,
} from '@mornihosting/shared';
import recordingText from './fixtures.json?raw';

/**
 * A pretend MorniHosting server that lives in the browser, so the real interface can be clicked
 * through without installing anything. Pages answer from a recording of a real demo panel; signing
 * in and out, passkeys, starting and stopping servers, the console, the admin area and updates
 * behave for real until the page is reloaded. Nothing leaves the browser.
 */

interface Fixture {
  readonly status: number;
  readonly body: unknown;
}
interface Recording {
  readonly recordedAt: string;
  readonly ids: Readonly<Record<'survival' | 'create' | 'bedrock', string>>;
  readonly fixtures: Readonly<Record<string, Fixture>>;
  readonly consoles: Readonly<Record<string, readonly string[]>>;
}
interface Reply {
  readonly status: number;
  readonly body?: unknown;
}
interface Request {
  readonly method: string;
  readonly path: string;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
}
type Handler = (request: Request) => Reply | Promise<Reply>;

export const DEMO_USER = 'philip';
export const DEMO_PASSWORD = 'minecraft1';
const LATEST_VERSION = '1.1.0';
const CSRF = 'demo';

const recording = JSON.parse(recordingText) as Recording;
const SHIFT_MS = Date.now() - Date.parse(recording.recordedAt);

// A timestamp from the recording: "2026-10-28T05:39:43.575Z" and "2026-10-20T13:10:11.847288+00:00"
// match; "1.21.4" and "05:39" do not.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7DT%5Cd%7B2%7D%3A%5Cd%7B2%7D%3A%5Cd%7B2%7D(%5C.%5Cd%2B)%3F(Z%7C%5B%2B-%5D%5Cd%7B2%7D%3A%5Cd%7B2%7D)%24&testString=2026-10-28T05%3A39%3A43.575Z%0A2026-10-20T13%3A10%3A11.847288%2B00%3A00%0A1.21.4
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// The clock at the start of a console line: "[05:39:43] [Server thread/INFO]: Done" gives "[05:39:43]".
// https://regex101.com/?flavor=javascript&regex=%5E%5C%5B%5Cd%7B2%7D%3A%5Cd%7B2%7D%3A%5Cd%7B2%7D%5C%5D&testString=%5B05%3A39%3A43%5D%20%5BServer%20thread%2FINFO%5D%3A%20Done%0A%5Binit%5D%20Starting
const LINE_CLOCK = /^\[\d{2}:\d{2}:\d{2}\]/;

/** Moves every recorded time forward, so "two hours ago" stays two hours ago today. */
function shifted<TValue>(value: TValue): TValue {
  if (typeof value === 'string' && ISO_TIME.test(value))
    return new Date(Date.parse(value) + SHIFT_MS).toISOString() as TValue;
  if (Array.isArray(value)) return value.map(shifted) as TValue;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shifted(v)])) as TValue;
  return value;
}

const store = new Map<string, unknown>(
  Object.entries(recording.fixtures).map(([key, fixture]) => [key, shifted(fixture.body)]),
);
const failing = new Map(
  Object.entries(recording.fixtures)
    .filter(([, fixture]) => fixture.status >= 400)
    .map(([key, fixture]) => [key, fixture]),
);
const read = <TValue>(key: string): TValue => store.get(key) as TValue;

const nowIso = (): string => new Date().toISOString();
const clock = (): string => new Date().toTimeString().slice(0, 8);
const pick = <TItem>(items: readonly TItem[]): TItem | undefined =>
  items[Math.floor(Math.random() * items.length)];
const randomText = (length: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) =>
    'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(b % 56),
  ).join('');

/* ---------- State that changes while clicking around ---------- */

const adminMe = read<MeResponse>('/api/auth/me');
const roles = read<RoleEntry[]>('/api/roles');
const state = {
  userId: null as number | null,
  users: read<UserListEntry[]>('/api/users'),
  passwords: new Map<string, string>([
    [DEMO_USER, DEMO_PASSWORD],
    ['lena', 'lena-passwort-1'],
    ['finn', 'finn-passwort-1'],
  ]),
  theme: adminMe.user.theme,
  passkeys: new Map<number, PasskeyEntry[]>([
    [
      adminMe.user.id,
      [{ id: 'demo-passkey', name: 'Dieses Gerät (Demo)', createdAt: nowIso(), lastUsedAt: null }],
    ],
  ]),
  settings: read<PanelSettings>('/api/settings'),
  update: {
    current: '1.0.0',
    latest: LATEST_VERSION,
    available: true,
    notes:
      '## Neu\n- Anmelden mit Passkey\n- Admin-Bereich mit Domain, Updates und Passwörtern\n\n## Verbessert\n- Statistik zeigt auch TPS',
    url: 'https://github.com/MoinMornhart/MorniHosting/releases',
    checkedAt: nowIso(),
    canSelfUpdate: true,
    updating: false,
  } satisfies UpdateInfo as UpdateInfo,
  servers: new Map<string, ServerDetail>(
    read<ServerDetail[]>('/api/servers').map((s) => [s.id, read<ServerDetail>(`/api/servers/${s.id}`) ?? s]),
  ),
  consoles: new Map<string, string[]>(
    Object.entries(recording.consoles).map(([id, lines]) => [id, [...lines]]),
  ),
  /** Demo servers made with the wizard borrow pages from a recorded server of the same kind. */
  templates: new Map<string, string>(),
};

const userById = (id: number | null): UserListEntry | undefined => state.users.find((u) => u.id === id);

function permissionsOf(user: UserListEntry): Record<string, readonly ServerPermission[]> {
  if (user.isAdmin) return adminMe.access;
  return Object.fromEntries(
    user.access.map((a) => [a.serverId, roles.find((r) => r.id === a.roleId)?.permissions ?? []]),
  );
}

function meNow(): MeResponse | null {
  const user = userById(state.userId);
  if (!user) return null;
  const { access: _access, ...info } = user;
  return { user: { ...info, theme: state.theme }, csrfToken: CSRF, access: permissionsOf(user) };
}

/* ---------- Live updates (the WebSocket) ---------- */

class DemoSocket extends EventTarget {
  readyState = 0;
  servers = false;
  readonly consoles = new Set<string>();

  constructor() {
    super();
    sockets.add(this);
    window.setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    }, 60);
  }

  send(raw: string): void {
    const message = JSON.parse(raw) as WsClientMessage;
    if (message.type === 'subscribe' && message.channel === 'servers') this.servers = true;
    if (message.type === 'subscribe' && message.channel === 'console') {
      this.consoles.add(message.serverId);
      this.emit({
        type: 'console-history',
        serverId: message.serverId,
        lines: state.consoles.get(message.serverId) ?? [],
      });
    }
    if (message.type === 'unsubscribe') this.consoles.delete(message.serverId);
    if (message.type === 'ping') this.emit({ type: 'pong' });
  }

  close(): void {
    this.readyState = 3;
    sockets.delete(this);
    this.dispatchEvent(new Event('close'));
  }

  emit(message: WsServerMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}
const sockets = new Set<DemoSocket>();

function log(serverId: string, line: string): void {
  const lines = [...(state.consoles.get(serverId) ?? []), line].slice(-500);
  state.consoles.set(serverId, lines);
  sockets.forEach((s) =>
    s.consoles.has(serverId) ? s.emit({ type: 'console', serverId, line }) : undefined,
  );
}
const info = (text: string): string => `[${clock()}] [Server thread/INFO]: ${text}`;

function setLive(serverId: string, patch: Partial<ServerLive>): void {
  const server = state.servers.get(serverId);
  if (!server) return;
  const live = { ...server.live, ...patch };
  state.servers.set(serverId, { ...server, live });
  sockets.forEach((s) => (s.servers ? s.emit({ type: 'live', serverId, live }) : undefined));
}

const PLAYERS = [
  'Lena_Baut',
  'Papa_M',
  'Finn2015',
  'Mia.Builds',
  'KaiKocht',
  'Juna',
  'Tobi_04',
  'Pixelpaul',
  'Ella',
];

/** Every two seconds: a little CPU and RAM movement, and now and then someone joins or leaves. */
function tick(): void {
  state.servers.forEach((server, id) => {
    const live = server.live;
    if (live.state !== 'running') return;
    const roll = Math.random();
    const leaving = roll < 0.06 && live.players.length > 0 ? pick(live.players) : undefined;
    const joining =
      roll > 0.92 && live.players.length < 8
        ? pick(PLAYERS.filter((p) => !live.players.includes(p)))
        : undefined;
    const players = [...live.players.filter((p) => p !== leaving), ...(joining ? [joining] : [])];
    if (joining) log(id, info(`${joining} joined the game`));
    if (leaving) log(id, info(`${leaving} left the game`));
    const base = server.edition === 'bedrock' ? 5 : 9;
    setLive(id, {
      players,
      playersOnline: players.length,
      cpuPercent: base + players.length * 3 + Math.random() * 6,
      memoryMb: Math.min(
        server.memoryMb * 0.92,
        server.memoryMb * 0.45 + players.length * 160 + Math.random() * 90,
      ),
      tps:
        server.edition === 'java' ? Math.min(20, 19.5 + Math.random() * 0.6 - players.length * 0.04) : null,
    });
  });
}

/* ---------- Starting and stopping ---------- */

const STEP_MS = 700;
const after = (ms: number, run: () => void): void => {
  window.setTimeout(run, ms);
};

function templateOf(serverId: string): string {
  return state.templates.get(serverId) ?? serverId;
}

function startServer(serverId: string): void {
  const server = state.servers.get(serverId);
  if (!server) return;
  setLive(serverId, { state: 'starting', progress: 0, startedAt: null });
  log(
    serverId,
    `\u001b[33m[MorniHosting]\u001b[0m Server wird gestartet (${server.software} ${server.version}) …`,
  );
  const boot = (recording.consoles[templateOf(serverId)] ?? [])
    .filter((line) => LINE_CLOCK.test(line))
    .slice(0, 12)
    .map((line) => line.replace(LINE_CLOCK, ''));
  boot.forEach((line, i) => after((i + 1) * 260, () => log(serverId, `[${clock()}]${line}`)));
  [25, 55, 80, 95].forEach((progress, i) => after((i + 1) * STEP_MS, () => setLive(serverId, { progress })));
  after(STEP_MS * 5, () => {
    log(serverId, info('Done (3.214s)! For help, type "help"'));
    setLive(serverId, {
      state: 'running',
      progress: null,
      startedAt: nowIso(),
      players: [],
      playersOnline: 0,
      cpuPercent: 30,
      memoryMb: server.memoryMb * 0.4,
      tps: server.edition === 'java' ? 20 : null,
    });
  });
}

function stopServer(serverId: string, then?: () => void): void {
  setLive(serverId, { state: 'stopping', progress: null });
  log(serverId, info('Stopping the server'));
  log(serverId, info('Saving worlds'));
  after(STEP_MS * 2, () => {
    setLive(serverId, {
      state: 'stopped',
      players: [],
      playersOnline: 0,
      cpuPercent: null,
      memoryMb: null,
      tps: null,
      startedAt: null,
    });
    log(serverId, '\u001b[33m[MorniHosting]\u001b[0m Server ist gestoppt. Die Welt ist gespeichert.');
    then?.();
  });
}

const ACTIONS: Readonly<Record<string, (serverId: string) => void>> = {
  start: startServer,
  stop: (id) => stopServer(id),
  restart: (id) => stopServer(id, () => startServer(id)),
  kill: (id) => {
    setLive(id, {
      state: 'stopped',
      players: [],
      playersOnline: 0,
      cpuPercent: null,
      memoryMb: null,
      tps: null,
    });
    log(id, '\u001b[31m[MorniHosting]\u001b[0m Server wurde hart beendet.');
  },
};

function answerFor(serverId: string, command: string): string {
  const live = state.servers.get(serverId)?.live;
  const [verb = '', ...rest] = command.split(' ');
  const answers: Readonly<Record<string, () => string>> = {
    list: () =>
      `There are ${live?.playersOnline ?? 0} of a max of ${live?.playersMax ?? 20} players online: ${live?.players.join(', ') ?? ''}`,
    say: () => `[Server] ${rest.join(' ')}`,
    op: () => `Made ${rest[0] ?? '?'} a server operator`,
    deop: () => `Made ${rest[0] ?? '?'} no longer a server operator`,
    time: () => 'Set the time to 1000',
    weather: () => 'Set the weather to clear',
    tps: () => 'TPS from last 1m, 5m, 15m: 20.0, 20.0, 19.98',
    help: () => 'Demo: probiere list, say Hallo, op Lena_Baut, time set day oder weather clear',
  };
  return answers[verb]?.() ?? `Befehl ausgeführt: ${command} (Demo)`;
}

/* ---------- Routes ---------- */

const ok = (body?: unknown): Reply => ({ status: 200, body });
const noContent = (): Reply => ({ status: 204 });
const error = (status: number, code: string): Reply => ({ status, body: { error: code, params: {} } });
const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

function summaries(): ServerDetail[] {
  const me = meNow();
  return Array.from(state.servers.values()).filter((s) => me?.user.isAdmin || Boolean(me?.access[s.id]));
}

function signIn(user: UserListEntry): Reply {
  state.userId = user.id;
  state.users = state.users.map((u) => (u.id === user.id ? { ...u, lastLoginAt: nowIso() } : u));
  return ok({ status: 'ok', me: meNow() });
}

function createServer(body: Readonly<Record<string, unknown>>): Reply {
  const edition = body['edition'] === 'bedrock' ? 'bedrock' : 'java';
  const template = edition === 'bedrock' ? recording.ids.bedrock : recording.ids.survival;
  const base = state.servers.get(template);
  if (!base) return error(500, 'generic');
  const id = randomText(10).toLowerCase();
  const memoryMb = Number(body['memoryMb']) || base.memoryMb;
  const server: ServerDetail = {
    ...base,
    id,
    name: String(body['name'] ?? 'Neuer Server'),
    edition,
    software: (body['software'] as ServerDetail['software']) ?? base.software,
    version: String(body['version'] ?? base.version),
    memoryMb,
    port: Number(body['port']) || base.port,
    geyser: false,
    geyserPort: null,
    createdAt: nowIso(),
    live: {
      ...base.live,
      state: 'stopped',
      players: [],
      playersOnline: 0,
      cpuPercent: null,
      memoryMb: null,
      tps: null,
    },
  };
  state.servers.set(id, server);
  state.templates.set(id, template);
  state.consoles.set(id, []);
  if (body['startNow'] !== false) after(300, () => startServer(id));
  return ok(server);
}

/** Specific behaviour; everything else answers from the recording or is accepted and forgotten. */
const ROUTES: readonly (readonly [string, string, Handler])[] = [
  [
    'GET',
    '/api/system/status',
    () =>
      ok({
        setupRequired: false,
        version: state.update.current,
        docker: { ok: true },
        demo: true,
        defaultLocale: 'de',
        passkeys: 'ok',
        panelDomain: state.settings.panelDomain || null,
      } satisfies SystemStatus),
  ],
  ['GET', '/api/auth/me', () => ok(meNow())],
  [
    'POST',
    '/api/auth/login',
    ({ body }) => {
      const name = String(body['username'] ?? '').toLowerCase();
      const user = state.users.find((u) => u.username.toLowerCase() === name);
      const valid = user && !user.disabled && state.passwords.get(user.username) === body['password'];
      return valid ? signIn(user) : error(401, 'invalid_credentials');
    },
  ],
  [
    'POST',
    '/api/auth/logout',
    () => {
      state.userId = null;
      return noContent();
    },
  ],
  [
    'POST',
    '/api/auth/passkey/options',
    () => ok({ challenge: randomText(32), rpId: location.hostname, userVerification: 'preferred' }),
  ],
  [
    'POST',
    '/api/auth/passkey/login',
    ({ body }) => {
      const id = String((body['response'] as { id?: string } | undefined)?.id ?? '');
      const owner = Array.from(state.passkeys).find(([, keys]) => keys.some((k) => k.id === id));
      const user = userById(owner?.[0] ?? null);
      if (!owner || !user) return error(401, 'passkey_unknown');
      state.passkeys.set(
        owner[0],
        owner[1].map((k) => (k.id === id ? { ...k, lastUsedAt: nowIso() } : k)),
      );
      return signIn(user);
    },
  ],
  ['GET', '/api/account/passkeys', () => ok(state.passkeys.get(state.userId ?? -1) ?? [])],
  ['POST', '/api/account/passkeys/options', () => ok({ challenge: randomText(32) })],
  [
    'POST',
    '/api/account/passkeys',
    ({ body }) => {
      const id = String((body['response'] as { id?: string } | undefined)?.id ?? randomText(16));
      const list = [
        ...(state.passkeys.get(state.userId ?? -1) ?? []),
        { id, name: String(body['name'] ?? 'Passkey'), createdAt: nowIso(), lastUsedAt: null },
      ];
      state.passkeys.set(state.userId ?? -1, list);
      return ok(list);
    },
  ],
  [
    'DELETE',
    '/api/account/passkeys/:id',
    ({ params }) => {
      const list = (state.passkeys.get(state.userId ?? -1) ?? []).filter((k) => k.id !== params['id']);
      state.passkeys.set(state.userId ?? -1, list);
      return noContent();
    },
  ],
  [
    'PATCH',
    '/api/account',
    ({ body }) => {
      if (typeof body['theme'] === 'string') state.theme = body['theme'] as MeResponse['user']['theme'];
      if (typeof body['displayName'] === 'string')
        state.users = state.users.map((u) =>
          u.id === state.userId ? { ...u, displayName: String(body['displayName']) } : u,
        );
      return ok(meNow());
    },
  ],
  [
    'POST',
    '/api/account/password',
    ({ body }) => {
      const user = userById(state.userId);
      if (!user || state.passwords.get(user.username) !== body['current'])
        return error(400, 'wrong_password');
      state.passwords.set(user.username, String(body['next']));
      return noContent();
    },
  ],
  ['GET', '/api/settings', () => ok(state.settings)],
  [
    'PUT',
    '/api/settings',
    ({ body }) => {
      const { curseforgeApiKey, ...rest } = body;
      state.settings = {
        ...state.settings,
        ...rest,
        curseforgeConfigured: state.settings.curseforgeConfigured || Boolean(curseforgeApiKey),
      } as PanelSettings;
      return ok(state.settings);
    },
  ],
  ['GET', '/api/system/update', () => ok(state.update)],
  [
    'POST',
    '/api/system/update',
    () => {
      state.update = { ...state.update, updating: true };
      after(6000, () => {
        state.update = {
          ...state.update,
          current: state.update.latest ?? LATEST_VERSION,
          available: false,
          updating: false,
        };
      });
      return ok(state.update);
    },
  ],
  ['GET', '/api/users', () => ok(state.users)],
  [
    'POST',
    '/api/users',
    ({ body }) => {
      const username = String(body['username'] ?? '').trim();
      if (state.users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
        return error(409, 'username_taken');
      const user: UserListEntry = {
        id: Math.max(...state.users.map((u) => u.id)) + 1,
        username,
        displayName: String(body['displayName'] ?? ''),
        isAdmin: body['isAdmin'] === true,
        canCreateServers: body['isAdmin'] === true || body['canCreateServers'] === true,
        locale: 'de',
        theme: 'dark',
        totpEnabled: false,
        createdAt: nowIso(),
        lastLoginAt: null,
        disabled: false,
        access: [],
      };
      state.users = [...state.users, user];
      state.passwords.set(username, String(body['password'] ?? ''));
      return ok(user);
    },
  ],
  [
    'PATCH',
    '/api/users/:id',
    ({ params, body }) => {
      const { password, ...rest } = body;
      const target = state.users.find((u) => String(u.id) === params['id']);
      if (!target) return error(404, 'not_found');
      if (typeof password === 'string' && password) state.passwords.set(target.username, password);
      state.users = state.users.map((u) => (u.id === target.id ? ({ ...u, ...rest } as UserListEntry) : u));
      return ok(state.users.find((u) => u.id === target.id));
    },
  ],
  [
    'PUT',
    '/api/users/:id/access',
    ({ params, body }) => {
      state.users = state.users.map((u) =>
        String(u.id) === params['id']
          ? { ...u, access: (body['access'] as UserListEntry['access']) ?? [] }
          : u,
      );
      return ok(state.users.find((u) => String(u.id) === params['id']));
    },
  ],
  [
    'DELETE',
    '/api/users/:id',
    ({ params }) => {
      if (params['id'] === String(state.userId)) return error(400, 'cannot_delete_self');
      state.users = state.users.filter((u) => String(u.id) !== params['id']);
      return noContent();
    },
  ],
  [
    'POST',
    '/api/users/:id/reset-password',
    ({ params, body }) => {
      const target = state.users.find((u) => String(u.id) === params['id']);
      if (!target) return error(404, 'not_found');
      if (target.id === state.userId) return error(400, 'cannot_reset_self');
      const password = randomText(16);
      state.passwords.set(target.username, password);
      if (body['removeSecondFactors'] === true) {
        state.passkeys.delete(target.id);
        state.users = state.users.map((u) => (u.id === target.id ? { ...u, totpEnabled: false } : u));
      }
      return ok({ password });
    },
  ],
  ['GET', '/api/servers', () => ok(summaries())],
  ['POST', '/api/servers', ({ body }) => createServer(body)],
  [
    'GET',
    '/api/servers/:id',
    ({ params }) => {
      const server = state.servers.get(params['id'] ?? '');
      return server ? ok(server) : error(404, 'not_found');
    },
  ],
  [
    'DELETE',
    '/api/servers/:id',
    ({ params }) => {
      const id = params['id'] ?? '';
      state.servers.delete(id);
      sockets.forEach((s) => s.emit({ type: 'deleted', serverId: id }));
      return noContent();
    },
  ],
  [
    'POST',
    '/api/servers/:id/actions/:action',
    ({ params }) => {
      const id = params['id'] ?? '';
      ACTIONS[params['action'] ?? '']?.(id);
      return { status: 202, body: state.servers.get(id)?.live };
    },
  ],
  [
    'POST',
    '/api/servers/:id/command',
    ({ params, body }) => {
      const id = params['id'] ?? '';
      const command = String(body['command'] ?? '');
      const answer = answerFor(id, command);
      log(id, `> ${command}`);
      log(id, info(answer));
      return ok({ answer });
    },
  ],
  [
    'POST',
    '/api/servers/:id/backups',
    ({ params }) => {
      const key = `/api/servers/${templateOf(params['id'] ?? '')}/backups`;
      const current = read<{ backups: { id: number }[] }>(key);
      if (!current) return { status: 202 };
      const id = Math.max(0, ...current.backups.map((b) => b.id)) + 1;
      const stamp = nowIso().replace('T', '_').replaceAll(':', '-').slice(0, 19);
      const backup = {
        id,
        fileName: `backup-${stamp}.zip`,
        sizeBytes: 61_000_000 + Math.round(Math.random() * 3_000_000),
        createdAt: nowIso(),
        kind: 'manual',
        status: 'done',
        error: null,
      };
      store.set(key, { ...current, backups: [backup, ...current.backups] });
      return { status: 202, body: backup };
    },
  ],
  [
    'POST',
    '/api/tokens',
    ({ body }) => {
      const list = read<{ id: number }[]>('/api/tokens') ?? [];
      const token = `mh_demo${randomText(30)}`;
      const entry = {
        id: Math.max(0, ...list.map((t) => t.id)) + 1,
        name: String(body['name'] ?? 'Schlüssel'),
        prefix: token.slice(0, 10),
        createdAt: nowIso(),
        lastUsedAt: null,
        expiresAt: null,
      };
      store.set('/api/tokens', [...list, entry]);
      return ok({ token, entry });
    },
  ],
];

function match(template: string, path: string): Record<string, string> | null {
  const want = template.split('/');
  const have = path.split('/');
  if (want.length !== have.length) return null;
  const pairs = want.map((segment, i) => [segment, have[i] ?? ''] as const);
  if (!pairs.every(([segment, part]) => segment.startsWith(':') || segment === part)) return null;
  return Object.fromEntries(
    pairs
      .filter(([segment]) => segment.startsWith(':'))
      .map(([segment, part]) => [segment.slice(1), decodeURIComponent(part)]),
  );
}

const PUBLIC_PATHS: readonly string[] = [
  '/api/system/status',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/passkey/options',
  '/api/auth/passkey/login',
];
const SERVER_PREFIX = '/api/servers/';
// A numeric id at the end of a path: "12" matches, "files" and "12a" do not.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cd%2B%24&testString=12%0Afiles%0A12a
const NUMERIC_ID = /^\d+$/;

/** For a server made in the demo, the recorded pages of a similar server. */
function recordedKey(url: URL): string {
  const key = url.pathname + url.search;
  if (!key.startsWith(SERVER_PREFIX)) return key;
  const id = key.slice(SERVER_PREFIX.length).split(/[/?]/)[0] ?? ''; // eslint-disable-line ts-patterns/require-regex-example -- splits after the id: "abc/files?x" → "abc"
  return key.replace(SERVER_PREFIX + id, SERVER_PREFIX + templateOf(id));
}

/** Lists in the recording that the demo can add to, change and delete from. */
function genericChange(request: Request): Reply {
  const parts = request.path.split('/');
  const tail = parts.at(-1) ?? '';
  const parent = parts.slice(0, -1).join('/');
  const collection = read<unknown>(request.path);
  if (request.method === 'POST' && Array.isArray(collection)) {
    const item = { id: collection.length + 1000, createdAt: nowIso(), ...request.body };
    store.set(request.path, [...collection, item]);
    return ok(item);
  }
  const siblings = read<unknown>(parent);
  if (Array.isArray(siblings) && NUMERIC_ID.test(tail)) {
    const rest = (siblings as { id: number }[]).filter((item) => String(item.id) !== tail);
    const current = (siblings as { id: number }[]).find((item) => String(item.id) === tail);
    if (request.method === 'DELETE') {
      store.set(parent, rest);
      return noContent();
    }
    const changed = { ...current, ...request.body };
    store.set(
      parent,
      siblings.map((item: { id: number }) => (String(item.id) === tail ? changed : item)),
    );
    return ok(changed);
  }
  return ok({});
}

async function handle(request: Request): Promise<Reply> {
  await delay(90 + Math.random() * 160);
  const signedIn = state.userId !== null;
  if (!signedIn && !PUBLIC_PATHS.includes(request.path)) return error(401, 'unauthorized');
  const route = ROUTES.map(([method, template, handler]) => ({
    handler,
    params: method === request.method ? match(template, request.path) : null,
  })).find((r) => r.params !== null);
  if (route?.params) return route.handler({ ...request, params: route.params });
  if (request.method !== 'GET') return genericChange(request);
  const key = recordedKey(request.url);
  const failed = failing.get(key);
  if (failed) return { status: failed.status, body: failed.body };
  if (store.has(key)) return ok(store.get(key));
  const withoutQuery = Array.from(store.keys()).find((k) => k.split('?')[0] === key.split('?')[0]);
  return withoutQuery ? ok(store.get(withoutQuery)) : error(404, 'not_found');
}

/* ---------- Wiring into the page ---------- */

/** File uploads (XMLHttpRequest) are not possible in the demo; they get a friendly answer. */
class DemoUpload extends EventTarget {
  readonly upload = new EventTarget();
  status = 0;
  responseText = '';
  open(): void {}
  setRequestHeader(): void {}
  send(): void {
    after(400, () => {
      this.status = 400;
      this.responseText = JSON.stringify({ error: 'demo_readonly', params: {} });
      this.dispatchEvent(new Event('load'));
    });
  }
}

export function installDemoBackend(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = input instanceof Request ? input.url : String(input);
    const url = new URL(href, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const raw = typeof init?.body === 'string' ? init.body : '';
    const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    const reply = await handle({ method: init?.method ?? 'GET', path: url.pathname, url, params: {}, body });
    if (reply.status === 204 || reply.body === undefined)
      return new Response(null, { status: reply.status === 200 ? 204 : reply.status });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  window.WebSocket = DemoSocket as unknown as typeof WebSocket;
  window.XMLHttpRequest = DemoUpload as unknown as typeof XMLHttpRequest;
  window.setInterval(tick, 2000);
}

/** Who has passkeys in the demo, for the pretend passkey dialog. */
export function demoPasskeyAccounts(): { readonly id: string; readonly label: string }[] {
  return Array.from(state.passkeys).flatMap(([userId, keys]) => {
    const user = userById(userId);
    return keys.map((k) => ({
      id: k.id,
      label: `${user?.displayName || user?.username || '?'} · ${k.name}`,
    }));
  });
}
