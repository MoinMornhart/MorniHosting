import path from 'node:path';
import { PORT_RCON, SOFTWARE, javaTagFor, type SoftwareId } from '@mornihosting/shared';
import type { Config } from '../config.js';
import type { servers } from '../db/schema.js';
import type { CommandChannel, ContainerSpec } from '../docker/driver.js';
import { BYTES_PER_MB } from '../lib/units.js';

export type ServerRow = typeof servers.$inferSelect;

/** Linux user the itzg images run Minecraft as; the panel container uses the same id. */
const RUN_UID = '1000';
/** The JVM needs room beyond its heap (metaspace, threads, native buffers). */
const JAVA_OVERHEAD_FACTOR = 1.25;
const JAVA_OVERHEAD_MB = 512;

const ITZG_TYPE: Readonly<Record<SoftwareId, string>> = {
  vanilla: 'VANILLA',
  paper: 'PAPER',
  purpur: 'PURPUR',
  fabric: 'FABRIC',
  forge: 'FORGE',
  neoforge: 'NEOFORGE',
  velocity: 'VELOCITY',
  bedrock: 'BEDROCK',
  custom: 'CUSTOM',
};

function containerName(serverId: string): string {
  return `mh-${serverId}`;
}

export function serverDir(config: Config, serverId: string): string {
  return path.join(config.dataDir, 'servers', serverId);
}

export function imageFor(config: Config, row: Pick<ServerRow, 'software' | 'version' | 'javaTag'>): string {
  if (row.software === 'bedrock') return `${config.images.bedrock}:latest`;
  if (row.software === 'velocity') return `${config.images.proxy}:latest`;
  return `${config.images.java}:${row.javaTag ?? javaTagFor(row.software, row.version)}`;
}

function javaEnv(row: ServerRow, timezone: string): Record<string, string> {
  const base: Record<string, string> = {
    EULA: 'TRUE',
    TYPE: ITZG_TYPE[row.software],
    VERSION: row.version,
    MEMORY: `${row.memoryMb}M`,
    ENABLE_RCON: 'true',
    RCON_PASSWORD: row.rconPassword,
    RCON_PORT: String(PORT_RCON),
    CREATE_CONSOLE_IN_PIPE: 'true',
    ENABLE_AUTOPAUSE: 'false',
    TZ: timezone,
    UID: RUN_UID,
    GID: RUN_UID,
  };
  if (row.software === 'velocity') {
    return {
      TYPE: 'VELOCITY',
      VELOCITY_VERSION: row.version,
      MEMORY: `${row.memoryMb}M`,
      TZ: timezone,
      UID: RUN_UID,
      GID: RUN_UID,
    };
  }
  return base;
}

function bedrockEnv(row: ServerRow, timezone: string): Record<string, string> {
  return { EULA: 'TRUE', VERSION: row.version, TZ: timezone, UID: RUN_UID, GID: RUN_UID };
}

function memoryLimitBytes(row: Pick<ServerRow, 'software' | 'memoryMb'>): number {
  const mb =
    row.software === 'bedrock'
      ? row.memoryMb
      : Math.ceil(row.memoryMb * JAVA_OVERHEAD_FACTOR) + JAVA_OVERHEAD_MB;
  return mb * BYTES_PER_MB;
}

export function buildContainerSpec(config: Config, row: ServerRow, timezone: string): ContainerSpec {
  const info = SOFTWARE[row.software];
  const env = row.edition === 'bedrock' ? bedrockEnv(row, timezone) : javaEnv(row, timezone);
  return {
    name: containerName(row.id),
    image: row.image,
    env: { ...env, ...row.extraEnv },
    ports: [
      { containerPort: info.defaultPort, hostPort: row.port, protocol: info.protocol },
      ...row.extraPorts.map((p) => ({
        containerPort: p.containerPort ?? p.port,
        hostPort: p.port,
        protocol: p.protocol,
      })),
    ],
    memoryLimitBytes: memoryLimitBytes(row),
    dataDir: serverDir(config, row.id),
    labels: {
      'mornihosting.server': row.id,
      'mornihosting.edition': row.edition,
      'mornihosting.contentDir': info.contentDir ?? '',
    },
  };
}

export function commandChannelFor(row: ServerRow): CommandChannel {
  if (row.software === 'bedrock') return { kind: 'exec', argv: ['send-command'] };
  if (row.software === 'velocity') return { kind: 'stdin' };
  return { kind: 'rcon', host: containerName(row.id), port: PORT_RCON, password: row.rconPassword };
}

/** What players type into Minecraft: domain or IP, plus the port unless it is the default. */
export function displayAddress(host: string, port: number, defaultPort: number): string {
  return port === defaultPort ? host : `${host}:${port}`;
}
