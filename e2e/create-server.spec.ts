/* eslint-disable ts-patterns/no-magic-numbers -- tests use literal waits, ports and example values */
import { expect, test } from '@playwright/test';
import { waitForState } from './helpers';

// The Paper card in the wizard; its text starts with "Paper": "Paper Schnell und stabil…" matches, "Purpur Wie Paper…" does not.
// https://regex101.com/?regex=%5EPaper&testString=Paper%20Schnell%20und%20stabil%0APurpur%20Wie%20Paper
const PAPER_CHOICE = /^Paper/;
// The page of one server: "/servers/ff9ac68c29" matches, "/servers/new" does not.
// https://regex101.com/?regex=%5C%2Fservers%5C%2F%5B0-9a-f%5D%2B%24&testString=%2Fservers%2Fff9ac68c29%0A%2Fservers%2Fnew
const SERVER_PAGE = /\/servers\/[0-9a-f]+$/;

test('create a Paper server with the wizard and see it running', async ({ page }) => {
  // Version lists come live from the internet; a fixed list keeps the test independent of that.
  await page.route('**/api/versions/paper', (route) =>
    route.fulfill({
      json: [
        { id: '1.21.4', stable: true },
        { id: '1.21.3', stable: true },
      ],
    }),
  );
  await page.goto('/servers/new');
  await page.getByText('Java Edition').click();
  await page.getByRole('button', { name: PAPER_CHOICE }).click();
  await expect(page.getByText('1.21.4').first()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.fill('#server-name', 'E2E Survival');
  await page.locator('#eula').click();
  await page.getByRole('button', { name: 'Server erstellen' }).click();

  await page.waitForURL(SERVER_PAGE);
  await waitForState(page, 'Läuft');
  await expect(page.getByRole('heading', { name: 'E2E Survival' })).toBeVisible();
  await page.getByRole('link', { name: 'Konsole', exact: true }).click();
  await expect(page.locator('.xterm-rows')).toContainText('Done', { timeout: 10_000 });
});
