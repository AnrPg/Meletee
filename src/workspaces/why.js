// Elaborative interrogation: a fact, then "why?" asked again and again, up to five levels.
import { h } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { iso } from '../core/dates.js';
import { askText } from '../ui/forms.js';
import { uid, chainState, lookups, WHY_DEPTH } from './c-core.js';
import { field, area, empty, confirmDelete, aiSlot, backBtn, uiState } from './c-ui.js';

export default async function mount(root, api) {
  const T = api.t;
  const ui = uiState(api);
  let openId = ui.get('open', null);
  let ref = null;
  const chains = () => api.data('chains', []);
  const save = (fn) => api.update('chains', (xs) => fn(xs || []), []);
  const patch = (id, fn) => save((xs) => xs.map((c) => (c.id === id ? fn(c) : c)));
  const go = (id) => { openId = id; ui.set('open', id); draw(); };

  root.classList.add('ws-c', 'ws-why');

  const dots = (c) => h('span.dots', { 'aria-hidden': 'true' }, Array.from({ length: WHY_DEPTH }, (_, i) => h('i', { class: i < chainState(c).depth ? 'on' : '' })));

  const listView = () => {
    const all = chains();
    const fact = area({ name: 'fact', rows: 2, placeholder: T('factPh') });
    const todo = lookups(all);
    const start = (e) => {
      e.preventDefault();
      const text = fact.value.trim();
      if (!text) { fact.focus(); return; }
      const c = { id: uid('wy'), fact: text, ref, levels: [], closed: false, createdAt: iso() };
      save((xs) => [c, ...xs]);
      go(c.id);
    };
    const pick = api.courses().length ? api.topicPicker(ref, (v) => { ref = v; }) : null;
    return h('div.stack-lg',
      h('form.stack', { onsubmit: start },
        h('p.muted', T('lede')),
        field(T('fact'), fact),
        pick ? field(T('topic'), pick) : null,
        h('button.btn.ws-c-main', { type: 'submit' }, '❓ ', T('start'))),
      todo.length ? h('section.stack',
        h('div', h('h2', '🔎 ', T('lookups')), h('p.muted.small', T('lookupsSub'))),
        h('ul.plain.ws-why-todo', todo.map((x) => h('li.stack.ws-c-tight',
          h('p.ws-c-wrap', { style: { margin: 0 } }, h('span.muted.small', T('whyOf')), ' ', x.about),
          x.found
            ? h('p.small.ws-c-wrap.ws-why-found', '✅ ', x.found)
            : h('div', h('button.btn.soft.small', { type: 'button', onclick: async () => {
                const v = await askText({ title: T('foundTitle'), placeholder: T('foundPh'), multiline: true });
                if (v) { patch(x.chainId, (c) => ({ ...c, levels: c.levels.map((l, i) => (i === x.level ? { ...l, found: v } : l)) })); draw(); }
              } }, T('found'))))))) : null,
      all.length ? h('section.stack',
        h('h2', T('chains')),
        h('div.cards', all.map((c) => h('button.card.ws-why-chain', { type: 'button', onclick: () => go(c.id) },
          h('p.ws-c-wrap', { style: { margin: '0 0 8px', fontWeight: 650 } }, c.fact),
          h('div.row.ws-c-between', dots(c),
            h('span.muted.small', chainState(c).done ? tn('ws.why.deep', chainState(c).depth) : T('inProgress'))))))) : empty('🪜', T('empty')));
  };

  const chainView = (c) => {
    const st = chainState(c);
    const prev = (i) => (i === 0 ? c.fact : c.levels[i - 1].answer);
    const answer = area({ name: 'answer', rows: 3, placeholder: T('answerPh') });
    const add = (level) => { patch(c.id, (x) => ({ ...x, levels: [...x.levels, level] })); draw(); root.querySelector('textarea')?.focus(); };
    return h('div.stack-lg',
      backBtn(T('all'), () => go(null)),
      h('ol.plain.ws-why-ladder',
        h('li.ws-why-step.ws-why-fact', h('p.eyebrow', T('theFact')), h('p.ws-c-wrap', c.fact),
          api.topicName(c.ref) ? h('span.badge', api.topicName(c.ref)) : null),
        c.levels.map((l, i) => h('li.ws-why-step', { style: `--d:${Math.min(i + 1, 4)}` },
          h('p.eyebrow', i === 0 ? T('q1') : T('qn')),
          l.gap
            ? h('p.ws-c-wrap.muted', '🤔 ', T('gapMark'), l.found ? [h('br'), h('span', '✅ ', l.found)] : null)
            : h('p.ws-c-wrap', l.answer)))),
      st.done
        ? h('div.ws-c-done.center.stack',
            h('p.ws-c-big', { 'aria-hidden': 'true' }, c.levels.some((l) => l.gap) ? '🔎' : '🌳'),
            h('p', h('strong', tn('ws.why.deep', st.depth))),
            h('p.muted.small', c.levels.some((l) => l.gap) ? T('doneGap') : T('doneText')),
            c.closed && c.levels.length < WHY_DEPTH && !c.levels.some((l) => l.gap)
              ? h('button.btn.ghost.small', { type: 'button', onclick: () => { patch(c.id, (x) => ({ ...x, closed: false })); draw(); } }, T('keepGoing')) : null)
        : h('form.card.stack.ws-why-ask', { onsubmit: (e) => {
            e.preventDefault();
            const v = answer.value.trim();
            if (!v) { answer.focus(); return; }
            add({ answer: v, gap: false });
          } },
          h('p.eyebrow', T('level', { n: st.next, max: WHY_DEPTH })),
          h('p.ws-c-wrap.ws-why-quote', '“', prev(c.levels.length), '”'),
          field(st.next === 1 ? T('q1') : T('qn'), answer, T('alt')),
          aiSlot(api, 'why.probe', { fact: c.fact, levels: c.levels }),
          h('div.row',
            h('button.btn', { type: 'submit' }, T('answer')),
            h('button.btn.ghost.small', { type: 'button', onclick: () => add({ answer: '', gap: true }) }, '🤔 ', T('cant')),
            c.levels.length ? h('button.btn.ghost.small', { type: 'button', onclick: () => { patch(c.id, (x) => ({ ...x, closed: true })); draw(); } }, T('enough')) : null)),
      h('div', h('button.btn.ghost.small.ws-c-danger', { type: 'button', onclick: async () => {
        if (await confirmDelete(T('delete'))) { save((xs) => xs.filter((x) => x.id !== c.id)); go(null); }
      } }, T('delete'))));
  };

  const draw = () => {
    const c = openId && chains().find((x) => x.id === openId);
    root.replaceChildren(c ? chainView(c) : listView());
  };
  draw();
}
