// An account is required (config.js requireAccount, the default): the welcome screen, creating an account,
// signing in with an existing (noema-lite) account, wrong passwords, forgot password, e-mail links, signing
// out, study from before accounts moving in, a second device getting everything back (conversations and
// logs too), offline use with a cached or expired session, and axe on the welcome screen.
// Supabase is the fake backend (tests/fixtures/fake-supabase.js) except where the real client is tested
// with page.route(); nothing reaches the network.
import { test, expect } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';

test.use({ requireAccount: true });

const FAKE = new URL('./fixtures/fake-supabase.js', import.meta.url).pathname;
const UID = '11111111-2222-3333-4444-555555555555';
const ACC = 'u_' + UID;

async function open(page, hash = '', { lang = 'en', theme = null, fake = true, seed = null, local = null } = {}) {
  await page.addInitScript(({ lang, theme, seed, local }) => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang, ...(theme ? { theme } : {}) }));
    if (seed) localStorage.setItem('__fakeSupabase', JSON.stringify(seed));
    for (const [k, v] of Object.entries(local || {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, { lang, theme, seed, local });
  if (fake) await page.addInitScript({ path: FAKE });
  const real = [];
  if (fake) await page.route('**/*.supabase.co/**', (r) => { real.push(r.request().url()); return r.abort(); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return { errors, real };
}

const welcomeHeading = (page) => page.getByRole('heading', { name: 'Welcome to Meletee', level: 1 });
const noScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

async function signIn(page, email = 'ada@example.com', password = 'correct-horse') {
  await page.getByRole('button', { name: 'Sign in with your noema-lite account' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.locator('form.welcome-form button[type=submit]').click();
}

test('signed out: the welcome screen stands in for every screen except the privacy page', async ({ page }) => {
  const { errors, real } = await open(page, '#/do/courses');
  await expect(welcomeHeading(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with your noema-lite account' })).toBeVisible();
  await expect(page.getByText('One account works in both apps')).toBeVisible();
  await expect(page.locator('.welcome-local')).toHaveCount(0);           // nothing from before on this device
  await expect(page.locator('nav.nav')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Courses' })).toHaveCount(0);
  for (const r of ['#/', '#/settings', '#/grow', '#/buddies', '#/ws/recall']) {
    await page.goto('/' + r);
    await expect(welcomeHeading(page)).toBeVisible();
  }
  await page.getByRole('link', { name: /Where your data goes/ }).click();
  await expect(page.getByRole('heading', { name: /Your privacy/ })).toBeVisible();
  await expect(page.getByText(/Meletee needs an account/)).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(welcomeHeading(page)).toBeVisible();
  await noScroll(page);
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('create an account (no e-mail confirmation): straight into the app', async ({ page }) => {
  const { errors } = await open(page, '#/', { seed: { tables: {}, storage: {}, seq: 1, log: [], autoConfirm: true } });
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: /Create your account/ })).toBeFocused();
  await page.getByLabel('Your name').fill('Grace');
  await page.getByLabel('E-mail').fill('grace@example.com');
  await page.getByLabel(/^Password/).fill('short');
  await page.locator('form.welcome-form button[type=submit]').click();
  await expect(page.locator('.welcome-msg')).toHaveText('Pick a password with at least 8 characters.');
  await page.getByLabel(/^Password/).fill('a-long-password');
  await page.locator('form.welcome-form button[type=submit]').click();
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('nav.nav')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meletee1:current'))).toMatch(/^u_99999999-/);
  expect(errors).toEqual([]);
});

test('create an account that must confirm its e-mail first, then sign in', async ({ page }) => {
  const { errors } = await open(page, '#/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('E-mail').fill('ada@example.com');
  await page.getByLabel(/^Password/).fill('a-long-password');
  await page.locator('form.welcome-form button[type=submit]').click();
  await expect(page.locator('.welcome-msg')).toContainText('already an account with this e-mail');   // e.g. made in noema-lite
  await page.getByLabel('E-mail').fill('new@example.com');
  await page.locator('form.welcome-form button[type=submit]').click();
  await expect(page.getByRole('heading', { name: /Check your inbox/ })).toBeFocused();
  await expect(page.getByText('We sent a link to new@example.com.')).toBeVisible();
  await page.getByRole('button', { name: 'I’ve confirmed it, sign in' }).click();
  await expect(page.getByLabel('E-mail')).toHaveValue('new@example.com');
  await page.getByLabel(/^Password/).fill('a-long-password');
  await page.locator('form.welcome-form button[type=submit]').click();
  await expect(page.locator('.welcome-msg')).toHaveText('Confirm your e-mail first: the link is in your inbox ✉️');
  await page.evaluate(() => window.__fakeConfirm('new@example.com'));
  await page.locator('form.welcome-form button[type=submit]').click();
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});

test('sign in with an existing noema-lite account: its Meletee data comes down first', async ({ page }) => {
  const now = new Date().toISOString();
  const seed = { tables: {
    noema_kv: [{ user_id: UID, key: 's:databricks:state', value: '{"xp":3}', updated_at: now }],
    meletee_kv: [{ user_id: UID, key: 'a:courses', value: JSON.stringify([{ id: 'c9', name: 'Statistics', examDate: null, sources: [], topics: [], createdAt: '2026-09-01' }]), updated_at: now }],
  }, storage: {}, seq: 1, log: [] };
  const { errors, real } = await open(page, '#/do/courses', { seed });
  await signIn(page, 'ada@example.com', 'wrong-horse');
  await expect(page.locator('.welcome-msg')).toHaveText('That e-mail and password don’t match. Try again, or reset your password.');
  await expect(page.getByLabel('E-mail')).toHaveValue('ada@example.com');
  await page.getByLabel(/^Password/).fill('correct-horse');
  await page.locator('form.welcome-form button[type=submit]').click();
  await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => localStorage.getItem('meletee1:current'))).toBe('u_11111111-2222-3333-4444-555555555555');
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('forgot password: asks for the e-mail, then sends a link', async ({ page }) => {
  const { errors } = await open(page, '#/');
  await page.getByRole('button', { name: 'Sign in with your noema-lite account' }).click();
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(page.locator('.welcome-msg')).toHaveText('Type your e-mail first.');
  await expect(page.getByLabel('E-mail')).toBeFocused();
  await page.getByLabel('E-mail').fill('ada@example.com');
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(page.locator('.welcome-msg')).toContainText('a reset link is on its way');
  expect(await page.evaluate(() => window.__fakeDb().log.filter((l) => l.op === 'recover').map((l) => l.email))).toEqual(['ada@example.com']);
  expect(errors).toEqual([]);
});

test('e-mail links: a reset link signs in and asks for a new password; an expired one says so', async ({ page }) => {
  const { errors } = await open(page, '#access_token=link-token&refresh_token=r1&expires_in=3600&token_type=bearer&type=recovery');
  await expect(page.getByRole('dialog', { name: 'Choose a new password' })).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => location.hash)).toBe('#/');
  await expect(page.locator('#new-password')).toBeFocused();
  await page.locator('#new-password').fill('another-password');
  await page.getByRole('button', { name: 'Save the password' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__fakeDb().log.some((l) => l.op === 'setPassword'))).toBe(true);
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible();
  // an expired link (signed out)
  await page.evaluate(() => localStorage.removeItem('meletee1:cloud:session'));
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.reload();
  await expect(page.getByText('That e-mail link has expired or was already used.')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('#/');
  expect(errors).toEqual([]);
});

test('study from before accounts moves into the account; signing out returns to the welcome screen', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const local = {
    'meletee1:local:a:courses': [{ id: 'c1', name: 'Biology', examDate: null, sources: [], topics: [], createdAt: today }],
    'meletee1:local:a:sessions': [{ id: 'f1', at: new Date().toISOString(), minutes: 25, label: 'Cells' }],
    'meletee1:local:a:grow:wins': [{ id: 'w1', text: 'Finished chapter 1', kind: 'win', date: today }],
  };
  const { errors } = await open(page, '#/', { local });
  await expect(page.locator('.welcome-local')).toContainText('We found some study on this device.');
  await page.evaluate(async () => {
    const c = await import('/src/ai/convos.js');
    await c.put({ kind: 'tutor', title: 'Before accounts', messages: [{ role: 'user', content: 'hi' }], meta: { app: 'meletee' } });
  });
  await signIn(page);
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.__fakeDb().tables.meletee_kv?.map((r) => r.key).sort() || []), { timeout: 10000 })
    .toEqual(expect.arrayContaining(['a:courses', 'a:grow:wins', 'a:sessions', 'a:settings']));
  await expect.poll(() => page.evaluate(() => (window.__fakeDb().tables.noema_conversations || []).map((r) => r.title)), { timeout: 10000 }).toEqual(['Before accounts']);
  // moved, not copied: the local profile keeps only the language and theme
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('meletee1:local:a:')))).toEqual(['meletee1:local:a:settings']);
  await page.goto('/#/do/courses');
  await expect(page.getByRole('heading', { name: 'Biology' })).toBeVisible();
  // sign out → welcome screen, with no "found study" note (it all lives in the account now)
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Sign out' }).click();
  await expect(welcomeHeading(page)).toBeVisible();
  await expect(page.locator('.welcome-local')).toHaveCount(0);
  await expect(page.locator('nav.nav')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a second device gets everything back after signing in: courses, logs, Grow and conversations', async ({ page, browser }) => {
  const { errors } = await open(page, '#/');
  await signIn(page);
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => {
    const store = await import('/src/core/store.js');
    const study = await import('/src/core/study.js');
    store.set('courses', [{ id: 'c1', name: 'Chemistry', examDate: null, sources: [], topics: [], createdAt: '2026-10-01' }]);
    study.logSession({ id: 'f1', at: '2026-10-07T10:00:00.000Z', minutes: 25, label: 'Acids' });
    store.set('grow:wins', [{ id: 'w1', text: 'Balanced 10 equations', kind: 'win', date: '2026-10-07' }]);
    store.set('grow:days', { '2026-10-07': 1 });
    store.set('ws:practice:log', [{ id: 'e1', q: 'pH of water', cause: 'careless' }]);
    const c = await import('/src/ai/convos.js');
    await c.put({ kind: 'tutor', title: 'Acids and bases', messages: [{ role: 'user', content: 'why?' }], meta: { app: 'meletee' } });
    await (await import('/src/cloud/sync.js')).push();
  });
  await expect.poll(() => page.evaluate(() => (window.__fakeDb().tables.noema_conversations || []).length), { timeout: 10000 }).toBe(1);
  const db = await page.evaluate(() => window.__fakeDb());
  expect(db.tables.meletee_kv.map((r) => r.key)).toEqual(expect.arrayContaining(['a:courses', 'a:sessions', 'a:grow:wins', 'a:grow:days', 'a:ws:practice:log']));

  // device 2: a fresh browser profile, same account
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  const e2 = await open(p2, '#/do/courses', { seed: { ...db, log: [] } });
  await expect(welcomeHeading(p2)).toBeVisible();
  await signIn(p2);
  await expect(p2.getByRole('heading', { name: 'Chemistry' })).toBeVisible({ timeout: 15000 });
  const got = await p2.evaluate(async () => {
    const acc = localStorage.getItem('meletee1:current');
    const get = (k) => JSON.parse(localStorage.getItem(`meletee1:${acc}:a:${k}`) || 'null');
    const convos = await (await import('/src/ai/convos.js')).list();
    return { sessions: get('sessions'), wins: get('grow:wins'), days: get('grow:days'), log: get('ws:practice:log'), convos: convos.map((c) => c.title) };
  });
  expect(got.sessions.map((s) => s.label)).toEqual(['Acids']);
  expect(got.wins.map((w) => w.text)).toEqual(['Balanced 10 equations']);
  expect(got.days).toMatchObject({ '2026-10-07': 1 });
  expect(got.log[0].q).toBe('pH of water');
  expect(got.convos).toEqual(['Acids and bases']);
  await p2.goto('/#/grow/wins');
  await expect(p2.getByText('Balanced 10 equations')).toBeAttached();   // under an earlier day
  expect(e2.errors).toEqual([]);
  await ctx.close();
  expect(errors).toEqual([]);
});

test('two devices offline: entries added to the same log on each are all kept', async ({ page }) => {
  const { errors } = await open(page, '#/');
  await signIn(page);
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => {
    const study = await import('/src/core/study.js');
    study.logSession({ id: 'f1', at: '2026-10-06T10:00:00.000Z', minutes: 25, label: 'Both' });
    await (await import('/src/cloud/sync.js')).push();
    // the other device adds a session while this one is offline …
    const db = window.__fakeDb();
    const row = db.tables.meletee_kv.find((r) => r.key === 'a:sessions');
    row.value = JSON.stringify([...JSON.parse(row.value), { id: 'f2', at: '2026-10-07T09:00:00.000Z', minutes: 50, label: 'Other device' }]);
    row.updated_at = new Date(Date.now() + 1000).toISOString();
    db.offline = true; window.__fakeSave(db);
    // … and this one adds its own, offline
    study.logSession({ id: 'f3', at: '2026-10-07T11:00:00.000Z', minutes: 15, label: 'This device' });
    await (await import('/src/cloud/sync.js')).push().catch(() => {});
    const db2 = window.__fakeDb(); db2.offline = false; window.__fakeSave(db2);
    const sync = await import('/src/cloud/sync.js');
    await sync.pull(); await sync.push();
  });
  const labels = await page.evaluate(() => ({
    here: JSON.parse(localStorage.getItem(`meletee1:${localStorage.getItem('meletee1:current')}:a:sessions`)).map((s) => s.label),
    cloud: JSON.parse(window.__fakeDb().tables.meletee_kv.find((r) => r.key === 'a:sessions').value).map((s) => s.label),
  }));
  expect(labels.here.sort()).toEqual(['Both', 'Other device', 'This device']);
  expect(labels.cloud.sort()).toEqual(['Both', 'Other device', 'This device']);
  expect(errors).toEqual([]);
});

test('offline with a cached session the app opens; only a rejected refresh token asks to sign in again', async ({ page, context }) => {
  // the real Supabase client: an expired access token and no network
  const local = {
    'meletee1:cloud:session': { access_token: 'old', refresh_token: 'r1', expires_at: 1000, user: { id: UID, email: 'ada@example.com' } },
    'meletee1:current': ACC,
    [`meletee1:${ACC}:meta:firstSync`]: 1,
    [`meletee1:${ACC}:a:courses`]: [{ id: 'c1', name: 'Geology', examDate: null, sources: [], topics: [], createdAt: '2026-10-01' }],
  };
  let answer = 'offline';
  const tried = [];
  await page.route('**/*.supabase.co/**', (r) => {
    tried.push(new URL(r.request().url()).pathname);
    if (answer === 'offline') return r.abort('internetdisconnected');
    return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }) });
  });
  const { errors } = await open(page, '#/do/courses', { fake: false, local });
  await expect(page.getByRole('heading', { name: 'Geology' })).toBeVisible();
  await expect.poll(() => tried.includes('/auth/v1/token')).toBe(true);           // it tried to refresh …
  await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { name: 'Geology' })).toBeVisible();     // … and kept going offline
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Geology' })).toBeVisible();
  expect(await page.evaluate(() => !!localStorage.getItem('meletee1:cloud:session'))).toBe(true);
  // back online, the server turns the refresh token down: sign in again (the data stays on the device)
  answer = 'rejected';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(welcomeHeading(page)).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate((acc) => !!localStorage.getItem(`meletee1:${acc}:a:courses`), ACC)).toBe(true);
  expect(errors).toEqual([]);
  void context;
});

test('installed app offline: a signed-in learner still gets in', async ({ page, context }) => {
  const { errors } = await open(page, '#/');
  await signIn(page);
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('/#/do/courses');
  await expect(page.locator('#main h1')).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.locator('.cloud-email')).toHaveText('ada@example.com');
  await context.setOffline(true);
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible();
  await expect(welcomeHeading(page)).toHaveCount(0);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

for (const m of [{ lang: 'en', theme: 'light' }, { lang: 'en', theme: 'dark' }, { lang: 'el', theme: 'light' }, { lang: 'el', theme: 'dark' }]) {
  test(`axe: welcome screen and forms, ${m.lang} ${m.theme}`, async ({ page }, info) => {
    test.skip(info.project.name === 'phone' && (m.lang !== 'en' || m.theme !== 'light'), 'desktop covers the rest');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { errors } = await open(page, '#/', { ...m, local: { 'meletee1:local:a:courses': [{ id: 'c1', name: 'Biology', examDate: null, sources: [], topics: [], createdAt: '2026-10-01' }] } });
    await expect(page.locator('.welcome h1')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/welcome\.[a-z]/);
    const scan = async (what) => {
      await page.waitForTimeout(150);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${what} [${v.id}] ${v.help} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    };
    const bad = [...await scan('start')];
    await page.locator('.welcome-doors .btn').first().click();
    await expect(page.locator('#welcome-name')).toBeVisible();
    bad.push(...await scan('sign up'));
    await page.locator('.welcome-links .btn').last().click();
    await expect(page.locator('#welcome-name')).toHaveCount(0);
    await page.locator('form.welcome-form button[type=submit]').click();
    await expect(page.locator('.welcome-msg')).not.toBeEmpty();           // "type your e-mail first"
    await expect(page.locator('#welcome-email')).toBeFocused();
    await page.locator('#welcome-email').fill('ada@example.com');
    await page.locator('#welcome-password').fill('wrong-horse');
    await page.locator('form.welcome-form button[type=submit]').click();
    await expect(page.locator('.welcome-msg')).not.toBeEmpty();
    bad.push(...await scan('sign in, wrong password'));
    expect(bad).toEqual([]);
    await noScroll(page);
    expect(errors).toEqual([]);
  });
}

for (const lang of ['el', 'ru', 'fr']) {
  test(`welcome screen is translated (${lang})`, async ({ page }) => {
    const { errors } = await open(page, '#/', { lang });
    await expect(page.locator('.welcome h1')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/(welcome|cloud)\.[a-z]/);
    await expect(page.locator('main')).not.toContainText('Welcome to Meletee');
    await page.locator('.welcome-doors .btn').nth(1).click();
    await expect(page.locator('main')).not.toContainText(/(welcome|cloud)\.[a-z]/);
    await noScroll(page);
    expect(errors).toEqual([]);
  });
}

test('the language can be changed on the welcome screen', async ({ page }) => {
  const { errors } = await open(page, '#/');
  await page.getByLabel('Language').selectOption('fr');
  await expect(page.getByRole('heading', { name: 'Bienvenue dans Meletee' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect(errors).toEqual([]);
});
