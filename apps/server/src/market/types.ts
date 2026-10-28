import type {
  Compatibility,
  ContentSource,
  MarketProject,
  MarketSort,
  MarketVersion,
  SoftwareInfo,
} from '@mornihosting/shared';

/** What the marketplace needs to know about the server it installs into. */
export interface Target {
  readonly software: SoftwareInfo;
  readonly version: string;
}

export type HashAlgorithm = 'sha512' | 'sha256' | 'sha1';

export interface FileToDownload {
  readonly url: string;
  readonly fileName: string;
  readonly hash: { readonly algorithm: HashAlgorithm; readonly value: string } | null;
}

/** A project reference from a dependency list. */
export interface DependencyRef {
  readonly source: ContentSource;
  readonly projectId: string;
  readonly name: string;
}

export interface ResolvedInstall {
  readonly projectId: string;
  readonly projectName: string;
  readonly iconUrl: string | null;
  readonly versionId: string;
  readonly versionName: string;
  readonly file: FileToDownload;
  readonly dependencies: readonly DependencyRef[];
  /** Required dependencies that are only available on an external website. */
  readonly manual: readonly { readonly name: string; readonly url: string | null }[];
}

export interface SearchQuery {
  readonly q: string;
  readonly sort: MarketSort;
  readonly page: number;
  readonly compatibleOnly: boolean;
}

export type ProviderProject = Omit<MarketProject, 'installed'>;

export interface Provider {
  readonly search: (
    target: Target,
    query: SearchQuery,
  ) => Promise<{ hits: ProviderProject[]; total: number }>;
  readonly versions: (target: Target, projectId: string) => Promise<MarketVersion[]>;
  /** The version to install (the newest compatible one unless `versionId` is given) and its dependencies. */
  readonly resolve: (target: Target, projectId: string, versionId?: string) => Promise<ResolvedInstall>;
}

export const PAGE_SIZE = 20;

export function compatibility(matches: boolean | null): Compatibility {
  if (matches === null) return 'unknown';
  return matches ? 'yes' : 'no';
}

/** A proxy's own version (Velocity 3.4) is not a Minecraft version; its plugins are not tied to it. */
export function checksGameVersion(target: Target): boolean {
  return !target.software.proxy;
}
