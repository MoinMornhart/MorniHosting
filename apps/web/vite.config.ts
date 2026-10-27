import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The app ships as one bundle with the console and editor split off; warn only for real outliers. */
const CHUNK_WARNING_KB = 1500;
const BACKEND = process.env['MH_DEV_BACKEND'] ?? 'http://localhost:8099';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    proxy: {
      '/api': { target: BACKEND, ws: true, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: CHUNK_WARNING_KB,
  },
});
