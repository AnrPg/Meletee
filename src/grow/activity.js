// Pure helpers: which days had real study, the forgiving 5-of-7 streak and light points.
// Nothing here touches storage; src/grow/data.js gathers the inputs.
import { iso, addDays, weekStart, diffDays } from '../core/dates.js';

const DAY = /^(\d{4}-\d{2}-\d{2})/;
const FUTURE_KEYS = new Set(['due', 'next', 'nextDue', 'examDate', 'deadline', 'until', 'end', 'ends', 'endsAt']);

// Local 'YYYY-MM-DD' for a date string or ms timestamp, or null.
export function dayOf(v) {
  if (typeof v === 'number' && v > 1e12 && v < 1e14) return iso(new Date(v));
  if (typeof v !== 'string') return null;
  const m = v.match(DAY);
  if (!m) return null;
  if (v.length > 10 && v[10] === 'T') { const d = new Date(v); return isNaN(d) ? m[1] : iso(d); }
  return m[1];
}

// Walk a workspace's saved JSON and collect the past days it mentions
// (createdAt, at, date…), skipping keys that point to the future (due, next…).
export function datesInData(value, today = iso(), out = new Set(), depth = 0) {
  if (depth > 8 || value == null) return out;
  if (Array.isArray(value)) { for (const v of value.slice(-2000)) datesInData(v, today, out, depth + 1); return out; }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FUTURE_KEYS.has(k)) continue;
      if (typeof v === 'string' || typeof v === 'number') {
        if (!/^(date|day|at|created|createdAt|updated|updatedAt|lockedAt|doneAt|savedAt|ts|when|last|lastAt|startedAt|finishedAt)$/i.test(k)) continue;
        const d = dayOf(v);
        if (d && d <= today) out.add(d);
      } else datesInData(v, today, out, depth + 1);
    }
  }
  return out;
}

// Everything that counts as studying, per day.
// input: { sessions, courses, recalls, wsDays: Set|Array, lab: experiments, wins: items, today }
export function activity({ sessions = [], courses = [], recalls = [], wsDays = [], lab = [], wins = [], today = iso() } = {}) {
  const days = new Map();
  const at = (d) => {
    if (!d || d > today) return null;
    if (!days.has(d)) days.set(d, { focus: 0, minutes: 0, studied: 0, reviews: 0, recalls: 0, ws: 0, rated: 0, done: 0 });
    return days.get(d);
  };
  for (const s of sessions) { const x = at(s.date); if (x) { x.focus++; x.minutes += s.minutes || 0; } }
  for (const c of courses) for (const t of c.topics || []) {
    // studiedAt moves after a "hard" review, so only trust it when no review exists yet
    if (t.studiedAt && !(t.reviewLog || []).length) { const x = at(t.studiedAt); if (x) x.studied++; }
    for (const r of t.reviewLog || []) { const x = at(r.date); if (x) x.reviews++; }
  }
  for (const r of recalls) { const x = at(r.date); if (x) x.recalls++; }
  for (const d of wsDays) { const x = at(d); if (x) x.ws++; }
  for (const e of lab) for (const s of e.sessions || []) { const x = at(s.date); if (x) x.rated++; }
  for (const w of wins) if (w.kind === 'done') { const x = at(w.date); if (x) x.done++; }
  return days;
}

export const studiedDays = (days) => new Set([...days.keys()]);

// A week counts when you studied on 5 of its 7 days (Monday to Sunday).
export const WEEK_GOAL = 5;

export function weekCount(set, start, until = null) {
  let n = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(start, i); if (until && d > until) break; if (set.has(d)) n++; }
  return n;
}

export function forgivingStreak(set, today = iso()) {
  const start = weekStart(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const count = weekCount(set, start, today);
  const left = 7 - (diffDays(today, start) + 1); // days after today
  const need = Math.max(0, WEEK_GOAL - count);
  const reachable = need <= left + (set.has(today) ? 0 : 1);
  let streak = 0;
  let w = addDays(start, -7);
  for (let i = 0; i < 104 && weekCount(set, w) >= WEEK_GOAL; i++) { streak++; w = addDays(w, -7); }
  const met = count >= WEEK_GOAL;
  let total = 0;
  const first = [...set].sort()[0];
  if (first) for (let s = weekStart(first); s <= start; s = addDays(s, 7)) if (weekCount(set, s) >= WEEK_GOAL) total++;
  return {
    dates, studied: dates.map((d) => set.has(d)), todayIndex: dates.indexOf(today),
    count, need, met, reachable, streak: streak + (met ? 1 : 0), total, studiedToday: set.has(today),
  };
}

// Light points: they only ever add up, nothing is ever taken away.
export const POINTS = { focus: 2, per25: 1, studied: 2, review: 1, recall: 1, ws: 2, rated: 1, done: 1, decided: 3, reflection: 3, calm: 1, win: 1 };

export function points({ days = new Map(), lab = [], wins = [], reflections = {}, calm = {} } = {}) {
  let p = 0;
  for (const x of days.values()) {
    p += x.focus * POINTS.focus + Math.floor(x.minutes / 25) * POINTS.per25 + x.studied * POINTS.studied
      + x.reviews * POINTS.review + x.recalls * POINTS.recall + (x.ws ? POINTS.ws : 0) + x.rated * POINTS.rated + x.done * POINTS.done;
  }
  p += lab.filter((e) => e.decision).length * POINTS.decided;
  p += wins.filter((w) => w.kind === 'win').length * POINTS.win;
  p += Object.values(reflections).filter((r) => r && (r.done || r.slipped || r.change)).length * POINTS.reflection;
  p += Math.min(200, (calm.worries || 0) + (calm.breaths || 0)) * POINTS.calm;
  return p;
}
