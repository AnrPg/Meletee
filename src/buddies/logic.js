// Pure buddy logic (no DOM, no storage, no network), unit-tested in tests/buddies.test.mjs:
// weeks, privacy filtering, contributions, shared goals, challenges, team goals, presets,
// invite codes, the shared room timer and Phoenix presence.
import { iso, addDays, weekStart, diffDays } from '../core/dates.js';

// ---------- privacy ----------
// What a buddy may see. Each person picks; by default only the forgiving streak is shared.
export const SHARE_KEYS = ['streak', 'minutes', 'garden', 'focus'];
export const DEFAULT_SHARE = Object.freeze({ streak: true, minutes: false, garden: false, focus: false });

export function normalizeShare(share = {}) {
  return Object.fromEntries(SHARE_KEYS.map((k) => [k, share?.[k] === true]));
}

// Only the fields someone chose to share (the SQL function meletee_buddy_masked does the same on the server).
export function maskShared(share, stats) {
  const s = normalizeShare(share);
  const out = {};
  for (const k of SHARE_KEYS) if (s[k] && stats && stats[k] != null) out[k] = stats[k];
  return out;
}

// ---------- profile ----------
export const EMOJIS = ['🦊', '🐼', '🦉', '🐢', '🐝', '🦋', '🐙', '🦔', '🐧', '🐨', '🌻', '🍀', '🌙', '⭐', '🍄', '🐳'];

export function cleanName(v) {
  return String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function cleanEmoji(v) {
  const s = String(v || '').trim();
  return EMOJIS.includes(s) ? s : EMOJIS[0];
}

// ---------- weeks ----------
// Everything weekly runs Monday to Sunday and starts fresh each Monday.
export const weekOf = (day = iso()) => weekStart(day);
export const lastWeekOf = (day = iso()) => addDays(weekStart(day), -7);
export const daysLeft = (day = iso()) => 6 - diffDays(day, weekStart(day)); // after today

// Goals of this week and of last week (for a short, kind "last week" note). Older ones are gone.
export function byWeek(goals = [], day = iso()) {
  const now = weekOf(day), last = lastWeekOf(day);
  return { now: goals.filter((g) => g.week === now), last: goals.filter((g) => g.week === last) };
}

// ---------- contributions (from Meletee's own activity) ----------
export const METRICS = ['minutes', 'sessions', 'reviews'];
const LIMITS = { minutes: 10080, sessions: 1000, reviews: 100000 };
const clamp = (k, n) => Math.max(0, Math.min(LIMITS[k], Math.round(Number(n) || 0)));

// Focus sessions, minutes and reviews done in the week starting on `week`, never counting the future.
export function contributions({ sessions = [], courses = [], week = weekOf(), today = iso() } = {}) {
  const end = addDays(week, 6);
  const inWeek = (d) => typeof d === 'string' && d.slice(0, 10) >= week && d.slice(0, 10) <= end && d.slice(0, 10) <= today;
  let minutes = 0, n = 0, reviews = 0;
  for (const s of sessions) if (inWeek(s.date)) { n++; minutes += s.minutes || 0; }
  for (const c of courses) for (const tp of c.topics || []) for (const r of tp.reviewLog || []) if (inWeek(r.date)) reviews++;
  return { week, minutes: clamp('minutes', minutes), sessions: clamp('sessions', n), reviews: clamp('reviews', reviews) };
}

// Everything a buddy card could show; maskShared() decides what leaves the device.
export function cardStats({ streak, stage = 0, contrib, timer = null, now = Date.now() }) {
  const focusing = !!(timer && timer.phase === 'focus' && !timer.paused && timer.endsAt > now);
  return {
    streak: { weeks: streak?.streak || 0, days: streak?.count || 0 },
    minutes: contrib?.minutes || 0,
    garden: stage,
    focus: focusing ? { until: timer.endsAt } : { until: 0 },
  };
}

export const isFocusing = (shared, now = Date.now()) => !!(shared?.focus?.until && shared.focus.until > now);

// ---------- shared goals (cooperation): each of us does `target` ----------
export function sharedProgress(members = [], target = 1) {
  const t = Math.max(1, target || 1);
  const rows = members.map((m) => ({ ...m, value: m.value || 0, pct: Math.min(100, Math.round(((m.value || 0) / t) * 100)), done: (m.value || 0) >= t }));
  const sum = rows.reduce((n, m) => n + Math.min(m.value, t), 0);
  const combined = rows.length ? Math.round((sum / (t * rows.length)) * 100) : 0;
  return { rows, combined, allDone: rows.length > 0 && rows.every((m) => m.done), doneCount: rows.filter((m) => m.done).length };
}

// ---------- team goals (co-competition): all of us together reach `target` ----------
// Everyone's part is shown kindly: no ranking, in the order people joined.
export function teamProgress(members = [], target = 1) {
  const t = Math.max(1, target || 1);
  const total = members.reduce((n, m) => n + (m.value || 0), 0);
  const rows = members.map((m) => ({ ...m, value: m.value || 0, part: total ? Math.round(((m.value || 0) / total) * 100) : 0 }));
  return { rows, total, pct: Math.min(100, Math.round((total / t) * 100)), met: total >= t, left: Math.max(0, t - total) };
}

// ---------- challenges (competition, opt-in) ----------
// A light board: standard ranking with shared places for ties, only people who have started are ranked,
// and nobody is ever called out for being last (those not started yet are simply "warming up").
export function challengeBoard(members = []) {
  const started = members.filter((m) => (m.value || 0) > 0).sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name)));
  const warming = members.filter((m) => !((m.value || 0) > 0)).map((m) => ({ ...m, value: 0, rank: null }));
  let rank = 0, prev = null;
  const ranked = started.map((m, i) => {
    if (m.value !== prev) { rank = i + 1; prev = m.value; }
    return { ...m, rank, top: rank === 1 };
  });
  const total = ranked.reduce((n, m) => n + m.value, 0);
  return { rows: [...ranked, ...warming], total, leaders: ranked.filter((m) => m.top).length };
}

// ---------- cheers and nudges: preset messages only (no free text in v1) ----------
export const CHEERS = Object.freeze({
  cheer: ['proud', 'youGotThis', 'highFive', 'niceStreak', 'keepGoing'],
  nudge: ['studyNow', 'oneSession', 'joinRoom', 'thinkingOfYou'],
});
export const isPreset = (kind, key) => !!CHEERS[kind]?.includes(key);

// ---------- invite codes ----------
// Codes are made by the server (meletee_buddy_invite_create): 10 characters from a 31-letter alphabet
// without look-alikes (no 0/O, 1/I/L), so 31^10 ≈ 8.2·10^14 codes; each works once, for 14 days, and every
// account may try at most 30 codes an hour. Older invites have 8 characters (31^8 ≈ 8.5·10^11), still accepted.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;
export const CODE_LENGTHS = [8, 10];

// A code from whatever was pasted: the code itself (any case, with spaces or dashes) or an invite link.
export function parseCode(input) {
  let s = String(input || '').trim();
  const m = s.match(/buddies\/join\/([^/?#\s]+)/i);
  if (m) s = decodeURIComponent(m[1]);
  s = s.toUpperCase().replace(/[\s-]/g, '');
  return CODE_LENGTHS.includes(s.length) && [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null;
}

export const inviteLink = (code, base) => `${String(base).replace(/#.*$/, '')}#/buddies/join/${code}`;

// ---------- the shared room timer ----------
// One record per room: { phase: 'focus', minutes, rest, startedAt, endsAt, by, v } or { phase: 'idle', v }.
// The break follows the focus block on its own, so every client derives the same phase from the clock.
export const ROOM_PRESETS = [{ focus: 25, rest: 5 }, { focus: 50, rest: 10 }];

export function startTimer({ minutes = 25, rest = 5, by = null, now = Date.now() } = {}) {
  return { phase: 'focus', minutes, rest, startedAt: now, endsAt: now + minutes * 60000, by, v: now };
}
export const stopTimer = ({ by = null, now = Date.now() } = {}) => ({ phase: 'idle', by, v: now });

export function timerView(tm, now = Date.now()) {
  if (!tm || tm.phase !== 'focus' || !tm.endsAt) return { phase: 'idle', left: 0, total: 0 };
  if (now < tm.endsAt) return { phase: 'focus', left: tm.endsAt - now, total: tm.minutes * 60000 };
  const breakEnd = tm.endsAt + (tm.rest || 0) * 60000;
  if (now < breakEnd) return { phase: 'break', left: breakEnd - now, total: tm.rest * 60000 };
  return { phase: 'idle', left: 0, total: 0, finished: true };
}

// The newer of two timer records (each carries v = when it was set).
export const newerTimer = (a, b) => (!a ? b || null : !b ? a : (b.v || 0) > (a.v || 0) ? b : a);

// A timer from the network (another member's broadcast, the database): only well-formed, plausible values
// pass, rebuilt from scratch (no extra fields, endsAt always derived). The same rules as the SQL function
// meletee_buddy_room_timer. null = ignore it.
export const ROOM_LIMITS = Object.freeze({ minutes: 120, rest: 60, skewMs: 60000 });
export function cleanTimer(tm, now = Date.now()) {
  if (!tm || typeof tm !== 'object' || Array.isArray(tm)) return null;
  const v = tm.v;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > now + ROOM_LIMITS.skewMs) return null;
  const by = typeof tm.by === 'string' && tm.by.length <= 64 ? { by: tm.by } : {};
  if (tm.phase === 'idle') return { phase: 'idle', ...by, v };
  if (tm.phase !== 'focus') return null;
  const { minutes, startedAt } = tm;
  const rest = tm.rest == null ? 0 : tm.rest;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > ROOM_LIMITS.minutes) return null;
  if (typeof rest !== 'number' || !Number.isFinite(rest) || rest < 0 || rest > ROOM_LIMITS.rest) return null;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt < 0 || startedAt > now + ROOM_LIMITS.skewMs) return null;
  return { phase: 'focus', minutes, rest, startedAt, endsAt: startedAt + minutes * 60000, ...by, v };
}

// Minutes of a shared focus block to log for me: only the time I was actually in the room during it,
// never more than the block itself.
export function roomMinutes(tm, presentMs) {
  if (!tm || tm.phase !== 'focus' || !Number.isInteger(tm.minutes)) return 0;
  const n = Math.round((Number(presentMs) || 0) / 60000);
  return Math.max(0, Math.min(tm.minutes, ROOM_LIMITS.minutes, n));
}

// ---------- presence ----------
// Phoenix presence state: { key: { metas: [{ phx_ref, ...meta }] } }; diffs carry joins and leaves.
export function applyPresenceDiff(state = {}, { joins = {}, leaves = {} } = {}) {
  const out = JSON.parse(JSON.stringify(state));
  for (const [k, v] of Object.entries(joins)) {
    const cur = out[k]?.metas || [];
    const refs = new Set(cur.map((m) => m.phx_ref));
    out[k] = { metas: [...cur, ...(v.metas || []).filter((m) => !refs.has(m.phx_ref))] };
  }
  for (const [k, v] of Object.entries(leaves)) {
    if (!out[k]) continue;
    const gone = new Set((v.metas || []).map((m) => m.phx_ref));
    const metas = out[k].metas.filter((m) => !gone.has(m.phx_ref));
    if (metas.length) out[k] = { metas }; else delete out[k];
  }
  return out;
}

// People in a presence state, newest meta per person.
export function presenceList(state = {}) {
  return Object.entries(state).map(([id, v]) => {
    const m = (v.metas || [])[v.metas.length - 1] || {};
    return { id, name: m.name || '', emoji: m.emoji || '🌱', status: m.status || 'here' };
  });
}

// Live presence wins over polled rows (people seen in the last ~90 s); everyone appears once.
export function mergeMembers(live = [], polled = []) {
  const map = new Map();
  for (const m of polled) map.set(m.id, { ...m });
  for (const m of live) map.set(m.id, { ...map.get(m.id), ...m });
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
