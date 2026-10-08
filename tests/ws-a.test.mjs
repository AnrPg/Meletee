// Unit tests for the shared deck logic (src/workspaces/deck-core.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../src/workspaces/deck-core.js';

const T = '2026-10-08';
const card = (extra = {}) => ({ ...d.newCard({ q: 'Q', a: 'A' }, T), ...extra });

test('new cards match the noema-lite-like shape and are due today', () => {
  const c = d.newCard({ q: '  Capital of Peru? ', a: ' Lima ', topic: { courseId: 'c1', topicId: 't1' } }, T);
  assert.deepEqual(Object.keys(c).sort(), ['a', 'box', 'created', 'due', 'id', 'q', 'right', 'seen', 'topic', 'wrong']);
  assert.equal(c.q, 'Capital of Peru?');
  assert.equal(c.a, 'Lima');
  assert.equal(c.box, 1);
  assert.equal(c.due, T);
  assert.ok(d.isDue(c, T));
});

test('parseLines reads "question | answer" lines and skips the rest', () => {
  const rows = d.parseLines('Capital of Peru? | Lima\n\njust a note\nH2O\twater\n | empty\nA | B | C');
  assert.deepEqual(rows, [{ q: 'Capital of Peru?', a: 'Lima' }, { q: 'H2O', a: 'water' }, { q: 'A', a: 'B | C' }]);
});

test('Leitner: right moves up a box, partly stays, missed goes back to box 1 for tomorrow', () => {
  let c = card();
  c = d.schedule(c, 'got', T);
  assert.equal(c.box, 2);
  assert.equal(c.due, '2026-10-10');
  c = d.schedule(c, 'got', T);
  assert.equal(c.box, 3);
  assert.equal(c.due, '2026-10-12');
  c = d.schedule(c, 'partly', T);
  assert.equal(c.box, 3);
  c = d.schedule(c, 'missed', T);
  assert.equal(c.box, 1);
  assert.equal(c.due, '2026-10-09');
  assert.deepEqual([c.seen, c.right, c.wrong], [4, 2, 1]);
  let top = card({ box: 6 });
  top = d.schedule(top, 'got', T);
  assert.equal(top.box, 6);
  assert.equal(top.due, '2026-11-09');
});

test('upcoming counts overdue cards today and ignores far-off ones', () => {
  const cards = [card({ due: '2026-10-01' }), card({ due: T }), card({ due: '2026-10-10' }), card({ due: '2026-12-01' })];
  const u = d.upcoming(cards, T, 7);
  assert.equal(u.length, 7);
  assert.deepEqual(u.map((x) => x.count), [2, 0, 1, 0, 0, 0, 0]);
  assert.equal(d.dueCards(cards, T).length, 2);
  assert.deepEqual(d.boxCounts([card(), card({ box: 3 }), card({ box: 3 })]), [1, 0, 2, 0, 0, 0]);
});

test('summary counts confident-but-wrong answers', () => {
  const s = d.summary([{ result: 'got', sure: true }, { result: 'missed', sure: true }, { result: 'missed', sure: false }, { result: 'partly', sure: null }]);
  assert.deepEqual(s, { total: 4, got: 1, partly: 1, missed: 2, confidentWrong: 1 });
});

test('mixedSet takes from every chosen topic and avoids neighbours from the same topic', () => {
  const A = { courseId: 'c', topicId: 'a' };
  const B = { courseId: 'c', topicId: 'b' };
  const cards = [...Array(5)].map(() => card({ topic: A })).concat([...Array(5)].map(() => card({ topic: B })), [card({ topic: null })]);
  const keys = [d.topicKey(A), d.topicKey(B)];
  const set = d.mixedSet(cards, keys, 6);
  assert.equal(set.length, 6);
  assert.equal(set.filter((c) => c.topic?.topicId === 'a').length, 3);
  for (let i = 1; i < set.length; i++) assert.notEqual(d.topicKey(set[i].topic), d.topicKey(set[i - 1].topic));
  assert.deepEqual(d.keyToRef(d.topicKey(A)), A);
  assert.equal(d.inTopic(cards, { courseId: 'c', topicId: null }).length, 10);
});

test('successive relearning runs to criterion, then spaces sessions 1, 3, 7, 14 days', () => {
  let run = d.startRun(['x', 'y']);
  run = d.runAnswer(run, 'x', false);
  assert.deepEqual(run.queue, ['y', 'x']);
  run = d.runAnswer(run, 'y', true);
  assert.equal(d.runFinished(run), false);
  run = d.runAnswer(run, 'x', true);
  assert.ok(d.runFinished(run));
  assert.deepEqual(run.tries, { x: 2, y: 1 });

  let s = d.newRelearnSet('Trig', ['x', 'y'], T);
  const nexts = [];
  let day = T;
  for (let i = 0; i < 5; i++) { s = d.finishRelearnSession(s, day); nexts.push(s.next); day = s.next; }
  assert.deepEqual(nexts, ['2026-10-09', '2026-10-12', '2026-10-19', '2026-11-02', '2026-11-16']);
  assert.equal(s.sessions.length, 5);
});

test('pretests keep questions, start in the guess stage and lock', () => {
  const p = d.newPretest(null, [{ q: 'Why?' }, { q: '  ' }, { q: 'What?', a: 'That' }], T);
  assert.equal(p.items.length, 2);
  assert.equal(p.stage, 'guess');
  assert.equal(p.items[1].a, 'That');
  const l = d.lockPretest(p, T);
  assert.equal(l.stage, 'locked');
  assert.equal(l.lockedAt, T);
});
