import { defineConfig } from 'vitest/config';

const TIMEOUT_MS = 20000;

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: TIMEOUT_MS,
    hookTimeout: TIMEOUT_MS,
  },
});
