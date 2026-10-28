/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { InstalledContent, InstallResult, ServerSummary } from '@mornihosting/shared';
import { compareVersionNames } from '../src/market/service.js';
import {
  authHeaders,
  createTestApp,
  multipartBody,
  setupAdmin,
  type Session,
  type TestApp,
} from './helpers.js';

const JAR_LUCK = Buffer.from('PK luckperms jar');
const JAR_VAULT = Buffer.from('PK vault jar');
const sha512 = (b: Buffer): string => crypto.createHash('sha512').update(b).digest('hex');

interface FakeVersion {
  readonly id: string;
  readonly project: string;
  readonly number: string;
  readonly file: string;
  readonly url: string;
  readonly hash: string;
  readonly deps: readonly string[];
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

const filesIn = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

/** A tiny Modrinth: two projects, LuckPerms needs Vault. */
function fakeModrinth(overrides: { luckUrl?: string; luckHash?: string } = {}): typeof fetch {
  const versions: Record<string, FakeVersion> = {
    luck: {
      id: 'v-luck',
      project: 'luck',
      number: '5.5.71',
      file: 'LuckPerms-5.5.71.jar',
      url: overrides.luckUrl ?? 'https://cdn.modrinth.com/data/luck/LuckPerms-5.5.71.jar',
      hash: overrides.luckHash ?? sha512(JAR_LUCK),
      deps: ['vault'],
    },
    vault: {
      id: 'v-vault',
      project: 'vault',
      number: '1.7.3',
      file: 'Vault-1.7.3.jar',
      url: 'https://cdn.modrinth.com/data/vault/Vault-1.7.3.jar',
      hash: sha512(JAR_VAULT),
      deps: [],
    },
  };
  const toApi = (v: FakeVersion) => ({
    id: v.id,
    project_id: v.project,
    name: v.number,
    version_number: v.number,
    game_versions: ['1.21.4'],
    loaders: ['paper'],
    date_published: '2026-10-01T00:00:00Z',
    version_type: 'release',
    files: [{ url: v.url, filename: v.file, primary: true, hashes: { sha512: v.hash } }],
    dependencies: v.deps.map((d) => ({ project_id: d, version_id: null, dependency_type: 'required' })),
  });
  const names: Record<string, string> = { luck: 'LuckPerms', vault: 'Vault' };
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(urlOf(input));
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'cdn.modrinth.com')
      return new Response(parts.includes('luck') ? JAR_LUCK : JAR_VAULT);
    if (url.hostname === 'evil.example.com') return new Response('evil');
    if (url.hostname === 'cdn.redirect.test')
      return new Response(null, { status: 302, headers: { location: 'https://evil.example.com/x.jar' } });
    const [, kind, id, sub] = parts;
    const version = id ? versions[id] : undefined;
    if (kind === 'project' && version && sub === 'version') return Response.json([toApi(version)]);
    if (kind === 'project' && version) {
      return Response.json({ id, slug: id, title: names[id ?? ''], icon_url: null, project_type: 'plugin' });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('version names', () => {
  test.each([
    ['v5.5.71-bukkit', '5.5.0', 1],
    ['1.4.40', '1.5.3', -1],
    ['2.21.0', '2.21.0', 0],
    ['latest', '1.0', null],
  ])('%s vs %s', (a, b, expected) => {
    const result = compareVersionNames(a, b);
    expect(result === null ? null : Math.sign(result)).toBe(expected);
  });
});

describe('marketplace installs', () => {
  let t: TestApp;
  let s: Session;
  let id: string;
  let plugins: string;

  const post = async (url: string, payload: object) =>
    t.app.inject({ method: 'POST', url: `/api/servers/${id}${url}`, headers: authHeaders(s), payload });
  const content = async (): Promise<InstalledContent[]> =>
    (await t.app.inject({ url: `/api/servers/${id}/content`, headers: authHeaders(s) })).json<
      InstalledContent[]
    >();

  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders(s),
      payload: {
        name: 'Markt',
        edition: 'java',
        software: 'paper',
        version: '1.21.4',
        memoryMb: 2048,
        port: 25565,
        eula: true,
        startNow: false,
      },
    });
    id = created.json<ServerSummary>().id;
    plugins = path.join(t.dataDir, 'servers', id, 'plugins');
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('installs a plugin with its required dependency and checks the hashes', async () => {
    vi.stubGlobal('fetch', fakeModrinth());
    const res = await post('/market/install', { source: 'modrinth', projectId: 'luck' });
    expect(res.json<InstallResult>().installed).toEqual([
      { name: 'LuckPerms', fileName: 'LuckPerms-5.5.71.jar', dependency: false },
      { name: 'Vault', fileName: 'Vault-1.7.3.jar', dependency: true },
    ]);
    expect(fs.readFileSync(path.join(plugins, 'LuckPerms-5.5.71.jar'))).toEqual(JAR_LUCK);
    expect((await content()).map((c) => [c.name, c.source, c.dependencyOf])).toEqual([
      ['LuckPerms', 'modrinth', null],
      ['Vault', 'modrinth', 'LuckPerms'],
    ]);
  });

  test('refuses a file whose hash does not match and leaves nothing behind', async () => {
    vi.stubGlobal('fetch', fakeModrinth({ luckHash: sha512(Buffer.from('something else')) }));
    const res = await post('/market/install', { source: 'modrinth', projectId: 'luck' });
    expect(res.json()).toMatchObject({ error: 'market_hash_mismatch' });
    expect(filesIn(plugins)).toEqual([]);
  });

  test.each([
    { url: 'https://evil.example.com/LuckPerms.jar', what: 'a foreign host' },
    { url: 'http://cdn.modrinth.com/data/luck/LuckPerms.jar', what: 'plain http' },
    { url: 'https://cdn.redirect.test/LuckPerms.jar', what: 'a redirect to a foreign host' },
  ])('refuses downloads from $what', async ({ url }) => {
    vi.stubGlobal('fetch', fakeModrinth({ luckUrl: url }));
    const res = await post('/market/install', { source: 'modrinth', projectId: 'luck' });
    expect(res.json()).toMatchObject({ error: 'market_download_host' });
    expect(filesIn(plugins)).toEqual([]);
  });

  test('switches plugins off and on, and deletes them into the trash', async () => {
    vi.stubGlobal('fetch', fakeModrinth());
    await post('/market/install', { source: 'modrinth', projectId: 'luck' });
    expect((await post('/content/toggle', { fileName: 'Vault-1.7.3.jar', enabled: false })).statusCode).toBe(
      204,
    );
    expect(fs.existsSync(path.join(plugins, 'Vault-1.7.3.jar.disabled'))).toBe(true);
    expect((await content()).find((c) => c.name === 'Vault')?.enabled).toBe(false);
    await post('/content/toggle', { fileName: 'Vault-1.7.3.jar.disabled', enabled: true });
    expect(fs.existsSync(path.join(plugins, 'Vault-1.7.3.jar'))).toBe(true);
    expect((await post('/content/delete', { fileName: 'Vault-1.7.3.jar' })).statusCode).toBe(204);
    expect((await content()).map((c) => c.name)).toEqual(['LuckPerms']);
    const trash = await t.app.inject({ url: `/api/servers/${id}/trash`, headers: authHeaders(s) });
    expect(trash.json<{ originalPath: string }[]>().map((e) => e.originalPath)).toEqual([
      'plugins/Vault-1.7.3.jar',
    ]);
  });

  test('takes own .jar files, nothing else', async () => {
    const upload = async (name: string) => {
      const body = multipartBody([{ name, data: 'PK' }]);
      return t.app.inject({
        method: 'POST',
        url: `/api/servers/${id}/content/upload`,
        payload: body.payload,
        headers: { ...authHeaders(s), ...body.headers },
      });
    };
    expect((await upload('MeinPlugin.jar')).statusCode).toBe(200);
    expect((await upload('script.sh')).json()).toMatchObject({ error: 'extension_not_allowed' });
    expect((await content()).map((c) => [c.name, c.source])).toEqual([['MeinPlugin', 'upload']]);
  });

  test('a server without plugins has no marketplace', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders(s),
      payload: {
        name: 'Pur',
        edition: 'java',
        software: 'vanilla',
        version: '1.21.4',
        memoryMb: 2048,
        port: 25566,
        eula: true,
        startNow: false,
      },
    });
    const vanilla = created.json<ServerSummary>().id;
    const res = await t.app.inject({
      url: `/api/servers/${vanilla}/market/search?q=x`,
      headers: authHeaders(s),
    });
    expect(res.json()).toMatchObject({ error: 'no_content_support' });
  });
});
