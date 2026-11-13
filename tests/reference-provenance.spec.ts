import { expect, test, type Page } from '@playwright/test';

const githubSource =
  /^https:\/\/github\.com\/fate-srd\/fate-srd-content\/blob\/[a-f0-9]{40}\/source\/fate-core-SRD\.html$/;

async function createCampaign(page: Page, name: string, system = 'fate-core') {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a campaign', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Give your story a name', exact: true });
  await dialog.getByLabel('Campaign name', { exact: true }).fill(name);
  if (system !== 'fate-core')
    await dialog.getByRole('combobox', { name: 'Rules system', exact: true }).selectOption(system);
  await dialog.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
}

async function readOrSetStoredEdition(page: Page, contentVersion?: string) {
  return page.evaluate(async (version) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fate-core-companion');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction('campaigns', version ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('campaigns');
      const campaigns = await new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (campaigns.length !== 1) throw new Error('Expected one isolated fixture campaign.');
      if (version) {
        campaigns[0].rules.contentVersion = version;
        store.put(campaigns[0]);
      }
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return campaigns[0];
    } finally {
      database.close();
    }
  }, contentVersion);
}

test('Accelerated uses the existing Rules library categories, offline reader, and specific section links', async ({
  page,
  context,
}) => {
  await createCampaign(page, 'Accelerated reference fixture', 'fate-accelerated');
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: 'Rules library', exact: true })
    .click();
  const filters = page.getByRole('complementary', { name: 'Reference categories' });
  await expect(filters.locator('.reference-filter > span:first-child')).toHaveText([
    'All references',
    'About',
    'Basics',
    'Campaigns & advancement',
    'Characters',
    'Aspects & Fate points',
    'Skills & stunts',
    'Actions & outcomes',
    'Challenges & conflicts',
    'Running the game',
  ]);
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(page.url()).origin) externalRequests.push(request.url());
  });
  await context.setOffline(true);
  const search = page.getByRole('searchbox', { name: 'Search rules and references' });
  const article = page.getByRole('dialog');
  await search.fill('Approaches');
  await filters.getByRole('button', { name: /^Characters/ }).click();
  await page
    .locator('.reference-card')
    .filter({ has: page.getByRole('heading', { name: 'Approaches', exact: true }) })
    .click();
  await expect(
    article.getByRole('link', { name: 'Read this section on Fate-SRD.com', exact: true }),
  ).toHaveAttribute('href', 'https://fate-srd.com/fate-accelerated/who-do-you-want-be#approaches');
  await expect(article.locator('.reference-article')).toContainText('Careful');
  await article.getByRole('button', { name: 'Close reference', exact: true }).click();
  await filters.getByRole('button', { name: /^Aspects & Fate points/ }).click();
  await search.fill('Boosts');
  await page
    .locator('.reference-card')
    .filter({ has: page.getByRole('heading', { name: 'What Kinds of Aspects Are There?', exact: true }) })
    .click();
  await expect(article.locator('.reference-article')).toContainText('Boosts:');
  await expect(
    article.getByRole('link', { name: 'Read this section on Fate-SRD.com', exact: true }),
  ).toHaveAttribute(
    'href',
    'https://fate-srd.com/fate-accelerated/aspects-fate-points#what-kinds-of-aspects-are-there',
  );
  await article.getByText('Source attribution', { exact: true }).click();
  await expect(
    article.getByRole('link', { name: 'View original GitHub source', exact: true }),
  ).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/fate-srd\/fate-srd-content\/blob\/[a-f0-9]{40}\/source\/fate-accelerated-SRD\.html#L696$/,
  );
  expect(externalRequests).toEqual([]);
  await context.setOffline(false);
});

test('the offline library links to readable Fate SRD pages with separate source attribution', async ({
  page,
  context,
}, testInfo) => {
  await createCampaign(page, 'Repository reference fixture');
  await page.getByRole('button', { name: 'Rules library', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Reference edition notice' })).toHaveCount(0);
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(page.url()).origin) {
      externalRequests.push(request.url());
    }
  });
  await context.setOffline(true);
  await page.getByRole('searchbox', { name: 'Search rules and references' }).fill('stunts refresh');
  await page
    .locator('.reference-card')
    .filter({
      has: page.getByRole('heading', { name: 'Stunts and Refresh', exact: true }),
    })
    .filter({ has: page.getByText('Characters', { exact: true }) })
    .click();
  const article = page.getByRole('dialog');
  await expect(article.locator('.reference-article')).toContainText(/three stunts for free/i);
  const sectionLink = article.getByRole('link', { name: 'Read this section on Fate-SRD.com', exact: true });
  await expect(sectionLink).toHaveAttribute('href', 'https://fate-srd.com/fate-core/stunts-refresh');
  const sourceLink = article.getByRole('link', { name: 'View original GitHub source', exact: true });
  await expect(sourceLink).not.toBeVisible();
  await article.getByText('Source attribution', { exact: true }).click();
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/fate-srd\/fate-srd-content\/blob\/[a-f0-9]{40}\/source\/fate-core-SRD\.html#L\d+(?:-L\d+)?$/,
  );
  await article.getByRole('button', { name: 'Close reference', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search rules and references' }).fill('Balancing Stunt Utility');
  await page
    .locator('.reference-card')
    .filter({ has: page.getByRole('heading', { name: 'Balancing Stunt Utility', exact: true }) })
    .click();
  await expect(
    article.getByRole('link', { name: 'Read this section on Fate-SRD.com', exact: true }),
  ).toHaveAttribute('href', 'https://fate-srd.com/fate-core/building-stunts#balancing-stunt-utility');
  await article.getByRole('button', { name: 'Close reference', exact: true }).click();
  await page.getByText('Source, license & attribution', { exact: true }).click();
  const attribution = page.locator('.reference-attribution');
  await expect(attribution).toContainText('Evil Hat Productions, LLC');
  await expect(attribution).toContainText('Leonard Balsera');
  await expect(attribution).toContainText('Repository revision:');
  await expect(attribution.getByRole('link', { name: 'Pinned GitHub source', exact: true })).toHaveAttribute(
    'href',
    githubSource,
  );
  await expect(attribution.getByRole('link', { name: 'CC BY 3.0 license', exact: true })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/3.0/',
  );
  await expect(
    attribution.getByRole('link', { name: 'Official licensing guide', exact: true }),
  ).toHaveAttribute('href', 'https://fate-srd.com/official-licensing-fate');
  expect(externalRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('reference-provenance.png'), fullPage: true });
  await context.setOffline(false);
});

test('older campaign references are visibly distinguished without rewriting saved rules or history', async ({
  page,
}) => {
  await createCampaign(page, 'Older reference fixture');
  const oldEdition = 'core-srd-2013-cc-2023-archive';
  const original = await readOrSetStoredEdition(page, oldEdition);
  await page.reload();
  await page.getByRole('button', { name: 'Rules library', exact: true }).click();
  const notice = page.getByRole('complementary', { name: 'Reference edition notice' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(oldEdition);
  await expect(notice).toContainText('You are browsing the bundled GitHub edition.');
  await expect(notice).toContainText('core-srd-github-');
  await page.getByRole('searchbox', { name: 'Search rules and references' }).fill('consequences');
  await expect(page.locator('.reference-card').first()).toBeVisible();
  expect(await readOrSetStoredEdition(page)).toEqual(original);
});
