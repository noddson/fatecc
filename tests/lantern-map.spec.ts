import { expect, test } from '@playwright/test';

test('dragged tokens retain exact drops and zones without duplicate movement or correction text', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore The Lantern Coast', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The Lantern Coast', exact: true })).toBeVisible();
  const navigate = async (name: string) =>
    page.getByRole('navigation', { name: 'Campaign' }).getByRole('button', { name, exact: true }).click();
  const stored = () =>
    page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('fate-core-companion');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const campaigns = await new Promise<any[]>((resolve, reject) => {
          const request = database.transaction('campaigns').objectStore('campaigns').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const campaign = campaigns[0],
          revision = campaign.maps[0].revisions[0];
        return {
          token: revision.tokens.find((t: any) => t.label === 'Mara Voss'),
          zones: revision.zones,
          count: campaign.events.filter((e: any) => e.type === 'moveToken').length,
        };
      } finally {
        database.close();
      }
    });
  await navigate('Maps & zones');
  await expect
    .poll(() => page.locator('.map-image').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1536);
  const token = page.getByRole('button', { name: 'Token: Mara Voss', exact: true });
  await token.click();
  await page.getByLabel('Left %', { exact: true }).focus();
  await page.getByLabel('Left %', { exact: true }).blur();
  const drop = async (x: number, y: number, count: number) => {
    await token.scrollIntoViewIfNeeded();
    const canvas = (await page.locator('.map-stage').boundingBox())!;
    const start = (await token.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width * x, canvas.y + canvas.height * y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await stored()).count).toBe(count);
    const saved = await stored();
    expect(saved.token.x).toBeCloseTo(x, 2);
    expect(saved.token.y).toBeCloseTo(y, 2);
    const zone = [...saved.zones]
      .reverse()
      .find((z: any) => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height);
    expect(saved.token.zoneId).toBe(zone?.id);
  };
  await drop(0.4, 0.68, 1);
  // A second drag must work immediately, including at a different zoom.
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await drop(0.48, 0.52, 2);
  await page.getByRole('button', { name: 'Reset map zoom', exact: true }).click();
  await token.click();
  await page
    .getByRole('button', { name: 'Zone: Bellweather Harbor', exact: true })
    .click({ position: { x: 5, y: 5 } });
  await expect.poll(async () => (await stored()).count).toBe(3);
  await page.getByRole('combobox', { name: 'Move to zone', exact: true }).selectOption('');
  await expect.poll(async () => (await stored()).count).toBe(4);
  expect((await stored()).token.zoneId).toBeUndefined();
  await page.reload();
  await navigate('Maps & zones');
  await page.locator('.map-tools').getByRole('button', { name: 'Mara Voss', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Move to zone', exact: true })).toHaveValue('');
  expect((await stored()).count).toBe(4);
  await navigate('At the table');
  await expect(page.locator('.activity-entry strong')).toHaveCount(4);
  await expect(page.locator('.activity-correction')).toHaveCount(4);
  await expect(page.locator('.activity-log')).not.toContainText('Record correction');
  await page.locator('.activity-correction').first().click();
  await expect(page.getByRole('dialog', { name: 'Record a correction', exact: true })).toBeVisible();
});

test('Lantern Coast example includes its map, zones and editable party tokens', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore The Lantern Coast', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The Lantern Coast', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Maps & zones', exact: true })
    .click();
  const image = page.locator('.map-image');
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth === 1536 && img.naturalHeight === 1024,
      ),
    )
    .toBe(true);
  await expect(page.locator('.map-zone')).toHaveCount(5);
  await expect(page.locator('.map-token')).toHaveCount(3);
  await expect(page.getByText('Shared with table', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Token: Mara Voss', exact: true }).click();
  await page.getByRole('button', { name: 'Zone: The Lighthouse', exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole('button', { name: 'Token: Mara Voss', exact: true })
        .evaluate((element) => element.style.left),
    )
    .toBe('38.5%');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Maps & zones', exact: true })
    .click();
  await expect(page.locator('.map-image')).toBeVisible();
  expect(
    await page
      .getByRole('button', { name: 'Token: Mara Voss', exact: true })
      .evaluate((element) => element.style.left),
  ).toBe('38.5%');
  await page.screenshot({ path: testInfo.outputPath('lantern-coast-map.png'), fullPage: true });
});
