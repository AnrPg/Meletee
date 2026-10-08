// Calendar dates are local 'YYYY-MM-DD' strings, like noema-lite's flashcard schedule.
import { lang } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');

export function iso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function diffDays(a, b) {
  return Math.round((parse(a) - parse(b)) / 86400000);
}

// Monday-based week start.
export function weekStart(s = iso()) {
  const d = parse(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}

export function weekday(s, style = 'short') {
  return new Intl.DateTimeFormat(lang(), { weekday: style }).format(parse(s));
}

export function nice(s, opts = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(lang(), opts).format(parse(s));
}

export function relative(days) {
  return new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' }).format(days, 'day');
}
