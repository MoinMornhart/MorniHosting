/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ServerDetail, ServerSummary, UserInfo, UserListEntry } from '@mornihosting/shared';
import { roles } from '../src/db/schema.js';
import {
  authHeaders,
  createTestApp,
  login,
  setupAdmin,
  waitFor,
  type Session,
  type TestApp,
} from './helpers.js';

/** Mojang's name lookup, for two made-up accounts. */
const PROFILES: Readonly<Record<string, { id: string; name: string }>> = {
  philip_mc: { id: '069a79f444e94726a5befca90e38aaf5', name: 'Philip_MC' },
  lenamc: { id: '1b2c3d4e5f60718293a4b5c6d7e8f901', name: 'LenaMC' },
};
const PHILIP_UUID = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

const fakeMojang = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(urlOf(input));
  const name = decodeURIComponent(url.pathname.split('/').pop() ?? '').toLowerCase();
  const profile = url.hostname === 'api.mojang.com' ? PROFILES[name] : undefined;
  return profile ? Response.json(profile) : new Response('', { status: 404 });
});

describe('linked Minecraft accounts', () => {
  let t: TestApp;
  let s: Session;
  const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object, session = s) =>
    t.app.inject({ method, url, payload, headers: authHeaders(session) });
  const create = async (body: object = {}): Promise<ServerSummary> =>
    (
      await call('POST', '/api/servers', {
        edition: 'java',
        software: 'paper',
        version: '1.21.4',
        memoryMb: 2048,
        port: 25565,
        eula: true,
        startNow: false,
        name: 'Survival',
        ...body,
      })
    ).json<ServerSummary>();
  const opsOf = (id: string): { name: string; uuid?: string; level?: number }[] => {
    const file = path.join(t.dataDir, 'servers', id, 'ops.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  };
  const opNames = (id: string): string[] => opsOf(id).map((o) => o.name);
  const roleId = async (key: string): Promise<number> =>
    t.ctx.db.select().from(roles).where(eq(roles.builtIn, key)).get()?.id ?? 0;

  beforeEach(async () => {
    vi.stubGlobal('fetch', fakeMojang);
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('linking shows the account and makes its owner OP on their servers', async () => {
    const server = await create();
    const linked = await call('PUT', '/api/account/minecraft', { name: 'philip_mc' });
    expect(linked.json<{ user: UserInfo }>().user.minecraft).toEqual({
      name: 'Philip_MC',
      uuid: PHILIP_UUID,
    });
    expect(opsOf(server.id)).toEqual([
      { uuid: PHILIP_UUID, name: 'Philip_MC', level: 4, bypassesPlayerLimit: false },
    ]);
    // A server made afterwards starts with its owner as operator right away.
    const next = await create({ name: 'Creative', port: 25566 });
    expect(opNames(next.id)).toEqual(['Philip_MC']);
    // Bedrock has no Java accounts: nothing is written there.
    const bedrock = await create({ edition: 'bedrock', software: 'bedrock', version: 'latest', port: 19133 });
    expect(opNames(bedrock.id)).toEqual([]);
  });

  test('only owners get OP; changing the role or deleting the user takes it away again', async () => {
    const survival = await create();
    const creative = await create({ name: 'Creative', port: 25566 });
    const lena = (
      await call('POST', '/api/users', { username: 'lena', password: 'lena-passwort-1', displayName: 'Lena' })
    ).json<UserListEntry>();
    const lenaSession = await login(t, 'lena', 'lena-passwort-1');
    await call('PUT', '/api/account/minecraft', { name: 'LenaMC' }, lenaSession);
    const [owner, viewer] = [await roleId('owner'), await roleId('viewer')];
    await call('PUT', `/api/users/${lena.id}/access`, {
      access: [
        { serverId: survival.id, roleId: viewer },
        { serverId: creative.id, roleId: owner },
      ],
    });
    await waitFor(() => opNames(creative.id).includes('LenaMC'));
    expect(opNames(survival.id)).not.toContain('LenaMC');

    await call('PUT', `/api/users/${lena.id}/access`, {
      access: [{ serverId: creative.id, roleId: viewer }],
    });
    await waitFor(() => !opNames(creative.id).includes('LenaMC'));

    await call('PUT', `/api/users/${lena.id}/access`, { access: [{ serverId: creative.id, roleId: owner }] });
    await waitFor(() => opNames(creative.id).includes('LenaMC'));
    await call('DELETE', `/api/users/${lena.id}`);
    await waitFor(() => !opNames(creative.id).includes('LenaMC'));
  });

  test('an operator added by hand stays when the account is unlinked', async () => {
    const byHand = await create();
    const panelMade = await create({ name: 'Creative', port: 25566 });
    fs.writeFileSync(
      path.join(t.dataDir, 'servers', byHand.id, 'ops.json'),
      JSON.stringify([{ uuid: PHILIP_UUID, name: 'Philip_MC', level: 4, bypassesPlayerLimit: false }]),
    );
    await call('PUT', '/api/account/minecraft', { name: 'Philip_MC' });
    expect(opNames(panelMade.id)).toEqual(['Philip_MC']);
    const unlinked = await call('DELETE', '/api/account/minecraft');
    expect(unlinked.json<{ user: UserInfo }>().user.minecraft).toBeNull();
    expect(opNames(byHand.id)).toEqual(['Philip_MC']);
    expect(opNames(panelMade.id)).toEqual([]);
  });

  test('on a running server the console is used', async () => {
    const server = await create({ startNow: true });
    await waitFor(
      async () =>
        (await call('GET', `/api/servers/${server.id}`)).json<ServerDetail>().live.state === 'running',
    );
    await call('PUT', '/api/account/minecraft', { name: 'Philip_MC' });
    await waitFor(() => opNames(server.id).includes('Philip_MC'));
    await call('DELETE', '/api/account/minecraft');
    await waitFor(() => !opNames(server.id).includes('Philip_MC'));
  });

  test('unknown names and accounts linked by someone else are refused', async () => {
    expect((await call('PUT', '/api/account/minecraft', { name: 'Gibtsnicht' })).json()).toMatchObject({
      error: 'player_unknown',
    });
    expect((await call('PUT', '/api/account/minecraft', { name: 'a b' })).statusCode).toBe(400);
    await call('PUT', '/api/account/minecraft', { name: 'Philip_MC' });
    await call('POST', '/api/users', { username: 'lena', password: 'lena-passwort-1', displayName: 'Lena' });
    const lenaSession = await login(t, 'lena', 'lena-passwort-1');
    const taken = await call('PUT', '/api/account/minecraft', { name: 'philip_mc' }, lenaSession);
    expect(taken.json()).toMatchObject({ error: 'minecraft_taken', params: { name: 'Philip_MC' } });
  });
});
