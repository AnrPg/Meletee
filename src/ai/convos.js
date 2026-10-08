// Every AI interaction is kept as one noema.conversation/v1 record, exactly like
// noema-lite's engine/convos.js, so phase 6 can sync them to its noema_conversations table.
//   IndexedDB "meletee-convos" → store "convos", key "<account>|<id>"
// Records are never hard-deleted: remove() writes a tombstone (deleted:true, messages:[]).
// normalize() is pure (unit-tested); the storage functions need a browser.
export const SCHEMA = 'noema.conversation/v1';
export const KINDS = ['tutor', 'grading', 'code-review', 'question', 'drill-grading'];
// noema-lite's modes plus Meletee's own tutors (noema-lite reads unknown modes as "socratic").
export const MODES = ['socratic', 'explain', 'quiz', 'interview', 'debug', 'hint', 'feynman', 'teach-back', 'why-chain', 'examples', 'mnemonic', 'method-lab', 'plan'];

const iso = (t) => new Date(t ?? Date.now()).toISOString();
const rnd = (n) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join('');
export const newId = (t = Date.now()) => 'cv_' + t.toString(36).padStart(10, '0') + rnd(6);
export const msgId = (t = Date.now()) => 'm_' + t.toString(36).padStart(10, '0') + rnd(4);

export function normalize(r, defaults = {}) {
  const now = Date.now();
  const created = r.createdAt ? Date.parse(r.createdAt) : (r.created || now);
  const msgs = (r.messages || r.msgs || []).map((m, i) => ({
    seq: i,
    id: m.id || msgId((m.createdAt ? Date.parse(m.createdAt) : m.t) || created + i),
    role: m.role === 'model' ? 'assistant' : (m.role || 'user'),
    content: String(m.content ?? m.text ?? ''),
    createdAt: m.createdAt || iso(m.t || created + i),
    ...(m.meta ? { meta: m.meta } : {}),
  }));
  const ctx = r.context || { type: 'course', id: null, label: null };
  const rec = {
    schema: SCHEMA,
    id: r.id && /^cv_/.test(r.id) ? r.id : newId(created),
    account: r.account || defaults.account || null,
    subject: r.subject || defaults.subject || null,
    kind: KINDS.includes(r.kind) ? r.kind : 'tutor',
    mode: r.kind && r.kind !== 'tutor' ? null : (MODES.includes(r.mode) ? r.mode : 'socratic'),
    title: r.title || null,
    titleSource: r.titleSource || (r.title ? 'system' : 'none'),
    context: { type: ctx.type || 'course', id: ctx.id ?? null, label: ctx.label ?? null },
    model: typeof r.model === 'object' && r.model ? r.model : { provider: 'google', name: r.model || null },
    createdAt: r.createdAt || iso(created),
    updatedAt: r.updatedAt || iso(r.updated || created),
    deleted: !!r.deleted,
    stats: { messages: msgs.length, userMessages: msgs.filter((m) => m.role === 'user').length, chars: msgs.reduce((a, m) => a + m.content.length, 0) },
    messages: r.deleted ? [] : msgs,
    ...(r.tutorState && !r.deleted ? { tutorState: r.tutorState } : {}),
    ...(r.meta ? { meta: r.meta } : {}),
  };
  return rec;
}

// ---------- storage (browser only) ----------
const DB_NAME = 'meletee-convos';
const STORE = 'convos';
const listeners = new Set();
let dbp = null;
const memory = new Map(); // when IndexedDB is unavailable (private mode…)

function account() {
  try { return localStorage.getItem('meletee1:current') || 'local'; } catch { return 'local'; }
}

function db() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (!dbp) {
    dbp = new Promise((res) => {
      try {
        const q = indexedDB.open(DB_NAME, 1);
        q.onupgradeneeded = () => q.result.createObjectStore(STORE);
        q.onsuccess = () => res(q.result);
        q.onerror = () => res(null);
      } catch { res(null); }
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  if (!d) return fn(null);
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r?.result);
    t.onerror = () => rej(t.error);
  });
}

const key = (id, acc = account()) => `${acc}|${id}`;

export async function list({ includeDeleted = false, kinds = null, workspace = null } = {}) {
  const prefix = key('');
  let rows;
  const d = await db();
  if (!d) rows = [...memory.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  else {
    rows = await tx('readonly', (s) => s.getAll(IDBKeyRange.bound(prefix, prefix + '￿')));
  }
  return (rows || [])
    .filter((r) => (includeDeleted || !r.deleted) && (!kinds || kinds.includes(r.kind)) && (!workspace || r.context?.id === workspace))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export async function get(id) {
  const d = await db();
  if (!d) return memory.get(key(id)) || null;
  return (await tx('readonly', (s) => s.get(key(id)))) || null;
}

export async function put(rec, { silent = false, keepUpdatedAt = false } = {}) {
  const r = normalize(rec, { account: { id: account(), kind: account() === 'local' ? 'local' : 'cloud' } });
  if (!keepUpdatedAt) r.updatedAt = iso();
  const d = await db();
  if (!d) memory.set(key(r.id), r);
  else await tx('readwrite', (s) => s.put(r, key(r.id)));
  if (!silent) for (const fn of listeners) { try { fn(r); } catch { /* a listener must not break saving */ } }
  return r;
}

export const save = (rec) => put(rec);

export async function remove(id) {
  const r = await get(id);
  if (r) return put({ ...r, deleted: true, messages: [] });
  return null;
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// After the conversations of the 'local' profile moved into an account (cloud/settings.js afterSignIn),
// their local copies are removed, so they can never be copied into another account on this device.
export async function purgeAccount(acc) {
  const prefix = `${acc}|`;
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
  const d = await db();
  if (!d) return;
  await tx('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿')));
}
