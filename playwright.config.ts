import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the main flows, against the real panel with the simulated Docker driver
 * (no real Minecraft server needed). Run `pnpm build` first, then `pnpm test:e2e`.
 */

const PORT = 8199;
const START_TIMEOUT_MS = 60_000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'de-DE',
    storageState: 'e2e/.auth.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // In some sandboxes the browser lives in a fixed place; elsewhere Playwright finds its own.
        launchOptions: process.env['PW_CHROMIUM_PATH']
          ? { executablePath: process.env['PW_CHROMIUM_PATH'] }
          : {},
      },
    },
  ],
  webServer: {
    command: 'rm -rf e2e/.data && node apps/server/dist/index.js',
    url: `${BASE_URL}/api/system/status`,
    reuseExistingServer: false,
    timeout: START_TIMEOUT_MS,
    env: {
      MH_PORT: String(PORT),
      MH_HOST: '127.0.0.1',
      MH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0001',
      MH_DATA_DIR: 'e2e/.data',
      MH_WEB_DIR: 'apps/web/dist',
      MH_DOCKER_DRIVER: 'fake',
      MH_FAKE_STEP_MS: '40',
      MH_LOG_LEVEL: 'warn',
    },
  },
});
