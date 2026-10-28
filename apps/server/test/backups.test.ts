/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  BackupEntry,
  ScheduleEntry,
  ServerDetail,
  ServerSummary,
  WebhookEntry,
} from '@mornihosting/shared';
import { toGlobs } from '../src/backups/service.js';
import { isPrivateAddress } from '../src/lib/net-guard.js';
import { listZip } from '../src/lib/zip.js';
import { authHeaders, createTestApp, setupAdmin, waitFor, type Session, type TestApp } from './helpers.js';

const paper = {
  name: 'Survival',
  edition: 'java',
  software: 'paper',
  version: '1.21.4',
  memoryMb: 2048,
  port: 25565,
  eula: true,
};

describe('exclusion patterns', () => {
  test.each([
    ['logs/', ['logs/**']],
    ['/cache/', ['cache/**']],
    ['*.log', ['**/*.log', '**/*.log/**']],
    ['world/playerdata', ['world/playerdata', 'world/playerdata/**']],
    ['  ', []],
  ])('%s', (pattern, globs) => {
    expect(toGlobs(pattern)).toEqual(globs);
  });
});

describe('private addresses', () => {
  test.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['192.168.178.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['::1', true],
    ['fd00::1', true],
    ['::ffff:127.0.0.1', true],
    ['162.159.128.233', false],
    ['2606:4700::6810:84e5', false],
  ])('%s', (address, blocked) => {
    expect(isPrivateAddress(address)).toBe(blocked);
  });
});

describe('backups, schedules and webhooks', () => {
  let t: TestApp;
  let s: Session;
  let id: string;
  let dir: string;

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    t.app.inject({ method, url, headers: authHeaders(s), ...(payload ? { payload } : {}) });
  const server = async (): Promise<ServerDetail> =>
    (await call('GET', `/api/servers/${id}`)).json<ServerDetail>();
  const backupsOf = async (): Promise<BackupEntry[]> =>
    (await call('GET', `/api/servers/${id}/backups`)).json<{ backups: BackupEntry[] }>().backups;
  const backupNow = async (): Promise<BackupEntry> => {
    const started = (await call('POST', `/api/servers/${id}/backups`)).json<BackupEntry>();
    await waitFor(async () => (await backupsOf()).find((b) => b.id === started.id)?.status !== 'running');
    const done = (await backupsOf()).find((b) => b.id === started.id);
    if (!done) throw new Error('backup vanished');
    return done;
  };

  beforeEach(async () => {
    t = await createTestApp(
      {},
      { resolver: async (host) => (host.endsWith('.internal.test') ? ['10.0.0.7'] : ['162.159.128.233']) },
    );
    s = await setupAdmin(t);
    id = (await call('POST', '/api/servers', paper)).json<ServerSummary>().id;
    dir = path.join(t.dataDir, 'servers', id);
    await waitFor(async () => (await server()).live.state === 'running');
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('backs up a running server without logs and restores it', async () => {
    fs.writeFileSync(path.join(dir, 'logs', 'latest.log'), 'lots of log');
    const backup = await backupNow();
    expect(backup).toMatchObject({ status: 'done', kind: 'manual' });
    const zip = path.join(t.dataDir, 'backups', id, backup.fileName);
    const names = await listZip(zip, 10_000);
    expect(names).toEqual(expect.arrayContaining(['server.properties', 'world/level.dat']));
    expect(names.some((n) => n.startsWith('logs/'))).toBe(false);

    fs.writeFileSync(path.join(dir, 'server.properties'), 'kaputt=1\n');
    fs.writeFileSync(path.join(dir, 'neu.txt'), 'nach dem Backup');
    const restored = await call('POST', `/api/servers/${id}/backups/${backup.id}/restore`);
    expect(restored.statusCode).toBe(204);
    expect(fs.readFileSync(path.join(dir, 'server.properties'), 'utf8')).toContain('motd=');
    expect(fs.existsSync(path.join(dir, 'neu.txt'))).toBe(false);
    expect((await backupsOf()).map((b) => b.kind)).toEqual(['before-restore', 'manual']);
    await waitFor(async () => (await server()).live.state === 'running');
  });

  test('keeps only as many backups as set', async () => {
    expect(
      (await call('PUT', `/api/servers/${id}/backups/settings`, { keep: 2, exclude: ['logs/'] })).statusCode,
    ).toBe(200);
    await backupNow();
    await backupNow();
    const third = await backupNow();
    const left = await backupsOf();
    expect(left).toHaveLength(2);
    expect(left[0]?.id).toBe(third.id);
    expect(fs.readdirSync(path.join(t.dataDir, 'backups', id))).toHaveLength(2);
  });

  test('downloads a backup and refuses a second one while the first runs', async () => {
    const backup = await backupNow();
    const download = await call('GET', `/api/servers/${id}/backups/${backup.id}/download`);
    expect(download.headers['content-type']).toBe('application/zip');
    expect(download.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const first = await call('POST', `/api/servers/${id}/backups`);
    const second = await call('POST', `/api/servers/${id}/backups`);
    expect(first.statusCode).toBe(202);
    expect(second.json()).toMatchObject({ error: 'backup_running' });
    await waitFor(async () => (await backupsOf()).every((b) => b.status !== 'running'));
  });

  test('schedules: friendly specs become timers, wrong ones are refused', async () => {
    const base = `/api/servers/${id}/schedules`;
    const daily = await call('POST', base, {
      name: 'Nachts neu starten',
      action: 'restart',
      spec: { kind: 'daily', time: '04:00' },
      warnMinutes: 5,
    });
    const entry = daily.json<ScheduleEntry>();
    expect(entry.nextRunAt).not.toBeNull();
    expect(new Date(entry.nextRunAt ?? '').getTime()).toBeGreaterThan(Date.now());
    expect(
      (
        await call('POST', base, {
          name: 'x',
          action: 'backup',
          spec: { kind: 'interval', unit: 'minutes', every: 7 },
        })
      ).json(),
    ).toMatchObject({
      error: 'invalid_interval',
    });
    expect(
      (
        await call('POST', base, { name: 'x', action: 'command', spec: { kind: 'daily', time: '12:00' } })
      ).json(),
    ).toMatchObject({
      error: 'command_required',
    });
    const off = await call('PATCH', `${base}/${entry.id}`, { enabled: false });
    expect(off.json<ScheduleEntry>()).toMatchObject({ enabled: false, nextRunAt: null });

    const say = (
      await call('POST', base, {
        name: 'Hallo',
        action: 'command',
        command: 'say Hallo',
        spec: { kind: 'interval', unit: 'hours', every: 6 },
      })
    ).json<ScheduleEntry>();
    const ran = await call('POST', `${base}/${say.id}/run`);
    expect(ran.json<ScheduleEntry>()).toMatchObject({ lastResult: 'ok' });
    const backup = (
      await call('POST', base, {
        name: 'Sichern',
        action: 'backup',
        spec: { kind: 'weekly', days: [1, 3], time: '03:30' },
      })
    ).json<ScheduleEntry>();
    expect((await call('POST', `${base}/${backup.id}/run`)).json<ScheduleEntry>()).toMatchObject({
      lastResult: 'ok',
    });
    expect((await backupsOf()).map((b) => b.kind)).toEqual(['scheduled']);
  });

  test('webhooks: right host per service, never the local network, secret URL', async () => {
    expect(
      (
        await call('POST', '/api/webhooks', {
          name: 'D',
          kind: 'discord',
          url: 'https://example.com/hook',
          events: ['server.started'],
        })
      ).json(),
    ).toMatchObject({
      error: 'webhook_host_not_allowed',
    });
    expect(
      (
        await call('POST', '/api/webhooks', {
          name: 'G',
          kind: 'generic',
          url: 'https://127.0.0.1/hook',
          events: ['server.started'],
        })
      ).json(),
    ).toMatchObject({
      error: 'webhook_private_address',
    });
    expect(
      (
        await call('POST', '/api/webhooks', {
          name: 'G',
          kind: 'generic',
          url: 'https://nas.internal.test/hook',
          events: ['server.started'],
        })
      ).json(),
    ).toMatchObject({
      error: 'webhook_private_address',
    });
    expect(
      (
        await call('POST', '/api/webhooks', {
          name: 'G',
          kind: 'generic',
          url: 'http://example.com/hook',
          events: ['server.started'],
        })
      ).statusCode,
    ).toBe(400);

    const sent: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(null, { status: 204 });
      }),
    );
    const created = await call('POST', '/api/webhooks', {
      name: 'Discord',
      kind: 'discord',
      url: 'https://discord.com/api/webhooks/123/geheim',
      events: ['server.started', 'server.stopped'],
    });
    const hook = created.json<WebhookEntry>();
    expect(hook.urlHost).toBe('discord.com');
    expect(JSON.stringify((await call('GET', '/api/webhooks')).json())).not.toContain('geheim');

    expect((await call('POST', `/api/webhooks/${hook.id}/test`)).json()).toEqual({ status: 204 });
    await call('POST', `/api/servers/${id}/actions/restart`);
    await waitFor(() => sent.length >= 3);
    const titles = sent.map((m) => (m.body as { embeds: { title: string }[] }).embeds[0]?.title);
    expect(titles).toEqual(['✅ Test von MorniHosting', '⚪ Server gestoppt', '🟢 Server gestartet']);
    expect(sent.every((m) => m.url === 'https://discord.com/api/webhooks/123/geheim')).toBe(true);
    expect((await call('GET', '/api/webhooks')).json<WebhookEntry[]>()[0]?.lastStatus).toBe(204);
  });
});
