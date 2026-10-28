/* eslint-disable ts-patterns/no-magic-numbers -- tests use literal waits, ports and example values */
import { expect, test } from '@playwright/test';
import { createServer } from './helpers';

test('install a plugin from the marketplace and add an own .jar', async ({ page, request }) => {
  const server = await createServer(request, 'E2E Plugins', false);
  const installed: { name: string }[] = [];
  // The marketplaces are outside our control; the panel API answers are replaced for the UI flow.
  await page.route('**/market/search?*', (route) =>
    route.fulfill({
      json: {
        total: 1,
        pageSize: 20,
        hits: [
          {
            source: 'modrinth',
            id: 'luck',
            name: 'LuckPerms',
            summary: 'Rechte für Gruppen und Spieler',
            author: 'lucko',
            downloads: 9_000_000,
            iconUrl: null,
            updatedAt: null,
            url: 'https://modrinth.com/plugin/luckperms',
            compatible: 'yes',
            installable: true,
            installed: installed.length > 0,
          },
        ],
      },
    }),
  );
  await page.route('**/market/install', (route) => {
    installed.push({ name: 'LuckPerms' });
    return route.fulfill({
      json: { installed: [{ name: 'LuckPerms', fileName: 'LuckPerms.jar', dependency: false }], manual: [] },
    });
  });

  await page.goto(`/servers/${server.id}/content?view=browse`);
  await page.getByLabel('Suchen').fill('luckperms');
  await page.getByRole('button', { name: 'Installieren' }).click();
  await expect(page.getByText('LuckPerms ist installiert')).toBeVisible();
  expect(installed).toHaveLength(1);

  await page.getByRole('tab', { name: 'Installiert' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'MeinPlugin-1.0.jar',
    mimeType: 'application/java-archive',
    buffer: Buffer.from('PK e2e'),
  });
  await expect(page.getByText('MeinPlugin-1.0', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'MeinPlugin-1.0 an oder aus' }).click();
  await expect(page.getByText('MeinPlugin-1.0.jar.disabled')).toBeVisible();
});
