/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  CREATABLE_SOFTWARE,
  GAME_IDS,
  GAMES,
  SOFTWARE,
  allowedGameImages,
  gameImage,
  type GameId,
  type ServerDetail,
  type ServerSummary,
} from '@mornihosting/shared';
import { buildContainerSpec } from '../src/servers/spec.js';
import { authHeaders, createTestApp, setupAdmin, waitFor, type Session, type TestApp } from './helpers.js';

const order = (game: GameId, extra: Record<string, unknown> = {}) => ({
  name: `Mein ${GAMES[game].label}`,
  edition: game,
  software: game,
  version: GAMES[game].versions[0]?.id ?? 'latest',
  memoryMb: GAMES[game].recommendedGb * 1024,
  port: GAMES[game].ports[0].defaultPort,
  eula: true,
  ...extra,
});

describe('game catalog', () => {
  test('every game is consistent', () => {
    GAME_IDS.forEach((id) => {
      const game = GAMES[id];
      expect(game.id).toBe(id);
      expect(game.packagesGb).toContain(game.recommendedGb);
      expect(game.mountPath.startsWith('/')).toBe(true);
      expect(new Set(game.ports.map((p) => p.key)).size).toBe(game.ports.length);
      expect(new Set(game.fields.map((f) => f.key)).size).toBe(game.fields.length);
      if (game.console === 'rcon') expect(game.rconPort).toBeGreaterThan(0);
      expect(SOFTWARE[id].edition).toBe(id);
      expect(CREATABLE_SOFTWARE[id]).toEqual([id]);
    });
  });

  test('only listed images can be started', () => {
    const allowed = allowedGameImages();
    GAME_IDS.forEach((id) => {
      expect(allowed).toContain(gameImage(GAMES[id], GAMES[id].versions[0]?.id ?? ''));
      // An unknown "version" must not smuggle in another tag.
      expect(allowed).toContain(gameImage(GAMES[id], 'evil:tag'));
    });
  });
});

describe('Factorio with the fake driver', () => {
  let t: TestApp;
  let s: Session;
  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const detail = async (id: string): Promise<ServerDetail> =>
    (await t.app.inject({ url: `/api/servers/${id}`, headers: authHeaders(s) })).json<ServerDetail>();

  const create = async (payload: object): Promise<ServerSummary> => {
    const res = await t.app.inject({ method: 'POST', url: '/api/servers', headers: authHeaders(s), payload });
    expect(res.statusCode).toBe(200);
    return res.json<ServerSummary>();
  };

  test('create, start, players, save, stop', async () => {
    const created = await create(
      order('factorio', { gameSettings: { spaceAge: 'false', token: 'geheim123' } }),
    );
    expect(created.edition).toBe('factorio');
    await waitFor(async () => (await detail(created.id)).live.state === 'running');

    const d = await detail(created.id);
    expect(d.image).toBe('factoriotools/factorio:stable');
    expect(d.gamePorts).toEqual([{ key: 'main', port: 34197, protocol: 'udp' }]);
    // Secrets never come back, only that one is stored.
    expect(d.gameSettings).toEqual({ values: { spaceAge: 'false' }, secretsSet: ['token'] });

    const dir = path.join(t.dataDir, 'servers', created.id);
    expect(fs.readFileSync(path.join(dir, 'config', 'rconpw'), 'utf8').length).toBeGreaterThan(10);
    expect(fs.existsSync(path.join(dir, 'saves', 'world.zip'))).toBe(true);

    const answer = await t.app.inject({
      method: 'POST',
      url: `/api/servers/${created.id}/command`,
      headers: authHeaders(s),
      payload: { command: '/players online' },
    });
    expect(answer.json<{ answer: string }>().answer).toContain('Online players (0)');

    const players = await t.app.inject({
      url: `/api/servers/${created.id}/players`,
      headers: authHeaders(s),
    });
    expect(players.json()).toMatchObject({ online: [], ops: [] });

    // Minecraft-only parts refuse.
    const world = await t.app.inject({ url: `/api/servers/${created.id}/worlds`, headers: authHeaders(s) });
    expect(world.statusCode).toBe(400);
    const geyser = await t.app.inject({
      method: 'PUT',
      url: `/api/servers/${created.id}/geyser`,
      headers: authHeaders(s),
      payload: { enabled: true },
    });
    expect(geyser.statusCode).toBe(400);

    await t.app.inject({
      method: 'POST',
      url: `/api/servers/${created.id}/actions/stop`,
      headers: authHeaders(s),
    });
    await waitFor(async () => (await detail(created.id)).live.state === 'stopped');
    const logs = t.servers.logs(created.id).join('\n');
    expect(logs).toContain('Saving map');
    expect(logs).toContain('remote-quit');
  });

  test('container gets the right folder, ports and variables', async () => {
    const created = await create(
      order('factorio', { port: 34200, startNow: false, gameSettings: { username: 'morni', token: 'abc' } }),
    );
    const row = t.servers.rowWithSecrets(created.id);
    const spec = buildContainerSpec(t.ctx.config, row, 'Europe/Berlin');
    expect(spec.mountPath).toBe('/factorio');
    expect(spec.ports).toEqual([{ containerPort: 34200, hostPort: 34200, protocol: 'udp' }]);
    expect(spec.env).toMatchObject({
      PORT: '34200',
      RCON_PORT: '27015',
      USERNAME: 'morni',
      TOKEN: 'abc',
      DLC_SPACE_AGE: 'true',
      PUID: '1000',
    });
    // The token is stored encrypted.
    expect(t.servers.row(created.id).gameSettings['token']).not.toBe('abc');
  });

  test('settings are checked and can be changed later', async () => {
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders(s),
      payload: order('factorio', { gameSettings: { evil: 'x' } }),
    });
    expect(bad.statusCode).toBe(400);
    const injection = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders(s),
      payload: order('factorio', { gameSettings: { username: '$(rm -rf /)' } }),
    });
    expect(injection.statusCode).toBe(400);

    const created = await create(order('factorio', { startNow: false }));
    const put = await t.app.inject({
      method: 'PUT',
      url: `/api/servers/${created.id}/game-settings`,
      headers: authHeaders(s),
      payload: { values: { updateMods: 'true', token: 'neu' } },
    });
    expect(put.statusCode).toBe(204);
    expect((await detail(created.id)).gameSettings).toEqual({
      values: { updateMods: 'true' },
      secretsSet: ['token'],
    });
  });

  test('a second server on the same port is refused', async () => {
    await create(order('factorio', { startNow: false }));
    const again = await t.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders(s),
      payload: order('factorio', { startNow: false }),
    });
    expect(again.statusCode).toBe(409);
  });
});
