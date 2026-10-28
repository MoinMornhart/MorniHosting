import { z } from 'zod';
import { webhookInputSchema } from '@mornihosting/shared';
import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api } from '../context.js';
import { HTTP_NO_CONTENT } from '../lib/http-status.js';
import type { WebhookService } from './service.js';

const webhookParams = z.object({ webhookId: z.coerce.number().int().positive() });
const TESTS_PER_MINUTE = 10;

export function registerWebhookRoutes(app: Api, webhooks: WebhookService): void {
  app.get('/api/webhooks', async (request) => {
    requireAdmin(request);
    return webhooks.list();
  });

  app.post('/api/webhooks', { schema: { body: webhookInputSchema } }, async (request) => {
    requireAdmin(request);
    return webhooks.create(request.body, actorOf(request));
  });

  app.patch(
    '/api/webhooks/:webhookId',
    { schema: { params: webhookParams, body: webhookInputSchema.partial() } },
    async (request) => {
      requireAdmin(request);
      return webhooks.update(request.params.webhookId, request.body, actorOf(request));
    },
  );

  app.delete('/api/webhooks/:webhookId', { schema: { params: webhookParams } }, async (request, reply) => {
    requireAdmin(request);
    webhooks.remove(request.params.webhookId, actorOf(request));
    return reply.code(HTTP_NO_CONTENT).send();
  });

  app.post(
    '/api/webhooks/:webhookId/test',
    {
      schema: { params: webhookParams },
      config: { rateLimit: { max: TESTS_PER_MINUTE, timeWindow: '1 minute' } },
    },
    async (request) => {
      requireAdmin(request);
      return webhooks.test(request.params.webhookId);
    },
  );
}
