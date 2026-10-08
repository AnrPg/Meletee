// Pure logic for the shared question deck (group a workspaces: recall, srs,
// interleave, pretest, relearn). No DOM, no storage: everything here takes plain
// data and returns new data, so it can be unit-tested in node.
//
// Card shape (close to noema-lite flashcards):
//   { id, q, a, topic: { courseId, topicId } | null, created: 'YYYY-MM-DD',
//     box: 1..6, due: 'YYYY-MM-DD', seen, right, wrong }
import { iso, addDays } from '../core/dates.js';

// Leitner boxes: a card in box n waits BOX_DAYS[n - 1] days after a correct answer.
export const BOX_DAYS = [1, 2, 4, 8, 16, 32];
// Successive relearning: gaps after session 1, 2, 3, 4+ (the last one repeats).
export const RELEARN_GAPS = [1, 3, 7, 14];
export const RESULTS = ['missed', 'partly', 'got'];

export const uid = (p = 'k') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function newCard({ q, a, topic = null }, today = iso()) {
  return { id: uid('k'), q: String(q).trim(), a: String(a).trim(), topic: topic || null, created: today, box: 1, due: today, seen: 0, right: 0, wrong: 0 };
}

// "question | answer" per line (a tab works too). Lines without both halves are skipped.
export function parseLines(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.split(/\s*[|\t]\s*/);
    if (m.length < 2) continue;
    const q = m[0].trim();
    const a = m.slice(1).join(' | ').trim();
    if (q && a) out.push({ q, a });
  }
  return out;
}

// Practice without touching the schedule: just keep the tallies.
export function record(card, result) {
  return {
    ...card,
    seen: (card.seen || 0) + 1,
    right: (card.right || 0) + (result === 'got' ? 1 : 0),
    wrong: (card.wrong || 0) + (result === 'missed' ? 1 : 0),
  };
}

// Leitner step. got: up one box; partly: same box; missed: back to box 1, due tomorrow.
export function schedule(card, result, today = iso()) {
  const box = Math.min(Math.max(card.box || 1, 1), BOX_DAYS.length);
  const next = result === 'got' ? Math.min(box + 1, BOX_DAYS.length) : result === 'missed' ? 1 : box;
  const wait = result === 'missed' ? 1 : BOX_DAYS[next - 1];
  return { ...record(card, result), box: next, due: addDays(today, wait) };
}

export const isDue = (card, today = iso()) => !card.due || card.due <= today;
export const dueCards = (cards, today = iso()) => cards.filter((c) => isDue(c, today));

// How many cards fall due on each of the next n days (overdue ones count for today).
export function upcoming(cards, today = iso(), n = 7) {
  const days = Array.from({ length: n }, (_, i) => ({ date: addDays(today, i), count: 0 }));
  for (const c of cards) {
    const d = !c.due || c.due < today ? today : c.due;
    const slot = days.find((x) => x.date === d);
    if (slot) slot.count++;
  }
  return days;
}

export function boxCounts(cards) {
  const out = BOX_DAYS.map(() => 0);
  for (const c of cards) out[Math.min(Math.max(c.box || 1, 1), BOX_DAYS.length) - 1]++;
  return out;
}

// answers: [{ result, sure: true | false | null }]
export function summary(answers) {
  const s = { total: answers.length, got: 0, partly: 0, missed: 0, confidentWrong: 0 };
  for (const x of answers) {
    if (s[x.result] != null) s[x.result]++;
    if (x.sure === true && x.result === 'missed') s.confidentWrong++;
  }
  return s;
}

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A stable key for "which topic is this card about". '' means no topic.
export const topicKey = (ref) => (ref ? `${ref.courseId}|${ref.topicId || ''}` : '');
export const keyToRef = (key) => {
  if (!key) return null;
  const [courseId, topicId] = key.split('|');
  return { courseId, topicId: topicId || null };
};

export function groupByTopic(cards) {
  const m = new Map();
  for (const c of cards) {
    const k = topicKey(c.topic);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(c);
  }
  return m;
}

export function inTopic(cards, ref) {
  if (!ref) return cards;
  return cards.filter((c) => c.topic && c.topic.courseId === ref.courseId && (!ref.topicId || c.topic.topicId === ref.topicId));
}

// A mixed set from the chosen topic keys: an even share from each, shuffled so that
// (where possible) no two neighbours share a topic.
export function mixedSet(cards, keys, max = 12, rand = Math.random) {
  const groups = groupByTopic(cards);
  const pools = keys.map((k) => shuffle(groups.get(k) || [], rand)).filter((p) => p.length);
  const picked = [];
  for (let round = 0; picked.length < max && pools.some((p) => p.length > round); round++) {
    for (const p of pools) if (p[round] && picked.length < max) picked.push(p[round]);
  }
  return spreadOut(shuffle(picked, rand));
}

function spreadOut(list) {
  const a = [...list];
  for (let i = 1; i < a.length; i++) {
    if (topicKey(a[i].topic) !== topicKey(a[i - 1].topic)) continue;
    const j = a.findIndex((c, n) => n > i && topicKey(c.topic) !== topicKey(a[i - 1].topic));
    if (j > 0) [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- successive relearning ----------
// A set: { id, name, cardIds, sessions: ['YYYY-MM-DD'], next: 'YYYY-MM-DD' | null, created }
export function newRelearnSet(name, cardIds, today = iso()) {
  return { id: uid('r'), name: String(name).trim(), cardIds: [...cardIds], sessions: [], next: today, created: today };
}

export function finishRelearnSession(set, today = iso()) {
  const sessions = [...set.sessions, today];
  const gap = RELEARN_GAPS[Math.min(sessions.length - 1, RELEARN_GAPS.length - 1)];
  return { ...set, sessions, next: addDays(today, gap) };
}

// One run: keep asking until every card was correct once (the criterion).
export const startRun = (ids) => ({ queue: [...ids], done: [], tries: Object.fromEntries(ids.map((id) => [id, 0])) });
export function runAnswer(run, id, correct) {
  const queue = run.queue.filter((x) => x !== id);
  const tries = { ...run.tries, [id]: (run.tries[id] || 0) + 1 };
  return correct ? { queue, done: [...run.done, id], tries } : { queue: [...queue, id], done: run.done, tries };
}
export const runFinished = (run) => run.queue.length === 0;

// ---------- pretesting ----------
// { id, topic, items: [{ id, q, guess, a, surprised }], stage: 'guess' | 'locked' | 'done', created, lockedAt }
export function newPretest(topic, questions, today = iso()) {
  return {
    id: uid('p'), topic: topic || null, created: today, lockedAt: null, stage: 'guess',
    items: questions.filter((x) => x && String(x.q || '').trim()).map((x) => ({ id: uid('i'), q: String(x.q).trim(), a: x.a ? String(x.a).trim() : '', guess: '', surprised: false })),
  };
}
export const lockPretest = (p, today = iso()) => ({ ...p, stage: 'locked', lockedAt: today });
