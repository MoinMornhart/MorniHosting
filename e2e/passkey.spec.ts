/* eslint-disable ts-patterns/no-magic-numbers -- tests use literal waits, ports and example values */
import { expect, test } from '@playwright/test';

// Passkeys need a secure page, and "localhost" counts as one (an IP address does not).
const LOCAL_URL = 'http://localhost:8199';

test('add a passkey, sign out and sign in again with it', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: LOCAL_URL,
    storageState: { cookies: [], origins: [] },
    locale: 'de-DE',
  });
  const page = await context.newPage();
  // A virtual fingerprint reader built into Chromium: it answers every passkey dialog with "yes".
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Benutzername').fill('philip');
  await page.getByLabel('Passwort').fill('supersecret123');
  await page.locator('form').getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Deine Server' })).toBeVisible();

  await page.goto('/account');
  await page.getByLabel('Name für den neuen Passkey').fill('Testgerät');
  await page.getByRole('button', { name: 'Passkey hinzufügen' }).click();
  await expect(page.getByText('Passkey hinzugefügt')).toBeVisible();
  await expect(page.getByText('Testgerät')).toBeVisible();

  await page.request.post('/api/auth/logout');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Deine Server' })).toBeVisible();
  await context.close();
});
