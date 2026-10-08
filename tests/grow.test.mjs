// Unit tests for the Grow area's pure logic (src/grow/*).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../src/grow/activity.js';
import * as G from '../src/grow/garden.js';
import * as L from '../src/grow/lab.js';
import * as R from '../src/grow/reflect.js';
import * as W from '../src/grow/wins.js';
import { INSIGHTS, insightOfDay } from '../src/grow/insights.js';

const set = (...d) => new Set(d);

test('activity merges sessions, studied topics, reviews, recalls, workspaces, lab ratings and done items', () => {
  const days = A.activity({
    today: '2026-10-08',
    sessions: [{ date: '2026-10-05', minutes: 25 }, { date: '2026-10-05', minutes: 50 }, { date: '2026-10-09', minutes: 25 }],
    courses: [{ topics: [
      { studiedAt: '2026-10-06', reviewLog: [] },
      { studiedAt: '2026-10-20', reviewLog: [{ date: '2026-10-07', rating: 'ok' }] }, // studiedAt moved by a hard review: ignored
    ] }],
    recalls: [{ date: '2026-10-08', text: 'x' }],
    wsDays: ['2026-10-04'],
    lab: [{ sessions: [{ date: '2026-10-03' }] }],
    wins: [{ kind: 'done', date: '2026-10-02' }, { kind: 'win', date: '2026-10-01' }],
  });
  assert.deepEqual([...days.keys()].sort(), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  assert.equal(days.get('2026-10-05').focus, 2);
  assert.equal(days.get('2026-10-05').minutes, 75);
  assert.equal(days.has('2026-10-09'), false, 'future days never count');
});

test('workspace data: past dates are found, future keys are skipped', () => {
  const out = A.datesInData({ cards: [{ createdAt: '2026-10-01', due: '2026-10-03' }], log: [{ at: '2026-10-02T10:00:00.000Z' }], next: '2026-10-04', name: '2026-10-05' }, '2026-10-08');
  assert.ok(out.has('2026-10-01'));
  assert.ok(out.has('2026-10-02') || out.has('2026-10-03')); // local date of the timestamp
  assert.ok(!out.has('2026-10-04'));
  assert.ok(!out.has('2026-10-05'), 'only date-like keys are read');
  assert.equal(A.dayOf(42), null);
});

test('forgiving streak: 5 of 7 days makes a week count', () => {
  // Week of Mon 28 Sep: 5 days. Week of Mon 21 Sep: 6 days. Week of 14 Sep: 4 days.
  const s = set('2026-09-28', '2026-09-29', '2026-09-30', '2026-10-02', '2026-10-04',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
    '2026-10-05', '2026-10-06');
  const r = A.forgivingStreak(s, '2026-10-08'); // Thursday
  assert.equal(r.count, 2);
  assert.equal(r.met, false);
  assert.equal(r.need, 3);
  assert.equal(r.reachable, true); // Thu (today), Fri, Sat, Sun left
  assert.equal(r.streak, 2, 'two good weeks before this one; this week is still in progress and does not break it');
  assert.equal(r.total, 2);
  assert.equal(r.todayIndex, 3);
  assert.deepEqual(r.studied, [true, true, false, false, false, false, false]);
});

test('forgiving streak: current week counts once met, and an unreachable week is a fresh start, not a failure', () => {
  const met = A.forgivingStreak(set('2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'), '2026-10-09');
  assert.equal(met.met, true);
  assert.equal(met.streak, 1);
  const late = A.forgivingStreak(set('2026-10-10'), '2026-10-10'); // Saturday, 1 day
  assert.equal(late.reachable, false);
  assert.equal(late.streak, 0);
});

test('light points only add up', () => {
  const days = A.activity({ today: '2026-10-08', sessions: [{ date: '2026-10-08', minutes: 50 }], recalls: [{ date: '2026-10-08' }] });
  const base = A.points({ days });
  assert.equal(base, 2 + 2 + 1);
  const more = A.points({ days, lab: [{ decision: 'keep', sessions: [] }], wins: [{ kind: 'win' }], reflections: { '2026-W41': { done: 'x' } }, calm: { worries: 1 } });
  assert.equal(more, base + 3 + 1 + 3 + 1);
});

test('garden stages grow with points and draw more plants', () => {
  assert.equal(G.stageFor(0).stage, 0);
  assert.equal(G.stageFor(4).stage, 0);
  assert.equal(G.stageFor(5).stage, 1);
  assert.equal(G.stageFor(10).progress, 0.5);
  assert.equal(G.stageFor(99999).max, true);
  assert.equal(G.plants(0).length, 0);
  assert.equal(G.plants(4).length, 4);
  assert.equal(G.plants(7)[0].level, 3);
  const a = G.gardenSvg({ stage: 0, label: 'a "garden"' });
  assert.match(a, /g-seed/);
  assert.match(a, /&quot;garden&quot;/);
  const b = G.gardenSvg({ stage: 10, sunny: true });
  assert.match(b, /g-tree/);
  assert.match(b, /g-sun/);
  assert.equal((b.match(/g-fly/g) || []).length, 2);
});

test('method lab: rate now, recall next day, summary and the keep/tweak/drop rule', () => {
  let e = L.newExperiment({ method: 'blank-page-recall-brain-dump', days: 14, today: '2026-10-01', id: 'e1' });
  assert.equal(L.endDate(e), '2026-10-14');
  assert.equal(L.dayNumber(e, '2026-10-03'), 3);
  for (let i = 0; i < 5; i++) e = L.rate(e, { enjoy: 4, focus: 4, effort: 5, date: `2026-10-0${i + 1}`, id: `s${i}` });
  assert.equal(L.pendingRecall(e, '2026-10-02').id, 's0');
  assert.equal(L.pendingRecall(e, '2026-10-01'), null, 'same-day sessions wait until tomorrow');
  for (let i = 0; i < 5; i++) e = L.rateRecall(e, `s${i}`, 4);
  const s = L.summary(e, '2026-10-06');
  assert.equal(s.sessions, 5);
  assert.equal(s.enough, true);
  assert.equal(s.averages.recall, 4);
  assert.equal(s.suggestion, 'keep');
  assert.equal(L.suggest({ recall: 4, enjoy: 2 }), 'tweak');
  assert.equal(L.suggest({ recall: 2, enjoy: 4 }), 'dropWarmup');
  assert.equal(L.suggest({ recall: 2, enjoy: 2 }), 'drop');
  assert.equal(L.suggest({ recall: null, enjoy: 2 }), null);
  assert.equal(L.rate(e, { enjoy: 9 }).sessions.at(-1).enjoy, 5, 'ratings are clamped to 1-5');
  assert.equal(L.needsDecision(e, '2026-10-15'), true);
  assert.equal(L.isActive(e, '2026-10-06'), true);
});

test('method lab: compare and the "my methods" profile', () => {
  const mk = (id, method, recall, enjoy, decision, contentType = null) => ({
    ...L.newExperiment({ method, id, contentType, today: '2026-10-01' }),
    sessions: [{ id: 'a', date: '2026-10-01', recall, enjoy, focus: 3, effort: 3 }], decision, decidedAt: decision ? '2026-10-10' : null,
  });
  const a = mk('a', 'blank-page-recall-brain-dump', 4, 4, 'keep', 'facts');
  const b = mk('b', L.BASELINE, 2, 4, 'drop');
  const c = L.compare(a, b);
  assert.equal(c.diff.recall, 2);
  assert.equal(c.better, 'a');
  const p = L.profile([a, b, mk('c', 'dual-coding', 4, 2, 'tweak'), mk('d', 'interleaving', 3, 3, null)]);
  assert.equal(p.count, 3);
  assert.deepEqual(p.keep.map((x) => x.method), ['blank-page-recall-brain-dump']);
  assert.deepEqual(Object.keys(p.byType), ['facts']);
  assert.deepEqual(L.untried([a, b], ['dual-coding', 'blank-page-recall-brain-dump']), ['dual-coding']);
});

test('weekly reflection uses ISO weeks', () => {
  assert.equal(R.weekKey('2026-10-08'), '2026-W41');
  assert.equal(R.weekKey('2027-01-01'), '2026-W53');
  assert.equal(R.weekKey('2024-12-30'), '2025-W01');
  assert.equal(R.weekMonday('2026-W41'), '2026-10-05');
  assert.equal(R.weekMonday('2025-W01'), '2024-12-30');
  const past = R.pastWeeks({ '2026-W41': { done: 'now' }, '2026-W39': { change: 'x' }, '2026-W40': { done: ' ' } }, '2026-W41');
  assert.deepEqual(past.map((w) => w.key), ['2026-W39']);
});

test('done list: add, today, archive by week', () => {
  let l = [];
  l = W.addItem(l, { text: '  30 cards ', date: '2026-10-08', id: '1' });
  l = W.addItem(l, { text: '', date: '2026-10-08' });
  l = W.addItem(l, { text: 'Essay plan', kind: 'win', date: '2026-10-02', id: '2' });
  l = W.addItem(l, { text: 'Lecture 3', date: '2026-10-06', id: '3' });
  assert.equal(l.length, 3);
  assert.deepEqual(W.todays(l, '2026-10-08').map((x) => x.text), ['30 cards']);
  const arch = W.archive(l, '2026-10-08');
  assert.deepEqual(arch.map((g) => g.week), ['2026-10-05', '2026-09-28']);
  assert.equal(W.toggleWin(l, '1').find((x) => x.id === '1').kind, 'win');
  assert.equal(W.removeItem(l, '1').length, 2);
  assert.equal(W.thisWeek(l, '2026-10-08').length, 2);
});

test('insight of the day: stable within a day, changes across days, every insight translated', () => {
  assert.equal(insightOfDay('2026-10-08').n, insightOfDay('2026-10-08').n);
  const seen = new Set(Array.from({ length: INSIGHTS.length }, (_, i) => insightOfDay(`2026-11-${String(i + 1).padStart(2, '0')}`).n));
  assert.ok(seen.size >= INSIGHTS.length - 2);
  assert.ok(INSIGHTS.length >= 30);
  const index = JSON.parse(readFileSync(new URL('../content/en/index.json', import.meta.url)));
  const ids = new Set(index.sections.flatMap((s) => s.items.map((i) => i.id)));
  for (const i of INSIGHTS) assert.ok(ids.has(i.item), `insight ${i.n} links to a real item: ${i.item}`);
});

test('grow bundles: identical keys in all four languages, plurals complete, French spacing', () => {
  const load = (l) => JSON.parse(readFileSync(new URL(`../i18n/grow.${l}.json`, import.meta.url)));
  const en = load('en');
  const keys = Object.keys(en).sort();
  for (const l of ['el', 'ru', 'fr']) assert.deepEqual(Object.keys(load(l)).sort(), keys, l);
  for (const k of keys.filter((x) => x.endsWith('.other'))) {
    const base = k.slice(0, -6);
    for (const f of ['one', 'few', 'many']) assert.ok(`${base}.${f}` in en, `${base}.${f}`);
  }
  for (const n of INSIGHTS) assert.ok(`grow.insight.${n.n}` in en);
  for (const [k, v] of Object.entries(load('fr'))) assert.doesNotMatch(v, / [;:!?]/, `fr ${k} needs a non-breaking space`);
});
