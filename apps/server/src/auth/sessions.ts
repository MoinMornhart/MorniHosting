import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { MS_PER_DAY, MS_PER_MINUTE } from '../lib/units.js';
import type { UserRow } from './context.js';

export const SESSION_COOKIE = 'mh_session';
const SESSION_DAYS = 14;
const PENDING_TWO_FACTOR_MINUTES = 10;
export const SESSION_TTL_MS = SESSION_DAYS * MS_PER_DAY;
const PENDING_TTL_MS = PENDING_TWO_FACTOR_MINUTES * MS_PER_MINUTE;
/** Writing lastSeenAt on every request would turn every read into a write. */
const TOUCH_INTERVAL_MS = MS_PER_MINUTE;

export type SessionRow = typeof sessions.$inferSelect;

export interface SessionStore {
  readonly create: (
    userId: number,
    meta: { ip: string; userAgent: string | null; pendingTwoFactor: boolean },
  ) => {
    token: string;
    session: SessionRow;
  };
  readonly resolve: (token: string) => { session: SessionRow; user: UserRow } | null;
  readonly completeTwoFactor: (sessionId: string) => SessionRow;
  readonly destroy: (sessionId: string) => void;
  readonly destroyAllFor: (userId: number, exceptSessionId?: string) => void;
  readonly purgeExpired: () => void;
}

export function createSessionStore(db: Db): SessionStore {
  const expiry = (pending: boolean): string =>
    new Date(Date.now() + (pending ? PENDING_TTL_MS : SESSION_TTL_MS)).toISOString();

  return {
    create: (userId, meta) => {
      const token = randomToken();
      const now = new Date().toISOString();
      const session: SessionRow = {
        id: sha256Hex(token),
        userId,
        csrfToken: randomToken(),
        pendingTwoFactor: meta.pendingTwoFactor,
        createdAt: now,
        expiresAt: expiry(meta.pendingTwoFactor),
        lastSeenAt: now,
        ip: meta.ip,
        userAgent: meta.userAgent,
      };
      db.insert(sessions).values(session).run();
      return { token, session };
    },
    resolve: (token) => {
      const row = db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, sha256Hex(token)))
        .get();
      if (!row) return null;
      const now = Date.now();
      if (Date.parse(row.session.expiresAt) < now || row.user.disabled) {
        db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
        return null;
      }
      if (!row.session.pendingTwoFactor && now - Date.parse(row.session.lastSeenAt) > TOUCH_INTERVAL_MS) {
        const touched = { lastSeenAt: new Date(now).toISOString(), expiresAt: expiry(false) };
        db.update(sessions).set(touched).where(eq(sessions.id, row.session.id)).run();
        return { session: { ...row.session, ...touched }, user: row.user };
      }
      return row;
    },
    completeTwoFactor: (sessionId) => {
      const patch = { pendingTwoFactor: false, expiresAt: expiry(false), csrfToken: randomToken() };
      db.update(sessions).set(patch).where(eq(sessions.id, sessionId)).run();
      const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
      if (!row) throw new Error('session vanished');
      return row;
    },
    destroy: (sessionId) => {
      db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    },
    destroyAllFor: (userId, exceptSessionId) => {
      const rows = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).all();
      rows
        .filter((r) => r.id !== exceptSessionId)
        .forEach((r) => db.delete(sessions).where(eq(sessions.id, r.id)).run());
    },
    purgeExpired: () => {
      db.delete(sessions)
        .where(and(lt(sessions.expiresAt, new Date().toISOString())))
        .run();
    },
  };
}
