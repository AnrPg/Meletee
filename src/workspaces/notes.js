// Note templates: Cornell, question-based, concept map, comparison table, one-page
// summary and learning objectives as a checklist. Every note has a title and a topic.
import { h } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { iso, nice } from '../core/dates.js';
import { uid, parseLines, mapOutline, tableAddCol, tableAddRow, tableDelCol, tableDelRow } from './c-core.js';
import { field, input, area, empty, confirmDelete, aiSlot, backBtn, uiState } from './c-ui.js';

export const TYPES = ['cornell', 'questions', 'map', 'table', 'summary', 'objectives'];
export const TYPE_EMOJI = { cornell: '📐', questions: '❔', map: '🕸', table: '⚖️', summary: '📄', objectives: '☑️' };

const blank = (type) => ({
  cornell: { rows: [{ cue: '', note: '' }, { cue: '', note: '' }], summary: '' },
  questions: { rows: [{ cue: '', note: '' }] },
  map: { nodes: [] },
  table: { cols: ['', ''], rows: [{ label: '', cells: ['', ''] }, { label: '', cells: ['', ''] }] },
  summary: { memory: '', missed: '' },
  objectives: { items: [] },
}[type]);

const words = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

export default async function mount(root, api) {
  const T = api.t;
  const ui = uiState(api);
  let type = ui.get('type', 'cornell');
  let openId = ui.get('open', null);
  let ref = null;
  let cover = false;
  const revealed = new Set();
  const notes = () => api.data('notes', []);
  const save = (fn) => api.update('notes', (xs) => fn(xs || []), []);
  const patch = (id, fn) => save((xs) => xs.map((n) => (n.id === id ? { ...fn(n), updatedAt: iso() } : n)));
  const go = (id) => { openId = id; cover = false; revealed.clear(); ui.set('open', id); draw(); };

  root.classList.add('ws-c', 'ws-notes');

  // ---------- list ----------
  const listView = () => {
    const mine = notes().filter((n) => n.type === type);
    const title = input({ name: 'title', placeholder: T(`titlePh.${type}`) });
    const pick = api.courses().length ? api.topicPicker(ref, (v) => { ref = v; }) : null;
    return h('div.stack-lg',
      h('div.tabs.ws-notes-types', { role: 'group', 'aria-label': T('templates') }, TYPES.map((k) => h('button.chip', {
        type: 'button', 'aria-pressed': String(k === type), 'data-type': k,
        onclick: () => { type = k; ui.set('type', k); draw(); },
      }, `${TYPE_EMOJI[k]} ${T(`type.${k}`)}`))),
      h('form.stack', { onsubmit: (e) => {
        e.preventDefault();
        const n = { id: uid('nt'), type, title: title.value.trim() || `${T(`type.${type}`)} · ${nice(iso())}`, ref, body: blank(type), createdAt: iso(), updatedAt: iso() };
        save((xs) => [n, ...xs]);
        go(n.id);
      } },
        h('p.muted', T(`about.${type}`)),
        field(T('title'), title),
        pick ? field(T('topic'), pick) : null,
        h('button.btn.ws-c-main', { type: 'submit' }, '＋ ', T(`new.${type}`))),
      mine.length
        ? h('section.stack', h('h2', T('saved')),
            h('div.list', mine.map((n) => h('button.ws-notes-item', { type: 'button', onclick: () => go(n.id) },
              h('span.label', n.title),
              h('span.muted.small', [api.topicName(n.ref), n.updatedAt ? nice(n.updatedAt) : ''].filter(Boolean).join(' · '))))))
        : empty(TYPE_EMOJI[type], T('empty')));
  };

  // ---------- editor ----------
  const editor = (n) => {
    const title = input({ name: 'title', value: n.title, oninput: () => patch(n.id, (x) => ({ ...x, title: title.value })) });
    const pick = api.courses().length ? api.topicPicker(n.ref, (v) => patch(n.id, (x) => ({ ...x, ref: v }))) : null;
    const body = (fn) => patch(n.id, (x) => ({ ...x, body: fn(x.body) }));
    const redraw = () => draw();
    return h('div.stack-lg',
      backBtn(T('all'), () => go(null)),
      h('div.stack',
        h('p.eyebrow', `${TYPE_EMOJI[n.type]} ${T(`type.${n.type}`)}`),
        field(T('title'), title),
        pick ? field(T('topic'), pick) : null),
      EDITORS[n.type](n, body, redraw),
      aiSlot(api, `notes.${n.type}`, { note: n }),
      h('p.muted.small', '💾 ', T('autosave')),
      h('div', h('button.btn.ghost.small.ws-c-danger', { type: 'button', onclick: async () => {
        if (await confirmDelete(T('delete'))) { save((xs) => xs.filter((x) => x.id !== n.id)); go(null); }
      } }, T('delete'))));
  };

  // Cornell and question notes share one "cue + note" editor with a cover-and-answer mode.
  const pairs = (n, body, redraw, kind) => {
    const rows = n.body.rows;
    const isQ = kind === 'questions';
    const coverBtn = h('button.btn.soft.small', { type: 'button', 'aria-pressed': String(cover), onclick: () => { cover = !cover; revealed.clear(); redraw(); } },
      cover ? `👀 ${T('uncover')}` : `🙈 ${isQ ? T('quizMe') : T('cover')}`);
    const row = (r, i) => {
      const cue = (isQ ? input : area)({ 'aria-label': T(isQ ? 'qLabel' : 'cueLabel', { n: i + 1 }), placeholder: T(isQ ? 'qPh' : 'cuePh'), value: isQ ? r.cue : undefined, rows: isQ ? undefined : 3,
        oninput: (e) => body((b) => ({ ...b, rows: b.rows.map((x, j) => (j === i ? { ...x, cue: e.target.value } : x)) })) }, isQ ? undefined : r.cue);
      const hidden = cover && !revealed.has(i);
      const note = hidden
        ? h('button.ws-notes-covered', { type: 'button', onclick: () => { revealed.add(i); redraw(); } }, T('reveal'))
        : area({ 'aria-label': T(isQ ? 'aLabel' : 'noteLabel', { n: i + 1 }), rows: isQ ? 4 : 3, placeholder: T(isQ ? 'aPh' : 'notePh'),
            oninput: (e) => body((b) => ({ ...b, rows: b.rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })) }, r.note);
      return h(isQ ? 'div.ws-notes-qa' : 'div.ws-notes-cornell-row', cue, note,
        rows.length > 1 && !cover ? h('button.ws-c-x', { type: 'button', 'aria-label': T('removeRow'), onclick: () => { body((b) => ({ ...b, rows: b.rows.filter((_, j) => j !== i) })); redraw(); } }, '✕') : null);
    };
    return h('div.stack',
      h('div.row.ws-c-between', h('p.muted.small.ws-c-wrap', { style: { margin: 0, flex: '1', minWidth: '0' } }, T(isQ ? 'qHint' : 'cornellHint')), coverBtn),
      isQ ? null : h('div.ws-notes-cornell-head', { 'aria-hidden': 'true' }, h('span', T('cues')), h('span', T('notesCol'))),
      h('div.stack', rows.map(row)),
      cover ? null : h('div', h('button.btn.ghost.small', { type: 'button', onclick: () => { body((b) => ({ ...b, rows: [...b.rows, { cue: '', note: '' }] })); redraw(); } }, '＋ ', T(isQ ? 'addQ' : 'addChunk'))),
      isQ ? null : field(T('summary'), area({ rows: 3, placeholder: T('summaryPh'), oninput: (e) => body((b) => ({ ...b, summary: e.target.value })) }, n.body.summary || '')));
  };

  const mapEditor = (n, body, redraw) => {
    const nodes = n.body.nodes;
    const label = input({ name: 'node', placeholder: T('nodePh') });
    const opts = () => nodes.map((x) => h('option', { value: x.id }, x.label));
    const from = h('select.field', { name: 'from' }, opts());
    const to = h('select.field', { name: 'to' }, opts());
    if (nodes.length > 1) to.selectedIndex = 1;
    const rel = input({ name: 'rel', placeholder: T('relPh'), list: 'ws-notes-rels' });
    const outline = mapOutline(nodes);
    return h('div.stack-lg',
      h('form.stack', { onsubmit: (e) => {
        e.preventDefault();
        const v = label.value.trim();
        if (!v) { label.focus(); return; }
        body((b) => ({ ...b, nodes: [...b.nodes, { id: uid('n'), label: v, links: [] }] }));
        redraw();
        root.querySelector('input[name=node]')?.focus();
      } },
        h('p.muted.small', T('mapHint')),
        h('div.ws-c-inline', field(T('node'), label), h('button.btn.small', { type: 'submit' }, T('addNode')))),
      nodes.length > 1 ? h('form.card.stack', { onsubmit: (e) => {
        e.preventDefault();
        if (!from.value || !to.value || from.value === to.value) return;
        body((b) => ({ ...b, nodes: b.nodes.map((x) => (x.id === from.value ? { ...x, links: [...x.links.filter((l) => l.to !== to.value), { to: to.value, rel: rel.value.trim() }] } : x)) }));
        redraw();
      } },
        h('p.eyebrow', T('connect')),
        field(T('from'), from), field(T('rel'), rel), field(T('to'), to),
        h('datalist', { id: 'ws-notes-rels' }, ['causes', 'leadsTo', 'isExampleOf', 'requires', 'inhibits', 'partOf'].map((k) => h('option', { value: T(`rels.${k}`) }))),
        h('div', h('button.btn.small', { type: 'submit' }, '🔗 ', T('link')))) : null,
      nodes.length ? h('section.stack',
        h('h3', T('mapView')),
        h('ul.plain.ws-notes-map', { 'aria-label': T('mapView') }, outline.map((o) => h('li', { style: `--d:${Math.min(o.depth, 6)}`, class: o.ref ? 'ws-notes-ref' : '' },
          o.depth ? h('span.muted.small', '↳ ', o.rel ? `${o.rel} → ` : '') : null,
          h(o.depth ? 'span' : 'strong', o.label), o.ref ? h('span.muted.small', ' ↺') : null))),
        h('details.ws-c-details', h('summary', T('editNodes')),
          h('ul.plain', nodes.map((x) => h('li.stack.ws-c-tight',
            h('div.row.ws-c-between', h('strong.ws-c-wrap', x.label),
              h('button.btn.ghost.small', { type: 'button', 'aria-label': T('removeNode'), onclick: () => {
                body((b) => ({ ...b, nodes: b.nodes.filter((y) => y.id !== x.id).map((y) => ({ ...y, links: y.links.filter((l) => l.to !== x.id) })) })); redraw();
              } }, '✕')),
            x.links.map((l) => h('div.row.ws-c-between.small', h('span.muted.ws-c-wrap', `→ ${l.rel || '…'} → ${nodes.find((y) => y.id === l.to)?.label || ''}`),
              h('button.btn.ghost.small', { type: 'button', 'aria-label': T('removeLink'), onclick: () => {
                body((b) => ({ ...b, nodes: b.nodes.map((y) => (y.id === x.id ? { ...y, links: y.links.filter((z) => z.to !== l.to) } : y)) })); redraw();
              } }, '✕')))))))) : null);
  };

  const tableEditor = (n, body, redraw) => {
    const g = n.body;
    const set = (fn) => body((b) => fn(b));
    // keep each cell's accessible name in step with the headers as they are typed
    const relabel = (e) => {
      const tbl = e.target.closest('table');
      const cols = [...tbl.querySelectorAll('thead input')].map((x, j) => x.value.trim() || T('colLabel', { n: j + 1 }));
      tbl.querySelectorAll('tbody tr').forEach((tr, i) => {
        const row = tr.querySelector('th input').value.trim() || T('rowLabel', { n: i + 1 });
        tr.querySelectorAll('td textarea').forEach((ta, j) => ta.setAttribute('aria-label', `${row} × ${cols[j]}`));
      });
    };
    return h('div.stack',
      h('p.muted.small', T('tableHint')),
      h('div.ws-notes-table-wrap', { tabindex: '0', role: 'region', 'aria-label': T('type.table') },
        h('table.ws-notes-table',
          h('thead', h('tr', h('th', { scope: 'col' }, h('span.muted.small', T('feature'))),
            g.cols.map((c, j) => h('th', { scope: 'col' },
              h('div.ws-c-cell', input({ value: c, 'aria-label': T('colLabel', { n: j + 1 }), placeholder: T('colPh'),
                oninput: (e) => { relabel(e); set((b) => ({ ...b, cols: b.cols.map((x, k) => (k === j ? e.target.value : x)) })); } }),
              g.cols.length > 1 ? h('button.ws-c-x', { type: 'button', 'aria-label': T('removeCol'), onclick: () => { set((b) => tableDelCol(b, j)); redraw(); } }, '✕') : null))))),
          h('tbody', g.rows.map((r, i) => h('tr',
            h('th', { scope: 'row' }, h('div.ws-c-cell', input({ value: r.label, 'aria-label': T('rowLabel', { n: i + 1 }), placeholder: T('rowPh'),
              oninput: (e) => { relabel(e); set((b) => ({ ...b, rows: b.rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })); } }),
              g.rows.length > 1 ? h('button.ws-c-x', { type: 'button', 'aria-label': T('removeRowT'), onclick: () => { set((b) => tableDelRow(b, i)); redraw(); } }, '✕') : null)),
            r.cells.map((c, j) => h('td', area({ rows: 2, value: undefined, 'aria-label': `${r.label || T('rowLabel', { n: i + 1 })} × ${g.cols[j] || T('colLabel', { n: j + 1 })}`,
              oninput: (e) => set((b) => ({ ...b, rows: b.rows.map((x, k) => (k === i ? { ...x, cells: x.cells.map((y, m) => (m === j ? e.target.value : y)) } : x)) })) }, c)))))))),
      h('div.row',
        h('button.btn.ghost.small', { type: 'button', onclick: () => { set((b) => tableAddCol(b)); redraw(); } }, '＋ ', T('addCol')),
        h('button.btn.ghost.small', { type: 'button', onclick: () => { set((b) => tableAddRow(b)); redraw(); } }, '＋ ', T('addRow'))));
  };

  const summaryEditor = (n, body) => {
    const count = h('span.muted.small');
    const upd = (v) => { count.textContent = `${tn('ws.notes.words', words(v))} · ${T('pageLimit')}`; count.classList.toggle('ws-c-over', words(v) > 500); };
    const mem = area({ rows: 10, placeholder: T('memoryPh'), oninput: (e) => { upd(e.target.value); body((b) => ({ ...b, memory: e.target.value })); } }, n.body.memory || '');
    upd(n.body.memory);
    return h('div.stack',
      h('p.muted.small', T('summaryHint')),
      field(T('fromMemory'), mem), count,
      field(T('missed'), area({ rows: 4, placeholder: T('missedPh'), oninput: (e) => body((b) => ({ ...b, missed: e.target.value })) }, n.body.missed || '')));
  };

  const objectivesEditor = (n, body, redraw) => {
    const items = n.body.items;
    const done = items.filter((x) => x.done).length;
    const paste = area({ name: 'paste', rows: items.length ? 3 : 6, placeholder: T('pastePh') });
    const add = h('form.stack', { onsubmit: (e) => {
      e.preventDefault();
      const lines = parseLines(paste.value);
      if (!lines.length) { paste.focus(); return; }
      body((b) => ({ ...b, items: [...b.items, ...lines.map((text) => ({ id: uid('o'), text, done: false }))] }));
      redraw();
    } }, field(items.length ? T('addMore') : T('paste'), paste), h('div', h('button.btn' + (items.length ? '.ghost.small' : ''), { type: 'submit' }, T('makeList'))));
    if (!items.length) return h('div.stack', h('p.muted.small', T('objHint')), add);
    return h('div.stack',
      h('p.muted.small', T('objTick')),
      h('div', h('p.small', { style: { margin: '0 0 4px' } }, h('strong', T('objProgress', { done, total: items.length })), done === items.length ? ' 🎉' : ''),
        h('div.progress', h('span', { style: { width: `${Math.round((done / items.length) * 100)}%` } }))),
      h('ul.plain.ws-notes-objs', items.map((o) => h('li.row.ws-c-between',
        h('label.check', { style: { flex: '1', minWidth: '0' } },
          h('input', { type: 'checkbox', checked: o.done, onchange: (e) => { body((b) => ({ ...b, items: b.items.map((x) => (x.id === o.id ? { ...x, done: e.target.checked } : x)) })); redraw(); } }),
          h('span.ws-c-wrap', o.text)),
        h('button.btn.ghost.small', { type: 'button', 'aria-label': T('removeObj'), onclick: () => { body((b) => ({ ...b, items: b.items.filter((x) => x.id !== o.id) })); redraw(); } }, '✕')))),
      h('details.ws-c-details', h('summary', T('addMore')), h('div', { style: { marginTop: '12px' } }, add)));
  };

  const EDITORS = {
    cornell: (n, b, r) => pairs(n, b, r, 'cornell'),
    questions: (n, b, r) => pairs(n, b, r, 'questions'),
    map: mapEditor,
    table: tableEditor,
    summary: summaryEditor,
    objectives: objectivesEditor,
  };

  const draw = () => {
    const n = openId && notes().find((x) => x.id === openId);
    const y = window.scrollY;
    const same = n && root.dataset.open === n.id;
    root.dataset.open = n ? n.id : '';
    root.replaceChildren(n ? editor(n) : listView());
    if (same) window.scrollTo(0, y);
  };
  draw();
}
