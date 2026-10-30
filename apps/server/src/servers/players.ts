import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { gameOf, type PlayerAction, type PlayerEntry, type PlayersResponse } from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import { conflict, notFound } from '../lib/errors.js';
import { fetchJson } from '../lib/http-client.js';
import { readPropertiesFile } from './properties-file.js';
import type { ServerService } from './service.js';
import { assertMinecraft } from './spec.js';

/** Operators, whitelist and bans: by console command while running, by editing the JSON files while stopped. */

export const OP_LEVEL = 4;
const JSON_INDENT = 2;
const listSchema = z.array(
  z.object({ name: z.string(), uuid: z.string().optional(), reason: z.string().optional() }).loose(),
);
const permissionsSchema = z.array(z.object({ permission: z.string(), xuid: z.string() }).loose());
const mojangSchema = z.object({ id: z.string(), name: z.string() });

export function readList(file: string): z.infer<typeof listSchema> {
  try {
    return listSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return [];
  }
}

export function writeList(file: string, list: readonly unknown[]): void {
  fs.writeFileSync(file, `${JSON.stringify(list, null, JSON_INDENT)}\n`);
}

function toEntry(e: { name: string; uuid?: string }): PlayerEntry {
  return { name: e.name, uuid: e.uuid ?? null };
}

// The five groups of an undashed 32-character uuid: "069a79f444e94726a5befca90e38aaf5" matches, "069a79f4-44e9-…" does not.
// https://regex101.com/?regex=%5E(.%7B8%7D)(.%7B4%7D)(.%7B4%7D)(.%7B4%7D)(.%7B12%7D)%24&testString=069a79f444e94726a5befca90e38aaf5
const UUID_PARTS = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;

/** A Java account as Mojang knows it: the name in its real spelling and the uuid in dashed form. */
export async function lookupProfile(name: string): Promise<{ name: string; uuid: string }> {
  try {
    const data = mojangSchema.parse(
      await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`),
    );
    return { name: data.name, uuid: data.id.replace(UUID_PARTS, '$1-$2-$3-$4-$5') };
  } catch {
    throw notFound('player_unknown');
  }
}

/** Mojang uuid in dashed form, e.g. for ops.json while the server is off. */
async function lookupUuid(name: string): Promise<string> {
  return (await lookupProfile(name)).uuid;
}

const JAVA_COMMANDS: Readonly<Record<PlayerAction, (name: string, reason: string) => string>> = {
  op: (n) => `op ${n}`,
  deop: (n) => `deop ${n}`,
  kick: (n, r) => `kick ${n}${r ? ` ${r}` : ''}`,
  ban: (n, r) => `ban ${n}${r ? ` ${r}` : ''}`,
  pardon: (n) => `pardon ${n}`,
  'whitelist-add': (n) => `whitelist add ${n}`,
  'whitelist-remove': (n) => `whitelist remove ${n}`,
};

const BEDROCK_COMMANDS: Readonly<Record<PlayerAction, ((name: string, reason: string) => string) | null>> = {
  op: (n) => `op "${n}"`,
  deop: (n) => `deop "${n}"`,
  kick: (n, r) => `kick "${n}"${r ? ` ${r}` : ''}`,
  ban: null,
  pardon: null,
  'whitelist-add': (n) => `allowlist add "${n}"`,
  'whitelist-remove': (n) => `allowlist remove "${n}"`,
};

export interface PlayerService {
  readonly overview: (serverId: string) => PlayersResponse;
  readonly act: (
    serverId: string,
    action: PlayerAction,
    name: string,
    reason: string,
    actor: Actor,
  ) => Promise<void>;
}

export function createPlayerService(
  servers: ServerService,
  audit: {
    record: (a: Actor, action: string, serverId?: string | null, details?: Record<string, unknown>) => void;
  },
): PlayerService {
  const files = (serverId: string) => {
    const dir = servers.dir(serverId);
    return {
      ops: path.join(dir, 'ops.json'),
      whitelist: path.join(dir, 'whitelist.json'),
      banned: path.join(dir, 'banned-players.json'),
      allowlist: path.join(dir, 'allowlist.json'),
      permissions: path.join(dir, 'permissions.json'),
    };
  };

  const offlineJava = async (
    serverId: string,
    action: PlayerAction,
    name: string,
    reason: string,
  ): Promise<void> => {
    const f = files(serverId);
    const without = (file: string) =>
      readList(file).filter((e) => e.name.toLowerCase() !== name.toLowerCase());
    const offline: Readonly<Record<PlayerAction, () => Promise<void>>> = {
      op: async () =>
        writeList(f.ops, [
          ...without(f.ops),
          { uuid: await lookupUuid(name), name, level: OP_LEVEL, bypassesPlayerLimit: false },
        ]),
      deop: async () => writeList(f.ops, without(f.ops)),
      'whitelist-add': async () =>
        writeList(f.whitelist, [...without(f.whitelist), { uuid: await lookupUuid(name), name }]),
      'whitelist-remove': async () => writeList(f.whitelist, without(f.whitelist)),
      ban: async () =>
        writeList(f.banned, [
          ...without(f.banned),
          {
            uuid: await lookupUuid(name),
            name,
            created: new Date().toISOString(),
            source: 'MorniHosting',
            expires: 'forever',
            reason: reason || 'Banned by an operator.',
          },
        ]),
      pardon: async () => writeList(f.banned, without(f.banned)),
      kick: async () => {
        throw conflict('server_not_running');
      },
    };
    await offline[action]();
  };

  const offlineBedrock = async (serverId: string, action: PlayerAction, name: string): Promise<void> => {
    const f = files(serverId);
    const without = readList(f.allowlist).filter((e) => e.name.toLowerCase() !== name.toLowerCase());
    if (action === 'whitelist-add') writeList(f.allowlist, [...without, { name, ignoresPlayerLimit: false }]);
    else if (action === 'whitelist-remove') writeList(f.allowlist, without);
    else throw conflict('server_not_running');
  };

  return {
    overview: (serverId) => {
      const row = servers.row(serverId);
      const f = files(serverId);
      const props = readPropertiesFile(servers.dir(serverId)).values;
      const online = servers.live(serverId).players.map((name) => ({ name, uuid: null }));
      // Other games only show who is online; their lists live in the game's own files.
      if (gameOf(row.software))
        return { online, ops: [], whitelist: [], banned: [], whitelistEnabled: false };
      if (row.edition === 'bedrock') {
        const operators = (() => {
          try {
            return permissionsSchema.parse(JSON.parse(fs.readFileSync(f.permissions, 'utf8')));
          } catch {
            return [];
          }
        })();
        return {
          online,
          ops: operators
            .filter((p) => p.permission === 'operator')
            .map((p) => ({ name: p.xuid, uuid: p.xuid })),
          whitelist: readList(f.allowlist).map(toEntry),
          banned: [],
          whitelistEnabled: props['allow-list'] === 'true',
        };
      }
      return {
        online,
        ops: readList(f.ops).map(toEntry),
        whitelist: readList(f.whitelist).map(toEntry),
        banned: readList(f.banned).map((e) => ({ ...toEntry(e), reason: e.reason ?? null })),
        whitelistEnabled: props['white-list'] === 'true',
      };
    },
    act: async (serverId, action, name, reason, actor) => {
      const row = servers.row(serverId);
      assertMinecraft(row);
      const bedrock = row.edition === 'bedrock';
      if (servers.isRunning(serverId)) {
        const command = (bedrock ? BEDROCK_COMMANDS : JAVA_COMMANDS)[action];
        if (!command) throw conflict('not_supported_on_bedrock');
        await servers.command(serverId, command(name, reason), null);
      } else if (bedrock) {
        await offlineBedrock(serverId, action, name);
      } else {
        await offlineJava(serverId, action, name, reason);
      }
      audit.record(actor, `player.${action}`, serverId, { player: name, reason: reason || undefined });
    },
  };
}
