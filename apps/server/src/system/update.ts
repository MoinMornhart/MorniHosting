import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { UpdateInfo } from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { AppContext } from '../context.js';
import { conflict } from '../lib/errors.js';
import { createCache, fetchJson, UpstreamError } from '../lib/http-client.js';
import { HTTP_NOT_FOUND } from '../lib/http-status.js';
import { MS_PER_HOUR, nowIso } from '../lib/units.js';
import { compareVersionNames } from '../lib/version-compare.js';

/**
 * Update check against GitHub releases, and the hand-over to the host: the panel cannot update its own
 * container, so it drops a request file into the data volume. The host updater from install.sh
 * (a systemd path unit) sees it and runs update.sh. The updater announces itself with agent.json.
 */

const NOTES_MAX = 4000;
// The "v" in front of a release tag: matches in "v1.2.0"; "1.2.0" has none.
// https://regex101.com/?regex=%5Ev&testString=v1.2.0
const TAG_PREFIX = /^v/;
// A released version number at the start: "1.2.0" and "v1.2.0-3-gabc123" match; "dev" and "a1b2c3d" do not.
// https://regex101.com/?regex=%5Ev%3F%5Cd%2B%5C.%5Cd%2B&testString=1.2.0%0Av1.2.0-3-gabc123%0Adev%0Aa1b2c3d
const RELEASE_VERSION = /^v?\d+\.\d+/;
const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string(),
  body: z.string().nullable().optional(),
});

/** A panel built from source before the first release (version "dev" or a commit) takes any release. */
function isNewer(latest: string, current: string): boolean {
  if (!RELEASE_VERSION.test(current)) return true;
  return (compareVersionNames(latest, current) ?? 0) > 0;
}

interface Latest {
  readonly version: string | null;
  readonly notes: string | null;
  readonly url: string | null;
  readonly checkedAt: string;
}

export interface UpdateService {
  readonly info: () => Promise<UpdateInfo>;
  readonly request: (actor: Actor) => Promise<UpdateInfo>;
}

export function createUpdateService(ctx: AppContext): UpdateService {
  const dir = path.join(ctx.config.dataDir, 'update');
  const requestFile = path.join(dir, 'request.json');
  const agentFile = path.join(dir, 'agent.json');
  const cache = createCache<Latest>(MS_PER_HOUR);

  const latest = (): Promise<Latest> =>
    cache.wrap('latest', async () => {
      try {
        const release = releaseSchema.parse(
          await fetchJson(`https://api.github.com/repos/${ctx.config.updateRepo}/releases/latest`, {
            headers: { accept: 'application/vnd.github+json' },
          }),
        );
        return {
          version: release.tag_name.replace(TAG_PREFIX, ''),
          notes: release.body ? release.body.slice(0, NOTES_MAX) : null,
          url: release.html_url,
          checkedAt: nowIso(),
        };
      } catch (err) {
        // No release published yet is not an error worth showing.
        if (err instanceof UpstreamError && err.status === HTTP_NOT_FOUND) {
          return { version: null, notes: null, url: null, checkedAt: nowIso() };
        }
        throw err;
      }
    });

  const info = async (): Promise<UpdateInfo> => {
    const current = ctx.config.version;
    const base = {
      current,
      canSelfUpdate: fs.existsSync(agentFile),
      updating: fs.existsSync(requestFile),
    };
    if (!ctx.settings.get().checkUpdates) {
      return { ...base, latest: null, available: false, notes: null, url: null, checkedAt: null };
    }
    const found = await (async (): Promise<Latest | null> => {
      try {
        return await latest();
      } catch (err) {
        ctx.log.warn({ err }, 'update check failed');
        return null;
      }
    })();
    const newer = found?.version ? isNewer(found.version, current) : false;
    return {
      ...base,
      latest: found?.version ?? null,
      available: newer,
      notes: found?.notes ?? null,
      url: found?.url ?? null,
      checkedAt: found?.checkedAt ?? null,
    };
  };

  return {
    info,
    request: async (actor) => {
      const current = await info();
      if (!current.canSelfUpdate) throw conflict('self_update_unavailable');
      if (!current.available) throw conflict('update_unavailable');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        requestFile,
        JSON.stringify({ requestedAt: nowIso(), by: actor.username, version: current.latest }),
      );
      ctx.audit.record(actor, 'panel.update', null, { from: current.current, to: current.latest });
      return { ...current, updating: true };
    },
  };
}
