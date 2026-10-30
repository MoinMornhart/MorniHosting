import { z } from 'zod';
import {
  GAME_IDS,
  GAMES,
  compareMcVersions,
  type GameId,
  type SoftwareId,
  type VersionOption,
} from '@mornihosting/shared';
import { createCache, fetchJson, upstreamToAppError } from '../lib/http-client.js';
import { MS_PER_HOUR } from '../lib/units.js';

/** Live version lists for the create wizard, straight from each project's own API. */

const CACHE_HOURS = 1;
const cache = createCache<VersionOption[]>(CACHE_HOURS * MS_PER_HOUR);
const FIRST_YEAR_VERSION = 26;

const mojangSchema = z.object({ versions: z.array(z.object({ id: z.string(), type: z.string() })) });
const fillSchema = z.object({ versions: z.record(z.string(), z.array(z.string())) });
const purpurSchema = z.object({ versions: z.array(z.string()) });
const fabricSchema = z.array(z.object({ version: z.string(), stable: z.boolean() }));
const forgeSchema = z.object({ promos: z.record(z.string(), z.string()) });
const neoforgeSchema = z.object({ versions: z.array(z.string()) });

// Pre-releases and snapshots carry a letter: "1.21.11-rc3", "26.3-pre1" and "3.5.0-SNAPSHOT" match; "1.21.4" does not.
// https://regex101.com/?flavor=javascript&regex=-(%3F%3Arc%7Cpre%7Csnapshot%7Cbeta%7Calpha)&flags=gim&testString=1.21.11-rc3%0A26.3-pre1%0A3.5.0-SNAPSHOT%0A1.21.4
const UNSTABLE = /-(?:rc|pre|snapshot|beta|alpha)/i;
// Forge promo keys: captures the Minecraft version. "1.20.1-recommended" → "1.20.1"; "1.7.10_pre4-latest" → "1.7.10_pre4".
// https://regex101.com/?flavor=javascript&regex=%5E(.%2B)-(%3F%3Alatest%7Crecommended)%24&flags=gm&testString=1.20.1-recommended%0A1.7.10_pre4-latest%0Aother
const FORGE_PROMO = /^(.+)-(?:latest|recommended)$/;

function sortDesc(list: readonly VersionOption[]): VersionOption[] {
  return [...list].sort((a, b) => compareMcVersions(b.id, a.id));
}

function unique(list: readonly VersionOption[]): VersionOption[] {
  return list.filter((v, i, all) => all.findIndex((o) => o.id === v.id) === i);
}

/** NeoForge numbers its builds after the game: 21.1.77 is for 1.21.1, 21.0.x for 1.21, 26.3.0.99 for 26.3. */
export function minecraftVersionForNeoForge(neo: string): string | null {
  const [major, minor, patch] = neo.split('-')[0]?.split('.').map(Number) ?? [];
  if (major === undefined || minor === undefined || Number.isNaN(major)) return null;
  if (major >= FIRST_YEAR_VERSION) return patch ? `${major}.${minor}.${patch}` : `${major}.${minor}`;
  return minor ? `1.${major}.${minor}` : `1.${major}`;
}

const LOADERS: Readonly<Record<SoftwareId, () => Promise<VersionOption[]>>> = {
  ...gameLoaders(),
  vanilla: async () => {
    const data = mojangSchema.parse(
      await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'),
    );
    return data.versions
      .filter((v) => v.type === 'release' || v.type === 'snapshot')
      .map((v) => ({ id: v.id, stable: v.type === 'release' }));
  },
  paper: async () => fillVersions('paper'),
  velocity: async () => fillVersions('velocity'),
  purpur: async () => {
    const data = purpurSchema.parse(await fetchJson('https://api.purpurmc.org/v2/purpur'));
    return sortDesc(data.versions.map((id) => ({ id, stable: !UNSTABLE.test(id) })));
  },
  fabric: async () => {
    const data = fabricSchema.parse(await fetchJson('https://meta.fabricmc.net/v2/versions/game'));
    return data.map((v) => ({ id: v.version, stable: v.stable }));
  },
  forge: async () => {
    const data = forgeSchema.parse(
      await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'),
    );
    const ids = Object.keys(data.promos)
      .map((key) => key.match(FORGE_PROMO)?.[1])
      .filter((id): id is string => Boolean(id));
    return sortDesc(unique(ids.map((id) => ({ id, stable: !id.includes('_pre') }))));
  },
  neoforge: async () => {
    const data = neoforgeSchema.parse(
      await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'),
    );
    const ids = data.versions
      .filter((v) => !UNSTABLE.test(v))
      .map(minecraftVersionForNeoForge)
      .filter((id): id is string => Boolean(id));
    return sortDesc(unique(ids.map((id) => ({ id, stable: true }))));
  },
  bedrock: async () => [
    { id: 'LATEST', stable: true },
    { id: 'PREVIEW', stable: false },
  ],
  custom: async () => [],
};

/** Other games pick an image tag (e.g. "stable", "latest"), listed in the catalog. */
function gameLoaders(): Record<GameId, () => Promise<VersionOption[]>> {
  return Object.fromEntries(GAME_IDS.map((id) => [id, async () => [...GAMES[id].versions]])) as Record<
    GameId,
    () => Promise<VersionOption[]>
  >;
}

async function fillVersions(project: 'paper' | 'velocity'): Promise<VersionOption[]> {
  const data = fillSchema.parse(await fetchJson(`https://fill.papermc.io/v3/projects/${project}`));
  const ids = Object.values(data.versions).flat();
  return sortDesc(unique(ids.map((id) => ({ id, stable: !UNSTABLE.test(id) }))));
}

export async function versionsFor(software: SoftwareId): Promise<VersionOption[]> {
  try {
    return await cache.wrap(software, LOADERS[software]);
  } catch (err) {
    throw upstreamToAppError(err, 'versions_unavailable');
  }
}
