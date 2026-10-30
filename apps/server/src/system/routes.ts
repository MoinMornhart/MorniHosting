import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api } from '../context.js';
import type { UpdateService } from './update.js';

const CHECKS_PER_MINUTE = 3;

export function registerSystemRoutes(app: Api, updates: UpdateService): void {
  app.get('/api/system/update', async (request) => {
    requireAdmin(request);
    return updates.info();
  });

  // GitHub answers 60 questions an hour without a key; a few checks by hand are plenty.
  app.post(
    '/api/system/update/check',
    { config: { rateLimit: { max: CHECKS_PER_MINUTE, timeWindow: '1 minute' } } },
    async (request) => {
      requireAdmin(request);
      return updates.check();
    },
  );

  app.post('/api/system/update', async (request) => {
    requireAdmin(request);
    return updates.request(actorOf(request));
  });
}
