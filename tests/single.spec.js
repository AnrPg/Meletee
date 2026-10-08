// The single-file build (tools/build-single.mjs): dist/meletee.html opened from disk (file://),
// with no server and no network. Learn content, languages, the timer and a workspace all work offline.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = pathToFileURL(join(root, 'dist', 'meletee.html')).href;

test.beforeAll(() => {
  execFileSync(process.execPath, [join(root, 'tools', 'build-single.mjs')], { stdio: 'pipe' });
});

test('dist/meletee.html works from file:// without any network', async ({ page }) => {
  const net = [];
  await page.route(/^https?:/, (r) => { net.push(r.request().url()); return r.abort(); });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(FILE + '#/');
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible();

  // compendium content, loaded from the inline data
  await page.goto(FILE + '#/learn/guide/how-learning-works');
  await expect(page.locator('#main h1')).toContainText('How learning works');
  await page.goto(FILE + '#/learn/method/active-recall-practice-testing');
  await expect(page.locator('#main h1')).toContainText('Active recall');

  // a workspace (lazy module through the import map) that keeps its data across a reload
  await page.goto(FILE + '#/ws/recall');
  await expect(page.locator('#main h1')).toContainText('Active recall');
  await page.goto(FILE + '#/do');
  await page.locator('#top3-input').fill('Read chapter 2');
  await page.locator('#top3-input').press('Enter');
  await page.reload();
  await expect(page.getByText('Read chapter 2')).toBeVisible();

  // every language is inside the file
  await page.goto(FILE + '#/settings');
  await page.getByRole('button', { name: 'Ελληνικά' }).click();
  await expect(page.getByRole('heading', { name: 'Ρυθμίσεις' })).toBeVisible();
  await page.goto(FILE + '#/learn/guide/how-learning-works');
  await expect(page.locator('#main h1')).not.toContainText('How learning works');
  await page.goto(FILE + '#/privacy');
  await expect(page.locator('#main h1')).toContainText('Το απόρρητό σου');

  expect(errors).toEqual([]);
  expect(net.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u))).toEqual([]);
});
