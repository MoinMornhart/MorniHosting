import { z } from 'zod';
import type { MarketSort, MarketVersion } from '@mornihosting/shared';
import { AppError, notFound } from '../lib/errors.js';
import { fetchJson } from '../lib/http-client.js';
import { HTTP_UNPROCESSABLE } from '../lib/http-status.js';
import { checksGameVersion, compatibility, PAGE_SIZE, type Provider, type Target } from './types.js';

/** Hangar, PaperMC's plugin repository (https://hangar.papermc.io/api-docs). Hashes: sha256. */

const API = 'https://hangar.papermc.io/api/v1';
const VERSION_LIMIT = 25;

const projectSchema = z.object({
  id: z.number(),
  name: z.string(),
  namespace: z.object({ owner: z.string(), slug: z.string() }),
  stats: z.object({ downloads: z.number() }),
  description: z.string().nullable().optional(),
  lastUpdated: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
});
type HangarProject = z.infer<typeof projectSchema>;

const downloadSchema = z.object({
  fileInfo: z.object({ name: z.string(), sha256Hash: z.string() }).nullable(),
  externalUrl: z.string().nullable(),
  downloadUrl: z.string().nullable(),
});

const versionSchema = z.object({
  name: z.string(),
  createdAt: z.string(),
  channel: z.object({ name: z.string() }),
  downloads: z.record(z.string(), downloadSchema),
  pluginDependencies: z.record(
    z.string(),
    z.array(
      z.object({
        name: z.string(),
        projectId: z.union([z.number(), z.string()]).nullable(),
        required: z.boolean(),
        externalUrl: z.string().nullable(),
      }),
    ),
  ),
  platformDependencies: z.record(z.string(), z.array(z.string())),
});
type HangarVersion = z.infer<typeof versionSchema>;

const listSchema = <T extends z.ZodType>(item: T) =>
  z.object({ pagination: z.object({ count: z.number() }), result: z.array(item) });

const SORT: Readonly<Record<MarketSort, string | null>> = {
  relevance: null,
  downloads: '-downloads',
  updated: '-updated',
};

function platformOf(target: Target): string {
  const platform = target.software.hangarPlatform;
  if (!platform) throw notFound('no_content_support');
  return platform;
}

function urlOf(project: HangarProject): string {
  return `https://hangar.papermc.io/${project.namespace.owner}/${project.namespace.slug}`;
}

function channelOf(name: string): MarketVersion['channel'] {
  const lower = name.toLowerCase();
  if (lower.includes('alpha') || lower.includes('snapshot') || lower.includes('dev')) return 'alpha';
  return lower.includes('beta') ? 'beta' : 'release';
}

async function listVersions(
  target: Target,
  projectId: string,
  onlyCompatible: boolean,
): Promise<HangarVersion[]> {
  const params = new URLSearchParams({ platform: platformOf(target), limit: String(VERSION_LIMIT) });
  if (onlyCompatible && checksGameVersion(target)) params.set('platformVersion', target.version);
  const data = listSchema(versionSchema).parse(
    await fetchJson(`${API}/projects/${encodeURIComponent(projectId)}/versions?${params.toString()}`),
  );
  return data.result;
}

export const hangar: Provider = {
  search: async (target, q) => {
    const params = new URLSearchParams({
      q: q.q,
      platform: platformOf(target),
      limit: String(PAGE_SIZE),
      offset: String(q.page * PAGE_SIZE),
    });
    if (q.compatibleOnly && checksGameVersion(target)) params.set('version', target.version);
    const sort = SORT[q.sort];
    if (sort) params.set('sort', sort);
    const data = listSchema(projectSchema).parse(await fetchJson(`${API}/projects?${params.toString()}`));
    return {
      total: data.pagination.count,
      hits: data.result.map((p) => ({
        source: 'hangar',
        id: String(p.id),
        name: p.name,
        summary: p.description ?? '',
        author: p.namespace.owner,
        downloads: p.stats.downloads,
        iconUrl: p.avatarUrl ?? null,
        updatedAt: p.lastUpdated ?? null,
        url: urlOf(p),
        compatible: compatibility(q.compatibleOnly ? true : null),
        installable: true,
      })),
    };
  },

  versions: async (target, projectId) => {
    const platform = platformOf(target);
    return (await listVersions(target, projectId, false)).map((v) => ({
      id: v.name,
      name: v.name,
      gameVersions: v.platformDependencies[platform] ?? [],
      publishedAt: v.createdAt,
      channel: channelOf(v.channel.name),
      compatible:
        !checksGameVersion(target) || (v.platformDependencies[platform] ?? []).includes(target.version),
    }));
  },

  resolve: async (target, projectId, versionId) => {
    const platform = platformOf(target);
    const project = projectSchema.parse(await fetchJson(`${API}/projects/${encodeURIComponent(projectId)}`));
    const version = versionId
      ? versionSchema.parse(
          await fetchJson(`${API}/projects/${project.id}/versions/${encodeURIComponent(versionId)}`),
        )
      : (await listVersions(target, String(project.id), true)).sort(
          (a, b) =>
            Number(channelOf(b.channel.name) === 'release') - Number(channelOf(a.channel.name) === 'release'),
        )[0];
    const download = version?.downloads[platform];
    if (!version || !download) throw notFound('market_no_compatible_version');
    if (!download.downloadUrl || !download.fileInfo) {
      throw new AppError(HTTP_UNPROCESSABLE, 'market_external_download', {
        url: download.externalUrl ?? urlOf(project),
      });
    }
    const required = (version.pluginDependencies[platform] ?? []).filter((d) => d.required);
    return {
      projectId: String(project.id),
      projectName: project.name,
      iconUrl: project.avatarUrl ?? null,
      versionId: version.name,
      versionName: version.name,
      file: {
        url: download.downloadUrl,
        fileName: download.fileInfo.name,
        hash: { algorithm: 'sha256', value: download.fileInfo.sha256Hash },
      },
      dependencies: required.flatMap((d) =>
        d.projectId === null
          ? []
          : [{ source: 'hangar' as const, projectId: String(d.projectId), name: d.name }],
      ),
      manual: required.filter((d) => d.projectId === null).map((d) => ({ name: d.name, url: d.externalUrl })),
    };
  },
};
