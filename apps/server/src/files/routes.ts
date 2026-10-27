import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import {
  mkdirSchema,
  pathsSchema,
  playerActionSchema,
  relPathSchema,
  renameSchema,
  resetWorldSchema,
  switchWorldSchema,
  unzipSchema,
  writeFileSchema,
  zipSchema,
  type FileEntry,
  type ServerPermission,
} from '@mornihosting/shared';
import { actorOf, requireAuth } from '../auth/context.js';
import type { Api, AppContext } from '../context.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { HTTP_NO_CONTENT, HTTP_PAYLOAD_TOO_LARGE } from '../lib/http-status.js';
import { createPlayerService } from '../servers/players.js';
import { readPropertiesFile, validateUpdates, writePropertiesFile } from '../servers/properties-file.js';
import type { ServerService } from '../servers/service.js';
import { createWorldService } from '../servers/worlds.js';
import { BYTES_PER_KB } from '../lib/units.js';
import { UNPACK_FACTOR, type FileService } from './service.js';

const idParams = z.object({ id: z.string().min(1) });
const pathQuery = z.object({ path: relPathSchema.default('') });
const ICON_SIZE = 64;
const ICON_MAX_KB = 256;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // eslint-disable-line ts-patterns/no-magic-numbers -- the PNG magic bytes
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_HEADER_BYTES = 24;
const ZIP_LEVEL = 6;

/** Reads every uploaded file of a multipart request one after another (a recursive walk instead of a loop). */
async function eachFile(
  iterator: AsyncIterator<MultipartFile>,
  handle: (file: MultipartFile) => Promise<FileEntry>,
  done: readonly FileEntry[] = [],
): Promise<FileEntry[]> {
  const next = await iterator.next();
  if (next.done) return [...done];
  return eachFile(iterator, handle, [...done, await handle(next.value)]);
}

export function registerFileRoutes(
  app: Api,
  ctx: AppContext,
  servers: ServerService,
  files: FileService,
): void {
  const players = createPlayerService(servers, ctx.audit);
  const worlds = createWorldService(servers, files, ctx.audit);
  const allow = (
    request: Parameters<typeof requireAuth>[0],
    serverId: string,
    permission: ServerPermission,
  ): void => {
    ctx.access.assert(requireAuth(request).user, serverId, permission);
    servers.row(serverId);
  };

  /* ---------- Files ---------- */

  app.get(
    '/api/servers/:id/files',
    { schema: { params: idParams, querystring: pathQuery } },
    async (request) => {
      allow(request, request.params.id, 'files');
      return files.list(request.params.id, request.query.path);
    },
  );

  app.get(
    '/api/servers/:id/files/content',
    { schema: { params: idParams, querystring: pathQuery } },
    async (request) => {
      allow(request, request.params.id, 'files');
      return files.read(request.params.id, request.query.path);
    },
  );

  app.put(
    '/api/servers/:id/files/content',
    { schema: { params: idParams, body: writeFileSchema } },
    async (request, reply) => {
      allow(request, request.params.id, 'files');
      files.write(request.params.id, request.body.path, request.body.content);
      ctx.audit.record(actorOf(request), 'file.write', request.params.id, { path: request.body.path });
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.post(
    '/api/servers/:id/files/upload',
    { schema: { params: idParams, querystring: pathQuery } },
    async (request) => {
      allow(request, request.params.id, 'files');
      const uploaded = await eachFile(request.files()[Symbol.asyncIterator](), (file) =>
        files.upload(request.params.id, request.query.path, file.filename, file.file),
      );
      ctx.audit.record(actorOf(request), 'file.upload', request.params.id, {
        path: request.query.path,
        files: uploaded.map((f) => f.name),
      });
      return uploaded;
    },
  );

  app.post(
    '/api/servers/:id/files/mkdir',
    { schema: { params: idParams, body: mkdirSchema } },
    async (request, reply) => {
      allow(request, request.params.id, 'files');
      files.mkdir(request.params.id, request.body.path);
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.post(
    '/api/servers/:id/files/rename',
    { schema: { params: idParams, body: renameSchema } },
    async (request, reply) => {
      allow(request, request.params.id, 'files');
      files.rename(request.params.id, request.body.from, request.body.to);
      ctx.audit.record(actorOf(request), 'file.rename', request.params.id, { ...request.body });
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.post(
    '/api/servers/:id/files/delete',
    { schema: { params: idParams, body: pathsSchema } },
    async (request) => {
      allow(request, request.params.id, 'files');
      const moved = files.remove(request.params.id, request.body.paths);
      ctx.audit.record(actorOf(request), 'file.delete', request.params.id, { paths: request.body.paths });
      return { moved };
    },
  );

  app.post(
    '/api/servers/:id/files/zip',
    { schema: { params: idParams, body: zipSchema } },
    async (request) => {
      allow(request, request.params.id, 'files');
      return files.zip(request.params.id, request.body.paths, request.body.name);
    },
  );

  app.post(
    '/api/servers/:id/files/unzip',
    { schema: { params: idParams, body: unzipSchema } },
    async (request) => {
      allow(request, request.params.id, 'files');
      const count = await files.unzip(request.params.id, request.body.path, request.body.destination);
      ctx.audit.record(actorOf(request), 'file.unzip', request.params.id, { ...request.body });
      return { files: count };
    },
  );

  app.get(
    '/api/servers/:id/files/download',
    { schema: { params: idParams, querystring: pathQuery } },
    async (request, reply) => {
      allow(request, request.params.id, 'files');
      const target = files.absolute(request.params.id, request.query.path);
      if (!fs.existsSync(target)) throw notFound();
      const name = path.basename(target) || 'server';
      if (fs.statSync(target).isFile()) {
        return reply
          .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
          .type('application/octet-stream')
          .send(fs.createReadStream(target));
      }
      const archive = archiver('zip', { zlib: { level: ZIP_LEVEL } });
      archive.directory(target, false);
      void archive.finalize();
      return reply
        .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`)
        .type('application/zip')
        .send(archive);
    },
  );

  app.get('/api/servers/:id/trash', { schema: { params: idParams } }, async (request) => {
    allow(request, request.params.id, 'files');
    return files.trash(request.params.id);
  });

  app.post(
    '/api/servers/:id/trash/:trashId/restore',
    { schema: { params: z.object({ id: z.string(), trashId: z.string() }) } },
    async (request, reply) => {
      allow(request, request.params.id, 'files');
      files.restore(request.params.id, request.params.trashId);
      ctx.audit.record(actorOf(request), 'file.restore', request.params.id, {
        trashId: request.params.trashId,
      });
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.delete(
    '/api/servers/:id/trash/:trashId',
    { schema: { params: z.object({ id: z.string(), trashId: z.string() }) } },
    async (request, reply) => {
      allow(request, request.params.id, 'files');
      files.purge(request.params.id, request.params.trashId);
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.delete('/api/servers/:id/trash', { schema: { params: idParams } }, async (request, reply) => {
    allow(request, request.params.id, 'files');
    files.purge(request.params.id, null);
    ctx.audit.record(actorOf(request), 'file.trash_emptied', request.params.id);
    return reply.code(HTTP_NO_CONTENT).send();
  });

  /* ---------- server.properties ---------- */

  app.get('/api/servers/:id/properties', { schema: { params: idParams } }, async (request) => {
    allow(request, request.params.id, 'config');
    return {
      values: readPropertiesFile(servers.dir(request.params.id)).values,
      running: servers.isRunning(request.params.id),
    };
  });

  app.put(
    '/api/servers/:id/properties',
    { schema: { params: idParams, body: z.object({ values: z.record(z.string(), z.string()) }) } },
    async (request) => {
      allow(request, request.params.id, 'config');
      validateUpdates(servers.row(request.params.id).edition, request.body.values);
      const values = writePropertiesFile(servers.dir(request.params.id), request.body.values);
      ctx.audit.record(actorOf(request), 'properties.update', request.params.id, {
        keys: Object.keys(request.body.values),
      });
      return { values, restartRequired: servers.isRunning(request.params.id) };
    },
  );

  /* ---------- Players ---------- */

  app.get('/api/servers/:id/players', { schema: { params: idParams } }, async (request) => {
    allow(request, request.params.id, 'players');
    return players.overview(request.params.id);
  });

  app.post(
    '/api/servers/:id/players/action',
    { schema: { params: idParams, body: playerActionSchema } },
    async (request, reply) => {
      allow(request, request.params.id, 'players');
      await players.act(
        request.params.id,
        request.body.action,
        request.body.name,
        request.body.reason ?? '',
        actorOf(request),
      );
      return reply.code(HTTP_NO_CONTENT).send();
    },
  );

  app.put(
    '/api/servers/:id/players/whitelist',
    { schema: { params: idParams, body: z.object({ enabled: z.boolean() }) } },
    async (request) => {
      allow(request, request.params.id, 'players');
      const id = request.params.id;
      const bedrock = servers.row(id).edition === 'bedrock';
      const key = bedrock ? 'allow-list' : 'white-list';
      writePropertiesFile(servers.dir(id), {
        [key]: String(request.body.enabled),
        ...(bedrock ? {} : { 'enforce-whitelist': String(request.body.enabled) }),
      });
      if (servers.isRunning(id)) {
        const word = bedrock ? 'allowlist' : 'whitelist';
        await servers.command(id, `${word} ${request.body.enabled ? 'on' : 'off'}`, null);
      }
      ctx.audit.record(actorOf(request), request.body.enabled ? 'whitelist.on' : 'whitelist.off', id);
      return players.overview(id);
    },
  );

  /* ---------- Worlds ---------- */

  app.get('/api/servers/:id/worlds', { schema: { params: idParams } }, async (request) => {
    allow(request, request.params.id, 'config');
    return worlds.list(request.params.id);
  });

  app.post('/api/servers/:id/worlds/upload', { schema: { params: idParams } }, async (request) => {
    allow(request, request.params.id, 'config');
    const file = await request.file();
    if (!file) throw badRequest('upload_failed');
    return worlds.upload(
      request.params.id,
      file.filename,
      file.file,
      ctx.config.maxUploadBytes * UNPACK_FACTOR,
      actorOf(request),
    );
  });

  app.post(
    '/api/servers/:id/worlds/activate',
    { schema: { params: idParams, body: switchWorldSchema } },
    async (request) => {
      allow(request, request.params.id, 'config');
      worlds.activate(request.params.id, request.body.name, actorOf(request));
      return worlds.list(request.params.id);
    },
  );

  app.post(
    '/api/servers/:id/worlds/reset',
    { schema: { params: idParams, body: resetWorldSchema } },
    async (request) => {
      allow(request, request.params.id, 'config');
      await worlds.reset(request.params.id, request.body.seed, actorOf(request));
      return worlds.list(request.params.id);
    },
  );

  /* ---------- Server icon ---------- */

  app.post('/api/servers/:id/icon', { schema: { params: idParams } }, async (request, reply) => {
    allow(request, request.params.id, 'config');
    const file = await request.file({ limits: { fileSize: ICON_MAX_KB * BYTES_PER_KB } });
    if (!file) throw badRequest('upload_failed');
    const buffer = await file.toBuffer();
    const isPng =
      buffer.length >= PNG_HEADER_BYTES && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
    if (!isPng) throw badRequest('icon_not_png');
    if (
      buffer.readUInt32BE(PNG_WIDTH_OFFSET) !== ICON_SIZE ||
      buffer.readUInt32BE(PNG_HEIGHT_OFFSET) !== ICON_SIZE
    ) {
      throw new AppError(HTTP_PAYLOAD_TOO_LARGE, 'icon_wrong_size');
    }
    fs.writeFileSync(path.join(servers.dir(request.params.id), 'server-icon.png'), buffer);
    ctx.audit.record(actorOf(request), 'server.icon', request.params.id);
    return reply.code(HTTP_NO_CONTENT).send();
  });

  app.delete('/api/servers/:id/icon', { schema: { params: idParams } }, async (request, reply) => {
    allow(request, request.params.id, 'config');
    fs.rmSync(path.join(servers.dir(request.params.id), 'server-icon.png'), { force: true });
    return reply.code(HTTP_NO_CONTENT).send();
  });
}
