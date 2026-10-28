import fs from 'node:fs';
import { z } from 'zod';
import { backupSettingsSchema } from '@mornihosting/shared';
import { actorOf, requireAuth } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';
import { HTTP_ACCEPTED, HTTP_NO_CONTENT } from '../lib/http-status.js';
import type { ServerService } from '../servers/service.js';
import type { BackupService } from './service.js';

const idParams = z.object({ id: z.string().min(1) });
const backupParams = idParams.extend({ backupId: z.coerce.number().int().positive() });

export function registerBackupRoutes(
  app: Api,
  ctx: AppContext,
  servers: ServerService,
  backups: BackupService,
): void {
  const allow = (request: Parameters<typeof requireAuth>[0], serverId: string): void => {
    ctx.access.assert(requireAuth(request).user, serverId, 'backups');
    servers.row(serverId);
  };

  app.get('/api/servers/:id/backups', { schema: { params: idParams } }, async (request) => {
    allow(request, request.params.id);
    const disk = fs.statfsSync(ctx.config.dataDir);
    return {
      backups: backups.list(request.params.id),
      settings: backups.settings(request.params.id),
      totalBytes: backups.totalBytes(request.params.id),
      freeBytes: disk.bavail * disk.bsize,
    };
  });

  app.post('/api/servers/:id/backups', { schema: { params: idParams } }, async (request, reply) => {
    allow(request, request.params.id);
    return reply.code(HTTP_ACCEPTED).send(backups.start(request.params.id, 'manual', actorOf(request)));
  });

  app.put(
    '/api/servers/:id/backups/settings',
    { schema: { params: idParams, body: backupSettingsSchema } },
    async (request) => {
      allow(request, request.params.id);
      return backups.updateSettings(request.params.id, request.body, actorOf(request));
    },
  );

  app.post(
    '/api/servers/:id/backups/:backupId/restore',
    { schema: { params: backupParams } },
    async (request, reply) => {
      allow(request, request.params.id);
      await backups.restore(request.params.id, request.params.backupId, actorOf(request));
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.delete(
    '/api/servers/:id/backups/:backupId',
    { schema: { params: backupParams } },
    async (request, reply) => {
      allow(request, request.params.id);
      backups.remove(request.params.id, request.params.backupId, actorOf(request));
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.get(
    '/api/servers/:id/backups/:backupId/download',
    { schema: { params: backupParams } },
    async (request, reply) => {
      allow(request, request.params.id);
      const file = backups.file(request.params.id, request.params.backupId);
      return reply
        .header('content-disposition', `attachment; filename="${file.name}"`)
        .header('content-length', fs.statSync(file.path).size)
        .type('application/zip')
        .send(fs.createReadStream(file.path));
    },
  );
}
