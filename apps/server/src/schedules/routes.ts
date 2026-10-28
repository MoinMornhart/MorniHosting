import { z } from 'zod';
import { scheduleInputSchema } from '@mornihosting/shared';
import { actorOf, requireAuth } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';
import { HTTP_NO_CONTENT } from '../lib/http-status.js';
import type { ServerService } from '../servers/service.js';
import type { ScheduleService } from './service.js';

const idParams = z.object({ id: z.string().min(1) });
const scheduleParams = idParams.extend({ scheduleId: z.coerce.number().int().positive() });

export function registerScheduleRoutes(
  app: Api,
  ctx: AppContext,
  servers: ServerService,
  schedules: ScheduleService,
): void {
  const allow = (request: Parameters<typeof requireAuth>[0], serverId: string): void => {
    ctx.access.assert(requireAuth(request).user, serverId, 'schedules');
    servers.row(serverId);
  };

  app.get('/api/servers/:id/schedules', { schema: { params: idParams } }, async (request) => {
    allow(request, request.params.id);
    return schedules.list(request.params.id);
  });

  app.post(
    '/api/servers/:id/schedules',
    { schema: { params: idParams, body: scheduleInputSchema } },
    async (request) => {
      allow(request, request.params.id);
      return schedules.create(request.params.id, request.body, actorOf(request));
    },
  );

  app.put(
    '/api/servers/:id/schedules/:scheduleId',
    { schema: { params: scheduleParams, body: scheduleInputSchema } },
    async (request) => {
      allow(request, request.params.id);
      return schedules.update(request.params.id, request.params.scheduleId, request.body, actorOf(request));
    },
  );

  app.patch(
    '/api/servers/:id/schedules/:scheduleId',
    { schema: { params: scheduleParams, body: z.object({ enabled: z.boolean() }) } },
    async (request) => {
      allow(request, request.params.id);
      return schedules.setEnabled(
        request.params.id,
        request.params.scheduleId,
        request.body.enabled,
        actorOf(request),
      );
    },
  );

  app.delete(
    '/api/servers/:id/schedules/:scheduleId',
    { schema: { params: scheduleParams } },
    async (request, reply) => {
      allow(request, request.params.id);
      schedules.remove(request.params.id, request.params.scheduleId, actorOf(request));
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.post(
    '/api/servers/:id/schedules/:scheduleId/run',
    { schema: { params: scheduleParams } },
    async (request) => {
      allow(request, request.params.id);
      return schedules.runNow(request.params.id, request.params.scheduleId, actorOf(request));
    },
  );
}
