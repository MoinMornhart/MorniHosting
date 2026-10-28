import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
  BackupSettings,
  CrashInfo,
  Edition,
  JavaTag,
  Locale,
  ScheduleAction,
  ScheduleSpec,
  ServerPermission,
  SoftwareId,
  Theme,
  WebhookEvent,
  WebhookKind,
} from '@mornihosting/shared';

const DEFAULT_BACKUP_KEEP = 7;
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  keep: DEFAULT_BACKUP_KEEP,
  exclude: ['logs/', 'cache/', 'crash-reports/'],
};

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
});

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    displayName: text('display_name').notNull().default(''),
    passwordHash: text('password_hash').notNull(),
    isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
    canCreateServers: integer('can_create_servers', { mode: 'boolean' }).notNull().default(false),
    locale: text('locale').$type<Locale>().notNull().default('de'),
    theme: text('theme').$type<Theme>().notNull().default('dark'),
    totpSecret: text('totp_secret'),
    totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
    disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    lastLoginAt: text('last_login_at'),
  },
  (t) => [uniqueIndex('users_username_nocase').on(sql`lower(${t.username})`)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    /** Set while the password was correct but the second factor is still missing. */
    pendingTwoFactor: integer('pending_two_factor', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

export const apiTokens = sqliteTable('api_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  createdAt: createdAt(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
});

export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  permissions: text('permissions', { mode: 'json' }).$type<ServerPermission[]>().notNull(),
  builtIn: text('built_in'),
});

export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  edition: text('edition').$type<Edition>().notNull(),
  software: text('software').$type<SoftwareId>().notNull(),
  version: text('version').notNull(),
  memoryMb: integer('memory_mb').notNull(),
  port: integer('port').notNull(),
  rconPassword: text('rcon_password').notNull(),
  javaTag: text('java_tag').$type<JavaTag>(),
  image: text('image').notNull(),
  containerId: text('container_id'),
  domain: text('domain'),
  autoStart: integer('auto_start', { mode: 'boolean' }).notNull().default(true),
  extraPorts: text('extra_ports', { mode: 'json' })
    .$type<{ port: number; containerPort?: number; protocol: 'tcp' | 'udp'; purpose: string }[]>()
    .notNull()
    .default([]),
  extraEnv: text('extra_env', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
  geyser: integer('geyser', { mode: 'boolean' }).notNull().default(false),
  backupSettings: text('backup_settings', { mode: 'json' })
    .$type<BackupSettings>()
    .notNull()
    .default(DEFAULT_BACKUP_SETTINGS),
  crash: text('crash', { mode: 'json' }).$type<CrashInfo | null>(),
  /** The state the owner wants: a server that should run is restarted after a panel restart. */
  desiredRunning: integer('desired_running', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: text('updated_at'),
});

export const serverAccess = sqliteTable(
  'server_access',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] })],
);

export const backups = sqliteTable(
  'backups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    kind: text('kind').$type<'manual' | 'scheduled' | 'before-restore'>().notNull(),
    status: text('status').$type<'running' | 'done' | 'failed'>().notNull(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('backups_server').on(t.serverId)],
);

export const schedules = sqliteTable('schedules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  action: text('action').$type<ScheduleAction>().notNull(),
  command: text('command'),
  spec: text('spec', { mode: 'json' }).$type<ScheduleSpec>().notNull(),
  cron: text('cron').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  warnMinutes: integer('warn_minutes').notNull().default(0),
  lastRunAt: text('last_run_at'),
  lastResult: text('last_result').$type<'ok' | 'failed'>(),
  createdAt: createdAt(),
});

export const webhooks = sqliteTable('webhooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serverId: text('server_id').references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').$type<WebhookKind>().notNull(),
  url: text('url').notNull(),
  urlHost: text('url_host').notNull(),
  events: text('events', { mode: 'json' }).$type<WebhookEvent[]>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastStatus: integer('last_status'),
  lastAt: text('last_at'),
  createdAt: createdAt(),
});

export const installedContent = sqliteTable(
  'installed_content',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    provider: text('provider')
      .$type<'modrinth' | 'hangar' | 'spiget' | 'curseforge' | 'geysermc' | 'upload'>()
      .notNull(),
    projectId: text('project_id'),
    projectName: text('project_name').notNull(),
    versionId: text('version_id'),
    versionName: text('version_name'),
    fileName: text('file_name').notNull(),
    iconUrl: text('icon_url'),
    /** Installed automatically because another project needs it. */
    dependencyOf: text('dependency_of'),
    installedAt: createdAt(),
  },
  (t) => [index('content_server').on(t.serverId)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: createdAt(),
    userId: integer('user_id'),
    username: text('username'),
    serverId: text('server_id'),
    action: text('action').notNull(),
    details: text('details', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
  },
  (t) => [index('audit_at').on(t.at), index('audit_server').on(t.serverId)],
);

export const stats = sqliteTable(
  'stats',
  {
    serverId: text('server_id').notNull(),
    at: integer('at').notNull(),
    cpu: real('cpu'),
    memMb: real('mem_mb'),
    players: integer('players'),
    tps: real('tps'),
  },
  (t) => [index('stats_server_at').on(t.serverId, t.at)],
);
