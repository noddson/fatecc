import { expect, test } from '@playwright/test';

test('lists multiple joined campaigns, retains the legacy cache, and opens each with its own read-only identity', async ({
  page,
}) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const { createCampaign, createCharacter } = await import('/src/domain/defaults.ts');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fate-player-cache', 10);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots'))
          request.result.createObjectStore('snapshots', { keyPath: 'id' });
      };
    });
    for (const [id, name, hero] of [
      ['latest', 'Legacy table', 'Legacy hero'],
      ['second', 'Second table', 'Second hero'],
    ]) {
      const campaign = createCampaign(name),
        character = createCharacter(campaign.rules, hero);
      const actor = { id: 'player-' + id, role: 'player' as const, characterIds: [character.id] };
      character.ownerId = actor.id;
      campaign.characters = [character];
      campaign.members.push({ ...actor, name: 'Human ' + id });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put({ id, campaign, actor });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    database.close();
  });
  await page.reload();
  for (const [name, hero] of [
    ['Legacy table', 'Legacy hero'],
    ['Second table', 'Second hero'],
  ]) {
    await expect(page.getByRole('heading', { name: 'Joined campaigns', exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Open joined campaign ${name}`, exact: true }).click();
    await expect(page.locator('.remote-banner')).toContainText('Read-only player copy');
    await page
      .getByRole('navigation', { name: 'Campaign' })
      .getByRole('button', { name: 'At the table', exact: true })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Character', exact: true }).locator('option:checked'),
    ).toHaveText(hero);
    await expect(page.getByRole('button', { name: /Roll the dice/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Return to my campaigns', exact: true }).click();
  }
});
