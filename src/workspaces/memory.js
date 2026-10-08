// Memory tools: an acronym/mnemonic builder, a memory palace with a walk-through quiz,
// and a chunker for long lists and numbers.
import { h } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { iso } from '../core/dates.js';
import { uid, initials, chunkItems, chunk, walkScore, parseLines } from './c-core.js';
import { seg, field, input, area, empty, confirmDelete, aiSlot, backBtn, uiState } from './c-ui.js';

export default async function mount(root, api) {
  const T = api.t;
  const ui = uiState(api);
  let tab = ui.get('tab', 'acronym');
  let palaceId = ui.get('palace', null);
  let walk = null;

  root.classList.add('ws-c', 'ws-memory');

  const del = (key, id) => async () => {
    if (await confirmDelete(T('delete'))) { api.update(key, (xs) => (xs || []).filter((x) => x.id !== id), []); draw(); }
  };
  const delBtn = (key, id) => h('button.btn.ghost.small', { type: 'button', 'aria-label': T('delete'), onclick: del(key, id) }, '✕');

  // ---------- acronym ----------
  const acronymView = () => {
    const saved = api.data('mnemonics', []);
    const items = area({ name: 'items', rows: 5, placeholder: T('itemsPh') });
    const letters = h('p.ws-memory-letters', { 'aria-live': 'polite' });
    const sentence = input({ name: 'sentence', placeholder: T('sentencePh') });
    const title = input({ name: 'title', placeholder: T('mnTitlePh') });
    const show = () => {
      const ls = initials(parseLines(items.value));
      letters.replaceChildren(...(ls.length ? ls.map((l) => h('span', l)) : [h('span.muted.small', T('lettersEmpty'))]));
    };
    items.addEventListener('input', show);
    show();
    return h('div.stack-lg',
      h('form.stack', { onsubmit: (e) => {
        e.preventDefault();
        const list = parseLines(items.value);
        if (!list.length) { items.focus(); return; }
        api.update('mnemonics', (xs) => [{ id: uid('mn'), title: title.value.trim(), items: list, letters: initials(list).join(''), sentence: sentence.value.trim(), createdAt: iso() }, ...(xs || [])], []);
        draw();
      } },
        h('p.muted', T('acronymLede')),
        field(T('items'), items),
        h('div.stack.ws-c-tight', h('span.muted.small', T('letters')), letters),
        field(T('sentence'), sentence, T('sentenceHint')),
        field(T('mnTitle'), title),
        aiSlot(api, 'memory.mnemonic', { items }),
        h('button.btn.ws-c-main', { type: 'submit' }, '✨ ', T('saveMn'))),
      saved.length ? h('section.stack', h('h2', T('savedMn')),
        saved.map((m) => h('article.card.stack.ws-c-tight',
          h('div.row.ws-c-between', h('p.ws-memory-letters.ws-memory-letters-sm', m.letters.split('').map((l) => h('span', l))), delBtn('mnemonics', m.id)),
          m.title ? h('p.eyebrow', { style: { margin: 0 } }, m.title) : null,
          m.sentence ? h('p.ws-c-wrap', { style: { margin: 0 } }, h('strong', m.sentence)) : null,
          h('p.muted.small.ws-c-wrap', { style: { margin: 0 } }, m.items.join(' · '))))) : null);
  };

  // ---------- palace ----------
  const palaces = () => api.data('palaces', []);
  const patchPalace = (id, fn) => api.update('palaces', (xs) => (xs || []).map((p) => (p.id === id ? fn(p) : p)), []);
  const openPalace = (id) => { palaceId = id; walk = null; ui.set('palace', id); draw(); };

  const palaceList = () => {
    const all = palaces();
    const name = input({ name: 'palace', placeholder: T('palacePh') });
    return h('div.stack-lg',
      h('form.stack', { onsubmit: (e) => {
        e.preventDefault();
        const v = name.value.trim();
        if (!v) { name.focus(); return; }
        const p = { id: uid('pl'), name: v, loci: [], createdAt: iso() };
        api.update('palaces', (xs) => [p, ...(xs || [])], []);
        openPalace(p.id);
      } },
        h('p.muted', T('palaceLede')),
        field(T('palaceName'), name),
        h('button.btn.ws-c-main', { type: 'submit' }, '🏛 ', T('build'))),
      all.length ? h('section.stack', h('h2', T('palaces')),
        h('div.cards', all.map((p) => h('button.card.row-card', { type: 'button', onclick: () => openPalace(p.id) },
          h('span', { 'aria-hidden': 'true' }, '🏠'),
          h('div', { style: { minWidth: '0' } }, h('h3.ws-c-wrap', p.name), h('p.muted.small', tn('ws.memory.stops', p.loci.length))))))) : empty('🗝', T('palaceEmpty')));
  };

  const palaceView = (p) => {
    if (walk) return walkView(p);
    const place = input({ name: 'place', placeholder: T('placePh') });
    const item = input({ name: 'item', placeholder: T('itemPh') });
    const image = area({ name: 'image', rows: 2, placeholder: T('imagePh') });
    return h('div.stack-lg',
      backBtn(T('allPalaces'), () => openPalace(null)),
      h('div', h('p.eyebrow', T('palace')), h('h2.ws-c-wrap', p.name)),
      p.loci.length ? h('ol.plain.ws-memory-loci', p.loci.map((l, i) => h('li.ws-memory-locus',
        h('span.ws-memory-num', { 'aria-hidden': 'true' }, String(i + 1)),
        h('div', { style: { flex: '1', minWidth: '0' } },
          h('strong.ws-c-wrap', l.place),
          h('p.ws-c-wrap', { style: { margin: '2px 0 0' } }, '→ ', l.item),
          l.image ? h('p.muted.small.ws-c-wrap', { style: { margin: '2px 0 0' } }, '🎨 ', l.image) : null),
        h('button.btn.ghost.small', { type: 'button', 'aria-label': T('removeStop'), onclick: () => { patchPalace(p.id, (x) => ({ ...x, loci: x.loci.filter((y) => y.id !== l.id) })); draw(); } }, '✕')))) : null,
      p.loci.length >= 2 ? h('div', h('button.btn.soft', { type: 'button', onclick: () => { walk = { i: 0, shown: false, results: [] }; draw(); } }, '🚶 ', T('walk'))) : null,
      h('form.card.stack', { onsubmit: (e) => {
        e.preventDefault();
        if (!place.value.trim()) { place.focus(); return; }
        if (!item.value.trim()) { item.focus(); return; }
        patchPalace(p.id, (x) => ({ ...x, loci: [...x.loci, { id: uid('lc'), place: place.value.trim(), item: item.value.trim(), image: image.value.trim() }] }));
        draw();
        root.querySelector('input[name=place]')?.focus();
      } },
        h('p.eyebrow', T('stopN', { n: p.loci.length + 1 })),
        field(T('place'), place), field(T('item'), item), field(T('image'), image, T('imageHint')),
        aiSlot(api, 'memory.image', { palace: p }),
        h('div', h(p.loci.length >= 2 ? 'button.btn.small' : 'button.btn', { type: 'submit' }, T('addStop')))),
      h('div', h('button.btn.ghost.small.ws-c-danger', { type: 'button', onclick: async () => {
        if (await confirmDelete(T('delete'))) { api.update('palaces', (xs) => (xs || []).filter((x) => x.id !== p.id), []); openPalace(null); }
      } }, T('deletePalace'))));
  };

  const walkView = (p) => {
    const total = p.loci.length;
    if (walk.i >= total) {
      const s = walkScore(walk.results);
      const missed = p.loci.filter((_, i) => !walk.results[i]);
      return h('div.stack-lg.center.ws-c-done',
        h('p.ws-c-big', { 'aria-hidden': 'true' }, s.got === s.total ? '🏆' : '🌱'),
        h('h2', T('walkDone', { got: s.got, total: s.total })),
        missed.length ? h('p.muted', T('walkMissed'), ' ', missed.map((l) => l.place).join(', ')) : h('p.muted', T('walkPerfect')),
        h('div.row', { style: { justifyContent: 'center' } },
          h('button.btn', { type: 'button', onclick: () => { walk = { i: 0, shown: false, results: [] }; draw(); } }, T('walkAgain')),
          h('button.btn.ghost', { type: 'button', onclick: () => { walk = null; draw(); } }, T('walkExit'))));
    }
    const l = p.loci[walk.i];
    const mark = (ok) => { walk.results[walk.i] = ok; walk.i += 1; walk.shown = false; draw(); root.querySelector('.ws-memory-walk button')?.focus(); };
    return h('div.stack-lg',
      backBtn(T('walkExit'), () => { walk = null; draw(); }),
      h('div.card.stack.center.ws-memory-walk',
        h('p.eyebrow', T('stopOf', { n: walk.i + 1, total })),
        h('p.ws-c-big', { 'aria-hidden': 'true' }, '🚪'),
        h('h2.ws-c-wrap', l.place),
        walk.shown
          ? [h('p.ws-memory-reveal.ws-c-wrap', l.item), l.image ? h('p.muted.small.ws-c-wrap', '🎨 ', l.image) : null,
              h('div.row', { style: { justifyContent: 'center' } },
                h('button.btn', { type: 'button', onclick: () => mark(true) }, '✓ ', T('gotIt')),
                h('button.btn.ghost', { type: 'button', onclick: () => mark(false) }, T('missed')))]
          : [h('p.muted', T('whatsHere')),
              h('button.btn', { type: 'button', onclick: () => { walk.shown = true; draw(); root.querySelector('.ws-memory-walk .btn')?.focus(); } }, T('reveal'))]));
  };

  // ---------- chunk ----------
  const chunkView = () => {
    const saved = api.data('chunks', []);
    let size = 4;
    let labels = [];
    let lastKey = '';
    const text = area({ name: 'chunkText', rows: 4, placeholder: T('chunkPh') });
    const title = input({ name: 'chunkTitle', placeholder: T('chunkTitlePh') });
    const preview = h('div.ws-memory-chunks', { 'aria-live': 'polite' });
    const sizeSeg = h('div');
    const current = () => { const c = chunkItems(text.value); return { ...c, groups: chunk(c.items, size) }; };
    const render = () => {
      const c = current();
      const key = `${c.items.join('\u0001')}|${size}`;
      if (key !== lastKey) { labels = c.groups.map((_, i) => labels[i] || ''); lastKey = key; }
      sizeSeg.replaceChildren(seg([[3, '3'], [4, '4'], [5, '5']], size, (v) => { size = v; render(); }, T('size')));
      preview.replaceChildren(...(c.items.length
        ? c.groups.map((g, i) => h('div.ws-memory-chunk',
            h('p.ws-memory-chunk-items.ws-c-wrap', c.digits ? g.join('') : g.join(' · ')),
            input({ value: labels[i], 'aria-label': T('chunkLabel', { n: i + 1 }), placeholder: T('labelPh'), oninput: (e) => { labels[i] = e.target.value; } })))
        : [h('p.muted.small', T('chunkEmpty'))]));
    };
    text.addEventListener('input', render);
    render();
    return h('div.stack-lg',
      h('form.stack', { onsubmit: (e) => {
        e.preventDefault();
        const c = current();
        if (!c.items.length) { text.focus(); return; }
        api.update('chunks', (xs) => [{ id: uid('ch'), title: title.value.trim(), digits: c.digits, size, groups: c.groups.map((g, i) => ({ items: g, label: labels[i] || '' })), createdAt: iso() }, ...(xs || [])], []);
        draw();
      } },
        h('p.muted', T('chunkLede')),
        field(T('chunkText'), text),
        h('div.row.ws-c-between', h('span.muted.small', T('size')), sizeSeg),
        preview,
        field(T('chunkTitle'), title),
        h('button.btn.ws-c-main', { type: 'submit' }, '🧩 ', T('saveChunks'))),
      saved.length ? h('section.stack', h('h2', T('savedChunks')),
        saved.map((s) => h('article.card.stack.ws-c-tight',
          h('div.row.ws-c-between', h('strong.ws-c-wrap', s.title || tn('ws.memory.groups', s.groups.length)), delBtn('chunks', s.id)),
          h('div.ws-memory-chunks.ws-memory-chunks-sm', s.groups.map((g) => h('div.ws-memory-chunk',
            h('p.ws-memory-chunk-items.ws-c-wrap', s.digits ? g.items.join('') : g.items.join(' · ')),
            g.label ? h('p.muted.small.ws-c-wrap', { style: { margin: 0 } }, g.label) : null)))))) : null);
  };

  const draw = () => {
    let body;
    if (tab === 'palace') { const p = palaceId && palaces().find((x) => x.id === palaceId); body = p ? palaceView(p) : palaceList(); }
    else body = tab === 'chunk' ? chunkView() : acronymView();
    root.replaceChildren(
      seg([['acronym', T('tab.acronym')], ['palace', T('tab.palace')], ['chunk', T('tab.chunk')]], tab, (v) => { tab = v; walk = null; ui.set('tab', v); draw(); }, T('tabs')),
      body);
  };
  draw();
}
