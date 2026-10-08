// Unit tests for the pure scheduling helpers in src/core/study.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../src/core/study.js';

const topic = (extra = {}) => ({ id: 't1', title: 'Krebs cycle', stages: {}, reviewStep: 0, studiedAt: null, ...extra });

test('a topic is not scheduled until it is studied', () => {
  assert.equal(s.nextReview(topic()), null);
  assert.equal(s.isDue(topic(), '2026-10-08'), false);
});

test('reviews land 1, 3, 7, 14 and 30 days after first study', () => {
  let t = s.markStudied(topic(), '2026-10-01');
  const seen = [];
  for (let i = 0; i < 5; i++) { seen.push(s.nextReview(t)); t = s.review(t, 'ok', s.nextReview(t)); }
  assert.deepEqual(seen, ['2026-10-02', '2026-10-04', '2026-10-08', '2026-10-15', '2026-10-31']);
  assert.equal(s.nextReview(t), null);
  assert.equal(t.stages.reviews, true);
});

test('a hard review repeats the same step tomorrow', () => {
  let t = s.markStudied(topic(), '2026-10-01');
  t = s.review(t, 'ok', '2026-10-02');            // step 1, due 10-04
  t = s.review(t, 'hard', '2026-10-04');
  assert.equal(t.reviewStep, 1);
  assert.equal(s.nextReview(t), '2026-10-05');
  t = s.review(t, 'ok', '2026-10-05');
  assert.equal(t.reviewStep, 2);
});

test('due list puts the latest first; review load counts overdue on day one', () => {
  const courses = [{ id: 'c', name: 'Bio', topics: [
    s.markStudied(topic({ id: 'a' }), '2026-10-01'),
    s.markStudied(topic({ id: 'b' }), '2026-10-05'),
    s.markStudied(topic({ id: 'c' }), '2026-10-07'),
  ] }];
  const due = s.dueList(courses, '2026-10-06');
  assert.deepEqual(due.map((d) => d.topic.id), ['a', 'b']);
  const load = s.reviewLoad(courses, '2026-10-06', 7);
  assert.equal(load[0].count, 2);
  assert.equal(load[2].count, 1);
});

test('term pace keeps a spare week before the exam', () => {
  const c = { examDate: '2026-11-05', topics: Array.from({ length: 12 }, (_, i) => topic({ id: String(i) })) };
  const p = s.termPace(c, '2026-10-08');
  assert.equal(p.days, 28);
  assert.equal(p.weeks, 3);
  assert.equal(p.perWeek, 4);
  assert.equal(s.termPace({ topics: [] }), null);
});
