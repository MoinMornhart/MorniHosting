import fs from 'node:fs';
import path from 'node:path';
import { GAME_ART_IDS, GAME_ART_SOURCES } from '@mornihosting/shared';
import { z } from 'zod';
import type { Api, AppContext } from '../context.js';
import { notFound } from '../lib/errors.js';
import { fetchResponse } from '../lib/http-client.js';
import { BYTES_PER_MB } from '../lib/units.js';

/**
 * The panel fetches each game card picture once and keeps it in its data folder; nothing is copied into the
 * repository. If a picture cannot be fetched, the web app shows its drawn scene instead.
 */
const SOURCES = GAME_ART_SOURCES;
const MAX_MB = 4;
const MAX_BYTES = MAX_MB * BYTES_PER_MB;
const CACHE_SECONDS = 86400;
const IMAGE_TYPE = 'image/';
const params = z.object({ game: z.enum(GAME_ART_IDS) });

export function registerGameArtRoutes(app: Api, ctx: AppContext): void {
  const dir = path.join(ctx.config.dataDir, 'game-art');
  const pending = new Map<string, Promise<{ file: string; type: string } | null>>();

  const fetchOnce = async (game: keyof typeof SOURCES): Promise<{ file: string; type: string } | null> => {
    const file = path.join(dir, game);
    const typeFile = `${file}.type`;
    if (fs.existsSync(file) && fs.existsSync(typeFile))
      return { file, type: fs.readFileSync(typeFile, 'utf8') };
    try {
      const response = await fetchResponse(SOURCES[game], { headers: { accept: 'image/*' } });
      const type = response.headers.get('content-type') ?? '';
      const data = Buffer.from(await response.arrayBuffer());
      if (!type.startsWith(IMAGE_TYPE) || data.length > MAX_BYTES) return null;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, data);
      fs.writeFileSync(typeFile, type);
      return { file, type };
    } catch (err) {
      ctx.log.warn({ err, game }, 'game picture could not be fetched');
      return null;
    }
  };

  // Public: the start page shows the cards before anyone has signed in.
  app.get('/api/game-art/:game', { schema: { params } }, async (request, reply) => {
    const { game } = request.params;
    const running = pending.get(game) ?? fetchOnce(game);
    pending.set(game, running);
    const found = await running;
    pending.delete(game);
    if (!found) throw notFound('no_game_art');
    return reply
      .header('content-type', found.type)
      .header('cache-control', `public, max-age=${CACHE_SECONDS}`)
      .send(fs.createReadStream(found.file));
  });
}
