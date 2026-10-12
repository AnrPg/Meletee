// The toolshed: a toolshed per technique in a side panel, or every tool in one list.
import { test, expect } from './fixtures/test.js';

async function open(page, hash = '', { lang = 'en' } = {}) {
  await page.addInitScript((l) => {
    if (localStorage.getItem('meletee1:local:a:settings')) return;
    localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l }));
  }, lang);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return errors;
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('by technique: groups, a side panel of tools, and Back returns to the panel', async ({ page }) => {
  const errors = await open(page, '#/ws');
  await expect(page.getByRole('button', { name: 'By technique' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('details.shed-group[open]')).toHaveCount(1);
  await expect(page.locator('[data-shed="cornell-notes"]')).toBeHidden();
  await page.locator('details.shed-group', { has: page.locator('[data-shed="cornell-notes"]') }).locator('summary').click();
  await page.locator('[data-shed="cornell-notes"]').click();
  const panel = page.getByRole('dialog', { name: 'Cornell notes' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-tool]')).toHaveCount(2);
  await expect(page).toHaveURL(/#\/ws\/shed\/cornell-notes$/);
  expect(await noSideScroll(page)).toBe(true);
  await panel.locator('[data-tool="cornell"]').click();
  await expect(page).toHaveURL(/#\/ws\/notes\/cornell$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ws-notes-types [data-type="cornell"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Cornell notes' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Cornell notes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/ws$/);
  expect(errors).toEqual([]);
});

test('a tab link opens that tool: the error log, the memory palace', async ({ page }) => {
  const errors = await open(page, '#/ws/practice/errors');
  await expect(page.getByRole('heading', { name: 'Error log' })).toBeVisible();
  await page.goto('/#/ws/memory/palace');
  await expect(page.getByRole('heading', { name: 'Memory palace' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('techniques outside the core list get a toolshed too, with app tools', async ({ page }) => {
  const errors = await open(page, '#/learn/method/weekly-review');
  await page.getByRole('link', { name: /Open its toolshed/ }).click();
  const panel = page.getByRole('dialog', { name: 'Weekly review' });
  await expect(panel.locator('[data-tool]')).toHaveCount(3);
  await panel.locator('[data-tool="reflect"]').click();
  await expect(page).toHaveURL(/#\/grow\/reflect$/);
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Weekly review' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('flat view: every tool, a search, and the choice is remembered (Greek)', async ({ page }) => {
  const errors = await open(page, '#/ws', { lang: 'el' });
  await page.getByRole('button', { name: 'Χύμα' }).click();
  await expect(page.locator('[data-tool]')).toHaveCount(37);
  await page.getByRole('searchbox', { name: 'Βρες ένα εργαλείο' }).fill('παλάτι');
  await expect(page.locator('[data-tool]:visible')).toHaveCount(1);
  await page.getByRole('searchbox').fill('zzzz');
  await expect(page.getByText('Κανένα εργαλείο δεν ταιριάζει.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Χύμα' })).toHaveAttribute('aria-pressed', 'true');
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});
