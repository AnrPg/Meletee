// noema-lite progress -> summaries, "what next" and the shared review queue (pure; unit-tested).
// Progress lives in noema_kv under `s:<subject>:state` (noema-lite engine/src/10_core.js):
//   { xp, read: { sectionId: true }, res: { exerciseId: { n, ok, last, t } }, fc: { cardKey: { box, due } },
//     pb: { playbookId: { box, due } }, boss: { chapterId: true }, last }
import { chapterOf, queueKey, topicKey, parseId } from './ids.js';
import { isDue, nextReview } from '../core/study.js';

export function parseState(v) {
  if (!v) return null;
  try { const s = typeof v === 'string' ? JSON.parse(v) : v; return s && typeof s === 'object' ? { read: {}, res: {}, fc: {}, pb: {}, boss: {}, ...s } : null; } catch { return null; }
}

const dueBy = (rec, today) => !!rec?.due && rec.due <= today;

// Subjects the person has in noema-lite: the public library + imported packs (a:packmeta:<id>) + anything
// with progress (s:<id>:state). Your own names (a:subjoverride:<id>) win.
export function buildSubjects({ registry = null, rows = [] } = {}) {
  const map = new Map();
  for (const s of registry?.subjects || []) {
    if (s.owner) continue;
    map.set(s.id, { id: s.id, title: s.title, emoji: s.emoji || '📘', description: s.description || '', language: s.language || null, counts: s.counts || null, version: s.version || null, origin: 'library' });
  }
  const states = {};
  const overrides = {};
  for (const r of rows) {
    let m = r.key.match(/^a:packmeta:(.+)$/);
    if (m) {
      try {
        const p = JSON.parse(r.value);
        const prev = map.get(m[1]) || {};
        map.set(m[1], { ...prev, id: m[1], title: p.title || prev.title || m[1], emoji: p.emoji || prev.emoji || '📘', description: p.description || prev.description || '', counts: p.counts || prev.counts || null, version: p.version || prev.version || null,
          origin: prev.origin || 'imported', publicOwner: p.publicOwner || null, sharedBy: p.sharedBy || null });
      } catch { /* bad row */ }
      continue;
    }
    m = r.key.match(/^s:(.+):state$/);
    if (m) { states[m[1]] = parseState(r.value); continue; }
    m = r.key.match(/^a:subjoverride:(.+)$/);
    if (m) { try { overrides[m[1]] = JSON.parse(r.value); } catch { /* bad row */ } }
  }
  for (const id of Object.keys(states)) if (!map.has(id)) map.set(id, { id, title: id, emoji: '📘', description: '', counts: null, origin: 'unknown' });
  const list = [...map.values()].map((s) => {
    const o = overrides[s.id] || {};
    const st = states[s.id] || null;
    return { ...s, ...(o.title ? { title: o.title } : {}), ...(o.emoji ? { emoji: o.emoji } : {}), state: st, progress: summary(st, s.counts) };
  });
  // yours first (with progress), then the rest alphabetically
  return list.sort((a, b) => (b.progress.touched - a.progress.touched) || a.title.localeCompare(b.title));
}

export function summary(state, counts = null, today = new Date().toISOString().slice(0, 10)) {
  const s = parseState(state) || { read: {}, res: {}, fc: {}, pb: {} };
  const read = Object.values(s.read).filter(Boolean).length;
  const solved = Object.values(s.res).filter((r) => r?.ok > 0).length;
  const mistakes = Object.values(s.res).filter((r) => r?.last === false).length;
  const cardsDue = Object.values(s.fc).filter((r) => dueBy(r, today)).length;
  const playbooksDue = Object.values(s.pb).filter((r) => dueBy(r, today)).length;
  const touched = read + Object.keys(s.res).length + Object.keys(s.fc).length > 0 ? 1 : 0;
  const share = counts?.sections ? Math.min(1, read / counts.sections) : 0;
  return { read, solved, mistakes, cardsDue, playbooksDue, touched, share };
}

// Per-chapter numbers from a state (cards and mistakes are only known per chapter without the pack).
export function byChapter(state, today) {
  const s = parseState(state) || { res: {}, fc: {}, pb: {}, read: {} };
  const out = {};
  const at = (ch) => (out[ch] ||= { cards: 0, mistakes: 0, playbooks: 0, read: 0 });
  for (const [k, r] of Object.entries(s.fc)) if (dueBy(r, today)) { const ch = chapterOf(k); if (ch) at(ch).cards++; }
  for (const [k, r] of Object.entries(s.pb)) if (dueBy(r, today)) { const ch = chapterOf(k); if (ch) at(ch).playbooks++; }
  for (const [k, r] of Object.entries(s.res)) if (r?.last === false) { const ch = chapterOf(k); if (ch) at(ch).mistakes++; }
  for (const [k, v] of Object.entries(s.read)) if (v) { const ch = chapterOf(k); if (ch) at(ch).read++; }
  return out;
}

// One suggestion: what to do next for an imported subject.
// -> { kind: 'review'|'cards'|'mistakes'|'read'|'practice'|'start'|'done', chapter?, section?, title?, count?, topicId? }
export function whatNext({ course, state, today = new Date().toISOString().slice(0, 10) }) {
  const o = course?.noema?.outline || [];
  const s = parseState(state);
  const due = (course?.topics || []).filter((t) => t.noema && isDue(t, today));
  if (due.length) return { kind: 'review', count: due.length, topicId: due[0].id, title: due[0].title };
  if (!s) return o[0]?.sections[0] ? { kind: 'start', chapter: o[0].id, section: o[0].sections[0].id, title: o[0].sections[0].title } : { kind: 'done' };
  const sum = summary(s, null, today);
  const chs = byChapter(s, today);
  const top = (f) => Object.entries(chs).sort((a, b) => b[1][f] - a[1][f])[0];
  if (sum.cardsDue >= 5) return { kind: 'cards', count: sum.cardsDue, chapter: top('cards')?.[0] || null };
  if (sum.mistakes >= 3) return { kind: 'mistakes', count: sum.mistakes, chapter: top('mistakes')?.[0] || null };
  for (const c of o) for (const sec of c.sections) if (!s.read[sec.id]) return { kind: 'read', chapter: c.id, section: sec.id, title: sec.title };
  // everything read: practise the chapter with the fewest solved exercises
  let best = null;
  for (const c of o) {
    if (!c.exercises) continue;
    const ok = Object.entries(s.res).filter(([k, r]) => chapterOf(k) === c.id && r?.ok > 0).length;
    const ratio = ok / c.exercises;
    if (ratio < 0.8 && (!best || ratio < best.ratio)) best = { ratio, chapter: c.id, title: c.title };
  }
  if (best) return { kind: 'practice', chapter: best.chapter, title: best.title };
  if (sum.cardsDue) return { kind: 'cards', count: sum.cardsDue, chapter: top('cards')?.[0] || null };
  if (sum.mistakes) return { kind: 'mistakes', count: sum.mistakes, chapter: top('mistakes')?.[0] || null };
  return { kind: 'done' };
}

// The shared review queue, keyed by noema-lite ids. One list for Meletee's spaced topic reviews and
// noema-lite's due flashcards, playbooks and open mistakes, so nothing is reviewed twice.
// states: { subjectId: state }   -> [{ key, subject, chapter, section, courseId, topicId, title, review, due, cards, mistakes, playbooks }]
export function sharedQueue({ courses = [], states = {}, today = new Date().toISOString().slice(0, 10) }) {
  const items = new Map();
  const add = (key, base) => { if (!items.has(key)) items.set(key, { key, review: false, due: null, cards: 0, mistakes: 0, playbooks: 0, ...base }); return items.get(key); };
  for (const c of courses) {
    if (!c.noema?.subject) continue;
    const subject = c.noema.subject;
    const chTitle = Object.fromEntries((c.noema.outline || []).map((x) => [x.id, `${x.num}. ${x.title}`]));
    const firstTopic = {};
    for (const t of c.topics || []) {
      if (t.noema?.subject !== subject) continue;
      if (!firstTopic[t.noema.chapter] || !t.noema.section) firstTopic[t.noema.chapter] = t;
      if (isDue(t, today)) add(topicKey(t.noema), { subject, chapter: t.noema.chapter, section: t.noema.section || null, courseId: c.id, topicId: t.id, title: t.title, course: c.name }).review = true;
      const it = items.get(topicKey(t.noema)); if (it) it.due = nextReview(t);
    }
    for (const [ch, n] of Object.entries(byChapter(states[subject], today))) {
      if (!n.cards && !n.mistakes && !n.playbooks) continue;
      const t = firstTopic[ch];
      const key = t && !t.noema.section ? topicKey(t.noema) : queueKey(subject, 'chapter', ch);
      const it = add(key, { subject, chapter: ch, section: null, courseId: c.id, topicId: t && !t.noema.section ? t.id : null, title: chTitle[ch] || ch, course: c.name });
      it.cards += n.cards; it.mistakes += n.mistakes; it.playbooks += n.playbooks;
    }
  }
  const weight = (i) => (i.review ? 1000 : 0) + i.mistakes * 2 + i.cards + i.playbooks;
  return [...items.values()].sort((a, b) => weight(b) - weight(a) || a.key.localeCompare(b.key));
}

export { parseId };
