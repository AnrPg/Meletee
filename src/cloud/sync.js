// Key/value sync of Meletee's own data with the table meletee_kv (cloud/supabase.sql).
// Mirrors every `meletee1:<acc>:a:<name>` key as row key `a:<name>`, with timestamps like noema-lite's
// noema_kv. A key changed on one device only: the newer copy wins. A key changed on two devices before
// they synced (e.g. both offline): the two copies are merged entry by entry (merge3 below), so a focus
// session, a win or a card added on each device are all kept. Values over ~900 KB go up in parts.
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
const PART = /#\d+$/;   // 'a:<name>#<n>': one part of a long value (toRows)

export function syncable(key) {
  if (typeof key !== 'string' || !key.startsWith('a:') || PART.test(key)) return false;
  const name = key.slice(2);
  if (!name || name.startsWith('cache.') || LOCAL_ONLY.includes(name)) return false;
  if (/meletee-device:/i.test(name)) return false;
  return true;
}

// ---------- three-way merge of one value (pure; unit-tested) ----------
// A short content hash (FNV-1a, 32 bit).
export function hash(str) {
  let x = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  return (x >>> 0).toString(36);
}
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const parse = (s) => { try { return { ok: true, v: JSON.parse(s) }; } catch { return { ok: false }; } };
// Entries of a list: by their id when they have one, otherwise by their content (the n-th copy of
// the same content is its own entry, so two identical sessions stay two).
function entries(v) {
  const out = new Map();
  if (Array.isArray(v)) {
    const seen = {};
    for (const x of v) {
      let id = isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number') ? 'i:' + x.id : 'v:' + hash(JSON.stringify(x));
      if (out.has(id)) { seen[id] = (seen[id] || 1) + 1; id += '#' + seen[id]; }
      out.set(id, x);
    }
  } else if (isObj(v)) for (const [k, x] of Object.entries(v)) out.set(k, x);
  return out;
}
// What is remembered of the last synced copy of a key: its hash, and the hash of each entry.
export function describe(value) {
  const d = { h: hash(value) };
  const p = parse(value);
  if (p.ok && (Array.isArray(p.v) || isObj(p.v))) {
    d.t = Array.isArray(p.v) ? 'a' : 'o';
    d.e = {};
    for (const [id, x] of entries(p.v)) d.e[id] = hash(JSON.stringify(x));
  }
  return d;
}
// Merge the local and remote copies of a key that both changed since the last sync (base: describe() of
// that copy, or null when there is none, as for study that moves into an account). Lists and maps are
// merged entry by entry: added on either side → kept; deleted on one side and untouched on the other →
// deleted; changed on one side → that change; changed on both → the newer side's (preferLocal).
// Anything else (or two different kinds of value) → the newer side's copy.
export function merge3(base, local, remote, preferLocal = false) {
  const L = parse(local), R = parse(remote);
  const kind = (p) => (!p.ok ? 'x' : Array.isArray(p.v) ? 'a' : isObj(p.v) ? 'o' : 'x');
  const k = kind(L);
  if (k === 'x' || k !== kind(R)) return preferLocal ? local : remote;
  const be = base && base.t === k ? base.e || {} : {};
  const el = entries(L.v), er = entries(R.v);
  const DROP = Symbol('drop');
  const pick = (id) => {
    const inL = el.has(id), inR = er.has(id);
    const hl = inL ? hash(JSON.stringify(el.get(id))) : null;
    const hr = inR ? hash(JSON.stringify(er.get(id))) : null;
    if (inL && inR) {
      if (hl === hr || be[id] === hr) return el.get(id);
      if (be[id] === hl) return er.get(id);
      return preferLocal ? el.get(id) : er.get(id);
    }
    if (inL) return id in be && be[id] === hl ? DROP : el.get(id);
    return id in be && be[id] === hr ? DROP : er.get(id);
  };
  const [first, second] = preferLocal ? [el, er] : [er, el];
  if (k === 'o') {
    const out = {};
    for (const id of new Set([...first.keys(), ...second.keys()])) { const v = pick(id); if (v !== DROP) out[id] = v; }
    return JSON.stringify(out);
  }
  // lists: the newer side's order; entries only the other side has go right after their neighbour there
  const ids = [...first.keys()];
  const sec = [...second.keys()];
  for (let i = 0; i < sec.length; i++) {
    const id = sec[i];
    if (first.has(id)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const p = ids.indexOf(sec[j]); if (p >= 0) { at = p + 1; break; } }
    ids.splice(at, 0, id);
  }
  const out = [];
  for (const id of ids) { const v = pick(id); if (v !== DROP) out.push(v); }
  return JSON.stringify(out);
}

// ---------- pure key/value merge (unit-tested) ----------
// local: { key: value|null }  mtimes: { key: ms }  remote: [{ key, value, updated_at }]
// pending: keys changed here since the last sync   base: { key: describe(last synced copy) }
// -> { apply: { key: value }, mtimes, push: [keys], settled: [keys], base }
export function mergeKv({ local = {}, mtimes = {}, remote = [], pending = [], base = {}, now = Date.now() }) {
  const mt = { ...mtimes };
  const bs = { ...base };
  const pend = new Set(pending);
  const apply = {};
  const remoteT = new Map();
  const push = new Set();
  const decided = new Set();
  const settled = new Set();
  for (const r of remote) {
    if (!syncable(r.key)) continue;
    const k = r.key; const rv = r.value; const lv = local[k];
    const t = Date.parse(r.updated_at) || 0;
    remoteT.set(k, t);
    const remoteMoved = !bs[k] || bs[k].h !== hash(rv);
    if (lv === rv) {
      if (!(k in mt) || t > mt[k]) mt[k] = t;
      bs[k] = describe(rv); decided.add(k); settled.add(k);
    } else if (pend.has(k) && !remoteMoved) {
      push.add(k); decided.add(k);                         // only this device changed it
    } else if (pend.has(k) && lv != null) {
      const merged = merge3(bs[k], lv, rv, (mt[k] || 0) > t);   // both changed it
      bs[k] = describe(rv); decided.add(k);
      if (merged === rv) { apply[k] = rv; mt[k] = t; settled.add(k); }
      else { if (merged !== lv) apply[k] = merged; mt[k] = Math.max(now, t + 1); push.add(k); }
    } else if (pend.has(k)) {
      apply[k] = rv; mt[k] = t; bs[k] = describe(rv); decided.add(k); settled.add(k);   // deleted here, changed there: keep it
    } else if (!(k in mt) || t > mt[k]) {
      apply[k] = rv; mt[k] = t; bs[k] = describe(rv); decided.add(k); settled.add(k);
    }
  }
  for (const [k, v] of Object.entries(local)) {
    if (!syncable(k) || decided.has(k)) continue;
    if (v != null && !remoteT.has(k)) push.add(k);
  }
  for (const [k, t] of Object.entries(mt)) {
    if (!syncable(k) || decided.has(k)) continue;
    if (remoteT.has(k) ? t > remoteT.get(k) : local[k] != null) push.add(k);
    else if (!remoteT.has(k) && local[k] == null) delete mt[k];
  }
  return { apply, mtimes: mt, push: [...push].sort(), settled: [...settled].sort(), base: bs };
}

// ---------- values over the row size cap go up in parts (pure; unit-tested) ----------
// 'a:x' = '{"$meleteeParts":n,…}' and 'a:x#1' … 'a:x#n' hold the text. A value is used only when all its
// parts are there and match, so a half-written copy is never applied.
export const PART_MAX = 900000;
const HEAD = '{"$meleteeParts":';
export function toRows(key, value, max = PART_MAX) {
  if (value.length <= max) return [{ key, value }];
  const n = Math.ceil(value.length / max);
  const rows = [{ key, value: JSON.stringify({ $meleteeParts: n, length: value.length, h: hash(value) }) }];
  for (let i = 0; i < n; i++) rows.push({ key: `${key}#${i + 1}`, value: value.slice(i * max, (i + 1) * max) });
  return rows;
}
export function fromRows(rows) {
  const parts = new Map();
  for (const r of rows) if (PART.test(r.key)) parts.set(r.key, r.value);
  const out = [];
  for (const r of rows) {
    if (PART.test(r.key)) continue;
    if (typeof r.value === 'string' && r.value.startsWith(HEAD)) {
      const p = parse(r.value);
      if (!p.ok) continue;
      let v = '';
      for (let i = 1; i <= p.v.$meleteeParts; i++) { const x = parts.get(`${r.key}#${i}`); if (x == null) { v = null; break; } v += x; }
      if (v == null || v.length !== p.v.length || hash(v) !== p.v.h) continue;   // incomplete: next time
      out.push({ ...r, value: v });
    } else out.push(r);
  }
  return out;
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
const baseKey = () => pre() + 'meta:base';
const firstKey = () => pre() + 'meta:firstSync';
// Has this account's data been pulled to this device at least once?
export function firstSyncDone() { return !!jget(firstKey(), 0); }

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
    const remote = fromRows(await b.select(TABLE, { select: 'key,value,updated_at', order: 'key' }));
    const pending = new Set([...st.pending, ...jget(pendKey(), [])]);
    const { apply, mtimes, push, settled, base } = mergeKv({ local: localData(), mtimes: jget(mtKey(), {}), remote, pending: [...pending], base: jget(baseKey(), {}) });
    for (const [k, v] of Object.entries(apply)) rawSet(pre() + k, v);
    jset(mtKey(), mtimes);
    jset(baseKey(), base);
    for (const k of pending) st.pending.add(k);
    for (const k of settled) st.pending.delete(k);
    for (const k of push) st.pending.add(k);
    persistPending();
    jset(firstKey(), Date.now());
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
  const base = jget(baseKey(), {});
  const rows = []; const dels = []; const split = []; const sent = {};
  for (const k of keys) {
    if (!syncable(k)) continue;
    const v = rawGet(pre() + k);
    if (v == null) { dels.push(k); continue; }
    sent[k] = v;
    const at = new Date(mt[k] || Date.now()).toISOString();
    const parts = toRows(k, v);
    if (parts.length > 1 || base[k]?.p) split.push(k);
    for (const r of parts) rows.push({ ...r, updated_at: at });
  }
  st.syncing = true; emit();
  try {
    for (const k of split) await b.remove(TABLE, [['key', 'like', k + '#*']]);
    for (let i = 0; i < rows.length; i += 50) await b.upsert(TABLE, rows.slice(i, i + 50), { onConflict: 'user_id,key', keepalive });
    for (const k of dels) await b.remove(TABLE, [['key', 'like', k + '#*']]).then(() => b.remove(TABLE, [['key', 'eq', k]]));
    // remember what the cloud now holds: the base of the next merge
    const bs = jget(baseKey(), {});
    for (const [k, v] of Object.entries(sent)) { bs[k] = describe(v); if (v.length > PART_MAX) bs[k].p = 1; }
    for (const k of dels) delete bs[k];
    jset(baseKey(), bs);
    st.lastSync = Date.now(); st.error = null;
    persistPending();
    return rows.length + dels.length;
  } catch (e) { keys.forEach((k) => st.pending.add(k)); persistPending(); st.error = e.message; throw e; }
  finally { st.syncing = false; emit(); }
}

// The first pull of an account on this device, AI conversations included ("bringing your study over…").
export async function firstSync() {
  await pull();
  try { await (await import('./convos.js')).pullNow(); } catch { /* conversations follow with the background sync */ }
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
// Signing in moves the app to the account `u_<user id>` (like noema-lite). Study kept on this device
// before there were accounts (the 'local' profile) moves into the account: copied in, merged with what
// the account already holds on this device, marked as changed so the first pull merges it with the cloud
// copy entry by entry, then removed from the local profile (only the language and theme stay, for the
// welcome screen). Data of another account is never copied. Returns true when something moved.
const KEEP_LOCAL = ['a:settings', 'a:ui'];
export function activate(uid) {
  const target = 'u_' + uid;
  const s = ls(); if (!s) return false;
  const from = store.account();
  const tpre = `${P}${target}:`;
  const fpre = `${P}local:`;
  let moved = false;
  if (!from.startsWith('u_') || from === target) {
    const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k) => k?.startsWith(fpre + 'a:') && syncable(k.slice(fpre.length)));
    const pend = new Set(jget(tpre + 'meta:pending', []));
    for (const k of keys) {
      const name = k.slice(fpre.length);
      const v = s.getItem(k);
      const there = s.getItem(tpre + name);
      if (v == null) continue;
      try {
        if (there == null) { s.setItem(tpre + name, v); pend.add(name); }
        else if (there !== v && !KEEP_LOCAL.includes(name)) { s.setItem(tpre + name, merge3(null, v, there, false)); pend.add(name); }
      } catch { continue; /* storage full: the copy stays in the local profile */ }
      if (!KEEP_LOCAL.includes(name)) { s.removeItem(k); moved = true; }
    }
    if (pend.size) jset(tpre + 'meta:pending', [...pend]);
  }
  s.setItem(P + 'current', target);
  return moved;
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
    // keep the newest 30 (trim first: the database refuses more than 40, cloud/supabase.sql 2b)
    const autos = (await this.list()).filter((s) => s.kind === AUTO);
    for (const s of autos.slice(29)) await this.remove(s.id).catch(() => {});
    await this.save('', AUTO);
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
