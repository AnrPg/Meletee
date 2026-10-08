// Installable app: the manifest, its PNG icons and shortcuts, and the service worker's offline
// behaviour. The app registers the worker only on https; here the test registers it by hand on
// localhost (development sw.js has an empty precache list, so this checks the runtime caching).
import { test, expect } from './fixtures/test.js';

test('manifest: PNG icons (192, 512, maskable), colours and shortcuts', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Meletee', display: 'standalone', start_url: './' });
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  const png = m.icons.filter((i) => i.type === 'image/png');
  expect(png.map((i) => `${i.sizes}/${i.purpose}`).sort()).toEqual(['192x192/any', '512x512/any', '512x512/maskable']);
  await page.goto('/');
  for (const i of png) {
    const size = await page.evaluate(async (src) => {
      const b = await createImageBitmap(await (await fetch(src)).blob());
      return `${b.width}x${b.height}`;
    }, i.src);
    expect(size).toBe(i.sizes);
  }
  expect(m.shortcuts.map((s) => s.url)).toEqual(['./#/do/focus', './#/do/reviews', './#/ws']);
  for (const s of m.shortcuts) {
    await page.goto('/' + s.url.slice(2));
    await expect(page.locator('#main h1').first()).toBeAttached();
    await expect(page.locator('#main')).not.toContainText('Nothing here yet.');
  }
  // http: the app itself never registers the worker
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test('service worker: screens and sections already opened work offline', async ({ page, context }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('/#/learn/guide/how-learning-works');
  await expect(page.locator('#main h1')).toContainText('How learning works');
  await page.goto('/#/do/focus');
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeVisible();
  await context.setOffline(true);
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible();
  await page.goto('/#/learn/guide/how-learning-works');
  await expect(page.locator('#main h1')).toContainText('How learning works');
  await page.goto('/#/do/focus');
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeVisible();
  const caches = await page.evaluate(async () => (await self.caches.keys()).sort());
  expect(caches).toEqual(['meletee-content', 'meletee-dev']);
  await context.setOffline(false);
});
