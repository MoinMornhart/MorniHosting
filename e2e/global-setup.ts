import { request, type FullConfig } from '@playwright/test';

/** Creates the administrator once and stores the login for all tests. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? '';
  const api = await request.newContext({ baseURL });
  const res = await api.post('/api/setup', {
    data: { username: 'philip', password: 'supersecret123', locale: 'de' },
  });
  if (!res.ok()) throw new Error(`setup failed: ${res.status()} ${await res.text()}`);
  await api.storageState({ path: 'e2e/.auth.json' });
  await api.dispose();
}
