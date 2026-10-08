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
  W.__meleteeSupabase = {
    fake: true,
    session() { return JSON.parse(LS.getItem(SK) || 'null'); },
    async signIn(email, password) {
      if (password !== 'correct-horse') throw new Error('Invalid login credentials');
      LS.setItem(SK, JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9e9, user: { ...USER, email } }));
      return true;
    },
    async signUp(email, password) { if (password.length < 8) throw new Error('Password should be at least 8 characters'); return { session: false }; },
    async recover() {},
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
    async download(bucket, path) {
      const db = fail(); const v = db.storage[`${bucket}/${path}`];
      if (!v) throw new Error('HTTP 404');
      return JSON.parse(JSON.stringify(v));
    },
  };
  W.__fakeUser = USER;
})();
