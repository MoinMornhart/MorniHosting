import dns from 'node:dns/promises';
import net from 'node:net';
import { badRequest } from './errors.js';

/**
 * Keeps outgoing requests to user-supplied URLs (webhooks) away from the local network:
 * loopback, private ranges, link-local (cloud metadata), CGNAT, multicast and their IPv6 cousins.
 */

/* eslint-disable ts-patterns/no-magic-numbers -- network prefixes and their lengths */
const BLOCKED_V4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const BLOCKED_V6: readonly (readonly [string, number])[] = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
];
/** Home networks (routers hand these out); not CGNAT or VPNs such as NetBird (100.64.0.0/10). */
const HOME_V4: readonly (readonly [string, number])[] = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
];
const HOME_V6: readonly (readonly [string, number])[] = [
  ['fc00::', 7],
  ['fe80::', 10],
];
/* eslint-enable ts-patterns/no-magic-numbers */

const blockList = new net.BlockList();
BLOCKED_V4.forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv4'));
BLOCKED_V6.forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv6'));

const IPV4_MAPPED = '::ffff:';
// The brackets around an IPv6 literal in a URL host: in "[::1]" it matches "[" and "]".
// https://regex101.com/?regex=%5E%5C%5B%7C%5C%5D%24&flags=g&testString=%5B%3A%3A1%5D
const BRACKETS = /^\[|\]$/g;

export function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith(IPV4_MAPPED) && net.isIPv4(lower.slice(IPV4_MAPPED.length))) {
    return blockList.check(lower.slice(IPV4_MAPPED.length), 'ipv4');
  }
  if (!net.isIP(lower)) return true;
  return blockList.check(lower, net.isIPv4(lower) ? 'ipv4' : 'ipv6');
}

const homeList = new net.BlockList();
HOME_V4.forEach(([address, prefix]) => homeList.addSubnet(address, prefix, 'ipv4'));
HOME_V6.forEach(([address, prefix]) => homeList.addSubnet(address, prefix, 'ipv6'));

/** True for a visitor from the same home network, e.g. "192.168.178.20" or "::ffff:10.0.0.5". */
export function isHomeNetworkAddress(address: string): boolean {
  const lower = address.toLowerCase();
  const v4 = lower.startsWith(IPV4_MAPPED) ? lower.slice(IPV4_MAPPED.length) : lower;
  if (net.isIPv4(v4)) return homeList.check(v4, 'ipv4');
  return net.isIPv6(lower) && homeList.check(lower, 'ipv6');
}

export type Resolver = (hostname: string) => Promise<readonly string[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await dns.lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** Throws unless every address the host name resolves to is public. */
export async function assertPublicHost(hostname: string, resolve: Resolver = systemResolver): Promise<void> {
  const bare = hostname.replace(BRACKETS, '');
  const addresses = await (async () => {
    if (net.isIP(bare)) return [bare];
    try {
      return await resolve(bare);
    } catch {
      throw badRequest('webhook_unresolvable', { host: bare });
    }
  })();
  if (!addresses.length || addresses.some(isPrivateAddress))
    throw badRequest('webhook_private_address', { host: bare });
}
