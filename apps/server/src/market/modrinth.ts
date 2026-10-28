import { z } from 'zod';
import type { MarketSort, MarketVersion } from '@mornihosting/shared';
import { notFound } from '../lib/errors.js';
import { fetchJson } from '../lib/http-client.js';
import {
  checksGameVersion,
  compatibility,
  PAGE_SIZE,
  type FileToDownload,
  type Provider,
  type ResolvedInstall,
  type Target,
} from './types.js';

/** Modrinth API v2 (https://docs.modrinth.com/api/). Hashes: sha512. */

const API = 'https://api.modrinth.com/v2';

const hitSchema = z.object({
  project_id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  downloads: z.number(),
  icon_url: z.string().nullable().optional(),
  date_modified: z.string().optional(),
  versions: z.array(z.string()),
  categories: z.array(z.string()),
  project_type: z.string(),
});
const searchSchema = z.object({ hits: z.array(hitSchema), total_hits: z.number() });

const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
  date_published: z.string(),
  version_type: z.enum(['release', 'beta', 'alpha']),
  files: z.array(
    z.object({
      url: z.string(),
      filename: z.string(),
      primary: z.boolean(),
      hashes: z.object({ sha512: z.string().optional(), sha1: z.string().optional() }),
    }),
  ),
  dependencies: z.array(
    z.object({
      project_id: z.string().nullable(),
      version_id: z.string().nullable(),
      dependency_type: z.string(),
    }),
  ),
});
type ModrinthVersion = z.infer<typeof versionSchema>;

const projectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  icon_url: z.string().nullable().optional(),
  project_type: z.string(),
});

const SORT_INDEX: Readonly<Record<MarketSort, string>> = {
  relevance: 'relevance',
  downloads: 'downloads',
  updated: 'updated',
};

function query(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function projectUrl(type: string, slug: string): string {
  return `https://modrinth.com/${type === 'mod' ? 'mod' : 'plugin'}/${slug}`;
}

function fits(target: Target, version: Pick<ModrinthVersion, 'loaders' | 'game_versions'>): boolean {
  return (
    (!checksGameVersion(target) || version.game_versions.includes(target.version)) &&
    version.loaders.some((l) => target.software.modrinthLoaders.includes(l))
  );
}

function hashOf(hashes: { sha512?: string; sha1?: string }): FileToDownload['hash'] {
  if (hashes.sha512) return { algorithm: 'sha512', value: hashes.sha512 };
  if (hashes.sha1) return { algorithm: 'sha1', value: hashes.sha1 };
  return null;
}

async function fetchVersions(
  target: Target,
  projectId: string,
  onlyCompatible: boolean,
): Promise<ModrinthVersion[]> {
  const params = onlyCompatible
    ? `?${query({
        loaders: JSON.stringify(target.software.modrinthLoaders),
        ...(checksGameVersion(target) ? { game_versions: JSON.stringify([target.version]) } : {}),
      })}`
    : '';
  return z
    .array(versionSchema)
    .parse(await fetchJson(`${API}/project/${encodeURIComponent(projectId)}/version${params}`));
}

export const modrinth: Provider = {
  search: async (target, q) => {
    const projectType = target.software.content === 'mods' ? 'mod' : 'plugin';
    const facets = [
      [`project_type:${projectType}`],
      target.software.modrinthLoaders.map((l) => `categories:${l}`),
      ...(q.compatibleOnly && checksGameVersion(target) ? [[`versions:${target.version}`]] : []),
      ...(projectType === 'mod' ? [['server_side:required', 'server_side:optional']] : []),
    ];
    const data = searchSchema.parse(
      await fetchJson(
        `${API}/search?${query({
          query: q.q,
          facets: JSON.stringify(facets),
          index: SORT_INDEX[q.sort],
          limit: String(PAGE_SIZE),
          offset: String(q.page * PAGE_SIZE),
        })}`,
      ),
    );
    return {
      total: data.total_hits,
      hits: data.hits.map((h) => ({
        source: 'modrinth',
        id: h.project_id,
        name: h.title,
        summary: h.description,
        author: h.author,
        downloads: h.downloads,
        iconUrl: h.icon_url || null,
        updatedAt: h.date_modified ?? null,
        url: projectUrl(h.project_type, h.slug),
        compatible: compatibility(
          (!checksGameVersion(target) || h.versions.includes(target.version)) &&
            h.categories.some((c) => target.software.modrinthLoaders.includes(c)),
        ),
        installable: true,
      })),
    };
  },

  versions: async (target, projectId) =>
    (await fetchVersions(target, projectId, false)).map((v): MarketVersion => ({
      id: v.id,
      name: v.version_number,
      gameVersions: v.game_versions,
      publishedAt: v.date_published,
      channel: v.version_type,
      compatible: fits(target, v),
    })),

  resolve: async (target, projectId, versionId): Promise<ResolvedInstall> => {
    const project = projectSchema.parse(await fetchJson(`${API}/project/${encodeURIComponent(projectId)}`));
    const version = versionId
      ? versionSchema.parse(await fetchJson(`${API}/version/${encodeURIComponent(versionId)}`))
      : (await fetchVersions(target, project.id, true)).sort(
          (a, b) =>
            Number(b.version_type === 'release') - Number(a.version_type === 'release') ||
            b.date_published.localeCompare(a.date_published),
        )[0];
    if (!version || version.project_id !== project.id) throw notFound('market_no_compatible_version');
    const file = version.files.find((f) => f.primary) ?? version.files[0];
    if (!file) throw notFound('market_no_compatible_version');
    const required = version.dependencies.filter((d) => d.dependency_type === 'required');
    const viaVersion = await Promise.all(
      required
        .filter((d) => !d.project_id && d.version_id)
        .map(async (d) => versionSchema.parse(await fetchJson(`${API}/version/${d.version_id}`)).project_id),
    );
    const dependencyIds = [...required.flatMap((d) => (d.project_id ? [d.project_id] : [])), ...viaVersion];
    return {
      projectId: project.id,
      projectName: project.title,
      iconUrl: project.icon_url || null,
      versionId: version.id,
      versionName: version.version_number,
      file: {
        url: file.url,
        fileName: file.filename,
        hash: hashOf(file.hashes),
      },
      dependencies: [...new Set(dependencyIds)].map((id) => ({
        source: 'modrinth',
        projectId: id,
        name: id,
      })),
      manual: [],
    };
  },
};

/** Looks up jar files by their sha1 hash, so files added by hand still get a name and updates. */
export async function identifyBySha1(
  hashes: readonly string[],
): Promise<Map<string, { projectId: string; versionId: string; versionName: string }>> {
  if (!hashes.length) return new Map();
  const data = z
    .record(z.string(), versionSchema.pick({ id: true, project_id: true, version_number: true }))
    .parse(
      await fetchJson(`${API}/version_files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hashes, algorithm: 'sha1' }),
      }),
    );
  return new Map(
    Object.entries(data).map(([hash, v]) => [
      hash,
      { projectId: v.project_id, versionId: v.id, versionName: v.version_number },
    ]),
  );
}

export async function projectsById(
  ids: readonly string[],
): Promise<Map<string, { name: string; iconUrl: string | null; url: string }>> {
  if (!ids.length) return new Map();
  const list = z
    .array(projectSchema)
    .parse(await fetchJson(`${API}/projects?${query({ ids: JSON.stringify(ids) })}`));
  return new Map(
    list.map((p) => [
      p.id,
      { name: p.title, iconUrl: p.icon_url || null, url: projectUrl(p.project_type, p.slug) },
    ]),
  );
}

export function modrinthProjectUrl(type: 'mods' | 'plugins', idOrSlug: string): string {
  return projectUrl(type === 'mods' ? 'mod' : 'plugin', idOrSlug);
}
