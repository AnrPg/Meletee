// Study data: courses, topics, reviews, focus sessions, today's top 3 and the parking lot.
// Pure helpers are exported separately so they can be unit-tested without a browser.
import * as store from './store.js';
import { iso, addDays, diffDays } from './dates.js';

// Reviews land 1, 3, 7, 14 and 30 days after you first study a topic.
export const REVIEW_OFFSETS = [1, 3, 7, 14, 30];
export const LIFECYCLE = ['pre', 'attend', 'recall', 'cards', 'reviews'];
export const SOURCE_KINDS = ['spine', 'reference', 'videos', 'qbank', 'deck'];
export const PRESETS = [
  { id: '25-5', focus: 25, rest: 5 },
  { id: '50-10', focus: 50, rest: 10 },
  { id: '15-5', focus: 15, rest: 5 },
];

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- pure scheduling ----------
export function nextReview(topic) {
  if (!topic.studiedAt) return null;
  const step = topic.reviewStep || 0;
  if (step >= REVIEW_OFFSETS.length) return null;
  return addDays(topic.studiedAt, REVIEW_OFFSETS[step]);
}

export function isDue(topic, today = iso()) {
  const n = nextReview(topic);
  return !!n && n <= today;
}

export function markStudied(topic, today = iso()) {
  return { ...topic, studiedAt: topic.studiedAt || today, reviewStep: topic.reviewStep || 0, stages: { ...topic.stages, recall: true } };
}

// rating: 'easy' | 'ok' | 'hard'. A hard review repeats the same step tomorrow.
export function review(topic, rating = 'ok', today = iso()) {
  const log = [...(topic.reviewLog || []), { date: today, rating }];
  if (rating === 'hard') {
    // keep the step, but move the anchor so the repeat lands tomorrow
    const offset = REVIEW_OFFSETS[topic.reviewStep || 0];
    return { ...topic, reviewLog: log, studiedAt: addDays(today, 1 - offset) };
  }
  const reviewStep = Math.min((topic.reviewStep || 0) + 1, REVIEW_OFFSETS.length);
  const stages = reviewStep >= REVIEW_OFFSETS.length ? { ...topic.stages, reviews: true } : topic.stages;
  return { ...topic, reviewLog: log, reviewStep, stages };
}

export function dueList(courses, today = iso()) {
  const out = [];
  for (const c of courses) for (const t of c.topics || []) if (isDue(t, today)) out.push({ course: c, topic: t, late: diffDays(today, nextReview(t)) });
  return out.sort((a, b) => b.late - a.late);
}

// How many reviews fall on each of the next n days (for the week view).
export function reviewLoad(courses, from = iso(), n = 7) {
  const load = Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), count: 0 }));
  for (const c of courses) for (const t of c.topics || []) {
    const due = nextReview(t);
    if (!due) continue;
    const i = Math.max(0, diffDays(due, from));
    if (i < n) load[i].count++;
  }
  return load;
}

// Term map: topics left per week until the exam.
export function termPace(course, today = iso()) {
  if (!course.examDate) return null;
  const days = diffDays(course.examDate, today);
  const left = (course.topics || []).filter((t) => !t.studiedAt).length;
  const weeks = Math.max(1, Math.ceil(days / 7) - 1); // keep the last week for revision
  return { days, weeks, left, perWeek: days > 0 ? Math.ceil(left / weeks) : left };
}

export function nearestExam(courses, today = iso()) {
  return courses.filter((c) => c.examDate && c.examDate >= today)
    .map((c) => ({ course: c, days: diffDays(c.examDate, today) }))
    .sort((a, b) => a.days - b.days)[0] || null;
}

// ---------- stored state ----------
export const courses = () => store.get('courses', []);
export const saveCourses = (list) => store.set('courses', list);

export function upsertCourse(course) {
  const list = courses();
  const i = list.findIndex((c) => c.id === course.id);
  i >= 0 ? (list[i] = course) : list.push(course);
  saveCourses(list);
  return course;
}

export function removeCourse(id) { saveCourses(courses().filter((c) => c.id !== id)); }

export function updateTopic(courseId, topicId, fn) {
  const list = courses();
  const c = list.find((x) => x.id === courseId);
  if (!c) return null;
  c.topics = c.topics.map((t) => (t.id === topicId ? fn(t) : t));
  saveCourses(list);
  return c.topics.find((t) => t.id === topicId);
}

export function newCourse(name) {
  return { id: uid('c'), name, examDate: null, sources: [], topics: [], createdAt: iso() };
}

export function newTopic(title) {
  return { id: uid('t'), title, stages: {}, reviewStep: 0, studiedAt: null };
}

// Focus sessions
export const sessions = () => store.get('sessions', []);
export function logSession(s) { store.update('sessions', (l) => [...l, s].slice(-1000), []); }
export function minutesOn(day = iso()) { return sessions().filter((s) => s.date === day).reduce((n, s) => n + (s.minutes || 0), 0); }

// Today's top 3 (resets each day)
export function today() {
  const t = store.get('today', null);
  return t && t.date === iso() ? t : { date: iso(), top3: [] };
}
export function saveToday(t) { store.set('today', t); }

// Parking lot for stray thoughts
export const parking = () => store.get('parking', []);
export function park(text) { store.update('parking', (l) => [{ id: uid('p'), text, at: new Date().toISOString() }, ...l], []); }
export function unpark(id) { store.update('parking', (l) => l.filter((p) => p.id !== id), []); }

// Weekly time blocks: { id, day: 0..6 (Mon..Sun), start: 'HH:MM', minutes, courseId, label }
export const blocks = () => store.get('blocks', []);
export const saveBlocks = (l) => store.set('blocks', l);
