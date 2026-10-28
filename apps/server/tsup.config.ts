import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Shared types and schemas are bundled; runtime packages stay in node_modules.
  noExternal: ['@mornihosting/shared'],
  banner: {
    js: "import { createRequire as __mhCreateRequire } from 'node:module'; const require = __mhCreateRequire(import.meta.url);",
  },
});
