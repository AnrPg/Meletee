// A noema-lite subject pack -> a Meletee course (pure; unit-tested with tests/fixtures/noema-pack.json).
// Pack shape (noema-lite library/subjects/<id>/pack.json, format "noema-pack" v1):
//   { subject: { id, title, emoji, … }, chapters: [{ id, num, title, emoji, sections: [{ id, title, hook }],
//     exercises: [{ id, section }], flashcards: [{ q, a, section }], debug: [{ id, section }], pitfalls: [] }], version }
import { uid } from '../core/study.js';
import { cardKey } from './ids.js';

export function isPack(p) {
  return !!(p && p.subject?.id && Array.isArray(p.chapters) && p.chapters.every((c) => c.id && Array.isArray(c.sections)));
}

// A small outline kept on the course: enough for links, "what next" and the review queue without the pack.
export function outline(pack) {
  return pack.chapters.map((c) => ({
    id: c.id, num: c.num, title: c.title, emoji: c.emoji || '',
    sections: c.sections.map((s) => ({ id: s.id, title: s.title, ex: (c.exercises || []).filter((e) => e.section === s.id).length })),
    exercises: (c.exercises || []).length,
    cards: (c.flashcards || []).length,
    playbooks: (c.debug || []).length,
    pitfalls: (c.pitfalls || []).length,
  }));
}

export function counts(pack) {
  const ch = pack.chapters;
  const sum = (f) => ch.reduce((a, c) => a + (c[f] || []).length, 0);
  return { chapters: ch.length, sections: sum('sections'), exercises: sum('exercises'), flashcards: sum('flashcards'), playbooks: sum('debug'), pitfalls: sum('pitfalls') };
}

// 'chapter' for big subjects keeps the topic list calm; 'section' when it stays short.
export function defaultMode(pack) { return counts(pack).sections > 40 ? 'chapter' : 'section'; }

export function topicsFor(pack, mode = defaultMode(pack)) {
  const subject = pack.subject.id;
  const out = [];
  for (const c of pack.chapters) {
    if (mode === 'chapter') {
      out.push({ title: `${c.num}. ${c.title}`, noema: { subject, chapter: c.id, section: null } });
    } else {
      c.sections.forEach((s, j) => out.push({ title: `${c.num}.${j + 1} ${s.title}`, noema: { subject, chapter: c.id, section: s.id } }));
    }
  }
  return out;
}

const tkey = (n) => `${n.chapter}|${n.section || ''}`;

// New course, or an update of one imported before: Meletee progress on existing topics is kept,
// new chapters/sections are added, topics of your own stay.
export function importCourse(pack, { mode, existing = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!isPack(pack)) throw new Error('not a noema-lite pack');
  mode = mode || existing?.noema?.mode || defaultMode(pack);
  const fresh = topicsFor(pack, mode);
  const course = existing ? { ...existing } : { id: uid('c'), name: pack.subject.title, examDate: null, sources: [], topics: [], createdAt: today };
  const old = new Map((course.topics || []).filter((t) => t.noema?.subject === pack.subject.id).map((t) => [tkey(t.noema), t]));
  const topics = [];
  for (const f of fresh) {
    const prev = old.get(tkey(f.noema));
    topics.push(prev ? { ...prev, noema: f.noema } : { id: uid('t'), title: f.title, stages: {}, reviewStep: 0, studiedAt: null, noema: f.noema });
    old.delete(tkey(f.noema));
  }
  // keep your own topics and old noema topics that already carry progress
  for (const t of course.topics || []) {
    if (!t.noema || t.noema.subject !== pack.subject.id) topics.push(t);
    else if (old.has(tkey(t.noema)) && (t.studiedAt || Object.values(t.stages || {}).some(Boolean))) topics.push(t);
  }
  const spine = `noema-lite · ${pack.subject.title}`;
  course.sources = [...(course.sources || []).filter((s) => s.kind !== 'spine'), { kind: 'spine', title: spine }];
  course.topics = topics;
  course.noema = {
    subject: pack.subject.id, title: pack.subject.title, emoji: pack.subject.emoji || '📘', version: pack.version || null,
    mode, importedAt: today, counts: counts(pack), outline: outline(pack),
  };
  return course;
}

// Everything a workspace may want from one topic: exercises, cards (with their progress keys), playbooks, pitfalls.
export function material(pack, n) {
  const c = pack.chapters.find((x) => x.id === n.chapter);
  if (!c) return { exercises: [], cards: [], playbooks: [], pitfalls: [] };
  const inSec = (x) => !n.section || x.section === n.section;
  return {
    exercises: (c.exercises || []).filter(inSec),
    cards: (c.flashcards || []).map((f, i) => ({ ...f, key: cardKey(c.id, f, i) })).filter(inSec),
    playbooks: (c.debug || []).filter(inSec),
    pitfalls: n.section ? (c.pitfalls || []).filter((p) => !p.section || p.section === n.section) : (c.pitfalls || []),
  };
}
