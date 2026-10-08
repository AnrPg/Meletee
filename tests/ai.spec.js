// AI tutors (phase 4). Both vendors are stubbed with page.route(): no real network, no real keys.
import { test, expect } from '@playwright/test';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const GRADE = { score: 72, verdict: 'Mostly there', covered: ['makes ATP'], missing: ['happens in mitochondria'], mistakes: [], feedback: 'Good start. Where does it happen?' };
const QUESTIONS = { questions: [{ q: 'What does chlorophyll absorb?', a: 'Light' }, { q: 'What gas is released?', a: 'Oxygen' }] };

function claudeSSE(text, stop = 'end_turn') {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const parts = text ? text.match(/.{1,12}/gs) : [];
  return ev('message_start', { message: { model: 'claude-opus-5-5', usage: { input_tokens: 20, output_tokens: 1 } } })
    + ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    + parts.map((p) => ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: p } })).join('')
    + ev('content_block_stop', { index: 0 })
    + ev('message_delta', { delta: { stop_reason: stop, ...(stop === 'refusal' ? { stop_details: { type: 'refusal', category: null } } : {}) }, usage: { output_tokens: 9 } })
    + ev('message_stop', {});
}

// Stubs both vendors; returns the logged requests.
async function stubVendors(page) {
  const log = { claude: [], gemini: [] };
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/v1/models')) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5-5' }] }) });
    const body = req.postDataJSON();
    log.claude.push({ headers: req.headers(), body });
    const last = body.messages[body.messages.length - 1].content;
    let text = 'Nice start! What does **light** do for the plant?';
    let stop = 'end_turn';
    if (body.output_config?.format) text = JSON.stringify(/questions/.test(JSON.stringify(body.output_config.format)) ? QUESTIONS : GRADE);
    else if (/REFUSE/.test(last)) { text = ''; stop = 'refusal'; }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: claudeSSE(text, stop) });
  });
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] }) });
    const body = req.postDataJSON();
    log.gemini.push({ url: req.url(), headers: req.headers(), body });
    const prompt = body.contents.map((c) => c.parts.map((p) => p.text).join('')).join('\n');
    const json = body.generationConfig.responseMimeType === 'application/json';
    const text = json ? JSON.stringify(/"questions"/.test(prompt) ? QUESTIONS : GRADE) : 'Think about where the energy comes from.';
    const one = { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } };
    if (req.url().includes('streamGenerateContent')) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify(one)}\r\n\r\n` });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(one) });
  });
  return log;
}

async function open(page, hash = '', { lang = 'en', claude = '', gemini = '', cards = null } = {}) {
  await page.addInitScript(({ l, c, g, deck }) => {
    if (!localStorage.getItem('meletee1:local:a:settings')) localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l }));
    if (c && !localStorage.getItem('meletee-device:anthropicKey:local')) localStorage.setItem('meletee-device:anthropicKey:local', c);
    if (g && !localStorage.getItem('meletee-device:geminiKey:local')) localStorage.setItem('meletee-device:geminiKey:local', g);
    if (deck && !localStorage.getItem('meletee1:local:a:ws:deck:cards')) localStorage.setItem('meletee1:local:a:ws:deck:cards', JSON.stringify(deck));
  }, { l: lang, c: claude, g: gemini, deck: cards });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return errors;
}

const CARD = { id: 'k_1', q: 'What does glycolysis make?', a: 'Pyruvate and 2 ATP, in the cytoplasm', topic: null, created: '2026-10-01', box: 1, due: '2026-10-01', seen: 0, right: 0, wrong: 0 };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('keys are saved on this device only, tested, never in the backup, and can be forgotten', async ({ page }) => {
  await stubVendors(page);
  const errors = await open(page, '#/settings');
  await expect(page.getByRole('heading', { name: /AI tutors/ })).toBeVisible();
  await page.locator('details.ai-provider', { hasText: 'Claude' }).locator('summary').click();
  await page.locator('#ai-key-claude').fill('sk-ant-test-1234567890abcdef');
  await expect(page.locator('#ai-key-claude')).toHaveAttribute('type', 'password');
  await page.locator('details.ai-provider', { hasText: 'Claude' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this device ✓')).toBeVisible();
  await page.getByRole('button', { name: 'Test key' }).first().click();
  await expect(page.getByText('It works ✓')).toBeVisible();
  await expect(page.locator('#ai-model-claude option')).toContainText(['claude-opus-5-5', 'claude-sonnet-5-5']);
  await page.locator('#ai-model-claude').selectOption('claude-sonnet-5-5');
  const state = await page.evaluate(async () => {
    const store = await import('/src/core/store.js');
    return { key: localStorage.getItem('meletee-device:anthropicKey:local'), backup: JSON.stringify(store.exportBackup()), synced: Object.keys(localStorage).filter((k) => k.startsWith('meletee1:') && localStorage.getItem(k).includes('sk-ant')) };
  });
  expect(state.key).toBe('sk-ant-test-1234567890abcdef');
  expect(state.backup).not.toContain('sk-ant');
  expect(state.backup).toContain('claude-sonnet-5-5'); // the model choice is an ordinary setting
  expect(state.synced).toEqual([]);
  await page.getByRole('button', { name: 'Forget key' }).click();
  expect(await page.evaluate(() => localStorage.getItem('meletee-device:anthropicKey:local'))).toBeNull();
  // "remember" off keeps it for this tab only
  const gemini = page.locator('details.ai-provider', { hasText: 'Gemini' });
  if (!await gemini.evaluate((el) => el.open)) await gemini.locator('summary').click();
  await expect(page.locator('#ai-remember-gemini')).toBeVisible();
  await page.locator('#ai-remember-gemini').uncheck();
  await page.locator('#ai-key-gemini').fill('AIzaTestKeyTestKeyTestKey123');
  await gemini.getByRole('button', { name: 'Save' }).click();
  const g = await page.evaluate(() => ({ local: localStorage.getItem('meletee-device:geminiKey:local'), session: sessionStorage.getItem('meletee-device:geminiKey:local') }));
  expect(g).toEqual({ local: null, session: 'AIzaTestKeyTestKeyTestKey123' });
  expect(await noHScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('no AI UI anywhere without a key', async ({ page }) => {
  const errors = await open(page, '#/ws/recall', { cards: [CARD] });
  await page.getByRole('button', { name: 'Start a round' }).click();
  await page.locator('#flip-typed').fill('ATP');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.locator('.ws-flip-a')).toBeVisible();
  await expect(page.locator('.ai-btn')).toHaveCount(0);
  for (const ws of ['feynman', 'practice', 'notes', 'why', 'pretest']) {
    await page.goto('/#/ws/' + ws);
    await expect(page.locator('.ws-body')).not.toBeEmpty();
    await expect(page.locator('.ai-btn')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('answer checker: Gemini grades a typed answer; hints come first', async ({ page }) => {
  const log = await stubVendors(page);
  const errors = await open(page, '#/ws/recall', { gemini: 'AIzaTestKeyTestKeyTestKey123', claude: 'sk-ant-test-1234567890abcdef', cards: [CARD] });
  await page.getByRole('button', { name: 'Start a round' }).click();
  await page.getByRole('button', { name: 'A hint, please' }).click();
  await expect(page.locator('.ai-hint')).toContainText('Think about where the energy comes from.');
  await expect(page.locator('.ai-hint .ai-badge')).toHaveText(/Gemini/);
  await page.locator('#flip-typed').fill('It makes ATP');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  const card = page.locator('.ai-grade');
  await expect(card).toBeVisible();
  await expect(card.locator('.ai-score')).toContainText('72');
  await expect(card).toContainText('Mostly there');
  await expect(card).toContainText('happens in mitochondria');
  await expect(card.locator('.ai-badge')).toHaveText(/Gemini/);
  expect(log.claude).toHaveLength(0);
  const req = log.gemini.find((r) => r.body.generationConfig.responseMimeType === 'application/json');
  expect(req.headers['x-goog-api-key']).toBe('AIzaTestKeyTestKeyTestKey123');
  expect(req.url).toContain('/models/gemini-flash-latest:generateContent');
  const recs = await page.evaluate(async () => (await import('/src/ai/convos.js')).list());
  const graded = recs.find((r) => r.kind === 'grading');
  expect(graded.mode).toBeNull();
  expect(graded.model).toEqual({ provider: 'google', name: 'gemini-flash-latest' });
  expect(graded.meta).toEqual({ app: 'meletee', task: 'grade' });
  expect(graded.messages[1].content).toContain('72/100');
  expect(recs.find((r) => r.mode === 'hint').kind).toBe('tutor');
  // the hint request never contains the answer
  expect(JSON.stringify(log.gemini[0].body)).not.toContain('Pyruvate');
  expect(await noHScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('router falls back to Claude when only a Claude key exists (structured JSON output)', async ({ page }) => {
  const log = await stubVendors(page);
  await open(page, '#/ws/recall', { claude: 'sk-ant-test-1234567890abcdef', cards: [CARD] });
  await page.getByRole('button', { name: 'Start a round' }).click();
  await page.locator('#flip-typed').fill('It makes ATP');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.locator('.ai-grade .ai-badge')).toHaveText(/Claude/);
  await expect(page.locator('.ai-grade .ai-score')).toContainText('72');
  expect(log.gemini).toHaveLength(0);
  const { headers, body } = log.claude[0];
  expect(headers['x-api-key']).toBe('sk-ant-test-1234567890abcdef');
  expect(headers['anthropic-version']).toBe('2023-06-01');
  expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
  expect(body.fallbacks).toBe('default');
  expect(body.model).toBe('claude-opus-5-5');
  expect(body.stream).toBe(true);
  expect(body.output_config.effort).toBe('medium');
  expect(body.output_config.format.type).toBe('json_schema');
  expect(body.output_config.format.schema.additionalProperties).toBe(false);
  for (const k of ['temperature', 'top_p', 'thinking', 'tool_choice', 'tools']) expect(body).not.toHaveProperty(k);
  expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
  expect(body.messages[body.messages.length - 1].role).toBe('user');
});

test('tutor sheet streams Claude in a workspace, handles a refusal and saves the conversation', async ({ page }) => {
  const log = await stubVendors(page);
  const errors = await open(page, '#/ws/feynman', { claude: 'sk-ant-test-1234567890abcdef', gemini: 'AIzaTestKeyTestKeyTestKey123' });
  await page.locator('#feynman-title').fill('Photosynthesis');
  await page.getByRole('button', { name: 'Start explaining' }).click();
  await page.locator('#feynman-text').fill('Plants eat sunlight and make sugar.');
  await page.getByRole('button', { name: /Let a tutor play the 12-year-old/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('.ai-msg.ai').first()).toContainText('What does light do for the plant?');
  await expect(sheet.locator('.ai-msg.ai strong').first()).toHaveText('light');
  await expect(sheet.locator('.ai-head .ai-badge')).toHaveText(/Claude/);
  expect(log.claude[0].body.output_config).toEqual({ effort: 'low' });
  expect(JSON.stringify(log.claude[0].body.system)).toContain('Plants eat sunlight');
  expect(JSON.stringify(log.claude[0].body.system)).toContain('Feynman coach');
  await sheet.locator('#ai-input').fill('It makes food. REFUSE');
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(sheet.locator('.ai-msg.note')).toContainText('rather not');
  await sheet.locator('#ai-input').fill('It turns light into sugar.');
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(sheet.locator('.ai-msg.ai:not(.note)')).toHaveCount(2);
  // the refused turn is not sent again: history alternates user/assistant
  const roles = log.claude[2].body.messages.map((m) => m.role);
  expect(roles).toEqual(['user', 'assistant', 'user']);
  const recs = await page.evaluate(async () => (await import('/src/ai/convos.js')).list());
  expect(recs).toHaveLength(1);
  const r = recs[0];
  expect(r.schema).toBe('noema.conversation/v1');
  expect(r.id).toMatch(/^cv_/);
  expect(r.kind).toBe('tutor');
  expect(r.mode).toBe('feynman');
  expect(r.model).toEqual({ provider: 'anthropic', name: 'claude-opus-5-5' });
  expect(r.context).toEqual({ type: 'workspace', id: 'feynman', label: '🧒 Photosynthesis' });
  expect(r.meta).toEqual({ app: 'meletee', task: 'feynman' });
  expect(r.account).toEqual({ id: 'local', kind: 'local' });
  expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  expect(r.messages[0].meta).toEqual({ kickoff: true });
  expect(r.stats.messages).toBe(4);
  expect(await noHScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('question maker fills the deck and is saved as a question record', async ({ page }) => {
  await stubVendors(page);
  await open(page, '#/ws/recall', { gemini: 'AIzaTestKeyTestKeyTestKey123', cards: [CARD] });
  await page.getByRole('tab', { name: 'Cards' }).click();
  await page.getByRole('button', { name: 'Make questions' }).click();
  await page.locator('#ai-material').fill('Chlorophyll absorbs light. Oxygen is released.');
  await page.getByRole('dialog').getByRole('button', { name: /Make questions/ }).click();
  await expect(page.getByText('What does chlorophyll absorb?')).toBeVisible();
  await page.getByRole('button', { name: 'Add to my deck' }).click();
  await expect(page.locator('.ws-deck-item')).toHaveCount(3);
  const recs = await page.evaluate(async () => (await import('/src/ai/convos.js')).list());
  expect(recs[0].kind).toBe('question');
  expect(recs[0].mode).toBeNull();
  expect(recs[0].model.provider).toBe('google');
  expect(recs[0].context.id).toBe('recall');
});

test('Greek: settings and tutor buttons are translated', async ({ page }) => {
  await stubVendors(page);
  const errors = await open(page, '#/settings', { lang: 'el', gemini: 'AIzaTestKeyTestKeyTestKey123', cards: [CARD] });
  await expect(page.getByRole('heading', { name: /Βοηθοί AI/ })).toBeVisible();
  await expect(page.getByText(/Τα κλειδιά μένουν σε αυτή τη συσκευή/)).toBeVisible();
  await page.goto('/#/ws/recall');
  await page.locator('.ws-recall button.btn').first().click();
  await expect(page.getByRole('button', { name: 'Μια υπόδειξη, παρακαλώ' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('notes: Socratic tutor offers noema-lite and a lightning quiz', async ({ page }) => {
  await stubVendors(page);
  const errors = await open(page, '#/ws/notes', { claude: 'sk-ant-test-1234567890abcdef', gemini: 'AIzaTestKeyTestKeyTestKey123' });
  await page.getByLabel('Title').fill('Lecture 4');
  await page.getByRole('button', { name: 'New Cornell note' }).click();
  await page.getByLabel('Notes 1').fill('Chlorophyll absorbs light');
  await expect(page.locator('.ai-btn')).toHaveCount(1);
  await page.getByRole('button', { name: 'Talk it through' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('.ai-msg.ai').first()).toContainText('What does light do');
  await expect(sheet.getByRole('link', { name: /Continue in noema-lite/ })).toHaveAttribute('href', 'https://noema-lite.netlify.app/');
  await sheet.getByRole('button', { name: /Lightning quiz/ }).click();
  await expect(sheet.locator('.ai-quiz li')).toHaveCount(2);
  await sheet.locator('.ai-quiz summary').first().click();
  await expect(sheet.getByText('Light', { exact: true })).toBeVisible();
  expect(await noHScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});
