import type { FastifyRequest } from 'fastify';
import type { PasskeySupport } from '@mornihosting/shared';
import type { AppContext } from '../context.js';
import { badRequest } from '../lib/errors.js';
import { onPanelDomain, panelOrigin, servedOverHttps } from './hook.js';
import { MS_PER_MINUTE } from '../lib/units.js';

/**
 * Where passkeys can work. Browsers only offer WebAuthn on HTTPS pages (or localhost), and a passkey
 * belongs to one domain. Once the admin has entered the panel's domain, passkeys are made for it alone.
 */

const CHALLENGE_MINUTES = 5;
/** Enough for many people signing in at once; older open challenges make room. */
const MAX_OPEN_CHALLENGES = 500;
const LOCALHOST = 'localhost';
const LOCAL_SUFFIX = '.localhost';
const HTTPS = 'https:';
const HTTP = 'http:';

export interface PasskeyScope {
  /** Relying party id: the domain the passkey belongs to. */
  readonly rpID: string;
  /** The exact page origin the browser reported, already checked against the host. */
  readonly origin: string;
}

const isLocal = (host: string): boolean => host === LOCALHOST || host.endsWith(LOCAL_SUFFIX);

export function passkeySupport(ctx: AppContext, request: FastifyRequest): PasskeySupport {
  const host = request.hostname;
  if (ctx.settings.get().panelDomain) return onPanelDomain(ctx, host) ? 'ok' : 'wrong_host';
  return servedOverHttps(ctx, request) || isLocal(host) ? 'ok' : 'needs_https';
}

/** The domain and origin for a passkey ceremony, or an error the page can explain. */
export function passkeyScope(ctx: AppContext, request: FastifyRequest): PasskeyScope {
  // On the panel domain the browser's Origin decides, so a proxy that rewrites Host does not matter.
  // Safe: the browser signs that origin into the answer, and a passkey only works on its own domain.
  const viaDomain = panelOrigin(ctx, request);
  if (viaDomain) return { rpID: viaDomain.hostname, origin: viaDomain.origin };
  const support = passkeySupport(ctx, request);
  if (support !== 'ok') throw badRequest(`passkey_${support}`);
  const origin = request.headers.origin ?? '';
  const url = URL.canParse(origin) ? new URL(origin) : null;
  const protocolOk = url?.protocol === HTTPS || (url?.protocol === HTTP && isLocal(url.hostname));
  if (!url || !protocolOk || url.hostname !== request.hostname) throw badRequest('bad_origin');
  return { rpID: request.hostname, origin: url.origin };
}

export interface ChallengeStore {
  readonly put: (key: string, challenge: string) => void;
  /** Hands out a challenge once; an expired or unknown one gives undefined. */
  readonly take: (key: string) => string | undefined;
}

export function createChallengeStore(now: () => number = Date.now): ChallengeStore {
  const open = new Map<string, { readonly challenge: string; readonly expires: number }>();
  const prune = (): void => {
    const time = now();
    Array.from(open)
      .filter(([, entry]) => entry.expires <= time)
      .forEach(([key]) => open.delete(key));
    Array.from(open.keys())
      .slice(0, Math.max(0, open.size - MAX_OPEN_CHALLENGES + 1))
      .forEach((key) => open.delete(key));
  };
  return {
    put: (key, challenge) => {
      prune();
      open.set(key, { challenge, expires: now() + CHALLENGE_MINUTES * MS_PER_MINUTE });
    },
    take: (key) => {
      const entry = open.get(key);
      open.delete(key);
      return entry && entry.expires > now() ? entry.challenge : undefined;
    },
  };
}
