import { test, expect } from '@playwright/test';

const LANGS = {
  en: { learn: 'Learn', whatNow: 'What now?', methods: 'Method library' },
  el: { learn: 'Μάθε', whatNow: 'Και τώρα;', methods: 'Βιβλιοθήκη μεθόδων' },
  ru: { learn: 'Учись', whatNow: 'Что дальше?', methods: 'Библиотека методов' },
  fr: { learn: 'Apprendre', whatNow: 'Et maintenant ?', methods: 'Bibliothèque des méthodes' },
};

async function open(page, lang, hash = '') {
  await page.addInitScript((l) => localStorage.setItem('melete1:local:a:settings', JSON.stringify({ lang: l })), lang);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/' + hash);
  return errors;
}

for (const [lang, s] of Object.entries(LANGS)) {
  test(`home and learn render in ${lang}`, async ({ page }) => {
    const errors = await open(page, lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByRole('button', { name: s.whatNow })).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: s.learn }).click();
    await page.getByRole('link', { name: new RegExp(s.methods) }).click();
    await expect(page.locator('a.card').first()).toBeVisible();
    await page.locator('a.card').first().click();
    await expect(page.locator('article h1')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('find your method gives a starter set', async ({ page }) => {
  const errors = await open(page, 'en', '#/learn/find');
  await page.getByRole('button', { name: /Solving problems/ }).click();
  await page.getByRole('button', { name: /Under 30 minutes/ }).click();
  await page.getByRole('button', { name: /Getting started/ }).click();
  await expect(page.getByRole('heading', { name: 'Your starter set' })).toBeVisible();
  await expect(page.locator('a.card[href^="#/learn/method/"]')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('every guide section and item opens without errors', async ({ page }) => {
  const errors = await open(page, 'en', '#/learn/guide');
  const hrefs = await page.locator('a.card').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(10);
  for (const href of hrefs) {
    await page.goto('/' + href);
    await expect(page.locator('h1')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('settings switch language and theme, backup round-trips', async ({ page }) => {
  await open(page, 'en', '#/settings');
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Ελληνικά' }).click();
  await expect(page.getByRole('heading', { name: 'Ρυθμίσεις' })).toBeVisible();
  const backup = await page.evaluate(async () => (await import('/src/core/store.js')).exportBackup());
  expect(backup.format).toBe('melete-backup');
  expect(JSON.parse(backup.data['a:settings']).lang).toBe('el');
});

test('no horizontal scroll on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  for (const hash of ['', '#/learn', '#/learn/methods', '#/settings', '#/do', '#/do/focus', '#/do/plan', '#/do/courses']) {
    await open(page, 'el', hash);
    await page.waitForSelector('main .view > *');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, hash).toBeLessThanOrEqual(1);
  }
});

test('every item opens in every language', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(180000);
  for (const lang of Object.keys(LANGS)) {
    const errors = await open(page, lang, '#/learn');
    const ids = await page.evaluate(async (l) => (await (await fetch(`/content/${l}/index.json`)).json()).sections.flatMap((s) => s.items.map((i) => i.id)), lang);
    expect(ids.length).toBe(123);
    for (const id of ids) {
      await page.evaluate((h) => { location.hash = h; }, `#/learn/method/${id}`);
      await expect(page.locator('article h1')).toBeVisible();
    }
    expect(errors, lang).toEqual([]);
  }
});
