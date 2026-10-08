// Concrete examples: for an abstract idea, collect varied examples (and a non-example),
// then name what they share. Optionally hang it all on a story or case.
import { h } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { iso } from '../core/dates.js';
import { uid, EXAMPLE_KINDS, exampleProgress } from './c-core.js';
import { field, input, area, empty, confirmDelete, aiSlot, backBtn, uiState } from './c-ui.js';

export const KIND_EMOJI = { everyday: '🏠', course: '📚', non: '🚫' };

export default async function mount(root, api) {
  const T = api.t;
  const ui = uiState(api);
  let openId = ui.get('open', null);
  let ref = null;
  let kind = 'everyday';
  const ideas = () => api.data('ideas', []);
  const save = (fn) => api.update('ideas', (xs) => fn(xs || []), []);
  const patch = (id, fn) => save((xs) => xs.map((c) => (c.id === id ? fn(c) : c)));
  const go = (id) => { openId = id; ui.set('open', id); draw(); };

  root.classList.add('ws-c', 'ws-examples');

  const listView = () => {
    const all = ideas();
    const idea = input({ name: 'idea', placeholder: T('ideaPh') });
    const pick = api.courses().length ? api.topicPicker(ref, (v) => { ref = v; }) : null;
    return h('div.stack-lg',
      h('form.stack', { onsubmit: (e) => {
        e.preventDefault();
        const v = idea.value.trim();
        if (!v) { idea.focus(); return; }
        const it = { id: uid('ex'), idea: v, ref, examples: [], common: '', story: '', createdAt: iso() };
        save((xs) => [it, ...xs]);
        go(it.id);
      } },
        h('p.muted', T('lede')),
        field(T('idea'), idea),
        pick ? field(T('topic'), pick) : null,
        h('button.btn.ws-c-main', { type: 'submit' }, '🧺 ', T('start'))),
      all.length ? h('section.stack',
        h('h2', T('ideas')),
        h('div.cards', all.map((it) => {
          const p = exampleProgress(it);
          return h('button.card.ws-examples-idea', { type: 'button', onclick: () => go(it.id) },
            h('p.ws-c-wrap', { style: { margin: '0 0 6px', fontWeight: 650 } }, it.idea),
            h('p.muted.small', { style: { margin: 0 } },
              EXAMPLE_KINDS.filter((k) => it.examples.some((e) => e.kind === k)).map((k) => KIND_EMOJI[k]).join(' '), ' ',
              tn('ws.examples.count', p.count), p.enough && it.common ? ' · ✨' : ''));
        }))) : empty('💡', T('empty')));
  };

  const ideaView = (it) => {
    const p = exampleProgress(it);
    const text = area({ name: 'example', rows: 2, placeholder: T(`ph.${kind}`) });
    const kinds = h('fieldset.ws-c-causes',
      h('legend', T('kind')),
      h('div.row', EXAMPLE_KINDS.map((k) => h('label.chip.ws-c-radio',
        h('input', { type: 'radio', name: 'kind', value: k, checked: k === kind, onchange: () => { kind = k; text.placeholder = T(`ph.${k}`); } }),
        h('span', `${KIND_EMOJI[k]} ${T(`kind.${k}`)}`)))));
    const common = area({ name: 'common', rows: 3, placeholder: T('commonPh'), oninput: () => patch(it.id, (x) => ({ ...x, common: common.value })) }, it.common || '');
    const story = area({ name: 'story', rows: 3, placeholder: T('storyPh'), oninput: () => patch(it.id, (x) => ({ ...x, story: story.value })) }, it.story || '');
    return h('div.stack-lg',
      backBtn(T('all'), () => go(null)),
      h('div', h('p.eyebrow', T('theIdea')), h('h2.ws-c-wrap', it.idea), api.topicName(it.ref) ? h('span.badge', api.topicName(it.ref)) : null),
      it.examples.length ? h('ul.plain.ws-examples-list', it.examples.map((e) => h('li.row.ws-c-between',
        h('span.ws-c-wrap', { style: { flex: '1', minWidth: '0' } }, h('span', { 'aria-label': T(`kind.${e.kind}`), role: 'img' }, KIND_EMOJI[e.kind]), ' ', e.text),
        h('button.btn.ghost.small', { type: 'button', 'aria-label': T('remove'), onclick: () => {
          patch(it.id, (x) => ({ ...x, examples: x.examples.filter((y) => y.id !== e.id) })); draw();
        } }, '✕')))) : null,
      h('form.card.stack', { onsubmit: (e) => {
        e.preventDefault();
        const v = text.value.trim();
        if (!v) { text.focus(); return; }
        patch(it.id, (x) => ({ ...x, examples: [...x.examples, { id: uid('e'), kind, text: v }] }));
        draw();
        root.querySelector('textarea[name=example]')?.focus();
      } },
        kinds,
        field(T('example'), text),
        aiSlot(api, 'examples.suggest', { idea: it.idea, examples: it.examples }),
        h('div.row.ws-c-between',
          h('p.muted.small.ws-c-wrap', { style: { margin: 0, flex: '1', minWidth: '0' } }, p.enough ? T('enough') : T('needMore')),
          h('button.btn', { type: 'submit' }, T('add')))),
      h('section.stack', field(p.enough ? T('common') : `${T('common')} ${T('later')}`, common, T('commonHint'))),
      h('details.ws-c-details', { open: !!it.story },
        h('summary', '📖 ', T('story')),
        h('div.stack', { style: { marginTop: '12px' } }, field(T('storyLabel'), story, T('storyHint')))),
      h('div', h('button.btn.ghost.small.ws-c-danger', { type: 'button', onclick: async () => {
        if (await confirmDelete(T('delete'))) { save((xs) => xs.filter((x) => x.id !== it.id)); go(null); }
      } }, T('delete'))));
  };

  const draw = () => {
    const it = openId && ideas().find((x) => x.id === openId);
    root.replaceChildren(it ? ideaView(it) : listView());
  };
  draw();
}
