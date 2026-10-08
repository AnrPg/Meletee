// Done list and wins log, pure helpers. Items: { id, text, kind: 'done' | 'win', date }.
// Today's items stay on the list; older ones move quietly into the archive.
import { iso, weekStart } from '../core/dates.js';

export function addItem(list, { text, kind = 'done', date = iso(), id } = {}) {
  const v = String(text || '').trim().slice(0, 280);
  if (!v) return list;
  return [{ id: id || `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: v, kind: kind === 'win' ? 'win' : 'done', date }, ...list].slice(0, 3000);
}

export const removeItem = (list, id) => list.filter((x) => x.id !== id);
export const toggleWin = (list, id) => list.map((x) => (x.id === id ? { ...x, kind: x.kind === 'win' ? 'done' : 'win' } : x));
export const todays = (list, today = iso()) => list.filter((x) => x.date === today);

// Archive grouped by week (Monday), newest first.
export function archive(list, today = iso()) {
  const groups = new Map();
  for (const x of list) {
    if (x.date >= today) continue;
    const k = weekStart(x.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, items]) => ({ week, items: items.sort((a, b) => b.date.localeCompare(a.date)) }));
}

export const thisWeek = (list, today = iso()) => list.filter((x) => x.date >= weekStart(today) && x.date <= today);
