import { expect, test, type Locator } from '@playwright/test';

test('repeated dead-session replacement preserves identity and repairs stale pairing with explicit approval', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const hostContext = await browser.newContext();
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const gm = await hostContext.newPage();
    const player = await playerContext.newPage();
    await gm.goto('./');
    await gm.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
    await gm.getByRole('button', { name: 'Connect', exact: true }).click();
    const host = gm.getByRole('dialog', { name: 'Connect your table', exact: true });
    const openJoin = async () => {
      const menu = player.getByRole('button', { name: 'Open navigation', exact: true });
      if (
        (await menu.isVisible()) &&
        !(await player.locator('.sidebar').evaluate((el) => el.classList.contains('open')))
      )
        await menu.click();
      await player
        .locator('.sidebar')
        .getByRole('button', { name: /Connect to a table|Connection & drafts/ })
        .click();
      const join = player.getByRole('dialog', { name: 'Connect your table', exact: true });
      await join.getByRole('button', { name: 'Join a table', exact: true }).click();
      return join;
    };
    const exchange = async (join: Locator) => {
      const summary = host.getByText('Copy/paste invitation', { exact: true });
      if (!(await host.getByRole('textbox', { name: /^1\. Send this offer/ }).isVisible()))
        await summary.click();
      const offer = await host.getByRole('textbox', { name: /^1\. Send this offer/ }).inputValue();
      await join.getByRole('textbox', { name: "Paste the GM's offer", exact: true }).fill(offer);
      await join.getByRole('button', { name: 'Create connection answer', exact: true }).click();
      await join.getByText('Copy/paste response', { exact: true }).click();
      const answer = await join.getByRole('textbox', { name: /^Send this answer back/ }).inputValue();
      // Closing the dialog must not lose or replace the answer already shown to the GM.
      await join.getByRole('button', { name: 'Done', exact: true }).click();
      join = await openJoin();
      await join.getByText('Copy/paste response', { exact: true }).click();
      await expect(join.getByRole('textbox', { name: /^Send this answer back/ })).toHaveValue(answer);
      await host.getByRole('textbox', { name: "2. Paste the player's answer", exact: true }).fill(answer);
      await host.getByRole('button', { name: 'Connect player', exact: true }).click();
      return join;
    };
    await player.goto('./');
    let join = await openJoin();
    await expect(join.getByLabel('Your name', { exact: true })).toHaveCSS('font-size', '16px');
    await join.getByLabel('Your name', { exact: true }).fill('Nick');
    await host.getByRole('button', { name: 'Create player invitation', exact: true }).click();
    join = await exchange(join);
    await expect(host.getByRole('heading', { name: 'Nick wants to join' })).toBeVisible();
    await host.getByRole('checkbox', { name: 'Mara Voss', exact: true }).check();
    await host.getByRole('button', { name: 'Approve player', exact: true }).click();
    await expect(join.getByText('connected', { exact: true })).toBeVisible({ timeout: 20_000 });
    const credential = async () =>
      player.evaluate(() => {
        const key = Object.keys(localStorage).find((key) => key.startsWith('fate.client-grant.v1.'))!;
        return { key, ...JSON.parse(localStorage.getItem(key)!) };
      });
    const original = await credential();
    await host.getByText('Approved devices and revocation', { exact: true }).click();
    for (let attempt = 0; attempt < 3; attempt++) {
      // A real reload destroys the original RTCPeerConnection, unlike a simulated state change.
      await player.reload();
      join = await openJoin();
      await expect(join.getByLabel('Your name', { exact: true })).toHaveValue('Nick');
      await host.getByRole('button', { name: 'Reconnect Nick', exact: true }).click();
      join = await exchange(join);
      await expect(join.getByText('connected', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(host.getByRole('button', { name: 'Approve player', exact: true })).toHaveCount(0);
      await expect(host.locator('.list-row')).toHaveCount(1);
      await expect(host.getByRole('button', { name: 'Reconnect Nick', exact: true })).toHaveCount(1);
      expect(await credential()).toEqual(original);
    }
    // A stale token must not block the transport or silently regain permission.
    await player.evaluate(({ key }) => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...saved, token: '0'.repeat(64) }));
    }, original);
    await player.reload();
    join = await openJoin();
    await host.getByRole('button', { name: 'Reconnect Nick', exact: true }).click();
    join = await exchange(join);
    await expect(host.getByText('The saved pairing could not be verified.', { exact: false })).toBeVisible();
    await expect(join.getByText('awaiting-approval', { exact: true })).toBeVisible();
    await expect(player.getByText('Connected player view', { exact: true })).toHaveCount(0);
    await host.getByRole('button', { name: 'Done', exact: true }).click();
    await gm.getByRole('button', { name: 'Hosting', exact: true }).click();
    await expect(host.getByRole('checkbox', { name: 'Mara Voss', exact: true })).toBeChecked();
    await host.getByRole('button', { name: 'Approve player', exact: true }).click();
    await expect(join.getByText('connected', { exact: true })).toBeVisible({ timeout: 20_000 });
    const renewed = await credential();
    expect(renewed.memberId).toBe(original.memberId);
    expect(renewed.token).not.toBe(original.token);
    await host.getByText('Approved devices and revocation', { exact: true }).click();
    await expect(host.getByRole('button', { name: 'Reconnect Nick', exact: true })).toHaveCount(1);
    await expect(host.locator('.list-row')).toHaveCount(1);
    await join.getByRole('button', { name: 'Done', exact: true }).click();
    await host.getByRole('button', { name: 'Done', exact: true }).click();
    for (const page of [gm, player]) {
      const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
      if (
        (await menu.isVisible()) &&
        !(await page.locator('.sidebar').evaluate((el) => el.classList.contains('open')))
      )
        await menu.click();
      await page
        .getByRole('navigation', { name: 'Campaign' })
        .getByRole('button', { name: 'At the table', exact: true })
        .click();
    }
    await player
      .getByRole('combobox', { name: 'Character', exact: true })
      .selectOption({ label: 'Mara Voss' });
    await player.getByRole('button', { name: /Roll the dice/ }).click();
    for (const page of [gm, player]) await expect(page.locator('.roll-result')).toBeVisible();
    await expect(player.locator('.roll-total strong')).toHaveText(
      await gm.locator('.roll-total strong').innerText(),
    );
  } finally {
    await Promise.allSettled([hostContext.close(), playerContext.close()]);
  }
});
