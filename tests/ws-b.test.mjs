// Unit tests for the pure helpers behind the group-b workspaces (src/workspaces/b-core.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/workspaces/b-core.js';

test('words are normalised across languages', () => {
  assert.deepEqual(c.words('Élan, ÉTÉ!'), ['elan', 'ete']);
  assert.deepEqual(c.words('Ο κυτταρικός κύκλος'), ['ο', 'κυτταρικοσ', 'κυκλοσ']);
  assert.deepEqual(c.words('Ёжик идёт'), ['ежик', 'идет']);
  assert.deepEqual(c.keyWords('The cell and the DNA'), ['cell', 'dna']);
});

test('similar word forms match, unrelated ones do not', () => {
  assert.ok(c.sameWord('phase', 'phases'));
  assert.ok(c.sameWord('checkpoint', 'checkpoints'));
  assert.ok(c.sameWord('клетка', 'клетки'));
  assert.ok(!c.sameWord('mitosis', 'meiosis'));
  assert.ok(!c.sameWord('dna', 'dnase'));
});

test('lines drop bullets and numbering', () => {
  assert.deepEqual(c.lines('- one\n\n2. two\n• three\n  four  '), ['one', 'two', 'three', 'four']);
});

test('blank-page check finds, half-finds and misses key points', () => {
  const dump = 'The cell grows in G1. Then DNA gets copied in S phase. Mitosis splits the nucleus.';
  const r = c.checkPoints(dump, 'G1: the cell grows\nS phase: DNA is copied\nCheckpoints stop damaged cells\nCytokinesis splits the cell');
  assert.deepEqual(r.map((x) => x.status), ['found', 'found', 'gap', 'partial']);
  assert.deepEqual(c.coverage(r), { found: 2, total: 4, pct: 50 });
  assert.equal(c.coverage([]), null);
});

test('growth compares with the previous dump on the same topic', () => {
  const dumps = [
    { id: 'c', title: 'Cell cycle', at: '2026-10-08T10:00:00Z' },
    { id: 'b', title: 'Krebs', at: '2026-10-07T10:00:00Z' },
    { id: 'a', title: 'cell  cycle'.replace('  ', ' '), at: '2026-10-01T10:00:00Z' },
  ];
  assert.equal(c.previousOf(dumps, dumps[0]).id, 'a');
  assert.equal(c.previousOf(dumps, dumps[2]), null);
});

test('jargon flags long words, marked words and the built-in list, minus ignored ones', () => {
  const text = 'Photosynthesis is a mechanism. Plants utilize light. The chlorophyll is green.';
  const f = c.jargon(text, { lang: 'en', marked: ['chlorophyll'] });
  assert.deepEqual(f.map((x) => [x.key, x.why]), [['photosynthesis', 'long'], ['mechanism', 'list'], ['utilize', 'list'], ['chlorophyll', 'marked']]);
  const g = c.jargon(text, { lang: 'en', ignore: ['photosynthesis', 'mechanism', 'utilize'] });
  assert.deepEqual(g, []);
  assert.equal(c.jargon('Ο μηχανισμός είναι απλός', { lang: 'el' })[0].why, 'list');
});

test('long sentences are flagged', () => {
  const long = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ') + '.';
  const out = c.longSentences(`Short one. ${long} Another short.`);
  assert.equal(out.length, 1);
  assert.equal(out[0].words, 25);
  assert.equal(c.sentences('Πώς; Έτσι.').length, 2);
});

test('teach cards skip empty fields and keep order', () => {
  const cards = c.teachCards({ title: 'Ser vs estar', audience: 'Ana', points: ['Ser: identity', '', 'Estar: state'], example: '', question: 'Why está muerto?', confusions: '' });
  assert.deepEqual(cards.map((x) => x.kind), ['title', 'point', 'point', 'question']);
  assert.equal(cards[2].n, 3);
  assert.ok(c.lessonReady({ title: 'x', points: ['a'] }));
  assert.ok(!c.lessonReady({ title: '', points: ['a'] }));
  assert.ok(!c.lessonReady({ title: 'x', points: ['', ' '] }));
});

test('self-explanation steps keep explanations when edited, and summarise', () => {
  const s = c.toSteps('a = 1\nb = 2\nc = 3');
  s[0].why = 'given';
  s[1].stuck = true;
  const edited = c.toSteps('a = 1\nnew step\nb = 2\nc = 3', s);
  assert.equal(edited[0].why, 'given');
  assert.equal(edited[2].stuck, true);
  const sum = c.summarize(edited);
  assert.deepEqual([sum.total, sum.explained, sum.stuck, sum.empty], [4, 1, 1, 2]);
  assert.deepEqual(sum.open.map((o) => o.n), [2, 3, 4]);
});

test('clock and stroke compaction', () => {
  assert.equal(c.clock(0), '0:00');
  assert.equal(c.clock(605), '10:05');
  assert.equal(c.clock(-3), '0:00');
  const acts = [{ t: 'pen', p: [0, 0] }, { t: 'clear' }, { t: 'pen', p: [1, 1] }, { t: 'erase', p: [] }];
  assert.deepEqual(c.compact(acts), [{ t: 'pen', p: [1, 1] }]);
});
