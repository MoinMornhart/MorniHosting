import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { fetchResponse, UpstreamError } from '../lib/http-client.js';
import { HTTP_BAD_GATEWAY, HTTP_FORBIDDEN, HTTP_NOT_FOUND, HTTP_UNAUTHORIZED } from '../lib/http-status.js';

/**
 * The few calls of NetBird's management API the panel needs: domains and machines (peers) to choose from,
 * and reverse-proxy services to create, change and delete. Authenticated with a personal access token.
 * https://docs.netbird.io/api/resources/services
 */

const MESSAGE_MAX = 200;
const AUTH_FAILURES: readonly number[] = [HTTP_UNAUTHORIZED, HTTP_FORBIDDEN];
const UNKNOWN_TOKEN = 'invalid token';

const domainSchema = z.object({
  id: z.string(),
  domain: z.string(),
  validated: z.boolean().catch(false),
  type: z.enum(['free', 'custom']).catch('custom'),
  /** Self-hosted proxies can listen on ports the panel picks; NetBird Cloud assigns them itself. */
  supports_custom_ports: z.boolean().catch(false),
});
const peerSchema = z.object({
  id: z.string(),
  name: z.string(),
  ip: z.string().catch(''),
  connected: z.boolean().catch(false),
  hostname: z.string().catch(''),
});
const serviceSchema = z.object({
  id: z.string(),
  domain: z.string(),
  listen_port: z.number().int().nullable().optional(),
});
const errorSchema = z.object({ message: z.string() });

export type NetbirdDomain = z.infer<typeof domainSchema>;
export type NetbirdPeer = z.infer<typeof peerSchema>;
export type NetbirdService = z.infer<typeof serviceSchema>;

export interface NetbirdServiceRequest {
  readonly domain: string;
  readonly mode: 'http' | 'tcp' | 'udp';
  readonly peerId: string;
  /** Port on the peer that NetBird forwards to. */
  readonly port: number;
  /** Outside port to keep on an update; new L4 services get one assigned by NetBird. */
  readonly listenPort?: number | null;
  readonly passHostHeader?: boolean;
}

export interface NetbirdClient {
  readonly domains: () => Promise<NetbirdDomain[]>;
  readonly peers: () => Promise<NetbirdPeer[]>;
  readonly services: () => Promise<NetbirdService[]>;
  readonly createService: (request: NetbirdServiceRequest) => Promise<NetbirdService>;
  readonly updateService: (id: string, request: NetbirdServiceRequest) => Promise<NetbirdService>;
  /** Deleting a service that is already gone counts as done. */
  readonly deleteService: (id: string) => Promise<void>;
}

export type NetbirdClientFactory = (apiUrl: string, token: string) => NetbirdClient;

function serviceBody(request: NetbirdServiceRequest): Record<string, unknown> {
  const layer4 = request.mode !== 'http';
  return {
    name: request.domain,
    domain: request.domain,
    mode: request.mode,
    ...(layer4 ? { listen_port: request.listenPort ?? 0 } : {}),
    targets: [
      {
        target_id: request.peerId,
        target_type: 'peer',
        protocol: request.mode,
        port: request.port,
        enabled: true,
      },
    ],
    enabled: true,
    pass_host_header: request.passHostHeader ?? false,
  };
}

/**
 * NetBird's own words when it refuses something (e.g. "domain already in use"), kept short.
 * A well-formed key that this NetBird does not know comes back as 404 "invalid token: pat: … not found":
 * it was made on another NetBird server (self-hosted) or has been deleted.
 */
async function rejection(response: Response, host: string): Promise<AppError> {
  if (AUTH_FAILURES.includes(response.status)) return new AppError(HTTP_BAD_GATEWAY, 'netbird_unauthorized');
  const parsed = errorSchema.safeParse(await response.json().catch(() => null));
  const message = parsed.success ? parsed.data.message.slice(0, MESSAGE_MAX) : `HTTP ${response.status}`;
  if (response.status === HTTP_NOT_FOUND && message.toLowerCase().startsWith(UNKNOWN_TOKEN))
    return new AppError(HTTP_BAD_GATEWAY, 'netbird_token_unknown', { host });
  return new AppError(HTTP_BAD_GATEWAY, 'netbird_rejected', { message });
}

export const createNetbirdClient: NetbirdClientFactory = (apiUrl, token) => {
  const { origin, host } = new URL(apiUrl);
  const base = `${origin}/api`;
  const call = async (method: string, path: string, body?: unknown): Promise<Response> => {
    try {
      return await fetchResponse(`${base}${path}`, {
        method,
        headers: { authorization: `Token ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const host = err instanceof UpstreamError ? new URL(err.url).host : 'netbird';
      throw new AppError(HTTP_BAD_GATEWAY, 'netbird_unreachable', { host }, { cause: err });
    }
  };
  const json = async <TValue>(schema: z.ZodType<TValue>, method: string, path: string, body?: unknown) => {
    const response = await call(method, path, body);
    if (!response.ok) throw await rejection(response, host);
    return schema.parse(await response.json());
  };
  return {
    domains: () => json(z.array(domainSchema), 'GET', '/reverse-proxies/domains'),
    peers: () => json(z.array(peerSchema), 'GET', '/peers'),
    services: () => json(z.array(serviceSchema), 'GET', '/reverse-proxies/services'),
    createService: (request) =>
      json(serviceSchema, 'POST', '/reverse-proxies/services', serviceBody(request)),
    updateService: (id, request) =>
      json(serviceSchema, 'PUT', `/reverse-proxies/services/${encodeURIComponent(id)}`, serviceBody(request)),
    deleteService: async (id) => {
      const response = await call('DELETE', `/reverse-proxies/services/${encodeURIComponent(id)}`);
      if (!response.ok && response.status !== HTTP_NOT_FOUND) throw await rejection(response, host);
    },
  };
};
