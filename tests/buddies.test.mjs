// Unit tests for the Buddies logic (src/buddies/logic.js), the Realtime client with a fake socket
// (src/buddies/realtime.js), the room orchestration (src/buddies/room.js) and the RPC call (src/buddies/rpc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../src/buddies/logic.js';
import { openChannel } from '../src/buddies/realtime.js';
import { joinRoom } from '../src/buddies/room.js';
import { createRpc } from '../src/buddies/rpc.js';

// ---------- privacy ----------
test('privacy: only the fields someone chose to share, and only known ones', () => {
  const stats = { streak: { weeks: 2, days: 4 }, minutes: 120, garden: 5, focus: { until: 99 }, secret: 'x' };
  assert.deepEqual(L.maskShared(L.DEFAULT_SHARE, stats), { streak: { weeks: 2, days: 4 } });
  assert.deepEqual(L.maskShared({ minutes: true, garden: 'yes' }, stats), { minutes: 120 }, 'only real true counts');
  assert.deepEqual(L.maskShared({ streak: true, minutes: true, garden: true, focus: true, secret: true }, stats), { streak: { weeks: 2, days: 4 }, minutes: 120, garden: 5, focus: { until: 99 } });
  assert.deepEqual(L.maskShared({ minutes: true }, {}), {});
  assert.deepEqual(L.maskShared(null, stats), {});
  assert.deepEqual(L.normalizeShare({ focus: true, extra: true }), { streak: false, minutes: false, garden: false, focus: true });
  assert.equal(Object.values(L.DEFAULT_SHARE).filter(Boolean).length, 1, 'by default only the streak is shared');
});

test('card stats: focusing only while a focus timer runs', () => {
  const now = 1_000_000;
  const s = L.cardStats({ streak: { streak: 3, count: 4 }, stage: 6, contrib: { minutes: 75 }, timer: { phase: 'focus', endsAt: now + 60000 }, now });
  assert.deepEqual(s, { streak: { weeks: 3, days: 4 }, minutes: 75, garden: 6, focus: { until: now + 60000 } });
  assert.equal(L.cardStats({ timer: { phase: 'focus', endsAt: now + 1, paused: 5000 }, now }).focus.until, 0, 'paused is not focusing');
  assert.equal(L.cardStats({ timer: { phase: 'rest', endsAt: now + 1 }, now }).focus.until, 0);
  assert.equal(L.isFocusing({ focus: { until: now + 5 } }, now), true);
  assert.equal(L.isFocusing({ focus: { until: now - 5 } }, now), false);
  assert.equal(L.isFocusing({}, now), false);
});

test('profile: names are cleaned, emojis come from the list', () => {
  assert.equal(L.cleanName('  Ada \n <b>Lovelace</b>  '), 'Ada bLovelace/b');
  assert.equal(L.cleanName('x'.repeat(60)).length, 40);
  assert.equal(L.cleanEmoji('🐼'), '🐼');
  assert.equal(L.cleanEmoji('<script>'), L.EMOJIS[0]);
});

// ---------- weeks and contributions ----------
test('contributions: this week only, from sessions and reviews, never the future', () => {
  const c = L.contributions({
    week: '2026-10-05', today: '2026-10-08',
    sessions: [{ date: '2026-10-04', minutes: 50 }, { date: '2026-10-05', minutes: 25 }, { date: '2026-10-08', minutes: 30 }, { date: '2026-10-09', minutes: 25 }],
    courses: [{ topics: [{ reviewLog: [{ date: '2026-10-06' }, { date: '2026-10-01' }] }, { reviewLog: [{ date: '2026-10-08' }] }, {}] }],
  });
  assert.deepEqual(c, { week: '2026-10-05', minutes: 55, sessions: 2, reviews: 2 });
  assert.equal(L.contributions({ week: '2026-10-05', today: '2026-10-08', sessions: [{ date: '2026-10-06', minutes: 1e9 }] }).minutes, 10080, 'clamped to the SQL limits');
});

test('weekly reset: goals belong to their week; last week is kept for a kind note, older ones vanish', () => {
  assert.equal(L.weekOf('2026-10-08'), '2026-10-05');
  assert.equal(L.weekOf('2026-10-11'), '2026-10-05', 'Sunday still belongs to the week');
  assert.equal(L.weekOf('2026-10-12'), '2026-10-12', 'Monday starts fresh');
  assert.equal(L.lastWeekOf('2026-10-08'), '2026-09-28');
  assert.equal(L.daysLeft('2026-10-05'), 6);
  assert.equal(L.daysLeft('2026-10-11'), 0);
  const goals = [{ id: 'a', week: '2026-10-05' }, { id: 'b', week: '2026-09-28' }, { id: 'c', week: '2026-09-21' }];
  const w = L.byWeek(goals, '2026-10-08');
  assert.deepEqual(w.now.map((g) => g.id), ['a']);
  assert.deepEqual(w.last.map((g) => g.id), ['b']);
  const next = L.byWeek(goals, '2026-10-12');
  assert.deepEqual(next.now, []);
  assert.deepEqual(next.last.map((g) => g.id), ['a']);
});

// ---------- cooperation, co-competition, competition ----------
test('shared goal: each person against their own target, combined progress caps at the target', () => {
  const p = L.sharedProgress([{ id: 'a', value: 7 }, { id: 'b', value: 2 }, { id: 'c' }], 5);
  assert.deepEqual(p.rows.map((r) => [r.pct, r.done]), [[100, true], [40, false], [0, false]]);
  assert.equal(p.combined, Math.round((5 + 2 + 0) / 15 * 100), 'one person overdoing it does not carry the others');
  assert.equal(p.allDone, false);
  assert.equal(p.doneCount, 1);
  assert.equal(L.sharedProgress([{ value: 5 }, { value: 6 }], 5).allDone, true);
  assert.equal(L.sharedProgress([], 5).combined, 0);
});

test('team goal (co-competition): everyone counts towards one total, each part shown, nobody ranked', () => {
  const members = [{ id: 'a', name: 'Zed', value: 4 }, { id: 'b', name: 'Ann', value: 12 }, { id: 'c', name: 'Bo', value: 0 }];
  const p = L.teamProgress(members, 20);
  assert.equal(p.total, 16);
  assert.equal(p.pct, 80);
  assert.equal(p.met, false);
  assert.equal(p.left, 4);
  assert.deepEqual(p.rows.map((r) => r.id), ['a', 'b', 'c'], 'kept in joining order');
  assert.deepEqual(p.rows.map((r) => r.part), [25, 75, 0]);
  const won = L.teamProgress([...members, { id: 'd', value: 10 }], 20);
  assert.equal(won.met, true);
  assert.equal(won.pct, 100);
  assert.equal(won.left, 0);
  assert.equal(L.teamProgress([], 20).pct, 0);
});

test('challenge board: shared places for ties, the not-yet-started are warming up, never last', () => {
  const b = L.challengeBoard([
    { id: 'a', name: 'Ada', value: 30 }, { id: 'b', name: 'Bo', value: 50 }, { id: 'c', name: 'Cy', value: 50 },
    { id: 'd', name: 'Di', value: 0 }, { id: 'e', name: 'Ed' },
  ]);
  assert.deepEqual(b.rows.map((r) => [r.id, r.rank]), [['b', 1], ['c', 1], ['a', 3], ['d', null], ['e', null]]);
  assert.deepEqual(b.rows.filter((r) => r.top).map((r) => r.id), ['b', 'c']);
  assert.equal(b.leaders, 2);
  assert.equal(b.total, 130);
  assert.ok(b.rows.every((r) => !('last' in r)));
  const empty = L.challengeBoard([{ id: 'a', value: 0 }]);
  assert.equal(empty.leaders, 0);
  assert.equal(empty.rows[0].rank, null);
});

test('cheers: preset keys only, and every preset is translated in all four languages', () => {
  assert.equal(L.isPreset('cheer', 'proud'), true);
  assert.equal(L.isPreset('cheer', 'studyNow'), false, 'a nudge is not a cheer');
  assert.equal(L.isPreset('cheer', 'hello <b>'), false);
  assert.equal(L.isPreset('dm', 'proud'), false);
  const bundles = Object.fromEntries(['en', 'el', 'ru', 'fr'].map((l) => [l, JSON.parse(readFileSync(new URL(`../i18n/buddies.${l}.json`, import.meta.url), 'utf8'))]));
  for (const key of [...L.CHEERS.cheer, ...L.CHEERS.nudge]) {
    assert.match(key, /^[a-z][A-Za-z0-9]{0,39}$/, 'matches the SQL check');
    for (const l of Object.keys(bundles)) assert.ok(bundles[l]['buddies.msg.' + key], `${l}: ${key}`);
  }
  const keys = Object.keys(bundles.en).sort();
  for (const l of ['el', 'ru', 'fr']) assert.deepEqual(Object.keys(bundles[l]).sort(), keys, `${l} has the same keys`);
  for (const [k, v] of Object.entries(bundles.fr)) assert.doesNotMatch(v, / [?!:;]/, `fr non-breaking spaces: ${k}`);
});

// ---------- invites ----------
test('invite codes: unambiguous, parsed from links or typed loosely', () => {
  assert.equal(L.CODE_ALPHABET.length, 31, 'the alphabet has 31 characters (codes are made by the server)');
  assert.equal(L.newCode, undefined, 'the client no longer makes codes');
  assert.equal(L.parseCode('abcd 2345'), 'ABCD2345', 'old 8-character codes still work');
  assert.equal(L.parseCode('abcde-23456'), 'ABCDE23456', 'new 10-character codes');
  assert.equal(L.parseCode('ABCDE2345'), null, '9 characters');
  assert.equal(L.parseCode('ABCD-2345'), 'ABCD2345');
  assert.equal(L.parseCode('https://meletee.netlify.app/#/buddies/join/ABCD2345'), 'ABCD2345');
  assert.equal(L.parseCode('ABCD0345'), null, 'no zero');
  assert.equal(L.parseCode('ABCD234'), null);
  assert.equal(L.parseCode(''), null);
  assert.equal(L.inviteLink('ABCD2345', 'https://x.app/index.html#/buddies/invite'), 'https://x.app/index.html#/buddies/join/ABCD2345');
});

// ---------- the shared room timer ----------
test('room timer: focus, then the break follows by itself, then idle; the newest record wins', () => {
  const t0 = 1_000_000;
  const tm = L.startTimer({ minutes: 25, rest: 5, by: 'a', now: t0 });
  assert.deepEqual(L.timerView(tm, t0 + 60000), { phase: 'focus', left: 24 * 60000, total: 25 * 60000 });
  assert.equal(L.timerView(tm, t0 + 26 * 60000).phase, 'break');
  assert.equal(L.timerView(tm, t0 + 26 * 60000).left, 4 * 60000);
  assert.equal(L.timerView(tm, t0 + 31 * 60000).phase, 'idle');
  assert.equal(L.timerView(L.stopTimer({ now: t0 }), t0).phase, 'idle');
  assert.equal(L.timerView(null).phase, 'idle');
  assert.equal(L.timerView({ phase: 'focus' }).phase, 'idle', 'broken records are idle');
  const stop = L.stopTimer({ now: t0 + 5 });
  assert.equal(L.newerTimer(tm, stop), stop);
  assert.equal(L.newerTimer(stop, tm), stop);
  assert.equal(L.newerTimer(null, tm), tm);
  assert.equal(L.newerTimer(tm, null), tm);
});

test('room timer from the network: cleanTimer keeps only well-formed, plausible records', () => {
  const now = 1_800_000_000_000;
  const ok = { phase: 'focus', minutes: 25, rest: 5, startedAt: now - 1000, endsAt: 1, by: 'u1', v: now - 1000, evil: '<b>' };
  assert.deepEqual(L.cleanTimer(ok, now), { phase: 'focus', minutes: 25, rest: 5, startedAt: now - 1000, endsAt: now - 1000 + 25 * 60000, by: 'u1', v: now - 1000 }, 'endsAt derived, extra fields dropped');
  assert.deepEqual(L.cleanTimer({ phase: 'idle', v: now, junk: 1 }, now), { phase: 'idle', v: now });
  assert.deepEqual(L.cleanTimer({ phase: 'focus', minutes: 50, startedAt: now, v: now }, now).rest, 0, 'a missing break is 0');
  assert.equal(L.cleanTimer(L.startTimer({ minutes: 120, rest: 60, now }), now).minutes, 120, 'the longest preset fits');
  const bad = [
    null, undefined, 'idle', 5, [], {},
    { phase: 'focus', minutes: 100000, rest: 0, startedAt: now, v: now },   // a week of "study"
    { phase: 'focus', minutes: 121, rest: 0, startedAt: now, v: now },
    { phase: 'focus', minutes: 0, rest: 0, startedAt: now, v: now },
    { phase: 'focus', minutes: 2.5, rest: 0, startedAt: now, v: now },
    { phase: 'focus', minutes: '5', rest: 0, startedAt: now, v: now },      // string concatenation in sums
    { phase: 'focus', minutes: 25, rest: 61, startedAt: now, v: now },
    { phase: 'focus', minutes: 25, rest: -1, startedAt: now, v: now },
    { phase: 'focus', minutes: 25, rest: 5, v: now },                        // no start
    { phase: 'focus', minutes: 25, rest: 5, startedAt: now + 3600e3, v: now },
    { phase: 'focus', minutes: 25, rest: 5, startedAt: now, v: 1e300 },      // would lock the room
    { phase: 'idle', v: now + 120000 },
    { phase: 'idle', v: '1' },
    { phase: 'idle', v: NaN },
    { phase: 'idle' },
    { phase: 'pause', v: now },
  ];
  for (const b of bad) assert.equal(L.cleanTimer(b, now), null, JSON.stringify(b));
  assert.equal(L.cleanTimer({ phase: 'idle', v: now, by: { id: 1 } }, now).by, undefined, 'by is a string or nothing');
});

test('room timer: only the minutes I was in the room are logged, capped at the block', () => {
  const tm = L.startTimer({ minutes: 25, rest: 5, now: 0 });
  assert.equal(L.roomMinutes(tm, 25 * 60000), 25);
  assert.equal(L.roomMinutes(tm, 10 * 60000 + 20000), 10, 'joined late');
  assert.equal(L.roomMinutes(tm, 999 * 60000), 25, 'never more than the block');
  assert.equal(L.roomMinutes(tm, 0), 0);
  assert.equal(L.roomMinutes(tm, -5), 0);
  assert.equal(L.roomMinutes(tm, 'x'), 0);
  assert.equal(L.roomMinutes({ phase: 'focus', minutes: 100000 }, 1e12), 120, 'even an unchecked record stays within 120');
  assert.equal(L.roomMinutes({ phase: 'focus', minutes: '5' }, 5 * 60000), 0);
  assert.equal(L.roomMinutes(L.stopTimer({ now: 0 }), 60000), 0);
  assert.equal(L.roomMinutes(null, 60000), 0);
});

// ---------- presence ----------
test('presence: state, joins and leaves, merged with polled members', () => {
  let s = { a: { metas: [{ phx_ref: '1', name: 'Ada', emoji: '🦉', status: 'here' }] } };
  s = L.applyPresenceDiff(s, { joins: { b: { metas: [{ phx_ref: '2', name: 'Bo', emoji: '🐼', status: 'focus' }] }, a: { metas: [{ phx_ref: '3', name: 'Ada', emoji: '🦉', status: 'focus' }] } } });
  assert.deepEqual(L.presenceList(s), [{ id: 'a', name: 'Ada', emoji: '🦉', status: 'focus' }, { id: 'b', name: 'Bo', emoji: '🐼', status: 'focus' }]);
  s = L.applyPresenceDiff(s, { leaves: { a: { metas: [{ phx_ref: '1' }] }, b: { metas: [{ phx_ref: '2' }] } } });
  assert.deepEqual(L.presenceList(s).map((m) => m.id), ['a'], 'a still has a second connection');
  assert.equal(L.applyPresenceDiff(s, { joins: { a: { metas: [{ phx_ref: '3' }] } } }).a.metas.length, 1, 'no duplicates');
  const merged = L.mergeMembers([{ id: 'b', name: 'Bo', emoji: '🐼', status: 'focus' }], [{ id: 'b', name: 'Bo', emoji: '🐼', status: 'here' }, { id: 'c', name: 'Cy', emoji: '🐢', status: 'break' }]);
  assert.deepEqual(merged.map((m) => [m.id, m.status]), [['b', 'focus'], ['c', 'break']]);
});

// ---------- the Realtime client with a fake socket ----------
function fakeSocket() {
  const sockets = [];
  class WS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(x) { this.sent.push(JSON.parse(x)); }
    close() { this.readyState = 3; this.closed = true; }
    open() { this.readyState = 1; this.onopen?.(); }
    recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
  }
  return { WS, sockets };
}
function fakeTimers() {
  const list = [];
  let id = 0;
  return {
    list,
    setTimeout: (f, ms) => { list.push({ id: ++id, f, ms, kind: 't' }); return id; },
    clearTimeout: (x) => { const i = list.findIndex((t) => t.id === x); if (i >= 0) list.splice(i, 1); },
    setInterval: (f, ms) => { list.push({ id: ++id, f, ms, kind: 'i' }); return id; },
    clearInterval: (x) => { const i = list.findIndex((t) => t.id === x); if (i >= 0) list.splice(i, 1); },
    fire(kind, ms) { for (const t of list.filter((x) => x.kind === kind && (ms == null || x.ms === ms))) t.f(); },
  };
}

test('realtime: joins a private channel with the token, tracks presence, sends and receives broadcasts', () => {
  const { WS, sockets } = fakeSocket();
  const timers = fakeTimers();
  const statuses = [], presences = [], got = [];
  const ch = openChannel({ url: 'wss://x/realtime/v1/websocket?apikey=k&vsn=1.0.0', topic: 'meletee-room:r1', token: 'tok', key: 'u1', WS, timers,
    onStatus: (s) => statuses.push(s), onPresence: (p) => presences.push(p), onBroadcast: (e, p) => got.push([e, p]) });
  ch.track({ name: 'Ada', emoji: '🦉', status: 'here' }); // queued until joined
  const ws = sockets[0];
  ws.open();
  const join = ws.sent[0];
  assert.equal(join.event, 'phx_join');
  assert.equal(join.topic, 'realtime:meletee-room:r1');
  assert.deepEqual(join.payload, { config: { broadcast: { self: false, ack: false }, presence: { key: 'u1' }, private: true }, access_token: 'tok' });
  assert.equal(ws.sent.length, 1, 'nothing else before the join is accepted');
  ws.recv({ topic: 'realtime:meletee-room:r1', event: 'phx_reply', ref: join.ref, payload: { status: 'ok', response: {} } });
  assert.deepEqual(statuses, ['live']);
  assert.equal(ch.status, 'live');
  assert.deepEqual(ws.sent[1].payload, { type: 'presence', event: 'track', payload: { name: 'Ada', emoji: '🦉', status: 'here' } });
  assert.equal(ws.sent[1].join_ref, join.ref);
  ws.recv({ topic: 'realtime:meletee-room:r1', event: 'presence_state', payload: { u2: { metas: [{ phx_ref: 'x', name: 'Bo', emoji: '🐼', status: 'focus' }] } } });
  ws.recv({ topic: 'realtime:meletee-room:r1', event: 'presence_diff', payload: { joins: { u1: { metas: [{ phx_ref: 'y', name: 'Ada', emoji: '🦉' }] } }, leaves: {} } });
  assert.deepEqual(presences.at(-1).map((p) => p.id), ['u2', 'u1']);
  ws.recv({ topic: 'realtime:other', event: 'broadcast', payload: { type: 'broadcast', event: 'timer', payload: { v: 1 } } });
  ws.recv({ topic: 'realtime:meletee-room:r1', event: 'broadcast', payload: { type: 'broadcast', event: 'timer', payload: { v: 2 } } });
  assert.deepEqual(got, [['timer', { v: 2 }]], 'other topics are ignored');
  ch.broadcast('timer', { phase: 'idle', v: 3 });
  assert.deepEqual(ws.sent.at(-1).payload, { type: 'broadcast', event: 'timer', payload: { phase: 'idle', v: 3 } });
  timers.fire('i', 25000);
  assert.deepEqual({ topic: ws.sent.at(-1).topic, event: ws.sent.at(-1).event }, { topic: 'phoenix', event: 'heartbeat' });
  ch.close();
  assert.equal(ws.sent.at(-1).event, 'phx_leave');
  assert.equal(ws.closed, true);
  assert.equal(timers.list.length, 0, 'no timers left behind');
  ws.onclose?.();
  assert.deepEqual(statuses, ['live'], 'closing on purpose is not a failure');
});

test('realtime: refused join, silence, a closed socket or no WebSocket at all → failed (polling takes over)', () => {
  const cases = [
    (ws, join) => ws.recv({ topic: join.topic, event: 'phx_reply', ref: join.ref, payload: { status: 'error', response: { reason: 'unauthorized' } } }),
    (ws, join, timers) => timers.fire('t', 8000),
    (ws) => ws.onclose(),
    (ws, join) => ws.recv({ topic: join.topic, event: 'system', payload: { status: 'error', message: 'token expired' } }),
  ];
  for (const act of cases) {
    const { WS, sockets } = fakeSocket();
    const timers = fakeTimers();
    const statuses = [];
    openChannel({ url: 'wss://x', topic: 't', token: 'k', key: 'u', WS, timers, onStatus: (s) => statuses.push(s) });
    sockets[0].open();
    act(sockets[0], sockets[0].sent[0], timers);
    assert.deepEqual(statuses, ['failed']);
    assert.equal(sockets[0].closed, true);
  }
  const timers = fakeTimers();
  const statuses = [];
  openChannel({ url: 'wss://x', topic: 't', WS: null, timers, onStatus: (s) => statuses.push(s) });
  timers.fire('t');
  assert.deepEqual(statuses, ['failed']);
  const t2 = fakeTimers();
  const s2 = [];
  openChannel({ url: 'wss://x', topic: 't', WS: class { constructor() { throw new Error('blocked'); } }, timers: t2, onStatus: (s) => s2.push(s) });
  t2.fire('t');
  assert.deepEqual(s2, ['failed']);
});

// ---------- the room: database heartbeat + socket, polling fallback ----------
const tick = () => new Promise((r) => setImmediate(r));

test('room: live channel merges presence with the database, timers go out both ways', async () => {
  const calls = [];
  let dbMembers = [{ id: 'c', name: 'Cy', emoji: '🐢', status: 'here' }];
  const rpc = async (fn, args) => { calls.push([fn, args]); return fn === 'meletee_buddy_room_join' ? { timer: { phase: 'idle', v: 1 }, members: dbMembers } : null; };
  let channel;
  const tracked = [], sent = [];
  const connect = (opts) => { channel = opts; return { track: (m) => tracked.push(m), broadcast: (e, p) => sent.push([e, p]), close: () => { channel.closed = true; } }; };
  const timers = fakeTimers();
  const states = [];
  const room = joinRoom('r1', { me: { id: 'a', name: 'Ada', emoji: '🦉' }, rpc, info: { url: 'wss://x', token: 'tok' }, connect, timers, onChange: (s) => states.push(s) });
  await room.ready;
  assert.equal(channel.topic, 'meletee-room:r1');
  assert.equal(channel.key, 'a');
  channel.onStatus('live');
  assert.deepEqual(tracked[0], { name: 'Ada', emoji: '🦉', status: 'here' });
  // Bo appears on the socket first: shown only once the database lists him for me (blocks are filtered there)
  channel.onPresence([{ id: 'b', name: 'Bo', emoji: '🐼', status: 'focus' }, { id: 'x', name: 'Blocked', emoji: '🐍', status: 'here' }]);
  assert.equal(states.at(-1).mode, 'live');
  assert.deepEqual(states.at(-1).members.map((m) => m.id), ['c'], 'unknown presence is not shown');
  dbMembers = [{ id: 'b', name: 'Bo', emoji: '🐼', status: 'here' }, { id: 'c', name: 'Cy', emoji: '🐢', status: 'here' }];
  const n = calls.length;
  timers.fire('t', 1000);
  await tick();
  assert.deepEqual(calls[n], ['meletee_buddy_room_join', { p_room: 'r1', p_status: 'here' }], 'a presence change asks the database');
  assert.deepEqual(states.at(-1).members.map((m) => [m.id, m.status]), [['b', 'focus'], ['c', 'here']], 'socket presence + people seen through the database');
  // a buddy's timer arrives by broadcast; an older one is ignored
  const now = Date.now();
  channel.onBroadcast('timer', { phase: 'focus', minutes: 25, rest: 5, startedAt: now, endsAt: 9e12, v: 10, extra: 'x' });
  channel.onBroadcast('timer', { phase: 'idle', v: 5 });
  assert.equal(room.state.timer.v, 10);
  assert.deepEqual(room.state.timer, { phase: 'focus', minutes: 25, rest: 5, startedAt: now, endsAt: now + 25 * 60000, v: 10 }, 'rebuilt: endsAt derived, unknown fields dropped');
  // a hostile buddy's timers are ignored: huge minutes, strings, a v from the far future
  channel.onBroadcast('timer', { phase: 'focus', minutes: 100000, rest: 0, startedAt: now, endsAt: now + 1000, v: 11 });
  channel.onBroadcast('timer', { phase: 'focus', minutes: '5', rest: 0, startedAt: now, v: 12 });
  channel.onBroadcast('timer', { phase: 'idle', v: 1e300 });
  channel.onBroadcast('timer', 'idle');
  assert.equal(room.state.timer.v, 10);
  // my timer: broadcast and stored
  await room.setTimer({ phase: 'idle', v: 20 });
  assert.deepEqual(sent.at(-1), ['timer', { phase: 'idle', v: 20 }]);
  assert.deepEqual(calls.at(-1), ['meletee_buddy_room_timer', { p_room: 'r1', p_timer: { phase: 'idle', v: 20 } }]);
  await room.setStatus('focus');
  assert.equal(tracked.at(-1).status, 'focus');
  assert.deepEqual(calls.at(-1), ['meletee_buddy_room_join', { p_room: 'r1', p_status: 'focus' }]);
  assert.equal(timers.list.find((t) => t.kind === 'i').ms, 30000, 'live: a slow database heartbeat');
  await room.leave();
  assert.equal(channel.closed, true);
  assert.deepEqual(calls.at(-1), ['meletee_buddy_room_leave', { p_room: 'r1' }]);
  assert.equal(timers.list.length, 0);
});

test('room: socket failure switches to polling every few seconds, without a socket it polls from the start', async () => {
  let n = 0;
  const rpc = async (fn) => (fn === 'meletee_buddy_room_join' ? { timer: { phase: 'focus', minutes: 25, rest: 5, startedAt: Date.now(), endsAt: 9e12, v: ++n }, members: [{ id: 'b', name: 'Bo', emoji: '🐼', status: 'focus' }] } : null);
  let channel;
  const timers = fakeTimers();
  const states = [];
  const room = joinRoom('r1', { me: { id: 'a', name: 'Ada', emoji: '🦉' }, rpc, info: { url: 'wss://x', token: 't' }, connect: (o) => { channel = o; return { track() {}, broadcast() {}, close() {} }; }, timers, onChange: (s) => states.push(s) });
  await room.ready;
  channel.onStatus('failed');
  assert.equal(states.at(-1).mode, 'polling');
  assert.equal(timers.list.filter((t) => t.kind === 'i').length, 1);
  assert.equal(timers.list.find((t) => t.kind === 'i').ms, 5000);
  timers.fire('i', 5000);
  await tick();
  assert.equal(room.state.timer.v, 2, 'each poll brings the newest timer');
  assert.deepEqual(room.state.members.map((m) => m.id), ['b']);
  await room.leave();

  const t2 = fakeTimers();
  const s2 = [];
  const r2 = joinRoom('r2', { me: { id: 'a' }, rpc, info: null, timers: t2, onChange: (s) => s2.push(s) });
  await r2.ready;
  assert.equal(s2.at(-1).mode, 'polling');
  assert.equal(t2.list[0].ms, 5000);
  await r2.leave();
});

// ---------- RPC over PostgREST ----------
test('rpc: POST /rest/v1/rpc/<fn> with the user token, errors carry the server message, token refreshed first', async () => {
  const seen = [];
  let s = { access_token: 'old', expires_at: Date.now() / 1000 + 30, user: { id: 'u' } };
  const call = createRpc({ supabaseUrl: 'https://p.supabase.co/', supabaseKey: 'sb_publishable_x' }, {
    session: () => s,
    refresh: async () => { s = { ...s, access_token: 'new', expires_at: Date.now() / 1000 + 3600 }; },
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      if (url.endsWith('meletee_buddy_cheer')) return { ok: false, status: 400, text: async () => JSON.stringify({ message: 'slow down' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) };
    },
  });
  assert.deepEqual(await call('meletee_buddy_invite_preview', { p_code: 'ABCD2345' }), { status: 'ok' });
  assert.equal(seen[0].url, 'https://p.supabase.co/rest/v1/rpc/meletee_buddy_invite_preview');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer new', 'refreshed because it was about to expire');
  assert.equal(seen[0].init.headers.apikey, 'sb_publishable_x');
  assert.deepEqual(JSON.parse(seen[0].init.body), { p_code: 'ABCD2345' });
  await assert.rejects(call('meletee_buddy_cheer', {}), /slow down/);
  await assert.rejects(call('drop_everything', {}), /unknown function/);
  s = null;
  await assert.rejects(call('meletee_buddy_overview', {}), /signed out/);
});

// ---------- the SQL keeps its promises ----------
test('SQL: phase 7 section is idempotent in style, has RLS on every buddy table and checks auth.uid() in every function', () => {
  const sql = readFileSync(new URL('../cloud/supabase.sql', import.meta.url), 'utf8');
  const p7 = sql.slice(sql.indexOf('PHASE 7'));
  const tables = [...p7.matchAll(/create table if not exists public\.(meletee_buddy_\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 9);
  for (const tb of tables) assert.match(p7, new RegExp(`alter table public\\.${tb}\\s+enable row level security`), tb);
  assert.doesNotMatch(p7, /create table (?!if not exists)/i);
  assert.doesNotMatch(p7, /create (?!or replace )function/i);
  const fns = [...p7.matchAll(/create or replace function public\.(meletee_buddy_\w+)\(([^)]*)\)[\s\S]*?\$\$;/g)];
  for (const [body, name] of fns) {
    if (name === 'meletee_buddy_masked') continue;
    assert.match(body, /auth\.uid\(\)|meletee_buddy_me\(\)/, `${name} checks auth.uid()`);
    if (/security definer/.test(body)) assert.match(body, /set search_path = public/, `${name} pins search_path`);
  }
  for (const fn of ['invite_preview', 'accept_invite', 'decline_invite', 'remove', 'block', 'unblock', 'cheer', 'cheers_seen', 'room_open', 'room_state', 'room_join', 'room_leave', 'room_timer', 'goal_create', 'goal_join', 'goal_leave', 'overview']) {
    assert.ok(fns.some((m) => m[1] === 'meletee_buddy_' + fn), fn);
  }
  for (const m of p7.matchAll(/create policy "([^"]+)" on ([\w.]+)/g)) assert.match(p7, new RegExp(`drop policy if exists "${m[1]}"\\s+on ${m[2].replace('.', '\\.')}`), m[1]);
});

test('SQL: the 1.0 security fixes are in place (docs/REVIEW-1.0.md findings 2-5, 8)', () => {
  const sql = readFileSync(new URL('../cloud/supabase.sql', import.meta.url), 'utf8');
  const fn = (name) => sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?end \\$\\$;`))?.[0] || '';
  // 2) the room timer is validated and rebuilt on the server
  const timer = fn('meletee_buddy_room_timer');
  assert.match(timer, /between 1 and 120/);
  assert.match(timer, /between 0 and 60/);
  assert.match(timer, /now_ms \+ 60000/);
  assert.doesNotMatch(timer, /p_timer \|\|/, 'never stores the raw payload');
  // 3) goal numbers only for members (challenges by design)
  assert.match(fn('meletee_buddy_overview'), /'value', case when gm\.joined or g\.kind = 'challenge'/);
  // 4) invites: no insert/update policy, server-made codes, attempt limit, decline only after a preview
  assert.doesNotMatch(sql, /create policy "[^"]+"\s+on public\.meletee_buddy_invites\s+for (all|insert|update)/);
  assert.match(sql, /create policy "see own buddy invites"\s+on public\.meletee_buddy_invites\s+for select/);
  assert.match(sql, /create policy "delete own buddy invites" on public\.meletee_buddy_invites\s+for delete/);
  assert.match(fn('meletee_buddy_invite_create'), /gen_random_uuid\(\)/);
  assert.match(fn('meletee_buddy_invite_create'), />= 20/);
  for (const f of ['meletee_buddy_invite_preview', 'meletee_buddy_accept_invite', 'meletee_buddy_decline_invite']) assert.match(fn(f), /meletee_buddy_code_try\(me\)/, f);
  assert.match(fn('meletee_buddy_code_try'), />= 30/);
  assert.match(fn('meletee_buddy_decline_invite'), /meletee_buddy_invite_seen/);
  assert.match(sql, /revoke execute on function public\.meletee_buddy_code_try\(uuid\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /'meletee_buddy_code_try\(uuid\)'/, 'never in the grant list');
  assert.doesNotMatch(fn('meletee_buddy_invite_preview'), /\bstable\b/);
  // 5) blocks hide both sides in rooms
  assert.match(fn('meletee_buddy_room_state'), /status = 'blocked'/);
  assert.equal((fn('meletee_buddy_overview').match(/status = 'blocked'/g) || []).length >= 3, true);
  // 8) size caps
  assert.match(sql, /meletee_kv_value_size check \(char_length\(value\) <= 1000000\)/);
  assert.match(sql, /meletee_snapshots_size check \(pg_column_size\(data\) <= 5000000\)/);
  assert.match(sql, /create trigger meletee_snapshots_cap before insert or update/);
});
