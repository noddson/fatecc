import { test, expect, type Page } from '@playwright/test';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Connect your table', exact: true });
async function openHost(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Start hosting', exact: true }).click();
  await expect(dialog(page).getByLabel('Room code', { exact: true })).toHaveValue(
    /^fatecore-[A-HJ-NP-Z2-9]{8}$/,
  );
  return dialog(page).getByLabel('Room code', { exact: true }).inputValue();
}
async function approve(page: Page, name: string) {
  await expect(
    dialog(page).getByRole('heading', { name: `${name} wants to join`, exact: true }),
  ).toBeVisible();
  await dialog(page).getByRole('checkbox', { name: 'Mara Voss', exact: true }).check();
  await dialog(page).getByRole('button', { name: 'Approve player', exact: true }).click();
}
async function join(page: Page, address: string, name: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect to a table', exact: true }).click();
  await dialog(page).getByLabel('Your name', { exact: true }).fill(name);
  await dialog(page).getByLabel('Room code or join link').fill(address);
  await dialog(page).getByRole('button', { name: 'Join table', exact: true }).click();
}

test('room code and QR join, saved approval, automatic transport replacement, player reload, and host restart', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  await playerContext.addInitScript(() => {
    const peers: RTCPeerConnection[] = [];
    (window as any).roomNativePeers = peers;
    const NativePeer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePeer {
      constructor(config?: RTCConfiguration) {
        super(config);
        peers.push(this);
      }
    };
  });
  const qrContext = await browser.newContext();
  try {
    const gm = await gmContext.newPage();
    const player = await playerContext.newPage();
    const qr = await qrContext.newPage();
    const code = await openHost(gm);
    await expect(
      dialog(gm).getByRole('button', { name: 'Create player invitation', exact: true }),
    ).toHaveCount(0);
    await expect(dialog(gm).getByRole('button', { name: 'Scan response QR', exact: true })).toHaveCount(0);
    const qrData = await dialog(gm)
      .getByRole('img', { name: 'Room QR code', exact: true })
      .getAttribute('src');
    expect(qrData).toMatch(/^data:image\/png;base64,/);
    await join(player, code, 'Room player');
    await approve(gm, 'Room player');
    await expect(dialog(player).getByText('connected', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(
      player.locator('.topbar-actions').getByRole('button', { name: /^(connected|syncing-assets)$/ }),
    ).toBeVisible();
    // The QR image is generated and decoded locally, then the same room serves another player.
    await qr.goto('./');
    await qr.getByRole('button', { name: 'Connect to a table', exact: true }).click();
    await dialog(qr).getByLabel('Your name', { exact: true }).fill('QR player');
    await dialog(qr)
      .getByLabel('Upload room QR image', { exact: true })
      .setInputFiles({
        name: 'room.png',
        mimeType: 'image/png',
        buffer: Buffer.from(qrData!.split(',')[1], 'base64'),
      });
    await expect(dialog(qr).getByLabel('Room code or join link')).toHaveValue(new RegExp(code));
    const link = await dialog(qr).getByLabel('Room code or join link').inputValue();
    expect(link).toContain(`join=${code}`);
    await dialog(qr).getByRole('button', { name: 'Join table', exact: true }).click();
    await approve(gm, 'QR player');
    await expect(dialog(qr).getByText('connected', { exact: true })).toBeVisible({ timeout: 30_000 });
    await dialog(qr).getByRole('button', { name: 'Done', exact: true }).click();
    // Destroy a real native transport: a new PeerJS-negotiated transport must restore approval automatically.
    const previousCount = await player.evaluate(() => (window as any).roomNativePeers.length);
    await player.evaluate(async () => {
      const peer = (window as any).roomNativePeers?.find(
        (pc: RTCPeerConnection) => pc.connectionState === 'connected',
      );
      if (!peer) throw new Error('Expected a real PeerJS transport');
      peer.close();
    });
    await expect
      .poll(() => player.evaluate(() => (window as any).roomNativePeers.length))
      .toBeGreaterThan(previousCount);
    await expect(
      player.locator('.topbar-actions').getByRole('button', { name: /^(connected|syncing-assets)$/ }),
    ).toBeVisible();
    await expect(dialog(gm).getByRole('button', { name: 'Approve player', exact: true })).toHaveCount(0);
    // Reload also destroys every transport, while leaving device credentials and saved room details.
    await player.reload();
    await player.getByRole('button', { name: /Open joined campaign The Lantern Coast/ }).click();
    await player.locator('.topbar-actions').getByRole('button', { name: 'Offline', exact: true }).click();
    await dialog(player).getByRole('button', { name: 'Reconnect', exact: true }).click();
    await expect(
      player.locator('.topbar-actions').getByRole('button', { name: /^(connected|syncing-assets)$/ }),
    ).toBeVisible();
    await expect(dialog(gm).getByRole('button', { name: 'Approve player', exact: true })).toHaveCount(0);
    // Restart the host with persisted room and signing identity. Existing clients retry without new codes.
    await gm.reload();
    await gm.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog(gm).getByRole('button', { name: 'Start hosting', exact: true }).click();
    await expect(dialog(gm).getByLabel('Room code', { exact: true })).toHaveValue(code);
    await expect(
      player.locator('.topbar-actions').getByRole('button', { name: /^(connected|syncing-assets)$/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      qr.locator('.topbar-actions').getByRole('button', { name: /^(connected|syncing-assets)$/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(dialog(gm).getByRole('button', { name: 'Approve player', exact: true })).toHaveCount(0);
    await gm.screenshot({ path: info.outputPath('peerjs-host.png'), fullPage: true });
    await player.setViewportSize({ width: 390, height: 844 });
    await player.screenshot({ path: info.outputPath('peerjs-player-mobile.png'), fullPage: true });
  } finally {
    await Promise.allSettled([gmContext.close(), playerContext.close(), qrContext.close()]);
  }
});

test('a QR join link opens the join dialog and an occupied host ID reports a collision', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const other = await browser.newContext();
  try {
    const host = await context.newPage();
    const code = await openHost(host);
    await dialog(host).getByText('Connection settings · STUN and TURN', { exact: true }).click();
    const stun = dialog(host).getByRole('combobox', { name: 'STUN service', exact: true });
    await expect(stun).toHaveValue('google');
    await expect(stun.locator('option[value="none"]')).toHaveCount(0);
    await dialog(host).getByText('Connection settings · STUN and TURN', { exact: true }).click();
    const player = await other.newPage();
    await player.goto(`./#join=${code}`);
    await expect(dialog(player).getByLabel('Room code or join link')).toHaveValue(new RegExp(code));
    // A second host tab in the same profile shares the same saved address.
    const duplicate = await context.newPage();
    await duplicate.goto('./');
    await duplicate.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog(duplicate).getByRole('button', { name: 'Start hosting', exact: true }).click();
    await expect(duplicate.getByText(/This room code is already in use/)).toBeVisible();
    await dialog(duplicate).getByRole('button', { name: 'New room code', exact: true }).click();
    await expect(dialog(duplicate).getByLabel('Room code', { exact: true })).not.toHaveValue(code);
  } finally {
    await context.close();
    await other.close();
  }
});

test('a different host claiming the saved room cannot receive a reconnect credential', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const impostorContext = await browser.newContext();
  await playerContext.addInitScript(() => {
    (window as any).roomHellos = [];
    const send = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (data: string) {
      if (this.label === 'fate-control' && typeof data === 'string') {
        try {
          const frame = JSON.parse(data);
          if (frame.total === 1 && JSON.parse(frame.data).type === 'hello')
            (window as any).roomHellos.push(JSON.parse(frame.data));
        } catch {
          /* Ignore non-application traffic. */
        }
      }
      send.call(this, data);
    };
  });
  try {
    const host = await hostContext.newPage();
    const player = await playerContext.newPage();
    const impostor = await impostorContext.newPage();
    const code = await openHost(host);
    await join(player, code, 'Returning player');
    await approve(host, 'Returning player');
    await expect(
      player.locator('.topbar-actions').getByRole('button', { name: /^(connected|syncing-assets)$/ }),
    ).toBeVisible();
    const before = await player.evaluate(() => (window as any).roomHellos.length);
    await dialog(host).getByRole('button', { name: 'Disconnect table', exact: true }).click();
    await impostor.goto('./');
    await impostor.evaluate(async (code) => {
      const { hostRoom } = await import('/src/network/rooms.ts');
      const { FatePeerHost } = await import('/src/network/peer.ts');
      const { createCampaign } = await import('/src/domain/defaults.ts');
      const campaign = createCampaign('Impostor');
      const identity = await hostRoom(campaign.id);
      localStorage.setItem(`fate.host-room.v1.${campaign.id}`, JSON.stringify({ ...identity, code }));
      const host = new FatePeerHost({ getCampaign: () => campaign, onCommand: async () => campaign });
      (window as any).impostorHost = host;
      await host.startPeerRoom();
    }, code);
    await expect(player.getByRole('alert')).toContainText('host identity does not match', {
      timeout: 20_000,
    });
    await expect(dialog(player).getByText('failed', { exact: true })).toBeVisible();
    expect(await player.evaluate(() => (window as any).roomHellos.length)).toBe(before);
    expect(
      await player.evaluate(
        () => Object.keys(localStorage).filter((key) => key.startsWith('fate.client-grant.v1.')).length,
      ),
    ).toBe(1);
  } finally {
    await Promise.allSettled([hostContext.close(), playerContext.close(), impostorContext.close()]);
  }
});
