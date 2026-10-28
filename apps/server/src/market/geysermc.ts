import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { fetchJson } from '../lib/http-client.js';
import type { Provider } from './types.js';

/**
 * GeyserMC's official downloads (https://download.geysermc.org/v2/), used only for the Geyser one-click:
 * Floodgate for Paper and Velocity is published nowhere else (Hangar links here). Every file has a sha256.
 * Project ids look like "floodgate:spigot".
 */

const API = 'https://download.geysermc.org/v2/projects';
const PROJECTS: readonly string[] = ['geyser', 'floodgate'];
const PLATFORMS: readonly string[] = ['spigot', 'velocity'];
const NAMES: Readonly<Record<string, string>> = { geyser: 'Geyser', floodgate: 'Floodgate' };

const buildSchema = z.object({
  version: z.string(),
  build: z.number(),
  time: z.string(),
  downloads: z.record(z.string(), z.object({ name: z.string(), sha256: z.string() })),
});

function parseId(projectId: string): { project: string; platform: string } {
  const [project = '', platform = ''] = projectId.split(':');
  if (!PROJECTS.includes(project) || !PLATFORMS.includes(platform))
    throw notFound('market_no_compatible_version');
  return { project, platform };
}

async function latest(project: string): Promise<z.infer<typeof buildSchema>> {
  return buildSchema.parse(await fetchJson(`${API}/${project}/versions/latest/builds/latest`));
}

export const geysermc: Provider = {
  search: async () => ({ hits: [], total: 0 }),

  versions: async (_target, projectId) => {
    const { project } = parseId(projectId);
    const build = await latest(project);
    return [
      {
        id: `${build.version}-b${build.build}`,
        name: `${build.version}-b${build.build}`,
        gameVersions: [],
        publishedAt: build.time,
        channel: 'release',
        compatible: true,
      },
    ];
  },

  resolve: async (_target, projectId) => {
    const { project, platform } = parseId(projectId);
    const build = await latest(project);
    const file = build.downloads[platform];
    if (!file) throw notFound('market_no_compatible_version');
    const versionName = `${build.version}-b${build.build}`;
    return {
      projectId,
      projectName: NAMES[project] ?? project,
      iconUrl: null,
      versionId: versionName,
      versionName,
      file: {
        url: `${API}/${project}/versions/${build.version}/builds/${build.build}/downloads/${platform}`,
        fileName: file.name,
        hash: { algorithm: 'sha256', value: file.sha256 },
      },
      dependencies: [],
      manual: [],
    };
  },
};
