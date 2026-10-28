/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { UpdateInfo } from '@mornihosting/shared';
import { authHeaders, createTestApp, setupAdmin, type Session, type TestApp } from './helpers.js';

describe('panel updates', () => {
  let t: TestApp;
  let s: Session;
  const github = vi.fn(async () =>
    Response.json({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/x/y/releases/v9.9.9',
      body: 'Neu: alles',
    }),
  );
  const call = async (method: 'GET' | 'POST') =>
    t.app.inject({ method, url: '/api/system/update', headers: authHeaders(s) });

  beforeEach(async () => {
    vi.stubGlobal('fetch', github);
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('finds a newer release and hands the update to the host updater', async () => {
    const info = (await call('GET')).json<UpdateInfo>();
    expect(info).toMatchObject({
      current: '0.0.0-test',
      latest: '9.9.9',
      available: true,
      canSelfUpdate: false,
      notes: 'Neu: alles',
    });
    expect((await call('POST')).json()).toMatchObject({ error: 'self_update_unavailable' });

    const dir = path.join(t.dataDir, 'update');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'agent.json'), '{"installedAt":"2026-10-28"}');
    expect((await call('POST')).json<UpdateInfo>()).toMatchObject({ updating: true });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'request.json'), 'utf8'))).toMatchObject({
      version: '9.9.9',
      by: 'philip',
    });
    expect(github).toHaveBeenCalledTimes(1);
  });

  test('a panel built from source before any release takes the first release', async () => {
    await t.cleanup();
    t = await createTestApp({ MH_VERSION: 'dev' });
    s = await setupAdmin(t);
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ current: 'dev', available: true });
  });

  test('an older or equal release is no update', async () => {
    await t.cleanup();
    t = await createTestApp({ MH_VERSION: '9.9.9' });
    s = await setupAdmin(t);
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ available: false });
  });

  test('no release yet, or checks switched off, means no update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ latest: null, available: false });
    await t.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: authHeaders(s),
      payload: { checkUpdates: false },
    });
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ available: false, checkedAt: null });
  });
});
