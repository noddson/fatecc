import { expect, test } from '@playwright/test';

test('creates the SRD starter offline and keeps both examples available', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Explore Hearts of Steel', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Explore Hearts of Steel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hearts of Steel', exact: true, level: 1 })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Campaign journal', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Hearts of Steel — sources and credits', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Opening: a favor for Kale', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('hearts-journal-mobile.png'), fullPage: true });
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hearts of Steel', exact: true, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore Hearts of Steel', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore The Lantern Coast', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('examples-mobile.png'), fullPage: true });
});
