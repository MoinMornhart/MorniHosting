import { expect, type APIRequestContext, type Page } from '@playwright/test';

export interface CreatedServer {
  readonly id: string;
  readonly name: string;
}

/** CSRF token of the stored login, for API calls that change things. */
export async function csrf(api: APIRequestContext): Promise<Record<string, string>> {
  const me = (await (await api.get('/api/auth/me')).json()) as { csrfToken: string };
  return { 'x-csrf-token': me.csrfToken };
}

const MEMORY_MB = 2048;
const STATE_TIMEOUT_MS = 20_000;
const FIRST_PORT = 25600;
/** Each test server gets its own port. */
let nextPort = FIRST_PORT;

/** A Paper server made through the API, for flows that are not about creating servers. */
export async function createServer(
  api: APIRequestContext,
  name: string,
  startNow = true,
): Promise<CreatedServer> {
  nextPort += 1;
  const res = await api.post('/api/servers', {
    headers: await csrf(api),
    data: {
      name,
      edition: 'java',
      software: 'paper',
      version: '1.21.4',
      memoryMb: MEMORY_MB,
      port: nextPort,
      eula: true,
      startNow,
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as CreatedServer;
}

export async function waitForState(page: Page, label: string): Promise<void> {
  await expect(page.locator('h1').getByText(label)).toBeVisible({ timeout: STATE_TIMEOUT_MS });
}
