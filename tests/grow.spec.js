import { test, expect } from './fixtures/test.js';

const K = (name) => `meletee1:local:a:${name}`;

// Seeds settings (and optional data) once, so reloads keep what the page saved.
async function open(page, hash = '', { lang = 'en', seed = {}, time = '2026-10-08T09:00:00' } = {}) {
  await page.clock.install({ time: new Date(time) });
  await page.route('**/src/ai/coach.js', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(({ l, seed }) => {
    if (localStorage.getItem('meletee1:local:a:settings')) return;
    localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l }));
    for (const [k, v] of Object.entries(seed)) localStorage.setItem('meletee1:local:a:' + k, JSON.stringify(v));
  }, { l: lang, seed });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return errors;
}

const read = (page, name) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), K(name));

test('Grow shows the garden, a forgiving week of leaves and a short list of ways in', async ({ page }) => {
  // Mon 5 to Wed 7 Oct: focus sessions, a review and workspace work -> 3 study days this week
  const errors = await open(page, '#/grow', { seed: {
    sessions: [{ date: '2026-10-05', minutes: 25 }, { date: '2026-10-06', minutes: 50 }],
    courses: [{ id: 'c1', name: 'Bio', topics: [{ id: 't1', title: 'Cells', studiedAt: '2026-10-01', reviewStep: 1, reviewLog: [{ date: '2026-10-07', rating: 'ok' }] }] }],
    'ws:blank:pages': [{ createdAt: '2026-10-01' }],
  } });
  await expect(page.getByRole('heading', { name: 'Your garden' })).toBeVisible();
  await expect(page.locator('svg.garden')).toBeVisible();
  await expect(page.locator('.grow-hero .lede')).toHaveText('3 of 5 days this week · 2 more days and this week counts');
  await expect(page.locator('.week-dots li[data-on="true"]')).toHaveCount(3);
  await expect(page.locator('.grow-meta .badge.leaf')).toContainText('light points');
  await expect(page.locator('.insight')).toBeVisible();
  for (const name of ['Method Lab', 'Done list & wins', 'Weekly reflection', 'Calm corner', 'My why']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }
  // a new garden stage is celebrated once
  await page.clock.runFor(500);
  await expect(page.locator('.toast')).toHaveText('Your garden grew! 🌸');
  expect((await read(page, 'grow:garden')).seen).toBeGreaterThan(0);
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noScroll).toBe(true);
  expect(errors).toEqual([]);
});

test('workspace saves anywhere in the app count as a study day', async ({ page }) => {
  const errors = await open(page, '#/grow');
  await expect(page.locator('.week-dots li[data-on="true"]')).toHaveCount(0);
  // the app attaches this listener in its background work (startBackground); make sure it is on before
  // poking the store from outside, so this tests the logging and not the boot order (listen() is idempotent)
  await page.evaluate(async () => {
    (await import('/src/grow/data.js')).listen();
    const s = await import('/src/core/store.js');
    s.set('ws:recall:deck', { cards: [] });
  });
  expect(await read(page, 'grow:days')).toEqual({ '2026-10-08': 1 });
  await page.reload();
  await expect(page.locator('.week-dots li[data-on="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Method Lab: start, rate a session, rate recall the next day', async ({ page }) => {
  const errors = await open(page, '#/grow/lab');
  await page.getByRole('link', { name: 'Start an experiment' }).click();
  await page.locator('#lab-method').selectOption('blank-page-recall-brain-dump');
  await page.getByRole('button', { name: '🔤 Facts' }).click();
  await page.getByRole('button', { name: '1 week' }).click();
  await page.getByRole('button', { name: /Begin the experiment/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blank-page recall (brain dump)');
  await expect(page.getByText('Day 1 of 7')).toBeVisible();

  await page.getByRole('button', { name: 'Rate today’s session' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Enjoyment: 4 of 5' }).click();
  await dlg.getByRole('button', { name: 'Focus: 3 of 5' }).click();
  await dlg.getByRole('button', { name: 'Effort: 5 of 5' }).click();
  await dlg.locator('#lab-minutes').fill('30');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('1 of 5 sessions')).toBeVisible();
  let lab = await read(page, 'grow:lab');
  expect(lab[0]).toMatchObject({ method: 'blank-page-recall-brain-dump', contentType: 'facts', days: 7 });
  expect(lab[0].sessions[0]).toMatchObject({ enjoy: 4, focus: 3, effort: 5, recall: null, minutes: 30, date: '2026-10-08' });

  // the next day: a 2-minute self-quiz, then rate recall
  await page.clock.setSystemTime(new Date('2026-10-09T08:00:00'));
  await page.reload();
  await expect(page.getByText('Next-day check')).toBeVisible();
  await page.getByRole('button', { name: 'Recall: 4 of 5' }).click();
  await page.clock.runFor(400);
  await expect(page.getByText('Next-day check')).toHaveCount(0);
  lab = await read(page, 'grow:lab');
  expect(lab[0].sessions[0].recall).toBe(4);
  expect(errors).toEqual([]);
});

test('Method Lab: after 5 sessions, compare with the usual way, keep it and see it in My methods', async ({ page }) => {
  const s = (i, recall, enjoy) => ({ id: `s${i}`, date: `2026-10-0${i + 1}`, recall, enjoy, focus: 4, effort: 4, minutes: null });
  const errors = await open(page, '#/grow/lab/x1', { seed: { 'grow:lab': [
    { id: 'x1', method: 'practice-questions', title: '', courseId: null, contentType: 'skills', days: 14, start: '2026-10-01', decision: null, decidedAt: null, note: '', sessions: [0, 1, 2, 3, 4].map((i) => s(i, 4, 4)) },
    { id: 'x0', method: 'usual', title: '', courseId: null, contentType: 'skills', days: 14, start: '2026-10-01', decision: null, decidedAt: null, note: '', sessions: [0, 1].map((i) => s(i, 2, 3)) },
  ] } });
  await expect(page.getByRole('heading', { name: 'Keep, tweak or drop?' })).toBeVisible();
  await expect(page.getByText('Good recall and you enjoy it')).toBeVisible();
  await expect(page.locator('table.lab-compare')).toContainText('My usual way');
  await expect(page.getByText('Recall is higher with this one so far.')).toBeVisible();
  await page.locator('#lab-note').fill('Great for maths');
  await page.getByRole('button', { name: '💚 Keep' }).click();
  await expect(page.locator('.toast')).toContainText('Decision saved');
  expect((await read(page, 'grow:lab'))[0]).toMatchObject({ decision: 'keep', note: 'Great for maths', decidedAt: '2026-10-08' });
  await page.goto('/#/grow/lab');
  await page.getByRole('link', { name: /My methods/ }).click();
  await expect(page.getByRole('heading', { name: 'My methods' })).toBeVisible();
  await expect(page.locator('.profile')).toContainText('Practice questions');
  await expect(page.getByText('What works for which material')).toBeVisible();
  await expect(page.getByRole('link', { name: /Try next/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('done list and wins: quick add, star, archive of earlier days', async ({ page }) => {
  const errors = await open(page, '#/grow/wins', { seed: { 'grow:wins': [
    { id: 'old1', text: 'Finished problem set 2', kind: 'win', date: '2026-10-06' },
    { id: 'old2', text: 'Read chapter 1', kind: 'done', date: '2026-10-06' },
  ] } });
  await expect(page.getByText('Nothing yet today')).toBeVisible();
  await page.locator('#win-text').fill('30 cards');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: '🏆 Win' }).click();
  await page.locator('#win-text').fill('Explained osmosis to a friend');
  await page.locator('#win-text').press('Enter');
  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: /Today/ }) });
  await expect(today.locator('li')).toHaveCount(2);
  await today.getByRole('button', { name: 'Mark as a win' }).click();
  await expect(today.locator('li[data-kind="win"]')).toHaveCount(2);
  await page.getByText('Earlier days').click();
  await expect(page.getByText('Read chapter 1')).toBeVisible();
  await page.getByRole('button', { name: /Wins only/ }).click();
  await expect(page.getByText('Read chapter 1')).toHaveCount(0);
  await expect(page.getByText('Finished problem set 2')).toBeVisible();
  expect((await read(page, 'grow:wins')).length).toBe(4);
  expect(errors).toEqual([]);
});

test('weekly reflection autosaves per ISO week and keeps earlier weeks', async ({ page }) => {
  const errors = await open(page, '#/grow/reflect', { seed: { 'grow:reflect': { '2026-W40': { done: 'All reviews', slipped: '', change: 'Essay on Saturday' } } } });
  await page.getByLabel('What did I get done?').fill('Four lectures');
  await page.getByLabel('One change for next week').fill('Earlier start');
  await page.clock.runFor(700);
  expect((await read(page, 'grow:reflect'))['2026-W41']).toMatchObject({ done: 'Four lectures', change: 'Earlier start' });
  await page.reload();
  await expect(page.getByLabel('What did I get done?')).toHaveValue('Four lectures');
  await page.locator('summary', { hasText: /Sep 28|28 Sep/ }).click();
  await expect(page.getByText('Essay on Saturday')).toBeVisible();
  expect(errors).toEqual([]);
});

test('worry dump: write it, put it away, nothing is stored', async ({ page }) => {
  const errors = await open(page, '#/grow/calm');
  await page.getByRole('link', { name: /Worry dump/ }).click();
  await page.locator('#worry-text').fill('I am scared of the anatomy exam');
  await page.getByRole('button', { name: /Put it away/ }).click();
  await expect(page.locator('.worry-paper')).toBeVisible();
  await page.clock.runFor(1600);
  await expect(page.getByRole('heading', { name: 'Put away.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start with 5 minutes' })).toHaveAttribute('href', '#/do/focus');
  const all = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(all).not.toContain('anatomy');
  expect((await read(page, 'grow:calm')).worries).toBe(1);
  expect(errors).toEqual([]);
});

test('breathing: 4-4-6 guides in, hold, out and finishes', async ({ page }) => {
  const errors = await open(page, '#/grow/calm/breathe');
  await page.getByRole('button', { name: 'Start' }).click();
  const word = page.locator('.breath-word');
  await expect(word).toHaveText('Breathe in');
  await page.clock.runFor(4000);
  await expect(word).toHaveText('Hold');
  await page.clock.runFor(4000);
  await expect(word).toHaveText('Breathe out slowly');
  expect(await page.locator('.breath-circle').evaluate((e) => e.style.transform)).toBe('scale(0.55)');
  await page.clock.runFor(14000 * 3 + 6000);
  await expect(page.locator('.breath-label')).toHaveText('Nicely done 🫧');
  expect((await read(page, 'grow:calm')).breaths).toBe(1);
  expect(errors).toEqual([]);
});

test('breathing respects reduced motion (the circle stays still)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page, '#/grow/calm/breathe');
  await page.getByRole('button', { name: 'Sigh' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.breath-word')).toHaveText('Breathe in');
  const tr = await page.locator('.breath-circle').evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(tr).toBe('0s');
  expect(errors).toEqual([]);
});

test('my why: write once, show it on Home with the garden glimpse', async ({ page }) => {
  const errors = await open(page, '#/grow/why');
  await page.locator('#why-text').fill('To talk with my grandmother in her language.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.why-card blockquote')).toHaveText('To talk with my grandmother in her language.');
  await page.getByLabel('Show it on Home').check();
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible();
  await expect(page.locator('.home-why')).toContainText('grandmother');
  await expect(page.locator('.home-glimpse svg.garden')).toBeVisible();
  await expect(page.locator('.home-glimpse')).toContainText('💡');
  expect(errors).toEqual([]);
});

for (const [lang, title] of Object.entries({ el: 'Ο κήπος σου', ru: 'Твой сад', fr: 'Ton jardin' })) {
  test(`Grow screens are translated in ${lang}`, async ({ page }) => {
    const errors = await open(page, '#/grow', { lang });
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    for (const r of ['#/grow', '#/grow/lab', '#/grow/lab/new', '#/grow/wins', '#/grow/reflect', '#/grow/calm', '#/grow/calm/breathe', '#/grow/why', '#/grow/methods']) {
      await page.goto('/' + r);
      await expect(page.locator('h1').first()).toBeVisible();
      const text = await page.locator('main').innerText();
      expect(text, r).not.toMatch(/grow\.[a-z]/);
    }
    expect(errors).toEqual([]);
  });
}
