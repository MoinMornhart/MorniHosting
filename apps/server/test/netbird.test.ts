/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  NetbirdDiscovery,
  NetbirdServerInfo,
  NetbirdStatus,
  ServerDetail,
  ServerSummary,
} from '@mornihosting/shared';
import { settings } from '../src/db/schema.js';
import {
  authHeaders,
  createTestApp,
  login,
  setupAdmin,
  waitFor,
  type Session,
  type TestApp,
} from './helpers.js';

const TOKEN = 'nbp_test_token_1234';
const PEER = {
  id: 'peer-mh',
  name: 'mornihosting',
  ip: '100.92.14.7',
  connected: true,
  hostname: 'mornihosting',
};
const BASE = 'moinmornhart.de';

interface FakeService {
  id: string;
  domain: string;
  mode: string;
  listen_port: number;
  pass_host_header: boolean;
  targets: { target_id: string; target_type: string; protocol: string; port: number }[];
}

/** A tiny NetBird management API: domains, peers and reverse-proxy services, ports from 31000 up. */
function createFakeNetbird() {
  const services = new Map<string, FakeService>();
  const calls: { method: string; path: string; auth: string | null }[] = [];
  const next = { port: 31000, id: 1 };
  const handle = async (url: URL, init: RequestInit | undefined): Promise<Response> => {
    const method = init?.method ?? 'GET';
    const auth = new Headers(init?.headers).get('authorization');
    calls.push({ method, path: url.pathname, auth });
    if (auth !== `Token ${TOKEN}`) return Response.json({ message: 'token invalid' }, { status: 401 });
    const body = init?.body ? (JSON.parse(String(init.body)) as Omit<FakeService, 'id'>) : null;
    const id = url.pathname.split('/')[4] ?? '';
    if (url.pathname === '/api/peers')
      return Response.json([PEER, { ...PEER, id: 'peer-laptop', name: 'laptop' }]);
    if (url.pathname === '/api/reverse-proxies/domains') {
      return Response.json([
        { id: 'd1', domain: BASE, validated: true, type: 'custom' },
        { id: 'd2', domain: 'abc.netbird.app', validated: true, type: 'free' },
      ]);
    }
    if (url.pathname === '/api/reverse-proxies/services' && method === 'GET')
      return Response.json([...services.values()]);
    if (method === 'POST' && body) {
      if ([...services.values()].some((s) => s.domain === body.domain))
        return Response.json({ message: 'domain already in use' }, { status: 409 });
      const created = {
        ...body,
        id: `svc-${next.id++}`,
        listen_port: body.mode === 'http' ? 0 : next.port++,
      };
      services.set(created.id, created);
      return Response.json(created);
    }
    if (method === 'PUT' && body && services.has(id)) {
      const updated = { ...body, id, listen_port: body.listen_port || (services.get(id)?.listen_port ?? 0) };
      services.set(id, updated);
      return Response.json(updated);
    }
    if (method === 'DELETE') {
      const known = services.delete(id);
      return new Response(null, { status: known ? 200 : 404 });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  return {
    services,
    calls,
    handle,
    byDomain: (domain: string) => [...services.values()].find((s) => s.domain === domain),
  };
}

// Modrinth and GeyserMC, just enough for the voice chat and Geyser switches.
const JARS: Readonly<Record<string, Buffer>> = {
  '9eGKb6K1': Buffer.from('PK voicechat plugin'),
  wKkoqHrH: Buffer.from('PK geyser plugin'),
  floodgate: Buffer.from('PK floodgate plugin'),
};
const FILES: Readonly<Record<string, string>> = {
  '9eGKb6K1': 'voicechat-bukkit-2.6.26.jar',
  wKkoqHrH: 'Geyser-Spigot.jar',
};
const hash = (algorithm: string, id: string): string =>
  crypto
    .createHash(algorithm)
    .update(JARS[id] ?? '')
    .digest('hex');

function fakePluginSites(url: URL): Response {
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'cdn.modrinth.com') return new Response(JARS[parts[0] ?? ''] ?? '');
  if (url.hostname === 'download.geysermc.org') {
    if (parts.includes('downloads')) return new Response(JARS['floodgate']);
    return Response.json({
      version: '2.2.5',
      build: 120,
      time: '2026-10-01T00:00:00Z',
      downloads: { spigot: { name: 'floodgate-spigot.jar', sha256: hash('sha256', 'floodgate') } },
    });
  }
  const id = parts[2] ?? '';
  if (!FILES[id]) return new Response('not found', { status: 404 });
  if (parts[3] === 'version') {
    return Response.json([
      {
        id: `v-${id}`,
        project_id: id,
        name: '2.6.26',
        version_number: '2.6.26',
        game_versions: ['1.21.4'],
        loaders: ['paper', 'bukkit'],
        date_published: '2026-10-01T00:00:00Z',
        version_type: 'release',
        files: [
          {
            url: `https://cdn.modrinth.com/${id}/${FILES[id]}`,
            filename: FILES[id],
            primary: true,
            hashes: { sha512: hash('sha512', id) },
          },
        ],
        dependencies: [],
      },
    ]);
  }
  return Response.json({ id, slug: id, title: id, icon_url: null, project_type: 'mod' });
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('NetBird automation', () => {
  let t: TestApp;
  let s: Session;
  let netbird: ReturnType<typeof createFakeNetbird>;
  const call = (
    method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE',
    url: string,
    payload?: object,
    session = s,
  ) => t.app.inject({ method, url, payload, headers: authHeaders(session) });
  const configure = () =>
    call('PUT', '/api/netbird', {
      apiUrl: 'https://api.netbird.io',
      token: TOKEN,
      domain: BASE,
      peerId: 'peer-mh',
    });
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
  const detail = async (id: string) => (await call('GET', `/api/servers/${id}`)).json<ServerDetail>();

  beforeEach(async () => {
    netbird = createFakeNetbird();
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(urlOf(input));
      return url.hostname === 'api.netbird.io' ? netbird.handle(url, init) : fakePluginSites(url);
    });
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('set up once: domains and machines are offered, the token never leaves the server', async () => {
    const wrong = await call('POST', '/api/netbird/discover', { token: 'nbp_wrong' });
    expect(wrong.json()).toMatchObject({ error: 'netbird_unauthorized' });
    const found = (await call('POST', '/api/netbird/discover', { token: TOKEN })).json<NetbirdDiscovery>();
    expect(found.domains.map((d) => d.domain)).toEqual([BASE, 'abc.netbird.app']);
    expect(found.suggestedPeerId).toBe('peer-mh');

    const unknown = await call('PUT', '/api/netbird', {
      apiUrl: 'https://api.netbird.io',
      token: TOKEN,
      domain: 'fremd.de',
      peerId: 'peer-mh',
    });
    expect(unknown.json()).toMatchObject({ error: 'netbird_domain_unknown' });
    const status = (await configure()).json<NetbirdStatus>();
    expect(status).toMatchObject({ configured: true, domain: BASE, peerName: 'mornihosting' });
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect(JSON.stringify(t.ctx.db.select().from(settings).all())).not.toContain(TOKEN);
    expect(netbird.calls.every((c) => c.auth === `Token ${TOKEN}` || c.auth === 'Token nbp_wrong')).toBe(
      true,
    );
    // The stored token is never sent to another address: changing it needs the token again.
    const elsewhere = await call('POST', '/api/netbird/discover', { apiUrl: 'https://evil.example' });
    expect(elsewhere.json()).toMatchObject({ error: 'netbird_token_missing' });
    const moved = await call('PUT', '/api/netbird', {
      apiUrl: 'https://evil.example',
      domain: BASE,
      peerId: 'peer-mh',
    });
    expect(moved.json()).toMatchObject({ error: 'netbird_token_missing' });
    expect((await call('POST', '/api/netbird/discover', {})).json<NetbirdDiscovery>().peers).toHaveLength(2);
  });

  test('a new server with a name gets its address in NetBird right away', async () => {
    await configure();
    const server = await create({ netbirdName: 'Survival' });
    const main = netbird.byDomain(`survival.${BASE}`);
    expect(main).toMatchObject({ mode: 'tcp', listen_port: 31000, pass_host_header: false });
    expect(main?.targets).toEqual([
      expect.objectContaining({ target_id: 'peer-mh', target_type: 'peer', protocol: 'tcp', port: 25565 }),
    ]);
    const shown = await detail(server.id);
    expect(shown.address).toBe(`survival.${BASE}:31000`);
    expect(shown.netbird).toEqual<NetbirdServerInfo>({
      name: 'survival',
      services: [{ purpose: 'main', domain: `survival.${BASE}`, port: 31000 }],
      error: null,
    });
    const taken = await call('POST', '/api/servers', {
      edition: 'java',
      software: 'paper',
      version: '1.21.4',
      memoryMb: 2048,
      port: 25567,
      eula: true,
      startNow: false,
      name: 'Drei',
      netbirdName: 'survival',
    });
    expect(taken.json()).toMatchObject({ error: 'netbird_name_taken' });
  });

  test('Geyser and voice chat get their own addresses, port changes follow, the outside port stays', async () => {
    await configure();
    const server = await create({ netbirdName: 'survival' });
    await call('PUT', `/api/servers/${server.id}/geyser`, { enabled: true });
    await call('PUT', `/api/servers/${server.id}/voicechat`, { enabled: true });
    await waitFor(async () => (await detail(server.id)).netbird?.services.length === 3);
    expect(netbird.byDomain(`survival-bedrock.${BASE}`)).toMatchObject({
      mode: 'udp',
      targets: [expect.objectContaining({ port: 19132 })],
    });
    expect(netbird.byDomain(`survival-voice.${BASE}`)).toMatchObject({
      mode: 'udp',
      targets: [expect.objectContaining({ port: 24454 })],
    });
    const shown = await detail(server.id);
    expect(shown.geyserPublicPort).toBe(netbird.byDomain(`survival-bedrock.${BASE}`)?.listen_port);
    expect(shown.voiceHost).toBe(
      `survival.${BASE}:${netbird.byDomain(`survival-voice.${BASE}`)?.listen_port}`,
    );

    await call('PATCH', `/api/servers/${server.id}`, { port: 25570 });
    await waitFor(() => netbird.byDomain(`survival.${BASE}`)?.targets[0]?.port === 25570);
    expect(netbird.byDomain(`survival.${BASE}`)?.listen_port).toBe(31000);

    await call('PUT', `/api/servers/${server.id}/voicechat`, { enabled: false });
    await waitFor(() => !netbird.byDomain(`survival-voice.${BASE}`));
    expect((await detail(server.id)).netbird?.services.map((x) => x.purpose).sort()).toEqual([
      'geyser',
      'main',
    ]);
  });

  test('renaming moves the addresses, removing the name or the server cleans up NetBird', async () => {
    await configure();
    const server = await create({ netbirdName: 'survival' });
    const renamed = await call('PUT', `/api/servers/${server.id}/netbird`, { name: 'creative' });
    expect(renamed.json<{ netbird: NetbirdServerInfo }>().netbird.services[0]?.domain).toBe(
      `creative.${BASE}`,
    );
    expect(netbird.byDomain(`survival.${BASE}`)).toBeUndefined();
    expect((await detail(server.id)).address).toBe(`creative.${BASE}:31000`);

    await call('PUT', `/api/servers/${server.id}/netbird`, { name: null });
    expect(netbird.services.size).toBe(0);
    expect(await detail(server.id)).toMatchObject({ domain: null, publicPort: null, netbird: null });

    await call('PUT', `/api/servers/${server.id}/netbird`, { name: 'survival' });
    expect(netbird.services.size).toBe(1);
    await call('DELETE', `/api/servers/${server.id}`, { deleteFiles: true });
    await waitFor(() => netbird.services.size === 0);
  });

  test('the panel gets an HTTPS address with "Pass Host Header"; a hand-made service is taken over', async () => {
    await configure();
    netbird.services.set('svc-hand', {
      id: 'svc-hand',
      domain: `panel.${BASE}`,
      mode: 'http',
      listen_port: 0,
      pass_host_header: false,
      targets: [],
    });
    const status = (
      await call('POST', '/api/netbird/panel', { name: 'panel', port: 8080 })
    ).json<NetbirdStatus>();
    expect(status.panelAddress).toBe(`panel.${BASE}`);
    expect(netbird.services.get('svc-hand')).toMatchObject({
      pass_host_header: true,
      targets: [expect.objectContaining({ target_id: 'peer-mh', protocol: 'http', port: 8080 })],
    });
    const panel = (await call('GET', '/api/settings')).json<{ panelDomain: string }>();
    expect(panel.panelDomain).toBe(`panel.${BASE}`);

    await create({ netbirdName: 'survival' });
    expect((await call('DELETE', '/api/netbird')).statusCode).toBe(200);
    expect([...netbird.services.keys()]).toEqual(['svc-hand']);
    expect((await call('GET', '/api/netbird')).json<NetbirdStatus>().configured).toBe(false);
  });

  test('only admins may use NetBird; a name from another user is ignored', async () => {
    await configure();
    await call('POST', '/api/users', {
      username: 'lena',
      password: 'lena-passwort-1',
      displayName: 'Lena',
      canCreateServers: true,
    });
    const lena = await login(t, 'lena', 'lena-passwort-1');
    expect((await call('GET', '/api/netbird', undefined, lena)).statusCode).toBe(403);
    const hers = (
      await call(
        'POST',
        '/api/servers',
        {
          edition: 'java',
          software: 'paper',
          version: '1.21.4',
          memoryMb: 2048,
          port: 25570,
          eula: true,
          startNow: false,
          name: 'Lenas Welt',
          netbirdName: 'lena',
        },
        lena,
      )
    ).json<ServerSummary>();
    expect(netbird.services.size).toBe(0);
    expect((await call('PUT', `/api/servers/${hers.id}/netbird`, { name: 'lena' }, lena)).statusCode).toBe(
      403,
    );
  });
});
