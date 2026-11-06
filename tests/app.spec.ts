import { test, expect, type Page, type Browser, type TestInfo } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: label, exact: true })
    .click();
}
async function createCampaign(page: Page, name: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a campaign', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Give your story a name' });
  await dialog.getByLabel('Campaign name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
}
async function quickCharacter(page: Page, name: string) {
  await navigate(page, 'Characters');
  await page.getByRole('button', { name: 'New character', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new character' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('combobox', { name: 'Creation approach', exact: true }).selectOption('quick');
  await dialog.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await page.getByLabel('High concept', { exact: false }).fill('A navigator who follows impossible stars');
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  await page.getByRole('combobox', { name: 'Lore rating', exact: true }).selectOption('4');
  await expect(page.locator('.character-heading .save-label')).toHaveText('Draft saved');
}
async function downloadBackup(page: Page, testInfo: TestInfo, format: 'json' | 'zip') {
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keep your story safe' });
  const event = page.waitForEvent('download');
  await dialog
    .getByRole('button', { name: format === 'json' ? /Full campaign JSON/ : /Compact ZIP backup/ })
    .click();
  const download = await event;
  const path = testInfo.outputPath(`campaign.${format}`);
  await download.saveAs(path);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  return path;
}
async function restoreInFreshBrowser(browser: Browser, url: string, path: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Create a campaign', exact: true })).toBeVisible();
  await page.locator('input[type="file"][accept=".json,.zip"]').first().setInputFiles(path);
  const dialog = page.getByRole('dialog', { name: 'Review your import' });
  await expect(dialog.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Import as', exact: true })).toHaveValue('copy');
  await dialog.getByRole('button', { name: 'Import campaign', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: `${name} (copy)`, exact: true })).toBeVisible();
  return { context, page };
}

// Small, deterministic raster fixture. No network or image library is needed.
function testMapPng(red: number): Buffer {
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(240, 0);
  header.writeUInt32BE(160, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(160 * (1 + 240 * 3));
  for (let y = 0; y < 160; y++)
    for (let x = 0; x < 240; x++) {
      const p = y * 721 + 1 + x * 3;
      pixels[p] = red;
      pixels[p + 1] = 150 + Math.floor(y / 10);
      pixels[p + 2] = 90 + Math.floor(x / 10);
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('custom game and quick character persist, searchable Core works, JSON restores in a fresh browser', async ({
  page,
  browser,
}, testInfo) => {
  await createCampaign(page, 'The glass horizon');
  await navigate(page, 'Game settings');
  await page.getByLabel('Ruleset name', { exact: true }).fill('Glass Horizon Core');
  await page.getByLabel('Starting refresh', { exact: true }).fill('4');
  await page
    .getByLabel('Table agreement', { exact: false })
    .fill('Resources may represent community support.');
  await page.getByRole('button', { name: 'Review changes', exact: false }).click();
  const review = page.getByRole('dialog', { name: 'Review rules changes' });
  await expect(review.getByText('No characters to revalidate yet.')).toBeVisible();
  await review.getByRole('button', { name: 'Apply revision 2', exact: true }).click();
  await quickCharacter(page, 'Asha');
  await expect(page.locator('.sheet-summary')).toContainText('4');
  await navigate(page, 'Game settings');
  await expect(page.getByLabel('Ruleset name', { exact: true })).toHaveValue('Glass Horizon Core');
  await page.getByLabel('Starting skill cap', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Review changes', exact: false }).click();
  await expect(page.getByRole('dialog', { name: 'Review rules changes' })).toContainText('Asha');
  await expect(page.getByRole('dialog', { name: 'Review rules changes' })).toContainText(/cap|rating|skill/i);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await navigate(page, 'Rules library');
  await page.getByRole('searchbox', { name: 'Search rules and references' }).fill('stunts refresh');
  await expect(page.locator('.reference-card')).not.toHaveCount(0);
  await page
    .locator('.reference-card')
    .filter({ has: page.getByRole('heading', { name: /Stunts and Refresh|Stunts & Refresh/i }) })
    .filter({ has: page.getByText('Characters', { exact: true }) })
    .click();
  const article = page.getByRole('dialog');
  await expect(article.locator('.reference-article')).toContainText('three stunts for free');
  await article.getByRole('button', { name: 'Close reference', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'The glass horizon', exact: true })).toBeVisible();
  await navigate(page, 'Characters');
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: 'Asha', exact: true }) })
    .click();
  await expect(page.getByLabel('High concept', { exact: false })).toHaveValue(
    'A navigator who follows impossible stars',
  );
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Lore rating', exact: true })).toHaveValue('4');
  const file = await downloadBackup(page, testInfo, 'json');
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported.campaign.rules.refresh).toBe(4);
  expect(exported.campaign.rules.skillCap).toBe(4); // Unapplied preview did not mutate the saved game.
  expect(exported.campaign.characters[0].skills.lore).toBe(4);
  const restored = await restoreInFreshBrowser(browser, page.url(), file, 'The glass horizon');
  try {
    await navigate(restored.page, 'Characters');
    await restored.page
      .getByRole('button')
      .filter({ has: restored.page.getByRole('heading', { name: 'Asha', exact: true }) })
      .click();
    await expect(restored.page.getByLabel('High concept', { exact: false })).toHaveValue(
      'A navigator who follows impossible stars',
    );
    await navigate(restored.page, 'Game settings');
    await expect(restored.page.getByLabel('Starting refresh', { exact: true })).toHaveValue('4');
  } finally {
    await restored.context.close();
  }
  await navigate(page, 'Overview');
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await mkdir(resolve('output/screenshots'), { recursive: true });
  await page.screenshot({ path: resolve('output/screenshots/campaign-overview.png'), fullPage: true });
});

test('maps preserve image revisions and overlays, publish a revision, and restore portable ZIP', async ({
  page,
  browser,
}, testInfo) => {
  await createCampaign(page, 'Harbor of echoes');
  await quickCharacter(page, 'Rook');
  await navigate(page, 'Maps & zones');
  await page
    .getByLabel('Upload map image', { exact: true })
    .setInputFiles({ name: 'Harbor.png', mimeType: 'image/png', buffer: testMapPng(160) });
  await expect(
    page.locator('.map-title').getByRole('heading', { name: 'Harbor', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.locator('.map-image').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(240);
  await page.getByRole('button', { name: 'Zone', exact: true }).click();
  const canvas = page.locator('.map-stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Map canvas is not visible.');
  await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
  await page.getByLabel('Zone name', { exact: true }).fill('Old harbor');
  await page.getByLabel('Zone name', { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: 'Zone: Old harbor', exact: true })).toBeVisible();
  await page.getByLabel('Zone aspect', { exact: true }).fill('Heavy sea mist');
  await page.getByLabel('Zone aspect', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Token', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Character for new token', exact: true })
    .selectOption({ label: 'Rook' });
  await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
  await expect(page.getByRole('button', { name: 'Token: Rook', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Share this revision', exact: true }).click();
  await expect(page.getByText('Shared with table', { exact: true })).toBeVisible();
  await page
    .getByLabel('Replace map image', { exact: true })
    .setInputFiles({ name: 'Harbor-after.png', mimeType: 'image/png', buffer: testMapPng(190) });
  const replace = page.getByRole('dialog', { name: 'Save a new map revision' });
  await expect(replace.getByRole('radio', { name: /Carry current overlays forward/ })).toBeChecked();
  await replace.getByRole('button', { name: 'Save new revision', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'View revision', exact: true }).locator('option'),
  ).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Zone: Old harbor', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Token: Rook', exact: true })).toBeVisible();
  await expect(page.getByText('GM workspace', { exact: true })).toBeVisible(); // Prior published revision remains selected for players.
  await page.getByRole('button', { name: 'Share this revision', exact: true }).click();
  const file = await downloadBackup(page, testInfo, 'zip');
  const restored = await restoreInFreshBrowser(browser, page.url(), file, 'Harbor of echoes');
  try {
    await navigate(restored.page, 'Maps & zones');
    await expect(
      restored.page.getByRole('combobox', { name: 'View revision', exact: true }).locator('option'),
    ).toHaveCount(2);
    await expect(restored.page.getByRole('button', { name: 'Zone: Old harbor', exact: true })).toBeVisible();
    await expect(restored.page.getByRole('button', { name: 'Token: Rook', exact: true })).toBeVisible();
    await expect(restored.page.getByText('Shared with table', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        restored.page.locator('.map-image').evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBe(240);
  } finally {
    await restored.context.close();
  }
});

test('390px player layouts keep sheets and rules inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createCampaign(page, 'Pocket stories');
  await quickCharacter(page, 'Lark');
  const assertNoOverflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
      true,
    );
  await assertNoOverflow();
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir(resolve('output/screenshots'), { recursive: true });
  await page.screenshot({ path: resolve('output/screenshots/character-mobile.png') });
  await navigate(page, 'Rules library');
  await page.getByRole('searchbox', { name: 'Search rules and references' }).fill('consequence');
  await assertNoOverflow();
  await expect(page.locator('.reference-card').first()).toBeVisible();
  await navigate(page, 'At the table');
  await assertNoOverflow();
});
