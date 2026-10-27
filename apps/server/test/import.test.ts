/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ImportDetectionResult, ServerSummary } from '@mornihosting/shared';
import { resolveInside } from '../src/lib/paths.js';
import { authHeaders, createTestApp, setupAdmin, type Session, type TestApp } from './helpers.js';
import { storedZip } from './zip-fixture.js';

function multipart(file: Buffer, name: string): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----mhtest' + Date.now();
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/zip\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('paths stay inside their folder', () => {
  test.each([
    { rel: 'plugins/../server.properties', ok: true },
    { rel: '/world/level.dat', ok: true },
    { rel: '../other', ok: false },
    { rel: 'world/../../escape', ok: false },
    { rel: 'a\0b', ok: false },
  ])('$rel', ({ rel, ok }) => {
    const run = (): string => resolveInside('/data/servers/abc', rel);
    if (ok) expect(run().startsWith('/data/servers/abc')).toBe(true);
    else expect(run).toThrow();
  });
});

describe('importing a server', () => {
  let t: TestApp;
  let s: Session;
  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  test('detects Paper and its version, then creates the server with the files', async () => {
    const zip = storedZip({
      'MeinServer/paper-1.21.4-232.jar': 'jar',
      'MeinServer/server.properties': 'motd=Alt\n',
      'MeinServer/world/level.dat': 'x',
      'MeinServer/plugins/LuckPerms.jar': 'x',
    });
    const body = multipart(zip, 'MeinServer.zip');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/servers/import/upload',
      payload: body.payload,
      headers: { ...authHeaders(s), ...body.headers },
    });
    expect(res.statusCode).toBe(200);
    const detected = res.json<ImportDetectionResult>();
    expect(detected).toMatchObject({ software: 'paper', version: '1.21.4', worlds: ['world'], plugins: 1 });
    const confirm = await t.app.inject({
      method: 'POST',
      url: '/api/servers/import/confirm',
      headers: authHeaders(s),
      payload: {
        stagingId: detected.stagingId,
        name: 'Alt',
        software: 'paper',
        version: '1.21.4',
        memoryMb: 2048,
        port: 25570,
        eula: true,
      },
    });
    expect(confirm.statusCode).toBe(200);
    const server = confirm.json<ServerSummary>();
    expect(fs.readFileSync(path.join(t.dataDir, 'servers', server.id, 'server.properties'), 'utf8')).toBe(
      'motd=Alt\n',
    );
  });

  test('a ZIP that tries to write outside its folder is rejected', async () => {
    const zip = storedZip({ 'ok.txt': 'fine', '../../evil.txt': 'pwned' });
    const body = multipart(zip, 'evil.zip');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/servers/import/upload',
      payload: body.payload,
      headers: { ...authHeaders(s), ...body.headers },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'path_outside' });
    expect(fs.existsSync(path.join(t.dataDir, 'tmp', 'evil.txt'))).toBe(false);
    expect(fs.existsSync(path.join(t.dataDir, 'evil.txt'))).toBe(false);
  });

  test('a staging id cannot point elsewhere', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/servers/import/confirm',
      headers: authHeaders(s),
      payload: {
        stagingId: '../../servers',
        name: 'X',
        software: 'paper',
        version: '1.21.4',
        memoryMb: 2048,
        port: 25571,
        eula: true,
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
