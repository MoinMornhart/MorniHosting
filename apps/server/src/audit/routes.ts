import { z } from 'zod';
import { requireAdmin, requireAuth } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';

const PAGE_MAX = 200;
const PAGE_DEFAULT = 50;

const auditQuery = z.object({
  serverId: z.string().min(1).optional(),
  userId: z.coerce.number().int().positive().optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
});

/** Who did what and when: the whole panel for admins, one server for anyone allowed to read its logs. */
export function registerAuditRoutes(app: Api, ctx: AppContext): void {
  app.get('/api/audit', { schema: { querystring: auditQuery } }, async (request) => {
    requireAdmin(request);
    return ctx.audit.list(request.query);
  });

  app.get(
    '/api/servers/:id/audit',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: auditQuery.omit({ serverId: true, userId: true }),
      },
    },
    async (request) => {
      ctx.access.assert(requireAuth(request).user, request.params.id, 'logs');
      return ctx.audit.list({ ...request.query, serverId: request.params.id });
    },
  );
}
