import { expect, test, type Page } from '@playwright/test';

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Campaign' }).getByRole('button', { name, exact: true }).click();
}

async function createCharacter(page: Page, name: string) {
  await page.getByRole('button', { name: 'New character', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new character' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('combobox', { name: 'Creation approach', exact: true }).selectOption('quick');
  await dialog.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All characters', exact: true }).click();
}

test('Character visibility requires a holder, survives reload and transfer, and stays private if the character is deleted', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a campaign', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Give your story a name' });
  await create.getByLabel('Campaign name', { exact: true }).fill('Private inventory');
  await create.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await navigate(page, 'Characters');
  await createCharacter(page, 'Mara');
  await createCharacter(page, 'Ivo');
  await navigate(page, 'Inventory');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Inventory item' });
  await dialog.getByLabel('Name', { exact: true }).fill('Secret lighthouse key');
  await dialog.getByRole('combobox', { name: /^Visibility/ }).selectOption('character');
  await expect(dialog.getByRole('button', { name: 'Save item' })).toBeDisabled();
  await expect(dialog.getByRole('status')).toContainText('Choose a character under Held by');
  await dialog.getByRole('combobox', { name: 'Held by', exact: true }).selectOption({ label: 'Mara' });
  await expect(dialog.getByRole('button', { name: 'Save item' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save item' }).click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Secret lighthouse key' });
  await expect(row.getByRole('cell', { name: 'Mara', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: 'Character', exact: true })).toBeVisible();
  await page.reload();
  await navigate(page, 'Inventory');
  await expect(row.getByRole('cell', { name: 'Character', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Edit / transfer' }).click();
  await expect(dialog.getByRole('combobox', { name: /^Visibility/ })).toHaveValue('character');
  await dialog.getByRole('combobox', { name: 'Held by', exact: true }).selectOption('party');
  await expect(dialog.getByRole('button', { name: 'Save item' })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Held by', exact: true }).selectOption({ label: 'Ivo' });
  await dialog.getByRole('button', { name: 'Save item' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row.getByRole('cell', { name: 'Ivo', exact: true })).toBeVisible();

  await navigate(page, 'Characters');
  await page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'Ivo', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Delete Ivo?', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete Ivo?' });
  await deletion.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(deletion).not.toBeVisible();
  await navigate(page, 'Inventory');
  await expect(row.getByRole('cell', { name: 'Shared party inventory', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: 'GM only', exact: true })).toBeVisible();
});
