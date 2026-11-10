import { chromium, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Exercise the public UI and native WebRTC in separate browser processes. Unlike
// the low-level protocol suite, do not disable mDNS or change ICE IP handling.
// FATE_TEST_URL can point this at Pages without starting a local app server.
for (const service of ['none', 'cloudflare', 'google'] as const) {
  test(`two independent browsers pair and share rolls with ${service} STUN`, async ({}, testInfo) => {
    test.skip(
      !process.env.FATE_TEST_URL,
      'Set FATE_TEST_URL to explicitly opt in to deployed-site networking.',
    );
    test.setTimeout(120_000);
    const browsers: Browser[] = [];
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    const errors: string[] = [];
    try {
      for (const role of ['gm', 'player']) {
        const browser = await chromium.launch({
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        });
        browsers.push(browser);
        const context = await browser.newContext({
          baseURL: testInfo.project.use.baseURL,
          viewport: { width: 1440, height: 1100 },
          recordVideo: { dir: testInfo.outputPath(`${role}-video`), size: { width: 1440, height: 1100 } },
        });
        contexts.push(context);
        await context.addInitScript(() => {
          const peers: RTCPeerConnection[] = [];
          const iceErrors: { code: number; text: string }[] = [];
          Object.assign(window, { connectionProbe: { peers, iceErrors } });
          const NativePeer = window.RTCPeerConnection;
          window.RTCPeerConnection = class extends NativePeer {
            constructor(configuration?: RTCConfiguration) {
              super(configuration);
              peers.push(this);
              this.addEventListener('icecandidateerror', (event) => {
                iceErrors.push({ code: event.errorCode, text: event.errorText });
              });
            }
          };
        });
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(`${role}: ${error.message}`));
        pages.push(page);
        await page.goto('./');
      }
      const [gm, player] = pages;
      await gm.getByRole('button', { name: /Explore The Lantern Coast/ }).click();
      await gm.getByRole('button', { name: 'Connect', exact: true }).click();
      const hostDialog = gm.getByRole('dialog', { name: 'Connect your table', exact: true });
      await player.getByRole('button', { name: 'Connect to a table', exact: true }).click();
      const joinDialog = player.getByRole('dialog', { name: 'Connect your table', exact: true });
      await joinDialog.getByRole('button', { name: 'Join a table', exact: true }).click();
      for (const dialog of [hostDialog, joinDialog]) {
        await dialog.getByText('Connection settings · STUN and TURN', { exact: true }).click();
        await dialog.getByRole('combobox', { name: 'STUN service', exact: true }).selectOption(service);
        await expect(dialog.getByRole('combobox', { name: 'TURN service', exact: true })).toHaveValue('none');
        await dialog.getByText('Connection settings · STUN and TURN', { exact: true }).click();
      }
      await hostDialog.getByRole('button', { name: 'Create player invitation', exact: true }).click();
      await hostDialog.getByText('Copy/paste invitation', { exact: true }).click({ timeout: 30_000 });
      const offer = await hostDialog.getByRole('textbox', { name: /^1\. Send this offer/ }).inputValue();
      // An invitation with no candidates cannot establish this non-trickle flow.
      expect(JSON.parse(offer).description.sdp).toContain('a=candidate:');
      await joinDialog.getByLabel('Your name', { exact: true }).fill('Live test player');
      await joinDialog.getByRole('textbox', { name: "Paste the GM's offer", exact: true }).fill(offer);
      await joinDialog.getByRole('button', { name: 'Create connection answer', exact: true }).click();
      await joinDialog.getByText('Copy/paste response', { exact: true }).click({ timeout: 30_000 });
      const answer = await joinDialog.getByRole('textbox', { name: /^Send this answer back/ }).inputValue();
      expect(JSON.parse(answer).description.sdp).toContain('a=candidate:');
      await hostDialog
        .getByRole('textbox', { name: "2. Paste the player's answer", exact: true })
        .fill(answer);
      await hostDialog.getByRole('button', { name: 'Connect player', exact: true }).click();
      await expect(
        hostDialog.getByRole('heading', { name: 'Live test player wants to join', exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await hostDialog.getByRole('checkbox', { name: 'Mara Voss', exact: true }).check();
      await hostDialog.getByRole('button', { name: 'Approve player', exact: true }).click();
      await expect(joinDialog.getByText('connected', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(hostDialog.getByText('direct', { exact: true })).toBeVisible();
      await gm.screenshot({ path: testInfo.outputPath('gm-connected.png') });
      await player.screenshot({ path: testInfo.outputPath('player-connected.png') });
      await hostDialog.getByRole('button', { name: 'Done', exact: true }).click();
      await joinDialog.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(
        player.locator('.topbar-actions').getByRole('button', { name: /^(connected|syncing-assets)$/ }),
      ).toBeVisible();

      // Check the authorized snapshot, then both directions of the live channel.
      await player
        .getByRole('navigation', { name: 'Campaign' })
        .getByRole('button', { name: 'Campaign journal', exact: true })
        .click();
      await expect(player.getByText('The first night', { exact: true })).toHaveCount(0);
      await expect(player.getByText('Bellweather Harbor', { exact: true }).first()).toBeVisible();
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
      for (const [index, page] of pages.entries()) {
        await page.getByRole('button', { name: /Roll the dice/ }).click();
        for (const recipient of pages) {
          await expect(
            recipient.locator('.activity-entry').filter({ hasText: 'Mara Voss · Notice' }),
          ).toHaveCount(index + 1);
        }
        await expect(player.locator('.roll-total strong')).toHaveText(
          await gm.locator('.roll-total strong').innerText(),
        );
        expect(await player.locator('.roll-result .fate-die').allTextContents()).toEqual(
          await gm.locator('.roll-result .fate-die').allTextContents(),
        );
      }
      await gm.screenshot({ path: testInfo.outputPath('gm-shared-rolls.png') });
      await player.screenshot({ path: testInfo.outputPath('player-shared-rolls.png') });
      for (const [index, page] of pages.entries()) {
        await page.locator('.roll-result').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath(`${index === 0 ? 'gm' : 'player'}-roll-detail.png`),
        });
      }
      expect(errors).toEqual([]);
    } finally {
      for (const [index, page] of pages.entries()) {
        if (page.isClosed()) continue;
        // Keep diagnostics useful without storing IP addresses, SDP, or pairing credentials.
        const diagnostics = await page
          .evaluate(async () => {
            const probe = (
              window as unknown as { connectionProbe: { peers: RTCPeerConnection[]; iceErrors: unknown[] } }
            ).connectionProbe;
            return {
              url: location.href,
              browser: navigator.userAgent,
              build: await fetch(new URL('version.json', location.href))
                .then((response) => response.json())
                .catch(() => null),
              iceErrors: probe.iceErrors,
              peers: await Promise.all(
                probe.peers.map(async (pc) => {
                  const stats = await pc.getStats();
                  const pairs: unknown[] = [];
                  stats.forEach((report) => {
                    if (
                      report.type === 'candidate-pair' &&
                      report.state === 'succeeded' &&
                      report.nominated
                    ) {
                      pairs.push({
                        state: report.state,
                        localType: stats.get(report.localCandidateId)?.candidateType,
                        remoteType: stats.get(report.remoteCandidateId)?.candidateType,
                        bytesSent: report.bytesSent,
                        bytesReceived: report.bytesReceived,
                      });
                    }
                  });
                  return {
                    state: pc.connectionState,
                    gathering: pc.iceGatheringState,
                    localCandidateTypes: [
                      ...new Set(
                        [...(pc.localDescription?.sdp ?? '').matchAll(/a=candidate:.*? typ (\w+)/g)].map(
                          (match) => match[1],
                        ),
                      ),
                    ],
                    configuration: pc.getConfiguration(),
                    pairs,
                  };
                }),
              ),
            };
          })
          .catch((error) => ({ diagnosticError: String(error) }));
        const name = `${index === 0 ? 'gm' : 'player'}-connection.json`;
        const path = testInfo.outputPath(name);
        await writeFile(path, JSON.stringify({ service, errors, diagnostics }, null, 2));
        await testInfo.attach(name, {
          path,
          contentType: 'application/json',
        });
        await page
          .screenshot({ path: testInfo.outputPath(`${index === 0 ? 'gm' : 'player'}-final.png`) })
          .catch(() => {});
      }
      // Explicit context closure flushes the final frames and video container.
      await Promise.allSettled(contexts.map((context) => context.close()));
      await Promise.allSettled(browsers.map((browser) => browser.close()));
    }
  });
}
