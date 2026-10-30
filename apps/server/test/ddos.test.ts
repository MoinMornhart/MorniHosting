/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { DdosHostStatus, DdosStatus, ServerSummary } from '@mornihosting/shared';
import {
  authHeaders,
  createTestApp,
  login,
  setupAdmin,
  waitFor,
  type Session,
  type TestApp,
} from './helpers.js';

const run = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, '../../../scripts/ddos-guard.sh');

const hostStatus = (patch: Partial<DdosHostStatus>): DdosHostStatus => ({
  active: true,
  ipv4: true,
  ipv6: false,
  docker: true,
  sysctl: true,
  tcpPorts: ['25565'],
  udpPorts: [],
  limits: {
    tcpNewPerMinute: 120,
    tcpBurst: 60,
    tcpConnections: 64,
    udpPacketsPerSecond: 4000,
    udpBurst: 8000,
  },
  dropped: { tcpRate: 12, tcpConnections: 0, udpRate: 3400, invalid: 5 },
  error: null,
  at: new Date().toISOString(),
  ...patch,
});

describe('DDoS protection in the panel', () => {
  let t: TestApp;
  let s: Session;
  const call = (method: 'GET' | 'PUT' | 'POST' | 'PATCH', url: string, payload?: object, session = s) =>
    t.app.inject({ method, url, payload, headers: authHeaders(session) });
  const ddosDir = () => path.join(t.dataDir, 'ddos');
  const status = async () => (await call('GET', '/api/ddos')).json<DdosStatus>();
  const writeHost = (patch: Partial<DdosHostStatus>) =>
    fs.writeFileSync(path.join(ddosDir(), 'status.json'), JSON.stringify(hostStatus(patch)));
  const create = async (body: object): Promise<ServerSummary> =>
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

  beforeEach(async () => {
    t = await createTestApp();
    s = await setupAdmin(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  test('without the host part the switch only records the wish and says what is missing', async () => {
    expect(await status()).toMatchObject({
      enabled: false,
      state: 'no_host',
      hostInstalled: false,
      host: null,
    });
    const res = await call('PUT', '/api/ddos', { enabled: true });
    expect(res.json<DdosStatus>()).toMatchObject({ enabled: true, state: 'no_host' });
    expect(JSON.parse(fs.readFileSync(path.join(ddosDir(), 'wish.json'), 'utf8'))).toMatchObject({
      enabled: true,
      by: 'philip',
    });
  });

  test('the host answers: waiting, then active with dropped packets, failed, and stuck when silent', async () => {
    fs.mkdirSync(ddosDir(), { recursive: true });
    fs.writeFileSync(path.join(ddosDir(), 'agent.json'), '{"installedAt":"2026-10-30"}');
    expect((await status()).state).toBe('off');

    // An old answer from before the switch does not count.
    writeHost({ active: false, at: '2026-10-30T10:00:00Z' });
    expect((await call('PUT', '/api/ddos', { enabled: true })).json<DdosStatus>().state).toBe('waiting');

    writeHost({});
    expect(await status()).toMatchObject({ state: 'active', host: { dropped: { udpRate: 3400 } } });

    writeHost({ active: false, error: 'rules_failed' });
    expect((await status()).state).toBe('failed');

    // The timer answers every minute; ten minutes of silence means the host part stopped.
    const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
    fs.writeFileSync(
      path.join(ddosDir(), 'wish.json'),
      JSON.stringify({ enabled: true, at: minutesAgo(20) }),
    );
    writeHost({ at: minutesAgo(10) });
    expect((await status()).state).toBe('stuck');

    writeHost({ active: true });
    expect((await call('PUT', '/api/ddos', { enabled: false })).json<DdosStatus>().state).toBe('waiting');
    writeHost({ active: false });
    expect((await status()).state).toBe('off');
  });

  test('the port list follows the servers, so the host protects exactly those ports', async () => {
    await call('PUT', '/api/ddos', { enabled: true });
    const java = await create({});
    await create({
      edition: 'bedrock',
      software: 'bedrock',
      version: 'latest',
      port: 19133,
      name: 'Bedrock',
    });
    const ports = () => fs.readFileSync(path.join(ddosDir(), 'ports.txt'), 'utf8');
    await waitFor(() => ports().includes('udp 19133'));
    expect(ports()).toBe('tcp 25565\nudp 19133\n');

    await call('PATCH', `/api/servers/${java.id}`, { port: 25570 });
    await waitFor(() => ports().includes('tcp 25570'));
    expect(ports()).not.toContain('tcp 25565');
  });

  test('the spam limit goes into server.properties before each start of a Java server', async () => {
    const server = await create({});
    const props = path.join(t.dataDir, 'servers', server.id, 'server.properties');
    await call('POST', `/api/servers/${server.id}/actions/start`);
    await waitFor(() => fs.existsSync(path.join(t.dataDir, 'servers', server.id)));
    // Never set: the file stays untouched.
    expect(fs.existsSync(props) ? fs.readFileSync(props, 'utf8') : '').not.toContain('rate-limit');

    expect((await call('PUT', '/api/ddos', { rateLimit: 500 })).json<DdosStatus>().rateLimit).toBe(500);
    await call('POST', `/api/servers/${server.id}/actions/stop`);
    await call('POST', `/api/servers/${server.id}/actions/start`);
    await waitFor(() => fs.existsSync(props) && fs.readFileSync(props, 'utf8').includes('rate-limit=500'));

    await call('PUT', '/api/ddos', { rateLimit: 0 });
    await call('POST', `/api/servers/${server.id}/actions/stop`);
    await call('POST', `/api/servers/${server.id}/actions/start`);
    await waitFor(() => fs.readFileSync(props, 'utf8').includes('rate-limit=0'));

    expect((await call('PUT', '/api/ddos', { rateLimit: 5 })).statusCode).toBe(400);
  });

  test('only admins see or change it', async () => {
    await call('POST', '/api/users', { username: 'lena', password: 'lena-passwort-1', displayName: 'Lena' });
    const lena = await login(t, 'lena', 'lena-passwort-1');
    expect((await call('GET', '/api/ddos', undefined, lena)).statusCode).toBe(403);
    expect((await call('PUT', '/api/ddos', { enabled: true }, lena)).statusCode).toBe(403);
  });
});

/**
 * iptables, ip6tables and sysctl as small shell scripts: they keep chains and rules in a text file, so
 * the guard script can run without root and without touching the real firewall.
 */
const FAKE_IPTABLES = `#!/usr/bin/env bash
state="$FAKE_DIR/$(basename "$0").state"
touch "$state"
args=()
for a in "$@"; do [[ "$a" == -w ]] || args+=("$a"); done
set -- "\${args[@]}"
printf '%s\\n' "$*" >>"$FAKE_DIR/$(basename "$0").log"
[[ -n "\${FAKE_FAIL:-}" && "$*" == *"$FAKE_FAIL"* ]] && exit 1
[[ -n "\${FAKE_NO_V6:-}" && "$(basename "$0")" == ip6tables ]] && exit 3
chain="\${2:-}"
has() { grep -qxF "chain $1" "$state"; }
case "$1" in
  -N) has "$chain" && exit 1; echo "chain $chain" >>"$state" ;;
  -X) grep -vxF "chain $chain" "$state" >"$state.tmp"; mv "$state.tmp" "$state" ;;
  -F) grep -v "^rule $chain " "$state" >"$state.tmp"; mv "$state.tmp" "$state" ;;
  -A) has "$chain" || exit 1; shift 2; echo "rule $chain $*" >>"$state" ;;
  -I) has "$chain" || exit 1; shift 3; echo "rule $chain $*" >>"$state" ;;
  -C) shift 2; grep -qxF "rule $chain $*" "$state" ;;
  -D) shift 2; line="rule $chain $*"; grep -qxF "$line" "$state" || exit 1
      awk -v l="$line" '!done && $0 == l { done = 1; next } { print }' "$state" >"$state.tmp"; mv "$state.tmp" "$state" ;;
  -S) has "$chain" || exit 1; grep "^rule $chain " "$state" | sed 's/^rule /-A /' ;;
  -L) has "$chain" || exit 1
      printf 'Chain %s\\n pkts bytes target\\n' "$chain"
      grep "^rule $chain " "$state" | grep -o 'mh-ddos:[a-z-]*' | while read -r tag; do
        printf '%s 0 DROP all -- * * 0.0.0.0/0 0.0.0.0/0 /* %s */\\n' "\${FAKE_PKTS:-0}" "$tag"
      done ;;
esac
`;
const FAKE_SYSCTL = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$FAKE_DIR/sysctl.log"
[[ "$1" == -n ]] && { echo 65536; exit 0; }
[[ -z "\${FAKE_SYSCTL_FAIL:-}" ]]
`;

const FAKE_SYSTEMCTL = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$FAKE_DIR/systemctl.log"
`;

describe('scripts/ddos-guard.sh with a fake iptables', () => {
  let root: string;
  let env: NodeJS.ProcessEnv;
  const data = () => path.join(root, 'data');
  const guard = async (command: string, extra: NodeJS.ProcessEnv = {}) => {
    try {
      const { stdout } = await run('bash', [SCRIPT, command], { env: { ...env, ...extra } });
      return { code: 0, stdout };
    } catch (err) {
      const failed = err as { code: number; stdout: string };
      return { code: failed.code, stdout: failed.stdout };
    }
  };
  const state = (fam = 'iptables') => fs.readFileSync(path.join(root, `${fam}.state`), 'utf8');
  const log = (fam = 'iptables') => fs.readFileSync(path.join(root, `${fam}.log`), 'utf8');
  const hostStatusFile = () =>
    JSON.parse(fs.readFileSync(path.join(data(), 'status.json'), 'utf8')) as DdosHostStatus;
  const wish = (enabled: boolean) =>
    fs.writeFileSync(
      path.join(data(), 'wish.json'),
      JSON.stringify({ enabled, at: new Date().toISOString() }),
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-ddos-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.mkdirSync(data());
    ['iptables', 'ip6tables'].forEach((name) => {
      fs.writeFileSync(path.join(bin, name), FAKE_IPTABLES, { mode: 0o755 });
      fs.writeFileSync(path.join(root, `${name}.state`), 'chain INPUT\nchain DOCKER-USER\n');
    });
    fs.writeFileSync(path.join(bin, 'sysctl'), FAKE_SYSCTL, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'systemctl'), FAKE_SYSTEMCTL, { mode: 0o755 });
    env = {
      PATH: `${bin}:/usr/bin:/bin`,
      FAKE_DIR: root,
      MH_DDOS_TEST: '1',
      MH_DDOS_DIR: data(),
      MH_DDOS_CONF: path.join(root, 'ddos.conf'),
      MH_DDOS_SYSCTL_FILE: path.join(root, 'sysctl.d', 'ddos.conf'),
      MH_DDOS_LOCK: path.join(root, 'lock'),
      MH_DDOS_UNIT_DIR: path.join(root, 'units'),
    };
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('sync follows the wish: chain in DOCKER-USER and INPUT for IPv4 and IPv6, limits per address', async () => {
    fs.writeFileSync(path.join(data(), 'ports.txt'), 'tcp 25565\nudp 19132\nudp 24454\ntcp 99999\nfoo bar\n');
    wish(true);
    expect((await guard('sync')).code).toBe(0);

    const v4 = state();
    expect(v4).toContain('rule DOCKER-USER -j MH-DDOS');
    expect(v4).toContain('rule INPUT -j MH-DDOS');
    expect(v4).toContain('rule MH-DDOS -s 192.168.0.0/16 -j RETURN');
    expect(v4).toContain('rule MH-DDOS -i wt0 -j RETURN');
    expect(v4).toContain('--ctorigdstport 25565 -m connlimit --connlimit-above 64 --connlimit-mask 32');
    expect(v4).toContain('--hashlimit-above 120/minute --hashlimit-burst 60');
    expect(v4).toContain('--ctorigdstport 19132 -m hashlimit');
    expect(v4).toContain('--hashlimit-above 4000/second --hashlimit-burst 8000');
    expect(v4).toContain('--ctorigdstport 8080 ');
    expect(v4).not.toContain('99999');
    expect(state('ip6tables')).toContain('--connlimit-mask 64');
    expect(state('ip6tables')).toContain('rule MH-DDOS -s fc00::/7 -j RETURN');
    expect(fs.readFileSync(path.join(root, 'sysctl.d', 'ddos.conf'), 'utf8')).toContain(
      'net.ipv4.tcp_syncookies=1',
    );

    expect(hostStatusFile()).toMatchObject({
      active: true,
      ipv4: true,
      ipv6: true,
      docker: true,
      sysctl: true,
      tcpPorts: ['25565', '443', '80', '8080'],
      udpPorts: ['19132', '24454'],
      error: null,
    });
  });

  test('a second run keeps the rules and their counters; status counts dropped packets', async () => {
    wish(true);
    await guard('sync');
    const builds = log()
      .split('\n')
      .filter((l) => l.startsWith('-N ') || l.startsWith('-F ')).length;
    await guard('sync', { FAKE_PKTS: '7' });
    expect(
      log()
        .split('\n')
        .filter((l) => l.startsWith('-N ') || l.startsWith('-F ')).length,
    ).toBe(builds);
    expect(state().match(/rule INPUT -j MH-DDOS/g)).toHaveLength(1);
    // Two families × one rule each: "invalid".
    expect(hostStatusFile().dropped.invalid).toBe(14);
    // Default ports without a list from the panel: 25565:25600 and the panel's ports.
    expect(hostStatusFile().tcpPorts).toEqual(['25565:25600', '443', '80', '8080']);
  });

  test('disable removes chain, hooks and the sysctl file and remembers the wish', async () => {
    wish(true);
    await guard('sync');
    expect((await guard('disable')).code).toBe(0);
    expect(state()).toBe('chain INPUT\nchain DOCKER-USER\n');
    expect(state('ip6tables')).toBe('chain INPUT\nchain DOCKER-USER\n');
    expect(fs.existsSync(path.join(root, 'sysctl.d', 'ddos.conf'))).toBe(false);
    expect(hostStatusFile()).toMatchObject({ active: false });
    expect(JSON.parse(fs.readFileSync(path.join(data(), 'wish.json'), 'utf8'))).toMatchObject({
      enabled: false,
      by: 'console',
    });
    // Nothing left to do: a sync while off changes nothing.
    await guard('sync');
    expect(state()).toBe('chain INPUT\nchain DOCKER-USER\n');
  });

  test('a missing kernel module leaves no half rules behind and is reported', async () => {
    wish(true);
    const result = await guard('sync', { FAKE_FAIL: 'hashlimit' });
    expect(result.code).not.toBe(0);
    expect(state()).toBe('chain INPUT\nchain DOCKER-USER\n');
    expect(hostStatusFile()).toMatchObject({ active: false, error: 'rules_failed' });
  });

  test('without IPv6 and before Docker started it still protects what is there', async () => {
    fs.writeFileSync(path.join(root, 'iptables.state'), 'chain INPUT\n');
    wish(true);
    await guard('sync', { FAKE_NO_V6: '1', FAKE_SYSCTL_FAIL: '1' });
    expect(hostStatusFile()).toMatchObject({ active: true, ipv6: false, docker: false, sysctl: false });

    // Docker came up: the next run (timer) hooks into DOCKER-USER without rebuilding.
    fs.appendFileSync(path.join(root, 'iptables.state'), 'chain DOCKER-USER\n');
    await guard('sync', { FAKE_NO_V6: '1' });
    expect(state()).toContain('rule DOCKER-USER -j MH-DDOS');
  });

  test('files the panel controls cannot make root write elsewhere', async () => {
    const target = path.join(root, 'precious.txt');
    fs.writeFileSync(target, 'untouched');
    fs.symlinkSync(target, path.join(data(), 'status.json'));
    await guard('status');
    expect(fs.readFileSync(target, 'utf8')).toBe('untouched');
    expect(fs.lstatSync(path.join(data(), 'status.json')).isSymbolicLink()).toBe(false);

    // A wish behind a link is ignored.
    const elsewhere = path.join(root, 'elsewhere.json');
    fs.writeFileSync(elsewhere, '{"enabled":true}');
    fs.symlinkSync(elsewhere, path.join(data(), 'wish.json'));
    await guard('sync');
    expect(state()).not.toContain('MH-DDOS');
  });

  test('own limits from the config file; a config others may write is ignored', async () => {
    fs.writeFileSync(env['MH_DDOS_CONF'] ?? '', 'UDP_PACKETS_PER_SECOND=9000\n', { mode: 0o644 });
    wish(true);
    await guard('sync');
    expect(hostStatusFile().limits.udpPacketsPerSecond).toBe(9000);

    fs.chmodSync(env['MH_DDOS_CONF'] ?? '', 0o666);
    await guard('sync');
    expect(hostStatusFile().limits.udpPacketsPerSecond).toBe(4000);

    fs.writeFileSync(env['MH_DDOS_CONF'] ?? '', 'UDP_BURST=abc\n');
    fs.chmodSync(env['MH_DDOS_CONF'] ?? '', 0o644);
    expect((await guard('sync')).code).not.toBe(0);
  });

  test('install writes the systemd units that watch the wish and check every minute', async () => {
    expect((await guard('install')).code).toBe(0);
    const pathUnit = fs.readFileSync(path.join(root, 'units', 'mornihosting-ddos.path'), 'utf8');
    expect(pathUnit).toContain(`PathChanged=${data()}/wish.json`);
    expect(pathUnit).toContain(`PathChanged=${data()}/ports.txt`);
    expect(fs.readFileSync(path.join(root, 'units', 'mornihosting-ddos.service'), 'utf8')).toContain(
      `ExecStart=${SCRIPT} sync`,
    );
    expect(fs.readFileSync(path.join(root, 'units', 'mornihosting-ddos.timer'), 'utf8')).toContain(
      'OnUnitActiveSec=1min',
    );
    expect(fs.existsSync(path.join(data(), 'agent.json'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'systemctl.log'), 'utf8')).toContain(
      'enable --now mornihosting-ddos.path mornihosting-ddos.timer',
    );
    expect(fs.readFileSync(env['MH_DDOS_CONF'] ?? '', 'utf8')).toContain('#UDP_PACKETS_PER_SECOND=4000');
  });
});
