/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DnsStatus, ServerDetail, ServerSummary } from '@mornihosting/shared';
import { createDnsClient } from '../src/dns/providers.js';
import { authHeaders, createTestApp, setupAdmin, type Session, type TestApp } from './helpers.js';

const TOKEN = 'cf-test-token';
const ZONE = { id: 'zone-1', name: 'mein-minecraft.de' };
const CF = 'api.cloudflare.com';

interface FakeRecord {
  id: string;
  type: string;
  name: string;
  content?: string;
  data?: { priority: number; weight: number; port: number; target: string };
  proxied?: boolean;
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/** Just enough of Cloudflare's API (zones and DNS records) and of api.ipify.org. */
function createFakeInternet() {
  const records = new Map<string, FakeRecord>();
  const net = { ip: '93.223.190.172', nextId: 1 };
  const handle = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(urlOf(input));
    if (url.hostname === 'api.ipify.org') return new Response(net.ip);
    if (url.hostname !== CF) return new Response('', { status: 404 });
    if (new Headers(init?.headers).get('authorization') !== `Bearer ${TOKEN}`)
      return Response.json({ success: false, errors: [{ message: 'Invalid API Token' }] }, { status: 403 });
    const method = init?.method ?? 'GET';
    const parts = url.pathname.split('/');
    const id = parts[6] ?? '';
    const body = init?.body ? (JSON.parse(String(init.body)) as Omit<FakeRecord, 'id'>) : null;
    if (url.pathname === '/client/v4/zones') return Response.json({ success: true, result: [ZONE] });
    if (method === 'GET') {
      const found = [...records.values()].filter(
        (r) => r.type === url.searchParams.get('type') && r.name === url.searchParams.get('name'),
      );
      return Response.json({ success: true, result: found });
    }
    if (method === 'POST' && body) {
      const created = { ...body, id: `rec-${net.nextId++}` };
      records.set(created.id, created);
      return Response.json({ success: true, result: created });
    }
    if (method === 'PUT' && body && records.has(id)) {
      records.set(id, { ...body, id });
      return Response.json({ success: true, result: { id } });
    }
    if (method === 'DELETE') return new Response(null, { status: records.delete(id) ? 200 : 404 });
    return Response.json({ success: false, errors: [{ message: 'not found' }] }, { status: 404 });
  };
  const byName = (type: string, name: string) =>
    [...records.values()].find((r) => r.type === type && r.name === name);
  return { records, net, handle, byName };
}

describe('own domain without NetBird (DNS)', () => {
  let t: TestApp;
  let s: Session;
  let fake: ReturnType<typeof createFakeInternet>;
  const call = (method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE', url: string, payload?: object) =>
    t.app.inject({ method, url, payload, headers: authHeaders(s) });
  const connect = () => call('PUT', '/api/dns', { provider: 'cloudflare', token: TOKEN, zoneId: ZONE.id });
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
    fake = createFakeInternet();
    vi.stubGlobal('fetch', fake.handle);
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('connect with a key: the domain is offered, a wrong key is explained, the key stays secret', async () => {
    const wrong = await call('POST', '/api/dns/discover', { provider: 'cloudflare', token: 'falsch' });
    expect(wrong.json()).toMatchObject({ error: 'dns_unauthorized', params: { host: CF } });
    const found = await call('POST', '/api/dns/discover', { provider: 'cloudflare', token: TOKEN });
    expect(found.json()).toEqual({ zones: [ZONE] });
    const status = (await connect()).json<DnsStatus>();
    expect(status).toMatchObject({
      configured: true,
      provider: 'cloudflare',
      domain: ZONE.name,
      ip: '93.223.190.172',
      netbirdActive: false,
    });
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });

  test('a Java server gets an A and an SRV record, Bedrock only the A record', async () => {
    await connect();
    const java = await create({ netbirdName: 'reich' });
    expect(fake.byName('A', 'reich.mein-minecraft.de')).toMatchObject({
      content: '93.223.190.172',
      proxied: false,
    });
    expect(fake.byName('SRV', '_minecraft._tcp.reich.mein-minecraft.de')?.data).toEqual({
      priority: 0,
      weight: 5,
      port: 25565,
      target: 'reich.mein-minecraft.de',
    });
    const info = await detail(java.id);
    expect(info.domain).toBe('reich.mein-minecraft.de');
    expect(info.netbird?.services).toEqual([
      { purpose: 'main', domain: 'reich.mein-minecraft.de', port: 25565 },
    ]);

    await create({
      name: 'Handy',
      edition: 'bedrock',
      software: 'bedrock',
      version: 'latest',
      port: 19133,
      netbirdName: 'handy',
    });
    expect(fake.byName('A', 'handy.mein-minecraft.de')).toBeDefined();
    expect(fake.byName('SRV', '_minecraft._tcp.handy.mein-minecraft.de')).toBeUndefined();
  });

  test('a new home IP moves all records (DynDNS), a new port moves the SRV record', async () => {
    await connect();
    const server = await create({ netbirdName: 'reich' });
    fake.net.ip = '93.223.190.200';
    await t.dns.refreshIp();
    expect(fake.byName('A', 'reich.mein-minecraft.de')?.content).toBe('93.223.190.200');
    expect((await call('GET', '/api/dns')).json<DnsStatus>().ip).toBe('93.223.190.200');

    await call('PATCH', `/api/servers/${server.id}`, { port: 25570 });
    await vi.waitFor(() =>
      expect(fake.byName('SRV', '_minecraft._tcp.reich.mein-minecraft.de')?.data?.port).toBe(25570),
    );
  });

  test('renaming, removing the name and deleting the server clean up; a record made by hand is taken over', async () => {
    await connect();
    fake.records.set('by-hand', {
      id: 'by-hand',
      type: 'A',
      name: 'reich.mein-minecraft.de',
      content: '1.2.3.4',
    });
    const server = await create({ netbirdName: 'reich' });
    expect(fake.records.get('by-hand')?.content).toBe('93.223.190.172');
    expect([...fake.records.values()].filter((r) => r.type === 'A')).toHaveLength(1);

    await call('PUT', `/api/servers/${server.id}/netbird`, { name: 'arm' });
    expect(fake.byName('A', 'reich.mein-minecraft.de')).toBeUndefined();
    expect(fake.byName('A', 'arm.mein-minecraft.de')).toBeDefined();
    expect((await detail(server.id)).domain).toBe('arm.mein-minecraft.de');

    await call('PUT', `/api/servers/${server.id}/netbird`, { name: null });
    expect(fake.records.size).toBe(0);
    expect((await detail(server.id)).domain).toBeNull();

    const other = await create({ name: 'Creative', port: 25566, netbirdName: 'creative' });
    expect(fake.records.size).toBe(2);
    await call('DELETE', `/api/servers/${other.id}`);
    await vi.waitFor(() => expect(fake.records.size).toBe(0));
  });

  test('only one of NetBird and DNS; disconnecting removes the records', async () => {
    t.ctx.settings.setValue('netbird', { apiUrl: 'https://api.netbird.io' });
    expect((await connect()).json()).toMatchObject({ error: 'dns_netbird_active' });
    t.ctx.settings.deleteValue('netbird');
    await connect();
    const netbirdNow = await call('PUT', '/api/netbird', {
      apiUrl: 'https://api.netbird.io',
      token: 'nbp_x',
      domain: 'x.de',
      peerId: 'p',
    });
    expect(netbirdNow.json()).toMatchObject({ error: 'netbird_dns_active' });

    const server = await create({ netbirdName: 'reich' });
    expect(fake.records.size).toBe(2);
    const off = (await call('DELETE', '/api/dns')).json<DnsStatus>();
    expect(off.configured).toBe(false);
    expect(fake.records.size).toBe(0);
    expect((await detail(server.id)).domain).toBeNull();
  });
});

describe('IONOS', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('sends the key as X-API-Key and the SRV record as priority plus "weight port target"', async () => {
    const sent: { url: string; key: string | null; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({
        url: urlOf(input),
        key: new Headers(init?.headers).get('x-api-key'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json([{ id: 'ionos-1' }]);
    });
    const client = createDnsClient('ionos', 'prefix.secret');
    const id = await client.create('zone-9', {
      type: 'SRV',
      name: '_minecraft._tcp.reich.mein-minecraft.de',
      srv: { priority: 0, weight: 5, port: 25566, target: 'reich.mein-minecraft.de' },
    });
    expect(id).toBe('ionos-1');
    expect(sent[0]).toEqual({
      url: 'https://api.hosting.ionos.com/dns/v1/zones/zone-9/records',
      key: 'prefix.secret',
      body: [
        {
          name: '_minecraft._tcp.reich.mein-minecraft.de',
          type: 'SRV',
          content: '5 25566 reich.mein-minecraft.de',
          prio: 0,
          ttl: 60,
          disabled: false,
        },
      ],
    });
  });
});
