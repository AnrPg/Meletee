// AI conversations → noema-lite's table noema_conversations, so Meletee's tutor chats show up in
// noema-lite too. The row shape is exactly the one noema-lite's engine/cloud.js pushConvos() writes.
// Phase 4 owns the conversation store (src/ai/convos.js). This adapter loads it defensively and does
// nothing when it is missing. Expected interface (docs/NOEMA.md, "AI conversations"):
//   get(id) -> record | null                 (required)
//   onChange(fn) where fn(record)            (required; called after each local save)
//   list({ includeDeleted: true }) -> []     (optional; first push after sign-in)
//   put(record, { silent, keepUpdatedAt })   (optional; pulls Meletee records saved on other devices)
import { backend } from './client.js';

export const CONVO_TABLE = 'noema_conversations';
const PULLED = 'meletee1:cloud:convoPulledAt';
const PUSHED = 'meletee1:cloud:convoPushed';   // { id: updatedAt } of what the cloud already has
const pushedMap = () => { try { return JSON.parse(localStorage.getItem(PUSHED) || '{}'); } catch { return {}; } };

// Row exactly as noema-lite builds it (engine/cloud.js, pushConvos).
export function convoRow(r, uid) {
  return {
    user_id: uid, id: r.id, subject_id: r.subject?.id || null, kind: r.kind || 'tutor', mode: r.mode ?? null, title: r.title ?? null,
    context_label: r.context?.label || null, message_count: r.stats?.messages ?? (r.messages || []).length, deleted: !!r.deleted,
    created_at: r.createdAt, updated_at: r.updatedAt, record: r,
  };
}

export const isMeletee = (r) => r?.meta?.app === 'meletee';
const valid = (r) => r && /^cv_/.test(r.id || '') && r.createdAt && r.updatedAt && r.schema === 'noema.conversation/v1';

let mod = null;
const pending = new Set();
let timer = null;

export async function loadStore(loader = () => import('../ai/convos.js')) {
  try { const m = await loader(); return m && typeof m.get === 'function' && typeof m.onChange === 'function' ? m : null; }
  catch { return null; }
}

export async function pushConvos({ keepalive = false } = {}) {
  const b = backend(); const uid = b?.session()?.user.id;
  if (!mod || !uid || !pending.size) return 0;
  const ids = [...pending]; pending.clear();
  const rows = [];
  for (const id of ids) { const r = await mod.get(id); if (valid(r) && isMeletee(r)) rows.push(convoRow(r, uid)); }
  try {
    for (let i = 0; i < rows.length; i += 20) await b.upsert(CONVO_TABLE, rows.slice(i, i + 20), { onConflict: 'user_id,id', keepalive });
    const done = pushedMap(); for (const r of rows) done[r.id] = r.updated_at;
    try { localStorage.setItem(PUSHED, JSON.stringify(done)); } catch { /* blocked */ }
    return rows.length;
  } catch (e) { ids.forEach((i) => pending.add(i)); throw e; }
}

export async function pullConvos() {
  const b = backend(); if (!mod?.put || !b?.session()) return 0;
  let since = null; try { since = localStorage.getItem(PULLED); } catch { /* blocked */ }
  const filters = [['record->meta->>app', 'eq', 'meletee']];
  if (since) filters.push(['synced_at', 'gt', since]);
  const rows = await b.select(CONVO_TABLE, { select: 'record,updated_at,synced_at', filters, order: 'synced_at.asc' });
  let n = 0; let last = since;
  for (const row of rows || []) {
    const r = row.record; if (!valid(r)) continue;
    const local = await mod.get(r.id);
    if (!local || Date.parse(r.updatedAt) > Date.parse(local.updatedAt)) { await mod.put(r, { silent: true, keepUpdatedAt: true }); n++; }
    last = row.synced_at || row.updated_at || last;
  }
  if (last) try { localStorage.setItem(PULLED, last); } catch { /* blocked */ }
  return n;
}

export async function startConvoSync(loader) {
  mod = await loadStore(loader);
  if (!mod) return false;
  mod.onChange((r) => {
    if (!r?.id || !isMeletee(r)) return;
    pending.add(r.id);
    clearTimeout(timer);
    timer = setTimeout(() => pushConvos().catch(() => {}), 2500);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushConvos({ keepalive: true }).catch(() => {}); });
  if (backend()?.session()) {
    await pullConvos().catch(() => {});
    if (typeof mod.list === 'function') {
      const done = pushedMap();
      try { for (const r of await mod.list({ includeDeleted: true })) if (isMeletee(r) && done[r.id] !== r.updatedAt) pending.add(r.id); } catch { /* store not ready */ }
      await pushConvos().catch(() => {});
    }
  }
  return true;
}

// test hook
export function _pending() { return pending; }
