/** Rights a role can grant on a single server. */
export const SERVER_PERMISSIONS = [
  'control',
  'commands',
  'console',
  'logs',
  'schedules',
  'backups',
  'files',
  'config',
  'players',
  'plugins',
] as const;
export type ServerPermission = (typeof SERVER_PERMISSIONS)[number];

export interface BuiltinRole {
  readonly key: 'owner' | 'moderator' | 'viewer';
  readonly permissions: readonly ServerPermission[];
}

export const BUILTIN_ROLES: readonly BuiltinRole[] = Object.freeze([
  { key: 'owner', permissions: SERVER_PERMISSIONS },
  { key: 'moderator', permissions: ['control', 'commands', 'console', 'logs', 'players'] },
  { key: 'viewer', permissions: ['console', 'logs'] },
]);

export function isServerPermission(value: unknown): value is ServerPermission {
  return typeof value === 'string' && (SERVER_PERMISSIONS as readonly string[]).includes(value);
}
