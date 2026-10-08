// Accessibility: axe-core on every main screen, in light and dark, in English and Greek (desktop),
// plus English light on the phone. Serious and critical violations fail the test. Also checks
// keyboard basics: sheets trap focus, close on Escape and give focus back; the skip link works.
// No real network: Supabase is absent (signed out) and noema-lite is answered by page.route().
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const PACK = readFileSync(new URL('./fixtures/noema-pack.json', import.meta.url), 'utf8');
const REGISTRY = readFileSync(new URL('./fixtures/noema-registry.js', import.meta.url), 'utf8');
const NOEMA = 'https://noema-lite.netlify.app';

const WS = ['recall', 'srs', 'interleave', 'pretest', 'relearn', 'blank', 'feynman', 'teach', 'selfexp', 'dual', 'practice', 'why', 'examples', 'notes', 'memory'];
const ROUTES = {
  core: ['/', '/learn', '/learn/methods', '/learn/method/active-recall-practice-testing', '/learn/guide', '/learn/guide/how-learning-works', '/learn/myths', '/learn/find',
    '/do', '/do/focus', '/do/courses', '/do/course/c1', '/do/reviews', '/do/plan', '/settings', '/privacy'],
  ws: ['/ws', ...WS.map((w) => `/ws/${w}`)],
  grow: ['/grow', '/grow/lab', '/grow/lab/new', '/grow/lab/x1', '/grow/methods', '/grow/wins', '/grow/reflect', '/grow/calm', '/grow/calm/worry', '/grow/calm/breathe', '/grow/why',
    '/buddies', '/noema', '/noema/databricks'],
};

async function setup(page, { lang = 'en', theme = 'light' } = {}) {
  // no entrance animations while axe measures colours (a fading view would read as low contrast)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ lang, theme }) => {
    if (localStorage.getItem('meletee1:local:a:settings')) return;
    const set = (k, v) => localStorage.setItem('meletee1:local:a:' + k, JSON.stringify(v));
    set('settings', { lang, theme });
    const today = new Date().toISOString().slice(0, 10);
    set('courses', [{ id: 'c1', name: 'Biology', examDate: '2030-06-01', sources: [], createdAt: today,
      topics: [{ id: 't1', title: 'Cells', stages: {}, reviewStep: 0, studiedAt: today }, { id: 't2', title: 'Enzymes', stages: {}, reviewStep: 0, studiedAt: null }] }]);
    set('grow:lab', [{ id: 'x1', method: 'active-recall-practice-testing', title: '', courseId: 'c1', contentType: 'facts', days: 14, start: today,
      sessions: [{ id: 's1', date: today, enjoy: 4, focus: 3, effort: 3, recall: null, minutes: 25 }], decision: null, decidedAt: null, note: '' }]);
    set('sessions', [{ id: 'f1', at: new Date().toISOString(), minutes: 25, label: 'Cells' }]);
  }, { lang, theme });
  await page.route('**/*.supabase.co/**', (r) => r.abort());
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(`${NOEMA}/**`, (r) => {
    const u = new URL(r.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (u.pathname === '/library/registry.js') return r.fulfill({ status: 200, contentType: 'text/javascript', headers, body: REGISTRY });
    if (u.pathname === '/library/subjects/databricks/pack.json') return r.fulfill({ status: 200, contentType: 'application/json', headers, body: PACK });
    return r.fulfill({ status: 404, body: '' });
  });
}

async function scan(page, route) {
  await page.goto('/#' + route);
  await expect(page.locator('#main > .view'), route).not.toBeEmpty();
  await expect(page.locator('#main h1').first(), route).toBeAttached();
  await page.waitForTimeout(150); // let async parts of the screen settle
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${route} [${v.id}] ${v.help}\n    ${v.nodes.slice(0, 8).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join('')).join('\n    ')}`);
}

const MATRIX = [
  { lang: 'en', theme: 'light' }, { lang: 'en', theme: 'dark' },
  { lang: 'el', theme: 'light' }, { lang: 'el', theme: 'dark' },
];

for (const m of MATRIX) {
  for (const [group, routes] of Object.entries(ROUTES)) {
    test(`axe: ${group} screens, ${m.lang} ${m.theme}`, async ({ page }, info) => {
      // the phone checks English light only (layouts differ; colours and names do not)
      test.skip(info.project.name === 'phone' && (m.lang !== 'en' || m.theme !== 'light'), 'desktop covers the rest');
      test.setTimeout(120_000);
      await setup(page, m);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const found = [];
      for (const r of routes) found.push(...await scan(page, r));
      expect(found, found.join('\n')).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('axe: open sheets and forms', async ({ page }) => {
  await setup(page);
  const found = [];
  const check = async (label) => {
    await page.waitForTimeout(200);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    found.push(...res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${label} [${v.id}] ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`));
  };
  await page.goto('/#/');
  await page.getByRole('button', { name: 'What now?' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('what-now sheet');
  await page.keyboard.press('Escape');
  await page.locator('header.topbar button.icon-btn').click();
  await expect(page.locator('#park-input')).toBeFocused();
  await check('parking sheet');
  await page.keyboard.press('Escape');
  await page.goto('/#/do/courses');
  await page.getByRole('button', { name: 'Add a course' }).click();
  await expect(page.locator('#ask-input')).toBeVisible();
  await check('ask sheet');
  await page.keyboard.press('Escape');
  await page.goto('/#/privacy');
  await page.getByRole('button', { name: 'Delete from this device' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('confirm sheet');
  expect(found, found.join('\n')).toEqual([]);
});

test('sheets trap focus, close on Escape and give focus back', async ({ page }) => {
  await setup(page);
  await page.goto('/#/');
  const opener = page.getByRole('button', { name: 'What now?' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Tab and Shift+Tab never leave the sheet
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'))).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  // the parking lot from the top bar: Escape closes it and focus returns to its button
  const park = page.locator('header.topbar button.icon-btn');
  await park.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#park-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(park).toBeFocused();
});

test('the skip link moves focus to the content, and navigation lands on the new screen', async ({ page }) => {
  await setup(page);
  await page.goto('/#/learn');
  await expect(page.locator('#main h1')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.locator('nav.nav a[data-path="/do"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/do$/);
  await expect(page.locator('#main')).toBeFocused();
  await expect(page).toHaveTitle(/· Meletee$/);
});

test('reduced motion: nothing keeps moving', async ({ page }) => {
  await setup(page);
  for (const r of ['/', '/grow', '/grow/calm/breathe', '/do/focus']) {
    await page.goto('/#' + r);
    await expect(page.locator('#main h1').first()).toBeVisible();
    await page.waitForTimeout(100);
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length);
    expect(moving, r).toBe(0);
  }
});
