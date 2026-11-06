import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openSheet(page: Page, name: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a campaign', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Campaign name', { exact: true }).fill('Rules integration');
  await page.getByRole('dialog').getByRole('button', { name: 'Create campaign', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Characters', exact: true })
    .click();
  await page.getByRole('button', { name: 'New character', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new character' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('combobox', { name: 'Creation approach', exact: true }).selectOption('quick');
  await dialog.getByRole('button', { name: 'Create character', exact: true }).click();
  await page.getByLabel('High concept', { exact: false }).fill('A resourceful explorer');
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  for (const [skill, rank] of Object.entries({
    Lore: 4,
    Crafts: 3,
    Rapport: 3,
    Athletics: 2,
    Will: 2,
    Investigate: 2,
    Fight: 1,
    Resources: 1,
    Contacts: 1,
    Notice: 1,
  }))
    await page.getByRole('combobox', { name: `${skill} rating`, exact: true }).selectOption(String(rank));
  await expect(page.locator('.character-heading .save-label')).toHaveText('Draft saved');
}
async function addStunt(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add stunt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new stunt' });
  await dialog.getByLabel('Stunt name', { exact: true }).fill(name);
  await dialog
    .getByLabel('Effect & conditions', { exact: true })
    .fill('Get +2 when the table agrees the stated condition applies.');
  await dialog.getByRole('button', { name: 'Save stunt', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.character-heading .save-label')).toHaveText('Draft saved');
}

test('paid stunts charge correctly before and during play; milestone choices and banked skills are reachable', async ({
  page,
}) => {
  await openSheet(page, 'Mara');
  await page.getByRole('button', { name: 'Stunts & extras', exact: true }).click();
  for (const name of ['First trick', 'Second trick', 'Third trick', 'Fourth trick'])
    await addStunt(page, name);
  const fate = page
    .locator('.sheet-summary > div')
    .filter({ has: page.locator('span', { hasText: /^Fate points$/ }) });
  const refresh = page
    .locator('.sheet-summary > div')
    .filter({ has: page.locator('span', { hasText: /^Refresh$/ }) });
  await expect(fate.locator('strong')).toHaveText('2');
  await expect(refresh.locator('strong')).toHaveText('2');
  await page.getByRole('button', { name: 'Mark ready to play', exact: true }).click();
  await expect(page.locator('.character-heading .save-label')).toHaveText('Draft saved');
  await addStunt(page, 'Fifth trick');
  await expect(fate.locator('strong')).toHaveText('1');
  await expect(refresh.locator('strong')).toHaveText('1');
  await page.getByRole('button', { name: 'Growth & recovery', exact: true }).click();
  await page.getByRole('button', { name: 'Award milestone', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'A turning point' });
  await dialog.getByRole('combobox', { name: 'Milestone', exact: true }).selectOption('significant');
  await dialog.getByLabel('What happened?', { exact: true }).fill('The island is free.');
  await dialog.getByRole('button', { name: 'Award milestone', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Choose milestone change', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Choose a milestone change' });
  await dialog.getByRole('combobox', { name: 'Aspect', exact: true }).selectOption({ label: 'trouble' });
  await dialog.getByLabel('New wording', { exact: true }).fill('The admiral wants revenge');
  await dialog.getByRole('button', { name: 'Apply milestone change', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose milestone change', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Spend a banked skill point', exact: true }).selectOption('will');
  await expect(page.getByRole('button', { name: 'Spend 1 skill point', exact: true })).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Spend a banked skill point', exact: true })
    .selectOption('burglary');
  await page.getByRole('button', { name: 'Spend 1 skill point', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Spend a banked skill point', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Aspects & story', exact: true }).click();
  await expect(page.getByLabel('Trouble', { exact: false })).toHaveValue('The admiral wants revenge');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.character-print')).toBeVisible();
  await expect(page.locator('.character-print')).toContainText('Fifth trick');
  await expect(page.locator('.character-print')).toContainText('Burglary');
  await expect(page.locator('.character-screen')).not.toBeVisible();
});

test('reviewed character import preserves portrait bytes and exposes foreign rule differences', async ({
  page,
}, testInfo) => {
  await openSheet(page, 'Imported voyager');
  await page.getByRole('button', { name: 'Aspects & story', exact: true }).click();
  // Valid small PNG, used solely as a deterministic upload fixture.
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPUiLJhYGBgYgADAAj+AMJzoi/PAAAAAElFTkSuQmCC',
    'base64',
  );
  await page
    .locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('.character-heading .avatar img')).toBeVisible();
  await expect(page.locator('.character-heading .save-label')).toHaveText('Draft saved');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export character', exact: true }).click();
  const path = testInfo.outputPath('character.json');
  await (await downloadPromise).saveAs(path);
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.assets).toHaveLength(1);
  exported.rules.refresh = 4;
  exported.rules.name = 'Different setting';
  await page.getByRole('button', { name: 'All characters', exact: true }).click();
  await page
    .locator('input[type="file"][accept=".json"]')
    .setInputFiles({
      name: 'character.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    });
  const dialog = page.getByRole('dialog', { name: 'Review character import' });
  await expect(dialog).toContainText('Base refresh');
  await dialog.getByRole('button', { name: 'Import as a new draft', exact: true }).click();
  await expect(page.locator('.character-heading .avatar img')).toBeVisible();
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export character', exact: true }).click();
  const secondPath = testInfo.outputPath('imported-character.json');
  await (await secondDownload).saveAs(secondPath);
  const imported = JSON.parse(await readFile(secondPath, 'utf8'));
  expect(imported.character.id).not.toBe(exported.character.id);
  expect(imported.assets[0].hash).toBe(exported.assets[0].hash);
  expect(imported.assets[0].id).not.toBe(exported.assets[0].id);
  expect(imported.rules.refresh).toBe(3);
  expect(imported.character.skills).toEqual(exported.character.skills);
});
