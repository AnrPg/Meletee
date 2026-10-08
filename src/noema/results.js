// Writing study results back to noema-lite — only through a safe, append-only path.
// noema-lite stores progress as one JSON blob per subject (s:<subject>:state) and its open tabs
// overwrite that blob on every save, so Meletee never writes it. Instead Meletee appends one row per
// batch to noema_kv under `a:inbox:meletee:<id>` (schema noema.results/v1), which noema-lite merges
// into its state and then deletes, the same way it already handles `a:curin:` rows from the Claude app.
// noema-lite announces that it does this with `a:caps` = { "resultsInbox": 1 }. Until then results
// wait on this device in an outbox (docs/NOEMA.md, change 3).
import * as store from '../core/store.js';
import { backend } from '../cloud/client.js';
import { caps } from './source.js';

export const SCHEMA = 'noema.results/v1';
const MAX = 500;
const outKey = () => `meletee1:${store.account()}:cache:noemaOutbox`;
const read = () => { try { return JSON.parse(localStorage.getItem(outKey()) || '[]'); } catch { return []; } };
const write = (l) => { try { localStorage.setItem(outKey(), JSON.stringify(l.slice(-MAX))); } catch { /* full */ } };
export const outbox = read;

// Pure: what changed on noema-linked topics between two versions of the course list.
// item: { subject, kind: 'section'|'chapter', id, event: 'studied'|'review', rating?, at }
export function diffResults(before = [], after = [], at = new Date().toISOString()) {
  const prev = new Map();
  for (const c of before) for (const t of c.topics || []) prev.set(t.id, t);
  const out = [];
  for (const c of after) for (const t of c.topics || []) {
    if (!t.noema?.subject) continue;
    const p = prev.get(t.id);
    const kind = t.noema.section ? 'section' : 'chapter';
    const id = t.noema.section || t.noema.chapter;
    if (t.studiedAt && !p?.studiedAt) out.push({ subject: t.noema.subject, kind, id, event: 'studied', at });
    const was = p?.reviewLog?.length || 0;
    for (const r of (t.reviewLog || []).slice(was)) out.push({ subject: t.noema.subject, kind, id, event: 'review', rating: r.rating, date: r.date, at });
  }
  return out;
}

// Pure: inbox rows, one per subject.
export function inboxRows(items, { now = Date.now(), rand = () => Math.random().toString(36).slice(2, 8) } = {}) {
  const by = {};
  for (const i of items) (by[i.subject] ||= []).push(i);
  return Object.entries(by).map(([subject, list]) => ({
    key: `a:inbox:meletee:${now.toString(36)}${rand()}`,
    value: JSON.stringify({ schema: SCHEMA, app: 'meletee', subject, items: list.map(({ subject: _s, ...x }) => x), at: new Date(now).toISOString() }),
    updated_at: new Date(now).toISOString(),
  }));
}

export function record(items) { if (items.length) write([...read(), ...items]); }

export async function flush() {
  const list = read();
  const b = backend();
  if (!list.length || !b?.session()) return 0;
  if (!(await caps()).resultsInbox) return 0;   // noema-lite cannot take them yet: keep them
  await b.upsert('noema_kv', inboxRows(list), { onConflict: 'user_id,key' });
  write([]);
  return list.length;
}

let last = null;
export function watch() {
  last = store.get('courses', []);
  store.onChange((name, value) => {
    if (name !== 'courses') return;
    record(diffResults(last, value || []));
    last = value || [];
    flush().catch(() => {});
  });
  // a pull from another device is not "done here": re-baseline without recording
  addEventListener('meletee:pulled', () => { last = store.get('courses', []); });
}
