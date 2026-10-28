import { z } from 'zod';
import {
  netbirdConfigSchema,
  netbirdDiscoverSchema,
  netbirdPanelSchema,
  netbirdServerSchema,
} from '@mornihosting/shared';
import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api } from '../context.js';
import type { NetbirdAutomation } from './service.js';

/** NetBird automation (admins only): it acts with the admin's NetBird token, so nobody else may use it. */
export function registerNetbirdRoutes(app: Api, netbird: NetbirdAutomation): void {
  app.get('/api/netbird', async (request) => {
    requireAdmin(request);
    return netbird.status();
  });

  app.post('/api/netbird/discover', { schema: { body: netbirdDiscoverSchema } }, async (request) => {
    requireAdmin(request);
    return netbird.discover(request.body);
  });

  app.put('/api/netbird', { schema: { body: netbirdConfigSchema } }, async (request) => {
    requireAdmin(request);
    return netbird.configure(request.body, actorOf(request));
  });

  app.delete('/api/netbird', async (request) => {
    requireAdmin(request);
    return netbird.disconnect(actorOf(request));
  });

  app.post('/api/netbird/panel', { schema: { body: netbirdPanelSchema } }, async (request) => {
    requireAdmin(request);
    return netbird.setupPanel(request.body, actorOf(request));
  });

  app.put(
    '/api/servers/:id/netbird',
    { schema: { params: z.object({ id: z.string().min(1) }), body: netbirdServerSchema } },
    async (request) => {
      requireAdmin(request);
      return { netbird: await netbird.setServerName(request.params.id, request.body.name, actorOf(request)) };
    },
  );
}
