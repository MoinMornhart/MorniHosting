/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { authHeaders, createTestApp, login, setupAdmin, type TestApp } from './helpers.js';

describe('setup and sign-in', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  test('first run asks for setup, then refuses a second setup', async () => {
    const status = await t.app.inject({ url: '/api/system/status' });
    expect(status.json()).toMatchObject({ setupRequired: true });
    const session = await setupAdmin(t);
    expect(session.cookie.startsWith('mh_session=')).toBe(true);
    const again = await t.app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { username: 'eve', password: 'evilpassword1', locale: 'de' },
    });
    expect(again.statusCode).toBe(409);
  });

  test('weak passwords are rejected at setup', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { username: 'philip', password: 'short', locale: 'de' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('wrong password fails, right one signs in', async () => {
    await setupAdmin(t);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'philip', password: 'nope-nope-nope' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ error: 'invalid_credentials' });
    const session = await login(t, 'PHILIP', 'supersecret123');
    const me = await t.app.inject({ url: '/api/auth/me', headers: { cookie: session.cookie } });
    expect(me.json()).toMatchObject({ user: { username: 'philip', isAdmin: true } });
  });

  test('state-changing requests need the CSRF token', async () => {
    const session = await setupAdmin(t);
    const payload = {
      name: 'Test',
      edition: 'java',
      software: 'paper',
      version: '1.21.4',
      memoryMb: 2048,
      port: 25565,
      eula: true,
      startNow: false,
    };
    const without = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie: session.cookie },
      payload,
    });
    expect(without.statusCode).toBe(403);
    expect(without.json()).toMatchObject({ error: 'csrf' });
    const withToken = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders(session),
      payload,
    });
    expect(withToken.statusCode).toBe(200);
  });

  test('requests from a foreign origin are rejected', async () => {
    const session = await setupAdmin(t);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...authHeaders(session), origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  test('login is rate limited', async () => {
    await setupAdmin(t);
    const attempts = await Array.from({ length: 12 }).reduce<Promise<number[]>>(async (acc) => {
      const codes = await acc;
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'philip', password: 'wrong-wrong-1' },
      });
      return [...codes, res.statusCode];
    }, Promise.resolve([]));
    expect(attempts).toContain(429);
  });

  test('anonymous users get nothing', async () => {
    await setupAdmin(t);
    const res = await t.app.inject({ url: '/api/servers' });
    expect(res.statusCode).toBe(401);
  });
});
