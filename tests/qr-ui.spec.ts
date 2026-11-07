import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';

const sampleDescription = (type: 'offer' | 'answer') =>
  JSON.stringify({
    version: 1,
    campaignId: 'qr-reader-fixture',
    peerId: 'qr-reader-player',
    description: {
      type,
      sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
    },
  });

async function openNavigationIfNeeded(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (
    (await menu.isVisible()) &&
    !(await page.locator('.sidebar').evaluate((element) => element.classList.contains('open')))
  ) {
    await menu.click();
  }
}

async function openJoin(page: Page) {
  await page.goto('./');
  await openNavigationIfNeeded(page);
  await page.getByRole('button', { name: 'Connect to a table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect your table', exact: true });
  await dialog.getByRole('button', { name: 'Join a table', exact: true }).click();
  return dialog;
}

async function navigate(page: Page, label: string) {
  await openNavigationIfNeeded(page);
  await page
    .getByRole('navigation', { name: 'Campaign' })
    .getByRole('button', { name: label, exact: true })
    .click();
}

test('QR image invitations and responses join without a broker, preserve permissions, and share a roll', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const gm = await gmContext.newPage();
    const player = await playerContext.newPage();
    await gm.goto('./');
    await gm.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
    await gm.getByRole('button', { name: 'Connect', exact: true }).click();
    const hostDialog = gm.getByRole('dialog', { name: 'Connect your table', exact: true });
    await hostDialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
    await expect(hostDialog.getByRole('img', { name: 'Invitation QR code', exact: true })).toBeVisible();
    const invitationDownload = gm.waitForEvent('download');
    await hostDialog.getByRole('link', { name: 'Download invitation QR', exact: true }).click();
    const invitationPath = testInfo.outputPath('invitation.png');
    await (await invitationDownload).saveAs(invitationPath);
    await gm.screenshot({ path: testInfo.outputPath('invitation-desktop.png'), fullPage: true });

    const joinDialog = await openJoin(player);
    await joinDialog.getByLabel('Your name', { exact: true }).fill('QR player');
    await joinDialog.getByLabel('Upload invitation QR image', { exact: true }).setInputFiles(invitationPath);
    await expect(joinDialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true })).toHaveValue(
      /"type":"offer"/,
    );
    await expect(joinDialog.getByRole('status').filter({ hasText: 'Invitation QR read' })).toBeVisible();
    // Reading an image only fills the form. The player explicitly creates the answer.
    await expect(
      hostDialog.getByRole('heading', { name: 'QR player wants to join', exact: true }),
    ).toHaveCount(0);
    await joinDialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
    const responseImage = joinDialog.getByRole('img', { name: 'Response QR code', exact: true });
    await expect(responseImage).toBeVisible();
    const imageBox = await responseImage.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.x).toBeGreaterThanOrEqual(0);
    expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(390);
    expect(await player.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await player.screenshot({ path: testInfo.outputPath('response-mobile.png'), fullPage: true });
    const responseDownload = player.waitForEvent('download');
    await joinDialog.getByRole('link', { name: 'Download response QR', exact: true }).click();
    const responsePath = testInfo.outputPath('response.png');
    await (await responseDownload).saveAs(responsePath);

    await hostDialog.getByLabel('Upload response QR image', { exact: true }).setInputFiles(responsePath);
    await expect(
      hostDialog.getByRole('textbox', { name: "2. Paste the player's answer", exact: true }),
    ).toHaveValue(/"type":"answer"/);
    await hostDialog.getByRole('button', { name: 'Connect player', exact: true }).click();
    await expect(
      hostDialog.getByRole('heading', { name: 'QR player wants to join', exact: true }),
    ).toBeVisible();
    await hostDialog.getByRole('checkbox', { name: 'Mara Voss', exact: true }).check();
    await hostDialog.getByRole('button', { name: 'Approve player', exact: true }).click();
    await expect(joinDialog.getByText('connected', { exact: true })).toBeVisible({ timeout: 20_000 });
    await hostDialog.getByRole('button', { name: 'Done', exact: true }).click();
    await joinDialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(player.getByText('Connected player view', { exact: true })).toBeVisible();

    await navigate(player, 'Campaign journal');
    await expect(player.getByText('The first night', { exact: true })).toHaveCount(0);
    await expect(player.getByText('Bellweather Harbor', { exact: true }).first()).toBeVisible();
    await Promise.all([navigate(gm, 'At the table'), navigate(player, 'At the table')]);
    await player
      .getByRole('combobox', { name: 'Character', exact: true })
      .selectOption({ label: 'Mara Voss' });
    await player.getByRole('combobox', { name: 'Skill', exact: true }).selectOption('notice');
    await player.getByRole('button', { name: /Roll the dice/ }).click();
    await expect(player.locator('.roll-result')).toBeVisible();
    await expect(gm.locator('.roll-result')).toBeVisible();
    await expect(player.locator('.activity-entry').filter({ hasText: 'Mara Voss · Notice' })).toHaveCount(1);
    await expect(gm.locator('.activity-entry').filter({ hasText: 'Mara Voss · Notice' })).toHaveCount(1);
    expect(await player.locator('.roll-total strong').innerText()).toBe(
      await gm.locator('.roll-total strong').innerText(),
    );
    expect(await player.locator('.roll-result .fate-die').allTextContents()).toEqual(
      await gm.locator('.roll-result .fate-die').allTextContents(),
    );
  } finally {
    await Promise.allSettled([gmContext.close(), playerContext.close()]);
  }
});

test('unrelated, malformed, and wrong-direction QR images preserve pasted text and cannot start a connection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.RTCPeerConnection;
    const counters = { created: 0 };
    Object.assign(window, { qrPeerCounters: counters });
    window.RTCPeerConnection = class extends Original {
      constructor(configuration?: RTCConfiguration) {
        counters.created++;
        super(configuration);
      }
    };
  });
  const dialog = await openJoin(page);
  const incoming = dialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true });
  await incoming.fill('Keep this pasted text');
  for (const [name, contents] of [
    ['unrelated', 'https://example.com/a-completely-different-qr'],
    ['malformed', 'FATE1:not-a-valid-compressed-connection'],
    ['wrong-direction', sampleDescription('answer')],
  ]) {
    const bytes = await QRCode.toBuffer(contents, { errorCorrectionLevel: 'M', scale: 6, margin: 4 });
    await dialog.getByLabel('Upload invitation QR image', { exact: true }).setInputFiles({
      name: `${name}.png`,
      mimeType: 'image/png',
      buffer: bytes,
    });
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(incoming).toHaveValue('Keep this pasted text');
  }
  await incoming.fill('FATE1:invalid');
  await dialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
  await expect(page.getByRole('alert').last()).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { qrPeerCounters: { created: number } }).qrPeerCounters.created,
    ),
  ).toBe(0);
  await expect(dialog.getByRole('img', { name: 'Response QR code', exact: true })).toHaveCount(0);
});

test('copy and paste remains a complete alternative to cameras and image uploads', async ({ browser }) => {
  test.setTimeout(90_000);
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  try {
    const gm = await gmContext.newPage();
    const player = await playerContext.newPage();
    await gm.goto('./');
    await gm.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
    await gm.getByRole('button', { name: 'Connect', exact: true }).click();
    const hostDialog = gm.getByRole('dialog', { name: 'Connect your table', exact: true });
    await hostDialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
    await hostDialog.getByText('Copy/paste invitation', { exact: true }).click();
    const offer = hostDialog.getByRole('textbox', { name: /^1\. Send this offer to one player/ });
    await expect(offer).not.toHaveValue('');
    await expect(hostDialog.getByRole('button', { name: 'Copy offer', exact: true })).toBeEnabled();

    const joinDialog = await openJoin(player);
    await joinDialog.getByLabel('Your name', { exact: true }).fill('Text player');
    await joinDialog
      .getByRole('textbox', { name: "Paste the GM's offer", exact: true })
      .fill(await offer.inputValue());
    await joinDialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
    await joinDialog.getByText('Copy/paste response', { exact: true }).click();
    const answer = joinDialog.getByRole('textbox', { name: /^Send this answer back to the GM/ });
    await expect(answer).not.toHaveValue('');
    await expect(joinDialog.getByRole('button', { name: 'Copy answer', exact: true })).toBeEnabled();
    const previousAnswer = await answer.inputValue();
    const incomingOffer = joinDialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true });
    await incomingOffer.fill('A different invitation has not been pasted yet');
    await expect(joinDialog.getByRole('img', { name: 'Response QR code', exact: true })).toHaveCount(0);
    await expect(joinDialog.getByText('Copy/paste response', { exact: true })).toHaveCount(0);
    await expect(joinDialog.getByRole('link', { name: 'Download response QR', exact: true })).toHaveCount(0);
    await incomingOffer.fill(await offer.inputValue());
    await joinDialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
    await expect(joinDialog.getByRole('img', { name: 'Response QR code', exact: true })).toBeVisible();
    await joinDialog.getByText('Copy/paste response', { exact: true }).click();
    // Returning to the same invitation preserves the response already in circulation.
    await expect(answer).toHaveValue(previousAnswer);
    await hostDialog
      .getByRole('textbox', { name: "2. Paste the player's answer", exact: true })
      .fill(await answer.inputValue());
    await hostDialog.getByRole('button', { name: 'Connect player', exact: true }).click();
    await expect(
      hostDialog.getByRole('heading', { name: 'Text player wants to join', exact: true }),
    ).toBeVisible();
    await hostDialog.getByRole('checkbox', { name: 'Mara Voss', exact: true }).check();
    await hostDialog.getByRole('button', { name: 'Approve player', exact: true }).click();
    await expect(joinDialog.getByText('connected', { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await Promise.allSettled([gmContext.close(), playerContext.close()]);
  }
});

test('camera denial offers fallbacks and cancelling a pending request or closing stops its tracks', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    });
  });
  const dialog = await openJoin(page);
  await dialog.getByRole('button', { name: 'Scan invitation QR', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Camera access was denied');
  await expect(dialog.getByLabel('Upload invitation QR image', { exact: true })).toBeAttached();
  await expect(dialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true })).toBeVisible();

  await page.evaluate(() => {
    const state = { requests: 0, stopped: 0, resolve: () => {} };
    Object.assign(window, { qrCameraTest: state });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => {
        state.requests++;
        return new Promise<MediaStream>((resolve) => {
          state.resolve = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            canvas.getContext('2d')!.fillRect(0, 0, 200, 200);
            const stream = canvas.captureStream(5);
            for (const track of stream.getTracks()) {
              const stop = track.stop.bind(track);
              track.stop = () => {
                if (track.readyState !== 'ended') state.stopped++;
                stop();
              };
            }
            resolve(stream);
          };
        });
      },
    });
  });
  await dialog.getByRole('button', { name: 'Scan invitation QR', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Waiting for camera permission');
  await dialog.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { qrCameraTest: { resolve: () => void } }).qrCameraTest.resolve(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { qrCameraTest: { stopped: number } }).qrCameraTest.stopped),
    )
    .toBe(1);
  await expect(dialog.locator('video')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Scan invitation QR', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Waiting for camera permission');
  await page.evaluate(() =>
    (window as unknown as { qrCameraTest: { resolve: () => void } }).qrCameraTest.resolve(),
  );
  await expect(dialog.getByRole('status')).toContainText('Point the camera');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { qrCameraTest: { stopped: number } }).qrCameraTest.stopped),
    )
    .toBe(2);
});

test('camera reads an invitation frame locally, fills the form, and releases the camera', async ({
  page,
}) => {
  const rawOffer = sampleDescription('offer');
  const dataUrl = await QRCode.toDataURL(rawOffer, { errorCorrectionLevel: 'M', scale: 6, margin: 4 });
  await page.addInitScript(
    ({ qrImage }) => {
      const state = { stopped: 0 };
      Object.assign(window, { qrCameraSuccess: state });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          const image = new Image();
          image.src = qrImage;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const stream = canvas.captureStream(10);
          const redraw = setInterval(() => context.drawImage(image, 0, 0), 100);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => {
              if (track.readyState !== 'ended') state.stopped++;
              clearInterval(redraw);
              stop();
            };
          }
          return stream;
        },
      });
    },
    { qrImage: dataUrl },
  );
  const dialog = await openJoin(page);
  await dialog.getByRole('button', { name: 'Scan invitation QR', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Invitation QR read');
  await expect(dialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true })).toHaveValue(
    rawOffer,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { qrCameraSuccess: { stopped: number } }).qrCameraSuccess.stopped,
      ),
    )
    .toBe(1);
  await expect(dialog.locator('video')).toHaveCount(0);
  await expect(dialog.getByRole('img', { name: 'Response QR code', exact: true })).toHaveCount(0);
});
