// Phase 6 in the browser: sign-in with a fake Supabase backend, sync, restore points, the noema-lite
// subject list, course import, deep links, "what next" and the write-back inbox. No real network:
// Supabase is replaced by tests/fixtures/fake-supabase.js and noema-lite's site by page.route().
import { test, expect } from './fixtures/test.js';
import { readFileSync } from 'node:fs';

const PACK = readFileSync(new URL('./fixtures/noema-pack.json', import.meta.url), 'utf8');
const REGISTRY = readFileSync(new URL('./fixtures/noema-registry.js', import.meta.url), 'utf8');
const FAKE = new URL('./fixtures/fake-supabase.js', import.meta.url).pathname;
const NOEMA = 'https://noema-lite.netlify.app';

async function open(page, hash = '', { lang = 'en', fake = true, cors = true, proxy = false } = {}) {
  await page.addInitScript((l) => { if (!localStorage.getItem('meletee1:local:a:settings') && !localStorage.getItem('meletee1:current')) localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l })); }, lang);
  if (fake) await page.addInitScript({ path: FAKE });
  const real = [];
  await page.route('**/*.supabase.co/**', (r) => { real.push(r.request().url()); return r.abort(); });
  await page.route(`${NOEMA}/**`, (r) => {
    const u = new URL(r.request().url());
    const headers = cors ? { 'access-control-allow-origin': '*' } : {};
    if (u.pathname === '/library/registry.js') return r.fulfill({ status: 200, contentType: 'text/javascript', headers, body: REGISTRY });
    if (u.pathname === '/library/subjects/databricks/pack.json') return r.fulfill({ status: 200, contentType: 'application/json', headers, body: PACK });
    if (u.pathname === '/library/subjects/databricks/pack.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: `(window.NOEMA_PACKS = window.NOEMA_PACKS || {})["databricks"] = ${PACK};` });
    return r.fulfill({ status: 404, body: '' });
  });
  // Netlify's same-origin proxy of noema-lite's library (docs/SECURITY-HEADERS.md); the dev server has none.
  const proxied = [];
  await page.route('**/noema-library/**', (r) => {
    const u = new URL(r.request().url());
    proxied.push(u.pathname);
    if (proxy && u.pathname === '/noema-library/registry.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: REGISTRY });
    if (proxy && u.pathname === '/noema-library/subjects/databricks/pack.json') return r.fulfill({ status: 200, contentType: 'application/json', body: PACK });
    return r.fulfill({ status: 404, body: '' });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return { errors, real, proxied };
}

const noScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

async function signIn(page) {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('E-mail').fill('ada@example.com');
  await page.getByLabel(/^Password/).fill('correct-horse');
  await page.locator('form.cloud-form button[type=submit]').click();
  await expect(page.locator('.cloud-email')).toHaveText('ada@example.com', { timeout: 15000 });
}

test('with requireAccount off: settings offers a sign-in sheet and the app stays local', async ({ page }) => {
  const { errors, real } = await open(page, '#/settings');
  await expect(page.getByRole('heading', { name: /Cloud sync/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('E-mail').fill('ada@example.com');
  await page.getByLabel(/^Password/).fill('wrong-password');
  await page.locator('form.cloud-form button[type=submit]').click();
  await expect(page.locator('.cloud-form [role=status]')).toContainText('Invalid login credentials');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await expect(page.locator('#cloud-name')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('meletee1:current'))).toBe(null);
  await noScroll(page);
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('sign in moves this device’s data to the account, syncs it and never syncs device keys', async ({ page }) => {
  const { errors, real } = await open(page, '#/do/courses');
  await page.evaluate(() => {
    localStorage.setItem('meletee1:local:a:courses', JSON.stringify([{ id: 'c1', name: 'Biology', examDate: null, sources: [], topics: [], createdAt: '2026-10-01' }]));
    localStorage.setItem('meletee-device:anthropicKey:local', 'sk-ant-secret');
  });
  await signIn(page);
  await expect(page.locator('.cloud-status')).toHaveText(/In sync|Syncing/);
  const db = await page.evaluate(() => window.__fakeDb());
  const keys = db.tables.meletee_kv.map((r) => r.key);
  expect(keys).toContain('a:courses');
  expect(keys).toContain('a:settings');
  expect(JSON.stringify(db)).not.toContain('sk-ant-secret');
  expect(await page.evaluate(() => localStorage.getItem('meletee1:current'))).toMatch(/^u_/);
  // a change is pushed after the debounce
  await page.goto('/#/do/courses');
  await expect(page.getByRole('heading', { name: 'Biology' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a course' }).click();
  await page.locator('#ask-input').fill('Chemistry');
  await page.locator('#ask-input').press('Enter');
  await expect.poll(async () => page.evaluate(() => (window.__fakeDb().tables.meletee_kv.find((r) => r.key === 'a:courses') || {}).value || ''), { timeout: 8000 }).toContain('Chemistry');
  // sign out: back to local data
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meletee1:current'))).toBe(null);
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('restore points: save one and go back to it', async ({ page }) => {
  const { errors } = await open(page, '#/settings');
  await signIn(page);
  await page.evaluate(() => { const k = `meletee1:${localStorage.getItem('meletee1:current')}:a:profile`; localStorage.setItem(k, JSON.stringify({ name: 'Ada' })); });
  await page.getByRole('button', { name: /Restore points/ }).click();
  await expect(page.locator('.cloud-restore .list > div')).toHaveCount(1);       // the daily one, made at sign-in
  await page.getByRole('button', { name: 'Save one now' }).click();
  await expect(page.locator('.cloud-restore .list > div')).toHaveCount(2);
  await page.evaluate(() => { const k = `meletee1:${localStorage.getItem('meletee1:current')}:a:profile`; localStorage.setItem(k, JSON.stringify({ name: 'Changed' })); });
  await page.locator('.cloud-restore .list > div').first().getByRole('button', { name: 'Restore' }).click();
  await page.locator('.sheet').last().getByRole('button', { name: 'Restore' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(`meletee1:${localStorage.getItem('meletee1:current')}:a:profile`)).name)).toBe('Ada');
  expect(errors).toEqual([]);
});

test('import a noema-lite subject as a course, with deep links on its topics', async ({ page }) => {
  const { errors, real } = await open(page, '#/do/courses');
  await page.getByRole('link', { name: /Import from noema-lite/ }).click();
  await expect(page.getByRole('heading', { name: 'From noema-lite' })).toBeVisible();
  await page.getByRole('link', { name: /Databricks/ }).click();
  await expect(page.getByText('2 chapters · 4 sections · 12 exercises')).toBeVisible();
  await page.getByRole('button', { name: 'One per section' }).click();
  await noScroll(page);
  await page.getByRole('button', { name: 'Import as a course' }).click();
  await expect(page.getByRole('heading', { name: 'Databricks', level: 1 })).toBeVisible();
  await expect(page.locator('.topics > button')).toHaveCount(4);
  await expect(page.locator('.noema-card')).toContainText(/Start with/);
  await page.locator('.topics > button').first().click();
  const read = page.locator('.noema-links a', { hasText: 'Read' });
  await expect(read).toHaveAttribute('href', `${NOEMA}/?subject=databricks#/s/ch01-s01`);
  await expect(page.locator('.noema-links a', { hasText: 'Practise' })).toHaveAttribute('href', `${NOEMA}/?subject=databricks#/practice/ch01`);
  await expect(page.locator('.noema-links a', { hasText: 'Cards' })).toHaveAttribute('href', `${NOEMA}/?subject=databricks#/ch/ch01/cards`);
  await noScroll(page);
  const course = await page.evaluate(() => JSON.parse(localStorage.getItem('meletee1:local:a:courses'))[0]);
  expect(course.topics[1].noema).toEqual({ subject: 'databricks', chapter: 'ch01', section: 'ch01-s02' });
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('without CORS the library loads as data through the same-origin proxy, never as a script', async ({ page }) => {
  const scripts = [];
  page.on('request', (q) => { if (q.resourceType() === 'script' && !q.url().startsWith('http://localhost')) scripts.push(q.url()); });
  const { errors, proxied } = await open(page, '#/noema/databricks', { cors: false, proxy: true });
  await expect(page.getByRole('button', { name: 'Import as a course' })).toBeVisible();
  expect(proxied).toContain('/noema-library/subjects/databricks/pack.json');
  expect(scripts).toEqual([]);
  expect(await page.evaluate(() => [typeof window.NOEMA_PACKS, typeof window.NOEMA_REGISTRY, document.querySelectorAll('script[src*="noema"]').length])).toEqual(['undefined', 'undefined', 0]);
  expect(errors).toEqual([]);
});

test('without the proxy the library is fetched from noema-lite as data; pack.js / registry.js never run', async ({ page }) => {
  const scripts = [], packJs = [];
  page.on('request', (q) => {
    if (q.resourceType() === 'script' && q.url().includes('noema-lite')) scripts.push(q.url());
    if (q.url().endsWith('/pack.js')) packJs.push(q.url());
  });
  const { errors, proxied } = await open(page, '#/noema/databricks');
  await expect(page.getByRole('button', { name: 'Import as a course' })).toBeVisible();
  expect(proxied).toContain('/noema-library/registry.js'); // tried first, 404 on the dev server
  expect(scripts).toEqual([]);
  expect(packJs).toEqual([]);
  expect(await page.evaluate(() => [typeof window.NOEMA_PACKS, typeof window.NOEMA_REGISTRY])).toEqual(['undefined', 'undefined']);
  expect(errors).toEqual([]);
});

test('signed in: progress from noema-lite suggests what next, and reviews go back through the inbox', async ({ page }) => {
  const { errors, real } = await open(page, '#/settings');
  await signIn(page);
  await page.evaluate(() => {
    const uid = window.__fakeUser.id;
    const state = { xp: 10, read: { 'ch01-s01': true }, res: { 'ch01-e002': { n: 1, ok: 0, last: false } }, fc: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`ch01#${i}`, { box: 1, due: '2020-01-01' }])), pb: {} };
    const db = window.__fakeDb();
    db.tables.noema_kv = [
      { user_id: uid, key: 's:databricks:state', value: JSON.stringify(state), updated_at: new Date().toISOString() },
      { user_id: uid, key: 'a:settings', value: JSON.stringify({ apiKey: 'AIza-secret' }), updated_at: new Date().toISOString() },
      { user_id: uid, key: 'a:caps', value: JSON.stringify({ resultsInbox: 1 }), updated_at: new Date().toISOString() },
    ];
    window.__fakeSeed(db);
  });
  await page.goto('/#/noema');
  await expect(page.locator('.noema-subj [role=img]')).toHaveAttribute('aria-label', '25% read');
  await page.goto('/#/noema/databricks');
  await page.getByRole('button', { name: 'One per chapter' }).click();
  await page.getByRole('button', { name: 'Import as a course' }).click();
  await expect(page.locator('.noema-card')).toContainText('5 flashcards are waiting');
  await expect(page.locator('.noema-card a', { hasText: 'Let’s go' }).or(page.locator('.noema-card a', { hasText: "Let's go" }))).toHaveAttribute('href', `${NOEMA}/?subject=databricks#/ch/ch01/cards`);
  // the key in noema-lite's settings is never read by Meletee
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith('meletee'))))).not.toContain('AIza-secret');
  // studying a linked topic in Meletee is written to noema-lite's inbox
  await page.locator('.topics > button').first().click();
  await page.getByRole('button', { name: /studied/i }).click();
  await expect.poll(() => page.evaluate(() => (window.__fakeDb().tables.noema_kv || []).filter((r) => r.key.startsWith('a:inbox:meletee:')).length)).toBe(1);
  const v = await page.evaluate(() => JSON.parse(window.__fakeDb().tables.noema_kv.find((r) => r.key.startsWith('a:inbox:meletee:')).value));
  expect(v).toMatchObject({ schema: 'noema.results/v1', app: 'meletee', subject: 'databricks', items: [{ kind: 'chapter', id: 'ch01', event: 'studied' }] });
  // the queue on the noema page
  await page.goto('/#/noema');
  await expect(page.locator('.noema-queue .list > a').first()).toContainText('5 cards');
  await noScroll(page);
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('results wait on the device while noema-lite has no inbox', async ({ page }) => {
  const { errors } = await open(page, '#/settings');
  await signIn(page);
  await page.goto('/#/noema/databricks');
  await page.getByRole('button', { name: 'Import as a course' }).click();
  await page.locator('.topics > button').first().click();
  await page.getByRole('button', { name: /studied/i }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(`meletee1:${localStorage.getItem('meletee1:current')}:cache:noemaOutbox`) || '[]').length)).toBe(1);
  expect(await page.evaluate(() => (window.__fakeDb().tables.noema_kv || []).length)).toBe(0);
  expect(errors).toEqual([]);
});

test('conversations saved before sign-in move to the account and reach noema_conversations', async ({ page }) => {
  const { errors } = await open(page, '#/settings');
  await page.evaluate(async () => {
    const c = await import('/src/ai/convos.js');
    await c.put({ kind: 'tutor', title: 'Before sign-in', messages: [{ role: 'user', content: 'hi' }], meta: { app: 'meletee' } });
  });
  await signIn(page);
  await expect.poll(() => page.evaluate(() => (window.__fakeDb().tables.noema_conversations || []).map((r) => r.title)), { timeout: 10000 }).toEqual(['Before sign-in']);
  expect(errors).toEqual([]);
});

test('AI conversations saved by Meletee land in noema-lite’s noema_conversations table', async ({ page }) => {
  const { errors } = await open(page, '#/settings');
  await signIn(page);
  await page.evaluate(async () => {
    const c = await import('/src/ai/convos.js');
    await c.put({ kind: 'tutor', mode: 'feynman', title: 'Krebs cycle', context: { type: 'topic', id: 't1', label: 'Krebs cycle' }, messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], meta: { app: 'meletee' } });
  });
  await expect.poll(() => page.evaluate(() => (window.__fakeDb().tables.noema_conversations || []).length), { timeout: 10000 }).toBe(1);
  const row = await page.evaluate(() => window.__fakeDb().tables.noema_conversations[0]);
  expect(row).toMatchObject({ kind: 'tutor', mode: 'feynman', title: 'Krebs cycle', context_label: 'Krebs cycle', message_count: 2, deleted: false, subject_id: null });
  expect(row.id).toMatch(/^cv_/);
  expect(row.record.schema).toBe('noema.conversation/v1');
  expect(errors).toEqual([]);
});

for (const lang of ['el', 'ru', 'fr']) {
  test(`noema-lite screens and settings are translated (${lang})`, async ({ page }) => {
    const { errors } = await open(page, '#/noema', { lang });
    await expect(page.locator('.noema-subj')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/noema\.[a-z]/);
    await page.goto('/#/settings');
    await expect(page.locator('section.cloud')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/cloud\.[a-z]/);
    await noScroll(page);
    expect(errors).toEqual([]);
  });
}
