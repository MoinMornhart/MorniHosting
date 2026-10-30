import { z } from 'zod';

/**
 * Own domain without NetBird: the panel writes the DNS records itself at the domain's DNS provider.
 * Every server named "survival" gets survival.<domain> pointing at the home connection's public IP
 * (kept up to date like DynDNS) and, for Java, an SRV record so players need no port.
 */

export const DNS_PROVIDERS = ['inwx', 'cloudflare', 'ionos'] as const;
export type DnsProvider = (typeof DNS_PROVIDERS)[number];

const TOKEN_MAX = 300;
const ID_MAX = 100;

const tokenSchema = z.string().trim().min(1).max(TOKEN_MAX);

/** Look up the domains (zones) a key can manage, before saving anything. */
export const dnsDiscoverSchema = z.object({
  provider: z.enum(DNS_PROVIDERS),
  /** Left out to use the stored key of the same provider. */
  token: tokenSchema.optional(),
});

export const dnsConfigSchema = z.object({
  provider: z.enum(DNS_PROVIDERS),
  token: tokenSchema.optional(),
  zoneId: z.string().trim().min(1).max(ID_MAX),
});
export type DnsConfigInput = z.infer<typeof dnsConfigSchema>;

export interface DnsZoneOption {
  readonly id: string;
  readonly name: string;
}

/** HTTPS for the own domain: a Caddy helper on ports 80/443 in front of the panel. */
export interface HttpsStatus {
  readonly enabled: boolean;
  /** The domain the panel is (or would be) reached at, e.g. "mornihosting.de". */
  readonly domain: string | null;
  readonly running: boolean;
  readonly error: {
    readonly code: string;
    readonly params: Readonly<Record<string, string | number>>;
  } | null;
}

export const httpsSchema = z.object({ enabled: z.boolean() });

export interface DnsStatus {
  readonly configured: boolean;
  readonly provider: DnsProvider | null;
  /** The domain, e.g. "mein-minecraft.de". */
  readonly domain: string | null;
  /** The public IP the records point to; refreshed every few minutes. */
  readonly ip: string | null;
  readonly ipCheckedAt: string | null;
  /** The last problem while updating the records, if any. */
  readonly error: {
    readonly code: string;
    readonly params: Readonly<Record<string, string | number>>;
  } | null;
  /** NetBird is connected: only one of the two can hand out addresses. */
  readonly netbirdActive: boolean;
}
