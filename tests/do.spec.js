import { test, expect } from '@playwright/test';

async function open(page, hash = '', lang = 'en') {
  await page.addInitScript((l) => { if (!localStorage.getItem('melete1:local:a:settings')) localStorage.setItem('melete1:local:a:settings', JSON.stringify({ lang: l })); }, lang);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return errors;
}

test('focus timer runs, asks for recall, then starts the break', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T09:00:00') });
  const errors = await open(page, '#/do/focus');
  await page.getByRole('button', { name: '15 / 5' }).click();
  await page.getByRole('button', { name: 'Start focusing' }).click();
  await expect(page.locator('.ring-time')).toHaveText('15:00');
  await page.clock.runFor(60_000);
  await expect(page.locator('.ring-time')).toHaveText('14:00');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.runFor(120_000);
  await expect(page.locator('.ring-time')).toHaveText('14:00');
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.clock.runFor(14 * 60_000 + 500);
  await expect(page.getByRole('heading', { name: '15 minutes done!' })).toBeVisible();
  await page.locator('#recall-text').fill('Glycolysis makes 2 ATP');
  await page.getByRole('button', { name: 'Start 5-minute break' }).click();
  await expect(page.locator('.ring-label')).toHaveText('Break');
  const saved = await page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('melete1:local:a:sessions')), r: JSON.parse(localStorage.getItem('melete1:local:a:recalls')) }));
  expect(saved.s[0].minutes).toBe(15);
  expect(saved.r[0].text).toContain('Glycolysis');
  expect(errors).toEqual([]);
});

test('timer survives a reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T09:00:00') });
  await open(page, '#/do/focus');
  await page.getByRole('button', { name: 'Start focusing' }).click();
  await page.clock.runFor(5 * 60_000);
  await page.reload();
  await expect(page.locator('.ring-time')).toHaveText(/^(20:00|19:[0-5]\d)$/);
});

test('parking lot is reachable from any screen', async ({ page }) => {
  await open(page, '#/learn');
  await page.getByRole('button', { name: 'Parking lot' }).click();
  await page.locator('#park-input').fill('Email the tutor');
  await page.locator('#park-input').press('Enter');
  await expect(page.getByRole('dialog').getByText('Email the tutor')).toBeVisible();
});

test('course, topics, reviews and the term map work together', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T10:00:00') });
  const errors = await open(page, '#/do/courses');
  await page.getByRole('button', { name: 'Add a course' }).click();
  await page.locator('#ask-input').fill('Biochemistry');
  await page.locator('#ask-input').press('Enter');
  await expect(page.getByRole('heading', { name: 'Biochemistry' })).toBeVisible();

  await page.getByRole('button', { name: 'Set' }).click();
  await page.locator('#ask-input').fill('2026-11-05');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('#ask-input').fill('1. Glycolysis\n2. Krebs cycle\n- Electron transport chain');
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('.topics button .label')).toHaveText(['Glycolysis', 'Krebs cycle', 'Electron transport chain']);
  await expect(page.getByText('3 topics left: about 1 a week')).toBeVisible();

  await page.getByRole('button', { name: /Glycolysis/ }).click();
  await page.getByRole('button', { name: 'I studied this today' }).click();
  await expect(page.getByText(/Next review:/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  await page.goto('/#/do');
  await expect(page.getByText('Nothing due today')).toBeVisible();
  await page.clock.fastForward('24:00:00');
  await page.reload();
  await expect(page.getByText('1 topic due today')).toBeVisible();
  await page.getByRole('link', { name: /Reviews/ }).click();
  await page.getByRole('button', { name: 'Good' }).click();
  await expect(page.getByRole('heading', { name: 'All caught up' })).toBeVisible();

  await page.goto('/#/do/plan');
  await page.getByRole('tab', { name: 'Term' }).click();
  await expect(page.getByRole('link', { name: /Biochemistry/ })).toContainText('days left');
  expect(errors).toEqual([]);
});

test('week plan: add a study block', async ({ page }) => {
  await open(page, '#/do/plan');
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.getByRole('button', { name: 'Add a study block' }).first().click();
  await page.locator('#block-label').fill('Anatomy flashcards');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.block')).toContainText('Anatomy flashcards');
  await expect(page.getByText('0 h 50 min planned this week')).toBeVisible();
});

test('top 3 for today', async ({ page }) => {
  await open(page, '#/do');
  for (const x of ['Read chapter 4', 'Problem set', 'Call Sam']) {
    await page.locator('#top3-input').fill(x);
    await page.locator('#top3-input').press('Enter');
  }
  await expect(page.locator('#top3-input')).toHaveCount(0);
  await page.getByText('Problem set').click();
  await expect(page.locator('.check input').nth(1)).toBeChecked();
});
