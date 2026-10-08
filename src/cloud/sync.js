// Key/value sync of Meletee's own data with the table meletee_kv (cloud/supabase.sql).
// Mirrors every `meletee1:<acc>:a:<name>` key as row key `a:<name>`, last write wins per key with
// timestamps, exactly like noema-lite's noema_kv. Signed out, nothing here runs and the app stays local.
//
// Never synced: anything outside `meletee1:<acc>:a:` (so the `meletee-device:` keys that hold AI keys,
// the cloud session and the per-device meta/cache keys), plus the names in LOCAL_ONLY below.
import * as store from '../core/store.js';
import { backend } from './client.js';

const P = 'meletee1:';
export const TABLE = 'meletee_kv';
export const SNAP_TABLE = 'meletee_snapshots';
// Device-only state: a running timer belongs to this device; cache.* are derived copies.
export const LOCAL_ONLY = ['timer'];

export function syncable(key) {
  if (typeof key !== 'string' || !key.startsWith('a:')) return false;
  const name = key.slice(2);
  if (!name || name.startsWith('cache.') || LOCAL_ONLY.includes(name)) return false;
  if (/meletee-device:/i.test(name)) return false;
  return true;
}

// ---------- pure merge (unit-tested) ----------
// local: { key: value|null }  mtimes: { key: ms }  remote: [{ key, value, updated_at }]
// -> { apply: { key: value }, mtimes, push: [keys] }
export function mergeKv({ local = {}, mtimes = {}, remote = [] }) {
  const mt = { ...mtimes };
  const apply = {};
  const remoteT = new Map();
  for (const r of remote) {
    if (!syncable(r.key)) continue;
    const t = Date.parse(r.updated_at) || 0;
    remoteT.set(r.key, t);
    if (!(r.key in mt) || t > mt[r.key]) {
      if (local[r.key] !== r.value) apply[r.key] = r.value;
      mt[r.key] = t;
    }
  }
  const push = new Set();
  for (const [k, v] of Object.entries(local)) {
    if (!syncable(k) || k in apply) continue;
    if (v != null && !remoteT.has(k)) push.add(k);
  }
  for (const [k, t] of Object.entries(mt)) {
    if (!syncable(k) || k in apply) continue;
    if (remoteT.has(k) ? t > remoteT.get(k) : local[k] != null) push.add(k);
    else if (!remoteT.has(k) && local[k] == null) delete mt[k];
  }
  return { apply, mtimes: mt, push: [...push].sort() };
}

// ---------- raw storage of the active account ----------
function ls() { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } }
const pre = () => `${P}${store.account()}:`;
function rawGet(k) { return ls()?.getItem(k) ?? null; }
function rawSet(k, v) { try { v == null ? ls()?.removeItem(k) : ls()?.setItem(k, v); } catch { /* full */ } }
function jget(k, d) { try { const v = rawGet(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
const jset = (k, v) => rawSet(k, JSON.stringify(v));

export function localData() {
  const s = ls(); const out = {}; const p = pre();
  if (!s) return out;
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(p)) { const suf = k.slice(p.length); if (syncable(suf)) out[suf] = s.getItem(k); }
  }
  return out;
}

const mtKey = () => pre() + 'meta:mtime';
const pendKey = () => pre() + 'meta:pending';

// ---------- status ----------
const st = { syncing: false, lastSync: null, error: null, pending: new Set(), timer: null, first: null, started: false, listeners: new Set() };
export function status() { return { signedIn: !!backend()?.session(), syncing: st.syncing, lastSync: st.lastSync, error: st.error, pending: st.pending.size }; }
export function onStatus(fn) { st.listeners.add(fn); return () => st.listeners.delete(fn); }
const emit = () => { for (const f of st.listeners) { try { f(status()); } catch { /* listener */ } } };

export const isCloudAccount = () => store.account().startsWith('u_');

// ---------- pull / push ----------
export async function pull() {
  const b = backend(); if (!b?.session() || !isCloudAccount()) return 0;
  st.syncing = true; emit();
  try {
    const remote = await b.select(TABLE, { select: 'key,value,updated_at', order: 'key' });
    const { apply, mtimes, push } = mergeKv({ local: localData(), mtimes: jget(mtKey(), {}), remote });
    for (const [k, v] of Object.entries(apply)) rawSet(pre() + k, v);
    jset(mtKey(), mtimes);
    for (const k of push) st.pending.add(k);
    persistPending();
    st.lastSync = Date.now(); st.error = null;
    const n = Object.keys(apply).length;
    if (n) try { window.dispatchEvent(new CustomEvent('meletee:pulled', { detail: { keys: Object.keys(apply) } })); } catch { /* old browsers */ }
    return n;
  } catch (e) { st.error = e.message; throw e; }
  finally { st.syncing = false; emit(); }
}

function persistPending() { jset(pendKey(), [...st.pending]); }

export async function push({ keepalive = false } = {}) {
  const b = backend(); if (!b?.session() || !isCloudAccount() || !st.pending.size) return 0;
  const mt = jget(mtKey(), {});
  const keys = [...st.pending]; st.pending.clear();
  const rows = []; const dels = [];
  for (const k of keys) {
    if (!syncable(k)) continue;
    const v = rawGet(pre() + k);
    if (v == null) dels.push(k); else rows.push({ key: k, value: v, updated_at: new Date(mt[k] || Date.now()).toISOString() });
  }
  st.syncing = true; emit();
  try {
    for (let i = 0; i < rows.length; i += 50) await b.upsert(TABLE, rows.slice(i, i + 50), { onConflict: 'user_id,key', keepalive });
    for (const k of dels) await b.remove(TABLE, [['key', 'eq', k]]);
    st.lastSync = Date.now(); st.error = null;
    persistPending();
    return rows.length + dels.length;
  } catch (e) { keys.forEach((k) => st.pending.add(k)); persistPending(); st.error = e.message; throw e; }
  finally { st.syncing = false; emit(); }
}

export async function syncNow() { await pull(); await push(); await snapshots.auto().catch(() => {}); }

// Mark a local change (called from store.onChange).
export function touch(name) {
  const k = 'a:' + name;
  if (!isCloudAccount() || !syncable(k)) return;
  const mt = jget(mtKey(), {}); mt[k] = Date.now(); jset(mtKey(), mt);
  st.pending.add(k); persistPending();
  // debounce 3 s, but never more than 10 s after the first unsynced change
  st.first = st.first || Date.now();
  clearTimeout(st.timer);
  st.timer = setTimeout(() => { st.first = null; push().catch(() => {}); }, Math.max(0, Math.min(3000, 10000 - (Date.now() - st.first))));
  emit();
}

// Start once per page when signed in.
export function start() {
  if (st.started) return; st.started = true;
  store.onChange((name) => touch(name));
  if (!backend()?.session() || !isCloudAccount()) return;
  for (const k of jget(pendKey(), [])) st.pending.add(k);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') push({ keepalive: true }).catch(() => {});
    else pull().then((n) => n && refreshView()).catch(() => {});
  });
  addEventListener('focus', () => pull().then((n) => n && refreshView()).catch(() => {}));
  addEventListener('online', () => push().catch(() => {}));
  syncNow().then(() => {}).catch(() => {});
}

async function refreshView() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if (document.querySelector('.sheet')) return;
  (await import('../core/router.js')).refresh();
}

// ---------- accounts ----------
// Signing in moves the app to the account `u_<user id>` (like noema-lite). The first time, this device's
// data comes along (cloud copies win where both exist); signing out returns to the local profile.
export async function activate(uid) {
  const target = 'u_' + uid;
  const s = ls(); if (!s) return;
  const from = store.account();
  const tpre = `${P}${target}:`;
  const keys = Array.from({ length: s.length }, (_, i) => s.key(i));
  const has = keys.some((k) => k?.startsWith(tpre + 'a:'));
  if (!has && from !== target) {
    const fpre = `${P}${from}:`;
    for (const k of keys) {
      if (!k) continue;
      if (k.startsWith(fpre + 'a:') && syncable(k.slice(fpre.length))) s.setItem(tpre + k.slice(fpre.length), s.getItem(k));
    }
  }
  s.setItem(P + 'current', target);
}

export function deactivate() { try { localStorage.removeItem(P + 'current'); } catch { /* blocked */ } }

// ---------- snapshots (restore points) ----------
const AUTO = 'auto';
export const snapshots = {
  data() {
    const d = localData();
    return { format: store.BACKUP_FORMAT, version: 1, account: store.account(), exportedAt: new Date().toISOString(), data: Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) };
  },
  async save(label = '', kind = 'manual') {
    const b = backend(); if (!b?.session()) throw new Error('signed out');
    const data = this.data();
    await b.insert(SNAP_TABLE, [{ label: label || null, kind, data, size_bytes: JSON.stringify(data).length }]);
    jset(pre() + 'meta:lastSnapshot', Date.now());
  },
  async list() { return (await backend()?.select(SNAP_TABLE, { select: 'id,label,kind,created_at,size_bytes', order: 'created_at.desc', limit: 60 })) || []; },
  async get(id) { const r = await backend().select(SNAP_TABLE, { select: 'data', filters: [['id', 'eq', id]] }); return r?.[0]?.data; },
  async remove(id) { await backend().remove(SNAP_TABLE, [['id', 'eq', id]]); },
  async auto() {
    if (!backend()?.session() || !isCloudAccount()) return false;
    if (Date.now() - jget(pre() + 'meta:lastSnapshot', 0) < 20 * 3600e3) return false;
    await this.save('', AUTO);
    const autos = (await this.list()).filter((s) => s.kind === AUTO);
    for (const s of autos.slice(30)) await this.remove(s.id).catch(() => {});
    return true;
  },
  // Replace this account's data with a restore point, then push it as the newest version.
  async restore(id) {
    const snap = await this.get(id);
    if (!snap || typeof snap.data !== 'object') throw new Error('empty snapshot');
    const p = pre(); const now = Date.now(); const mt = jget(mtKey(), {});
    for (const k of Object.keys(localData())) if (!(k in snap.data)) { rawSet(p + k, null); mt[k] = now; st.pending.add(k); }
    for (const [k, v] of Object.entries(snap.data)) if (syncable(k) && typeof v === 'string') { rawSet(p + k, v); mt[k] = now; st.pending.add(k); }
    jset(mtKey(), mt); persistPending();
    await push().catch(() => {});
    return Object.keys(snap.data).length;
  },
};
