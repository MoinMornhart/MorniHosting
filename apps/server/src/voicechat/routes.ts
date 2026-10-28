import { z } from 'zod';
import { voiceChatInputSchema } from '@mornihosting/shared';
import { actorOf, requireAuth } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';
import type { VoiceChatService } from './service.js';

export function registerVoiceChatRoutes(app: Api, ctx: AppContext, voiceChat: VoiceChatService): void {
  app.put(
    '/api/servers/:id/voicechat',
    { schema: { params: z.object({ id: z.string().min(1) }), body: voiceChatInputSchema } },
    async (request) => {
      const user = requireAuth(request).user;
      ctx.access.assert(user, request.params.id, 'config');
      ctx.access.assert(user, request.params.id, 'plugins');
      return voiceChat.set(request.params.id, request.body, actorOf(request));
    },
  );
}
