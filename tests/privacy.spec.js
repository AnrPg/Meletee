// #/privacy: linked from Settings, translated, and its two ways out: delete Meletee's data from this
// browser, and (signed in, with the fake Supabase) delete Meletee's rows in the cloud too.
import { test, expect } from '@playwright/test';

const FAKE = new URL('./fixtures/fake-supabase.js', import.meta.url).pathname;
const UID = '11111111-2222-3333-4444-555555555555';

test('privacy page: linked from Settings, explains, and deletes this device’s data', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: 'en' }));
    localStorage.setItem('meletee1:local:a:courses', JSON.stringify([{ id: 'c1', name: 'Biology', examDate: null, sources: [], topics: [], createdAt: '2026-10-01' }]));
    localStorage.setItem('meletee-device:anthropicKey:local', 'sk-ant-test-key-123456');
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/settings');
  await page.getByRole('link', { name: /Privacy/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your privacy');
  for (const h of ['On this device', 'When you sign in', 'AI keys', 'What buddies see', 'noema-lite']) await expect(page.getByRole('heading', { name: h })).toBeVisible();
  await expect(page.getByText('meletee_kv', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete here and in the cloud' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete from this device' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete everything here?');
  await dialog.getByRole('button', { name: 'Delete from this device' }).click();
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => [localStorage.getItem('meletee1:local:a:courses'), localStorage.getItem('meletee-device:anthropicKey:local')])).toEqual([null, null]);
  expect(errors).toEqual([]);
});

test('signed in: “delete here and in the cloud” removes only Meletee’s own rows', async ({ page }) => {
  await page.addInitScript(({ uid }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const other = '99999999-0000-0000-0000-000000000000';
    localStorage.setItem('meletee1:cloud:session', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9e9, user: { id: uid, email: 'ada@example.com' } }));
    localStorage.setItem('meletee1:current', 'u_' + uid);
    localStorage.setItem(`meletee1:u_${uid}:a:settings`, JSON.stringify({ lang: 'en' }));
    localStorage.setItem('__fakeSupabase', JSON.stringify({ seq: 10, log: [], storage: {}, tables: {
      meletee_kv: [{ user_id: uid, key: 'a:courses', value: '[]', updated_at: '2026-10-01T00:00:00Z' }, { user_id: other, key: 'a:courses', value: '[]', updated_at: '2026-10-01T00:00:00Z' }],
      meletee_snapshots: [{ id: 1, user_id: uid, kind: 'auto', data: {} }],
      meletee_buddy_profiles: [{ user_id: uid, display_name: 'Ada' }, { user_id: other, display_name: 'Bo' }],
      noema_kv: [{ user_id: uid, key: 'a:progress', value: '{}' }],
    } }));
  }, { uid: UID });
  await page.addInitScript({ path: FAKE });
  await page.route('**/*.supabase.co/**', (r) => r.abort());
  await page.goto('/#/privacy');
  await page.getByRole('button', { name: 'Delete here and in the cloud' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete here and in the cloud' }).click();
  await expect(page.getByRole('button', { name: 'What now?' })).toBeVisible();
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakeSupabase')).tables);
  expect(db.meletee_kv.map((r) => r.user_id)).toEqual(['99999999-0000-0000-0000-000000000000']);
  expect(db.meletee_snapshots).toEqual([]);
  expect(db.meletee_buddy_profiles.map((r) => r.display_name)).toEqual(['Bo']);
  expect(db.noema_kv).toHaveLength(1);     // noema-lite's own data is not Meletee's to delete
  expect(await page.evaluate(() => localStorage.getItem('meletee1:cloud:session'))).toBe(null);
});
