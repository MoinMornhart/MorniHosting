/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { LoginResponse, PasskeyEntry, SystemStatus } from '@mornihosting/shared';
import { createChallengeStore } from '../src/auth/passkeys.js';
import { users } from '../src/db/schema.js';
import { authHeaders, createTestApp, login, setupAdmin, type Session, type TestApp } from './helpers.js';
import {
  createSoftAuthenticator,
  type LoginOptions,
  type RegistrationOptions,
} from './soft-authenticator.js';

const ORIGIN = 'http://localhost';
/** What a browser on http://localhost sends; the panel only accepts requests from its own origin. */
const BROWSER = { host: 'localhost', origin: ORIGIN };

describe('passkeys', () => {
  let t: TestApp;
  let s: Session;
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, session?: Session, payload?: object) =>
    t.app.inject({ method, url, payload, headers: { ...BROWSER, ...(session ? authHeaders(session) : {}) } });

  const addPasskey = async (device: ReturnType<typeof createSoftAuthenticator>, name = 'Handy') => {
    const options = (await call('POST', '/api/account/passkeys/options', s)).json<RegistrationOptions>();
    return call('POST', '/api/account/passkeys', s, { name, response: device.register(options, ORIGIN) });
  };
  const signIn = async (device: ReturnType<typeof createSoftAuthenticator>, origin = ORIGIN) => {
    const options = (await call('POST', '/api/auth/passkey/options')).json<LoginOptions>();
    const response = device.login(options, origin);
    return { response, res: await call('POST', '/api/auth/passkey/login', undefined, { response }) };
  };

  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  test('add a passkey, then sign in with it instead of the password', async () => {
    const device = createSoftAuthenticator();
    const added = await addPasskey(device);
    expect(added.statusCode).toBe(200);
    expect(added.json<PasskeyEntry[]>()).toMatchObject([{ id: device.id, name: 'Handy', lastUsedAt: null }]);

    const { res } = await signIn(device);
    expect(res.statusCode).toBe(200);
    expect(res.json<LoginResponse>()).toMatchObject({ status: 'ok', me: { user: { username: 'philip' } } });
    const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const list = (await call('GET', '/api/account/passkeys', s)).json<PasskeyEntry[]>();
    expect(list[0]?.lastUsedAt).not.toBeNull();
    expect(t.ctx.audit.list({ limit: 1 })[0]).toMatchObject({
      action: 'auth.login',
      details: { method: 'passkey' },
    });
  });

  test('a passkey sign-in skips the 2FA code', async () => {
    const device = createSoftAuthenticator();
    await addPasskey(device);
    t.ctx.db.update(users).set({ totpEnabled: true, totpSecret: 'x' }).run();
    const { res } = await signIn(device);
    expect(res.json<LoginResponse>().status).toBe('ok');
  });

  test('a used challenge, another page or an unknown key are refused', async () => {
    const device = createSoftAuthenticator();
    await addPasskey(device);
    const { response } = await signIn(device);
    const replay = await call('POST', '/api/auth/passkey/login', undefined, { response });
    expect(replay.statusCode).toBe(401);

    const phishing = await signIn(device, 'http://evil.localhost');
    expect(phishing.res.json()).toMatchObject({ error: 'passkey_failed' });

    const stranger = await signIn(createSoftAuthenticator());
    expect(stranger.res.json()).toMatchObject({ error: 'passkey_unknown' });
  });

  test('a removed passkey no longer works', async () => {
    const device = createSoftAuthenticator();
    await addPasskey(device);
    const removed = await call('DELETE', `/api/account/passkeys/${device.id}`, s);
    expect(removed.statusCode).toBe(204);
    expect((await call('GET', '/api/account/passkeys', s)).json()).toEqual([]);
    expect((await signIn(device)).res.json()).toMatchObject({ error: 'passkey_unknown' });
  });

  test('passkeys need HTTPS, and the panel domain once one is set', async () => {
    const status = async (host: string) =>
      (
        await t.app.inject({ method: 'GET', url: '/api/system/status', headers: { host } })
      ).json<SystemStatus>();
    expect((await status('localhost')).passkeys).toBe('ok');
    expect((await status('192.168.178.40:8080')).passkeys).toBe('needs_https');

    await t.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { ...BROWSER, ...authHeaders(s) },
      payload: { panelDomain: 'panel.example.de' },
    });
    expect(await status('localhost')).toMatchObject({
      passkeys: 'wrong_host',
      panelDomain: 'panel.example.de',
    });
    expect((await call('POST', '/api/auth/passkey/options')).json()).toMatchObject({
      error: 'passkey_wrong_host',
    });
  });

  test('behind a proxy without X-Forwarded-Proto (e.g. NetBird) the panel domain counts as HTTPS', async () => {
    await t.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { ...BROWSER, ...authHeaders(s) },
      payload: { panelDomain: 'panel.example.de' },
    });
    const viaDomain = { host: 'panel.example.de', origin: 'https://panel.example.de' };
    const status = await t.app.inject({
      method: 'GET',
      url: '/api/system/status',
      headers: { host: viaDomain.host },
    });
    expect(status.json<SystemStatus>().passkeys).toBe('ok');

    const login = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: viaDomain,
      payload: { username: 'philip', password: 'supersecret123' },
    });
    expect(String(login.headers['set-cookie'])).toContain('Secure');
    const session = {
      cookie: String(login.headers['set-cookie']).split(';')[0] ?? '',
      csrf: login.json<{ me: { csrfToken: string } }>().me.csrfToken,
    };
    const headers = { ...viaDomain, ...authHeaders(session) };
    const device = createSoftAuthenticator();
    const options = (
      await t.app.inject({ method: 'POST', url: '/api/account/passkeys/options', headers })
    ).json<RegistrationOptions>();
    expect(options.rp.id).toBe('panel.example.de');
    const added = await t.app.inject({
      method: 'POST',
      url: '/api/account/passkeys',
      headers,
      payload: { name: 'Handy', response: device.register(options, viaDomain.origin) },
    });
    expect(added.statusCode).toBe(200);
    const loginOptions = (
      await t.app.inject({ method: 'POST', url: '/api/auth/passkey/options', headers: viaDomain })
    ).json<LoginOptions>();
    const signedIn = await t.app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login',
      headers: viaDomain,
      payload: { response: device.login(loginOptions, viaDomain.origin) },
    });
    expect(signedIn.json<LoginResponse>().status).toBe('ok');
  });

  test('without the original Host header, pages from the panel domain are still accepted', async () => {
    await t.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { ...BROWSER, ...authHeaders(s) },
      payload: { panelDomain: 'panel.example.de' },
    });
    const rewritten = (origin: string) =>
      t.app.inject({
        method: 'PATCH',
        url: '/api/account',
        headers: { host: '192.168.178.40:8080', origin, ...authHeaders(s) },
        payload: { displayName: 'Philip' },
      });
    expect((await rewritten('https://panel.example.de')).statusCode).toBe(200);
    expect((await rewritten('http://panel.example.de')).statusCode).toBe(403);
    expect((await rewritten('https://evil.example')).statusCode).toBe(403);
  });

  test('a request from another page cannot start a passkey ceremony', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/passkey/options',
      headers: { host: 'localhost', origin: 'http://evil.localhost' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('admin password reset', () => {
  let t: TestApp;
  let s: Session;
  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  test('gives a new password once, ends sessions and can remove 2FA', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeaders(s),
      payload: { username: 'lena', password: 'lena-passwort-1' },
    });
    const lenaId = created.json<{ id: number }>().id;
    const lena = await login(t, 'lena', 'lena-passwort-1');
    t.ctx.db.update(users).set({ totpEnabled: true, totpSecret: 'x' }).run();

    const reset = await t.app.inject({
      method: 'POST',
      url: `/api/users/${lenaId}/reset-password`,
      headers: authHeaders(s),
      payload: { removeSecondFactors: true },
    });
    const { password } = reset.json<{ password: string }>();
    expect(password.length).toBeGreaterThanOrEqual(10);
    const old = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: authHeaders(lena) });
    expect(old.statusCode).toBe(401);
    const fresh = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'lena', password },
    });
    expect(fresh.json<LoginResponse>().status).toBe('ok');

    const self = await t.app.inject({
      method: 'POST',
      url: '/api/users/1/reset-password',
      headers: authHeaders(s),
      payload: {},
    });
    expect(self.json()).toMatchObject({ error: 'cannot_reset_self' });
  });
});

describe('challenge store', () => {
  test('hands out a challenge once and forgets it after five minutes', () => {
    const clock = { now: 0 };
    const store = createChallengeStore(() => clock.now);
    store.put('a', 'challenge-a');
    expect(store.take('a')).toBe('challenge-a');
    expect(store.take('a')).toBeUndefined();
    store.put('b', 'challenge-b');
    clock.now = 5 * 60_000;
    expect(store.take('b')).toBeUndefined();
  });
});
