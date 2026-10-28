import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The app ships as one bundle with the console and editor split off; warn only for real outliers. */
const CHUNK_WARNING_KB = 1500;
const BACKEND = process.env['MH_DEV_BACKEND'] ?? 'http://localhost:8099';
/** The demo is one self-contained file: fonts and images go inline. */
const DEMO_INLINE_BYTES = 50_000_000;
const src = path.resolve(import.meta.dirname, 'src');

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react(), tailwindcss()],
    base: demo ? './' : '/',
    resolve: {
      alias: [
        // "@/lib/api" → src/lib/api; "@simplewebauthn/browser" does not match.
        // https://regex101.com/?flavor=javascript&regex=%5E%40%5C%2F&testString=%40%2Flib%2Fapi%0A%40simplewebauthn%2Fbrowser
        { find: /^@\//, replacement: `${src}/` },
        // The demo's sealed frame refuses real passkeys; a marked pretend dialog stands in.
        ...(demo
          ? [{ find: '@simplewebauthn/browser', replacement: path.join(src, 'demo/webauthn-shim.ts') }]
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
