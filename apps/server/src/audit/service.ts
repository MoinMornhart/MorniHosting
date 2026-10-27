import { and, desc, eq, lt } from 'drizzle-orm';
import type { AuditEntry } from '@mornihosting/shared';
import type { Db } from '../db/index.js';
import { auditLog, servers } from '../db/schema.js';

export interface Actor {
  readonly userId: number | null;
  readonly username: string | null;
  readonly ip: string | null;
}

export const SYSTEM_ACTOR: Actor = { userId: null, username: null, ip: null };

export interface AuditQuery {
  readonly serverId?: string;
  readonly userId?: number;
  readonly before?: number;
  readonly limit: number;
}

export interface AuditService {
  readonly record: (
    actor: Actor,
    action: string,
    serverId?: string | null,
    details?: Record<string, unknown>,
  ) => void;
  readonly list: (query: AuditQuery) => AuditEntry[];
}

export function createAuditService(db: Db): AuditService {
  return {
    record: (actor, action, serverId = null, details = {}) => {
      db.insert(auditLog)
        .values({ userId: actor.userId, username: actor.username, ip: actor.ip, action, serverId, details })
        .run();
    },
    list: (query) => {
      const filters = [
        query.serverId ? eq(auditLog.serverId, query.serverId) : undefined,
        query.userId ? eq(auditLog.userId, query.userId) : undefined,
        query.before ? lt(auditLog.id, query.before) : undefined,
      ].filter((f) => f !== undefined);
      const rows = db
        .select({ log: auditLog, serverName: servers.name })
        .from(auditLog)
        .leftJoin(servers, eq(servers.id, auditLog.serverId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(auditLog.id))
        .limit(query.limit)
        .all();
      return rows.map(({ log, serverName }) => ({
        id: log.id,
        at: log.at,
        username: log.username,
        serverId: log.serverId,
        serverName: serverName ?? null,
        action: log.action,
        details: log.details,
        ip: log.ip,
      }));
    },
  };
}
