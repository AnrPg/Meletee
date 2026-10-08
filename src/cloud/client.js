// Supabase access without dependencies (the same approach as noema-lite's engine/cloud.js:
// Auth + PostgREST + Storage over fetch, publishable key only, row-level security everywhere).
//
// Everything else in Meletee talks to a small "backend" interface, so tests can inject a fake
// through window.__meleteeSupabase (see tests/fixtures/fake-supabase.js):
//   session()                         -> { user: { id, email } } | null
//   signIn(email, password)           -> true
//   signUp(email, password, name)     -> { session: boolean }   (false = confirm the e-mail first)
//   recover(email) / signOut()
//   select(table, { select, filters, order, limit }) -> rows      filters: [[column, op, value]], op: eq | like | gt
//   upsert(table, rows, { onConflict }) / insert(table, rows, { returning }) / remove(table, filters)
//   download(bucket, path, { isPublic }) -> parsed JSON
const SKEY = 'meletee1:cloud:session';

export function config() {
  const c = (typeof window !== 'undefined' && window.MELETEE_CONFIG) || {};
  return { supabaseUrl: c.supabaseUrl || '', supabaseKey: c.supabaseKey || '', noemaUrl: (c.noemaUrl || '').replace(/\/+$/, '') };
}

// PostgREST query string from filters (pure; unit-tested).
export function query({ select, filters = [], order, limit, onConflict } = {}) {
  const q = [];
  if (select) q.push('select=' + encodeURIComponent(select));
  for (const [col, op, val] of filters) q.push(`${encodeURIComponent(col)}=${op}.${encodeURIComponent(val)}`);
  if (order) q.push('order=' + encodeURIComponent(order));
  if (limit) q.push('limit=' + Number(limit));
  if (onConflict) q.push('on_conflict=' + encodeURIComponent(onConflict));
  return q.length ? '?' + q.join('&') : '';
}

const jget = (storage, k) => { try { const v = storage?.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };

export function createRestClient({ supabaseUrl, supabaseKey }, { fetchImpl, storage } = {}) {
  const BASE = supabaseUrl.replace(/\/+$/, '');
  const KEY = supabaseKey;
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const session = () => jget(ls, SKEY);
  const setSession = (s) => {
    if (!s) { try { ls?.removeItem(SKEY); } catch { /* blocked */ } return; }
    const expires_at = s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600);
    try {
      ls?.setItem(SKEY, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at,
        user: { id: s.user.id, email: s.user.email, user_metadata: s.user.user_metadata || {} } }));
    } catch { /* blocked */ }
  };

  async function call(path, { method = 'GET', body, headers = {}, auth = true, raw = false, keepalive = false } = {}) {
    if (auth) await fresh();
    const s = session();
    // Publishable keys (sb_publishable_…) are not JWTs: they go only in `apikey`.
    const bearer = auth && s ? s.access_token : (/^sb_/.test(KEY) ? null : KEY);
    const h = { apikey: KEY, ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers };
    let r;
    try { r = await doFetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), keepalive }); }
    catch (e) { const er = new Error('network'); er.network = true; throw er; }
    if (raw) { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; }
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
    if (!r.ok) {
      const e = new Error((j && (j.msg || j.message || j.error_description || j.error)) || `HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return j;
  }

  async function fresh() {
    const s = session();
    if (!s) throw new Error('signed out');
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false })
      .catch((e) => { if (/invalid|expired|not found/i.test(e.message)) setSession(null); throw e; });
    setSession(j);
    return session();
  }

  const withUser = (rows) => rows.map((r) => ('user_id' in r ? r : { user_id: session()?.user.id, ...r }));

  return {
    real: true,
    session,
    async signIn(email, password) {
      setSession(await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }));
      return true;
    },
    async signUp(email, password, name) {
      const j = await call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password, data: { name: name || email.split('@')[0] } } });
      const s = j?.access_token ? j : j?.session;
      if (s?.access_token) { setSession(s); return { session: true }; }
      return { session: false };
    },
    async recover(email) { await call('/auth/v1/recover', { method: 'POST', auth: false, body: { email } }); },
    async signOut() { try { await call('/auth/v1/logout', { method: 'POST' }); } catch { /* offline is fine */ } setSession(null); },
    select(table, opts = {}) { return call(`/rest/v1/${table}${query(opts)}`).then((r) => r || []); },
    upsert(table, rows, { onConflict, keepalive } = {}) {
      return call(`/rest/v1/${table}${query({ onConflict })}`, { method: 'POST', body: withUser(rows), keepalive, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    },
    insert(table, rows, { returning = false } = {}) {
      return call(`/rest/v1/${table}`, { method: 'POST', body: withUser(rows), headers: { Prefer: returning ? 'return=representation' : 'return=minimal' } });
    },
    remove(table, filters) { return call(`/rest/v1/${table}${query({ filters })}`, { method: 'DELETE' }); },
    async download(bucket, path, { isPublic = false } = {}) {
      const enc = path.split('/').map(encodeURIComponent).join('/');
      const r = isPublic ? await doFetch(`${BASE}/storage/v1/object/public/${bucket}/${enc}`) : await call(`/storage/v1/object/authenticated/${bucket}/${enc}`, { raw: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  };
}

let cached = null;
// The backend in use: an injected fake (tests) or the real Supabase project from config.js; null when unconfigured.
export function backend() {
  if (typeof window !== 'undefined' && window.__meleteeSupabase) return window.__meleteeSupabase;
  if (cached) return cached;
  const c = config();
  if (!c.supabaseUrl || !c.supabaseKey) return null;
  cached = createRestClient(c);
  return cached;
}

export function signedIn() { return !!backend()?.session(); }
export function user() { return backend()?.session()?.user || null; }
