import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const port = 4180;
const manifest = JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
const url = new URL(manifest.start_url || '/', `http://127.0.0.1:${port}`).href;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { stdio: 'inherit' },
);
const cleanup = () => server.kill('SIGTERM');
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error('Production preview did not start.');
    try {
      const response = await fetch(url);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Production preview timed out.');
  const tests = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      'tests/offline.spec.ts',
      '--output=test-results/offline',
    ],
    { stdio: 'inherit', env: { ...process.env, FATE_TEST_URL: url } },
  );
  process.exitCode = await new Promise((resolve) => tests.on('exit', (code) => resolve(code ?? 1)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
