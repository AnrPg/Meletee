// A fake Supabase backend for tests (never touches the network). Load it before the app:
//   page.addInitScript({ path: 'tests/fixtures/fake-supabase.js' })   (browser)
//   import './fixtures/fake-supabase.js' after defining globalThis.window / localStorage (node)
// It implements the backend interface of src/cloud/client.js and keeps its "database" in
// localStorage under __fakeSupabase so it survives page reloads. Seed it with window.__fakeSeed(db).
(function () {
  const W = typeof window !== 'undefined' ? window : globalThis;
  const LS = W.localStorage;
  const DBK = '__fakeSupabase';
  const SK = 'meletee1:cloud:session';
  const USER = { id: '11111111-2222-3333-4444-555555555555', email: 'ada@example.com' };
  const load = () => { try { return JSON.parse(LS.getItem(DBK)) || { tables: {}, storage: {}, seq: 1, log: [] }; } catch { return { tables: {}, storage: {}, seq: 1, log: [] }; } };
  const save = (db) => LS.setItem(DBK, JSON.stringify(db));
  const get = (row, col) => {
    const m = col.match(/^(\w+)((?:->>?\w+)*)$/);
    if (!m) return row[col];
    let v = row[m[1]];
    for (const p of m[2].match(/->>?\w+/g) || []) { const k = p.replace(/^->>?/, ''); v = v == null ? v : (typeof v === 'string' ? JSON.parse(v) : v)[k]; }
    return v;
  };
  const like = (val, pat) => new RegExp('^' + pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(String(val));
  const match = (row, filters = []) => filters.every(([c, op, v]) => {
    const x = get(row, c);
    if (op === 'eq') return String(x) === String(v);
    if (op === 'like') return like(x, v);
    if (op === 'gt') return String(x) > String(v);
    return false;
  });
  const fail = () => { const db = load(); if (db.offline) { const e = new Error('network'); e.network = true; throw e; } return db; };
  const uid = () => JSON.parse(LS.getItem(SK) || 'null')?.user.id;
  const mine = (db, t) => (db.tables[t] ||= []).filter((r) => r.user_id === uid());

  W.__fakeSeed = (seed) => { const db = load(); Object.assign(db, seed); save(db); };
  W.__fakeDb = load;
  W.__fakeSave = save;
  W.__meleteeSupabase = {
    fake: true,
    session() { return JSON.parse(LS.getItem(SK) || 'null'); },
    // Accounts: ada@example.com (password 'correct-horse') always exists, like a noema-lite account.
    // Sign-ups are kept in db.users; with db.autoConfirm they are signed in at once, otherwise they must
    // be confirmed first (window.__fakeConfirm(email)).
    async signIn(email, password) {
      const db = fail();
      const u = (db.users || []).find((x) => x.email === email);
      if (u ? u.password !== password : password !== 'correct-horse') throw new Error('Invalid login credentials');
      if (u && !u.confirmed) throw new Error('Email not confirmed');
      LS.setItem(SK, JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9e9, user: { ...(u ? { id: u.id } : USER), email } }));
      db.log.push({ op: 'signIn', email }); save(db);
      return true;
    },
    async signUp(email, password, name) {
      const db = fail();
      if (password.length < 8) throw new Error('Password should be at least 8 characters');
      if (email === USER.email || (db.users || []).some((x) => x.email === email)) throw new Error('User already registered');
      const u = { id: '99999999-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0'), email, password, name, confirmed: !!db.autoConfirm };
      (db.users ||= []).push(u); db.log.push({ op: 'signUp', email }); save(db);
      if (!db.autoConfirm) return { session: false };
      LS.setItem(SK, JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9e9, user: { id: u.id, email } }));
      return { session: true };
    },
    async recover(email) { const db = fail(); db.log.push({ op: 'recover', email }); save(db); },
    async fromLink({ access_token }) {
      const db = fail();
      if (access_token !== 'link-token') throw new Error('invalid JWT');
      LS.setItem(SK, JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9e9, user: USER }));
      db.log.push({ op: 'fromLink' }); save(db);
      return true;
    },
    async setPassword(password) { const db = fail(); db.log.push({ op: 'setPassword', n: password.length }); save(db); },
    async signOut() { LS.removeItem(SK); },
    async select(table, { filters = [], order, limit } = {}) {
      const db = fail();
      let rows = mine(db, table).filter((r) => match(r, filters));
      if (order) { const [col, dir] = order.split('.'); rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === 'desc' ? -1 : 1)); }
      if (limit) rows = rows.slice(0, limit);
      return JSON.parse(JSON.stringify(rows));
    },
    async upsert(table, rows, { onConflict = 'id' } = {}) {
      const db = fail(); const cols = onConflict.split(',');
      const tbl = (db.tables[table] ||= []);
      for (const r0 of rows) {
        const r = { user_id: uid(), ...r0, synced_at: new Date().toISOString() };
        const i = tbl.findIndex((x) => cols.every((c) => x[c] === r[c]));
        i >= 0 ? (tbl[i] = { ...tbl[i], ...r }) : tbl.push(r);
      }
      db.log.push({ op: 'upsert', table, n: rows.length });
      save(db);
    },
    async insert(table, rows) {
      const db = fail(); const tbl = (db.tables[table] ||= []);
      for (const r of rows) tbl.push({ id: db.seq++, user_id: uid(), created_at: new Date(Date.now() + db.seq).toISOString(), ...r });
      db.log.push({ op: 'insert', table, n: rows.length });
      save(db);
    },
    async remove(table, filters) {
      const db = fail();
      db.tables[table] = (db.tables[table] || []).filter((r) => !(r.user_id === uid() && match(r, filters)));
      db.log.push({ op: 'remove', table });
      save(db);
    },
    // SQL functions (POST /rest/v1/rpc/<fn>): a test defines window.__fakeRpc[fn] = (db, args, uid) => result.
    async rpc(fn, args = {}) {
      const db = fail();
      const f = W.__fakeRpc?.[fn];
      if (!f) throw new Error(`Could not find the function public.${fn}`);
      const out = f(db, args, uid());
      db.log.push({ op: 'rpc', fn });
      save(db);
      return out === undefined ? null : JSON.parse(JSON.stringify(out));
    },
    async download(bucket, path) {
      const db = fail(); const v = db.storage[`${bucket}/${path}`];
      if (!v) throw new Error('HTTP 404');
      return JSON.parse(JSON.stringify(v));
    },
  };
  W.__fakeUser = USER;
  W.__fakeConfirm = (email) => { const db = load(); const u = (db.users || []).find((x) => x.email === email); if (u) u.confirmed = true; save(db); };
})();
