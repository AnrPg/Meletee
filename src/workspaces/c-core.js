// Pure logic for the group-c workspaces (practice, why, examples, notes, memory).
// No DOM, no storage: everything here is unit-tested in tests/ws-c.test.mjs.

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- practice ----------

// Error causes, in the order they are offered. Kept as plain ids so a grader
// (phase 4) can fill them in.
export const CAUSES = ['unknown', 'misread', 'careless', 'time', 'reasoning'];

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

// A practice set: { id, topic, ref?, source, attempted, right, date }.
export function makeSet({ topic = '', ref = null, source = '', attempted = 0, right = 0, date = '' } = {}) {
  const a = Math.max(0, Math.round(Number(attempted) || 0));
  const r = Math.min(a, Math.max(0, Math.round(Number(right) || 0)));
  return { id: uid('ps'), topic: String(topic).trim(), ref, source: String(source).trim(), attempted: a, right: r, date };
}

// Per-topic accuracy, weakest first. Topics with no attempts are left out.
export function topicStats(sets) {
  const by = new Map();
  for (const s of sets || []) {
    if (!s || !(s.attempted > 0)) continue;
    const k = norm(s.topic);
    const cur = by.get(k) || { topic: String(s.topic || '').trim(), attempted: 0, right: 0, sets: 0, last: '' };
    cur.attempted += s.attempted;
    cur.right += Math.min(s.right || 0, s.attempted);
    cur.sets += 1;
    if ((s.date || '') > cur.last) cur.last = s.date || '';
    by.set(k, cur);
  }
  return [...by.values()]
    .map((x) => ({ ...x, accuracy: x.right / x.attempted }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted || a.topic.localeCompare(b.topic));
}

export const pct = (x) => Math.round((x || 0) * 100);

// An error-log entry, shaped like noema-lite's grader output.
export function makeError({ topic = '', ref = null, question = '', myAnswer = '', correct = '', cause = null, lesson = '', date = '', score, missing, mistakes } = {}) {
  const e = {
    id: uid('er'), topic: String(topic).trim(), ref, question: String(question).trim(), myAnswer: String(myAnswer).trim(),
    correct: String(correct).trim(), cause: CAUSES.includes(cause) ? cause : null, lesson: String(lesson).trim(), date,
  };
  if (score != null) e.score = score;
  if (missing != null) e.missing = missing;
  if (mistakes != null) e.mistakes = mistakes;
  return e;
}

// How many errors per cause, biggest first; untagged errors are counted as "none".
export function causeBreakdown(errors) {
  const counts = Object.fromEntries(CAUSES.map((c) => [c, 0]));
  let none = 0;
  for (const e of errors || []) {
    if (e && CAUSES.includes(e.cause)) counts[e.cause] += 1;
    else none += 1;
  }
  const total = (errors || []).length;
  const rows = CAUSES.map((cause) => ({ cause, n: counts[cause], share: total ? counts[cause] / total : 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || CAUSES.indexOf(a.cause) - CAUSES.indexOf(b.cause));
  return { total, none, rows };
}

// ---------- why ----------

export const WHY_DEPTH = 5;

// A chain: { id, fact, ref?, levels: [{ answer, gap, found? }], closed, createdAt }.
export function chainState(chain) {
  const levels = chain?.levels || [];
  const last = levels[levels.length - 1];
  const done = !!chain?.closed || levels.length >= WHY_DEPTH || !!last?.gap;
  return { depth: levels.filter((l) => !l.gap).length, done, next: done ? null : levels.length + 1 };
}

// Everything the learner couldn't answer, across all chains, still open first.
export function lookups(chains) {
  const out = [];
  for (const c of chains || []) {
    (c.levels || []).forEach((l, i) => {
      if (l.gap) out.push({ chainId: c.id, level: i, fact: c.fact, about: i === 0 ? c.fact : c.levels[i - 1].answer, found: l.found || '' });
    });
  }
  return out.sort((a, b) => Number(!!a.found) - Number(!!b.found));
}

// ---------- examples ----------

export const EXAMPLE_KINDS = ['everyday', 'course', 'non'];

export function exampleProgress(idea) {
  const ex = idea?.examples || [];
  const kinds = new Set(ex.map((e) => e.kind));
  return { count: ex.length, kinds: kinds.size, enough: ex.length >= 2 && kinds.size >= 2 };
}

// ---------- notes ----------

// Paste a syllabus → a clean list of objectives (bullets and numbering removed).
export function parseLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·–—]|\d+[.)]|[a-z][.)])\s+/i, '').trim())
    .filter(Boolean);
}

// A concept map as an indented outline. nodes: [{ id, label, links: [{ to, rel }] }].
// Roots are nodes nothing points to (or the first node, if everything is in a cycle).
// A node met a second time is shown once more as a reference, not expanded again.
export function mapOutline(nodes) {
  const list = nodes || [];
  const byId = new Map(list.map((n) => [n.id, n]));
  const pointed = new Set();
  for (const n of list) for (const l of n.links || []) if (byId.has(l.to) && l.to !== n.id) pointed.add(l.to);
  let roots = list.filter((n) => !pointed.has(n.id));
  const seen = new Set();
  const out = [];
  const walk = (n, depth, rel) => {
    if (seen.has(n.id)) { out.push({ id: n.id, label: n.label, depth, rel, ref: true }); return; }
    seen.add(n.id);
    out.push({ id: n.id, label: n.label, depth, rel, ref: false });
    for (const l of n.links || []) { const to = byId.get(l.to); if (to) walk(to, depth + 1, l.rel || ''); }
  };
  for (const r of roots) walk(r, 0, '');
  // whatever is left sits in a cycle with no entry point
  for (const n of list) if (!seen.has(n.id)) walk(n, 0, '');
  return out;
}

// Comparison table helpers: grid is { cols: [..], rows: [{ label, cells: [..] }] }.
export function tableAddCol(g, name = '') {
  return { cols: [...g.cols, name], rows: g.rows.map((r) => ({ ...r, cells: [...r.cells, ''] })) };
}
export function tableAddRow(g, label = '') {
  return { cols: [...g.cols], rows: [...g.rows, { label, cells: g.cols.map(() => '') }] };
}
export function tableDelCol(g, i) {
  return { cols: g.cols.filter((_, j) => j !== i), rows: g.rows.map((r) => ({ ...r, cells: r.cells.filter((_, j) => j !== i) })) };
}
export function tableDelRow(g, i) {
  return { cols: [...g.cols], rows: g.rows.filter((_, j) => j !== i) };
}

// ---------- memory ----------

// First letters of each item ("Olfactory" → "O"), skipping leading punctuation.
export function initials(items) {
  return (items || []).map((s) => {
    const m = String(s).trim().match(/[\p{L}\p{N}]/u);
    return m ? m[0].toUpperCase() : '';
  }).filter(Boolean);
}

// Split pasted text into items. A long number (with optional spaces or dashes)
// becomes single digits; anything else splits on new lines, commas or semicolons.
export function chunkItems(text) {
  const s = String(text || '').trim();
  if (!s) return { digits: false, items: [] };
  if (/^[\d\s\-.]+$/.test(s) && !/[\n,;]/.test(s)) return { digits: true, items: s.replace(/\D/g, '').split('') };
  const parts = s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 1 && /\s/.test(parts[0])) return { digits: false, items: parts[0].split(/\s+/) };
  return { digits: false, items: parts };
}

// Group sizes for n items: about `size` per group (3–5), as even as possible,
// never leaving a lonely group of one or two behind.
export function groupSizes(n, size = 4) {
  if (n <= 0) return [];
  size = Math.min(5, Math.max(3, size));
  if (n <= 5) return [n];
  let k = Math.ceil(n / size);
  const split = (k) => Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
  let sizes = split(k);
  while (k > 1 && Math.min(...sizes) < 3) { k -= 1; sizes = split(k); }
  return sizes;
}

export function chunk(items, size = 4) {
  const out = [];
  let i = 0;
  for (const s of groupSizes(items.length, size)) { out.push(items.slice(i, i + s)); i += s; }
  return out;
}

// Memory palace quiz: score a walk-through.
export function walkScore(results) {
  const got = (results || []).filter(Boolean).length;
  return { got, total: (results || []).length };
}
