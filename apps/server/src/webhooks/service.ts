import { eq } from 'drizzle-orm';
import type { WebhookEntry, WebhookEvent, WebhookInput, WebhookKind } from '@mornihosting/shared';
import type { Actor } from '../audit/service.js';
import type { AppContext } from '../context.js';
import { servers as serverTable, webhooks } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { fetchResponse } from '../lib/http-client.js';
import { createKeyedLock } from '../lib/locks.js';
import { assertPublicHost, systemResolver, type Resolver } from '../lib/net-guard.js';
import { BYTES_PER_MB, MS_PER_SECOND, nowIso, sleep } from '../lib/units.js';
import { buildMessage, CRASH_REASONS, PAYLOADS, type Message } from './messages.js';

/**
 * Sends panel events to Discord, Slack, Teams or any HTTPS endpoint. URLs are stored encrypted,
 * must point to the right service for their kind, and never to the local network.
 */

type Row = typeof webhooks.$inferSelect;

const SEND_TIMEOUT_SECONDS = 10;
const RATE_LIMITED = 429;
const MAX_RETRY_SECONDS = 10;
const ONE_DECIMAL = 10;

const DISCORD_HOSTS: readonly string[] = [
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
];
const TEAMS_SUFFIXES: readonly string[] = ['.webhook.office.com', '.logic.azure.com', '.powerplatform.com'];

/** Which hosts each kind of webhook may talk to. */
const HOST_RULES: Readonly<Record<WebhookKind, (url: URL) => boolean>> = {
  discord: (url) => DISCORD_HOSTS.includes(url.hostname) && url.pathname.startsWith('/api/webhooks/'),
  slack: (url) => url.hostname === 'hooks.slack.com',
  teams: (url) => TEAMS_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix)),
  generic: () => true,
};

export interface WebhookService {
  readonly init: () => void;
  readonly list: () => WebhookEntry[];
  readonly create: (input: WebhookInput, actor: Actor) => Promise<WebhookEntry>;
  readonly update: (id: number, input: Partial<WebhookInput>, actor: Actor) => Promise<WebhookEntry>;
  readonly remove: (id: number, actor: Actor) => void;
  readonly test: (id: number) => Promise<{ status: number }>;
}

function sizeText(bytes: number): string {
  return `${Math.round((bytes / BYTES_PER_MB) * ONE_DECIMAL) / ONE_DECIMAL} MB`;
}

export function createWebhookService(ctx: AppContext, resolve: Resolver = systemResolver): WebhookService {
  const { db } = ctx;
  const inOrder = createKeyedLock();

  const toEntry = (r: Row): WebhookEntry => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    urlHost: r.urlHost,
    events: r.events,
    serverId: r.serverId,
    enabled: r.enabled,
    lastStatus: r.lastStatus,
    lastAt: r.lastAt,
  });

  const rowOf = (id: number): Row => {
    const row = db.select().from(webhooks).where(eq(webhooks.id, id)).get();
    if (!row) throw notFound();
    return row;
  };

  const checkUrl = async (kind: WebhookKind, raw: string): Promise<URL> => {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw badRequest('webhook_host_not_allowed', { kind });
    if (!HOST_RULES[kind](url)) throw badRequest('webhook_host_not_allowed', { kind });
    await assertPublicHost(url.hostname, resolve);
    return url;
  };

  /** Posts once; on Discord's or Slack's "slow down" it waits as asked (up to 10 s) and tries once more. */
  const post = async (url: URL, body: unknown, retry = true): Promise<number> => {
    await assertPublicHost(url.hostname, resolve);
    const response = await fetchResponse(url.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual',
      timeoutMs: SEND_TIMEOUT_SECONDS * MS_PER_SECOND,
    });
    if (response.status === RATE_LIMITED && retry) {
      const seconds = Number(response.headers.get('retry-after') ?? 1);
      await sleep(Math.min(MAX_RETRY_SECONDS, Number.isFinite(seconds) ? seconds : 1) * MS_PER_SECOND);
      return post(url, body, false);
    }
    return response.status;
  };

  const deliver = async (row: Row, message: Message): Promise<number> =>
    inOrder(String(row.id), async () => {
      const status = await (async () => {
        try {
          return await post(new URL(ctx.secrets.decrypt(row.url)), PAYLOADS[row.kind](message));
        } catch (err) {
          ctx.log.warn({ err, webhook: row.id }, 'webhook not delivered');
          return 0;
        }
      })();
      db.update(webhooks).set({ lastStatus: status, lastAt: nowIso() }).where(eq(webhooks.id, row.id)).run();
      return status;
    });

  const serverName = (serverId: string): string =>
    db.select({ name: serverTable.name }).from(serverTable).where(eq(serverTable.id, serverId)).get()?.name ??
    serverId;

  const publish = (event: WebhookEvent, serverId: string, values: Readonly<Record<string, string>>): void => {
    const targets = db
      .select()
      .from(webhooks)
      .all()
      .filter(
        (w) => w.enabled && w.events.includes(event) && (w.serverId === null || w.serverId === serverId),
      );
    if (!targets.length) return;
    const message = buildMessage(
      ctx.settings.get().defaultLocale,
      event,
      { id: serverId, name: serverName(serverId) },
      values,
    );
    targets.forEach((w) => void deliver(w, message));
  };

  const values = async (input: Partial<WebhookInput>, current: Row | null) => {
    const kind = input.kind ?? current?.kind ?? 'generic';
    if (input.url) {
      const url = await checkUrl(kind, input.url);
      return { kind, url: ctx.secrets.encrypt(url.href), urlHost: url.hostname };
    }
    if (current && input.kind && input.kind !== current.kind) {
      await checkUrl(kind, ctx.secrets.decrypt(current.url));
    }
    return { kind };
  };

  return {
    init: () => {
      ctx.events.on('server.state', ({ serverId, state, previous }) => {
        if (state === 'running' && previous === 'starting') publish('server.started', serverId, {});
        if (state === 'stopped' && (previous === 'stopping' || previous === 'running')) {
          publish('server.stopped', serverId, {});
        }
      });
      ctx.events.on('server.crashed', ({ serverId, crash }) => {
        const locale = ctx.settings.get().defaultLocale;
        publish('server.crashed', serverId, {
          reason: CRASH_REASONS[locale][crash.ruleId] ?? crash.ruleId,
          rule: crash.ruleId,
        });
      });
      ctx.events.on('backup.done', ({ serverId, sizeBytes }) =>
        publish('backup.done', serverId, { size: sizeText(sizeBytes) }),
      );
      ctx.events.on('backup.failed', ({ serverId, error }) => publish('backup.failed', serverId, { error }));
      ctx.events.on('player.joined', ({ serverId, player }) =>
        publish('player.joined', serverId, { player }),
      );
      ctx.events.on('player.left', ({ serverId, player }) => publish('player.left', serverId, { player }));
    },

    list: () => db.select().from(webhooks).all().map(toEntry),

    create: async (input, actor) => {
      const checked = await values(input, null);
      if (!('url' in checked) || !checked.url) throw badRequest('validation');
      const row = db
        .insert(webhooks)
        .values({
          name: input.name,
          kind: checked.kind,
          url: checked.url,
          urlHost: checked.urlHost,
          events: input.events,
          serverId: input.serverId,
          enabled: input.enabled,
        })
        .returning()
        .get();
      ctx.audit.record(actor, 'webhook.create', input.serverId, {
        name: row.name,
        kind: row.kind,
        host: row.urlHost,
      });
      return toEntry(row);
    },

    update: async (id, input, actor) => {
      const current = rowOf(id);
      const checked = await values(input, current);
      const row = db
        .update(webhooks)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.events !== undefined ? { events: input.events } : {}),
          ...(input.serverId !== undefined ? { serverId: input.serverId } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...checked,
        })
        .where(eq(webhooks.id, id))
        .returning()
        .get();
      ctx.audit.record(actor, 'webhook.update', row.serverId, { name: row.name });
      return toEntry(row);
    },

    remove: (id, actor) => {
      const row = rowOf(id);
      db.delete(webhooks).where(eq(webhooks.id, id)).run();
      ctx.audit.record(actor, 'webhook.delete', row.serverId, { name: row.name });
    },

    test: async (id) => {
      const row = rowOf(id);
      const name = row.serverId ? serverName(row.serverId) : 'MorniHosting';
      const message = buildMessage(ctx.settings.get().defaultLocale, 'test', { id: row.serverId, name }, {});
      return { status: await deliver(row, message) };
    },
  };
}
