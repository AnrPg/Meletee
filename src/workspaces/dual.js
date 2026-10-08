// Dual coding: sketch a diagram or flowchart next to a few words, save it,
// and later redraw it from memory and compare the two side by side.
import { h, toast } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { confirmSheet } from '../ui/forms.js';
import { sketchPad, sketchView, toPNG } from './b-sketch.js';
import { uid, now, when, aiSlot, field } from './b-ui.js';

export default async function mount(root, api) {
  const t = api.t;
  const el = h('div.ws-b.ws-dual');
  root.append(el);
  const all = () => api.data('sketches', []);
  const get = (id) => all().find((s) => s.id === id) || null;
  const put = (s) => api.update('sketches', (l) => (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [s, ...l]), []);
  const view = () => api.data('view', { page: 'draw' });
  const go = (v) => { api.save('view', v); draw(); };

  const draw = () => {
    const v = view();
    const s = v.id && get(v.id);
    if (s && v.page === 'detail') el.replaceChildren(detail(s));
    else if (s && v.page === 'redraw') el.replaceChildren(redraw(s));
    else if (s && v.page === 'compare') el.replaceChildren(compare(s, s.attempts?.[0]));
    else el.replaceChildren(drawing());
    el.querySelector('[data-focus]')?.focus();
  };

  // ---- 1. sketch + words ----
  function drawing() {
    const empty = { title: '', words: '', strokes: [] };
    const d = api.data('draft') || empty;
    const keep = (patch) => api.save('draft', { ...(api.data('draft') || empty), ...patch });
    const title = h('input.field', { id: 'dual-title', value: d.title, placeholder: t('titlePlaceholder'), oninput: () => keep({ title: title.value }) });
    const words = h('textarea.field', { id: 'dual-words', rows: 4, placeholder: t('wordsPlaceholder'), oninput: () => keep({ words: words.value }) }, d.words);
    const pad = sketchPad({ label: t('padLabel'), actions: d.strokes, onChange: (strokes) => keep({ strokes }) });
    const msg = h('p.ws-b-note', { hidden: true, role: 'status' });
    let topic = null;
    const save = (e) => {
      e.preventDefault();
      if (!title.value.trim()) { msg.textContent = t('needTitle'); msg.hidden = false; title.focus(); return; }
      if (pad.isEmpty()) { msg.textContent = t('needSketch'); msg.hidden = false; return; }
      const strokes = pad.actions();
      const s = { id: uid('sk'), at: now(), title: title.value.trim(), words: words.value.trim(), topic, strokes, png: toPNG(strokes), attempts: [] };
      put(s);
      api.save('draft', null);
      toast(t('saved'));
      go({ page: 'detail', id: s.id });
    };
    const list = all();
    return h('div.stack-lg',
      h('form.stack', { onsubmit: save },
        h('div.stack', h('h2', t('drawTitle')), h('p.muted', t('drawLede'))),
        field(t('titleLabel'), title),
        h('div.ws-dual-split',
          h('div.field-row', h('span', { id: 'dual-pad-label' }, t('padLabel')), pad.el),
          h('div.stack', field(t('wordsLabel'), words), h('p.muted.small', '💡 ', t('wordsTip')))),
        field(t('topic'), api.topicPicker(null, (v) => { topic = v; })),
        msg,
        h('div.row.ws-b-actions', h('button.btn', { type: 'submit' }, t('save')))),
      list.length ? h('section.stack',
        h('h2', t('galleryTitle')),
        h('div.ws-dual-gallery', list.map((s) => h('button.card.ws-dual-thumb', { type: 'button', onclick: () => go({ page: 'detail', id: s.id }) },
          sketchView(s.strokes, s.title),
          h('span.ws-dual-thumbtitle', s.title),
          h('span.muted.small', when(s.at)))))) : null);
  }

  // ---- 2. one saved sketch ----
  function detail(s) {
    const tries = s.attempts?.length || 0;
    return h('div.stack-lg',
      h('button.btn.ghost.small.ws-b-back', { type: 'button', onclick: () => go({ page: 'draw' }) }, '← ', t('allSketches')),
      h('div.stack',
        h('div', h('p.eyebrow', `${when(s.at)}${api.topicName(s.topic) ? ` · ${api.topicName(s.topic)}` : ''}`), h('h2.ws-b-wrap', s.title)),
        h('div.ws-dual-split',
          h('div.ws-dual-frame', sketchView(s.strokes, s.title)),
          s.words ? h('p.ws-b-pre.ws-dual-words', s.words) : null),
        tries ? h('p.muted.small', '🔁 ', tn('ws.dual.attempts', tries)) : null),
      aiSlot(api, t('ai'), () => ({ title: s.title, words: s.words, png: s.png })),
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: async () => {
          if (await confirmSheet({ title: t('deleteTitle'), ok: t('delete'), danger: true })) { api.update('sketches', (l) => l.filter((x) => x.id !== s.id), []); go({ page: 'draw' }); }
        } }, t('delete')),
        tries ? h('button.btn.ghost.small', { type: 'button', onclick: () => go({ page: 'compare', id: s.id }) }, t('lastCompare')) : null,
        h('button.btn', { type: 'button', 'data-focus': true, onclick: () => go({ page: 'redraw', id: s.id }) }, '🙈 ', t('redraw'))));
  }

  // ---- 3. redraw from memory (the original stays hidden) ----
  function redraw(s) {
    const pad = sketchPad({ label: t('padLabel') });
    const msg = h('p.ws-b-note', { hidden: true, role: 'status' }, t('needSketch'));
    return h('div.stack-lg',
      h('div.stack',
        h('p.eyebrow', '🙈 ', t('fromMemory')),
        h('h2.ws-b-wrap', s.title),
        h('p.muted', t('redrawLede'))),
      pad.el,
      msg,
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: () => go({ page: 'detail', id: s.id }) }, t('cancel')),
        h('button.btn', { type: 'button', onclick: () => {
          if (pad.isEmpty()) { msg.hidden = false; return; }
          const strokes = pad.actions();
          put({ ...s, attempts: [{ at: now(), strokes, png: toPNG(strokes) }, ...(s.attempts || [])].slice(0, 20) });
          go({ page: 'compare', id: s.id });
        } }, t('compare'))));
  }

  // ---- 4. side by side ----
  function compare(s, attempt) {
    if (!attempt) return detail(s);
    return h('div.stack-lg',
      h('div.stack', h('p.eyebrow', when(attempt.at, true)), h('h2.ws-b-wrap', s.title), h('p.muted', t('compareLede'))),
      h('div.ws-dual-compare',
        h('figure.ws-dual-fig', sketchView(attempt.strokes, t('mine')), h('figcaption', '🧠 ', t('mine'))),
        h('figure.ws-dual-fig', sketchView(s.strokes, t('original')), h('figcaption', '📌 ', t('original')))),
      s.words ? h('p.ws-b-pre.ws-dual-words', s.words) : null,
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: () => go({ page: 'redraw', id: s.id }) }, '🔁 ', t('again')),
        h('button.btn', { type: 'button', 'data-focus': true, onclick: () => go({ page: 'detail', id: s.id }) }, t('done'))));
  }

  draw();
}
