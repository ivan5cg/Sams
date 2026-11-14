// Genera los PNG del icono a partir de public/icon.svg (usa el Chromium de Playwright).
//   npm run icons
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(`${root}public/icon.svg`, 'utf8');
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

const browser = await chromium.launch();
for (const [name, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `${root}public/${name}` });
  await page.close();
}
await browser.close();
console.log('Iconos generados');
