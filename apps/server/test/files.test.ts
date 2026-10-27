/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  FileEntry,
  PlayersResponse,
  ServerDetail,
  ServerSummary,
  TrashEntry,
  WorldInfo,
} from '@mornihosting/shared';
import {
  authHeaders,
  createTestApp,
  multipartBody,
  setupAdmin,
  waitFor,
  type Session,
  type TestApp,
} from './helpers.js';
import { storedZip } from './zip-fixture.js';

const paper = {
  name: 'Survival',
  edition: 'java',
  software: 'paper',
  version: '1.21.4',
  memoryMb: 3072,
  port: 25565,
  eula: true,
};

/** A PNG header with the given size; enough for the icon check. */
function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('files, settings, players and worlds', () => {
  let t: TestApp;
  let s: Session;
  let id: string;
  let dir: string;

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    t.app.inject({
      method,
      url: `/api/servers/${id}${url}`,
      headers: authHeaders(s),
      ...(payload ? { payload } : {}),
    });
  const state = async (): Promise<string> => (await call('GET', '')).json<ServerDetail>().live.state;
  const stop = async (): Promise<void> => {
    await call('POST', '/actions/stop');
    await waitFor(async () => (await state()) === 'stopped');
  };

  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders(s),
      payload: paper,
    });
    id = created.json<ServerSummary>().id;
    dir = path.join(t.dataDir, 'servers', id);
    await waitFor(async () => (await state()) === 'running');
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('lists, edits, renames and deletes files into the trash', async () => {
    const root = (await call('GET', '/files')).json<FileEntry[]>();
    expect(root.map((f) => f.name)).toEqual(expect.arrayContaining(['world', 'server.properties']));
    expect(root.findIndex((f) => f.type === 'file')).toBeGreaterThan(
      root.findLastIndex((f) => f.type === 'dir'),
    );

    expect((await call('POST', '/files/mkdir', { path: 'notes' })).statusCode).toBe(204);
    expect(
      (await call('PUT', '/files/content', { path: 'notes/readme.txt', content: 'Hallo' })).statusCode,
    ).toBe(204);
    expect((await call('GET', '/files/content?path=notes/readme.txt')).json()).toMatchObject({
      content: 'Hallo',
    });

    expect(
      (await call('POST', '/files/rename', { from: 'notes/readme.txt', to: 'notes/liesmich.txt' }))
        .statusCode,
    ).toBe(204);
    expect(fs.existsSync(path.join(dir, 'notes', 'liesmich.txt'))).toBe(true);

    expect((await call('POST', '/files/delete', { paths: ['notes'] })).json()).toEqual({ moved: 1 });
    expect(fs.existsSync(path.join(dir, 'notes'))).toBe(false);
    const trash = (await call('GET', '/trash')).json<TrashEntry[]>();
    expect(trash.map((e) => e.originalPath)).toEqual(['notes']);

    expect((await call('POST', `/trash/${trash[0]?.id}/restore`)).statusCode).toBe(204);
    expect(fs.readFileSync(path.join(dir, 'notes', 'liesmich.txt'), 'utf8')).toBe('Hallo');
    expect((await call('GET', '/trash')).json()).toEqual([]);
  });

  test.each([
    { url: '/files?path=../', expected: 'path_outside' },
    { url: '/files/content?path=../../panel.db', expected: 'path_outside' },
    { url: '/files/download?path=..%2F..%2Fpanel.db', expected: 'path_outside' },
  ])('refuses paths outside the server folder: $url', async ({ url, expected }) => {
    const res = await call('GET', url);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: expected });
  });

  test('refuses to write outside or to rename across the boundary', async () => {
    expect(
      (await call('PUT', '/files/content', { path: '../escape.txt', content: 'x' })).json(),
    ).toMatchObject({
      error: 'path_outside',
    });
    expect(
      (await call('POST', '/files/rename', { from: 'server.properties', to: '../x' })).json(),
    ).toMatchObject({
      error: 'path_outside',
    });
    expect(fs.existsSync(path.join(t.dataDir, 'servers', 'escape.txt'))).toBe(false);
  });

  test('uploads files, but only plugins into the plugin folder', async () => {
    const upload = async (folder: string, name: string) => {
      const body = multipartBody([{ name, data: 'content' }]);
      return t.app.inject({
        method: 'POST',
        url: `/api/servers/${id}/files/upload?path=${folder}`,
        payload: body.payload,
        headers: { ...authHeaders(s), ...body.headers },
      });
    };
    expect((await upload('plugins', 'LuckPerms.jar')).statusCode).toBe(200);
    expect(fs.existsSync(path.join(dir, 'plugins', 'LuckPerms.jar'))).toBe(true);
    expect((await upload('plugins', 'virus.sh')).json()).toMatchObject({ error: 'extension_not_allowed' });
    expect((await upload('', 'hallo.txt')).statusCode).toBe(200);
    // Folder parts in the file name are dropped, so the file lands in the chosen folder.
    expect((await upload('', '../../ausbruch.txt')).json()).toMatchObject([{ path: 'ausbruch.txt' }]);
    expect(fs.existsSync(path.join(dir, 'ausbruch.txt'))).toBe(true);
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.uploading'))).toBe(false);
  });

  test('zips and unzips inside the server folder', async () => {
    const zip = await call('POST', '/files/zip', {
      paths: ['server.properties', 'world'],
      name: 'paket.zip',
    });
    expect(zip.json<FileEntry>()).toMatchObject({ name: 'paket.zip', type: 'file' });
    await call('POST', '/files/mkdir', { path: 'entpackt' });
    const unzipped = await call('POST', '/files/unzip', { path: 'paket.zip', destination: 'entpackt' });
    expect(unzipped.json<{ files: number }>().files).toBeGreaterThan(1);
    expect(fs.existsSync(path.join(dir, 'entpackt', 'server.properties'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'entpackt', 'world', 'level.dat'))).toBe(true);
    fs.writeFileSync(path.join(dir, 'boese.zip'), storedZip({ '../../boese.txt': 'x' }));
    expect((await call('POST', '/files/unzip', { path: 'boese.zip', destination: '' })).json()).toMatchObject(
      {
        error: 'path_outside',
      },
    );
  });

  test('downloads a file and a folder as ZIP', async () => {
    const file = await call('GET', '/files/download?path=server.properties');
    expect(file.headers['content-disposition']).toContain('server.properties');
    expect(file.body).toContain('motd=');
    const folder = await call('GET', '/files/download?path=world');
    expect(folder.headers['content-type']).toBe('application/zip');
    expect(folder.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  test('server.properties: form values, managed keys stay locked', async () => {
    const before = (await call('GET', '/properties')).json<{
      values: Record<string, string>;
      running: boolean;
    }>();
    expect(before.running).toBe(true);
    expect(before.values['server-port']).toBe('25565');
    const saved = await call('PUT', '/properties', { values: { motd: '§aWillkommen!', difficulty: 'hard' } });
    expect(saved.json()).toMatchObject({
      restartRequired: true,
      values: { motd: '§aWillkommen!', difficulty: 'hard' },
    });
    expect(fs.readFileSync(path.join(dir, 'server.properties'), 'utf8')).toContain(
      'motd=\\u00a7aWillkommen!',
    );
    const locked = await call('PUT', '/properties', { values: { 'server-port': '1' } });
    expect(locked.json()).toMatchObject({ error: 'managed_property' });
  });

  test('players: commands while running, file edits while stopped', async () => {
    expect((await call('POST', '/players/action', { action: 'op', name: 'Juna' })).statusCode).toBe(204);
    expect((await call('GET', '/players')).json<PlayersResponse>().ops.map((p) => p.name)).toEqual(['Juna']);

    await stop();
    expect((await call('POST', '/players/action', { action: 'kick', name: 'Juna' })).json()).toMatchObject({
      error: 'server_not_running',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id: '069a79f444e94726a5befca90e38aaf5', name: 'Notch' })),
    );
    expect(
      (await call('POST', '/players/action', { action: 'whitelist-add', name: 'Notch' })).statusCode,
    ).toBe(204);
    expect((await call('POST', '/players/action', { action: 'deop', name: 'Juna' })).statusCode).toBe(204);
    const players = (await call('PUT', '/players/whitelist', { enabled: true })).json<PlayersResponse>();
    expect(players).toMatchObject({
      whitelistEnabled: true,
      ops: [],
      whitelist: [{ name: 'Notch', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5' }],
    });
    expect((await call('GET', '/properties')).json()).toMatchObject({
      values: { 'enforce-whitelist': 'true' },
    });
  });

  test('worlds: reset needs a stopped server and keeps the old world in the trash', async () => {
    expect((await call('GET', '/worlds')).json<WorldInfo[]>()).toEqual([
      expect.objectContaining({ name: 'world', active: true }),
    ]);
    expect((await call('POST', '/worlds/reset', { seed: '42' })).json()).toMatchObject({
      error: 'server_must_be_stopped',
    });
    await stop();
    expect((await call('POST', '/worlds/reset', { seed: '42' })).statusCode).toBe(200);
    expect(fs.existsSync(path.join(dir, 'world'))).toBe(false);
    expect(
      (await call('GET', '/trash'))
        .json<TrashEntry[]>()
        .map((e) => e.originalPath)
        .sort(),
    ).toEqual(['world', 'world_nether', 'world_the_end']);
    expect((await call('GET', '/properties')).json()).toMatchObject({ values: { 'level-seed': '42' } });
  });

  test('worlds: upload a ZIP and switch to it', async () => {
    const body = multipartBody([
      { name: 'Insel.zip', data: storedZip({ 'Insel/level.dat': 'x', 'Insel/region/r.0.0.mca': 'y' }) },
    ]);
    const uploaded = await t.app.inject({
      method: 'POST',
      url: `/api/servers/${id}/worlds/upload`,
      payload: body.payload,
      headers: { ...authHeaders(s), ...body.headers },
    });
    expect(uploaded.json<WorldInfo>()).toMatchObject({ name: 'Insel', active: false });
    expect(fs.existsSync(path.join(dir, 'Insel', 'region', 'r.0.0.mca'))).toBe(true);
    await stop();
    const worlds = (await call('POST', '/worlds/activate', { name: 'Insel' })).json<WorldInfo[]>();
    expect(worlds.find((w) => w.active)?.name).toBe('Insel');
  });

  test('server icon must be a 64×64 PNG', async () => {
    const send = async (data: Buffer) => {
      const body = multipartBody([{ name: 'icon.png', data, type: 'image/png' }]);
      return t.app.inject({
        method: 'POST',
        url: `/api/servers/${id}/icon`,
        payload: body.payload,
        headers: { ...authHeaders(s), ...body.headers },
      });
    };
    expect((await send(Buffer.from('kein Bild'))).json()).toMatchObject({ error: 'icon_not_png' });
    expect((await send(pngHeader(128, 128))).json()).toMatchObject({ error: 'icon_wrong_size' });
    expect((await send(pngHeader(64, 64))).statusCode).toBe(204);
    expect((await call('GET', '')).json<ServerDetail>().hasIcon).toBe(true);
  });
});
