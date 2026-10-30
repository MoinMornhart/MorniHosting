import { z } from 'zod';

/* ---------- DDoS protection ---------- */

/**
 * Minecraft's own spam limit (server.properties "rate-limit"): packets a player may send per second
 * before being kicked. A normal client sends far fewer; 0 switches it off.
 */
export const DDOS_RATE_LIMIT_DEFAULT = 500;
export const DDOS_RATE_LIMIT_MIN = 50;
export const DDOS_RATE_LIMIT_MAX = 10_000;
/** The value that switches Minecraft's spam limit off. */
export const DDOS_RATE_LIMIT_OFF = 0;

export const ddosUpdateSchema = z.object({
  /** Firewall rules on the host computer, applied by scripts/ddos-guard.sh. */
  enabled: z.boolean().optional(),
  rateLimit: z
    .union([
      z.literal(DDOS_RATE_LIMIT_OFF),
      z.number().int().min(DDOS_RATE_LIMIT_MIN).max(DDOS_RATE_LIMIT_MAX),
    ])
    .optional(),
});
export type DdosUpdate = z.infer<typeof ddosUpdateSchema>;

/** What the host script reported in its last run (ddos/status.json). */
export interface DdosHostStatus {
  readonly active: boolean;
  readonly ipv4: boolean;
  readonly ipv6: boolean;
  /** Hooked into Docker's DOCKER-USER chain (Docker running). */
  readonly docker: boolean;
  /** SYN cookies and the bigger connection table could be set (not always possible in a Proxmox LXC). */
  readonly sysctl: boolean;
  readonly tcpPorts: readonly string[];
  readonly udpPorts: readonly string[];
  readonly limits: {
    readonly tcpNewPerMinute: number;
    readonly tcpBurst: number;
    readonly tcpConnections: number;
    readonly udpPacketsPerSecond: number;
    readonly udpBurst: number;
  };
  /** Packets thrown away since the rules were (re)built, by reason. */
  readonly dropped: {
    readonly tcpRate: number;
    readonly tcpConnections: number;
    readonly udpRate: number;
    readonly invalid: number;
  };
  readonly error: 'iptables_missing' | 'rules_failed' | null;
  readonly at: string;
}

/**
 * off/active: the host does what the panel wants. waiting: the host has not picked up the wish yet.
 * stuck: it has not answered for minutes. failed: the rules could not be set. no_host: the host part
 * (install.sh/update.sh) is missing, so the switch cannot do anything yet.
 */
export type DdosState = 'off' | 'active' | 'waiting' | 'stuck' | 'failed' | 'no_host';

export interface DdosStatus {
  readonly enabled: boolean;
  readonly state: DdosState;
  readonly hostInstalled: boolean;
  readonly host: DdosHostStatus | null;
  /** Minecraft's spam limit for Java servers; 0 = off, null = never set (server.properties untouched). */
  readonly rateLimit: number | null;
}
