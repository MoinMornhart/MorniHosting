import { minecraftLinkSchema } from '@mornihosting/shared';
import { actorOf, requireAuth, toUserInfo } from '../auth/context.js';
import type { Api } from '../context.js';
import type { MinecraftLinkService } from './service.js';

/** The signed-in user's own Minecraft account. */
export function registerMinecraftRoutes(app: Api, link: MinecraftLinkService): void {
  app.put('/api/account/minecraft', { schema: { body: minecraftLinkSchema } }, async (request) => {
    const { user } = requireAuth(request);
    return { user: toUserInfo(await link.link(user, request.body.name, actorOf(request))) };
  });

  app.delete('/api/account/minecraft', async (request) => {
    const { user } = requireAuth(request);
    return { user: toUserInfo(await link.unlink(user, actorOf(request))) };
  });
}
