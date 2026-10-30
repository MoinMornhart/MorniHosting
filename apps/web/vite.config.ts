import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { GAME_ART_SOURCES, PROJECT_LOGOS } from '../../packages/shared/src/branding';

/** The app ships as one bundle with the console and editor split off; warn only for real outliers. */
const CHUNK_WARNING_KB = 1500;
const BACKEND = process.env['MH_DEV_BACKEND'] ?? 'http://localhost:8099';
/** The demo is one self-contained file: fonts and images go inline. */
const DEMO_INLINE_BYTES = 50_000_000;
const src = path.resolve(import.meta.dirname, 'src');
const DEMO_IMAGES = 'virtual:demo-images';
const RESOLVED_DEMO_IMAGES = `\0${DEMO_IMAGES}`;

/** Downloads one picture as a data: URI, or nothing if it cannot be fetched (the drawn fallback shows then). */
async function embed(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { headers: { accept: 'image/*' } });
    if (!response.ok) return undefined;
    const type = response.headers.get('content-type') ?? 'image/png';
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  } catch {
    return undefined;
  }
}

async function embedAll(sources: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    Object.entries(sources).map(async ([key, url]) => [key, await embed(url)] as const),
  );
  return Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair[1] !== undefined));
}

/**
 * The demo is one sealed file that cannot load pictures from other sites, so its build embeds the project logos
 * and game card pictures (fetched at build time, never stored in the repository). Outside the demo it is empty.
 */
function demoImages(demo: boolean): Plugin {
  return {
    name: 'mornihosting-demo-images',
    resolveId: (id) => (id === DEMO_IMAGES ? RESOLVED_DEMO_IMAGES : undefined),
    load: async (id) => {
      if (id !== RESOLVED_DEMO_IMAGES) return undefined;
      const images = demo
        ? { logos: await embedAll(PROJECT_LOGOS), gameArt: await embedAll(GAME_ART_SOURCES) }
        : { logos: {}, gameArt: {} };
      return `export default ${JSON.stringify(images)};`;
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react(), tailwindcss(), demoImages(demo)],
    base: demo ? './' : '/',
    resolve: {
      alias: [
        // "@/lib/api" → src/lib/api; "@simplewebauthn/browser" does not match.
        // https://regex101.com/?flavor=javascript&regex=%5E%40%5C%2F&testString=%40%2Flib%2Fapi%0A%40simplewebauthn%2Fbrowser
        { find: /^@\//, replacement: `${src}/` },
        // The demo's sealed frame refuses real passkeys; a marked pretend dialog stands in.
        ...(demo
          ? [
              { find: '@simplewebauthn/browser', replacement: path.join(src, 'demo/webauthn-shim.ts') },
              // The demo's stylesheet gives the panel's colours priority over the Claude app's own.
              // "./styles/globals.css" matches; "./styles/panel.css" does not.
              // https://regex101.com/?flavor=javascript&regex=%5E%5C.%5C%2Fstyles%5C%2Fglobals%5C.css%24&testString=.%2Fstyles%2Fglobals.css%0A.%2Fstyles%2Fpanel.css
              { find: /^\.\/styles\/globals\.css$/, replacement: path.join(src, 'styles/demo.css') },
            ]
          : []),
      ],
    },
    server: {
      proxy: {
        '/api': { target: BACKEND, ws: true, changeOrigin: false },
      },
    },
    build: demo
      ? {
          outDir: 'dist-demo',
          sourcemap: false,
          assetsInlineLimit: DEMO_INLINE_BYTES,
          cssCodeSplit: false,
          chunkSizeWarningLimit: DEMO_INLINE_BYTES,
          rollupOptions: {
            input: path.resolve(import.meta.dirname, 'demo.html'),
            output: { inlineDynamicImports: true },
          },
        }
      : {
          outDir: 'dist',
          sourcemap: false,
          chunkSizeWarningLimit: CHUNK_WARNING_KB,
        },
  };
});
