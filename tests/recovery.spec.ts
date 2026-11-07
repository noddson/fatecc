import { expect, test, type Page } from '@playwright/test';

test('a surviving table recovers approval and state after interruption and tab suspension', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const contexts = [gmContext, playerContext];
  try {
    for (const context of contexts) {
      await context.addInitScript(() => {
        const peers: RTCPeerConnection[] = [];
        Object.assign(window, { recoveryPeers: peers });
        const NativePeer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePeer {
          constructor(configuration?: RTCConfiguration) {
            super(configuration);
            peers.push(this);
          }
        };
        const send = RTCDataChannel.prototype.send;
        const recoveryTraffic = { drop: false, dropped: 0 };
        Object.assign(window, { recoveryTraffic });
        RTCDataChannel.prototype.send = function (data: string) {
          if (this.label === 'fate-control' && recoveryTraffic.drop) {
            recoveryTraffic.dropped++;
            return;
          }
          send.call(this, data);
        };
      });
    }
    const gm = await gmContext.newPage();
    const player = await playerContext.newPage();
    const pages = [gm, player];
    await Promise.all(pages.map((page) => page.goto('./')));
    await gm.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
    await gm.getByRole('button', { name: 'Connect', exact: true }).click();
    const hostDialog = gm.getByRole('dialog', { name: 'Connect your table', exact: true });
    await hostDialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
    await hostDialog.getByText('Copy/paste invitation', { exact: true }).click();
    const offer = await hostDialog.getByRole('textbox', { name: /^1\. Send this offer/ }).inputValue();
    await player.getByRole('button', { name: 'Connect to a table', exact: true }).click();
    const joinDialog = player.getByRole('dialog', { name: 'Connect your table', exact: true });
    await joinDialog.getByRole('button', { name: 'Join a table', exact: true }).click();
    await joinDialog.getByLabel('Your name', { exact: true }).fill('Waking player');
    await joinDialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true }).fill(offer);
    await joinDialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
    await joinDialog.getByText('Copy/paste response', { exact: true }).click();
    const answer = await joinDialog.getByRole('textbox', { name: /^Send this answer back/ }).inputValue();
    await hostDialog.getByRole('textbox', { name: "2. Paste the player's answer", exact: true }).fill(answer);
    await hostDialog.getByRole('button', { name: 'Connect player', exact: true }).click();
    await expect(
      hostDialog.getByRole('heading', { name: 'Waking player wants to join', exact: true }),
    ).toBeVisible();
    await hostDialog.getByRole('checkbox', { name: 'Mara Voss', exact: true }).check();
    await hostDialog.getByRole('button', { name: 'Approve player', exact: true }).click();
    await expect(joinDialog.getByText('connected', { exact: true })).toBeVisible({ timeout: 20_000 });
    await hostDialog.getByRole('button', { name: 'Done', exact: true }).click();
    await joinDialog.getByRole('button', { name: 'Done', exact: true }).click();

    // Inject a recoverable state report while retaining real native channels.
    // This isolates the approval-loss regression; it is not a physical sleep test.
    const interrupt = (page: Page) =>
      page.evaluate(() => {
        const pc = (window as unknown as { recoveryPeers: RTCPeerConnection[] }).recoveryPeers[0];
        Object.defineProperty(pc, 'connectionState', { configurable: true, value: 'disconnected' });
        pc.dispatchEvent(new Event('connectionstatechange'));
      });
    const restore = (page: Page) =>
      page.evaluate(() => {
        const pc = (window as unknown as { recoveryPeers: RTCPeerConnection[] }).recoveryPeers[0];
        Reflect.deleteProperty(pc, 'connectionState');
        pc.dispatchEvent(new Event('connectionstatechange'));
      });
    await Promise.all(pages.map(interrupt));
    await expect(
      player.getByText('Reconnecting to the table · your saved approval is retained', { exact: true }),
    ).toBeVisible();
    await player
      .locator('.remote-banner')
      .getByRole('button', { name: 'Connection & drafts', exact: true })
      .click();
    await expect(joinDialog.getByText('reconnecting', { exact: true })).toBeVisible();
    await joinDialog.getByRole('button', { name: 'Done', exact: true }).click();
    await Promise.all(pages.map(restore));
    await expect(player.getByText('Connected player view', { exact: true })).toBeVisible();

    // A native connected state must not hide a control path that silently drops messages.
    await player.evaluate(() => {
      (window as any).recoveryTraffic.drop = true;
      window.dispatchEvent(new Event('online'));
    });
    await expect(
      player.getByText('Reconnecting to the table · your saved approval is retained', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => player.evaluate(() => (window as any).recoveryTraffic.dropped))
      .toBeGreaterThan(1);
    expect(await player.evaluate(() => (window as any).recoveryPeers[0].connectionState)).toBe('connected');
    await expect(player.getByText('Connected player view', { exact: true })).toHaveCount(0);
    await player.evaluate(() => {
      (window as any).recoveryTraffic.drop = false;
    });
    await expect(player.getByText('Connected player view', { exact: true })).toBeVisible({ timeout: 10_000 });

    for (const page of pages) {
      await page
        .getByRole('navigation', { name: 'Campaign' })
        .getByRole('button', { name: 'At the table', exact: true })
        .click();
      await page
        .getByRole('combobox', { name: 'Character', exact: true })
        .selectOption({ label: 'Mara Voss' });
      await page.getByRole('combobox', { name: 'Skill', exact: true }).selectOption('notice');
    }
    const session = await playerContext.newCDPSession(player);
    try {
      await session.send('Page.setWebLifecycleState', { state: 'frozen' });
      await gm.getByRole('button', { name: /Roll the dice/ }).click();
      await expect(gm.locator('.activity-entry').filter({ hasText: 'Mara Voss · Notice' })).toHaveCount(1);
    } finally {
      await session.send('Page.setWebLifecycleState', { state: 'active' });
      await session.detach();
    }
    await expect(player.locator('.activity-entry').filter({ hasText: 'Mara Voss · Notice' })).toHaveCount(1);
    await player.getByRole('button', { name: /Roll the dice/ }).click();
    for (const page of pages) {
      await expect(page.locator('.activity-entry').filter({ hasText: 'Mara Voss · Notice' })).toHaveCount(2);
      expect(
        await page.evaluate(
          () => (window as unknown as { recoveryPeers: RTCPeerConnection[] }).recoveryPeers.length,
        ),
      ).toBe(1);
    }
    await expect(player.locator('.roll-total strong')).toHaveText(
      await gm.locator('.roll-total strong').innerText(),
    );
    await gm.getByRole('button', { name: 'Hosting', exact: true }).click();
    await expect(hostDialog.getByText('1 / 7 players', { exact: true })).toBeVisible();
    await expect(hostDialog.getByRole('button', { name: 'Approve player', exact: true })).toHaveCount(0);
    await gm.screenshot({ path: testInfo.outputPath('gm-recovered.png'), fullPage: true });
    await player.screenshot({ path: testInfo.outputPath('player-recovered.png'), fullPage: true });
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
