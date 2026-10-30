import { PORT_BEDROCK, type ContentSource, type SoftwareId } from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { AppContext } from '../context.js';
import { AppError, badRequest } from '../lib/errors.js';
import type { MarketService } from '../market/service.js';
import type { ServerService } from '../servers/service.js';

/**
 * Lets Bedrock players (phones, consoles, Windows) join a Java server: installs Geyser and Floodgate
 * and opens a UDP port. Inside the container Geyser always listens on 19132; the host port may differ.
 */

interface Plugin {
  readonly source: ContentSource;
  readonly id: string;
}

interface GeyserPlugins {
  readonly geyser: Plugin;
  readonly floodgate: Plugin;
}

/** Geyser from Modrinth everywhere; Floodgate for Paper and Velocity only exists at GeyserMC itself. */
const GEYSER: Plugin = { source: 'modrinth', id: 'wKkoqHrH' };
const PAPER: GeyserPlugins = { geyser: GEYSER, floodgate: { source: 'geysermc', id: 'floodgate:spigot' } };
const MODDED: GeyserPlugins = { geyser: GEYSER, floodgate: { source: 'modrinth', id: 'bWrNNfkb' } };
const PLUGINS: Partial<Readonly<Record<SoftwareId, GeyserPlugins>>> = {
  paper: PAPER,
  purpur: PAPER,
  custom: PAPER,
  velocity: { geyser: GEYSER, floodgate: { source: 'geysermc', id: 'floodgate:velocity' } },
  fabric: MODDED,
  neoforge: MODDED,
};
const PURPOSE = 'geyser';
// Geyser and Floodgate jars, also when switched off: "Geyser-Spigot.jar" and "floodgate-spigot.jar.disabled" match.
// https://regex101.com/?regex=geyser%7Cfloodgate&flags=i&testString=Geyser-Spigot.jar%0Afloodgate-spigot.jar.disabled%0AViaVersion.jar
const GEYSER_FILE = /geyser|floodgate/i;

export interface GeyserResult {
  readonly enabled: boolean;
  readonly port: number | null;
  readonly restartRequired: boolean;
}

export interface GeyserService {
  readonly set: (serverId: string, enabled: boolean, actor: Actor) => Promise<GeyserResult>;
}

export function createGeyserService(
  ctx: AppContext,
  servers: ServerService,
  market: MarketService,
): GeyserService {
  const pluginsFor = (serverId: string): GeyserPlugins => {
    const row = servers.row(serverId);
    if (row.edition !== 'java') throw badRequest('geyser_java_only');
    const plugins = PLUGINS[row.software];
    if (!plugins) throw badRequest('geyser_unsupported');
    return plugins;
  };

  const installOrEnable = async (serverId: string, plugin: Plugin, actor: Actor): Promise<void> => {
    try {
      await market.installFrom(serverId, plugin.source, plugin.id, actor);
    } catch (err) {
      // Already there (also from another marketplace) is fine: we only need it switched on.
      if (!(err instanceof AppError && err.code === 'content_already_installed')) throw err;
    }
  };

  const enable = async (serverId: string, actor: Actor): Promise<GeyserResult> => {
    const plugins = pluginsFor(serverId);
    market
      .list(serverId)
      .filter((e) => GEYSER_FILE.test(e.fileName) && !e.enabled)
      .forEach((e) => market.setEnabled(serverId, e.fileName, true, actor));
    await installOrEnable(serverId, plugins.geyser, actor);
    await installOrEnable(serverId, plugins.floodgate, actor);
    const row = servers.row(serverId);
    const existing = row.extraPorts.find((p) => p.purpose === PURPOSE);
    const port = existing?.port ?? servers.freePort(PORT_BEDROCK, 'udp', serverId);
    if (!existing) {
      servers.setExtraPorts(serverId, [
        ...row.extraPorts,
        { port, containerPort: PORT_BEDROCK, protocol: 'udp', purpose: PURPOSE },
      ]);
    }
    servers.setGeyser(serverId, true);
    ctx.audit.record(actor, 'geyser.enable', serverId, { port });
    return { enabled: true, port, restartRequired: servers.isRunning(serverId) };
  };

  const disable = (serverId: string, actor: Actor): GeyserResult => {
    market
      .list(serverId)
      .filter((e) => GEYSER_FILE.test(e.fileName) && e.enabled)
      .forEach((e) => market.setEnabled(serverId, e.fileName, false, actor));
    const row = servers.row(serverId);
    servers.setExtraPorts(
      serverId,
      row.extraPorts.filter((p) => p.purpose !== PURPOSE),
    );
    servers.setGeyser(serverId, false);
    ctx.audit.record(actor, 'geyser.disable', serverId);
    return { enabled: false, port: null, restartRequired: servers.isRunning(serverId) };
  };

  return {
    set: async (serverId, enabled, actor) => (enabled ? enable(serverId, actor) : disable(serverId, actor)),
  };
}
