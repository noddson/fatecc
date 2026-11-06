import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 45000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `${(process.env.FATE_TEST_URL || 'http://127.0.0.1:4173').replace(/\/$/, '')}/`,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=default'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.FATE_TEST_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 30000 },
});
