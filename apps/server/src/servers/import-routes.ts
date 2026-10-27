import fs from 'node:fs';
import path from 'node:path';
import { SOFTWARE, importConfirmSchema, type ImportDetectionResult } from '@mornihosting/shared';
import { actorOf, requireAuth } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { serverDir } from './spec.js';
import { stageImport, stagingDir } from './import.js';
import type { ServerService } from './service.js';

/** Two steps: upload the ZIP (we unpack and look inside), then confirm name, version and port. */
export function registerImportRoutes(app: Api, ctx: AppContext, servers: ServerService): void {
  const assertCanCreate = (request: Parameters<typeof requireAuth>[0]): ReturnType<typeof requireAuth> => {
    const auth = requireAuth(request);
    if (!auth.user.isAdmin && !auth.user.canCreateServers) throw forbidden('cannot_create_servers');
    return auth;
  };

  app.post('/api/servers/import/upload', async (request): Promise<ImportDetectionResult> => {
    assertCanCreate(request);
    const file = await request.file();
    if (!file) throw badRequest('upload_failed');
    return stageImport(ctx.config.dataDir, file.file, ctx.config.maxUploadBytes * 2); // eslint-disable-line ts-patterns/no-magic-numbers -- unpacked worlds may be twice the ZIP size
  });

  app.post('/api/servers/import/confirm', { schema: { body: importConfirmSchema } }, async (request) => {
    const auth = assertCanCreate(request);
    const input = request.body;
    const source = stagingDir(ctx.config.dataDir, input.stagingId);
    const id = servers.newId();
    const summary = servers.createFromImport(
      {
        id,
        name: input.name,
        edition: SOFTWARE[input.software].edition,
        software: input.software,
        version: input.version,
        memoryMb: input.memoryMb,
        port: input.port,
        autoStart: true,
      },
      actorOf(request),
      auth.user,
    );
    const target = serverDir(ctx.config, id);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    if (input.startNow) await servers.start(id, actorOf(request));
    return summary;
  });
}
