// Unit tests for the AI layer's pure parts: router, SSE parsing, JSON validation,
// conversation records and prompts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, taskFor, TASKS, vendorOf } from '../src/ai/router.js';
import { sseParser, claudeReducer, geminiText } from '../src/ai/sse.js';
import { check, parseJSON, validate, GRADE, gradeCheck, QUESTIONS, questionsCheck } from '../src/ai/schema.js';
import { normalize, newId, SCHEMA } from '../src/ai/convos.js';
import { groundRules, contextText, systemFor } from '../src/ai/prompts.js';
import { backoff, transient } from '../src/ai/http.js';

test('router: each task goes to its provider, falls back, or to nobody', () => {
  const both = { claude: true, gemini: true };
  assert.equal(route('grade', both), 'gemini');
  assert.equal(route('questions', both), 'gemini');
  assert.equal(route('feynman', both), 'claude');
  assert.equal(route('socratic', both), 'claude');
  assert.equal(route('methodlab', both), 'claude');
  assert.equal(route('feynman', { claude: false, gemini: true }), 'gemini');
  assert.equal(route('grade', { claude: true, gemini: false }), 'claude');
  assert.equal(route('grade', { claude: false, gemini: false }), null);
  assert.equal(route('nope', both), null);
  assert.equal(route('grade', both, 'claude'), 'claude');
  assert.equal(route('feynman', both, 'gemini'), 'gemini');
  assert.equal(route('feynman', { claude: true, gemini: false }, 'gemini'), 'claude');
});

test('router: plan table matches docs/PLAN.md', () => {
  for (const k of ['grade', 'questions', 'hint', 'quiz', 'errors']) assert.equal(TASKS[k].provider, 'gemini', k);
  for (const k of ['feynman', 'teachback', 'why', 'examples', 'examiner', 'methodlab', 'plan', 'socratic']) assert.equal(TASKS[k].provider, 'claude', k);
  assert.equal(vendorOf('claude'), 'anthropic');
  assert.equal(vendorOf('gemini'), 'google');
});

test('router: workspace hook names map to tasks; unknown names render nothing', () => {
  assert.equal(taskFor('practice.grade', 'practice'), 'grade');
  assert.equal(taskFor('notes.cornell', 'notes'), 'socratic');
  assert.equal(taskFor('why.probe', 'why'), 'why');
  assert.equal(taskFor(null, 'feynman'), 'feynman');
  assert.equal(taskFor(null, 'teach'), 'teachback');
  assert.equal(taskFor(null, 'blank'), 'examiner');
  assert.equal(taskFor('memory.image', 'memory'), null);
  assert.equal(taskFor('grade', 'x'), 'grade');
});

test('sse: events split across chunks, CRLF and comments', () => {
  const p = sseParser();
  let out = p.push('event: a\r\ndata: {"x"');
  assert.equal(out.length, 0);
  out = p.push(':1}\r');
  assert.equal(out.length, 0);
  out = p.push('\n\r\n: ping\n\ndata: one\ndata: two\n\n');
  assert.deepEqual(out, [{ event: 'a', data: '{"x":1}' }, { event: 'message', data: 'one\ntwo' }]);
  assert.deepEqual(p.push('data: tail'), []);
  assert.deepEqual(p.flush(), [{ event: 'message', data: 'tail' }]);
});

test('sse: claude reducer collects text, stop reason, refusal and usage', () => {
  const r = claudeReducer();
  r.apply({ type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 4 } } });
  r.apply({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } });
  r.apply({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } });
  r.apply({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } });
  r.apply({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } });
  r.apply({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } });
  assert.equal(r.state.text, 'Hello');
  assert.equal(r.state.stop, 'end_turn');
  assert.equal(r.state.model, 'claude-opus-5-5');
  assert.deepEqual(r.state.usage, { input: 10, output: 7, cacheRead: 4, cacheWrite: 0 });
  const x = claudeReducer();
  x.apply({ type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null } } });
  assert.equal(x.state.stop, 'refusal');
  const e = claudeReducer();
  e.apply({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } });
  assert.equal(e.state.error.type, 'overloaded_error');
  assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: 'a', thought: true }, { text: 'b' }, { text: 'c' }] } }] }), 'bc');
});

test('json: parse with fences, validate the grade schema, catch problems', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Sure! {"a":2} done'), { a: 2 });
  assert.throws(() => parseJSON('nope'));
  const good = { score: 80, verdict: 'Good', covered: ['x'], missing: [], mistakes: [], feedback: 'Nice. Why?' };
  assert.deepEqual(validate(JSON.stringify(good), GRADE, gradeCheck).errors, []);
  const v = validate(JSON.stringify({ ...good, score: 'high', extra: 1 }), GRADE, gradeCheck);
  assert.ok(v.errors.some((e) => e.includes('$.score: expected integer')));
  assert.ok(v.errors.some((e) => e.includes('$.extra: unknown field')));
  assert.deepEqual(validate(JSON.stringify({ ...good, score: 140 }), GRADE, gradeCheck).errors, ['$.score: must be 0-100']);
  const { feedback, ...missing } = good;
  assert.ok(check(GRADE, missing).includes('$.feedback: missing'));
  assert.equal(validate('{"questions":[]}', QUESTIONS, questionsCheck).errors.length, 1);
  assert.deepEqual(validate('{"questions":[{"q":"Q","a":"A"}]}', QUESTIONS, questionsCheck).errors, []);
  assert.equal(validate('not json', GRADE).errors.length, 1);
  // schemas are strict, as Claude structured outputs needs
  assert.equal(GRADE.additionalProperties, false);
  assert.deepEqual(GRADE.required.sort(), ['covered', 'feedback', 'missing', 'mistakes', 'score', 'verdict']);
});

test('conversations: normalise to noema.conversation/v1', () => {
  const r = normalize({
    kind: 'tutor', mode: 'feynman', title: '🧒 Photosynthesis',
    context: { type: 'workspace', id: 'feynman', label: '🧒 Photosynthesis' },
    model: { provider: 'anthropic', name: 'claude-opus-5-5' },
    messages: [{ role: 'user', content: 'hi', meta: { kickoff: true } }, { role: 'model', text: 'Hello!' }],
    meta: { app: 'meletee', task: 'feynman' },
  }, { account: { id: 'local', kind: 'local' } });
  assert.equal(r.schema, SCHEMA);
  assert.match(r.id, /^cv_[0-9a-z]{16}$/);
  assert.equal(r.kind, 'tutor');
  assert.equal(r.mode, 'feynman');
  assert.deepEqual(r.context, { type: 'workspace', id: 'feynman', label: '🧒 Photosynthesis' });
  assert.deepEqual(r.model, { provider: 'anthropic', name: 'claude-opus-5-5' });
  assert.deepEqual(r.account, { id: 'local', kind: 'local' });
  assert.equal(r.messages[1].role, 'assistant');
  assert.equal(r.messages[1].content, 'Hello!');
  assert.equal(r.messages[0].seq, 0);
  assert.deepEqual(r.messages[0].meta, { kickoff: true });
  assert.deepEqual(r.stats, { messages: 2, userMessages: 1, chars: 8 });
  assert.equal(r.deleted, false);
  assert.deepEqual(r.meta, { app: 'meletee', task: 'feynman' });
  const g = normalize({ kind: 'grading', mode: 'socratic', messages: [] });
  assert.equal(g.mode, null);
  assert.equal(normalize({ kind: 'weird' }).kind, 'tutor');
  const del = normalize({ ...r, deleted: true });
  assert.deepEqual(del.messages, []);
  assert.equal(del.id, r.id);
  assert.ok(newId(1) < newId(2));
});

test('prompts: ground rules in the app language; material without pictures', () => {
  assert.match(groundRules('el'), /in Greek/);
  assert.match(groundRules('fr'), /in French/);
  assert.match(groundRules('en'), /never just give the answer/);
  assert.match(groundRules('en'), /tries first/);
  const txt = contextText({ title: 'Cells', png: 'data:image/png;base64,AAA', steps: ['one', 'two'], lesson: { goal: 'teach', id: 'x' } });
  assert.match(txt, /title: Cells/);
  assert.match(txt, /- one\n- two/);
  assert.match(txt, /lesson › goal: teach/);
  assert.doesNotMatch(txt, /base64|id:/);
  const s = systemFor('feynman', 'feynman', 'ru', { text: 'plants eat light' });
  assert.match(s.rules, /Russian/);
  assert.match(s.rules, /Feynman coach/);
  assert.match(s.material, /plants eat light/);
  assert.equal(systemFor('grade', null, 'en', null).material, '');
});

test('retries: backoff honours Retry-After and caps', () => {
  assert.equal(backoff(0), 1000);
  assert.equal(backoff(3), 8000);
  assert.equal(backoff(10), 30000);
  assert.equal(backoff(0, '7'), 7000);
  assert.equal(backoff(0, '900'), 60000);
  assert.ok(transient(429) && transient(529) && transient(503) && !transient(400));
});
