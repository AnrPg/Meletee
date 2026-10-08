// Unit tests for phase 6: Supabase client, sync merge, conversation rows, noema-lite ids, course import,
// progress, the shared queue and the write-back path. No network: a fake fetch and a fake backend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// a tiny browser-ish environment (localStorage + window) before the app modules load
class Mem {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
globalThis.window = globalThis;
globalThis.localStorage = new Mem();
if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
if (!globalThis.dispatchEvent) globalThis.dispatchEvent = () => true;

const { query, createRestClient } = await import('../src/cloud/client.js');
const sync = await import('../src/cloud/sync.js');
const { convoRow, isMeletee } = await import('../src/cloud/convos.js');
const ids = await import('../src/noema/ids.js');
const imp = await import('../src/noema/import.js');
const prog = await import('../src/noema/progress.js');
const results = await import('../src/noema/results.js');
const { parseRegistry } = await import('../src/noema/source.js');
const store = await import('../src/core/store.js');

const pack = JSON.parse(readFileSync(new URL('./fixtures/noema-pack.json', import.meta.url), 'utf8'));
const registryText = readFileSync(new URL('./fixtures/noema-registry.js', import.meta.url), 'utf8');

// ---------- client ----------
test('PostgREST query strings', () => {
  assert.equal(query({ select: 'key,value', filters: [['key', 'like', 's:*:state']], order: 'key' }), '?select=key%2Cvalue&key=like.s%3A*%3Astate&order=key');
  assert.equal(query({ onConflict: 'user_id,key' }), '?on_conflict=user_id%2Ckey');
  assert.equal(query({}), '');
});

test('REST client: publishable key only as apikey, user token as bearer, user_id added on upsert', async () => {
  const calls = [];
  const fetchImpl = async (url, o) => {
    calls.push({ url, ...o });
    if (url.includes('grant_type=password')) return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: 'U1', email: 'a@b.c' } }), { status: 200 });
    return new Response('[]', { status: 200 });
  };
  const c = createRestClient({ supabaseUrl: 'https://x.supabase.co/', supabaseKey: 'sb_publishable_abc' }, { fetchImpl, storage: new Mem() });
  await c.signIn('a@b.c', 'pw');
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].headers.apikey, 'sb_publishable_abc');
  assert.equal(c.session().user.id, 'U1');
  await c.select('meletee_kv', { select: 'key', order: 'key' });
  assert.equal(calls[1].url, 'https://x.supabase.co/rest/v1/meletee_kv?select=key&order=key');
  assert.equal(calls[1].headers.Authorization, 'Bearer AT');
  await c.upsert('meletee_kv', [{ key: 'a:x', value: '1' }], { onConflict: 'user_id,key' });
  assert.match(calls[2].url, /on_conflict=user_id%2Ckey$/);
  assert.equal(calls[2].headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.deepEqual(JSON.parse(calls[2].body), [{ user_id: 'U1', key: 'a:x', value: '1' }]);
});

test('REST client: errors carry the server message', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error_description: 'Invalid login credentials' }), { status: 400 });
  const c = createRestClient({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_abc' }, { fetchImpl, storage: new Mem() });
  await assert.rejects(c.signIn('a', 'b'), /Invalid login credentials/);
});

// ---------- sync merge ----------
test('only account data syncs: never device keys, timers or caches', () => {
  assert.equal(sync.syncable('a:courses'), true);
  assert.equal(sync.syncable('a:settings'), true);
  assert.equal(sync.syncable('a:timer'), false);
  assert.equal(sync.syncable('a:cache.noema'), false);
  assert.equal(sync.syncable('a:meletee-device:anthropicKey'), false);
  assert.equal(sync.syncable('meta:mtime'), false);
  assert.equal(sync.syncable('cache:noema'), false);
});

test('merge: newer remote wins, newer local is pushed, local-only is pushed, remote-only is applied', () => {
  const r = sync.mergeKv({
    local: { 'a:courses': 'L', 'a:sessions': 'S-local', 'a:only-here': 'X' },
    mtimes: { 'a:courses': 1000, 'a:sessions': 5000 },
    remote: [
      { key: 'a:courses', value: 'R', updated_at: new Date(2000).toISOString() },
      { key: 'a:sessions', value: 'S-remote', updated_at: new Date(3000).toISOString() },
      { key: 'a:profile', value: 'P', updated_at: new Date(4000).toISOString() },
      { key: 'a:timer', value: 'T', updated_at: new Date(9000).toISOString() },
    ],
  });
  assert.deepEqual(r.apply, { 'a:courses': 'R', 'a:profile': 'P' });
  assert.deepEqual(r.push, ['a:only-here', 'a:sessions']);
  assert.equal(r.mtimes['a:courses'], 2000);
  assert.equal(r.mtimes['a:timer'], undefined);
});

test('merge: an unchanged local copy without a timestamp loses to the cloud copy', () => {
  const r = sync.mergeKv({ local: { 'a:settings': '{"lang":"el"}' }, mtimes: {}, remote: [{ key: 'a:settings', value: '{"lang":"fr"}', updated_at: new Date(1).toISOString() }] });
  assert.deepEqual(r.apply, { 'a:settings': '{"lang":"fr"}' });
  assert.deepEqual(r.push, []);
});

test('merge: a local deletion newer than the cloud is pushed (as a delete)', () => {
  const r = sync.mergeKv({ local: {}, mtimes: { 'a:today': 5000 }, remote: [{ key: 'a:today', value: 'x', updated_at: new Date(1000).toISOString() }] });
  assert.deepEqual(r.push, ['a:today']);
  const r2 = sync.mergeKv({ local: {}, mtimes: { 'a:gone': 5000 }, remote: [] });
  assert.deepEqual(r2.push, []);
  assert.equal(r2.mtimes['a:gone'], undefined);
});

test('merge3: entries added on two devices are all kept; deletions and edits on one side win', () => {
  const base = sync.describe(JSON.stringify([{ id: 'a', n: 1 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }]));
  const local = JSON.stringify([{ id: 'a', n: 2 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }, { id: 'l', n: 1 }]);   // edited a, added l
  const remote = JSON.stringify([{ id: 'a', n: 1 }, { id: 'c', n: 1 }, { id: 'r', n: 1 }]);                      // deleted b, added r
  const m = JSON.parse(sync.merge3(base, local, remote, false));
  assert.deepEqual(m.map((x) => x.id).sort(), ['a', 'c', 'l', 'r']);
  assert.equal(m.find((x) => x.id === 'a').n, 2);
  // the same entry changed on both: the newer side's copy
  const both = (preferLocal) => JSON.parse(sync.merge3(base, JSON.stringify([{ id: 'a', n: 'L' }]), JSON.stringify([{ id: 'a', n: 'R' }]), preferLocal))[0].n;
  assert.equal(both(true), 'L');
  assert.equal(both(false), 'R');
});

test('merge3: lists without ids, maps, order and plain values', () => {
  // appended logs (no ids): both new entries kept, two identical entries stay two
  const s0 = [{ at: 1, m: 25 }];
  const m = JSON.parse(sync.merge3(sync.describe(JSON.stringify(s0)), JSON.stringify([...s0, { at: 2, m: 25 }, { at: 2, m: 25 }]), JSON.stringify([...s0, { at: 3, m: 50 }]), true));
  assert.deepEqual(m.map((x) => x.at), [1, 3, 2, 2]);
  // newest-first lists keep their shape
  const w = JSON.parse(sync.merge3(sync.describe('[{"id":"w1"}]'), '[{"id":"w2"},{"id":"w1"}]', '[{"id":"w3"},{"id":"w1"}]', false));
  assert.deepEqual(w.map((x) => x.id), ['w2', 'w3', 'w1']);
  // maps (e.g. the Grow activity log by day): union, per-day edits kept
  assert.deepEqual(JSON.parse(sync.merge3(sync.describe('{"d1":1}'), '{"d1":1,"d2":1}', '{"d1":1,"d3":1}', false)), { d1: 1, d2: 1, d3: 1 });
  // without a common base (study moving into an account), nothing is dropped
  assert.deepEqual(JSON.parse(sync.merge3(null, '[{"id":"x"}]', '[{"id":"y"}]', false)).map((x) => x.id).sort(), ['x', 'y']);
  // plain values and different kinds: the newer side
  assert.equal(sync.merge3(null, '"a"', '"b"', true), '"a"');
  assert.equal(sync.merge3(null, '[1]', '{"x":1}', false), '{"x":1}');
});

test('mergeKv: a key changed on both devices is merged and pushed; changed here only is pushed', () => {
  const base = { 'a:sessions': sync.describe('[{"id":"s1"}]'), 'a:wins': sync.describe('[{"id":"w1"}]') };
  const r = sync.mergeKv({
    local: { 'a:sessions': '[{"id":"s1"},{"id":"s2"}]', 'a:wins': '[{"id":"w1"},{"id":"w2"}]' },
    mtimes: { 'a:sessions': 1000, 'a:wins': 1000 },
    pending: ['a:sessions', 'a:wins'],
    base,
    remote: [
      { key: 'a:sessions', value: '[{"id":"s1"},{"id":"s3"}]', updated_at: new Date(2000).toISOString() },   // the other device added s3
      { key: 'a:wins', value: '[{"id":"w1"}]', updated_at: new Date(2000).toISOString() },                   // unchanged there (newer stamp only)
    ],
    now: 5000,
  });
  assert.deepEqual(JSON.parse(r.apply['a:sessions']).map((x) => x.id).sort(), ['s1', 's2', 's3']);
  assert.equal(r.apply['a:wins'], undefined);
  assert.deepEqual(r.push, ['a:sessions', 'a:wins']);
  assert.equal(r.mtimes['a:sessions'], 5000);
  // not changed here: the newer cloud copy simply wins (no resurrection of entries deleted elsewhere)
  const r2 = sync.mergeKv({ local: { 'a:wins': '[{"id":"w1"},{"id":"w2"}]' }, mtimes: { 'a:wins': 1000 }, base: {}, remote: [{ key: 'a:wins', value: '[{"id":"w1"}]', updated_at: new Date(2000).toISOString() }] });
  assert.equal(r2.apply['a:wins'], '[{"id":"w1"}]');
  assert.deepEqual(r2.settled, ['a:wins']);
});

test('long values go up in parts and come back only when complete', () => {
  const v = JSON.stringify({ s: 'x'.repeat(25) });
  const rows = sync.toRows('a:ws:dual:sketches', v, 10);
  assert.equal(rows.length, 1 + Math.ceil(v.length / 10));
  assert.ok(rows.every((r) => r.value.length <= 100));
  assert.equal(sync.syncable('a:ws:dual:sketches#1'), false);
  const back = sync.fromRows(rows.map((r) => ({ ...r, updated_at: 'x' })));
  assert.deepEqual(back.map((r) => [r.key, r.value]), [['a:ws:dual:sketches', v]]);
  assert.deepEqual(sync.fromRows(rows.slice(0, -1)), []);                    // a part is missing: skipped
  assert.deepEqual(sync.toRows('a:x', 'short', 10), [{ key: 'a:x', value: 'short' }]);
});

test('study from before accounts moves into the account (never another account’s data)', async () => {
  localStorage.clear();
  localStorage.setItem('meletee1:local:a:courses', '[{"id":"c1"}]');
  localStorage.setItem('meletee1:local:a:settings', '{"lang":"el"}');
  assert.equal(sync.activate('u1'), true);
  assert.equal(store.account(), 'u_u1');
  assert.equal(localStorage.getItem('meletee1:u_u1:a:courses'), '[{"id":"c1"}]');
  assert.equal(localStorage.getItem('meletee1:local:a:courses'), null);          // moved
  assert.equal(localStorage.getItem('meletee1:local:a:settings'), '{"lang":"el"}');   // the welcome screen's language stays
  assert.deepEqual(JSON.parse(localStorage.getItem('meletee1:u_u1:meta:pending')).sort(), ['a:courses', 'a:settings']);
  // signed in as u1, then someone else signs in: u1's data is not copied
  assert.equal(sync.activate('u2'), false);
  assert.equal(localStorage.getItem('meletee1:u_u2:a:courses'), null);
  // local study meets the account's own copy on this device: merged
  sync.deactivate();
  localStorage.setItem('meletee1:local:a:courses', '[{"id":"c2"}]');
  sync.activate('u1');
  assert.deepEqual(JSON.parse(localStorage.getItem('meletee1:u_u1:a:courses')).map((c) => c.id).sort(), ['c1', 'c2']);
  sync.deactivate();
  localStorage.clear();
});

test('account gate: e-mail links, local study and rejected refresh tokens', async () => {
  const gate = await import('../src/cloud/gate.js');
  const { rejected, redirectTo } = await import('../src/cloud/client.js');
  assert.deepEqual(gate.readLink('#access_token=a&refresh_token=b&expires_in=60&type=recovery'), { access_token: 'a', refresh_token: 'b', expires_in: 60, expires_at: 0, type: 'recovery' });
  assert.equal(gate.readLink('#error=access_denied&error_code=otp_expired&error_description=Link+expired').code, 'otp_expired');
  assert.equal(gate.readLink('#/do/courses'), null);
  assert.equal(gate.readLink('#/learn/method/x'), null);
  const mem = new Mem();
  assert.equal(gate.localStudy(mem), false);
  mem.setItem('meletee1:local:a:settings', '{"lang":"fr"}');
  mem.setItem('meletee1:local:a:courses', '[]');
  assert.equal(gate.localStudy(mem), false);
  mem.setItem('meletee1:local:a:sessions', '[{"at":1}]');
  assert.equal(gate.localStudy(mem), true);
  assert.equal(rejected(Object.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'), { status: 400 })), true);
  assert.equal(rejected(Object.assign(new Error('network'), { network: true })), false);
  assert.equal(rejected(Object.assign(new Error('upstream'), { status: 503 })), false);
  assert.equal(redirectTo({ protocol: 'https:', origin: 'https://meletee.netlify.app', pathname: '/' }), 'https://meletee.netlify.app/');
  assert.equal(redirectTo({ protocol: 'file:', origin: 'null', pathname: '/x/meletee.html' }), '');
});

test('e-mail links: sign-up and recovery ask Supabase to link back to Meletee, not to noema-lite', async () => {
  // the shared project's Site URL is noema-lite's, so every e-mail link carries redirect_to
  const mem = new Mem();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push([url, opts.method]);
    if (url.includes('/auth/v1/user') && opts.method === 'GET') return new Response(JSON.stringify({ id: 'u1', email: 'ada@example.com' }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const here = { protocol: 'https:', origin: 'https://meletee.netlify.app', pathname: '/' };
  const old = globalThis.location;
  globalThis.location = here;
  try {
    const c = createRestClient({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_x' }, { fetchImpl, storage: mem });
    await c.signUp('ada@example.com', 'a-long-password', 'Ada');
    await c.recover('ada@example.com');
    const back = encodeURIComponent('https://meletee.netlify.app/');
    assert.deepEqual(calls.map(([u]) => u), [
      `https://x.supabase.co/auth/v1/signup?redirect_to=${back}`,
      `https://x.supabase.co/auth/v1/recover?redirect_to=${back}`,
    ]);
    // landing back from the link: the tokens become the session, then the new password is saved
    await c.fromLink({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
    assert.equal(c.session().user.email, 'ada@example.com');
    await c.setPassword('another-password');
    assert.deepEqual(calls.at(-1), ['https://x.supabase.co/auth/v1/user', 'PUT']);
  } finally { if (old === undefined) delete globalThis.location; else globalThis.location = old; }
});

test('REST client: an expired session survives a network failure and is dropped only when the server rejects it', async () => {
  const mem = new Mem();
  mem.setItem('meletee1:cloud:session', JSON.stringify({ access_token: 'old', refresh_token: 'r1', expires_at: 1, user: { id: 'u' } }));
  let mode = 'offline'; let refreshes = 0;
  const fetchImpl = async (url) => {
    if (url.includes('grant_type=refresh_token')) refreshes++;
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }), { status: 400 });
  };
  const c = createRestClient({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_x' }, { fetchImpl, storage: mem });
  await assert.rejects(Promise.all([c.select('meletee_kv'), c.select('meletee_kv')]), /network/);
  assert.equal(refreshes, 1);                       // one refresh for both calls
  assert.ok(c.session());                           // still signed in, offline
  mode = 'rejected';
  await assert.rejects(c.select('meletee_kv'), /Invalid Refresh Token/);
  assert.equal(c.session(), null);
});

test('sync engine with a fake backend: sign in, push, pull, snapshots', async () => {
  localStorage.clear();
  await import('./fixtures/fake-supabase.js');
  const b = window.__meleteeSupabase;
  store.set('courses', [{ id: 'c1', name: 'Bio', topics: [] }]);
  localStorage.setItem('meletee-device:anthropicKey', 'sk-secret');
  await b.signIn('ada@example.com', 'correct-horse');
  await sync.activate(b.session().user.id);
  assert.equal(store.account(), 'u_' + b.session().user.id);
  assert.deepEqual(store.get('courses')[0].name, 'Bio');             // local data came along
  await sync.pull();
  await sync.push();
  const rows = window.__fakeDb().tables.meletee_kv;
  assert.deepEqual(rows.map((r) => r.key).sort(), ['a:courses']);
  assert.ok(!JSON.stringify(window.__fakeDb()).includes('sk-secret'));
  // a newer copy from another device arrives
  window.__fakeSeed({ tables: { ...window.__fakeDb().tables, meletee_kv: [{ ...rows[0], value: JSON.stringify([{ id: 'c1', name: 'Biology', topics: [] }]), updated_at: new Date(Date.now() + 60000).toISOString() }] } });
  assert.equal(await sync.pull(), 1);
  assert.equal(store.get('courses')[0].name, 'Biology');
  // a local change is pushed with its own timestamp
  store.set('profile', { name: 'Ada' });
  sync.touch('profile');
  await sync.push();
  assert.ok(window.__fakeDb().tables.meletee_kv.some((r) => r.key === 'a:profile'));
  // restore points
  assert.equal(await sync.snapshots.auto(), true);
  assert.equal(await sync.snapshots.auto(), false);                 // once a day
  store.set('profile', { name: 'Changed' });
  const [snap] = await sync.snapshots.list();
  assert.equal(snap.kind, 'auto');
  await sync.snapshots.restore(snap.id);
  assert.equal(store.get('profile').name, 'Ada');
  sync.deactivate();
  assert.equal(store.account(), 'local');
});

// ---------- conversations ----------
test('conversation rows have exactly the shape noema-lite writes', () => {
  const rec = { schema: 'noema.conversation/v1', id: 'cv_0000000001abcdef', subject: { id: 'databricks', title: 'Databricks' }, kind: 'tutor', mode: 'socratic', title: 'Delta', context: { type: 'section', id: 'ch01-s01', label: 'Ch1' }, createdAt: '2026-10-08T10:00:00.000Z', updatedAt: '2026-10-08T10:05:00.000Z', deleted: false, stats: { messages: 4, userMessages: 2, chars: 100 }, messages: [], meta: { app: 'meletee' } };
  const row = convoRow(rec, 'U1');
  assert.deepEqual(Object.keys(row).sort(), ['context_label', 'created_at', 'deleted', 'id', 'kind', 'message_count', 'mode', 'record', 'subject_id', 'title', 'updated_at', 'user_id']);
  assert.equal(row.subject_id, 'databricks');
  assert.equal(row.message_count, 4);
  assert.equal(row.context_label, 'Ch1');
  assert.equal(row.record, rec);
  assert.equal(isMeletee(rec), true);
  assert.equal(isMeletee({ ...rec, meta: {} }), false);
});

// ---------- ids and links ----------
test('noema-lite ids are parsed', () => {
  assert.deepEqual(ids.parseId('ch05-s03'), { kind: 'section', chapter: 'ch05', n: 3, id: 'ch05-s03' });
  assert.equal(ids.parseId('ch05-e012').kind, 'exercise');
  assert.equal(ids.parseId('ch05-d01').kind, 'playbook');
  assert.equal(ids.parseId('ch05#3').kind, 'card');
  assert.equal(ids.parseId('ch05').kind, 'chapter');
  assert.equal(ids.chapterOf('ch12-e100'), 'ch12');
  assert.equal(ids.cardKey('ch01', { q: 'x' }, 2), 'ch01#2');
  assert.equal(ids.cardKey('ch01', { id: 'ch01-f007' }, 2), 'ch01-f007');
});

test('deep links match noema-lite routes', () => {
  const B = 'https://noema-lite.netlify.app/';
  assert.equal(ids.link(B, 'databricks', { section: 'ch05-s03' }), 'https://noema-lite.netlify.app/?subject=databricks#/s/ch05-s03');
  assert.equal(ids.link(B, 'databricks', { practice: 'ch05' }), 'https://noema-lite.netlify.app/?subject=databricks#/practice/ch05');
  assert.equal(ids.link(B, 'databricks', { cards: true }), 'https://noema-lite.netlify.app/?subject=databricks#/cards');
  assert.equal(ids.link(B, 'databricks', { cards: true, chapter: 'ch02' }), 'https://noema-lite.netlify.app/?subject=databricks#/ch/ch02/cards');
  assert.equal(ids.link(B, 'databricks', { mistakes: true }), 'https://noema-lite.netlify.app/?subject=databricks#/mistakes');
  assert.equal(ids.link(B, 'databricks', { exercise: 'ch05-e012' }), 'https://noema-lite.netlify.app/?subject=databricks#/practice/ch05');
  assert.equal(ids.link(B, 'databricks', { exercise: 'ch05-e012' }, { exerciseRoute: 1 }), 'https://noema-lite.netlify.app/?subject=databricks#/ex/ch05-e012');
  assert.equal(ids.topicKey({ subject: 'db', chapter: 'ch01', section: 'ch01-s02' }), 'noema:db:section:ch01-s02');
  assert.equal(ids.topicKey({ subject: 'db', chapter: 'ch01', section: null }), 'noema:db:chapter:ch01');
});

// ---------- import ----------
test('a real-shaped pack imports as a course with noema ids on topics', () => {
  assert.equal(imp.isPack(pack), true);
  const c = imp.importCourse(pack, { mode: 'section', today: '2026-10-08' });
  assert.equal(c.name, 'Databricks');
  assert.equal(c.topics.length, 4);
  assert.deepEqual(c.topics[0].noema, { subject: 'databricks', chapter: 'ch01', section: 'ch01-s01' });
  assert.match(c.topics[0].title, /^1\.1 /);
  assert.equal(c.noema.subject, 'databricks');
  assert.equal(c.noema.version, pack.version);
  assert.equal(c.noema.outline[0].sections[0].ex, pack.chapters[0].exercises.filter((e) => e.section === 'ch01-s01').length);
  assert.deepEqual(c.sources, [{ kind: 'spine', title: 'noema-lite · Databricks' }]);
  const byCh = imp.importCourse(pack, { mode: 'chapter' });
  assert.equal(byCh.topics.length, 2);
  assert.deepEqual(byCh.topics[1].noema, { subject: 'databricks', chapter: 'ch02', section: null });
  assert.equal(imp.defaultMode(pack), 'section');
  assert.throws(() => imp.importCourse({ nope: 1 }), /not a noema-lite pack/);
});

test('updating an imported course keeps progress and your own topics', () => {
  const c = imp.importCourse(pack, { mode: 'section' });
  c.topics[0] = { ...c.topics[0], studiedAt: '2026-10-01', reviewStep: 2 };
  c.topics.push({ id: 't_mine', title: 'My notes', stages: {}, reviewStep: 0, studiedAt: null });
  const smaller = { ...pack, chapters: [pack.chapters[0]] };
  const u = imp.importCourse(smaller, { existing: c });
  assert.equal(u.id, c.id);
  assert.equal(u.topics[0].studiedAt, '2026-10-01');
  assert.equal(u.topics[0].id, c.topics[0].id);
  assert.ok(u.topics.some((t) => t.id === 't_mine'));
  assert.equal(u.topics.filter((t) => t.noema).length, 2);            // untouched topics of a removed chapter go
});

test('material for a topic: exercises, cards with progress keys, playbooks, pitfalls', () => {
  const m = imp.material(pack, { subject: 'databricks', chapter: 'ch01', section: 'ch01-s01' });
  assert.ok(m.exercises.every((e) => e.section === 'ch01-s01'));
  assert.ok(m.cards.every((c) => /^ch01#\d+$/.test(c.key)));
});

// ---------- progress ----------
const state = {
  xp: 40,
  read: { 'ch01-s01': true },
  res: { 'ch01-e001': { n: 1, ok: 1, last: true }, 'ch01-e002': { n: 2, ok: 0, last: false }, 'ch02-e001': { n: 1, ok: 0, last: false } },
  fc: { 'ch01#0': { box: 1, due: '2026-10-07' }, 'ch02#1': { box: 2, due: '2026-10-20' } },
  pb: { 'ch01-d01': { box: 1, due: '2026-10-01' } },
};

test('subjects: library registry + imported packs + progress, with your own names', () => {
  const reg = parseRegistry(registryText);
  assert.equal(reg.subjects[0].id, 'databricks');
  const subs = prog.buildSubjects({ registry: reg, rows: [
    { key: 's:databricks:state', value: JSON.stringify(state) },
    { key: 'a:packmeta:my-bio', value: JSON.stringify({ id: 'my-bio', title: 'Biology', emoji: '🧬', counts: { sections: 10 } }) },
    { key: 'a:subjoverride:my-bio', value: JSON.stringify({ title: 'Bio 101' }) },
  ] });
  assert.deepEqual(subs.map((s) => s.id), ['databricks', 'my-bio']);
  assert.equal(subs[0].progress.read, 1);
  assert.equal(subs[0].progress.mistakes, 2);
  assert.equal(subs[1].title, 'Bio 101');
  assert.equal(subs[1].origin, 'imported');
});

test('summary counts due cards and playbooks for a day', () => {
  const s = prog.summary(state, { sections: 4 }, '2026-10-08');
  assert.deepEqual({ ...s }, { read: 1, solved: 1, mistakes: 2, cardsDue: 1, playbooksDue: 1, touched: 1, share: 0.25 });
});

test('what next: due Meletee reviews, then cards, mistakes, the next unread section, practice', () => {
  const course = imp.importCourse(pack, { mode: 'section' });
  assert.equal(prog.whatNext({ course, state: null, today: '2026-10-08' }).kind, 'start');
  assert.deepEqual(prog.whatNext({ course, state, today: '2026-10-08' }), { kind: 'read', chapter: 'ch01', section: 'ch01-s02', title: pack.chapters[0].sections[1].title });
  const many = { ...state, fc: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`ch02#${i}`, { box: 1, due: '2026-10-01' }])) };
  assert.deepEqual(prog.whatNext({ course, state: many, today: '2026-10-08' }), { kind: 'cards', count: 6, chapter: 'ch02' });
  const wrong = { ...state, res: { a: 0, 'ch01-e001': { last: false }, 'ch01-e002': { last: false }, 'ch02-e003': { last: false } } };
  assert.equal(prog.whatNext({ course, state: wrong, today: '2026-10-08' }).kind, 'mistakes');
  const allRead = { ...state, read: Object.fromEntries(course.noema.outline.flatMap((c) => c.sections.map((s) => [s.id, true]))) };
  assert.equal(prog.whatNext({ course, state: allRead, today: '2026-10-08' }).kind, 'practice');
  course.topics[0] = { ...course.topics[0], studiedAt: '2026-10-01', reviewStep: 0 };
  assert.equal(prog.whatNext({ course, state, today: '2026-10-08' }).kind, 'review');
});

test('shared review queue merges Meletee reviews with noema-lite cards, drills and mistakes by noema id', () => {
  const course = imp.importCourse(pack, { mode: 'chapter' });
  course.topics[0] = { ...course.topics[0], studiedAt: '2026-10-01', reviewStep: 0 };
  const q = prog.sharedQueue({ courses: [course], states: { databricks: state }, today: '2026-10-08' });
  assert.equal(q[0].key, 'noema:databricks:chapter:ch01');
  assert.equal(q[0].review, true);
  assert.equal(q[0].cards, 1);
  assert.equal(q[0].mistakes, 1);
  assert.equal(q[0].playbooks, 1);
  assert.equal(q[0].topicId, course.topics[0].id);
  assert.equal(q[1].key, 'noema:databricks:chapter:ch02');
  assert.equal(q[1].mistakes, 1);
  assert.equal(q.length, 2);
  // per-section courses keep noema-only work at chapter level
  const sec = imp.importCourse(pack, { mode: 'section' });
  const q2 = prog.sharedQueue({ courses: [sec], states: { databricks: state }, today: '2026-10-08' });
  assert.deepEqual(q2.map((i) => i.key), ['noema:databricks:chapter:ch01', 'noema:databricks:chapter:ch02']);
});

// ---------- write-back ----------
test('results: reviews and first studies of linked topics become inbox rows', () => {
  const c = imp.importCourse(pack, { mode: 'section' });
  const after = structuredClone([c]);
  after[0].topics[0].studiedAt = '2026-10-08';
  after[0].topics[1].reviewLog = [{ date: '2026-10-08', rating: 'hard' }];
  after[0].topics.push({ id: 'mine', title: 'x', studiedAt: '2026-10-08' });
  const items = results.diffResults([c], after, 'T');
  assert.deepEqual(items, [
    { subject: 'databricks', kind: 'section', id: 'ch01-s01', event: 'studied', at: 'T' },
    { subject: 'databricks', kind: 'section', id: 'ch01-s02', event: 'review', rating: 'hard', date: '2026-10-08', at: 'T' },
  ]);
  const rows = results.inboxRows(items, { now: 0, rand: () => 'abc' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'a:inbox:meletee:0abc');
  const v = JSON.parse(rows[0].value);
  assert.equal(v.schema, 'noema.results/v1');
  assert.equal(v.subject, 'databricks');
  assert.equal(v.items.length, 2);
  assert.equal(v.items[0].subject, undefined);
});

test('the AI tutor finds the noema-lite subject of a linked course or topic', async () => {
  const { noemaSubjectOf } = await import('../src/cloud/routes.js').catch(() => ({}));
  if (!noemaSubjectOf) return;   // routes.js pulls in browser views; covered in cloud.spec.js
  const c = imp.importCourse(pack, { mode: 'chapter' });
  assert.equal(noemaSubjectOf({ type: 'workspace', id: 'feynman', label: c.topics[0].title }, [c]), 'databricks');
  assert.equal(noemaSubjectOf({ type: 'workspace', id: 'feynman', label: 'Something else' }, [c]), null);
});

// ---------- restoring a backup (docs/REVIEW-1.0.md finding 7) ----------
test('importBackup writes only the account data the app knows, as valid JSON', () => {
  const acc = store.account();
  const k = (n) => `meletee1:${acc}:${n}`;
  const before = localStorage.getItem(k('cache:noemaOutbox'));
  const n = store.importBackup({ format: store.BACKUP_FORMAT, version: 1, data: {
    'a:courses': '[{"id":"c1"}]',
    'a:settings': '{"lang":"el"}',
    'a:grow:lab': '[]',
    'a:ws:deck:cards': '[]',
    'a:ws:recall:sets': '{}',
    'a:buddies:logged': '[]',
    'cache:noemaOutbox': '[{"key":"a:inbox:meletee:x","value":"{}"}]', // would be forwarded to noema-lite
    'cache:noema': '{}',
    'meta:lastSnapshot': '1',
    'a:cache.noema': '{}',
    'a:timer': '{"phase":"focus"}',          // device-only
    'a:inbox:meletee:x': '{}',
    'a:__proto__': '{}',
    'a:../../x': '{}',
    'a:unknownThing': '{}',
    'a:ws:<script>:x': '[]',
    'a:sessions': 'not json',
    'a:recalls': 42,
    'a:today': 'x'.repeat(1000001),
  } });
  assert.equal(n, 6);
  assert.equal(localStorage.getItem(k('a:courses')), '[{"id":"c1"}]');
  assert.equal(localStorage.getItem(k('a:ws:recall:sets')), '{}');
  assert.equal(localStorage.getItem(k('cache:noemaOutbox')), before, 'the noema-lite outbox is never restored');
  for (const bad of ['cache:noema', 'meta:lastSnapshot', 'a:cache.noema', 'a:timer', 'a:inbox:meletee:x', 'a:__proto__', 'a:../../x', 'a:unknownThing', 'a:ws:<script>:x', 'a:sessions', 'a:recalls', 'a:today'])
    assert.equal(localStorage.getItem(k(bad)), null, bad);
  assert.equal(store.restorable('a:ai'), true);
  assert.equal(store.restorable('ai'), false);
  assert.throws(() => store.importBackup({ format: 'x', data: {} }), /not a meletee backup/);
  assert.throws(() => store.importBackup({ format: store.BACKUP_FORMAT, data: [] }), /not a meletee backup/);
  for (const name of ['courses', 'settings', 'grow:lab', 'ws:deck:cards', 'ws:recall:sets', 'buddies:logged']) localStorage.removeItem(k('a:' + name));
});

// ---------- the noema-lite library is data only (finding 1) ----------
test('library: same-origin proxy first, then noema-lite directly; never a script', async () => {
  const { libraryBases } = await import('../src/noema/source.js');
  assert.deepEqual(libraryBases({ noemaUrl: 'https://noema-lite.netlify.app/' }), ['/noema-library', 'https://noema-lite.netlify.app/library']);
  assert.deepEqual(libraryBases({ noemaUrl: 'https://n.app', noemaLibrary: 'https://n.app/library/' }), ['https://n.app/library']);
  assert.deepEqual(libraryBases({}), []);
  const src = readFileSync(new URL('../src/noema/source.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /createElement\(\s*['"]script/, 'no <script> loading');
  assert.doesNotMatch(src, /NOEMA_PACKS|pack\.js[`'"]/, 'pack.js is never used');
});
