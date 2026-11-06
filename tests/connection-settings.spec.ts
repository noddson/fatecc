import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const settingsSummary = 'Connection settings · STUN and TURN';
const cloudflareStun = 'stun:stun.cloudflare.com:3478';
const googleStun = 'stun:stun.l.google.com:19302';
const cloudflareTurn = 'turns:turn.cloudflare.com:443?transport=tcp';
const customStun = 'stun:stun.example.test:3478';
const customTurn = 'turns:relay.example.test:5349?transport=tcp';
const turnUsername = 'private-test-username';
const turnCredential = 'private-test-credential';

const sampleOffer = JSON.stringify({
  version: 1,
  campaignId: 'connection-settings-fixture',
  peerId: 'connection-settings-player',
  description: {
    type: 'offer',
    sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
  },
});

// Capture the configuration at the browser transport boundary, then stop before
// creating sockets. These tests never send requests to public STUN/TURN services.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const iceConfigurations: RTCConfiguration[] = [];
    Object.assign(window, { iceConfigurations });
    Object.defineProperty(window, 'RTCPeerConnection', {
      configurable: true,
      value: class {
        constructor(configuration: RTCConfiguration) {
          iceConfigurations.push(structuredClone(configuration));
          throw new Error('Peer connection intercepted by this test.');
        }
      },
    });
  });
});

async function openConnection(page: Page) {
  await page.getByRole('button', { name: 'Connect to a table', exact: true }).waitFor({ state: 'attached' });
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (
    (await menu.isVisible()) &&
    !(await page.locator('.sidebar').evaluate((element) => element.classList.contains('open')))
  ) {
    await menu.click();
  }
  await page.getByRole('button', { name: 'Connect to a table', exact: true }).click();
  return page.getByRole('dialog', { name: 'Connect your table', exact: true });
}

async function openHost(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The Lantern Coast', exact: true })).toBeVisible();
  return openConnection(page);
}

async function openSettings(dialog: Locator) {
  await dialog.getByText(settingsSummary, { exact: true }).click();
}

function stunSelect(dialog: Locator) {
  return dialog.getByRole('combobox', { name: 'STUN service', exact: true });
}

function turnSelect(dialog: Locator) {
  return dialog.getByRole('combobox', { name: 'TURN service', exact: true });
}

async function capturedConfigurations(page: Page) {
  return page.evaluate(
    () => (window as unknown as { iceConfigurations: RTCConfiguration[] }).iceConfigurations,
  );
}

async function fillTurnCredentials(dialog: Locator) {
  await dialog.getByLabel('TURN username', { exact: true }).fill(turnUsername);
  await dialog.getByLabel('TURN credential', { exact: true }).fill(turnCredential);
}

test('host and join use local defaults and no longer offer an invitation service or room codes', async ({
  page,
}) => {
  const dialog = await openHost(page);
  for (const tab of ['Host a table', 'Join a table']) {
    await dialog.getByRole('button', { name: tab, exact: true }).click();
    await expect(dialog.getByLabel('Optional signaling service', { exact: false })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Open invitation room', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Request to join room', exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('Room code', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Join with an invitation room', { exact: true })).toHaveCount(0);
  }
  await openSettings(dialog);
  await expect(stunSelect(dialog)).toHaveValue('none');
  await expect(turnSelect(dialog)).toHaveValue('none');
  await expect(dialog.getByRole('checkbox', { name: /Use relay only/ })).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Scan invitation QR', exact: true })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true })).toBeVisible();
  expect(await capturedConfigurations(page)).toEqual([]);
});

const hostCases: {
  name: string;
  stun: 'none' | 'cloudflare' | 'google' | 'custom';
  turn: 'none' | 'cloudflare' | 'custom';
  relayOnly: boolean;
  expected: RTCConfiguration;
}[] = [
  {
    name: 'local connections',
    stun: 'none',
    turn: 'none',
    relayOnly: false,
    expected: { iceServers: [], iceTransportPolicy: 'all' },
  },
  {
    name: 'Cloudflare STUN',
    stun: 'cloudflare',
    turn: 'none',
    relayOnly: false,
    expected: { iceServers: [{ urls: cloudflareStun }], iceTransportPolicy: 'all' },
  },
  {
    name: 'Google STUN',
    stun: 'google',
    turn: 'none',
    relayOnly: false,
    expected: { iceServers: [{ urls: googleStun }], iceTransportPolicy: 'all' },
  },
  {
    name: 'custom STUN and TURN',
    stun: 'custom',
    turn: 'custom',
    relayOnly: false,
    expected: {
      iceServers: [
        { urls: customStun },
        { urls: customTurn, username: turnUsername, credential: turnCredential },
      ],
      iceTransportPolicy: 'all',
    },
  },
  {
    name: 'Cloudflare TURN with relay-only mode',
    stun: 'cloudflare',
    turn: 'cloudflare',
    relayOnly: true,
    expected: {
      iceServers: [
        { urls: cloudflareStun },
        { urls: cloudflareTurn, username: turnUsername, credential: turnCredential },
      ],
      iceTransportPolicy: 'relay',
    },
  },
];

for (const config of hostCases) {
  test(`host passes ${config.name} to WebRTC and unlocks settings only after disconnect`, async ({
    page,
  }) => {
    let dialog = await openHost(page);
    await openSettings(dialog);
    await stunSelect(dialog).selectOption(config.stun);
    await turnSelect(dialog).selectOption(config.turn);
    if (config.stun === 'custom') {
      await dialog.getByLabel('Custom STUN server', { exact: false }).fill(customStun);
    }
    if (config.turn === 'custom') {
      await dialog.getByLabel('Custom TURN relay', { exact: false }).fill(customTurn);
    }
    if (config.turn !== 'none') await fillTurnCredentials(dialog);
    if (config.relayOnly) await dialog.getByRole('checkbox', { name: /Use relay only/ }).check();
    await dialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Peer connection intercepted by this test.');
    expect(await capturedConfigurations(page)).toEqual([config.expected]);
    await expect(stunSelect(dialog)).toBeDisabled();
    await expect(turnSelect(dialog)).toBeDisabled();

    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    dialog = await openConnection(page);
    await openSettings(dialog);
    await expect(stunSelect(dialog)).toBeDisabled();
    await expect(stunSelect(dialog)).toHaveValue(config.stun);
    await dialog.getByRole('button', { name: 'Disconnect table', exact: true }).click();
    await expect(stunSelect(dialog)).toBeEnabled();
    await expect(turnSelect(dialog)).toBeEnabled();
    expect(await capturedConfigurations(page)).toHaveLength(1);
  });
}

test('Google STUN follows Cloudflare in both pairing modes and shows its exact endpoint', async ({
  page,
}) => {
  await page.goto('./');
  const dialog = await openConnection(page);
  await dialog.getByRole('button', { name: 'Join a table', exact: true }).click();
  await openSettings(dialog);
  await expect(stunSelect(dialog).locator('option')).toHaveText([
    'Local network only (no STUN)',
    'Cloudflare STUN',
    'Google STUN',
    'Custom STUN',
  ]);
  await expect(stunSelect(dialog)).toHaveValue('none');
  await stunSelect(dialog).selectOption('google');
  await expect(dialog.getByRole('textbox', { name: 'Google STUN server', exact: true })).toHaveValue(
    googleStun,
  );
  await expect(
    dialog.getByText('Uses UDP port 19302. No account or credentials required.', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Set up Cloudflare TURN', { exact: true })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true }).fill(sampleOffer);
  await dialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Peer connection intercepted by this test.');
  expect(await capturedConfigurations(page)).toEqual([
    { iceServers: [{ urls: googleStun }], iceTransportPolicy: 'all' },
  ]);
});

test('joining uses the player-selected Cloudflare servers and releases settings on disconnect', async ({
  page,
}) => {
  await page.goto('./');
  const dialog = await openConnection(page);
  await dialog.getByRole('button', { name: 'Join a table', exact: true }).click();
  await openSettings(dialog);
  await stunSelect(dialog).selectOption('cloudflare');
  await turnSelect(dialog).selectOption('cloudflare');
  await fillTurnCredentials(dialog);
  await dialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true }).fill(sampleOffer);
  await dialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Peer connection intercepted by this test.');
  expect(await capturedConfigurations(page)).toEqual([
    {
      iceServers: [
        { urls: cloudflareStun },
        { urls: cloudflareTurn, username: turnUsername, credential: turnCredential },
      ],
      iceTransportPolicy: 'all',
    },
  ]);
  await expect(stunSelect(dialog)).toBeDisabled();
  await expect(turnSelect(dialog)).toBeDisabled();
  await dialog.getByRole('button', { name: 'Disconnect table', exact: true }).click();
  await expect(stunSelect(dialog)).toBeEnabled();
  await expect(turnSelect(dialog)).toBeEnabled();
});

test('invalid custom servers and missing TURN credentials are rejected before creating a peer', async ({
  page,
}) => {
  const dialog = await openHost(page);
  await openSettings(dialog);
  await stunSelect(dialog).selectOption('custom');
  await dialog.getByLabel('Custom STUN server', { exact: false }).fill('https://stun.example.test');
  await dialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/stun:/);
  expect(await capturedConfigurations(page)).toEqual([]);
  await expect(stunSelect(dialog)).toBeEnabled();

  await dialog.getByLabel('Custom STUN server', { exact: false }).fill(customStun);
  await turnSelect(dialog).selectOption('custom');
  await dialog.getByLabel('Custom TURN relay', { exact: false }).fill(customTurn);
  await dialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/credential/i);
  expect(await capturedConfigurations(page)).toEqual([]);
  await expect(turnSelect(dialog)).toBeEnabled();

  await fillTurnCredentials(dialog);
  await dialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Peer connection intercepted by this test.');
  expect(await capturedConfigurations(page)).toHaveLength(1);
});

test('settings survive closing the dialog and changing presets but stay out of backups and reloads', async ({
  page,
}, testInfo) => {
  let dialog = await openHost(page);
  await openSettings(dialog);
  await stunSelect(dialog).selectOption('custom');
  await dialog.getByLabel('Custom STUN server', { exact: false }).fill(customStun);
  await turnSelect(dialog).selectOption('custom');
  await dialog.getByLabel('Custom TURN relay', { exact: false }).fill(customTurn);
  await fillTurnCredentials(dialog);
  await stunSelect(dialog).selectOption('cloudflare');
  await turnSelect(dialog).selectOption('cloudflare');
  await stunSelect(dialog).selectOption('custom');
  await turnSelect(dialog).selectOption('custom');
  await expect(dialog.getByLabel('Custom STUN server', { exact: false })).toHaveValue(customStun);
  await expect(dialog.getByLabel('Custom TURN relay', { exact: false })).toHaveValue(customTurn);

  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  dialog = await openConnection(page);
  await openSettings(dialog);
  await expect(stunSelect(dialog)).toHaveValue('custom');
  await expect(turnSelect(dialog)).toHaveValue('custom');
  await expect(dialog.getByLabel('TURN username', { exact: true })).toHaveValue(turnUsername);
  await expect(dialog.getByLabel('TURN credential', { exact: true })).toHaveValue(turnCredential);
  await expect(dialog.getByLabel('TURN credential', { exact: true })).toHaveAttribute('type', 'password');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const backupDialog = page.getByRole('dialog', { name: 'Keep your story safe', exact: true });
  for (const name of ['Full campaign JSON', 'Player-safe JSON']) {
    const pending = page.waitForEvent('download');
    await backupDialog.getByRole('button', { name: new RegExp(name) }).click();
    const path = testInfo.outputPath(`${name.replaceAll(' ', '-')}.json`);
    await (await pending).saveAs(path);
    const json = await readFile(path, 'utf8');
    expect(JSON.parse(json).campaign.name).toBe('The Lantern Coast');
    for (const privateValue of [customStun, customTurn, turnUsername, turnCredential]) {
      expect(json).not.toContain(privateValue);
    }
  }
  const stored = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  expect(stored).not.toContain(turnUsername);
  expect(stored).not.toContain(turnCredential);

  await page.reload();
  dialog = await openConnection(page);
  await openSettings(dialog);
  await expect(stunSelect(dialog)).toHaveValue('none');
  await expect(turnSelect(dialog)).toHaveValue('none');
  await stunSelect(dialog).selectOption('custom');
  await turnSelect(dialog).selectOption('custom');
  await expect(dialog.getByLabel('Custom STUN server', { exact: false })).toHaveValue('');
  await expect(dialog.getByLabel('Custom TURN relay', { exact: false })).toHaveValue('');
  await expect(dialog.getByLabel('TURN username', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('TURN credential', { exact: true })).toHaveValue('');
});

test('Cloudflare guidance and connection controls fit a 390px player screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const dialog = await openConnection(page);
  await dialog.getByRole('button', { name: 'Join a table', exact: true }).click();
  await openSettings(dialog);
  await stunSelect(dialog).selectOption('cloudflare');
  const turnHelp = dialog.getByText('Set up Cloudflare TURN', { exact: true });
  await expect(turnHelp).toHaveCount(0);
  await turnSelect(dialog).selectOption('custom');
  await expect(turnHelp).toHaveCount(0);
  await expect(dialog.getByLabel('Custom TURN relay', { exact: false })).toBeVisible();
  await turnSelect(dialog).selectOption('cloudflare');
  await expect(dialog.getByLabel('Cloudflare STUN server', { exact: true })).toHaveValue(cloudflareStun);
  await expect(dialog.getByLabel('Cloudflare TURN relay', { exact: true })).toHaveValue(cloudflareTurn);
  await expect(turnHelp).toBeVisible();
  await turnHelp.click();
  await expect(
    dialog.locator('a[href="https://developers.cloudflare.com/realtime/turn/generate-credentials/"]'),
  ).toBeVisible();
  for (const control of await dialog
    .locator('input:visible, select:visible, summary:visible, a:visible')
    .all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await stunSelect(dialog).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('connection-settings-mobile.png'), fullPage: true });
  expect(await capturedConfigurations(page)).toEqual([]);
});
