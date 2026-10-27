import type { Edition } from './software.js';

export type PropertyType = 'string' | 'int' | 'bool' | 'enum' | 'motd';
export type PropertyGroup = 'general' | 'players' | 'world' | 'advanced';

export interface PropertyField {
  readonly key: string;
  readonly type: PropertyType;
  readonly group: PropertyGroup;
  readonly editions: readonly Edition[];
  readonly defaultValue: string;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  /** Changing this can lock players out or open the server to everyone. */
  readonly caution?: boolean;
}

/** Keys the panel sets itself (ports, RCON). The form shows them read-only. */
export const MANAGED_PROPERTY_KEYS: readonly string[] = [
  'server-port',
  'server-portv6',
  'enable-rcon',
  'rcon.port',
  'rcon.password',
  'query.port',
  'enable-query',
];

const JAVA: readonly Edition[] = ['java'];
const BEDROCK: readonly Edition[] = ['bedrock'];
const BOTH: readonly Edition[] = ['java', 'bedrock'];

/* eslint-disable ts-patterns/no-magic-numbers -- limits of Minecraft's own server.properties keys */
export const PROPERTY_FIELDS: readonly PropertyField[] = Object.freeze([
  { key: 'motd', type: 'motd', group: 'general', editions: JAVA, defaultValue: 'A Minecraft Server' },
  {
    key: 'server-name',
    type: 'string',
    group: 'general',
    editions: BEDROCK,
    defaultValue: 'Dedicated Server',
  },
  {
    key: 'gamemode',
    type: 'enum',
    group: 'general',
    editions: BOTH,
    defaultValue: 'survival',
    options: ['survival', 'creative', 'adventure', 'spectator'],
  },
  {
    key: 'difficulty',
    type: 'enum',
    group: 'general',
    editions: BOTH,
    defaultValue: 'easy',
    options: ['peaceful', 'easy', 'normal', 'hard'],
  },
  { key: 'hardcore', type: 'bool', group: 'general', editions: JAVA, defaultValue: 'false' },
  { key: 'pvp', type: 'bool', group: 'general', editions: JAVA, defaultValue: 'true' },
  { key: 'force-gamemode', type: 'bool', group: 'general', editions: BOTH, defaultValue: 'false' },
  { key: 'allow-cheats', type: 'bool', group: 'general', editions: BEDROCK, defaultValue: 'false' },

  {
    key: 'max-players',
    type: 'int',
    group: 'players',
    editions: BOTH,
    defaultValue: '20',
    min: 1,
    max: 1000,
  },
  { key: 'white-list', type: 'bool', group: 'players', editions: JAVA, defaultValue: 'false' },
  { key: 'enforce-whitelist', type: 'bool', group: 'players', editions: JAVA, defaultValue: 'false' },
  { key: 'allow-list', type: 'bool', group: 'players', editions: BEDROCK, defaultValue: 'false' },
  { key: 'online-mode', type: 'bool', group: 'players', editions: BOTH, defaultValue: 'true', caution: true },
  { key: 'allow-flight', type: 'bool', group: 'players', editions: JAVA, defaultValue: 'false' },
  {
    key: 'spawn-protection',
    type: 'int',
    group: 'players',
    editions: JAVA,
    defaultValue: '16',
    min: 0,
    max: 1000,
  },
  {
    key: 'player-idle-timeout',
    type: 'int',
    group: 'players',
    editions: BOTH,
    defaultValue: '0',
    min: 0,
    max: 1440,
  },
  {
    key: 'op-permission-level',
    type: 'int',
    group: 'players',
    editions: JAVA,
    defaultValue: '4',
    min: 1,
    max: 4,
  },
  {
    key: 'default-player-permission-level',
    type: 'enum',
    group: 'players',
    editions: BEDROCK,
    defaultValue: 'member',
    options: ['visitor', 'member', 'operator'],
  },
  { key: 'enforce-secure-profile', type: 'bool', group: 'players', editions: JAVA, defaultValue: 'true' },
  { key: 'hide-online-players', type: 'bool', group: 'players', editions: JAVA, defaultValue: 'false' },

  { key: 'level-name', type: 'string', group: 'world', editions: BOTH, defaultValue: 'world' },
  { key: 'level-seed', type: 'string', group: 'world', editions: BOTH, defaultValue: '' },
  {
    key: 'level-type',
    type: 'enum',
    group: 'world',
    editions: JAVA,
    defaultValue: 'minecraft:normal',
    options: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'],
  },
  {
    key: 'level-type',
    type: 'enum',
    group: 'world',
    editions: BEDROCK,
    defaultValue: 'DEFAULT',
    options: ['DEFAULT', 'FLAT', 'LEGACY'],
  },
  { key: 'generate-structures', type: 'bool', group: 'world', editions: JAVA, defaultValue: 'true' },
  { key: 'allow-nether', type: 'bool', group: 'world', editions: JAVA, defaultValue: 'true' },
  { key: 'spawn-monsters', type: 'bool', group: 'world', editions: JAVA, defaultValue: 'true' },
  { key: 'view-distance', type: 'int', group: 'world', editions: BOTH, defaultValue: '10', min: 2, max: 32 },
  {
    key: 'simulation-distance',
    type: 'int',
    group: 'world',
    editions: JAVA,
    defaultValue: '10',
    min: 2,
    max: 32,
  },
  {
    key: 'tick-distance',
    type: 'int',
    group: 'world',
    editions: BEDROCK,
    defaultValue: '4',
    min: 4,
    max: 12,
  },
  {
    key: 'max-world-size',
    type: 'int',
    group: 'world',
    editions: JAVA,
    defaultValue: '29999984',
    min: 1,
    max: 29999984,
  },

  { key: 'enable-command-block', type: 'bool', group: 'advanced', editions: JAVA, defaultValue: 'false' },
  { key: 'resource-pack', type: 'string', group: 'advanced', editions: JAVA, defaultValue: '' },
  { key: 'require-resource-pack', type: 'bool', group: 'advanced', editions: JAVA, defaultValue: 'false' },
  { key: 'texturepack-required', type: 'bool', group: 'advanced', editions: BEDROCK, defaultValue: 'false' },
  { key: 'enable-status', type: 'bool', group: 'advanced', editions: JAVA, defaultValue: 'true' },
  { key: 'sync-chunk-writes', type: 'bool', group: 'advanced', editions: JAVA, defaultValue: 'true' },
  {
    key: 'network-compression-threshold',
    type: 'int',
    group: 'advanced',
    editions: JAVA,
    defaultValue: '256',
    min: -1,
    max: 65535,
  },
  {
    key: 'max-tick-time',
    type: 'int',
    group: 'advanced',
    editions: JAVA,
    defaultValue: '60000',
    min: -1,
    max: 600000,
  },
  {
    key: 'entity-broadcast-range-percentage',
    type: 'int',
    group: 'advanced',
    editions: JAVA,
    defaultValue: '100',
    min: 10,
    max: 1000,
  },
] satisfies PropertyField[]);
/* eslint-enable ts-patterns/no-magic-numbers */

export function propertyFieldsFor(edition: Edition): PropertyField[] {
  return PROPERTY_FIELDS.filter((field) => field.editions.includes(edition));
}

export const PROPERTY_GROUPS: readonly PropertyGroup[] = ['general', 'players', 'world', 'advanced'];
