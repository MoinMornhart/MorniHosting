import { settingsUpdateSchema } from '@mornihosting/shared';
import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';

/** Panel-wide settings (admins only). Secrets such as the CurseForge key never leave the server. */
export function registerSettingsRoutes(app: Api, ctx: AppContext): void {
  app.get('/api/settings', async (request) => {
    requireAdmin(request);
    return ctx.settings.publicView();
  });

  app.put('/api/settings', { schema: { body: settingsUpdateSchema } }, async (request) => {
    requireAdmin(request);
    ctx.settings.update(request.body);
    ctx.audit.record(actorOf(request), 'settings.update', null, {
      changed: Object.keys(request.body).filter(
        (k) => request.body[k as keyof typeof request.body] !== undefined,
      ),
    });
    return ctx.settings.publicView();
  });
}
