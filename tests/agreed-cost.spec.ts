import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page, opposition: number) {
  await page.goto('./');
  await page.evaluate(async (opposition) => {
    const { createCampaign, createCharacter } = await import('/src/domain/defaults.ts');
    const { applyCommand } = await import('/src/domain/commands.ts');
    const { saveCampaign } = await import('/src/storage/db.ts');
    const c = createCampaign('Cost recording');
    const hero = createCharacter(c.rules, 'Mara');
    hero.skills = { notice: 4 };
    c.characters.push(hero);
    const native = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((bytes: Uint8Array) => {
      bytes.fill(1);
      return bytes;
    }) as typeof crypto.getRandomValues;
    try {
      const rolled = applyCommand(
        c,
        {
          id: crypto.randomUUID(),
          type: 'roll',
          characterId: hero.id,
          action: 'overcome',
          skillId: 'notice',
          opposition,
        },
        { id: 'gm', role: 'gm', characterIds: [] },
      );
      await saveCampaign(rolled);
      localStorage.setItem('fate-selected', c.id);
    } finally {
      crypto.getRandomValues = native;
    }
  }, opposition);
  await page.reload();
  await navigate(page, 'At the table');
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Campaign' }).getByRole('button', { name, exact: true }).click();
}

test('an agreed minor cost and opposition boost remain visible after finalizing and reloading on mobile', async ({
  page,
}, info) => {
  await seed(page, 4);
  await page.getByRole('button', { name: 'Accept the outcome', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Accept the outcome', exact: true });
  const save = modal.getByRole('button', { name: 'Finalize result', exact: true });
  await expect(save).toBeDisabled();
  await modal
    .getByLabel(/^Agreed minor cost/)
    .fill('The barricade holds, but the hurried work leaves a weak spot.');
  await modal.getByRole('combobox', { name: 'Associated cost effect', exact: true }).selectOption('boost');
  await expect(save).toBeDisabled();
  await modal.getByLabel('Cost aspect or boost name', { exact: true }).fill('Hasty work');
  await save.click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.roll-result .roll-cost')).toContainText('Hasty work');
  await expect(page.locator('.activity-entry .roll-cost')).toContainText('The barricade holds');
  await expect(page.locator('.scene-aspect')).toContainText('GM/opposition');
  await page.reload();
  await navigate(page, 'At the table');
  await expect(page.locator('.roll-result .roll-cost')).toContainText('Agreed minor cost');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath('agreed-cost-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

test('a failed Overcome can be accepted as failure or resolved as success with a recorded serious cost', async ({
  page,
}) => {
  await seed(page, 6);
  await page.getByRole('button', { name: 'Accept the outcome', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Accept the outcome', exact: true });
  await expect(modal.getByLabel(/^Agreed serious cost/)).toHaveCount(0);
  await modal
    .getByRole('combobox', { name: 'Resolve the failed Overcome', exact: true })
    .selectOption('cost');
  await modal.getByLabel(/^Agreed serious cost/).fill('Mara escapes, but sprains her ankle.');
  await modal
    .getByRole('combobox', { name: 'Associated cost effect', exact: true })
    .selectOption('situation');
  await modal.getByLabel('Cost aspect or boost name', { exact: true }).fill('Twisted ankle');
  await modal
    .getByRole('combobox', { name: 'Cost effect applies to', exact: true })
    .selectOption('character');
  await modal.getByRole('button', { name: 'Finalize result', exact: true }).click();
  await expect(page.locator('.roll-result')).toContainText('Success at a cost');
  await expect(page.locator('.roll-result .roll-cost')).toContainText('Agreed serious cost');
  await expect(page.locator('.roll-result .roll-cost')).toContainText('Twisted ankle');
  await page.getByRole('button', { name: 'Undo roll', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm undo', exact: true }).click();
  await expect(page.locator('.roll-result')).toHaveCount(0);
  await navigate(page, 'Characters');
  await expect(page.getByText('Twisted ankle', { exact: true })).toHaveCount(0);
});
