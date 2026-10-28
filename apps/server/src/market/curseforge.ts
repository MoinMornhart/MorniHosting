import { z } from 'zod';
import type { MarketSort, MarketVersion } from '@mornihosting/shared';
import { AppError, notFound } from '../lib/errors.js';
import { fetchJson } from '../lib/http-client.js';
import { HTTP_UNPROCESSABLE } from '../lib/http-status.js';
import { compatibility, PAGE_SIZE, type Provider, type Target } from './types.js';

/**
 * CurseForge (https://docs.curseforge.com/rest-api/). Needs the panel owner's own API key.
 * Some authors forbid third-party downloads; those files have no download URL. Hashes: sha1.
 */

const API = 'https://api.curseforge.com/v1';
const GAME_MINECRAFT = 432;
const RELATION_REQUIRED = 3;
const HASH_SHA1 = 1;
const FILE_LIMIT = 25;
const RELEASE_TYPE_RELEASE = 1;
const RELEASE_TYPE_BETA = 2;
const RELEASE_TYPE_ALPHA = 3;
const RELEASE_TYPES: Readonly<Record<number, MarketVersion['channel']>> = {
  [RELEASE_TYPE_RELEASE]: 'release',
  [RELEASE_TYPE_BETA]: 'beta',
  [RELEASE_TYPE_ALPHA]: 'alpha',
};
/** CurseForge's ModsSearchSortField values. */
const SORT_POPULARITY = 2;
const SORT_LAST_UPDATED = 3;
const SORT_TOTAL_DOWNLOADS = 6;
const SORT: Readonly<Record<MarketSort, number>> = {
  relevance: SORT_POPULARITY,
  downloads: SORT_TOTAL_DOWNLOADS,
  updated: SORT_LAST_UPDATED,
};

const modSchema = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string(),
  authors: z.array(z.object({ name: z.string() })),
  downloadCount: z.number(),
  logo: z.object({ thumbnailUrl: z.string() }).nullable().optional(),
  dateModified: z.string().optional(),
  links: z.object({ websiteUrl: z.string().nullable().optional() }),
  latestFilesIndexes: z.array(
    z.object({ gameVersion: z.string(), modLoader: z.number().nullable().optional() }),
  ),
  allowModDistribution: z.boolean().nullable().optional(),
});
type Mod = z.infer<typeof modSchema>;

const fileSchema = z.object({
  id: z.number(),
  displayName: z.string(),
  fileName: z.string(),
  fileDate: z.string(),
  releaseType: z.number(),
  downloadUrl: z.string().nullable(),
  hashes: z.array(z.object({ value: z.string(), algo: z.number() })),
  gameVersions: z.array(z.string()),
  dependencies: z.array(z.object({ modId: z.number(), relationType: z.number() })),
});
type CfFile = z.infer<typeof fileSchema>;

function targetOf(target: Target): { classId: number; modLoaderType: number } {
  if (!target.software.curseforge) throw notFound('no_content_support');
  return target.software.curseforge;
}

function loaderParams(target: Target): Record<string, string> {
  const { modLoaderType } = targetOf(target);
  return modLoaderType ? { modLoaderType: String(modLoaderType) } : {};
}

function fits(target: Target, mod: Mod): boolean {
  const { modLoaderType } = targetOf(target);
  return mod.latestFilesIndexes.some(
    (f) => f.gameVersion === target.version && (!modLoaderType || f.modLoader === modLoaderType),
  );
}

export function createCurseForge(apiKey: () => string | null): Provider {
  const get = async (path: string, params: Record<string, string> = {}): Promise<unknown> => {
    const key = apiKey();
    if (!key) throw new AppError(HTTP_UNPROCESSABLE, 'curseforge_key_missing');
    const query = new URLSearchParams(params).toString();
    return fetchJson(`${API}${path}${query ? `?${query}` : ''}`, { headers: { 'x-api-key': key } });
  };
  const files = async (target: Target, modId: string, onlyCompatible: boolean): Promise<CfFile[]> =>
    z.object({ data: z.array(fileSchema) }).parse(
      await get(`/mods/${encodeURIComponent(modId)}/files`, {
        pageSize: String(FILE_LIMIT),
        ...(onlyCompatible ? { gameVersion: target.version, ...loaderParams(target) } : {}),
      }),
    ).data;

  return {
    search: async (target, q) => {
      const data = z
        .object({ data: z.array(modSchema), pagination: z.object({ totalCount: z.number() }) })
        .parse(
          await get('/mods/search', {
            gameId: String(GAME_MINECRAFT),
            classId: String(targetOf(target).classId),
            searchFilter: q.q,
            sortField: String(SORT[q.sort]),
            sortOrder: 'desc',
            pageSize: String(PAGE_SIZE),
            index: String(q.page * PAGE_SIZE),
            ...(q.compatibleOnly ? { gameVersion: target.version, ...loaderParams(target) } : {}),
          }),
        );
      return {
        total: data.pagination.totalCount,
        hits: data.data.map((m) => ({
          source: 'curseforge' as const,
          id: String(m.id),
          name: m.name,
          summary: m.summary,
          author: m.authors[0]?.name ?? '',
          downloads: m.downloadCount,
          iconUrl: m.logo?.thumbnailUrl ?? null,
          updatedAt: m.dateModified ?? null,
          url:
            m.links.websiteUrl ??
            `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(m.name)}`,
          compatible: compatibility(fits(target, m)),
          installable: m.allowModDistribution !== false,
        })),
      };
    },

    versions: async (target, projectId) =>
      (await files(target, projectId, false)).map((f) => ({
        id: String(f.id),
        name: f.displayName,
        gameVersions: f.gameVersions,
        publishedAt: f.fileDate,
        channel: RELEASE_TYPES[f.releaseType] ?? 'release',
        compatible: f.gameVersions.includes(target.version),
      })),

    resolve: async (target, projectId, versionId) => {
      const mod = z
        .object({ data: modSchema })
        .parse(await get(`/mods/${encodeURIComponent(projectId)}`)).data;
      const file = versionId
        ? z
            .object({ data: fileSchema })
            .parse(await get(`/mods/${mod.id}/files/${encodeURIComponent(versionId)}`)).data
        : (await files(target, String(mod.id), true)).sort(
            (a, b) => a.releaseType - b.releaseType || b.fileDate.localeCompare(a.fileDate),
          )[0];
      if (!file) throw notFound('market_no_compatible_version');
      if (!file.downloadUrl) {
        throw new AppError(HTTP_UNPROCESSABLE, 'market_external_download', {
          url: mod.links.websiteUrl ?? '',
        });
      }
      const sha1 = file.hashes.find((h) => h.algo === HASH_SHA1);
      return {
        projectId: String(mod.id),
        projectName: mod.name,
        iconUrl: mod.logo?.thumbnailUrl ?? null,
        versionId: String(file.id),
        versionName: file.displayName,
        file: {
          url: file.downloadUrl,
          fileName: file.fileName,
          hash: sha1 ? { algorithm: 'sha1', value: sha1.value } : null,
        },
        dependencies: file.dependencies
          .filter((d) => d.relationType === RELATION_REQUIRED)
          .map((d) => ({ source: 'curseforge' as const, projectId: String(d.modId), name: String(d.modId) })),
        manual: [],
      };
    },
  };
}
