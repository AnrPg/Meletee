// Where noema-lite data comes from (see docs/NOEMA.md, "How Meletee reaches noema-lite"):
//   - the public library: <noemaUrl>/library/registry.js and /library/subjects/<id>/pack.json
//     (fetched with CORS; if the site does not send CORS headers yet, pack.js / registry.js are loaded
//     as classic scripts, which needs no CORS: they only assign window.NOEMA_PACKS / NOEMA_REGISTRY)
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

function script(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => { s.remove(); res(); };
    s.onerror = () => { s.remove(); rej(new Error('load ' + src)); };
    document.head.append(s);
  });
}

// `window.NOEMA_REGISTRY = {…};` -> the object, without running it.
export function parseRegistry(text) {
  const i = text.indexOf('{'); const j = text.lastIndexOf('}');
  if (i < 0 || j < i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

export function registry() {
  const base = config().noemaUrl;
  if (!base) return Promise.resolve(null);
  registryP ||= (async () => {
    try {
      const r = await fetch(`${base}/library/registry.js`);
      if (r.ok) { const j = parseRegistry(await r.text()); if (j) return j; }
    } catch { /* no CORS yet */ }
    try { await script(`${base}/library/registry.js`); return window.NOEMA_REGISTRY || null; } catch { return null; }
  })();
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
  const base = config().noemaUrl;
  const b = backend();
  const tries = [];
  if (base) tries.push(async () => { const r = await fetch(`${base}/library/subjects/${encodeURIComponent(id)}/pack.json`); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  if (b?.session()) tries.push(() => b.download('noema-private', `${b.session().user.id}/packs/${id}.json`));
  if (b && meta?.publicOwner) tries.push(() => b.download('noema-public', `${meta.publicOwner}/${id}.json`, { isPublic: true }));
  if (base) tries.push(async () => { await script(`${base}/library/subjects/${encodeURIComponent(id)}/pack.js`); const p = window.NOEMA_PACKS?.[id]; if (!p) throw new Error('no pack'); return p; });
  for (const f of tries) {
    try { const p = await f(); if (p?.chapters) { packs.set(id, p); return p; } } catch { /* next source */ }
  }
  throw new Error('pack unavailable');
}

export function _reset() { packs.clear(); registryP = null; rowsCache = null; }
