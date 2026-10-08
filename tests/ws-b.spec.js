// Workspaces, group b: blank-page recall, Feynman, teaching, self-explanation, dual coding.
import { test, expect } from './fixtures/test.js';

async function open(page, hash = '', lang = 'en') {
  await page.addInitScript((l) => { if (!localStorage.getItem('meletee1:local:a:settings')) localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l })); }, lang);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/' + hash);
  return errors;
}

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('blank page: timer, brain dump, check against notes, growth after reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T09:00:00') });
  const errors = await open(page, '#/ws/blank');
  await page.locator('#blank-title').fill('Cell cycle');
  await page.getByRole('button', { name: '5 min' }).click();
  await page.getByRole('button', { name: 'Start with a blank page' }).click();
  await expect(page.locator('.ws-b-clock')).toHaveText('5:00');
  await page.locator('#blank-dump').fill('The cell grows in G1.\nDNA is copied in S phase.');
  await page.clock.runFor(5 * 60_000 + 1000);
  await expect(page.getByText('Time! Finish your sentence')).toBeVisible();
  // the draft survives a reload mid-way
  await page.reload();
  await expect(page.locator('#blank-dump')).toHaveValue(/DNA is copied/);
  await page.getByRole('button', { name: /I'm done/ }).click();
  await page.locator('#blank-points').fill('G1: the cell grows\nS phase: DNA is copied\nCheckpoints stop damaged cells');
  await page.getByRole('button', { name: 'Check my page' }).click();
  await expect(page.getByText('You recalled 2 of 3 key points')).toBeVisible();
  await expect(page.locator('.ws-b-gaps li')).toHaveText(['Checkpoints stop damaged cells']);
  expect(await noHScroll(page)).toBe(true);
  await page.getByRole('button', { name: 'Done' }).click();

  // a second, better page on the same topic shows growth
  await page.clock.runFor(60 * 60_000);
  await page.locator('#blank-title').fill('Cell cycle');
  await page.getByRole('button', { name: 'Start with a blank page' }).click();
  await expect(page.locator('.ws-b-clock')).toHaveCount(0);
  await page.locator('#blank-dump').fill('Cell grows in G1, DNA copied in S phase, checkpoints stop damaged cells.');
  await page.getByRole('button', { name: /I'm done/ }).click();
  await page.locator('#blank-points').fill('G1: the cell grows\nS phase: DNA is copied\nCheckpoints stop damaged cells');
  await page.getByRole('button', { name: 'Check my page' }).click();
  await expect(page.getByText('Last time on this topic: 67% → now 100%')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await expect(page.locator('.ws-blank .ws-b-row')).toHaveCount(2);
  await expect(page.locator('.ws-blank .ws-b-row').first()).toContainText('3/3');
  expect(errors).toEqual([]);
});

test('feynman: live jargon and long-sentence flags, stuck list, versions persist', async ({ page }) => {
  const errors = await open(page, '#/ws/feynman');
  await page.locator('#feynman-title').fill('Falling balls');
  await page.getByRole('button', { name: 'Start explaining' }).click();
  await expect(page.getByText('Write as if they will ask')).toBeVisible();
  await page.locator('#feynman-text').fill('Gravity pulls things down. It is simple.');
  await expect(page.getByText('Nice and plain so far.')).toBeVisible();
  await page.locator('#feynman-text').fill('The gravitational acceleration is the mechanism. ' + 'and then it goes on '.repeat(6) + 'forever.');
  const flags = page.locator('.ws-feynman-word');
  await expect(flags).toHaveText([/gravitational/, /acceleration/, /mechanism/]);
  await expect(page.getByText('Long sentences: could each be two?')).toBeVisible();
  // "that word is fine"
  await flags.filter({ hasText: 'acceleration' }).click();
  await expect(flags).toHaveCount(2);
  // own jargon
  await page.getByText('Mark my own jargon').click();
  await page.locator('#feynman-mark').fill('gravity');
  await page.getByRole('button', { name: 'Mark', exact: true }).click();
  await page.locator('#feynman-text').fill('Gravity pulls. The mechanism hides.');
  await expect(flags).toHaveText([/Gravity/, /mechanism/]);
  await expect(flags.first()).toHaveAttribute('data-why', 'marked');
  // where did I get stuck?
  await page.getByText('Where did I get stuck?').click();
  await page.locator('#feynman-stuck').fill('Why the pull and the push cancel');
  await page.locator('#feynman-stuck').press('Enter');
  await expect(page.locator('.ws-feynman-stuck li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save this version' }).click();
  await page.reload();
  await expect(page.locator('#feynman-text')).toHaveValue('Gravity pulls. The mechanism hides.');
  await expect(page.locator('.ws-feynman-stuck')).toContainText('Why the pull and the push cancel');
  await page.getByText('Versions').click();
  await page.getByRole('button', { name: /Version 1/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Gravity pulls.');
  await page.getByRole('button', { name: 'Close' }).click();
  expect(await noHScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('teach: plan, teach card by card with a timer, reflect', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T09:00:00') });
  const errors = await open(page, '#/ws/teach');
  await page.getByRole('button', { name: 'Teach it' }).click();
  await expect(page.getByText('Add a title and at least one key point first')).toBeVisible();
  await page.locator('#teach-title').fill('Ser and estar');
  await page.locator('#teach-audience').fill('Ana');
  await page.locator('#teach-point-1').fill('Ser is for what something is');
  await page.locator('#teach-point-2').fill('Estar is for states and places');
  await page.locator('#teach-question').fill('Then why is it está muerto?');
  await page.reload(); // the plan autosaves
  await expect(page.locator('#teach-point-2')).toHaveValue('Estar is for states and places');
  await page.getByRole('button', { name: 'Teach it' }).click();
  await expect(page.getByText('Card 1 of 4')).toBeVisible();
  await expect(page.locator('.ws-teach-text')).toHaveText('Ser and estar');
  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.locator('.ws-teach-text')).toHaveText('Ser is for what something is');
  await page.clock.runFor(65_000);
  await expect(page.locator('.ws-b-clock')).toHaveText('1:05');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.locator('.ws-teach-card')).toHaveAttribute('data-kind', 'question');
  expect(await noHScroll(page)).toBe(true);
  await page.getByRole('button', { name: /Finish/ }).click();
  await expect(page.getByText(/You taught for 1:0\d\./)).toBeVisible();
  await page.locator('#teach-hard').fill('Why death uses estar');
  await page.getByRole('button', { name: 'Save reflection' }).click();
  await page.reload();
  await page.getByText('Past reflections').click();
  await expect(page.locator('.ws-teach-runs')).toContainText('Why death uses estar');
  expect(errors).toEqual([]);
});

test('self-explanation: steps, marks, summary and persistence', async ({ page }) => {
  const errors = await open(page, '#/ws/selfexp');
  await page.locator('#selfexp-source').fill('x² + 6x + 5 = 0\nx² + 6x + 9 = 4\n(x + 3)² = 4');
  await page.locator('#selfexp-title').fill('Completing the square');
  await page.getByRole('button', { name: 'Break into steps' }).click();
  const steps = page.locator('.ws-selfexp-step');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toHaveAttribute('data-state', 'empty');
  await page.locator('#selfexp-why-1').fill('The equation we start from');
  await expect(steps.nth(0)).toHaveAttribute('data-state', 'explained');
  await steps.nth(1).getByRole('button', { name: /Can.t explain yet/ }).click();
  await expect(steps.nth(1)).toHaveAttribute('data-state', 'stuck');
  await expect(page.getByText('1 of 3 explained')).toBeVisible();
  await page.reload();
  await expect(page.locator('#selfexp-why-1')).toHaveValue('The equation we start from');
  await page.getByRole('button', { name: 'See summary' }).click();
  await expect(page.locator('.ws-selfexp-counts strong')).toHaveText(['1', '1', '1']);
  await expect(page.locator('.ws-selfexp-open li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.ws-selfexp .ws-b-row')).toContainText('1/3');
  expect(await noHScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

async function scribble(page, canvas, offset = 0) {
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 20 + offset, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width - 30, box.y + 40 + offset, { steps: 8 });
  await page.mouse.up();
}

const inked = (canvas) => canvas.evaluate((c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
});

test('dual coding: sketch, undo, save, redraw from memory, compare side by side', async ({ page }) => {
  const errors = await open(page, '#/ws/dual');
  const pad = page.locator('canvas.ws-dual-live');
  await expect(pad).toBeVisible();
  await page.getByRole('button', { name: 'Save sketch' }).click();
  await expect(page.getByText('Give your sketch a title first.')).toBeVisible();
  await page.locator('#dual-title').fill('Login flow');
  await page.locator('#dual-words').fill('password → check hash → session');
  await scribble(page, pad);
  expect(await inked(pad)).toBeGreaterThan(50);
  await scribble(page, pad, 30);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Eraser' }).click();
  await expect(page.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pen' }).click();
  // the drawing survives a reload before saving
  await page.reload();
  await expect(page.locator('#dual-title')).toHaveValue('Login flow');
  await expect.poll(() => inked(pad)).toBeGreaterThan(50);
  await page.getByRole('button', { name: 'Save sketch' }).click();
  await expect(page.getByRole('heading', { name: 'Login flow' })).toBeVisible();
  await page.getByRole('button', { name: /Redraw from memory/ }).click();
  await expect(page.locator('canvas.ws-dual-view')).toHaveCount(0); // the original is hidden
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByText('Draw something on the pad first')).toBeVisible();
  await scribble(page, page.locator('canvas.ws-dual-live'), 10);
  await page.getByRole('button', { name: 'Compare' }).click();
  const figs = page.locator('.ws-dual-fig canvas');
  await expect(figs).toHaveCount(2);
  await expect.poll(() => inked(figs.nth(1))).toBeGreaterThan(50);
  expect(await noHScroll(page)).toBe(true);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Redrawn from memory 1 time')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meletee1:local:a:ws:dual:sketches')));
  expect(saved[0].png).toMatch(/^data:image\/png;base64,/);
  expect(saved[0].attempts).toHaveLength(1);
  await page.getByRole('button', { name: /All sketches/ }).click();
  await expect(page.locator('.ws-dual-thumb')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('dual coding: the pad works with touch', async ({ page, browserName }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only on the phone project');
  await open(page, '#/ws/dual');
  const pad = page.locator('canvas.ws-dual-live');
  await expect(pad).toBeVisible();
  const box = await pad.boundingBox();
  await pad.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + 30, clientY: box.y + 30 });
  for (let i = 1; i <= 10; i++) await pad.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: box.x + 30 + i * 15, clientY: box.y + 30 + i * 10 });
  await pad.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: box.x + 180, clientY: box.y + 130 });
  await expect.poll(() => inked(pad)).toBeGreaterThan(50);
  expect(await pad.evaluate((c) => getComputedStyle(c).touchAction)).toBe('none');
});

test('group b renders in Greek and in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors = await open(page, '#/ws/blank', 'el');
  await expect(page.getByRole('button', { name: 'Ξεκίνα σε λευκή σελίδα' })).toBeVisible();
  await page.goto('/#/ws/teach');
  await expect(page.getByRole('heading', { name: /Σχεδίασε ένα μικρό μάθημα/ })).toBeVisible();
  await page.goto('/#/ws/dual');
  await expect(page.getByRole('button', { name: 'Γόμα' })).toBeVisible();
  const ink = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
  expect(ink).toBe('#eef0f6');
  await page.goto('/#/ws');
  await expect(page.getByText('Εξήγησέ το σε ένα 12χρονο και δες πού κολλάς.')).toBeVisible();
  expect(errors).toEqual([]);
});
