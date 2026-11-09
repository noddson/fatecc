import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ timezoneId: 'America/Toronto' });

test('Riverton art survives renamed starters and respects uploaded banners; cards show recorded play', async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-11-09T17:00:00Z'));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Open last player cache', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New campaign', exact: true })).toHaveCount(0);
  await expect(page.locator('.topbar')).not.toContainText('Your workspace');
  await expect(page.locator('.connectivity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore Hearts of Steel', exact: true }).click();
  const image = page.locator('.story-banner .campaign-banner-image');
  await expect(image).toHaveAttribute('src', /illustrations\/hearts-of-steel-riverton\.png$/);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2172);
  await expect(page.locator('.story-banner .coast-art')).toHaveCount(0);
  await expect(page.locator('.two-columns > section').first()).toContainText('A sense of place');
  await page.locator('.story-banner').screenshot({ path: testInfo.outputPath('riverton-desktop.png') });

  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Request persistent browser storage', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(page.locator('.campaign-last-played')).toHaveText('Not played yet');

  // Model an existing campaign with recorded play followed by later preparation.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fate-core-companion');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction('campaigns', 'readwrite');
      const store = transaction.objectStore('campaigns');
      const rows = await new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const campaign = rows[0];
      campaign.name = 'Steel in Riverton';
      campaign.updatedAt = '2026-11-09T17:00:00Z';
      campaign.events = [
        { type: 'roll', timestamp: '2026-11-01T17:00:00Z' },
        { type: 'sheetOverride', timestamp: '2026-11-09T17:00:00Z' },
      ].map((event, index) => ({
        ...event,
        id: `event-${index}`,
        commandId: `command-${index}`,
        sequence: index + 1,
        actorId: campaign.members[0].id,
        summary: 'Recorded activity',
        visibility: 'shared',
      }));
      store.put(campaign);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Steel in Riverton', exact: true, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const card = page.locator('.campaign-card');
  await expect(card.locator('.campaign-last-played')).toHaveText('Last played 1 week ago');
  await expect(card.locator('time')).toHaveAttribute('datetime', '2026-11-01T17:00:00Z');
  await expect(card.locator('.campaign-card-art img')).toHaveAttribute(
    'src',
    /hearts-of-steel-riverton\.png$/,
  );
  await card.getByRole('button', { name: 'Archive Steel in Riverton', exact: true }).click();
  await page.getByLabel('Show archived', { exact: true }).check();
  await expect(card.locator('.campaign-last-played')).toHaveText('Last played 1 week ago');
  await card.locator('.campaign-card-open').click();
  await expect(image).toHaveAttribute('src', /hearts-of-steel-riverton\.png$/);

  await page.getByRole('button', { name: 'Add banner', exact: true }).click();
  await page
    .getByLabel('Banner image', { exact: true })
    .setInputFiles(resolve('public/branding/app-icon-192.png'));
  await page.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(image).toHaveAttribute('src', /^data:image\/png/);
  await page.getByRole('button', { name: 'Change banner', exact: true }).click();
  await page.getByRole('button', { name: 'Remove banner', exact: true }).click();
  await page.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(image).toHaveAttribute('src', /hearts-of-steel-riverton\.png$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.story-banner').screenshot({ path: testInfo.outputPath('riverton-mobile.png') });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(card.locator('.campaign-last-played')).toHaveText('Last played 1 week ago');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await card.screenshot({ path: testInfo.outputPath('campaign-card-mobile.png') });
});
