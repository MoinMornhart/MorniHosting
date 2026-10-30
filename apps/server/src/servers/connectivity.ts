import { z } from 'zod';
import { SOFTWARE, gameOf, type ConnectionInfo, type ReachabilityResult } from '@mornihosting/shared';
import type { SettingsService } from '../settings/service.js';
import { createCache, fetchJson, fetchResponse } from '../lib/http-client.js';
import { MS_PER_MINUTE, nowIso } from '../lib/units.js';
import type { ServerRow } from './spec.js';

/** Data for the IP card: which address to share, and whether the server answers from the internet. */

const PUBLIC_IP_CACHE_MINUTES = 10;
const publicIpCache = createCache<string>(PUBLIC_IP_CACHE_MINUTES * MS_PER_MINUTE);
const reachability = new Map<string, ReachabilityResult>();
const statusSchema = z.object({ online: z.boolean() });

// A plain IPv4 address: matches "203.0.113.42"; rejects "203.0.113" and "a.b.c.d".
// https://regex101.com/?flavor=javascript&regex=%5E(%5Cd%7B1%2C3%7D%5C.)%7B3%7D%5Cd%7B1%2C3%7D%24&flags=gm&testString=203.0.113.42%0A203.0.113%0Aa.b.c.d
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

async function askPublicIp(): Promise<string> {
  const response = await fetchResponse('https://api.ipify.org', { headers: { accept: 'text/plain' } });
  const text = (await response.text()).trim();
  if (!IPV4.test(text)) throw new Error('unexpected answer');
  return text;
}

async function publicIp(settings: SettingsService): Promise<string | null> {
  if (!settings.get().publicIpLookup) return null;
  try {
    return await publicIpCache.wrap('ip', askPublicIp);
  } catch {
    return null;
  }
}

/** Asks again right now (DynDNS: the home connection may have a new IP); null when unknown. */
export async function freshPublicIp(): Promise<string | null> {
  try {
    const ip = await askPublicIp();
    publicIpCache.set('ip', ip);
    return ip;
  } catch {
    return null;
  }
}

export async function connectionInfo(row: ServerRow, settings: SettingsService): Promise<ConnectionInfo> {
  const s = settings.get();
  return {
    domain: row.domain || s.publicAddress || null,
    publicIp: await publicIp(settings),
    lanIp: s.lanIp || null,
    port: row.port,
    sharePort: (row.domain || s.publicAddress) && row.publicPort ? row.publicPort : row.port,
    protocol: SOFTWARE[row.software].protocol,
    reachable: reachability.get(row.id) ?? null,
  };
}

/**
 * Asks mcsrvstat.us, which pings the server from the internet, whether it answers.
 * That is the only reliable way to test a port forwarding from inside the home network.
 */
export async function checkReachability(
  row: ServerRow,
  settings: SettingsService,
): Promise<ReachabilityResult> {
  const info = await connectionInfo(row, settings);
  const host = info.domain ?? info.publicIp;
  if (!host || !settings.get().reachabilityCheck) {
    const result: ReachabilityResult = { status: 'unknown', checkedAt: nowIso(), target: host ?? '' };
    reachability.set(row.id, result);
    return result;
  }
  // Through the domain friends use the tunnel's port; through the bare public IP the server port.
  const target = `${host}:${info.domain ? info.sharePort : row.port}`;
  // mcsrvstat.us only speaks Minecraft; other games stay "unknown".
  if (gameOf(row.software)) {
    const result: ReachabilityResult = { status: 'unknown', checkedAt: nowIso(), target };
    reachability.set(row.id, result);
    return result;
  }
  const base =
    row.edition === 'bedrock' ? 'https://api.mcsrvstat.us/bedrock/3/' : 'https://api.mcsrvstat.us/3/';
  try {
    const data = statusSchema.parse(await fetchJson(base + encodeURIComponent(target)));
    const result: ReachabilityResult = {
      status: data.online ? 'reachable' : 'unreachable',
      checkedAt: nowIso(),
      target,
    };
    reachability.set(row.id, result);
    return result;
  } catch {
    const result: ReachabilityResult = { status: 'unknown', checkedAt: nowIso(), target };
    reachability.set(row.id, result);
    return result;
  }
}
