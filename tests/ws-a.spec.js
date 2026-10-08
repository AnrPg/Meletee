// Group a workspaces: recall, srs, interleave, pretest, relearn.
import { test, expect } from './fixtures/test.js';

const DECK = 'meletee1:local:a:ws:deck:cards';
const COURSES = [{ id: 'c1', name: 'Bio', examDate: null, sources: [], createdAt: '2026-09-01', topics: [
  { id: 't1', title: 'Cells', stages: {}, reviewStep: 0, studiedAt: null },
  { id: 't2', title: 'Genes', stages: {}, reviewStep: 0, studiedAt: null },
] }];
const card = (id, q, a, topicId = null, extra = {}) => ({ id, q, a, topic: topicId ? { courseId: 'c1', topicId } : null, created: '2026-10-01', box: 1, due: '2026-10-08', seen: 0, right: 0, wrong: 0, ...extra });

async function open(page, hash = '', { lang = 'en', cards = null, courses = COURSES } = {}) {
  await page.clock.install({ time: new Date('2026-10-08T10:00:00') });
  await page.addInitScript(({ l, cards, courses }) => {
    if (localStorage.getItem('meletee1:local:a:settings')) return;
    localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l }));
    localStorage.setItem('meletee1:local:a:courses', JSON.stringify(courses));
    if (cards) localStorage.setItem('meletee1:local:a:ws:deck:cards', JSON.stringify(cards));
  }, { l: lang, cards, courses });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return errors;
}

const deck = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), DECK);
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('recall: add, paste, quiz with confidence, gentle summary, persists', async ({ page }) => {
  const errors = await open(page, '#/ws/recall');
  await expect(page.getByRole('heading', { name: 'No cards yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a card' }).click();
  await page.locator('#deck-q').fill('Powerhouse of the cell?');
  await page.locator('#deck-a').fill('Mitochondria');
  await page.locator('#recall-topic').selectOption({ label: 'Bio › Cells' });
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ws-deck-item')).toHaveCount(1);
  await expect(page.locator('.ws-deck-item .badge')).toHaveText('Bio › Cells');

  await page.getByRole('button', { name: 'Paste lines' }).click();
  await page.locator('#deck-import').fill('Capital of Peru? | Lima\nnot a card\nH2O? | Water');
  await page.getByRole('dialog').getByRole('button', { name: 'Add cards' }).click();
  await expect(page.locator('.ws-deck-item')).toHaveCount(3);
  await expect(page.getByText('3 cards', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('3 cards ready.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Cards' }).click();
  await expect(page.locator('.ws-deck-item')).toHaveCount(3);
  await page.getByRole('tab', { name: 'Practise' }).click();
  await page.getByRole('button', { name: 'Start a round' }).click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(`${i + 1} of 3`)).toBeVisible();
    await page.locator('#flip-typed').fill('my guess');
    await page.getByRole('button', { name: i === 0 ? 'Sure 💪' : 'Not sure 🤔' }).click();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByText('You said')).toBeVisible();
    await expect(page.locator('.ws-flip')).not.toContainText('null');
    await page.getByRole('button', { name: i === 2 ? 'Got it ✓' : 'Missed' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page.getByText('You recalled 1 of 3.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: '🎯 1 confident but wrong' })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.getByRole('button', { name: 'Try the misses again' }).click();
  await expect(page.getByText('1 of 2')).toBeVisible();
  const cards = await deck(page);
  expect(cards.map((c) => c.seen)).toEqual([1, 1, 1]);
  expect(cards.reduce((n, c) => n + c.wrong, 0)).toBe(2);
  expect(cards[0]).toMatchObject({ q: 'Powerhouse of the cell?', a: 'Mitochondria', topic: { courseId: 'c1', topicId: 't1' }, box: 1 });
  expect(errors).toEqual([]);
});

test('recall: edit and delete a card', async ({ page }) => {
  const errors = await open(page, '#/ws/recall', { cards: [card('k1', 'Old question', 'Answer')] });
  await page.getByRole('tab', { name: 'Cards' }).click();
  await page.getByRole('button', { name: 'Edit: Old question' }).click();
  await page.locator('#deck-q').fill('New question');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ws-deck-item .label')).toHaveText('New question');
  await page.getByRole('button', { name: 'Delete: New question' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'No cards yet' })).toBeVisible();
  expect(await deck(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('srs: due queue, Leitner moves, calm empty state after reload', async ({ page }) => {
  const errors = await open(page, '#/ws/srs', { cards: [
    card('k1', 'One?', '1', null, { box: 2 }), card('k2', 'Two?', '2', null, { box: 3 }), card('k3', 'Later?', '3', null, { due: '2026-10-10' }),
  ] });
  await expect(page.getByRole('heading', { name: '2 cards for today' })).toBeVisible();
  await expect(page.locator('.ws-srs-day')).toHaveCount(7);
  await expect(page.locator('.ws-srs-box-n')).toHaveText(['1', '1', '1', '0', '0', '0']);
  await page.getByRole('button', { name: 'Review now' }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Got it ✓' }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Missed' }).click();
  await expect(page.getByRole('heading', { name: 'All done for today' })).toBeVisible();
  const cards = await deck(page);
  expect(cards.find((c) => c.id === 'k1')).toMatchObject({ box: 3, due: '2026-10-12', right: 1 });
  expect(cards.find((c) => c.id === 'k2')).toMatchObject({ box: 1, due: '2026-10-09', wrong: 1 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nothing due today' })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('interleave: pick two topics, name the topic, then answer', async ({ page }) => {
  const errors = await open(page, '#/ws/interleave', { cards: [
    card('a1', 'Cell Q1', 'A1', 't1'), card('a2', 'Cell Q2', 'A2', 't1'),
    card('b1', 'Gene Q1', 'B1', 't2'), card('b2', 'Gene Q2', 'B2', 't2'),
  ] });
  await expect(page.getByRole('button', { name: 'Pick at least two' })).toBeDisabled();
  await page.getByRole('button', { name: /Bio › Cells/ }).click();
  await page.getByRole('button', { name: /Bio › Genes/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /Bio › Cells/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Mix 4 cards' }).click();
  let right = 0;
  for (let i = 0; i < 4; i++) {
    const q = await page.locator('.ws-flip-q').textContent();
    const topic = q.startsWith('Cell') ? 'Bio › Cells' : 'Bio › Genes';
    await expect(page.getByText('First: which topic is this?')).toBeVisible();
    const pick = i === 0 ? (topic === 'Bio › Cells' ? 'Bio › Genes' : 'Bio › Cells') : topic;
    if (pick === topic) right++;
    await page.locator('.ws-il-kind').getByRole('button', { name: pick }).click();
    await expect(page.locator('.ws-il-feedback')).toContainText(topic);
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Got it ✓' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Mixed set done' })).toBeVisible();
  await expect(page.getByText(`Topic named: ${right} of 4`)).toBeVisible();
  await expect(page.getByText('Answer recalled: 4 of 4')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pretest: guess, lock, reload, compare, surprises become cards', async ({ page }) => {
  const errors = await open(page, '#/ws/pretest');
  await page.getByRole('button', { name: 'New pretest' }).click();
  await page.locator('#pretest-topic').selectOption({ label: 'Bio › Genes' });
  await page.locator('#pretest-questions').fill('What is a codon?\nHow many chromosomes?');
  await page.getByRole('button', { name: 'Next: guess' }).click();
  await page.locator('#pretest-g-0').fill('A gene part');
  await page.locator('#pretest-g-1').fill('48');
  await page.getByRole('button', { name: 'Lock my guesses 🔒' }).click();
  await expect(page.getByRole('heading', { name: 'Guesses locked' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: /Bio › Genes/ }).click();
  await expect(page.getByRole('heading', { name: 'Guesses locked' })).toBeVisible();
  await page.getByRole('button', { name: 'I have studied: compare' }).click();
  await expect(page.locator('.ws-pt-guess').nth(1)).toContainText('48');
  await page.locator('#pretest-a-0').fill('Three bases');
  await page.locator('#pretest-a-1').fill('46');
  await page.getByText('😮 This surprised me').nth(1).click();
  await page.getByRole('button', { name: 'Save comparison' }).click();
  await expect(page.getByText('1 surprise. Those are the ones that stick.')).toBeVisible();
  await page.getByRole('button', { name: 'Add surprises to my cards' }).click();
  const cards = await deck(page);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ q: 'How many chromosomes?', a: '46', topic: { courseId: 'c1', topicId: 't2' } });
  await expect(page.getByRole('button', { name: 'Add surprises to my cards' })).toHaveCount(0);
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('relearn: a session runs to criterion and schedules the next one', async ({ page }) => {
  const errors = await open(page, '#/ws/relearn', { cards: [card('k1', 'Sin² + cos²?', '1'), card('k2', 'd/dx sin x?', 'cos x')] });
  await page.getByRole('button', { name: 'New set' }).click();
  await page.locator('#relearn-name').fill('Trig');
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Create set' }).click();
  await expect(page.getByRole('heading', { name: 'Trig' })).toBeVisible();
  await expect(page.getByText('2 cards · 0 sessions')).toBeVisible();
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByText('0 of 2 right so far')).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Not yet' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Got it ✓' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Every card recalled 🌿' })).toBeVisible();
  await expect(page.getByText('1 session so far. See you tomorrow.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('2 cards · 1 session')).toBeVisible();
  await expect(page.getByText('next tomorrow')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start early' })).toBeVisible();
  const sets = await page.evaluate(() => JSON.parse(localStorage.getItem('meletee1:local:a:ws:relearn:sets')));
  expect(sets[0]).toMatchObject({ name: 'Trig', sessions: ['2026-10-08'], next: '2026-10-09' });
  expect(errors).toEqual([]);
});

test('group a renders in Greek and Russian', async ({ page }) => {
  const errors = await open(page, '#/ws/srs', { lang: 'el', cards: [card('k1', 'Ερώτηση;', 'Απάντηση')] });
  await expect(page.getByRole('heading', { name: '1 κάρτα για σήμερα' })).toBeVisible();
  await page.getByRole('button', { name: 'Επανάληψη τώρα' }).click();
  await expect(page.getByRole('button', { name: 'Δείξε την απάντηση' })).toBeVisible();
  await page.goto('/#/ws/recall');
  await expect(page.getByRole('button', { name: 'Ξεκίνα έναν γύρο' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: 'ru' })));
  await page.goto('/#/ws/relearn');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Новый набор' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('workspace list shows hints for group a', async ({ page }) => {
  const errors = await open(page, '#/ws', { lang: 'fr' });
  for (const id of ['recall', 'srs', 'interleave', 'pretest', 'relearn']) await expect(page.locator(`a[href="#/ws/${id}"] p`)).not.toHaveText(`ws.${id}.hint`);
  await expect(page.getByText('Ferme le livre, réponds de mémoire, puis vérifie.')).toBeVisible();
  expect(errors).toEqual([]);
});
