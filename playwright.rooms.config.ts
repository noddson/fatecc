import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/peerjs',
  testMatch: 'peerjs-rooms.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4181/',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=default'],
    },
  },
  projects: [{ name: 'peerjs', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/test-peer-server.mjs',
      url: 'http://127.0.0.1:4180/peerjs',
      reuseExistingServer: false,
    },
    {
      command:
        'VITE_ENABLE_MANUAL_PAIRING=false VITE_PEERJS_SERVER=http://127.0.0.1:4180/peerjs npx vite --host 127.0.0.1 --port 4181 --strictPort',
      url: 'http://127.0.0.1:4181',
      reuseExistingServer: false,
    },
  ],
});
