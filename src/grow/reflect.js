// Weekly reflection, pure helpers. Three prompts from the compendium's weekly review:
// what got done, what slipped (and why), and one change for next week.
import { iso, parse, addDays } from '../core/dates.js';

export const PROMPTS = ['done', 'slipped', 'change'];

// ISO 8601 week key, like '2026-W41'.
export function weekKey(day = iso()) {
  const d = parse(day);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  const thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + 3);
  const year = thu.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round(((thu - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Monday of an ISO week key.
export function weekMonday(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = iso(new Date(y, 0, 4));
  const mon1 = addDays(jan4, -((parse(jan4).getDay() + 6) % 7));
  return addDays(mon1, (w - 1) * 7);
}

export const isFilled = (r) => !!r && PROMPTS.some((k) => (r[k] || '').trim());

// Past weeks with something written, newest first.
export function pastWeeks(all = {}, current = weekKey()) {
  return Object.entries(all).filter(([k, r]) => k !== current && isFilled(r))
    .sort((a, b) => b[0].localeCompare(a[0])).map(([key, r]) => ({ key, monday: weekMonday(key), ...r }));
}
