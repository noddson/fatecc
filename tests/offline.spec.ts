import { expect, test } from '@playwright/test';

test('an Accelerated campaign can be created, reloaded, and searched entirely offline', async ({
  page,
  context,
}) => {
  test.skip(!process.env.FATE_TEST_URL, 'Requires the built PWA.');
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Create a campaign', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Campaign name', { exact: true }).fill('Offline sky pirates');
  await dialog.getByRole('combobox', { name: 'Rules system', exact: true }).selectOption('fate-accelerated');
  await dialog.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page.locator('.breadcrumb .system-badge')).toHaveText('Fate Accelerated');
  await page.reload();
  await expect(page.locator('.sidebar-campaign .system-badge')).toHaveText('Fate Accelerated');
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Rules library', exact: true })
    .click();
  await page.getByRole('searchbox').fill('approaches');
  await expect(page.locator('.reference-card').first()).toBeVisible();
  await page.locator('.reference-card').first().click();
  await expect(page.getByRole('dialog').locator('.reference-article')).toContainText(/approach/i);
  await expect(page.getByRole('dialog').locator('.reference-article-meta')).toContainText('Fate Accelerated');
  await context.setOffline(false);
});

test('Hearts of Steel Riverton banner and map are precached before the starter is first opened offline', async ({
  page,
  context,
}) => {
  test.skip(!process.env.FATE_TEST_URL, 'Requires the built PWA.');
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Explore Hearts of Steel', exact: true }).click();
  const banner = page.locator('.story-banner .campaign-banner-image');
  await expect(banner).toHaveAttribute('src', /hearts-of-steel-riverton\.png$/);
  await expect.poll(() => banner.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2172);
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Maps & zones', exact: true })
    .click();
  const map = page.locator('.map-image');
  await expect
    .poll(() => map.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([1536, 1024]);

  await page.reload();
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Overview', exact: true })
    .click();
  await expect.poll(() => banner.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2172);
  await context.setOffline(false);
});

test('Lantern Coast can be created with its bundled map while offline', async ({ page, context }) => {
  test.skip(!process.env.FATE_TEST_URL, 'Requires the built PWA.');
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Explore The Lantern Coast' }).click();
  await expect(page.getByRole('heading', { name: 'The Lantern Coast', exact: true })).toBeVisible();
  const banner = page.locator('.story-banner .campaign-banner-image');
  await expect(banner).toHaveAttribute('src', /lantern-coast-dark-beacon\.png$/);
  await expect.poll(() => banner.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2172);
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Maps & zones', exact: true })
    .click();
  const map = page.locator('.map-image');
  await expect(map).toBeVisible();
  await expect
    .poll(() => map.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([1536, 1024]);
  await expect(page.getByRole('button', { name: /^Zone:/ })).toHaveCount(5);
  await expect(page.getByRole('button', { name: /^Token:/ })).toHaveCount(3);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Maps & zones', exact: true })
    .click();
  await expect(page.locator('.map-image')).toBeVisible();
  await expect
    .poll(() => page.locator('.map-image').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1536);
  await context.setOffline(false);
});

test('production PWA restores a campaign and searches the bundled rules while offline', async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.FATE_TEST_URL,
    'Run against the built PWA with FATE_TEST_URL, not the development server.',
  );
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button', { name: 'Create a campaign', exact: true }).click();
  await page.getByLabel('Campaign name').fill('The Offline Coast');
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Offline Coast', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add banner', exact: true }).click();
  const bannerDialog = page.getByRole('dialog', { name: 'Campaign banner' });
  await bannerDialog.getByLabel('Banner image', { exact: true }).setInputFiles({
    name: 'offline-banner.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPUiLJhYGBgYgADAAj+AMJzoi/PAAAAAElFTkSuQmCC',
      'base64',
    ),
  });
  await expect(bannerDialog.getByRole('img', { name: 'Banner preview' })).toBeVisible();
  await bannerDialog.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(bannerDialog).not.toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Offline Coast', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Powered by Fate', exact: true })).toBeVisible();
  await expect(page.locator('.campaign-banner-image')).toBeVisible();
  expect(
    await page
      .locator('.campaign-banner-image')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 2),
  ).toBe(true);
  await expect(page.locator('.app-version')).toContainText('Fate Campaign Companion');
  // Fonts not yet used on this screen must also be available from the offline precache.
  const offlineFonts = await page.evaluate(async () => {
    const faces = await Promise.all([
      document.fonts.load('700 16px Montserrat'),
      document.fonts.load('italic 16px Montserrat'),
      document.fonts.load('400 18px "EB Garamond"'),
      document.fonts.load('italic 18px "EB Garamond"'),
      document.fonts.load('400 20px "Fate Core Glyphs"', 'O'),
    ]);
    return faces.every((loaded) => loaded.length > 0 && loaded.every((font) => font.status === 'loaded'));
  });
  expect(offlineFonts).toBe(true);
  await page.getByLabel('Game issue 1', { exact: true }).fill('The signal has gone quiet');
  await page.getByLabel('Game issue 1', { exact: true }).blur();
  await page.getByRole('button', { name: 'Rules library', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search rules and references' }).fill('refresh');
  await expect(
    page.getByRole('button', { name: /Stunts and Refresh|Stunts & Refresh|Refresh/i }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Game issue 1', { exact: true })).toHaveValue('The signal has gone quiet');
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Print sheets', exact: true })
    .click();
  await expect(page.locator('.print-packet')).toContainText('The signal has gone quiet');
  await expect(page.locator('.print-packet .fs-header img')).toBeVisible();
  expect(
    await page
      .locator('.print-packet .fs-header img')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.fs-game')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Campaign' })).not.toBeVisible();
  await context.setOffline(false);
});
