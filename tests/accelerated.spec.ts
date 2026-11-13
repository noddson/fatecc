import { test, expect, type Page } from '@playwright/test';

async function createCampaign(page: Page, name: string, system: string) {
  await page.getByRole('button', { name: 'Create a campaign', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Campaign name', { exact: true }).fill(name);
  await dialog.getByRole('combobox', { name: 'Rules system', exact: true }).selectOption(system);
  await expect(dialog.locator('.rules-choice-summary')).toContainText(
    system === 'fate-core' ? 'Fate Core uses skills' : 'Fate Accelerated uses six approaches',
  );
  await dialog.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page.locator('.sidebar-campaign .system-badge')).toHaveCount(0);
  await expect(page.locator('.breadcrumb .system-badge')).toHaveText(
    system === 'fate-core' ? 'Fate Core' : 'Fate Accelerated',
  );
}
const navigate = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Campaign' }).getByRole('button', { name, exact: true }).click();

test('campaign choice, subtle identity, Accelerated sheets, table and offline reference selection survive reload', async ({
  page,
}) => {
  await page.goto('./');
  await createCampaign(page, 'Sky pirates', 'fate-accelerated');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sky pirates');
  await expect(page.locator('.breadcrumb .system-badge')).toHaveText('Fate Accelerated');
  await page.reload();
  await expect(page.locator('.breadcrumb .system-badge')).toHaveText('Fate Accelerated');
  await navigate(page, 'Characters');
  await page.getByRole('button', { name: 'New character', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Captain');
  await page.getByRole('dialog').getByRole('button', { name: 'Create character', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'High concept', exact: false })
    .fill('Captain of the Cirrus Skimmer');
  await page.getByRole('textbox', { name: 'Trouble', exact: false }).fill('Wanted by the navy');
  await expect(page.getByText('Phase trio', { exact: false })).not.toBeVisible();
  await page.getByRole('button', { name: 'Approaches', exact: true }).click();
  for (const [approach, value] of Object.entries({
    Careful: 0,
    Clever: 2,
    Flashy: 1,
    Forceful: 2,
    Quick: 3,
    Sneaky: 1,
  })) {
    await page.getByRole('combobox', { name: `${approach} rating`, exact: true }).selectOption(String(value));
  }
  await expect(page.locator('.character-heading .save-label')).toHaveText('Draft saved');
  await page.getByRole('button', { name: 'Print character', exact: true }).click();
  const printDialog = page.getByRole('dialog', { name: 'Print character sheets', exact: true });
  await expect(printDialog.locator('.fs-skills')).toContainText('Approaches');
  await expect(printDialog.locator('.fs-skill-table')).toContainText('Careful');
  await expect(printDialog.locator('.fs-stress-track')).toHaveCount(1);
  await printDialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Growth & recovery', exact: true }).click();
  await page.getByRole('button', { name: 'Award milestone', exact: true }).click();
  const milestone = page.getByRole('dialog', { name: 'A turning point' });
  await milestone.getByRole('combobox', { name: 'Milestone', exact: true }).selectOption('significant');
  await milestone
    .getByRole('textbox', { name: 'What happened?', exact: true })
    .fill('Escaped the Royal Navy');
  await milestone.getByRole('button', { name: 'Award milestone', exact: true }).click();
  await page.getByRole('combobox', { name: 'Raise an approach', exact: true }).selectOption('quick');
  await page.getByRole('button', { name: 'Raise approach by 1', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Raise an approach', exact: true })).not.toBeVisible();
  await navigate(page, 'At the table');
  await expect(page.getByRole('combobox', { name: 'Approach', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Approach', exact: true }).selectOption('quick');
  await page.getByRole('button', { name: 'Roll the dice', exact: false }).click();
  await expect(page.locator('.roll-result')).toContainText('Quick');
  await expect(page.locator('.roll-math')).toContainText('Quick +4');
  await navigate(page, 'Rules library');
  await expect(page.getByRole('heading', { name: 'Fate Accelerated', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('approach');
  await expect(page.locator('.reference-card').first()).toBeVisible();
  await expect(page.locator('.reference-source').first()).toContainText('Fate Accelerated');
  await page.screenshot({ path: '/private/tmp/fate-accelerated-desktop.png', fullPage: true });
  await navigate(page, 'Game settings');
  await expect(
    page.getByRole('button', { name: 'Use Fate Accelerated defaults', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Governing skill', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const card = page.locator('.campaign-card').filter({ hasText: 'Sky pirates' });
  await expect(card.locator('.system-badge')).toHaveText('Fate Accelerated');
  await createCampaign(page, 'Core adventurers', 'fate-core');
  await expect(page.locator('.breadcrumb .system-badge')).toHaveText('Fate Core');
  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(
    page.locator('.campaign-card').filter({ hasText: 'Core adventurers' }).locator('.system-badge'),
  ).toHaveText('Fate Core');
  await page.screenshot({ path: '/private/tmp/fate-campaign-system-cards.png' });
  await card.locator('.campaign-card-open').click();
  await page.screenshot({ path: '/private/tmp/fate-accelerated-overview.png' });
  await expect(page.locator('.breadcrumb .system-badge')).toHaveText('Fate Accelerated');
});

test('Accelerated identity stays visible on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await createCampaign(page, 'Tiny sky pirates', 'fate-accelerated');
  await expect(page.locator('.breadcrumb .system-badge')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/fate-accelerated-mobile.png', fullPage: true });
});

test('Cirrus Skimmer loads a playable Accelerated starter and keeps game-sheet metadata out of print', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore Cirrus Skimmer (Accelerated)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cirrus Skimmer', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('.breadcrumb .system-badge')).toHaveText('Fate Accelerated');
  await expect(page.locator('.sidebar-campaign .system-badge')).toHaveCount(0);
  const banner = page.locator('.story-banner .campaign-banner-image');
  await expect(banner).toHaveAttribute('src', /cirrus-skimmer-sea-of-clouds\.png$/);
  await expect
    .poll(() => banner.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([2172, 724]);
  await page.screenshot({ path: '/private/tmp/fate-cirrus-banner-overview.png', fullPage: true });
  await navigate(page, 'Maps & zones');
  const chart = page.locator('.map-image');
  await expect
    .poll(() => chart.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([1536, 1024]);
  await expect(page.getByRole('button', { name: /^Zone:/ })).toHaveCount(7);
  await expect(page.getByRole('button', { name: /^Token:/ })).toHaveCount(3);
  await page.screenshot({ path: '/private/tmp/fate-sea-of-clouds-map-ui.png', fullPage: true });
  await navigate(page, 'Characters');
  await expect(page.locator('.character-card')).toHaveCount(3);
  await page.locator('.character-card').filter({ hasText: 'Voltaire' }).click();
  await page.getByRole('button', { name: 'Approaches', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Flashy rating', exact: true })).toHaveValue('3');
  await expect(page.getByRole('combobox', { name: 'Forceful rating', exact: true })).toHaveValue('0');
  await navigate(page, 'At the table');
  await page.getByRole('combobox', { name: 'Approach', exact: true }).selectOption('flashy');
  await page.getByRole('button', { name: /Roll the dice/ }).click();
  await expect(page.locator('.roll-math')).toContainText('Flashy +3');
  await navigate(page, 'Print sheets');
  const game = page.locator('.print-packet .fs-game');
  await expect(game).toContainText('Cirrus Skimmer');
  await expect(game).toContainText('Fate Accelerated');
  await expect(game).toContainText('Approaches');
  await expect(game).not.toContainText(/rules revision|Governing skill:|Fixed capacity/i);
  await game.screenshot({ path: '/private/tmp/fate-cirrus-game-sheet.png' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cirrus Skimmer', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(
    page.locator('.campaign-card').filter({ hasText: 'Cirrus Skimmer' }).locator('.system-badge'),
  ).toHaveText('Fate Accelerated');
});

test('Accelerated mook profiles persist and roll specialties instead of approaches', async ({ page }) => {
  await page.goto('./');
  await createCampaign(page, 'Mook encounter', 'fate-accelerated');
  await navigate(page, 'Characters');
  await page.getByRole('button', { name: 'New character', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new character' });
  await dialog.getByLabel('Name', { exact: true }).fill('Four thugs');
  await dialog.getByRole('combobox', { name: 'Role', exact: true }).selectOption('nameless');
  await dialog.getByRole('button', { name: 'Create character', exact: true }).click();
  await page.getByRole('button', { name: 'Mook profile', exact: true }).click();
  await page.getByRole('textbox', { name: 'Skilled at (+2)', exact: true }).fill('Ganging up');
  await page.getByRole('textbox', { name: 'Bad at (−2)', exact: true }).fill('Thinking ahead');
  await page.getByRole('spinbutton', { name: /Group size/ }).fill('4');
  await expect(page.locator('.character-heading .save-label')).toHaveText('Draft saved');
  await page.reload();
  await navigate(page, 'Characters');
  await page.getByRole('button', { name: /NPCs & adversaries/ }).click();
  await page.locator('.character-card').filter({ hasText: 'Four thugs' }).click();
  await page.getByRole('button', { name: 'Mook profile', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Skilled at (+2)', exact: true })).toHaveValue('Ganging up');
  await expect(page.getByRole('spinbutton', { name: /Group size/ })).toHaveValue('4');
  await navigate(page, 'At the table');
  await page.getByRole('combobox', { name: 'Mook rating', exact: true }).selectOption('mook-good');
  await page.getByRole('button', { name: /Roll the dice/ }).click();
  await expect(page.locator('.roll-math')).toContainText('Skilled (+2): Ganging up +2');
});
