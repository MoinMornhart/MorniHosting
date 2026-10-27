import { eq } from 'drizzle-orm';
import { SERVER_PERMISSIONS, type ServerPermission } from '@mornihosting/shared';
import type { UserRow } from '../auth/context.js';
import type { Db } from '../db/index.js';
import { roles, serverAccess, servers } from '../db/schema.js';
import { forbidden } from '../lib/errors.js';

export interface AccessService {
  readonly permissionsFor: (user: UserRow, serverId: string) => ServerPermission[];
  readonly accessMap: (user: UserRow) => Record<string, ServerPermission[]>;
  readonly visibleServerIds: (user: UserRow) => Set<string> | 'all';
  readonly assert: (user: UserRow, serverId: string, permission: ServerPermission) => void;
  readonly assertAny: (user: UserRow, serverId: string) => void;
}

export function createAccessService(db: Db): AccessService {
  const grantsFor = (userId: number): { serverId: string; permissions: ServerPermission[] }[] =>
    db
      .select({ serverId: serverAccess.serverId, permissions: roles.permissions })
      .from(serverAccess)
      .innerJoin(roles, eq(roles.id, serverAccess.roleId))
      .where(eq(serverAccess.userId, userId))
      .all();

  const permissionsFor = (user: UserRow, serverId: string): ServerPermission[] => {
    if (user.isAdmin) return [...SERVER_PERMISSIONS];
    return grantsFor(user.id).find((g) => g.serverId === serverId)?.permissions ?? [];
  };

  const accessMap = (user: UserRow): Record<string, ServerPermission[]> => {
    if (user.isAdmin) {
      const ids = db.select({ id: servers.id }).from(servers).all();
      return Object.fromEntries(ids.map(({ id }) => [id, [...SERVER_PERMISSIONS]]));
    }
    return Object.fromEntries(grantsFor(user.id).map((g) => [g.serverId, g.permissions]));
  };

  const visibleServerIds = (user: UserRow): Set<string> | 'all' =>
    user.isAdmin
      ? 'all'
      : new Set(
          grantsFor(user.id)
            .filter((g) => g.permissions.length)
            .map((g) => g.serverId),
        );

  return {
    permissionsFor,
    accessMap,
    visibleServerIds,
    assert: (user, serverId, permission) => {
      if (!permissionsFor(user, serverId).includes(permission))
        throw forbidden(`missing_permission_${permission}`);
    },
    assertAny: (user, serverId) => {
      if (!permissionsFor(user, serverId).length) throw forbidden('no_server_access');
    },
  };
}
