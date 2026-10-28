import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  NETBIRD_DEFAULT_API,
  SOFTWARE,
  type NetbirdConfigInput,
  type NetbirdDiscovery,
  type NetbirdPurpose,
  type NetbirdServerInfo,
  type NetbirdStatus,
} from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { AppContext } from '../context.js';
import { netbirdServices, servers as serverTable } from '../db/schema.js';
import { AppError, badRequest, conflict } from '../lib/errors.js';
import { createKeyedLock } from '../lib/locks.js';
import { GEYSER_PURPOSE, VOICE_PURPOSE, type ServerService, type TunnelAddress } from '../servers/service.js';
import type { ServerRow } from '../servers/spec.js';
import { createNetbirdClient, type NetbirdClient, type NetbirdClientFactory } from './client.js';

/**
 * NetBird automation: with an API token, a domain and the machine MorniHosting runs on, the panel keeps
 * one reverse-proxy service per address in the admin's NetBird account. A server only needs a name;
 * "survival" becomes survival.<domain> (plus survival-bedrock and survival-voice when those are on).
 * NetBird Cloud assigns the outside ports; the panel stores them so every page shows the full address.
 */

const SETTINGS_KEY = 'netbird';
const PANEL_KEY = 'panel';
/** Machines whose name contains this are offered first: the Proxmox script calls its container so. */
const MACHINE_HINT = 'mornihosting';
const SUFFIX: Readonly<Record<NetbirdPurpose, string>> = {
  main: '',
  geyser: '-bedrock',
  voice: '-voice',
  panel: '',
};

interface StoredConfig {
  readonly apiUrl: string;
  /** Sealed with the panel secret. */
  readonly token: string;
  readonly domain: string;
  readonly peerId: string;
  readonly peerName: string;
}

interface Wanted {
  readonly purpose: NetbirdPurpose;
  readonly domain: string;
  readonly mode: 'http' | 'tcp' | 'udp';
  readonly port: number;
}

type Mapping = typeof netbirdServices.$inferSelect;

export interface NetbirdAutomation {
  readonly status: () => NetbirdStatus;
  readonly discover: (input: { apiUrl?: string; token?: string }) => Promise<NetbirdDiscovery>;
  readonly configure: (input: NetbirdConfigInput, actor: Actor) => Promise<NetbirdStatus>;
  readonly disconnect: (actor: Actor) => Promise<NetbirdStatus>;
  readonly setServerName: (
    serverId: string,
    name: string | null,
    actor: Actor,
  ) => Promise<NetbirdServerInfo | null>;
  readonly setupPanel: (input: { name: string; port: number }, actor: Actor) => Promise<NetbirdStatus>;
}

export function createNetbirdAutomation(
  ctx: AppContext,
  servers: ServerService,
  clientFactory: NetbirdClientFactory = createNetbirdClient,
): NetbirdAutomation {
  const lock = createKeyedLock();
  /** Last failed sync per server, as an error code for its pages. */
  const failures = new Map<string, NonNullable<NetbirdServerInfo['error']>>();

  const config = (): StoredConfig | null => ctx.settings.getValue<StoredConfig>(SETTINGS_KEY) ?? null;
  const clientFor = (cfg: StoredConfig): NetbirdClient =>
    clientFactory(cfg.apiUrl, ctx.secrets.decrypt(cfg.token));
  const requireConfig = (): StoredConfig => {
    const cfg = config();
    if (!cfg) throw badRequest('netbird_not_configured');
    return cfg;
  };

  const mappings = (serverId: string | null): Mapping[] =>
    ctx.db
      .select()
      .from(netbirdServices)
      .where(serverId === null ? isNull(netbirdServices.serverId) : eq(netbirdServices.serverId, serverId))
      .all();
  const serverRow = (serverId: string): ServerRow | undefined =>
    ctx.db.select().from(serverTable).where(eq(serverTable.id, serverId)).get();

  const wanted = (row: ServerRow, cfg: StoredConfig): Wanted[] => {
    if (!row.netbirdName) return [];
    const host = (purpose: NetbirdPurpose): string => `${row.netbirdName}${SUFFIX[purpose]}.${cfg.domain}`;
    const hostPort = (purpose: string): number | undefined =>
      row.extraPorts.find((p) => p.purpose === purpose)?.port;
    const geyserPort = row.geyser ? hostPort(GEYSER_PURPOSE) : undefined;
    const voicePort = row.voiceChat ? hostPort(VOICE_PURPOSE) : undefined;
    return [
      { purpose: 'main', domain: host('main'), mode: SOFTWARE[row.software].protocol, port: row.port },
      ...(geyserPort
        ? [{ purpose: 'geyser', domain: host('geyser'), mode: 'udp', port: geyserPort } as const]
        : []),
      ...(voicePort
        ? [{ purpose: 'voice', domain: host('voice'), mode: 'udp', port: voicePort } as const]
        : []),
    ];
  };

  const remember = (
    serverId: string | null,
    want: Wanted,
    id: string,
    listenPort: number | null,
  ): Mapping => {
    const values = {
      id,
      serverId,
      purpose: want.purpose,
      domain: want.domain,
      mode: want.mode,
      targetPort: want.port,
      listenPort,
    };
    ctx.db
      .insert(netbirdServices)
      .values(values)
      .onConflictDoUpdate({ target: netbirdServices.id, set: values })
      .run();
    return { ...values, createdAt: new Date().toISOString() };
  };
  const forget = (id: string): void => {
    ctx.db.delete(netbirdServices).where(eq(netbirdServices.id, id)).run();
  };

  /** Creates, changes or keeps one service so that it matches what the server needs. */
  const apply = async (
    client: NetbirdClient,
    cfg: StoredConfig,
    serverId: string | null,
    want: Wanted,
    existing: Mapping | undefined,
    force: boolean,
  ): Promise<Mapping> => {
    const request = {
      domain: want.domain,
      mode: want.mode,
      peerId: cfg.peerId,
      port: want.port,
      passHostHeader: want.mode === 'http',
    };
    const same = existing?.domain === want.domain && existing.targetPort === want.port;
    if (existing && existing.mode === want.mode && same && !force) return existing;
    if (existing && existing.mode === want.mode) {
      const updated = await client.updateService(existing.id, {
        ...request,
        listenPort: existing.listenPort,
      });
      return remember(serverId, want, existing.id, updated.listen_port ?? existing.listenPort);
    }
    if (existing) {
      await client.deleteService(existing.id);
      forget(existing.id);
    }
    const created = await client.createService(request);
    return remember(serverId, want, created.id, created.listen_port ?? null);
  };

  const addressOf = (done: readonly Mapping[]): TunnelAddress => {
    const port = (purpose: NetbirdPurpose): number | null =>
      done.find((m) => m.purpose === purpose)?.listenPort ?? null;
    const main = done.find((m) => m.purpose === 'main');
    return main
      ? {
          domain: main.domain,
          publicPort: main.listenPort,
          geyserPublicPort: port('geyser'),
          voicePublicPort: port('voice'),
        }
      : {};
  };

  /** Brings NetBird in line with one server; a deleted server loses all its services. */
  const syncNow = async (serverId: string, force = false): Promise<void> => {
    const cfg = config();
    const existing = mappings(serverId);
    if (!cfg) return;
    const row = serverRow(serverId);
    const wants = row ? wanted(row, cfg) : [];
    const client = clientFor(cfg);
    const stale = existing.filter((m) => !wants.some((w) => w.purpose === m.purpose));
    await Promise.all(
      stale.map(async (m) => {
        await client.deleteService(m.id);
        forget(m.id);
      }),
    );
    const done = await Promise.all(
      wants.map((w) =>
        apply(
          client,
          cfg,
          serverId,
          w,
          existing.find((m) => m.purpose === w.purpose),
          force,
        ),
      ),
    );
    if (row) servers.setTunnelAddress(serverId, addressOf(done));
    failures.delete(serverId);
  };

  const sync = async (serverId: string, force = false): Promise<void> => {
    try {
      await lock(serverId, () => syncNow(serverId, force));
    } catch (err) {
      failures.set(
        serverId,
        err instanceof AppError
          ? { code: err.code, params: err.params }
          : { code: 'netbird_failed', params: {} },
      );
      throw err;
    }
  };
  const syncQuietly = async (serverId: string, force = false): Promise<void> => {
    try {
      await sync(serverId, force);
    } catch (err) {
      ctx.log.warn({ err, serverId }, 'NetBird sync failed');
    }
  };

  const namedServers = (): ServerRow[] =>
    ctx.db
      .select()
      .from(serverTable)
      .all()
      .filter((r) => r.netbirdName !== null);

  const status = (): NetbirdStatus => {
    const cfg = config();
    return {
      configured: cfg !== null,
      apiUrl: cfg?.apiUrl ?? NETBIRD_DEFAULT_API,
      domain: cfg?.domain ?? null,
      peerId: cfg?.peerId ?? null,
      peerName: cfg?.peerName ?? null,
      panelAddress: mappings(null)[0]?.domain ?? null,
    };
  };

  /** The stored token only ever goes to the stored API address; a new address needs the token typed again. */
  const tokenFor = (input: { apiUrl?: string; token?: string }): string => {
    const cfg = config();
    const sameApi = !input.apiUrl || input.apiUrl === cfg?.apiUrl;
    const token = input.token ?? (cfg && sameApi ? ctx.secrets.decrypt(cfg.token) : null);
    if (!token) throw badRequest('netbird_token_missing');
    return token;
  };
  const clientFromInput = (input: { apiUrl?: string; token?: string }): NetbirdClient =>
    clientFactory(input.apiUrl ?? config()?.apiUrl ?? NETBIRD_DEFAULT_API, tokenFor(input));

  // A server gets its address before the answer to "create" goes out, later changes follow on their own.
  servers.onCreated((id) => (serverRow(id)?.netbirdName ? syncQuietly(id) : Promise.resolve()));
  servers.onPortsChanged((id) => {
    if (serverRow(id)?.netbirdName || mappings(id).length) void syncQuietly(id);
  });
  ctx.events.on('server.deleted', ({ serverId }) => {
    if (mappings(serverId).length) void syncQuietly(serverId);
  });
  const describe = (row: ServerRow): NetbirdServerInfo | null =>
    row.netbirdName
      ? {
          name: row.netbirdName,
          services: mappings(row.id).map((m) => ({
            purpose: m.purpose,
            domain: m.domain,
            port: m.listenPort,
          })),
          error: failures.get(row.id) ?? null,
        }
      : null;
  servers.describeNetbird(describe);

  return {
    status,
    discover: async (input) => {
      const client = clientFromInput(input);
      const [domains, peers] = await Promise.all([client.domains(), client.peers()]);
      const looksLikePanel = peers.find((p) =>
        `${p.name} ${p.hostname}`.toLowerCase().includes(MACHINE_HINT),
      );
      return {
        domains: domains.map((d) => ({
          domain: d.domain,
          validated: d.validated,
          custom: d.type === 'custom',
        })),
        peers: peers.map((p) => ({ id: p.id, name: p.name, ip: p.ip, connected: p.connected })),
        suggestedPeerId: looksLikePanel?.id ?? null,
      };
    },
    configure: async (input, actor) => {
      const client = clientFromInput(input);
      const token = tokenFor(input);
      const [domains, peers] = await Promise.all([client.domains(), client.peers()]);
      const domain = input.domain.toLowerCase();
      if (!domains.some((d) => d.domain.toLowerCase() === domain))
        throw badRequest('netbird_domain_unknown', { domain });
      const peer = peers.find((p) => p.id === input.peerId);
      if (!peer) throw badRequest('netbird_peer_unknown');
      const previous = config();
      ctx.settings.setValue(SETTINGS_KEY, {
        apiUrl: input.apiUrl,
        token: ctx.secrets.encrypt(token),
        domain,
        peerId: peer.id,
        peerName: peer.name,
      } satisfies StoredConfig);
      ctx.audit.record(actor, 'netbird.configure', null, { domain, machine: peer.name });
      const moved = previous?.domain !== domain || previous.peerId !== peer.id;
      await Promise.allSettled(namedServers().map((r) => syncQuietly(r.id, moved)));
      return status();
    },
    disconnect: async (actor) => {
      const cfg = config();
      const owned = ctx.db.select().from(netbirdServices).all();
      // The panel's own service stays in NetBird: removing it could lock the admin out of the panel.
      const serverServices = owned.filter((m) => m.serverId !== null);
      if (cfg) await Promise.allSettled(serverServices.map((m) => clientFor(cfg).deleteService(m.id)));
      ctx.db.delete(netbirdServices).run();
      namedServers().forEach((r) =>
        servers.setTunnelAddress(r.id, {
          netbirdName: null,
          domain: null,
          publicPort: null,
          geyserPublicPort: null,
          voicePublicPort: null,
        }),
      );
      failures.clear();
      ctx.settings.deleteValue(SETTINGS_KEY);
      ctx.audit.record(actor, 'netbird.disconnect');
      return status();
    },
    setServerName: async (serverId, name, actor) => {
      const row = servers.row(serverId);
      if (name !== null) requireConfig();
      const taken =
        name !== null &&
        ctx.db
          .select()
          .from(serverTable)
          .where(and(eq(serverTable.netbirdName, name), ne(serverTable.id, serverId)))
          .get();
      if (taken) throw conflict('netbird_name_taken', { name });
      const cleared: TunnelAddress = {
        domain: null,
        publicPort: null,
        geyserPublicPort: null,
        voicePublicPort: null,
      };
      servers.setTunnelAddress(serverId, {
        netbirdName: name,
        ...(name === null && row.netbirdName ? cleared : {}),
      });
      ctx.audit.record(actor, 'netbird.server', serverId, { name });
      await sync(serverId);
      return describe(servers.row(serverId));
    },
    setupPanel: async (input, actor) => {
      const cfg = requireConfig();
      const client = clientFor(cfg);
      const want: Wanted = {
        purpose: 'panel',
        domain: `${input.name}${SUFFIX.panel}.${cfg.domain}`,
        mode: 'http',
        port: input.port,
      };
      const request = {
        domain: want.domain,
        mode: want.mode,
        peerId: cfg.peerId,
        port: want.port,
        passHostHeader: true,
      };
      const ours = mappings(null)[0];
      // A service for this address made by hand in NetBird is taken over, with "Pass Host Header" on.
      const byHand = (await client.services()).find((s) => s.domain === want.domain);
      const done = await lock(PANEL_KEY, async () => {
        const result = byHand
          ? await client.updateService(byHand.id, request)
          : await client.createService(request);
        return remember(null, want, result.id, null);
      });
      if (ours && ours.id !== done.id) {
        await client.deleteService(ours.id);
        forget(ours.id);
      }
      ctx.settings.update({ panelDomain: want.domain });
      ctx.audit.record(actor, 'netbird.panel', null, { domain: want.domain });
      return status();
    },
  };
}
