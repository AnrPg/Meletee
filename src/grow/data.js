// The Grow area's stored state and the bridge to the rest of the app's data.
// Keys (all under meletee1:<account>:a:):
//   grow:lab      Method Lab experiments
//   grow:wins     done list and wins log
//   grow:reflect  weekly reflections keyed by ISO week
//   grow:why      { text, home }  the "my why" card
//   grow:calm     { worries, breaths }  counts only; worry text is never stored
//   grow:days     { 'YYYY-MM-DD': n }  days with workspace activity, logged live
//   grow:garden   { best, seen }  highest points reached and the last celebrated stage
import * as store from '../core/store.js';
import * as study from '../core/study.js';
import { iso } from '../core/dates.js';
import { activity, studiedDays, forgivingStreak, points, datesInData } from './activity.js';
import { stageFor } from './garden.js';

export const lab = () => store.get('grow:lab', []);
export const saveLab = (l) => store.set('grow:lab', l);
export const updateExperiment = (id, fn) => saveLab(lab().map((e) => (e.id === id ? fn(e) : e)));
export const wins = () => store.get('grow:wins', []);
export const saveWins = (l) => store.set('grow:wins', l);
export const reflections = () => store.get('grow:reflect', {});
export const why = () => store.get('grow:why', { text: '', home: false });
export const saveWhy = (v) => store.set('grow:why', v);
export const calm = () => store.get('grow:calm', { worries: 0, breaths: 0 });
export const bumpCalm = (k) => store.update('grow:calm', (c) => ({ ...c, [k]: (c[k] || 0) + 1 }), { worries: 0, breaths: 0 });

// Log a workspace-activity day whenever any workspace saves data (ws:*), app-wide.
let listening = false;
export function listen() {
  if (listening) return;
  listening = true;
  store.onChange((name) => {
    if (typeof name !== 'string' || !name.startsWith('ws:')) return;
    const d = iso();
    const days = store.get('grow:days', {});
    if (days[d]) return;
    store.set('grow:days', { ...days, [d]: 1 });
  });
}

// Past days found in workspace data (for activity from before the live log existed).
function wsDays(today) {
  const out = new Set(Object.keys(store.get('grow:days', {})));
  try {
    const { data } = store.exportBackup();
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('a:ws:')) continue;
      try { datesInData(JSON.parse(v), today, out); } catch { /* not JSON */ }
    }
  } catch { /* storage blocked */ }
  return out;
}

// Everything the garden, streak and points need, in one pass.
export function snapshot(today = iso()) {
  const l = lab(), w = wins();
  const days = activity({
    sessions: study.sessions(), courses: study.courses(), recalls: store.get('recalls', []),
    wsDays: wsDays(today), lab: l, wins: w, today,
  });
  const streak = forgivingStreak(studiedDays(days), today);
  const p = points({ days, lab: l, wins: w, reflections: reflections(), calm: calm() });
  const g = store.get('grow:garden', { best: 0, seen: 0 });
  const best = Math.max(g.best || 0, p);
  if (best !== g.best) store.set('grow:garden', { ...g, best });
  const st = stageFor(best);
  return { days, streak, points: best, ...st, seen: g.seen || 0, studiedToday: days.has(today) };
}

// Returns true once per new stage, so the view can celebrate.
export function markSeen(stage) {
  const g = store.get('grow:garden', { best: 0, seen: 0 });
  if (stage <= (g.seen || 0)) return false;
  store.set('grow:garden', { ...g, seen: stage });
  return true;
}
