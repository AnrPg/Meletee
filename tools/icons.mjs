// Rasterises assets/icon.svg into the PNG icons the manifest needs (run after changing the icon):
//   node tools/icons.mjs   -> assets/icon-192.png, assets/icon-512.png, assets/icon-maskable-512.png
// Uses Playwright's Chromium (a dev dependency), so no image library is needed. The PNGs are committed.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'assets', 'icon.svg'), 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
// "any" icons: the rounded square as drawn. Maskable: a full-bleed violet square with the face inside
// the central safe zone (80%), so launchers can cut any shape out of it.
const page = (size, maskable) => `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${maskable ? '#7c5cff' : 'transparent'}">
<img src="${src}" style="width:${maskable ? Math.round(size * 0.72) : size}px;height:${maskable ? Math.round(size * 0.72) : size}px"></div></body></html>`;

const browser = await chromium.launch();
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(page(size, maskable));
  await p.waitForFunction(() => document.images[0].complete);
  writeFileSync(join(root, 'assets', name), await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  await p.close();
  console.log('wrote assets/' + name);
}
await browser.close();
