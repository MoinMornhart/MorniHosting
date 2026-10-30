/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Changelog, UpdateInfo } from '@mornihosting/shared';
import { authHeaders, createTestApp, setupAdmin, type Session, type TestApp } from './helpers.js';

const HEAD = 'b886c33f113e8d3334a7c20776e5da54a1bbe712';
const RUNNING = 'a1b2c3d';
const commit = (sha: string, message: string, date: string) => ({
  sha,
  commit: { message, committer: { date } },
});

/** GitHub as far as the update check needs it: the newest commit on main and the comparison. */
function fakeGithub() {
  const asked: string[] = [];
  const handle = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url.endsWith('/commits/main'))
      return Response.json(commit(HEAD, 'Fortschrittsseite: fertig', '2026-10-30T11:44:00Z'));
    if (url.includes('/commits?sha=')) {
      return Response.json([
        commit(RUNNING + '0000', 'Neues Server-Panel\n\nKopf, Reiter', '2026-10-30T12:00:00Z'),
        commit('3333333cccc', 'Merge pull request #20 from pmornhart/claude/x', '2026-10-30T11:50:00Z'),
        commit('4444444dddd', 'Echte Logos', '2026-10-30T11:00:00Z'),
      ]);
    }
    if (url.includes('/compare/')) {
      return Response.json({
        ahead_by: 3,
        html_url: 'https://github.com/pmornhart/MorniHosting/compare/a1b2c3d...b886c33',
        commits: [
          commit(
            '1111111aaaa',
            'Server bestellen wie bei einem Hoster\n\nPakete, Name, Add-ons',
            '2026-10-30T11:20:00Z',
          ),
          commit('2222222bbbb', 'Merge pull request #17 from pmornhart/claude/x', '2026-10-30T11:43:00Z'),
          commit(HEAD, 'Fortschrittsseite: fertig', '2026-10-30T11:44:00Z'),
        ],
      });
    }
    return new Response('{}', { status: 404 });
  });
  return { handle, asked };
}

describe('panel updates (follow the main branch)', () => {
  let t: TestApp;
  let s: Session;
  let github: ReturnType<typeof fakeGithub>;
  const call = async (method: 'GET' | 'POST', url = '/api/system/update') =>
    t.app.inject({ method, url, headers: authHeaders(s) });
  const restart = async (version: string) => {
    await t.cleanup();
    t = await createTestApp({ MH_VERSION: version });
    s = await setupAdmin(t);
  };
  const updateDir = () => path.join(t.dataDir, 'update');

  beforeEach(async () => {
    github = fakeGithub();
    vi.stubGlobal('fetch', github.handle);
    t = await createTestApp({ MH_VERSION: RUNNING });
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await t.cleanup();
  });

  test('lists what is new since the running commit, without merge commits, newest first', async () => {
    const info = (await call('GET')).json<UpdateInfo>();
    expect(info).toMatchObject({
      current: RUNNING,
      latest: 'b886c33',
      available: true,
      behind: 3,
      canSelfUpdate: false,
      checkFailed: false,
      run: null,
    });
    expect(info.changes.map((c) => c.title)).toEqual([
      'Fortschrittsseite: fertig',
      'Server bestellen wie bei einem Hoster',
    ]);
    expect(github.asked.at(-1)).toContain(`/compare/${RUNNING}...${HEAD}`);
  });

  test('"what is new" names the running version and lists its changes without merges', async () => {
    await restart(`v1.0.0-4-g${RUNNING}`);
    const log = (await call('GET', '/api/system/changelog')).json<Changelog>();
    expect(log).toMatchObject({ release: '1.0.0', commit: RUNNING, failed: false });
    expect(log.changes.map((c) => c.title)).toEqual(['Neues Server-Panel', 'Echte Logos']);
    expect(github.asked.at(-1)).toContain(`/commits?sha=${RUNNING}`);
  });

  test('the update button hands over to the host updater, whose steps and output show up', async () => {
    expect((await call('POST')).json()).toMatchObject({ error: 'self_update_unavailable' });
    fs.mkdirSync(updateDir(), { recursive: true });
    fs.writeFileSync(path.join(updateDir(), 'agent.json'), '{"installedAt":"2026-10-28"}');

    expect((await call('POST')).json<UpdateInfo>()).toMatchObject({
      updating: true,
      run: { state: 'requested' },
    });
    expect(JSON.parse(fs.readFileSync(path.join(updateDir(), 'request.json'), 'utf8'))).toMatchObject({
      version: 'b886c33',
      by: 'philip',
    });

    // update.sh takes the request, reports its step and prints with colours.
    fs.rmSync(path.join(updateDir(), 'request.json'));
    fs.writeFileSync(
      path.join(updateDir(), 'status.json'),
      JSON.stringify({ state: 'running', step: 'build', at: new Date().toISOString() }),
    );
    fs.writeFileSync(
      path.join(updateDir(), 'log.txt'),
      '\u001b[32m ✔\u001b[0m Code aktuell (b886c33)\n\n …  Panel wird gebaut\n',
    );
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({
      updating: true,
      run: { state: 'running', step: 'build', log: [' ✔ Code aktuell (b886c33)', ' …  Panel wird gebaut'] },
    });

    fs.writeFileSync(
      path.join(updateDir(), 'status.json'),
      JSON.stringify({ state: 'done', step: null, at: new Date().toISOString() }),
    );
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ updating: false, run: { state: 'done' } });
  });

  test('a request nobody picks up is shown as stuck', async () => {
    fs.mkdirSync(updateDir(), { recursive: true });
    fs.writeFileSync(path.join(updateDir(), 'agent.json'), '{}');
    fs.writeFileSync(
      path.join(updateDir(), 'request.json'),
      JSON.stringify({ requestedAt: '2026-10-30T08:00:00Z' }),
    );
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({
      updating: false,
      run: { state: 'stuck' },
    });
  });

  test('the newest commit itself, a release and an unknown build', async () => {
    await restart('b886c33');
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ available: false, behind: 0 });
    expect(github.asked.some((u) => u.includes('/compare/'))).toBe(false);

    await restart('v1.0.0-3-ga1b2c3d');
    await call('GET');
    expect(github.asked.at(-1)).toContain(`/compare/a1b2c3d...${HEAD}`);

    await restart('1.0.0');
    await call('GET');
    expect(github.asked.at(-1)).toContain(`/compare/v1.0.0...${HEAD}`);

    await restart('dev');
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ available: true, latest: 'b886c33' });
  });

  test('a failed check is not repeated at once; "check now" asks again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 403 })),
    );
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ checkFailed: true, available: false });
    vi.stubGlobal('fetch', github.handle);
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ checkFailed: true });
    expect((await call('POST', '/api/system/update/check')).json<UpdateInfo>()).toMatchObject({
      checkFailed: false,
      available: true,
    });
  });

  test('checks switched off means no update', async () => {
    await t.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: authHeaders(s),
      payload: { checkUpdates: false },
    });
    expect((await call('GET')).json<UpdateInfo>()).toMatchObject({ available: false, checkedAt: null });
  });
});
