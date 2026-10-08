// Namespaced local storage, mirroring noema-lite's scheme:
//   meletee1:<account>:a:<name>   account-wide data (settings, profile…)
//   meletee1:current              the active account id
// Values are JSON. Everything degrades to memory when storage is blocked.
const PREFIX = 'meletee1:';
const memory = new Map();
const listeners = new Set();

function raw() {
  try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; }
}

function getItem(k) { const s = raw(); return s ? s.getItem(k) : (memory.has(k) ? memory.get(k) : null); }
function setItem(k, v) { const s = raw(); try { s ? s.setItem(k, v) : memory.set(k, v); } catch { memory.set(k, v); } }
function removeItem(k) { const s = raw(); s ? s.removeItem(k) : memory.delete(k); }
function allKeys() {
  const s = raw();
  if (!s) return [...memory.keys()];
  const out = [];
  for (let i = 0; i < s.length; i++) out.push(s.key(i));
  return out;
}

export function account() { return getItem(PREFIX + 'current') || 'local'; }

const key = (name) => `${PREFIX}${account()}:a:${name}`;

export function get(name, fallback = null) {
  const v = getItem(key(name));
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

export function set(name, value) {
  setItem(key(name), JSON.stringify(value));
  for (const fn of listeners) fn(name, value);
}

export function update(name, fn, fallback = {}) {
  const next = fn(get(name, fallback));
  set(name, next);
  return next;
}

export function remove(name) { removeItem(key(name)); }

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------- backup ----------
export const BACKUP_FORMAT = 'meletee-backup';

export function exportBackup() {
  const prefix = `${PREFIX}${account()}:`;
  const data = {};
  for (const k of allKeys()) if (k && k.startsWith(prefix)) data[k.slice(prefix.length)] = getItem(k);
  return { format: BACKUP_FORMAT, version: 1, account: account(), exportedAt: new Date().toISOString(), data };
}

// What a restored backup may write: only the account data the app itself keeps under `a:` (the names below,
// plus the grow:* and per-workspace ws:<id>:* families). Never meta:*, cache:* (e.g. the noema-lite outbox,
// which would be forwarded to noema-lite), a:cache.*, the device-only timer, or anything else a crafted file
// adds. Add new store names here when a feature introduces one.
export const RESTORABLE = Object.freeze(['ai', 'blocks', 'buddies:logged', 'courses', 'method', 'parking', 'profile', 'recalls', 'sessions', 'settings', 'today', 'ui']);
const RESTORABLE_FAMILY = /^(grow:[a-z][a-zA-Z0-9_-]{0,40}|ws:[a-zA-Z0-9_-]{1,60}:[a-zA-Z0-9_.:-]{1,80})$/;
export const MAX_VALUE = 1000000; // the same cap as meletee_kv.value (cloud/supabase.sql)

export function restorable(key) {
  if (typeof key !== 'string' || !key.startsWith('a:')) return false;
  const name = key.slice(2);
  return RESTORABLE.includes(name) || RESTORABLE_FAMILY.test(name);
}

export function importBackup(obj) {
  if (!obj || obj.format !== BACKUP_FORMAT || !obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) throw new Error('not a meletee backup');
  const prefix = `${PREFIX}${account()}:`;
  let n = 0;
  for (const [k, v] of Object.entries(obj.data)) {
    if (!restorable(k) || typeof v !== 'string' || v.length > MAX_VALUE) continue;
    try { JSON.parse(v); } catch { continue; }
    setItem(prefix + k, v);
    n++;
  }
  return n;
}
