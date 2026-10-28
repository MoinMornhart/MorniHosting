import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api } from '../context.js';
import type { UpdateService } from './update.js';

export function registerSystemRoutes(app: Api, updates: UpdateService): void {
  app.get('/api/system/update', async (request) => {
    requireAdmin(request);
    return updates.info();
  });

  app.post('/api/system/update', async (request) => {
    requireAdmin(request);
    return updates.request(actorOf(request));
  });
}
