// Interface strings live in i18n/<lang>.json as flat "dotted.keys": "text {name}".
// English is the fallback for any missing key.
import * as store from './store.js';

export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'ru', name: 'Русский' },
  { code: 'fr', name: 'Français' },
];

const dicts = {};
let current = 'en';

export function detect() {
  const saved = store.get('settings', {}).lang;
  if (saved && LANGS.some((l) => l.code === saved)) return saved;
  for (const n of navigator.languages || [navigator.language || 'en']) {
    const c = String(n).slice(0, 2).toLowerCase();
    if (LANGS.some((l) => l.code === c)) return c;
  }
  return 'en';
}

// Workspace strings live in their own bundles (i18n/ws/<group>.<lang>.json) so
// each group of tools can be translated on its own.
export const EXTRA = ['ws/a', 'ws/b', 'ws/c', 'ai', 'grow', 'cloud', 'buddies', 'meta'];

async function fetchJSON(path) {
  try {
    const res = await fetch(new URL(`../../i18n/${path}.json`, import.meta.url));
    return res.ok ? await res.json() : {};
  } catch { return {}; }
}

async function load(code) {
  if (dicts[code]) return dicts[code];
  const parts = await Promise.all([fetchJSON(code), ...EXTRA.map((g) => fetchJSON(`${g}.${code}`))]);
  dicts[code] = Object.assign({}, ...parts);
  return dicts[code];
}

export async function setLang(code) {
  await Promise.all([load('en'), load(code)]);
  current = code;
  document.documentElement.lang = code;
  store.update('settings', (s) => ({ ...s, lang: code }));
}

export function lang() { return current; }

export function t(k, vars) {
  let s = dicts[current]?.[k] ?? dicts.en?.[k] ?? k;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? vars[n] : m));
  return s;
}

// Plural-aware helper using Intl rules: keys like "x.one", "x.few", "x.many", "x.other".
export function tn(k, n, vars = {}) {
  const cat = new Intl.PluralRules(current).select(n);
  const d = dicts[current] || {};
  const key = d[`${k}.${cat}`] ? `${k}.${cat}` : `${k}.other`;
  return t(key, { n, ...vars });
}
