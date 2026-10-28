/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runCommand } from '../src/admin-cli.js';
import { users } from '../src/db/schema.js';
import { authHeaders, createTestApp, login, setupAdmin, type Session, type TestApp } from './helpers.js';

describe('rescue commands', () => {
  let t: TestApp;
  let s: Session;
  const me = async (session: Session) =>
    t.app.inject({ method: 'GET', url: '/api/auth/me', headers: authHeaders(session) });

  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  test('reset-password gives a working new password and ends old sessions', async () => {
    const result = await runCommand(t.ctx.db, 'reset-password', ['PHILIP']);
    expect(result.ok).toBe(true);
    // The new password after the name: "Passwort für philip: Ab3-x_Yz" gives "Ab3-x_Yz"; "Passwort für lena: x" does not match.
    // https://regex101.com/?regex=Passwort%20f%C3%BCr%20philip%3A%20(%5CS%2B)&testString=Passwort%20f%C3%BCr%20philip%3A%20Ab3-x_Yz%0APasswort%20f%C3%BCr%20lena%3A%20x
    const password = /Passwort für philip: (\S+)/.exec(result.message)?.[1] ?? '';
    expect(password.length).toBeGreaterThanOrEqual(10);
    expect(t.ctx.audit.list({ limit: 1 })[0]?.action).toBe('account.password_reset');
    expect((await me(s)).statusCode).toBe(401);
    const fresh = await login(t, 'philip', password);
    expect((await me(fresh)).statusCode).toBe(200);
    const old = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'philip', password: 'supersecret123' },
    });
    expect(old.statusCode).toBe(401);
  });

  test('reset-2fa switches the second factor off', async () => {
    t.ctx.db.update(users).set({ totpEnabled: true, totpSecret: 'secret' }).run();
    const result = await runCommand(t.ctx.db, 'reset-2fa', ['philip']);
    expect(result.ok).toBe(true);
    const fresh = await login(t, 'philip', 'supersecret123');
    const body = (await me(fresh)).json<{ user: { totpEnabled: boolean } }>();
    expect(body.user.totpEnabled).toBe(false);
  });

  test('unknown names and commands explain themselves', async () => {
    expect(await runCommand(t.ctx.db, 'reset-password', ['niemand'])).toMatchObject({ ok: false });
    expect((await runCommand(t.ctx.db, 'reset-password', [])).message).toContain('reset-password <name>');
    expect((await runCommand(t.ctx.db, 'constructor', [])).message).toContain('Rettungsbefehle');
    expect((await runCommand(t.ctx.db, 'list-users', [])).message).toBe('philip · Admin');
  });
});
