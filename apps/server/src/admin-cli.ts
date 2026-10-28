import { asc, eq, sql } from 'drizzle-orm';
import { createAuditService, SYSTEM_ACTOR } from './audit/service.js';
import { hashPassword, randomPassword } from './auth/passwords.js';
import type { Db } from './db/index.js';
import { sessions, users } from './db/schema.js';

/**
 * Rescue commands for the host, for when nobody can sign in any more (forgotten password, lost phone).
 * Whoever can run `docker exec` on the host already controls everything, so these need no login.
 */

export interface CliResult {
  readonly ok: boolean;
  readonly message: string;
}

type Command = (db: Db, args: readonly string[]) => Promise<CliResult>;
type UserRow = typeof users.$inferSelect;

const USAGE = [
  'MorniHosting – Rettungsbefehle',
  '',
  '  list-users               Alle Konten anzeigen',
  '  reset-password <name>    Neues Passwort erzeugen und alle Sitzungen beenden',
  '  reset-2fa <name>         Zwei-Faktor-Anmeldung ausschalten (z. B. Handy verloren)',
  '',
  'Beispiel: docker exec mornihosting node /app/server/dist/cli.js reset-password philip',
].join('\n');

const usage = (): CliResult => ({ ok: false, message: USAGE });

function findUser(db: Db, username: string | undefined): UserRow | undefined {
  if (!username) return undefined;
  return db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.username})`, username.toLowerCase()))
    .get();
}

const unknownUser = (username: string | undefined): CliResult =>
  username
    ? { ok: false, message: `Kein Konto mit dem Namen „${username}“. Alle Namen zeigt: list-users` }
    : usage();

const listUsers: Command = async (db) => {
  const rows = db.select().from(users).orderBy(asc(users.username)).all();
  if (!rows.length)
    return { ok: true, message: 'Noch keine Konten. Öffne das Panel für den Einrichtungs-Assistenten.' };
  const lines = rows.map((u) =>
    [
      u.username,
      u.isAdmin ? 'Admin' : 'Benutzer',
      u.totpEnabled ? '2FA an' : '',
      u.disabled ? 'gesperrt' : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
  return { ok: true, message: lines.join('\n') };
};

const resetPassword: Command = async (db, [username]) => {
  const user = findUser(db, username);
  if (!user) return unknownUser(username);
  const password = randomPassword();
  db.update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, user.id))
    .run();
  db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  createAuditService(db).record(SYSTEM_ACTOR, 'account.password_reset', null, { user: user.username });
  return {
    ok: true,
    message: `Neues Passwort für ${user.username}: ${password}\nBitte nach dem Anmelden unter „Konto“ ändern.`,
  };
};

const resetTwoFactor: Command = async (db, [username]) => {
  const user = findUser(db, username);
  if (!user) return unknownUser(username);
  db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, user.id)).run();
  db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  createAuditService(db).record(SYSTEM_ACTOR, 'account.two_factor_reset', null, { user: user.username });
  return {
    ok: true,
    message: `Zwei-Faktor-Anmeldung für ${user.username} ist aus. Richte sie unter „Konto“ neu ein.`,
  };
};

const COMMANDS: Readonly<Record<string, Command>> = {
  'list-users': listUsers,
  'reset-password': resetPassword,
  'reset-2fa': resetTwoFactor,
};

export async function runCommand(db: Db, command: string, args: readonly string[]): Promise<CliResult> {
  const run = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  return run ? run(db, args) : usage();
}
