import { z } from 'zod';
import type { MarketSort } from '@mornihosting/shared';
import { AppError } from '../lib/errors.js';
import { fetchJson } from '../lib/http-client.js';
import { HTTP_UNPROCESSABLE } from '../lib/http-status.js';
import { MS_PER_SECOND } from '../lib/units.js';
import { compatibility, PAGE_SIZE, type Provider, type Target } from './types.js';

/**
 * SpigotMC resources through Spiget (https://spiget.org/documentation/).
 * Only free resources hosted on SpigotMC itself can be downloaded; Spiget offers no hashes.
 */

const API = 'https://api.spiget.org/v2';
const FIELDS = 'id,name,tag,external,premium,file,testedVersions,downloads,updateDate,author,version';
const ICON_FOLDER_SIZE = 1000;
const NAME_LENGTH = 60;
// Anything that is not a letter, digit, dot, dash or underscore: in "Luck Perms [v5]" it matches " ", " [" and "]".
// https://regex101.com/?regex=%5B%5E%5Cw.-%5D%2B&flags=g&testString=Luck%20Perms%20%5Bv5%5D
const UNSAFE = /[^\w.-]+/g;

const resourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  tag: z.string().optional(),
  external: z.boolean().optional(),
  premium: z.boolean().optional(),
  file: z.object({ type: z.string().optional(), externalUrl: z.string().optional() }).optional(),
  testedVersions: z.array(z.string()).optional(),
  downloads: z.number().optional(),
  updateDate: z.number().optional(),
  author: z.object({ id: z.number() }).optional(),
  version: z.object({ id: z.number() }).optional(),
});
type Resource = z.infer<typeof resourceSchema>;

const versionSchema = z.object({ id: z.number(), name: z.string(), releaseDate: z.number() });

const SORT: Readonly<Record<MarketSort, string>> = {
  relevance: '-downloads',
  downloads: '-downloads',
  updated: '-updateDate',
};

/** "1.21" covers 1.21.4; SpigotMC lists only the versions the author tested. */
function tested(target: Target, versions: readonly string[] | undefined): boolean | null {
  if (!versions?.length) return null;
  return versions.some((v) => target.version === v || target.version.startsWith(`${v}.`)) ? true : null;
}

function downloadable(r: Resource): boolean {
  return !r.external && !r.premium && r.file?.type === '.jar';
}

function iconOf(id: number): string {
  return `https://www.spigotmc.org/data/resource_icons/${Math.floor(id / ICON_FOLDER_SIZE)}/${id}.jpg`;
}

function urlOf(id: number): string {
  return `https://www.spigotmc.org/resources/${id}/`;
}

function isoFromSeconds(seconds: number | undefined): string | null {
  return seconds ? new Date(seconds * MS_PER_SECOND).toISOString() : null;
}

export const spiget: Provider = {
  search: async (target, q) => {
    const params = new URLSearchParams({
      size: String(PAGE_SIZE),
      page: String(q.page + 1),
      sort: SORT[q.sort],
      fields: FIELDS,
    });
    const path = q.q ? `/search/resources/${encodeURIComponent(q.q)}` : '/resources/free';
    const data = z.array(resourceSchema).parse(await fetchJson(`${API}${path}?${params.toString()}`));
    const hits = data
      .filter((r) => !q.compatibleOnly || tested(target, r.testedVersions) !== false)
      .map((r) => ({
        source: 'spiget' as const,
        id: String(r.id),
        name: r.name,
        summary: r.tag ?? '',
        author: r.author ? `#${r.author.id}` : '',
        downloads: r.downloads ?? 0,
        iconUrl: iconOf(r.id),
        updatedAt: isoFromSeconds(r.updateDate),
        url: urlOf(r.id),
        compatible: compatibility(tested(target, r.testedVersions)),
        installable: downloadable(r),
      }));
    // Spiget does not report a total; assume another page exists while pages are full.
    return { hits, total: q.page * PAGE_SIZE + data.length + (data.length === PAGE_SIZE ? PAGE_SIZE : 0) };
  },

  versions: async (target, projectId) => {
    const resource = resourceSchema.parse(
      await fetchJson(`${API}/resources/${encodeURIComponent(projectId)}?fields=${FIELDS}`),
    );
    const latest = versionSchema.parse(await fetchJson(`${API}/resources/${resource.id}/versions/latest`));
    return [
      {
        id: String(latest.id),
        name: latest.name,
        gameVersions: resource.testedVersions ?? [],
        publishedAt: isoFromSeconds(latest.releaseDate),
        channel: 'release',
        compatible: tested(target, resource.testedVersions) !== false,
      },
    ];
  },

  resolve: async (_target, projectId) => {
    const resource = resourceSchema.parse(
      await fetchJson(`${API}/resources/${encodeURIComponent(projectId)}?fields=${FIELDS}`),
    );
    if (!downloadable(resource)) {
      throw new AppError(HTTP_UNPROCESSABLE, 'market_external_download', {
        url: resource.file?.externalUrl ?? urlOf(resource.id),
      });
    }
    const latest = versionSchema.parse(await fetchJson(`${API}/resources/${resource.id}/versions/latest`));
    const safeName = resource.name.replace(UNSAFE, '').slice(0, NAME_LENGTH) || `spigot-${resource.id}`;
    return {
      projectId: String(resource.id),
      projectName: resource.name,
      iconUrl: iconOf(resource.id),
      versionId: String(latest.id),
      versionName: latest.name,
      file: {
        url: `${API}/resources/${resource.id}/download`,
        fileName: `${safeName}-${latest.name.replace(UNSAFE, '')}.jar`,
        hash: null,
      },
      dependencies: [],
      manual: [],
    };
  },
};
