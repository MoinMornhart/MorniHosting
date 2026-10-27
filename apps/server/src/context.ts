import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AuditService } from './audit/service.js';
import type { SessionStore } from './auth/sessions.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { DockerDriver } from './docker/driver.js';
import type { EventBus } from './events.js';
import type { SecretBox } from './lib/crypto.js';
import type { SettingsService } from './settings/service.js';
import type { AccessService } from './users/access.js';

export type Api = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

/** Long-lived services shared by all routes. Feature services register themselves in `features`. */
export interface AppContext {
  readonly config: Config;
  readonly db: Db;
  readonly log: FastifyBaseLogger;
  readonly secrets: SecretBox;
  readonly events: EventBus;
  readonly settings: SettingsService;
  readonly audit: AuditService;
  readonly sessions: SessionStore;
  readonly access: AccessService;
  readonly docker: DockerDriver;
}
