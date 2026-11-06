import { expect, test, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// A deterministic wide image with visible bands, useful for inspecting crop and overlay.
function bannerPng(red: number): Buffer {
  const crc = (bytes: Buffer) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, checksum]);
  };
  const width = 600,
    height = 240,
    stride = 1 + width * 3;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * stride + 1 + x * 3;
      pixels[offset] = red + Math.floor(y / 20);
      pixels[offset + 1] = 70 + Math.floor(x / 8);
      pixels[offset + 2] = y < 80 ? 180 : y < 160 ? 120 : 60;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function openCampaign(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
  await expect(page.getByRole('heading', { name: 'The Lantern Coast', exact: true, level: 1 })).toBeVisible();
}

async function uploadBanner(page: Page, bytes = bannerPng(70)) {
  await page.getByRole('button', { name: 'Add banner', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Campaign banner', exact: true });
  await dialog.getByLabel('Banner image', { exact: true }).setInputFiles({
    name: 'coast.png',
    mimeType: 'image/png',
    buffer: bytes,
  });
  await expect(dialog.getByRole('img', { name: 'Banner preview', exact: true })).toBeVisible();
  return dialog;
}

test('campaign banners persist in overview and cards, while canceled replacements and removal preserve saved data', async ({
  page,
}, testInfo) => {
  await openCampaign(page);
  const original = bannerPng(70);
  const source = `data:image/png;base64,${original.toString('base64')}`;
  let dialog = await uploadBanner(page, original);
  const position = dialog.getByRole('slider', { name: 'Vertical position', exact: true });
  await position.evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '75');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(position).toHaveValue('75');
  await dialog.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const image = page.locator('.story-banner > img.campaign-banner-image');
  await expect(image).toHaveAttribute('src', source);
  await expect(image).toHaveCSS('object-position', /75%$/);
  await expect(page.locator('.coast-art')).toHaveCount(0);
  await page.reload();
  await expect(image).toHaveAttribute('src', source);
  await expect(image).toHaveCSS('object-position', /75%$/);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 600))
    .toBe(true);
  await page
    .locator('.story-banner')
    .screenshot({ path: testInfo.outputPath('campaign-banner-desktop.png'), animations: 'disabled' });

  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const card = page
    .locator('.campaign-card')
    .filter({ has: page.getByRole('heading', { name: 'The Lantern Coast', exact: true }) });
  await expect(card.locator('.campaign-card-art > img')).toHaveAttribute('src', source);
  await expect(card.locator('.campaign-card-art > img')).toHaveCSS('object-position', /75%$/);
  await card.locator('.campaign-card-open').click();
  await page.getByRole('button', { name: 'Change banner', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Campaign banner', exact: true });
  await dialog.getByLabel('Banner image', { exact: true }).setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: bannerPng(180),
  });
  await expect(dialog.getByRole('img', { name: 'Banner preview', exact: true })).not.toHaveAttribute(
    'src',
    source,
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(image).toHaveAttribute('src', source);
  await page.getByRole('button', { name: 'Change banner', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Campaign banner', exact: true });
  await dialog.getByRole('button', { name: 'Remove banner', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(image).toHaveAttribute('src', source);
  await page.getByRole('button', { name: 'Change banner', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Campaign banner', exact: true });
  await dialog.getByRole('button', { name: 'Remove banner', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(image).toHaveCount(0);
  await expect(page.locator('.coast-art')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add banner', exact: true })).toBeVisible();
});

test('banner uploads reject invalid images without replacing the saved image, and the controls fit a phone', async ({
  page,
}, testInfo) => {
  await openCampaign(page);
  let dialog = await uploadBanner(page);
  await dialog.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const notification = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await notification.isVisible()) await notification.click();
  const image = page.locator('.story-banner > img.campaign-banner-image');
  const source = await image.getAttribute('src');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Change banner', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Campaign banner', exact: true });
  await dialog.getByLabel('Banner image', { exact: true }).setInputFiles({
    name: 'not-an-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('This is not a PNG.'),
  });
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Banner preview', exact: true })).toHaveAttribute(
    'src',
    source!,
  );
  await expect(image).toHaveAttribute('src', source!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('campaign-banner-mobile.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(image).toHaveAttribute('src', source!);
  await expect(page.getByRole('button', { name: 'Open the table', exact: true })).toBeVisible();
});
