/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AuditEntry, RoleEntry, ServerSummary, UserListEntry } from '@mornihosting/shared';
import { authHeaders, createTestApp, login, setupAdmin, type Session, type TestApp } from './helpers.js';

const paper = {
  name: 'Survival',
  edition: 'java',
  software: 'paper',
  version: '1.21.4',
  memoryMb: 2048,
  port: 25565,
  eula: true,
  startNow: false,
};

describe('users, roles, API keys and the audit log', () => {
  let t: TestApp;
  let admin: Session;
  let serverId: string;

  const as = async (
    session: Session | { bearer: string },
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    t.app.inject({
      method,
      url,
      headers: 'bearer' in session ? { authorization: `Bearer ${session.bearer}` } : authHeaders(session),
      ...(payload ? { payload } : {}),
    });
  const roleId = async (key: string): Promise<number> => {
    const roles = (await as(admin, 'GET', '/api/roles')).json<RoleEntry[]>();
    const role = roles.find((r) => r.name === key);
    if (!role) throw new Error(`role ${key} missing`);
    return role.id;
  };
  const createLena = async (): Promise<UserListEntry> =>
    (
      await as(admin, 'POST', '/api/users', {
        username: 'lena',
        password: 'lena-passwort-1',
        displayName: 'Lena',
      })
    ).json<UserListEntry>();

  beforeEach(async () => {
    t = await createTestApp();
    admin = await setupAdmin(t);
    serverId = (await as(admin, 'POST', '/api/servers', paper)).json<ServerSummary>().id;
  });
  afterEach(async () => {
    await t.cleanup();
  });

  test('a new user sees nothing until given a role, then exactly what the role allows', async () => {
    const lena = await createLena();
    expect(
      (await as(admin, 'POST', '/api/users', { username: 'LENA', password: 'egal-egal-1' })).json(),
    ).toMatchObject({
      error: 'username_taken',
    });
    const session = await login(t, 'lena', 'lena-passwort-1');
    expect((await as(session, 'GET', '/api/servers')).json()).toEqual([]);
    expect((await as(session, 'GET', `/api/servers/${serverId}`)).statusCode).toBe(403);
    expect((await as(session, 'GET', '/api/users')).statusCode).toBe(403);

    await as(admin, 'PUT', `/api/users/${lena.id}/access`, {
      access: [{ serverId, roleId: await roleId('viewer') }],
    });
    expect((await as(session, 'GET', '/api/servers')).json<ServerSummary[]>().map((s) => s.id)).toEqual([
      serverId,
    ]);
    expect((await as(session, 'GET', `/api/servers/${serverId}/console`)).statusCode).toBe(200);
    expect((await as(session, 'POST', `/api/servers/${serverId}/actions/start`)).json()).toMatchObject({
      error: 'missing_permission_control',
    });
    expect((await as(session, 'GET', `/api/servers/${serverId}/files`)).json()).toMatchObject({
      error: 'missing_permission_files',
    });

    await as(admin, 'PUT', `/api/users/${lena.id}/access`, {
      access: [{ serverId, roleId: await roleId('moderator') }],
    });
    expect((await as(session, 'POST', `/api/servers/${serverId}/actions/start`)).statusCode).toBe(202);
    expect((await as(session, 'DELETE', `/api/servers/${serverId}`)).json()).toMatchObject({
      error: 'owner_only',
    });
  });

  test('the last administrator cannot lock themselves out', async () => {
    const me = (await as(admin, 'GET', '/api/users')).json<UserListEntry[]>()[0];
    expect((await as(admin, 'PATCH', `/api/users/${me?.id}`, { isAdmin: false })).json()).toMatchObject({
      error: 'last_admin',
    });
    expect((await as(admin, 'DELETE', `/api/users/${me?.id}`)).json()).toMatchObject({
      error: 'cannot_delete_self',
    });
    expect((await as(admin, 'PATCH', `/api/users/${me?.id}`, { disabled: true })).json()).toMatchObject({
      error: 'cannot_disable_self',
    });
  });

  test('locking or deleting a user ends their sessions', async () => {
    const lena = await createLena();
    const session = await login(t, 'lena', 'lena-passwort-1');
    expect((await as(session, 'GET', '/api/auth/me')).statusCode).toBe(200);
    await as(admin, 'PATCH', `/api/users/${lena.id}`, { disabled: true });
    expect((await as(session, 'GET', '/api/auth/me')).statusCode).toBe(401);
    const relogin = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'lena', password: 'lena-passwort-1' },
    });
    expect(relogin.statusCode).toBe(401);
  });

  test('custom roles: in-use roles stay, built-in roles are fixed', async () => {
    const lena = await createLena();
    const role = (
      await as(admin, 'POST', '/api/roles', {
        name: 'Builder',
        description: 'Dateien und Konsole',
        permissions: ['files', 'console', 'files'],
      })
    ).json<RoleEntry>();
    expect(role.permissions).toEqual(['files', 'console']);
    await as(admin, 'PUT', `/api/users/${lena.id}/access`, { access: [{ serverId, roleId: role.id }] });
    expect((await as(admin, 'DELETE', `/api/roles/${role.id}`)).json()).toMatchObject({
      error: 'role_in_use',
    });
    expect(
      (
        await as(admin, 'PATCH', `/api/roles/${await roleId('owner')}`, { name: 'x', permissions: [] })
      ).json(),
    ).toMatchObject({
      error: 'builtin_role',
    });
    const session = await login(t, 'lena', 'lena-passwort-1');
    expect((await as(session, 'GET', `/api/servers/${serverId}/files`)).statusCode).toBe(200);
  });

  test('API keys work without CSRF, cannot make new keys, and stop working when revoked', async () => {
    const created = await as(admin, 'POST', '/api/tokens', { name: 'Home Assistant', expiresInDays: 30 });
    const { token, entry } = created.json<{ token: string; entry: { id: number; prefix: string } }>();
    expect(token.startsWith('mh_')).toBe(true);
    expect(token.startsWith(entry.prefix)).toBe(true);
    expect(JSON.stringify((await as(admin, 'GET', '/api/tokens')).json())).not.toContain(token);

    const key = { bearer: token };
    expect((await as(key, 'GET', '/api/servers')).json<ServerSummary[]>()).toHaveLength(1);
    expect((await as(key, 'POST', `/api/servers/${serverId}/actions/start`)).statusCode).toBe(202);
    expect((await as(key, 'POST', '/api/tokens', { name: 'noch einer' })).json()).toMatchObject({
      error: 'session_required',
    });
    await as(admin, 'DELETE', `/api/tokens/${entry.id}`);
    expect((await as(key, 'GET', '/api/servers')).json()).toMatchObject({ error: 'invalid_token' });
  });

  test('the audit log records who did what; settings hide secrets', async () => {
    await createLena();
    const log = (await as(admin, 'GET', '/api/audit')).json<AuditEntry[]>();
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(['user.create', 'server.create']));
    expect(log.find((e) => e.action === 'user.create')).toMatchObject({
      username: 'philip',
      details: { username: 'lena' },
    });
    const serverLog = (await as(admin, 'GET', `/api/servers/${serverId}/audit`)).json<AuditEntry[]>();
    expect(serverLog.every((e) => e.serverId === serverId)).toBe(true);

    const saved = await as(admin, 'PUT', '/api/settings', {
      curseforgeApiKey: '$2a$10$geheimer-schluessel',
      timezone: 'Europe/Vienna',
    });
    expect(saved.json()).toMatchObject({ curseforgeConfigured: true, timezone: 'Europe/Vienna' });
    expect(JSON.stringify(saved.json())).not.toContain('geheimer');
  });
});
