// Calls to the buddy SQL functions (PostgREST: POST /rest/v1/rpc/<name>), without changing
// src/cloud/client.js. A test backend (window.__meleteeSupabase) answers through its own rpc().
// The real one reuses client.js's session: when the access token is about to expire, one cheap
// select through the client refreshes it first.
import { backend, config } from '../cloud/client.js';

export function createRpc({ supabaseUrl, supabaseKey }, { session, refresh, fetchImpl } = {}) {
  const BASE = String(supabaseUrl || '').replace(/\/+$/, '');
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  return async function call(fn, args = {}) {
    if (!/^meletee_buddy_\w+$/.test(fn)) throw new Error('unknown function');
    let s = session();
    if (!s) throw new Error('signed out');
    if (s.expires_at - 60 <= Date.now() / 1000) { await refresh(); s = session(); if (!s) throw new Error('signed out'); }
    let r;
    try {
      r = await doFetch(`${BASE}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch { const e = new Error('network'); e.network = true; throw e; }
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
    if (!r.ok) { const e = new Error((j && (j.message || j.msg || j.error)) || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return j;
  };
}

let real = null;
export async function rpc(fn, args = {}) {
  const b = backend();
  if (!b) throw new Error('not configured');
  if (typeof b.rpc === 'function') return b.rpc(fn, args);
  real ||= createRpc(config(), {
    session: () => b.session(),
    refresh: () => b.select('meletee_buddy_profiles', { select: 'user_id', limit: 1 }),
  });
  return real(fn, args);
}

// Where the focus room's websocket goes, and with which token (null when not possible).
export function realtimeInfo() {
  const b = backend();
  const s = b?.session();
  const c = config();
  const base = b?.realtimeUrl || c.supabaseUrl;
  if (!s || !base || !c.supabaseKey) return null;
  const url = `${String(base).replace(/^http/, 'ws').replace(/\/+$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(c.supabaseKey)}&vsn=1.0.0`;
  return { url, token: s.access_token, userId: s.user.id };
}
