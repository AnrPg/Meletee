import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSet, topicStats, makeError, causeBreakdown, chainState, lookups, exampleProgress,
  parseLines, mapOutline, tableAddCol, tableAddRow, tableDelCol, tableDelRow,
  initials, chunkItems, groupSizes, chunk, walkScore,
} from '../src/workspaces/c-core.js';

test('makeSet clamps numbers', () => {
  const s = makeSet({ topic: ' Optics ', attempted: '10', right: '12', date: '2026-10-08' });
  assert.equal(s.topic, 'Optics');
  assert.equal(s.attempted, 10);
  assert.equal(s.right, 10);
});

test('topicStats merges topics case-insensitively and puts the weakest first', () => {
  const stats = topicStats([
    { topic: 'Optics', attempted: 10, right: 9, date: '2026-10-01' },
    { topic: 'thermo', attempted: 10, right: 4, date: '2026-10-02' },
    { topic: 'optics ', attempted: 10, right: 7, date: '2026-10-03' },
    { topic: 'Empty', attempted: 0, right: 0 },
  ]);
  assert.deepEqual(stats.map((s) => s.topic), ['thermo', 'Optics']);
  assert.equal(stats[1].attempted, 20);
  assert.equal(stats[1].right, 16);
  assert.equal(stats[1].sets, 2);
  assert.equal(stats[1].last, '2026-10-03');
});

test('makeError keeps the grader shape and drops unknown causes', () => {
  const e = makeError({ topic: 'Stats', question: 'p?', myAnswer: 'a', correct: 'b', cause: 'weird', lesson: 'x', date: '2026-10-08', score: 0.5 });
  assert.deepEqual(Object.keys(e).sort(), ['cause', 'correct', 'date', 'id', 'lesson', 'myAnswer', 'question', 'ref', 'score', 'topic'].sort());
  assert.equal(e.cause, null);
  assert.equal(makeError({ cause: 'time' }).cause, 'time');
  assert.equal('missing' in makeError({}), false);
});

test('causeBreakdown counts and sorts', () => {
  const b = causeBreakdown([{ cause: 'time' }, { cause: 'misread' }, { cause: 'time' }, { cause: null }]);
  assert.equal(b.total, 4);
  assert.equal(b.none, 1);
  assert.deepEqual(b.rows.map((r) => [r.cause, r.n]), [['time', 2], ['misread', 1]]);
  assert.equal(b.rows[0].share, 0.5);
});

test('why chains stop at a gap, when closed, or at five levels', () => {
  assert.deepEqual(chainState({ levels: [] }), { depth: 0, done: false, next: 1 });
  assert.equal(chainState({ levels: [{ answer: 'a' }, { gap: true }] }).done, true);
  assert.equal(chainState({ levels: [{ answer: 'a' }, { gap: true }] }).depth, 1);
  assert.equal(chainState({ levels: [{ answer: 'a' }], closed: true }).done, true);
  assert.equal(chainState({ levels: Array(5).fill({ answer: 'a' }) }).done, true);
});

test('lookups list gaps with what they were about, open ones first', () => {
  const l = lookups([
    { id: 'c1', fact: 'F1', levels: [{ gap: true, found: 'yes' }] },
    { id: 'c2', fact: 'F2', levels: [{ answer: 'A1' }, { gap: true }] },
  ]);
  assert.deepEqual(l.map((x) => [x.chainId, x.about]), [['c2', 'A1'], ['c1', 'F1']]);
});

test('exampleProgress needs two examples of different kinds', () => {
  assert.equal(exampleProgress({ examples: [{ kind: 'everyday' }, { kind: 'everyday' }] }).enough, false);
  assert.equal(exampleProgress({ examples: [{ kind: 'everyday' }, { kind: 'non' }] }).enough, true);
});

test('parseLines strips bullets and numbering', () => {
  assert.deepEqual(parseLines('1. Explain A\n - Compare B\n\n• Define C\nb) List D\nPlain'), ['Explain A', 'Compare B', 'Define C', 'List D', 'Plain']);
});

test('mapOutline nests links and survives cycles', () => {
  const nodes = [
    { id: 'a', label: 'Insulin', links: [{ to: 'b', rel: 'raises' }] },
    { id: 'b', label: 'Uptake', links: [{ to: 'c', rel: 'lowers' }] },
    { id: 'c', label: 'Sugar', links: [{ to: 'a', rel: 'triggers' }] },
    { id: 'd', label: 'Alone', links: [] },
  ];
  const out = mapOutline(nodes);
  // everything is in a cycle except d, so d is the only root; the cycle is walked after
  assert.deepEqual(out.map((o) => [o.label, o.depth, o.ref]), [['Alone', 0, false], ['Insulin', 0, false], ['Uptake', 1, false], ['Sugar', 2, false], ['Insulin', 3, true]]);
  const tree = mapOutline(nodes.slice(0, 2).map((n) => ({ ...n, links: n.id === 'b' ? [] : n.links })));
  assert.deepEqual(tree.map((o) => [o.label, o.depth, o.rel]), [['Insulin', 0, ''], ['Uptake', 1, 'raises']]);
});

test('table helpers keep cells in step with columns', () => {
  let g = { cols: ['A'], rows: [{ label: 'r', cells: ['1'] }] };
  g = tableAddCol(g, 'B');
  assert.deepEqual(g.rows[0].cells, ['1', '']);
  g = tableAddRow(g);
  assert.deepEqual(g.rows[1], { label: '', cells: ['', ''] });
  g = tableDelCol(g, 0);
  assert.deepEqual(g, { cols: ['B'], rows: [{ label: 'r', cells: [''] }, { label: '', cells: [''] }] });
  assert.equal(tableDelRow(g, 0).rows.length, 1);
});

test('initials take the first letter or digit', () => {
  assert.deepEqual(initials(['olfactory', '  "optic"', 'ήλιος', '', '3 things']), ['O', 'O', 'Ή', '3']);
});

test('chunkItems recognises numbers and lists', () => {
  assert.deepEqual(chunkItems('020 7946-0123'), { digits: true, items: '02079460123'.split('') });
  assert.deepEqual(chunkItems('a, b; c\nd').items, ['a', 'b', 'c', 'd']);
  assert.deepEqual(chunkItems('red green blue').items, ['red', 'green', 'blue']);
  assert.deepEqual(chunkItems('  ').items, []);
});

test('groupSizes stays within 3–5 and never strands a tiny group', () => {
  for (let n = 6; n <= 40; n++) for (const size of [3, 4, 5]) {
    const g = groupSizes(n, size);
    assert.equal(g.reduce((a, b) => a + b, 0), n);
    assert.ok(Math.min(...g) >= 3, `${n}/${size}: ${g}`);
    assert.ok(Math.max(...g) <= 5, `${n}/${size}: ${g}`);
  }
  assert.deepEqual(groupSizes(4), [4]);
  assert.deepEqual(groupSizes(0), []);
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7], 4), [[1, 2, 3, 4], [5, 6, 7]]);
});

test('walkScore counts hits', () => {
  assert.deepEqual(walkScore([true, false, true]), { got: 2, total: 3 });
});
