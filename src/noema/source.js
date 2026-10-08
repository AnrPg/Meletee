// Where noema-lite data comes from (see docs/NOEMA.md, "How Meletee reaches noema-lite"):
//   - the public library: registry.js and subjects/<id>/pack.json, ONLY ever read as data (fetch + JSON
//     parse; nothing from noema-lite is ever executed in Meletee's origin). First through the same-origin
//     Netlify proxy /noema-library/* (docs/SECURITY-HEADERS.md; no CORS needed), then straight from
//     <noemaUrl>/library (works once noema-lite sends CORS headers, and in local dev / tests).
//     config.noemaLibrary can override the first base.
//   - the signed-in person's rows in noema_kv (read only): a:packmeta:*, a:subjoverride:*, s:*:state, a:caps
//     Never a:settings (it holds the Gemini key in noema-lite today).
//   - their imported packs: Storage noema-private/<user id>/packs/<id>.json (same row-level security as noema-lite)
//   - packs from noema-lite's Explore: the public bucket noema-public/<owner>/<id>.json
import { backend, config } from '../cloud/client.js';
import * as store from '../core/store.js';
import { buildSubjects, parseState } from './progress.js';

const packs = new Map();
let registryP = null;
let rowsCache = null;

const cacheKey = () => `meletee1:${store.account()}:cache:noema`;
function readCache() { try { return JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch { return null; } }
function writeCache(v) { try { localStorage.setItem(cacheKey(), JSON.stringify(v)); } catch { /* full */ } }

// Library bases to try, in order: the same-origin proxy, then noema-lite directly.
export function libraryBases(cfg = config()) {
  if (!cfg.noemaUrl) return [];
  const own = String(cfg.noemaLibrary || '/noema-library').replace(/\/+$/, '');
  const direct = `${String(cfg.noemaUrl).replace(/\/+$/, '')}/library`;
  return own === direct ? [direct] : [own, direct];
}

async function fromLibrary(path, parse) {
  for (const base of libraryBases()) {
    try {
      const r = await fetch(`${base}/${path}`, { credentials: 'omit' });
      if (!r.ok) continue;
      const v = parse(await r.text());
      if (v) return v;
    } catch { /* offline, no CORS yet, or not proxied here: next base */ }
  }
  return null;
}

const asJson = (t) => { try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch { return null; } };

// `window.NOEMA_REGISTRY = {…};` -> the object, without running it.
export function parseRegistry(text) {
  const i = text.indexOf('{'); const j = text.lastIndexOf('}');
  if (i < 0 || j < i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

export function registry() {
  if (!config().noemaUrl) return Promise.resolve(null);
  registryP ||= fromLibrary('registry.js', parseRegistry);
  return registryP;
}

// The person's noema_kv rows Meletee may read (never a:settings).
export async function kvRows({ force = false } = {}) {
  const b = backend();
  if (!b?.session()) return [];
  if (rowsCache && !force) return rowsCache;
  const sel = (like) => b.select('noema_kv', { select: 'key,value,updated_at', filters: [['key', 'like', like]] });
  const parts = await Promise.all([sel('a:packmeta:*'), sel('a:subjoverride:*'), sel('s:*:state'), sel('a:caps')]);
  rowsCache = parts.flat().filter((r) => r && r.key !== 'a:settings');
  writeCache({ at: Date.now(), states: Object.fromEntries(rowsCache.filter((r) => /^s:.+:state$/.test(r.key)).map((r) => [r.key.slice(2, -6), r.value])), caps: rowsCache.find((r) => r.key === 'a:caps')?.value || null });
  return rowsCache;
}

export async function subjects({ force = false } = {}) {
  const [reg, rows] = await Promise.all([registry(), kvRows({ force }).catch(() => [])]);
  return buildSubjects({ registry: reg, rows });
}

// Latest progress per subject (network when signed in, else the last copy on this device).
export async function states({ force = false } = {}) {
  try {
    const rows = await kvRows({ force });
    if (rows.length) return Object.fromEntries(rows.filter((r) => /^s:.+:state$/.test(r.key)).map((r) => [r.key.slice(2, -6), parseState(r.value)]));
  } catch { /* offline */ }
  const c = readCache();
  return Object.fromEntries(Object.entries(c?.states || {}).map(([k, v]) => [k, parseState(v)]));
}

// What this noema-lite understands (docs/NOEMA.md): { resultsInbox, exerciseRoute, stableCardIds }
export async function caps() {
  try { const r = (await kvRows()).find((x) => x.key === 'a:caps'); if (r) return JSON.parse(r.value) || {}; } catch { /* offline */ }
  try { return JSON.parse(readCache()?.caps || '{}') || {}; } catch { return {}; }
}

export async function pack(meta) {
  const id = typeof meta === 'string' ? meta : meta.id;
  if (packs.has(id)) return packs.get(id);
  const b = backend();
  const tries = [];
  tries.push(() => fromLibrary(`subjects/${encodeURIComponent(id)}/pack.json`, asJson));
  if (b?.session()) tries.push(() => b.download('noema-private', `${b.session().user.id}/packs/${id}.json`));
  if (b && meta?.publicOwner) tries.push(() => b.download('noema-public', `${meta.publicOwner}/${id}.json`, { isPublic: true }));
  for (const f of tries) {
    try { const p = await f(); if (p?.chapters) { packs.set(id, p); return p; } } catch { /* next source */ }
  }
  throw new Error('pack unavailable');
}

export function _reset() { packs.clear(); registryP = null; rowsCache = null; }
