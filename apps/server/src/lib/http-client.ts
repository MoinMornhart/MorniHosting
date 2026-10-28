import { AppError } from './errors.js';
import { HTTP_BAD_GATEWAY } from './http-status.js';
import { MS_PER_SECOND } from './units.js';

const DEFAULT_TIMEOUT_SECONDS = 15;

export interface FetchOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
  readonly method?: string;
  readonly body?: string;
  /** "manual" lets the caller check every redirect target itself. */
  readonly redirect?: 'follow' | 'manual';
}

export class UpstreamError extends Error {
  override readonly name = 'UpstreamError';
  constructor(
    readonly url: string,
    readonly status: number | null,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

const state = { userAgent: 'MorniHosting (+https://github.com/MoinMornhart/MorniHosting)' };

export function setUserAgent(version: string): void {
  state.userAgent = `MorniHosting/${version} (+https://github.com/MoinMornhart/MorniHosting)`;
}

export async function fetchResponse(url: string, options: FetchOptions = {}): Promise<Response> {
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { 'user-agent': state.userAgent, accept: 'application/json', ...options.headers },
      body: options.body,
      redirect: options.redirect ?? 'follow',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_SECONDS * MS_PER_SECOND),
    });
    return response;
  } catch (err) {
    throw new UpstreamError(url, null, err instanceof Error ? err.message : String(err), { cause: err });
  }
}

/** GETs JSON and hands it back as `unknown`; callers validate it with a schema. */
export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const response = await fetchResponse(url, options);
  if (!response.ok) throw new UpstreamError(url, response.status, `HTTP ${response.status}`);
  return response.json();
}

export function upstreamToAppError(err: unknown, code: string): AppError {
  const host = err instanceof UpstreamError ? new URL(err.url).host : 'unknown';
  return new AppError(HTTP_BAD_GATEWAY, code, { host }, { cause: err });
}

/** Small time-based cache for upstream lookups (version lists, public IP). */
export function createCache<TValue>(ttlMs: number) {
  const entries = new Map<string, { value: TValue; until: number }>();
  return {
    get: (key: string): TValue | undefined => {
      const hit = entries.get(key);
      return hit && hit.until > Date.now() ? hit.value : undefined;
    },
    set: (key: string, value: TValue): void => {
      entries.set(key, { value, until: Date.now() + ttlMs });
    },
    async wrap(key: string, load: () => Promise<TValue>): Promise<TValue> {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
      const value = await load();
      this.set(key, value);
      return value;
    },
  };
}
