import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Rasterize a square SVG wrapper with Chromium's ordinary SVG image renderer.
// The licensed logo remains a complete, unmodified embedded image.
const root = new URL('../', import.meta.url);
const sourcePath = 'public/branding/powered-by-fate-dark.svg';
const source = await readFile(new URL(sourcePath, root));
const viewBox = source.toString('utf8').match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!viewBox) throw new Error('Expected an SVG logo with a zero-origin viewBox.');
const sourceRatio = Number(viewBox[2]) / Number(viewBox[1]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const outputs = [
  [192, 'public/branding/app-icon-192.png'],
  [512, 'public/branding/app-icon-512.png'],
  [180, 'public/branding/apple-touch-icon.png'],
];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const metadata = {
  generator: 'scripts/generate-app-icons.mjs',
  renderer: `Chromium ${browser.version()}`,
  source: sourcePath,
  sourceSha256: hash(source),
  background: '#175c8b',
  logoWidthFraction: 0.75,
  outputs: [],
};

try {
  for (const [size, path] of outputs) {
    const logoWidth = size * metadata.logoWidthFraction;
    const logoHeight = logoWidth * sourceRatio;
    const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${metadata.background}"/><image x="${(size - logoWidth) / 2}" y="${(size - logoHeight) / 2}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet" href="data:image/svg+xml;base64,${source.toString('base64')}"/></svg>`;
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    await page.setContent(
      '<html><body style="margin:0"><img alt="Powered by Fate" style="display:block"/></body></html>',
    );
    await page.locator('img').evaluate(
      async (image, dataUrl) => {
        image.src = dataUrl;
        await image.decode();
      },
      `data:image/svg+xml;base64,${Buffer.from(wrapper).toString('base64')}`,
    );
    const bytes = await page.screenshot({
      path: fileURLToPath(new URL(path, root)),
      type: 'png',
      animations: 'disabled',
    });
    if (bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) {
      throw new Error(`Unexpected PNG dimensions for ${path}.`);
    }
    metadata.outputs.push({ file: path, width: size, height: size, sha256: hash(bytes) });
    await page.close();
    console.log(`Generated ${path} (${size} × ${size})`);
  }
  if (hash(await readFile(new URL(sourcePath, root))) !== metadata.sourceSha256) {
    throw new Error('Source logo changed while generating icons.');
  }
  await writeFile(
    new URL('docs/design-generated-assets.json', root),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
