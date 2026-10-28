/* eslint-disable ts-patterns/no-magic-numbers -- tests use literal waits, ports and example values */
import { expect, test } from '@playwright/test';
import { createServer, csrf } from './helpers';

test('make a backup, break a file, restore the backup', async ({ page, request }) => {
  const server = await createServer(request, 'E2E Backups');
  const file = `/api/servers/${server.id}/files/content?path=server.properties`;
  await expect.poll(async () => (await request.get(file)).status(), { timeout: 20_000 }).toBe(200);
  const original = ((await (await request.get(file)).json()) as { content: string }).content;

  await page.goto(`/servers/${server.id}/backups`);
  await page.getByRole('button', { name: 'Backup jetzt erstellen' }).first().click();
  await expect(page.getByRole('button', { name: 'Wiederherstellen' })).toBeVisible({ timeout: 20_000 });

  const broken = await request.put(`/api/servers/${server.id}/files/content`, {
    headers: await csrf(request),
    data: { path: 'server.properties', content: 'kaputt=1\n' },
  });
  expect(broken.ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Wiederherstellen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.getByText('ist wiederhergestellt')).toBeVisible({ timeout: 30_000 });
  const restored = ((await (await request.get(file)).json()) as { content: string }).content;
  expect(restored).toBe(original);
  await expect(page.getByText('Vor Wiederherstellung')).toBeVisible();
});
