import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createBuildVersion } from './scripts/build-version';
const buildVersion = createBuildVersion();
export default defineConfig(({ command, mode }) => {
  const configuredBase = process.env.VITE_BASE_PATH || loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE_PATH;
  const basePath = configuredBase || (command === 'build' || mode === 'production' ? '/fatecc/' : '/');
  if (!basePath.startsWith('/') || basePath.startsWith('//') || /[?#\\]/.test(basePath))
    throw new Error('VITE_BASE_PATH must be a same-origin path such as /fatecc/ or /.');
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(buildVersion) },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            if (moduleId.includes('/src/content/reference.json')) return 'fate-core-reference';
            if (moduleId.includes('/src/content/accelerated-reference.json'))
              return 'fate-accelerated-reference';
            if (moduleId.includes('/node_modules/peerjs/')) return 'peerjs';
            if (moduleId.includes('/node_modules/')) return 'vendor';
          },
        },
      },
    },
    plugins: [
      {
        name: 'fate-build-version',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: `${JSON.stringify(buildVersion, null, 2)}\n`,
          });
        },
      },
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['branding/*', 'fonts/*'],
        manifest: {
          name: 'Fate Campaign Companion',
          short_name: 'Fate',
          description: 'Your stories. Your table.',
          theme_color: '#175c8b',
          background_color: '#f4f6f8',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: `${base}branding/app-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${base}branding/app-icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,json,txt,png,woff2,ttf}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          navigateFallback: 'index.html',
        },
      }),
    ],
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
