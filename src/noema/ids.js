// noema-lite ids and links (pure; unit-tested).
// Ids in a noema-lite pack: chapter ch05, section ch05-s03, exercise ch05-e012, playbook ch05-d01.
// Flashcards have no id yet: noema-lite keys their progress by position, `ch05#3` (engine/src/50_sources.js).
// A pack that gives cards a stable `id` is used as is (docs/NOEMA.md, change 2).

export function parseId(id) {
  const s = String(id || '');
  let m = s.match(/^(ch\d+)$/);
  if (m) return { kind: 'chapter', chapter: m[1], id: s };
  m = s.match(/^(ch\d+)-s(\d+)$/);
  if (m) return { kind: 'section', chapter: m[1], n: +m[2], id: s };
  m = s.match(/^(ch\d+)-e(\d+)$/);
  if (m) return { kind: 'exercise', chapter: m[1], n: +m[2], id: s };
  m = s.match(/^(ch\d+)-d(\d+)$/);
  if (m) return { kind: 'playbook', chapter: m[1], n: +m[2], id: s };
  m = s.match(/^(ch\d+)#(\d+)$/);
  if (m) return { kind: 'card', chapter: m[1], n: +m[2], id: s };
  m = s.match(/^(ch\d+)-f(\d+)$/);
  if (m) return { kind: 'card', chapter: m[1], n: +m[2], id: s };
  return { kind: 'unknown', chapter: (s.match(/^(ch\d+)/) || [])[1] || null, id: s };
}

export const chapterOf = (id) => parseId(id).chapter;

// The progress key of a flashcard, exactly as noema-lite computes it.
export function cardKey(chapterId, card, index) { return card?.id || card?._key || `${chapterId}#${index}`; }

// Keys of the shared review queue: noema:<subject>:<kind>:<id>
export function queueKey(subject, kind, id) { return `noema:${subject}:${kind}:${id}`; }

export function topicKey(n) {
  if (!n?.subject) return null;
  return n.section ? queueKey(n.subject, 'section', n.section) : queueKey(n.subject, 'chapter', n.chapter);
}

// Deep links into noema-lite. target: { section } | { chapter, tab } | { practice } | { cards, chapter? } | { mistakes } | { exercise, section? }
// caps: what this noema-lite supports (a:caps); without `exerciseRoute`, an exercise opens its section or chapter practice.
export function link(base, subject, target = {}, caps = {}) {
  const root = `${String(base || '').replace(/\/+$/, '')}/?subject=${encodeURIComponent(subject)}`;
  const e = encodeURIComponent;
  if (target.exercise) {
    if (caps.exerciseRoute) return `${root}#/ex/${e(target.exercise)}`;
    if (target.section) return `${root}#/s/${e(target.section)}`;
    return `${root}#/practice/${e(chapterOf(target.exercise))}`;
  }
  if (target.section) return `${root}#/s/${e(target.section)}`;
  if (target.practice) return `${root}#/practice/${e(target.practice)}`;
  if (target.cards) return target.chapter ? `${root}#/ch/${e(target.chapter)}/cards` : `${root}#/cards`;
  if (target.mistakes) return `${root}#/mistakes`;
  if (target.chapter) return `${root}#/ch/${e(target.chapter)}${target.tab ? '/' + e(target.tab) : ''}`;
  return `${root}#/`;
}
