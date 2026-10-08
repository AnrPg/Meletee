// Phase 7 in the browser: Buddies with the fake Supabase backend (tests/fixtures/fake-supabase.js)
// plus an in-page model of the buddy SQL functions (below), and a fake Realtime server through
// page.routeWebSocket. Nothing touches the network.
import { test, expect } from './fixtures/test.js';

const FAKE = new URL('./fixtures/fake-supabase.js', import.meta.url).pathname;
const ME = '11111111-2222-3333-4444-555555555555';
const BO = 'b0b0b0b0-0000-4000-8000-000000000002';
const CY = 'c1c1c1c1-0000-4000-8000-000000000003';

// The buddy SQL functions of cloud/supabase.sql (phase 7), modelled in JS over the fake's tables.
// Runs in the page before the app (addInitScript), so it must be self-contained.
function installBuddyModel() {
  const W = window;
  const T = (db, n) => (db.tables[n] ||= []);
  const pair = (a, b) => (a < b ? [a, b] : [b, a]);
  const link = (db, a, b) => { const [x, y] = pair(a, b); return T(db, 'meletee_buddy_links').find((l) => l.user_a === x && l.user_b === y); };
  const buddies = (db, a, b) => link(db, a, b)?.status === 'accepted';
  const prof = (db, id) => T(db, 'meletee_buddy_profiles').find((p) => p.user_id === id);
  const who = (db, id) => ({ name: prof(db, id)?.display_name || '…', emoji: prof(db, id)?.emoji || '🌱' });
  const masked = (share = {}, stats = {}) => Object.fromEntries(['streak', 'minutes', 'garden', 'focus'].filter((k) => share[k] === true && stats[k] != null).map((k) => [k, stats[k]]));
  const need = (me) => { if (!me) throw new Error('not signed in'); return me; };
  const roomOk = (db, me, id) => { const r = T(db, 'meletee_buddy_rooms').find((x) => x.id === id); return !!r && (r.owner === me || buddies(db, me, r.owner)); };
  const fresh = (m) => Date.now() - new Date(m.last_seen).getTime() < 90000;
  const blockedPair = (db, a, b) => link(db, a, b)?.status === 'blocked';
  const roomState = (db, id, me) => ({
    timer: T(db, 'meletee_buddy_rooms').find((x) => x.id === id).timer,
    members: T(db, 'meletee_buddy_room_members').filter((m) => m.room_id === id && fresh(m) && !blockedPair(db, me, m.user_id)).map((m) => ({ id: m.user_id, ...who(db, m.user_id), status: m.status })),
  });
  // 30 code attempts an hour (meletee_buddy_code_try)
  const codeTry = (db, me) => {
    const tries = (db.tables.meletee_buddy_code_tries ||= []).filter((x) => x.user_id === me && Date.now() - x.at < 3600e3);
    if (tries.length >= 30) return false;
    db.tables.meletee_buddy_code_tries.push({ user_id: me, at: Date.now() });
    return true;
  };
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  let seq = 0;
  const uuid = () => `9${String(Date.now()).slice(-7)}-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  W.__fakeRpc = {
    meletee_buddy_invite_create(db, a, me) {
      need(me);
      if (T(db, 'meletee_buddy_invites').filter((x) => x.user_id === me && !x.used_by).length >= 20) throw new Error('slow down: enough open invites');
      const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => A[b % 31]).join('');
      T(db, 'meletee_buddy_invites').push({ code, user_id: me, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 14 * 864e5).toISOString() });
      return code;
    },
    meletee_buddy_invite_preview(db, { p_code }, me) {
      need(me);
      if (!codeTry(db, me)) return { status: 'slow' };
      const i = T(db, 'meletee_buddy_invites').find((x) => x.code === String(p_code).toUpperCase());
      if (!i) return { status: 'invalid' };
      if (link(db, me, i.user_id)?.status === 'blocked') return { status: 'invalid' };
      if (i.user_id === me) return { status: 'self' };
      if (buddies(db, me, i.user_id)) return { status: 'already', ...who(db, i.user_id) };
      if (i.used_by) return { status: 'used' };
      T(db, 'meletee_buddy_invite_seen').push({ user_id: me, code: i.code });
      return { status: 'ok', ...who(db, i.user_id) };
    },
    meletee_buddy_accept_invite(db, { p_code }, me) {
      need(me);
      if (!prof(db, me)) throw new Error('make your buddy card first');
      if (!codeTry(db, me)) return { status: 'slow' };
      const i = T(db, 'meletee_buddy_invites').find((x) => x.code === String(p_code).toUpperCase());
      if (!i || i.user_id === me || i.used_by || link(db, me, i.user_id)?.status === 'blocked') return { status: 'invalid' };
      const [a, b] = pair(me, i.user_id);
      if (!link(db, me, i.user_id)) T(db, 'meletee_buddy_links').push({ user_a: a, user_b: b, status: 'accepted', blocked_by: null, created_at: new Date().toISOString() });
      Object.assign(i, { used_by: me, outcome: 'accepted' });
      return { status: 'ok', id: i.user_id };
    },
    meletee_buddy_decline_invite(db, { p_code }, me) {
      if (!codeTry(db, need(me))) throw new Error('slow down');
      const code = String(p_code).toUpperCase();
      const seen = T(db, 'meletee_buddy_invite_seen').some((s) => s.user_id === me && s.code === code);
      const i = T(db, 'meletee_buddy_invites').find((x) => x.code === code && x.user_id !== me && !x.used_by);
      if (i && seen) Object.assign(i, { used_by: me, outcome: 'declined' });
    },
    meletee_buddy_remove(db, { p_other }, me) {
      const [a, b] = pair(need(me), p_other);
      db.tables.meletee_buddy_links = T(db, 'meletee_buddy_links').filter((l) => !(l.user_a === a && l.user_b === b && l.status === 'accepted'));
    },
    meletee_buddy_block(db, { p_other }, me) {
      const [a, b] = pair(need(me), p_other);
      const l = link(db, me, p_other);
      if (l) { if (l.status !== 'blocked') Object.assign(l, { status: 'blocked', blocked_by: me }); } else T(db, 'meletee_buddy_links').push({ user_a: a, user_b: b, status: 'blocked', blocked_by: me });
    },
    meletee_buddy_unblock(db, { p_other }, me) {
      const [a, b] = pair(need(me), p_other);
      db.tables.meletee_buddy_links = T(db, 'meletee_buddy_links').filter((l) => !(l.user_a === a && l.user_b === b && l.status === 'blocked' && l.blocked_by === me));
    },
    meletee_buddy_cheer(db, { p_to, p_kind, p_message }, me) {
      if (!buddies(db, need(me), p_to)) throw new Error('not your buddy');
      const recent = T(db, 'meletee_buddy_cheers').filter((c) => c.from_user === me && c.to_user === p_to && Date.now() - new Date(c.created_at) < 3600e3);
      if (recent.length >= 6) throw new Error('slow down');
      T(db, 'meletee_buddy_cheers').push({ id: db.seq++, from_user: me, to_user: p_to, kind: p_kind, message: p_message, created_at: new Date().toISOString(), seen_at: null });
    },
    meletee_buddy_cheers_seen(db, a, me) { for (const c of T(db, 'meletee_buddy_cheers')) if (c.to_user === need(me) && !c.seen_at) c.seen_at = new Date().toISOString(); },
    meletee_buddy_room_open(db, a, me) {
      need(me);
      let r = T(db, 'meletee_buddy_rooms').find((x) => x.owner === me);
      if (!r) { r = { id: uuid(), owner: me, timer: {} }; T(db, 'meletee_buddy_rooms').push(r); }
      return r.id;
    },
    meletee_buddy_room_state(db, { p_room }, me) { if (!roomOk(db, need(me), p_room)) throw new Error('room not available'); return roomState(db, p_room, me); },
    meletee_buddy_room_join(db, { p_room, p_status = 'here' }, me) {
      if (!roomOk(db, need(me), p_room)) throw new Error('room not available');
      const ms = T(db, 'meletee_buddy_room_members');
      const m = ms.find((x) => x.room_id === p_room && x.user_id === me);
      if (m) Object.assign(m, { status: p_status, last_seen: new Date().toISOString() });
      else ms.push({ room_id: p_room, user_id: me, status: p_status, last_seen: new Date().toISOString() });
      return roomState(db, p_room, me);
    },
    meletee_buddy_room_leave(db, { p_room }, me) { db.tables.meletee_buddy_room_members = T(db, 'meletee_buddy_room_members').filter((m) => !(m.room_id === p_room && m.user_id === need(me))); },
    meletee_buddy_room_timer(db, { p_room, p_timer }, me) {
      if (!roomOk(db, need(me), p_room)) throw new Error('room not available');
      const r = T(db, 'meletee_buddy_rooms').find((x) => x.id === p_room);
      // the checks of the SQL function: v not in the future, 1-120 whole minutes, 0-60 rest, started about now
      const now = Date.now(), tm = p_timer || {}, num = (x) => typeof x === 'number' && Number.isFinite(x);
      if (!['focus', 'idle'].includes(tm.phase) || !num(tm.v) || tm.v < 0 || tm.v > now + 60000) throw new Error('bad timer');
      let clean = { phase: 'idle', v: tm.v, by: me };
      if (tm.phase === 'focus') {
        const rest = tm.rest ?? 0;
        if (!Number.isInteger(tm.minutes) || tm.minutes < 1 || tm.minutes > 120 || !num(rest) || rest < 0 || rest > 60 || !num(tm.startedAt) || Math.abs(tm.startedAt - now) > 120000) throw new Error('bad timer');
        clean = { phase: 'focus', minutes: tm.minutes, rest, startedAt: tm.startedAt, endsAt: tm.startedAt + tm.minutes * 60000, v: tm.v, by: me };
      }
      const cur = r.timer?.v;
      if (!num(cur) || cur <= tm.v || cur > now + 60000) r.timer = clean;
    },
    meletee_buddy_goal_create(db, { p_kind, p_metric, p_target, p_week }, me) {
      need(me);
      if (p_kind === 'challenge' && !prof(db, me)?.compete) throw new Error('challenges are opt-in');
      const id = uuid();
      T(db, 'meletee_buddy_goals').push({ id, owner: me, kind: p_kind, metric: p_metric, target: p_kind === 'challenge' ? null : p_target, week: p_week, created_at: new Date().toISOString() });
      T(db, 'meletee_buddy_goal_members').push({ goal_id: id, user_id: me, joined_at: new Date().toISOString() });
      return id;
    },
    meletee_buddy_goal_join(db, { p_goal }, me) {
      const g = T(db, 'meletee_buddy_goals').find((x) => x.id === p_goal);
      if (!g || !(g.owner === need(me) || buddies(db, me, g.owner))) throw new Error('goal not available');
      if (g.kind === 'challenge' && !prof(db, me)?.compete) throw new Error('challenges are opt-in');
      const ms = T(db, 'meletee_buddy_goal_members');
      if (!ms.some((m) => m.goal_id === p_goal && m.user_id === me)) ms.push({ goal_id: p_goal, user_id: me, joined_at: new Date().toISOString() });
    },
    meletee_buddy_goal_leave(db, { p_goal }, me) {
      db.tables.meletee_buddy_goal_members = T(db, 'meletee_buddy_goal_members').filter((m) => !(m.goal_id === p_goal && m.user_id === need(me)));
      if (!db.tables.meletee_buddy_goal_members.some((m) => m.goal_id === p_goal)) db.tables.meletee_buddy_goals = T(db, 'meletee_buddy_goals').filter((g) => !(g.id === p_goal && g.owner === me));
    },
    meletee_buddy_overview(db, { p_week }, me) {
      need(me);
      const compete = !!prof(db, me)?.compete;
      const links = T(db, 'meletee_buddy_links').filter((l) => l.user_a === me || l.user_b === me);
      const other = (l) => (l.user_a === me ? l.user_b : l.user_a);
      const contrib = (id, week, metric) => (T(db, 'meletee_buddy_contributions').find((c) => c.user_id === id && c.week === week) || {})[metric] || 0;
      return {
        compete,
        buddies: links.filter((l) => l.status === 'accepted').map((l) => ({ id: other(l), since: l.created_at, ...who(db, other(l)), shared: masked(prof(db, other(l))?.share, prof(db, other(l))?.stats) })),
        blocked: links.filter((l) => l.status === 'blocked' && l.blocked_by === me).map((l) => ({ id: other(l), ...who(db, other(l)) })),
        cheers: T(db, 'meletee_buddy_cheers').filter((c) => c.to_user === me && buddies(db, me, c.from_user)).reverse().slice(0, 20)
          .map((c) => ({ id: c.id, from: c.from_user, ...who(db, c.from_user), kind: c.kind, message: c.message, at: c.created_at, seen: !!c.seen_at })),
        goals: T(db, 'meletee_buddy_goals').filter((g) => [p_week, addDays(p_week, -7)].includes(g.week)
          && (g.owner === me || buddies(db, me, g.owner) || T(db, 'meletee_buddy_goal_members').some((m) => m.goal_id === g.id && m.user_id === me))
          && (g.kind !== 'challenge' || compete))
          .map((g) => {
            const joined = T(db, 'meletee_buddy_goal_members').some((m) => m.goal_id === g.id && m.user_id === me);
            // numbers only for members of the goal (challenges: an opt-in board by design); before joining, only my buddies are listed
            return { ...g, joined,
              members: T(db, 'meletee_buddy_goal_members').filter((m) => m.goal_id === g.id && (joined || m.user_id === me || buddies(db, me, m.user_id)) && !blockedPair(db, me, m.user_id))
                .map((m) => ({ id: m.user_id, ...who(db, m.user_id), value: joined || g.kind === 'challenge' ? contrib(m.user_id, g.week, g.metric) : null })) };
          }),
        rooms: T(db, 'meletee_buddy_rooms').filter((r) => r.owner === me || buddies(db, me, r.owner))
          .map((r) => ({ id: r.id, owner: r.owner, ...who(db, r.owner), timer: r.timer, members: roomState(db, r.id, me).members })),
      };
    },
  };
  // act as another person (a buddy) against the same fake database
  W.__fakeRpcAs = (user, fn, args = {}) => { const db = W.__fakeDb(); const out = W.__fakeRpc[fn](db, args, user); W.__fakeSave(db); return out; };
}

// Monday of this week, local time (like the app).
const monday = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function open(page, hash, { lang = 'en', signedIn = true, seed = null, ws = 'none' } = {}) {
  await page.addInitScript(({ l, signedIn, me, seed }) => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ lang: l }));
    if (signedIn) {
      localStorage.setItem('meletee1:cloud:session', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9e9, user: { id: me, email: 'ada@example.com' } }));
      localStorage.setItem('meletee1:current', 'u_' + me);
      localStorage.setItem(`meletee1:u_${me}:a:settings`, JSON.stringify({ lang: l }));
    }
    if (seed) localStorage.setItem('__fakeSupabase', JSON.stringify({ tables: {}, storage: {}, seq: 100, log: [], ...seed }));
  }, { l: lang, signedIn, me: ME, seed });
  await page.addInitScript({ path: FAKE });
  await page.addInitScript(installBuddyModel);
  const real = [];
  await page.route('**/*.supabase.co/**', (r) => { real.push(r.request().url()); return r.abort(); });
  // the focus room's websocket: refused unless a test provides a fake Realtime server
  if (ws === 'none') await page.routeWebSocket(/\/realtime\/v1\/websocket/, (s) => s.close());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.BUD_DEBUG) page.on('console', (m) => console.log('[page]', m.type(), m.text()));
  await page.goto('/' + hash);
  return { errors, real };
}

const noScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const db = (page) => page.evaluate(() => window.__fakeDb());
const as = (page, user, fn, args) => page.evaluate(([u, f, a]) => window.__fakeRpcAs(u, f, a), [user, fn, args]);

const profile = (id, name, emoji, extra = {}) => ({ user_id: id, display_name: name, emoji, share: { streak: true }, compete: false, stats: {}, ...extra });
const friends = (a, b) => { const [x, y] = a < b ? [a, b] : [b, a]; return { user_a: x, user_b: y, status: 'accepted', blocked_by: null, created_at: '2026-09-01T10:00:00Z' }; };

test('signed out: one friendly screen with a way to sign in, the rest of the app keeps working', async ({ page }) => {
  const { errors, real } = await open(page, '#/buddies', { signedIn: false });
  await expect(page.getByRole('heading', { level: 1, name: 'Buddies' })).toBeVisible();
  await expect(page.getByText('Study side by side, cheer each other on and reach goals together.')).toBeVisible();
  const signIn = page.getByRole('link', { name: 'Sign in to find buddies' });
  await expect(signIn).toHaveAttribute('href', '#/settings');
  await signIn.click();
  await expect(page.getByRole('heading', { name: /Cloud sync/ })).toBeVisible();
  // deep links still land on the same friendly screen
  await page.goto('/#/buddies/room');
  await expect(page.getByRole('link', { name: 'Sign in to find buddies' })).toBeVisible();
  await page.goto('/#/do');
  await expect(page.locator('main h1, main h2').first()).toBeVisible();
  await noScroll(page);
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('invite → accept → cheer → shared goal → challenge', async ({ page }) => {
  const week = monday();
  const { errors, real } = await open(page, '#/buddies', {
    seed: { tables: {
      meletee_buddy_profiles: [profile(BO, 'Bo', '🐼', { share: { streak: true, minutes: true, garden: false, focus: false }, stats: { streak: { weeks: 3, days: 4 }, minutes: 95, garden: 7 }, compete: true })],
      meletee_buddy_invites: [{ code: 'BQBQ2345', user_id: BO, created_at: new Date().toISOString() }],
      meletee_buddy_contributions: [{ user_id: BO, week, minutes: 95, sessions: 4, reviews: 12 }],
    } },
  });
  // 1) the buddy card: default shares little (only the streak)
  await expect(page.getByRole('heading', { name: 'Make your buddy card' })).toBeVisible();
  await expect(page.getByLabel('My forgiving streak')).toBeChecked();
  await expect(page.getByLabel('Minutes this week')).not.toBeChecked();
  await expect(page.getByLabel('When I’m focusing')).not.toBeChecked();
  await page.getByLabel('Display name').fill('Ada');
  await page.getByRole('radio', { name: '🦉' }).click();
  await page.getByLabel('Minutes this week').check();
  await page.getByRole('button', { name: 'Save my card' }).click();
  await expect(page.getByRole('heading', { name: 'No buddies yet' })).toBeVisible();
  let d = await db(page);
  const mine = d.tables.meletee_buddy_profiles.find((p) => p.user_id === ME);
  expect(mine).toMatchObject({ display_name: 'Ada', emoji: '🦉', share: { streak: true, minutes: true, garden: false, focus: false } });
  expect(Object.keys(mine.stats).sort()).toEqual(['minutes', 'streak']); // nothing unshared leaves the device

  // 2) my own invite link
  await page.getByRole('link', { name: /Invite a buddy/ }).click();
  await page.getByRole('button', { name: /Create an invite link/ }).click();
  const code = (await page.locator('.bud-code').textContent()).trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/); // made by the server (meletee_buddy_invite_create)
  await expect(page.getByLabel('Invite link')).toHaveValue(new RegExp(`#/buddies/join/${code}$`));
  d = await db(page);
  expect(d.tables.meletee_buddy_invites.some((i) => i.code === code && i.user_id === ME)).toBe(true);

  // 3) Bo's code, typed with spaces and lower case → accept
  await page.getByLabel('Invite code').fill('bqbq 2345');
  await page.getByRole('button', { name: 'Open invite' }).click();
  await expect(page.getByRole('heading', { name: 'Bo invited you' })).toBeVisible();
  await page.getByRole('button', { name: /Accept/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bo' })).toBeVisible();
  await expect(page.locator('.bud-glance')).toContainText('3 week streak');
  await expect(page.locator('.bud-glance')).toContainText('95 min this week');
  await expect(page.locator('.bud-glance')).not.toContainText('Garden'); // Bo doesn't share it

  // 4) a cheer: preset messages only
  await page.getByRole('button', { name: /Send a cheer/ }).click();
  await expect(page.locator('.sheet textarea, .sheet input[type=text]')).toHaveCount(0);
  await page.getByRole('button', { name: /You’ve got this!/ }).click();
  await expect(page.locator('.toast')).toContainText('Sent to Bo');
  d = await db(page);
  expect(d.tables.meletee_buddy_cheers.at(-1)).toMatchObject({ from_user: ME, to_user: BO, kind: 'cheer', message: 'youGotThis' });

  // Bo cheers back; it shows on the home screen, translated
  await as(page, BO, 'meletee_buddy_cheer', { p_to: ME, p_kind: 'nudge', p_message: 'oneSession' });
  await page.goto('/#/buddies');
  await expect(page.locator('.bud-inbox')).toContainText('Just one Pomodoro today?');
  await expect(page.locator('.bud-row')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Study together/ })).toBeVisible();

  // 5) a shared goal: each of us does 5 sessions
  await page.evaluate(([acc, d]) => localStorage.setItem(`meletee1:${acc}:a:sessions`, JSON.stringify([{ date: d, minutes: 25 }, { date: d, minutes: 25 }])), ['u_' + ME, today()]);
  await page.getByRole('link', { name: /Goals together/ }).click();
  await page.getByRole('button', { name: /New goal/ }).click();
  await expect(page.getByLabel('How many each?')).toHaveValue('5');
  await page.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByRole('heading', { name: /Each of us: 5 sessions/ })).toBeVisible();
  const goal = (await db(page)).tables.meletee_buddy_goals[0];
  expect(goal).toMatchObject({ kind: 'shared', metric: 'sessions', target: 5, week });
  await as(page, BO, 'meletee_buddy_goal_join', { p_goal: goal.id });
  // team goal (co-competition): all together 20 sessions
  await page.getByRole('button', { name: /New goal/ }).click();
  await page.getByRole('button', { name: /All together/ }).click();
  await expect(page.getByLabel('Group target')).toHaveValue('20');
  await page.getByRole('button', { name: 'Create goal' }).click();
  const team = (await db(page)).tables.meletee_buddy_goals.find((g) => g.kind === 'team');
  await as(page, BO, 'meletee_buddy_goal_join', { p_goal: team.id });
  await page.reload();
  const shared = page.locator('.bud-goal[data-kind=shared]');
  await expect(shared.locator('.bud-member')).toHaveCount(2);
  await expect(shared).toContainText('2 / 5');  // my sessions, published from this device
  await expect(shared).toContainText('4 / 5');
  const teamCard = page.locator('.bud-goal[data-kind=team]');
  await expect(teamCard).toContainText('6 of 20 together');
  await expect(teamCard).toContainText('14 to go');
  await expect(teamCard).toContainText('67% of the team’s total');
  d = await db(page);
  expect(d.tables.meletee_buddy_contributions.find((c) => c.user_id === ME)).toMatchObject({ week, sessions: 2, minutes: 50 });

  // 6) challenges are opt-in, with a kind board
  await page.goto('/#/buddies/challenges');
  await expect(page.getByText('No last places', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Join friendly challenges/ }).click();
  await page.getByRole('button', { name: /New challenge/ }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Reviews' }).click();
  await page.getByRole('button', { name: 'Start challenge' }).click();
  const ch = (await db(page)).tables.meletee_buddy_goals.find((g) => g.kind === 'challenge');
  expect(ch).toMatchObject({ metric: 'reviews', target: null });
  await as(page, BO, 'meletee_buddy_goal_join', { p_goal: ch.id });
  await page.reload();
  const board = page.locator('.bud-challenge');
  await expect(board).toContainText('Most reviews this week');
  await expect(board.locator('li[data-top=true]')).toContainText('Bo');
  await expect(board.locator('li').filter({ hasText: 'Ada' })).toContainText('warming up');
  await expect(board).not.toContainText(/last/i);
  await noScroll(page);
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('invites: own, used and unknown codes; remove and block', async ({ page }) => {
  const { errors } = await open(page, '#/buddies/join/ZZZZ2345', {
    seed: { tables: {
      meletee_buddy_profiles: [profile(ME, 'Ada', '🦉'), profile(BO, 'Bo', '🐼'), profile(CY, 'Cy', '🐢')],
      meletee_buddy_links: [friends(ME, BO), friends(ME, CY)],
      meletee_buddy_invites: [{ code: 'MYMY2345', user_id: ME }, { code: 'USED2345', user_id: CY, used_by: BO }],
    } },
  });
  await expect(page.getByRole('heading', { name: 'This invite doesn’t work' })).toBeVisible();
  await page.goto('/#/buddies/join/MYMY2345');
  await expect(page.getByRole('heading', { name: /your own invite/ })).toBeVisible();
  await page.goto('/#/buddies/join/USED2345');
  await expect(page.getByRole('heading', { name: 'You and Cy are already buddies' })).toBeVisible();
  // remove Cy
  await page.goto('/#/buddies/b/' + CY);
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Remove buddy' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Remove buddy' }).click();
  await expect(page.locator('.bud-row')).toHaveCount(1);
  // block Bo: gone from the list, listed on my card, can be unblocked
  await page.goto('/#/buddies/b/' + BO);
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Block' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Block' }).click();
  await expect(page.getByRole('heading', { name: 'No buddies yet' })).toBeVisible();
  const d = await db(page);
  expect(d.tables.meletee_buddy_links.find((l) => l.status === 'blocked')).toMatchObject({ blocked_by: ME });
  // Bo can no longer cheer me
  expect(await page.evaluate(([bo, me]) => { try { window.__fakeRpcAs(bo, 'meletee_buddy_cheer', { p_to: me, p_kind: 'cheer', p_message: 'proud' }); return 'sent'; } catch (e) { return e.message; } }, [BO, ME])).toBe('not your buddy');
  await page.goto('/#/buddies/me');
  await expect(page.getByRole('heading', { name: /Blocked/ })).toBeVisible();
  await page.getByRole('button', { name: 'Unblock' }).click();
  await expect(page.locator('.toast')).toContainText('Unblocked');
  expect(errors).toEqual([]);
});

// A fake Supabase Realtime server: answers the join, sends presence with Bo, records what the app sends.
async function fakeRealtime(page, sent) {
  let server;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    server = ws;
    ws.onMessage((raw) => {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m.event === 'phx_join') {
        ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
        ws.send(JSON.stringify({ topic: m.topic, event: 'presence_state', payload: { [BO]: { metas: [{ phx_ref: 'b1', name: 'Bo', emoji: '🐼', status: 'here' }] } } }));
      }
      if (m.event === 'presence' && m.payload?.event === 'track') {
        ws.send(JSON.stringify({ topic: m.topic, event: 'presence_diff', payload: { joins: { [ME]: { metas: [{ phx_ref: 'a' + sent.length, ...m.payload.payload }] } }, leaves: {} } }));
      }
    });
  });
  return { send: (msg) => server.send(JSON.stringify(msg)) };
}

test('focus room: live presence and a synced Pomodoro over the Realtime socket', async ({ page }) => {
  const sent = [];
  const rt = await fakeRealtime(page, sent);
  const MY_ROOM = 'aaaaaaaa-0000-4000-8000-0000000000aa';
  const { errors, real } = await open(page, '#/buddies/room', {
    ws: 'fake',
    seed: { tables: {
      meletee_buddy_profiles: [profile(ME, 'Ada', '🦉'), profile(BO, 'Bo', '🐼')],
      meletee_buddy_links: [friends(ME, BO)],
      // Bo is already in my room (the database lists him; live presence alone is not enough to be shown)
      meletee_buddy_rooms: [{ id: MY_ROOM, owner: ME, timer: {} }],
      meletee_buddy_room_members: [{ room_id: MY_ROOM, user_id: BO, status: 'here', last_seen: new Date(Date.now() + 60000).toISOString() }],
    } },
  });
  await page.getByRole('button', { name: /Open my room/ }).click();
  await expect(page.locator('.bud-mode')).toHaveText('🟢 Live');
  const join = sent.find((m) => m.event === 'phx_join');
  const roomId = (await db(page)).tables.meletee_buddy_rooms[0].id;
  expect(join.topic).toBe('realtime:meletee-room:' + roomId);
  expect(join.payload.config).toMatchObject({ private: true, presence: { key: ME } });
  expect(join.payload.access_token).toBe('x');
  const people = page.locator('.bud-person');
  await expect(people).toHaveCount(2);
  await expect(people.filter({ hasText: 'Bo' })).toContainText('here');
  await expect(people.filter({ hasText: 'Ada (you)' })).toBeVisible();
  expect(sent.some((m) => m.event === 'presence' && m.payload.payload.name === 'Ada')).toBe(true);

  // I start: the timer is broadcast and stored
  await page.getByRole('button', { name: /Start together/ }).click();
  await expect(page.locator('.ring-label')).toHaveText('Focusing together');
  await expect(page.locator('.ring-time')).toHaveText(/^2[45]:\d\d$/);
  const b = sent.find((m) => m.event === 'broadcast');
  expect(b.payload).toMatchObject({ type: 'broadcast', event: 'timer', payload: { phase: 'focus', minutes: 25, rest: 5 } });
  await expect.poll(async () => (await db(page)).tables.meletee_buddy_rooms[0].timer.phase).toBe('focus');

  // Bo stops it for everyone from their device
  const topic = 'realtime:meletee-room:' + roomId;
  rt.send({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'timer', payload: { phase: 'idle', by: BO, v: Date.now() + 1000 } } });
  await expect(page.locator('.ring-label')).toHaveText('Ready together');
  // Bo starts a 50-minute block
  rt.send({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'timer', payload: { phase: 'focus', minutes: 50, rest: 10, startedAt: Date.now(), endsAt: Date.now() + 50 * 60000, by: BO, v: Date.now() + 2000 } } });
  await expect(page.locator('.ring-time')).toHaveText(/^(50:00|49:5\d)$/);
  // a hostile timer (a week of minutes, a far-future v) is ignored
  rt.send({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'timer', payload: { phase: 'focus', minutes: 100000, rest: 0, startedAt: Date.now(), endsAt: Date.now() + 1000, by: BO, v: 1e300 } } });
  await page.waitForTimeout(300);
  await expect(page.locator('.ring-time')).toHaveText(/^(50:00|49:[45]\d)$/);
  // Bo leaves (his app leaves the room, then the socket says so)
  await as(page, BO, 'meletee_buddy_room_leave', { p_room: MY_ROOM });
  rt.send({ topic, event: 'presence_diff', payload: { joins: {}, leaves: { [BO]: { metas: [{ phx_ref: 'b1' }] } } } });
  await expect(people).toHaveCount(1);
  await noScroll(page);
  expect(real).toEqual([]);
  expect(errors).toEqual([]);
});

test('focus room: falls back to polling when the socket fails', async ({ page }) => {
  const { errors } = await open(page, '#/buddies', {
    seed: { tables: {
      meletee_buddy_profiles: [profile(ME, 'Ada', '🦉'), profile(BO, 'Bo', '🐼')],
      meletee_buddy_links: [friends(ME, BO)],
      meletee_buddy_rooms: [{ id: 'aaaaaaaa-0000-4000-8000-0000000000bb', owner: BO, timer: {} }],
    } },
  });
  await as(page, BO, 'meletee_buddy_room_join', { p_room: 'aaaaaaaa-0000-4000-8000-0000000000bb', p_status: 'focus' });
  await page.goto('/#/buddies');
  await expect(page.getByText('1 buddy is in a focus room now')).toBeVisible();
  await page.getByRole('link', { name: /Study together/ }).click();
  await page.getByRole('link', { name: /Bo’s room/ }).click();
  await expect(page.locator('.bud-mode')).toHaveText('Updates every few seconds');
  await expect(page.locator('.bud-person').filter({ hasText: 'Bo' })).toContainText('focusing');
  // Bo starts the timer from their device: it arrives with the next poll
  await as(page, BO, 'meletee_buddy_room_timer', { p_room: 'aaaaaaaa-0000-4000-8000-0000000000bb', p_timer: { phase: 'focus', minutes: 25, rest: 5, startedAt: Date.now(), endsAt: Date.now() + 25 * 60000, v: Date.now() } });
  await expect(page.locator('.ring-label')).toHaveText('Focusing together', { timeout: 8000 });
  const d = await db(page);
  expect(d.tables.meletee_buddy_room_members.find((m) => m.user_id === ME)).toBeTruthy();
  // leaving the room removes me
  await page.getByRole('link', { name: /Study together/ }).click();
  await expect.poll(async () => (await db(page)).tables.meletee_buddy_room_members.some((m) => m.user_id === ME)).toBe(false);
  expect(errors).toEqual([]);
});

test('Greek render at phone width, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const { errors } = await open(page, '#/buddies', {
    lang: 'el',
    seed: { tables: {
      meletee_buddy_profiles: [profile(ME, 'Ada', '🦉'), profile(BO, 'Βασιλική-Αικατερίνη', '🐼', { share: { streak: true, minutes: true, garden: true, focus: true }, stats: { streak: { weeks: 12, days: 5 }, minutes: 1234, garden: 9, focus: { until: Date.now() + 600000 } } })],
      meletee_buddy_links: [friends(ME, BO)],
    } },
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Φίλοι μελέτης' })).toBeVisible();
  await expect(page.locator('.bud-row')).toContainText('Συγκεντρώνεται τώρα');
  await expect(page.locator('.bud-row')).toContainText('Σερί 12 εβδομάδων');
  await noScroll(page);
  for (const hash of ['#/buddies/goals', '#/buddies/challenges', '#/buddies/invite', '#/buddies/me', '#/buddies/room']) {
    await page.goto('/' + hash);
    await expect(page.locator('main h1')).toBeVisible();
    await noScroll(page);
  }
  await page.goto('/#/buddies/b/' + BO);
  await page.getByRole('button', { name: /Στείλε ενθάρρυνση/ }).click();
  await expect(page.locator('.sheet')).toContainText('Θα τα καταφέρεις!');
  await noScroll(page);
  expect(errors).toEqual([]);
});

test('French and Russian signed-out screens', async ({ page }) => {
  const { errors } = await open(page, '#/buddies', { lang: 'fr', signedIn: false });
  await expect(page.getByRole('link', { name: 'Se connecter pour trouver des binômes' })).toBeVisible();
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('meletee1:local:a:settings')); localStorage.setItem('meletee1:local:a:settings', JSON.stringify({ ...s, lang: 'ru' })); });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Друзья по учёбе' })).toBeVisible();
  await noScroll(page);
  expect(errors).toEqual([]);
});
