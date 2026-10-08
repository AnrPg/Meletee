import { test, expect } from '@playwright/test';

async function open(page, hash = '', lang = 'en') {
  await page.addInitScript((l) => { if (!localStorage.getItem('meletee1:local:a:settings')) localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l })); }, lang);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return errors;
}

const stored = (page, ws, key) => page.evaluate(([w, k]) => JSON.parse(localStorage.getItem(`meletee1:local:a:ws:${w}:${k}`)), [ws, key]);
const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test('practice: log sets, weak topics first, error log with causes', async ({ page }) => {
  const errors = await open(page, '#/ws/practice');
  const logSet = async (topic, tried, right) => {
    await page.getByRole('button', { name: 'Log a practice set' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Topic').fill(topic);
    await d.getByLabel('Questions tried').fill(String(tried));
    await d.getByLabel('Got right').fill(String(right));
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(d).toHaveCount(0);
  };
  await logSet('Optics', 10, 9);
  await logSet('Thermodynamics', 10, 4);
  await logSet('Optics', 10, 7);
  const topics = page.locator('.ws-practice-topic');
  await expect(topics).toHaveCount(2);
  await expect(topics.first()).toContainText('Thermodynamics');
  await expect(topics.first()).toContainText('40%');
  await expect(topics.nth(1)).toContainText('80%');
  await expect(topics.nth(1)).toContainText('2 sets');

  await page.getByRole('button', { name: /Error log/ }).click();
  await page.getByRole('button', { name: 'Log a mistake' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('The question').fill('What is the efficiency of a Carnot engine?');
  await d.getByLabel('My answer').fill('Th/Tc');
  await d.getByLabel('Correct answer').fill('1 − Tc/Th');
  await d.getByLabel('Topic').fill('Thermodynamics');
  await d.getByText('Misread').click();
  await d.getByLabel(/Lesson/).fill('Read the whole formula slowly');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ws-practice-error')).toContainText('Read the whole formula slowly');
  await expect(page.locator('.ws-practice-cause')).toContainText('Misread');
  await noOverflow(page);

  const errs = await stored(page, 'practice', 'errors');
  expect(errs[0]).toMatchObject({ topic: 'Thermodynamics', myAnswer: 'Th/Tc', correct: '1 − Tc/Th', cause: 'misread', lesson: 'Read the whole formula slowly' });
  expect(errs[0].id).toBeTruthy();
  expect(errs[0].date).toMatch(/^\d{4}-\d\d-\d\d$/);

  await page.reload();
  await expect(page.locator('.ws-practice-error')).toHaveCount(1);
  await page.getByRole('button', { name: /Sets/ }).click();
  await expect(page.locator('.ws-practice-topic').first()).toContainText('Thermodynamics');
  expect(errors).toEqual([]);
});

test('why: chain answers, mark a gap, look it up later', async ({ page }) => {
  const errors = await open(page, '#/ws/why');
  await page.getByLabel('A fact or claim').fill('Arteries have thicker walls than veins.');
  await page.getByRole('button', { name: 'Ask why' }).click();
  await expect(page.getByText('Level 1 of 5')).toBeVisible();
  await page.getByLabel('Why is this true?').fill('Blood in arteries is under higher pressure.');
  await page.getByRole('button', { name: 'Answer', exact: true }).click();
  await expect(page.getByText('Level 2 of 5')).toBeVisible();
  await page.getByLabel('And why is that?').fill('The heart pumps straight into them.');
  await page.getByRole('button', { name: 'Answer', exact: true }).click();
  await page.getByRole('button', { name: /couldn’t answer/ }).click();
  await expect(page.getByText('2 levels deep')).toBeVisible();

  await page.reload();
  await expect(page.getByText('2 levels deep')).toBeVisible();
  await page.getByRole('button', { name: /All chains/ }).click();
  await expect(page.getByRole('heading', { name: /To look up/ })).toBeVisible();
  await page.getByRole('button', { name: 'Found it' }).click();
  await page.locator('#ask-input').fill('Ventricles contract with great force.');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ws-why-found')).toContainText('Ventricles');
  const chains = await stored(page, 'why', 'chains');
  expect(chains[0].levels).toHaveLength(3);
  expect(chains[0].levels[2]).toMatchObject({ gap: true, found: 'Ventricles contract with great force.' });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('examples: varied examples, what they share, story link', async ({ page }) => {
  const errors = await open(page, '#/ws/examples');
  await page.getByLabel('An abstract idea').fill('Opportunity cost');
  await page.getByRole('button', { name: 'Collect examples' }).click();
  await expect(page.getByText('Aim for at least two, of different kinds.')).toBeVisible();
  await page.getByLabel('Example', { exact: true }).fill('Studying instead of going to a party');
  await page.getByRole('button', { name: 'Add example' }).click();
  await page.getByText('From the course').click();
  await page.getByLabel('Example', { exact: true }).fill('A farmer growing wheat instead of corn');
  await page.getByRole('button', { name: 'Add example' }).click();
  await expect(page.getByText(/Nice variety/)).toBeVisible();
  await page.getByLabel('What do they have in common?').fill('Choosing one thing gives up the next best');
  await page.getByText('Link a story or case').click();
  await page.getByLabel('Story or case').fill('Maria and the job offer');
  await page.reload();
  await expect(page.locator('.ws-examples-list li')).toHaveCount(2);
  await expect(page.getByLabel('What do they have in common?')).toHaveValue('Choosing one thing gives up the next best');
  const ideas = await stored(page, 'examples', 'ideas');
  expect(ideas[0].examples.map((e) => e.kind)).toEqual(['everyday', 'course']);
  expect(ideas[0].story).toBe('Maria and the job offer');
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('notes: cornell with cover mode, concept map, table, objectives', async ({ page }) => {
  const errors = await open(page, '#/ws/notes');
  // Cornell
  await page.getByLabel('Title').fill('Lecture 4');
  await page.getByRole('button', { name: 'New Cornell note' }).click();
  await page.getByLabel('Notes 1').fill('The loop of Henle builds a salt gradient');
  await page.getByLabel('Cue 1').fill('What builds the gradient?');
  await page.getByLabel('Summary').fill('Kidneys concentrate urine.');
  await page.getByRole('button', { name: /Cover notes/ }).click();
  await expect(page.getByLabel('Notes 1')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tap to reveal' }).first().click();
  await expect(page.getByLabel('Notes 1')).toHaveValue('The loop of Henle builds a salt gradient');
  await page.reload();
  await expect(page.getByLabel('Cue 1')).toHaveValue('What builds the gradient?');
  await page.getByRole('button', { name: /All notes/ }).click();

  // Concept map
  await page.getByRole('button', { name: /Concept map/ }).click();
  await page.getByRole('button', { name: 'New concept map' }).click();
  for (const n of ['Insulin', 'Glucose uptake', 'Blood sugar']) {
    await page.getByLabel('An idea').fill(n);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await page.getByLabel('From').selectOption({ label: 'Insulin' });
  await page.getByLabel('Link label').fill('raises');
  await page.getByLabel('To', { exact: true }).selectOption({ label: 'Glucose uptake' });
  await page.getByRole('button', { name: /Link$/ }).click();
  await page.getByLabel('From').selectOption({ label: 'Glucose uptake' });
  await page.getByLabel('Link label').fill('lowers');
  await page.getByLabel('To', { exact: true }).selectOption({ label: 'Blood sugar' });
  await page.getByRole('button', { name: /Link$/ }).click();
  const map = page.locator('.ws-notes-map li');
  await expect(map).toHaveCount(3);
  await expect(map.nth(2)).toContainText('lowers → Blood sugar');
  await page.getByRole('button', { name: /All notes/ }).click();

  // Comparison table
  await page.getByRole('button', { name: /Comparison/ }).click();
  await page.getByRole('button', { name: 'New comparison table' }).click();
  await page.getByLabel('Item 1', { exact: true }).fill('Iron deficiency');
  await page.getByLabel('Item 2', { exact: true }).fill('B12 deficiency');
  await page.getByRole('button', { name: /Column/ }).click();
  await page.getByLabel('Item 3', { exact: true }).fill('Folate deficiency');
  await page.getByLabel('Feature 1', { exact: true }).fill('Cell size');
  await page.getByLabel('Cell size × B12 deficiency').fill('Large');
  await noOverflow(page);
  await page.getByRole('button', { name: /All notes/ }).click();

  // Objectives
  await page.getByRole('button', { name: /Objectives/ }).click();
  await page.getByRole('button', { name: 'New objectives checklist' }).click();
  await page.getByLabel('Objectives').fill('1. Explain diffusion\n- Compare osmosis and diffusion\n\nDefine tonicity');
  await page.getByRole('button', { name: 'Make my checklist' }).click();
  await expect(page.locator('.ws-notes-objs li')).toHaveCount(3);
  await page.getByText('Explain diffusion').click();
  await expect(page.getByText('1 of 3 ready')).toBeVisible();

  await page.reload();
  await expect(page.getByText('1 of 3 ready')).toBeVisible();
  const notes = await stored(page, 'notes', 'notes');
  expect(notes.map((n) => n.type).sort()).toEqual(['cornell', 'map', 'objectives', 'table']);
  const table = notes.find((n) => n.type === 'table');
  expect(table.body.cols).toEqual(['Iron deficiency', 'B12 deficiency', 'Folate deficiency']);
  expect(table.body.rows[0]).toEqual({ label: 'Cell size', cells: ['', 'Large', ''] });
  expect(errors).toEqual([]);
});

test('memory: mnemonic, palace walk-through quiz, chunker', async ({ page }) => {
  const errors = await open(page, '#/ws/memory');
  await page.getByLabel('Items, one per line').fill('Mercury\nVenus\nEarth\nMars');
  await expect(page.locator('.ws-memory-letters').first()).toHaveText('MVEM');
  await page.getByLabel('Your memorable sentence').fill('My Very Eager Mouse');
  await page.getByRole('button', { name: 'Save mnemonic' }).click();
  await expect(page.getByText('My Very Eager Mouse')).toBeVisible();

  await page.getByRole('button', { name: /Palace/ }).click();
  await page.getByLabel('A place you know well').fill('My flat');
  await page.getByRole('button', { name: 'Build a palace' }).click();
  const stops = [['Front door', 'Mitochondria', 'A glowing battery'], ['Sofa', 'Ribosome', 'Tiny factory'], ['Window', 'Nucleus', 'A brain in a jar']];
  for (const [p, i, img] of stops) {
    await page.getByLabel('Spot on the route').fill(p);
    await page.getByLabel('Item to remember').fill(i);
    await page.getByLabel('Vivid image').fill(img);
    await page.getByRole('button', { name: 'Add stop' }).click();
  }
  await expect(page.locator('.ws-memory-locus')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('.ws-memory-locus')).toHaveCount(3);
  await page.getByRole('button', { name: /Walk through/ }).click();
  await expect(page.getByText('Stop 1 of 3')).toBeVisible();
  await expect(page.locator('.ws-memory-walk')).not.toContainText('Mitochondria');
  for (const ok of [true, false, true]) {
    await page.getByRole('button', { name: 'Reveal' }).click();
    await page.getByRole('button', { name: ok ? /Got it/ : 'Missed it' }).click();
  }
  await expect(page.getByRole('heading', { name: '2 of 3 remembered' })).toBeVisible();
  await expect(page.getByText(/Sofa/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to the palace' }).click();

  await page.getByRole('button', { name: /Chunks/ }).click();
  await page.getByLabel('List or number').fill('020 7946 0123');
  await expect(page.locator('.ws-memory-chunk')).toHaveCount(3);
  await expect(page.locator('.ws-memory-chunk-items')).toHaveText(['0207', '9460', '123']);
  await page.getByLabel('Label for group 1').fill('London');
  await page.getByRole('button', { name: 'Save groups' }).click();
  const chunks = await stored(page, 'memory', 'chunks');
  expect(chunks[0].groups[0]).toEqual({ items: ['0', '2', '0', '7'], label: 'London' });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

for (const [lang, word] of [['el', 'Καταγραφή'], ['ru', 'Записать'], ['fr', 'Noter']]) {
  test(`renders in ${lang}`, async ({ page }) => {
    const errors = await open(page, '#/ws/practice', lang);
    await expect(page.locator('.ws-practice .btn').first()).toContainText(word);
    for (const id of ['why', 'examples', 'notes', 'memory']) {
      await page.goto(`/#/ws/${id}`);
      await expect(page.locator(`.ws-${id}`)).toBeVisible();
      expect(await page.locator(`.ws-${id}`).innerText()).not.toMatch(/ws\.\w+\./);
      await noOverflow(page);
    }
    expect(errors).toEqual([]);
  });
}
