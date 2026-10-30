import { ddosUpdateSchema } from '@mornihosting/shared';
import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api } from '../context.js';
import type { DdosService } from './service.js';

/** DDoS protection (admins only): the switch for the host firewall and Minecraft's spam limit. */
export function registerDdosRoutes(app: Api, ddos: DdosService): void {
  app.get('/api/ddos', async (request) => {
    requireAdmin(request);
    return ddos.status();
  });

  app.put('/api/ddos', { schema: { body: ddosUpdateSchema } }, async (request) => {
    requireAdmin(request);
    return ddos.update(request.body, actorOf(request));
  });
}
