import { z } from 'zod';
import { httpsSchema } from '@mornihosting/shared';
import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api } from '../context.js';
import { HTTP_NOT_FOUND } from '../lib/http-status.js';
import type { HttpsGateway } from './gateway.js';

const HOST_MAX = 253;

export function registerHttpsRoutes(app: Api, gateway: HttpsGateway): void {
  app.get('/api/https', async (request) => {
    requireAdmin(request);
    return gateway.status();
  });

  app.put('/api/https', { schema: { body: httpsSchema } }, async (request) => {
    requireAdmin(request);
    return request.body.enabled ? gateway.enable(actorOf(request)) : gateway.disable(actorOf(request));
  });

  // Caddy asks here before it fetches a certificate for a name (no login: it only answers yes or no).
  app.get(
    '/api/tls/allowed',
    { schema: { querystring: z.object({ domain: z.string().max(HOST_MAX) }) } },
    async (request, reply) =>
      gateway.allowed(request.query.domain) ? { ok: true } : reply.code(HTTP_NOT_FOUND).send({ ok: false }),
  );
}
