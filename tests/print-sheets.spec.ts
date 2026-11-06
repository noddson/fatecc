import { expect, test, type Page } from '@playwright/test';
import type { Campaign } from '../src/domain/types';

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Campaign' }).getByRole('button', { name, exact: true }).click();
}

/** Use real saved records so the same fixture also works against a production build. */
async function seedPrintCampaign(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore The Lantern Coast', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'The Lantern Coast', exact: true, level: 1 })).toBeVisible();
  const campaign = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fate-core-companion');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction('campaigns', 'readwrite');
      const store = transaction.objectStore('campaigns');
      const rows = await new Promise<Campaign[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const campaign = rows[0];
      campaign.rules.skills.find((skill) => skill.id === 'physique')!.name = 'Grit';
      campaign.rules.stressTracks[0].name = 'Body';
      campaign.rules.skillCap = 5;
      campaign.rules.consequenceSlots = [2, 2, 4, 6];
      campaign.rules.houseRules = 'Custom campaign: a second shared mild consequence slot.';
      const hero = campaign.characters[0];
      hero.skills.physique = 5;
      hero.fatePoints = 7;
      hero.stress.physical = [2];
      hero.consequences = [
        { id: 'cut', value: 2, name: 'Cut left palm', recovering: false },
        { id: 'bruise', value: 2, name: 'Bruised shoulder', recovering: true },
        { id: 'body', value: 2, name: 'Tender ribs', trackId: 'physical', recovering: false },
        { id: 'extreme', value: 8, name: 'The storm changed me', recovering: false },
      ];
      hero.extremeUsed = true;
      hero.notes = 'Bring a pencil and mark changes during play.';
      hero.phases[0].story = 'A promise made on the harbor wall.';
      hero.phases[0].characterIds = [campaign.characters[1].id, 'secret-npc'];
      hero.aspects.push({
        id: 'secret-aspect',
        kind: 'character',
        name: 'GM secret ancestry',
        freeInvokes: 0,
        visibility: 'gm',
      });
      const npc = structuredClone(campaign.characters[1]);
      npc.id = 'secret-npc';
      npc.name = 'GM secret antagonist';
      npc.kind = 'main';
      npc.visibility = 'gm';
      npc.aspects = [];
      npc.phases = [];
      campaign.characters.push(npc);
      campaign.issues.push({
        id: 'secret-issue',
        kind: 'game',
        name: 'GM secret invasion',
        freeInvokes: 0,
        visibility: 'gm',
      });
      campaign.world.push({
        id: 'secret-note',
        kind: 'note',
        title: 'GM secret ending',
        body: 'The admiral is behind it all.',
        visibility: 'gm',
        tags: [],
      });
      campaign.inventory.push({
        id: 'secret-item',
        revision: 0,
        name: 'GM secret relic',
        quantity: 1,
        unit: 'item',
        ownerId: 'party',
        description: 'Keep concealed.',
        visibility: 'gm',
      });
      campaign.inventory.push({
        id: 'personal-item',
        revision: 0,
        name: 'Mara’s brass compass',
        quantity: 1,
        unit: 'item',
        ownerId: hero.id,
        description: 'Points toward home.',
        visibility: 'shared',
      });
      store.put(campaign);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return campaign;
    } finally {
      database.close();
    }
  });
  await page.reload();
  return campaign;
}

test('print packets use configured rules and current state, with shared handouts filtered before rendering', async ({
  page,
}, testInfo) => {
  await seedPrintCampaign(page);
  await navigate(page, 'Print sheets');
  await page.getByLabel('Table worksheet', { exact: true }).check();
  await page.getByLabel('Include character backstory & notes', { exact: true }).check();
  const packet = page.locator('.print-packet');
  await expect(page.getByRole('combobox', { name: 'Paper size', exact: true })).toHaveValue(
    'Letter-portrait',
  );
  await expect(page.getByRole('combobox', { name: 'Audience', exact: true })).toHaveValue('shared');
  await expect(packet).toContainText('Body');
  await expect(packet).toContainText('Grit');
  await expect(packet.locator('[aria-label="Body 2: marked"]')).toHaveAttribute('data-marked', 'true');
  await expect(packet.locator('[aria-label="Body 4: available"]')).toHaveAttribute('data-marked', 'false');
  await expect(packet).toContainText('Body only');
  await expect(packet).toContainText('Recovery started');
  await expect(packet).toContainText('Custom campaign: a second shared mild consequence slot.');
  await expect(packet).toContainText('Mara’s brass compass');
  await expect(packet).toContainText('Silas Reed');
  await expect(packet).not.toContainText('GM secret');
  await expect(page.getByRole('checkbox', { name: 'GM secret antagonist', exact: true })).toHaveCount(0);
  // A pair of house-rule mild slots must consume different injuries, once each.
  await expect(packet.getByText('Cut left palm', { exact: true })).toHaveCount(1);
  await expect(packet.getByText('Bruised shoulder', { exact: true })).toHaveCount(1);
  await expect(packet.getByText('Tender ribs', { exact: true })).toHaveCount(1);
  await expect(packet.getByText('The storm changed me', { exact: true })).toHaveCount(1);

  await page.getByRole('combobox', { name: 'Audience', exact: true }).selectOption('gm');
  await page.getByRole('checkbox', { name: /GM secret antagonist/ }).check();
  for (const secret of [
    'GM secret ancestry',
    'GM secret antagonist',
    'GM secret invasion',
    'GM secret ending',
    'GM secret relic',
  ]) {
    await expect(packet).toContainText(secret);
  }
  await page.getByRole('combobox', { name: 'Audience', exact: true }).selectOption('shared');
  await expect(packet).not.toContainText('GM secret');
  await page.getByLabel('Include character backstory & notes', { exact: true }).uncheck();
  await page.getByLabel('Table worksheet', { exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Silas Reed', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Wren Ashford', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('A4-portrait');
  await page.evaluate(() => document.fonts.ready);
  await packet.screenshot({ path: testInfo.outputPath('print-preview.png') });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Campaign' })).not.toBeVisible();
  await expect(packet).toBeVisible();
  await page.pdf({
    path: testInfo.outputPath('sheets-a4.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('Letter-portrait');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: testInfo.outputPath('sheets-letter.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  });
});

test('character print preview includes the latest editor values and retains them after browser printing', async ({
  page,
}) => {
  await seedPrintCampaign(page);
  await navigate(page, 'Characters');
  await page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'Mara Voss', exact: true }) })
    .click();
  await page.getByLabel('High concept', { exact: false }).fill('A lighthouse keeper ready for paper play');
  await page.getByRole('button', { name: 'Print character', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Print character sheets', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Paper size', exact: true })).toHaveValue(
    'Letter-portrait',
  );
  await expect(dialog.getByRole('group', { name: 'Campaign sheets', exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Game creation worksheet', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Table worksheet', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('.fs-game, .fs-table')).toHaveCount(0);
  await expect(dialog.locator('.print-packet')).toContainText('A lighthouse keeper ready for paper play');
  await expect(dialog.getByRole('checkbox', { name: 'Mara Voss', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Silas Reed', exact: true })).not.toBeChecked();
  await page.evaluate(() => {
    (window as Window & { printCalls?: number }).printCalls = 0;
    window.print = () => {
      (window as Window & { printCalls?: number }).printCalls!++;
    };
  });
  await dialog.getByRole('button', { name: 'Print / Save PDF', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { printCalls?: number }).printCalls))
    .toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.character-screen')).not.toBeVisible();
  await expect(dialog.locator('.print-packet')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('High concept', { exact: false })).toHaveValue(
    'A lighthouse keeper ready for paper play',
  );
});

test('print controls remain usable on a phone and work without an internet connection', async ({
  page,
  context,
}, testInfo) => {
  await seedPrintCampaign(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, 'Print sheets');
  await context.setOffline(true);
  await page.getByLabel('Game creation worksheet', { exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('Letter-portrait');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Mara Voss', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled();
  await expect(page.locator('.print-packet')).toContainText('Mara Voss');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('print-mobile.png'), fullPage: false });
  await context.setOffline(false);
});

test('paper direction matches the screen preview and generated PDF for both sizes', async ({
  page,
}, testInfo) => {
  await seedPrintCampaign(page);
  await navigate(page, 'Print sheets');
  for (const [paper, width, height] of [
    ['Letter-portrait', 612, 792],
    ['Letter-landscape', 792, 612],
    ['A4-portrait', 595.28, 841.89],
    ['A4-landscape', 841.89, 595.28],
  ] as const) {
    await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption(paper);
    const ratio = await page.locator('.print-packet').evaluate((element) => {
      const styles = getComputedStyle(element);
      return (
        parseFloat(styles.getPropertyValue('--sheet-width')) /
        parseFloat(styles.getPropertyValue('--sheet-height'))
      );
    });
    expect(ratio).toBeCloseTo(width / height, 2);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ path: testInfo.outputPath(`${paper}.pdf`), preferCSSPageSize: true });
    const bounds = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'))!;
    expect(bounds).not.toBeNull();
    expect(Number(bounds[1])).toBeCloseTo(width, 0);
    expect(Number(bounds[2])).toBeCloseTo(height, 0);
    await page.emulateMedia({ media: 'screen' });
  }
});

test('print footer refreshes the local date and time for each print and keeps app branding at the bottom', async ({
  page,
}) => {
  await seedPrintCampaign(page);
  await navigate(page, 'Print sheets');
  const widths = await page.locator('.print-workspace').evaluate((element) => {
    const workspace = element.getBoundingClientRect().width;
    const controls = element.querySelector('.print-controls')!.getBoundingClientRect().width;
    const preview = element.querySelector('.print-packet')!.getBoundingClientRect().width;
    return { controls: Math.abs(workspace - controls), fits: preview <= workspace + 1 };
  });
  expect(widths.controls).toBeLessThan(1);
  expect(widths.fits).toBe(true);
  const folio = page.locator('.print-workspace > .print-folio');
  await expect(folio).not.toBeVisible();
  await page.clock.setFixedTime(new Date('2030-01-02T15:04:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(folio.locator('time')).toHaveAttribute('datetime', '2030-01-02T15:04:00.000Z');
  const expected = await page.evaluate(() =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
  );
  await expect(folio.locator('time')).toHaveText(expected);
  await page.emulateMedia({ media: 'print' });
  await expect(folio).toBeVisible();
  await expect(folio).toContainText('Fate Campaign Companion');
  await expect(folio).not.toContainText(/https?:\/\/|127\.0\.0\.1|localhost/);
  await expect(folio).toHaveCSS('position', 'fixed');
  const positions = await folio.evaluate((element) => {
    const footer = element.getBoundingClientRect();
    const title = element.querySelector('.print-folio-title')!.getBoundingClientRect();
    const time = element.querySelector('time')!.getBoundingClientRect();
    return {
      centerDifference: Math.abs(title.x + title.width / 2 - (footer.x + footer.width / 2)),
      leftDifference: Math.abs(time.x - footer.x),
    };
  });
  expect(positions.centerDifference).toBeLessThan(1);
  expect(positions.leftDifference).toBeLessThan(1);
  await page.clock.setFixedTime(new Date('2030-01-02T15:09:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(folio.locator('time')).toHaveAttribute('datetime', '2030-01-02T15:09:00.000Z');
});
