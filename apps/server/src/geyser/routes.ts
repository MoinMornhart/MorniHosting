import { z } from 'zod';
import { actorOf, requireAuth } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';
import type { GeyserService } from './service.js';

export function registerGeyserRoutes(app: Api, ctx: AppContext, geyser: GeyserService): void {
  app.put(
    '/api/servers/:id/geyser',
    { schema: { params: z.object({ id: z.string().min(1) }), body: z.object({ enabled: z.boolean() }) } },
    async (request) => {
      const user = requireAuth(request).user;
      ctx.access.assert(user, request.params.id, 'config');
      ctx.access.assert(user, request.params.id, 'plugins');
      return geyser.set(request.params.id, request.body.enabled, actorOf(request));
    },
  );
}
