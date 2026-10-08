// Method Lab, pure logic. Follows the compendium's "Finding your method" steps:
// change one thing, give it at least 5 sessions over 1-2 weeks, rate every session
// (enjoyment, focus and effort straight away, recall the next day), then keep, tweak or drop.
import { iso, addDays, diffDays } from '../core/dates.js';

export const BASELINE = 'usual';
export const SCALES = ['recall', 'enjoy', 'focus', 'effort'];
export const NOW_SCALES = ['enjoy', 'focus', 'effort'];
export const MIN_SESSIONS = 5;
export const CONTENT_TYPES = ['facts', 'processes', 'concepts', 'skills'];
export const DECISIONS = ['keep', 'tweak', 'drop'];
const HIGH = 3.5;

export function newExperiment({ method, title = '', courseId = null, contentType = null, days = 14, today = iso(), id } = {}) {
  return {
    id: id || `x_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    method, title, courseId, contentType, days: days === 7 ? 7 : 14,
    start: today, sessions: [], decision: null, decidedAt: null, note: '',
  };
}

export const endDate = (e) => addDays(e.start, e.days - 1);
export const dayNumber = (e, today = iso()) => Math.min(e.days, Math.max(1, diffDays(today, e.start) + 1));
export const isOver = (e, today = iso()) => today > endDate(e);
export const isActive = (e, today = iso()) => !e.decision && !isOver(e, today);
// waiting for a keep / tweak / drop decision
export const needsDecision = (e, today = iso()) => !e.decision && (isOver(e, today) || e.sessions.length >= 10);

const clamp = (v) => (v == null || v === '' ? null : Math.max(1, Math.min(5, Math.round(Number(v)))));

// A quick rating right after a session. Recall is rated later (next day).
export function rate(e, { enjoy, focus, effort, recall = null, minutes = null, date = iso(), id } = {}) {
  const s = {
    id: id || `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    date, enjoy: clamp(enjoy), focus: clamp(focus), effort: clamp(effort), recall: clamp(recall),
    minutes: minutes ? Math.max(1, Math.round(Number(minutes))) : null,
  };
  return { ...e, sessions: [...e.sessions, s] };
}

export function rateRecall(e, sessionId, recall) {
  return { ...e, sessions: e.sessions.map((s) => (s.id === sessionId ? { ...s, recall: clamp(recall) } : s)) };
}

// The oldest session from an earlier day still waiting for its next-day recall rating.
export function pendingRecall(e, today = iso()) {
  return e.sessions.find((s) => s.recall == null && s.date < today) || null;
}

const avg = (xs) => {
  const v = xs.filter((x) => typeof x === 'number');
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

// The compendium's rule (Step 6): keep what scores well on both recall and enjoyment,
// tweak what works but feels boring, drop what you enjoy but can't recall.
export function suggest(a) {
  if (a.recall == null || a.enjoy == null) return null;
  const r = a.recall >= HIGH, j = a.enjoy >= HIGH;
  if (r && j) return 'keep';
  if (r && !j) return 'tweak';
  if (!r && j) return 'dropWarmup';
  return 'drop';
}

// Summary of one experiment. Exported for the optional AI coach too.
export function summary(e, today = iso()) {
  const n = e.sessions.length;
  const averages = Object.fromEntries(SCALES.map((k) => [k, avg(e.sessions.map((s) => s[k]))]));
  const minutes = e.sessions.reduce((m, s) => m + (s.minutes || 0), 0);
  const enough = n >= MIN_SESSIONS;
  return {
    id: e.id, method: e.method, title: e.title, contentType: e.contentType, courseId: e.courseId,
    start: e.start, end: endDate(e), day: dayNumber(e, today), days: e.days,
    sessions: n, enough, left: Math.max(0, MIN_SESSIONS - n), minutes,
    averages, recallRated: e.sessions.filter((s) => s.recall != null).length,
    suggestion: enough ? suggest(averages) : null,
    decision: e.decision, over: isOver(e, today),
  };
}

// Side-by-side comparison of two experiments (for example the usual way vs a new method).
export function compare(a, b) {
  const sa = summary(a), sb = summary(b);
  const diff = Object.fromEntries(SCALES.map((k) => [k, sa.averages[k] != null && sb.averages[k] != null ? Math.round((sa.averages[k] - sb.averages[k]) * 10) / 10 : null]));
  let better = null;
  if (diff.recall != null) better = diff.recall > 0.2 ? a.id : diff.recall < -0.2 ? b.id : null;
  return { a: sa, b: sb, diff, better };
}

// "My methods": the latest decision per method, grouped by decision and by content type.
export function profile(experiments) {
  const latest = new Map();
  for (const e of [...experiments].filter((x) => x.decision).sort((x, y) => (x.decidedAt || '').localeCompare(y.decidedAt || ''))) {
    latest.set(`${e.method}|${e.contentType || ''}`, e);
  }
  const items = [...latest.values()].map((e) => ({ ...summary(e), decision: e.decision, note: e.note || '' }));
  const by = (d) => items.filter((x) => x.decision === d).sort((x, y) => (y.averages.recall || 0) - (x.averages.recall || 0));
  const byType = {};
  for (const x of by('keep')) (byType[x.contentType || 'any'] ||= []).push(x);
  return { keep: by('keep'), tweak: by('tweak'), drop: by('drop'), byType, count: items.length };
}

// Methods the learner hasn't tried yet, for "what next".
export function untried(experiments, methodIds) {
  const tried = new Set(experiments.map((e) => e.method));
  return methodIds.filter((m) => !tried.has(m));
}
