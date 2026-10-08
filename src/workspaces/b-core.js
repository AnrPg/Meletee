// Pure helpers for the group-b workspaces (blank, feynman, teach, selfexp, dual).
// No DOM, no storage: everything here is unit-tested in tests/ws-b.test.mjs.

// ---------- words ----------
// Lower-case, strip accents (Greek tonos, French accents, Russian ё), fold final sigma.
export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ς/g, 'σ');
}

export function words(text) {
  return norm(text).match(/[\p{L}\p{N}]+/gu) || [];
}

// Small stop-word lists (already normalised) so "the", "και", "и", "le" never count as key words.
const STOP = new Set(`
the a an and or of to in on at for with is are was were be been by as it its this that these those from into than then so but not no
do does did has have had can will would which who what when where how why there their they them he she we you your our also very
le la les un une des et ou de du au aux en dans sur pour par avec est sont ce cet cette ces qui que quoi se sa son ses il elle ils elles
ne pas plus mais donc car leur leurs nous vous on y a l d s c n qu j m t
ο η το οι τα του τησ των τον την τουσ τισ και σε στο στη στην στον στα στουσ στισ με για απο ειναι που να θα δεν ενα μια ενασ μιασ
ωσ αλλα ή η αν οτι αυτο αυτη αυτοσ αυτα εχει εχουν πιο πολυ
и в во на с со к ко по из за от до о об обо а но или не что это как для у же ли бы то так его ее их он она они оно мы вы ты я при
`.trim().split(/\s+/));

export const isStop = (w) => STOP.has(w);

export function keyWords(text) {
  return words(text).filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
}

// Two words "match" when equal or when they share a long common start
// (phase/phases, клетка/клетки, mitochondrion/mitochondria).
export function sameWord(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  let cp = 0;
  while (cp < a.length && cp < b.length && a[cp] === b[cp]) cp++;
  return cp >= 4 && cp >= Math.min(a.length, b.length) - 2;
}

// ---------- lines ----------
// One item per line; bullets and numbering are dropped.
export function lines(text) {
  return String(text ?? '').split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–·▪>]+|\d+[.)]|[a-z][.)])\s+/i, '').trim())
    .filter(Boolean);
}

// ---------- blank-page recall ----------
// For each key point: which of its key words appear in the dump?
// Scores are weighted by word length. status: 'found' (most words there), 'partial' (some), 'gap' (few or none).
export function checkPoints(dump, pointsText, { found = 0.6, partial = 0.3 } = {}) {
  const have = [...new Set(keyWords(dump))];
  const inDump = (w) => have.some((d) => sameWord(d, w));
  return lines(pointsText).map((point) => {
    const kws = [...new Set(keyWords(point))];
    const hit = kws.filter(inDump);
    const miss = kws.filter((w) => !hit.includes(w));
    // Longer words weigh more: "cytokinesis" matters more than "cell".
    const weight = (ws) => ws.reduce((n, w) => n + Math.min(w.length, 12), 0);
    const score = kws.length ? weight(hit) / weight(kws) : 0;
    const status = kws.length && score >= found ? 'found' : score >= partial && hit.length ? 'partial' : 'gap';
    return { point, status, score, hit, miss };
  });
}

export function coverage(results) {
  if (!results?.length) return null;
  const n = results.filter((r) => r.status === 'found').length;
  return { found: n, total: results.length, pct: Math.round((n / results.length) * 100) };
}

// The most recent earlier dump on the same topic (same normalised title), for "growth".
export function previousOf(dumps, dump) {
  const k = norm(dump.title).trim();
  return dumps
    .filter((d) => d.id !== dump.id && norm(d.title).trim() === k && d.at < dump.at)
    .sort((a, b) => b.at.localeCompare(a.at))[0] || null;
}

// ---------- feynman ----------
export const LONG_SENTENCE = 20;
const LONG_WORD = { en: 12, fr: 12, el: 13, ru: 13 };
// A few words that usually hide an explanation. Normalised; matched with sameWord.
export const JARGON = {
  en: ['utilize', 'paradigm', 'mechanism', 'facilitate', 'framework', 'aforementioned', 'respectively', 'thereby', 'hence', 'furthermore', 'moreover', 'optimal', 'leverage', 'methodology', 'parameter', 'homeostasis', 'equilibrium', 'synthesis', 'inherent', 'whereby'],
  fr: ['paradigme', 'mecanisme', 'faciliter', 'optimal', 'parametre', 'methodologie', 'homeostasie', 'equilibre', 'synthese', 'neanmoins', 'corollaire', 'inherent', 'susmentionne', 'respectivement'],
  el: ['μηχανισμοσ', 'παραδειγμα', 'συνθεση', 'παραμετροσ', 'μεθοδολογια', 'ομοιοσταση', 'ισορροπια', 'βελτιστοσ', 'συνεπωσ', 'επομενωσ', 'εγγενησ', 'αντιστοιχα', 'προαναφερθεισ'],
  ru: ['механизм', 'парадигма', 'синтез', 'параметр', 'методология', 'гомеостаз', 'равновесие', 'оптимальный', 'следовательно', 'вышеупомянутый', 'соответственно', 'посредством', 'имманентный'],
};

export function sentences(text) {
  return String(text ?? '').split(/(?<=[.!?;…;])\s+|\n+/u).map((s) => s.trim()).filter(Boolean);
}

export function longSentences(text, max = LONG_SENTENCE) {
  return sentences(text).map((s) => ({ text: s, words: words(s).length })).filter((s) => s.words > max);
}

// Gentle jargon flags: very long words, words the learner marked, and a small built-in list.
// `ignore` holds words the learner said are fine. Returns [{ word, why }] in text order, unique.
export function jargon(text, { lang = 'en', marked = [], ignore = [] } = {}) {
  const limit = LONG_WORD[lang] || 12;
  const builtIn = JARGON[lang] || [];
  const mk = marked.map(norm);
  const ig = new Set(ignore.map(norm));
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu) || []) {
    const w = norm(raw);
    if (seen.has(w) || ig.has(w)) continue;
    const why = mk.some((m) => m === w || sameWord(m, w)) ? 'marked'
      : builtIn.some((b) => sameWord(b, w)) ? 'list'
      : [...w].filter((c) => /\p{L}/u.test(c)).length >= limit ? 'long' : null;
    if (why) { seen.add(w); out.push({ word: raw, key: w, why }); }
  }
  return out;
}

// ---------- teach ----------
// The cards shown one at a time in "teach it" mode; empty fields are skipped.
export function teachCards(lesson) {
  const cards = [];
  if (lesson.title?.trim()) cards.push({ kind: 'title', text: lesson.title.trim(), sub: lesson.audience?.trim() || '' });
  (lesson.points || []).forEach((p, i) => { if (p?.trim()) cards.push({ kind: 'point', n: i + 1, text: p.trim() }); });
  if (lesson.example?.trim()) cards.push({ kind: 'example', text: lesson.example.trim() });
  if (lesson.question?.trim()) cards.push({ kind: 'question', text: lesson.question.trim() });
  if (lesson.confusions?.trim()) cards.push({ kind: 'confusions', text: lesson.confusions.trim() });
  return cards;
}

export function lessonReady(lesson) {
  return (lesson.points || []).filter((p) => p?.trim()).length >= 1 && !!lesson.title?.trim();
}

// ---------- self-explanation ----------
export function toSteps(text, old = []) {
  return lines(text).map((s, i) => {
    const prev = old.find((o) => o.text === s) || (old[i]?.text === s ? old[i] : null);
    return { text: s, why: prev?.why || '', stuck: !!prev?.stuck };
  });
}

export function stepState(step) {
  if (step.stuck) return 'stuck';
  return step.why?.trim() ? 'explained' : 'empty';
}

export function summarize(steps) {
  const out = { total: steps.length, explained: 0, stuck: 0, empty: 0, open: [] };
  steps.forEach((s, i) => {
    const st = stepState(s);
    out[st]++;
    if (st !== 'explained') out.open.push({ n: i + 1, text: s.text, state: st });
  });
  return out;
}

// ---------- timers ----------
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- sketches ----------
// Stroke actions: { t: 'pen'|'erase', p: [x0,y0,x1,y1,...] } in units of the canvas width,
// or { t: 'clear' }. Only what is visible after the last clear needs to be kept.
export function compact(actions) {
  let start = 0;
  actions.forEach((a, i) => { if (a.t === 'clear') start = i + 1; });
  return actions.slice(start).filter((a) => a.p?.length);
}
