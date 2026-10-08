// Self-explanation: break a worked solution into steps (one per line) and write,
// for each one, why it follows. Unexplained and "stuck" steps stay marked;
// a short summary at the end lists what to resolve from the source.
import { h, sheet } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { confirmSheet } from '../ui/forms.js';
import { toSteps, stepState, summarize, lines } from './b-core.js';
import { uid, now, when, aiSlot, field } from './b-ui.js';

export default async function mount(root, api) {
  const t = api.t;
  const el = h('div.ws-b.ws-selfexp');
  root.append(el);
  const all = () => api.data('sets', []);
  const get = (id) => all().find((s) => s.id === id) || null;
  const put = (s) => api.update('sets', (l) => (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [s, ...l]), []);
  const view = () => api.data('view', { id: null, page: 'steps' });
  const go = (v) => { api.save('view', v); draw(); };

  const draw = () => {
    const v = view();
    const set = v.id && get(v.id);
    el.replaceChildren(!set ? start() : v.page === 'summary' ? summary(set) : stepsView(set));
    el.querySelector('[data-focus]')?.focus();
  };

  function start() {
    const title = h('input.field', { id: 'selfexp-title', placeholder: t('titlePlaceholder') });
    const src = h('textarea.field.ws-b-page', { id: 'selfexp-source', rows: 8, placeholder: t('sourcePlaceholder'), 'data-focus': true });
    let topic = null;
    const list = all();
    return h('div.stack-lg',
      h('form.card.stack.ws-b-calm', { onsubmit: (e) => {
        e.preventDefault();
        if (!lines(src.value).length) { src.focus(); return; }
        const s = { id: uid('se'), at: now(), title: title.value.trim() || lines(src.value)[0].slice(0, 60), topic, steps: toSteps(src.value) };
        put(s); go({ id: s.id, page: 'steps' });
      } },
        h('h2', t('startTitle')),
        h('p.muted', t('startLede')),
        field(t('sourceLabel'), src),
        field(t('titleLabel'), title),
        field(t('topic'), api.topicPicker(null, (v) => { topic = v; })),
        h('div.row.ws-b-actions', h('button.btn', { type: 'submit' }, t('split')))),
      list.length ? h('section.stack',
        h('h2', t('pastTitle')),
        h('div.list', list.map((s) => {
          const sm = summarize(s.steps);
          return h('button.ws-b-row', { type: 'button', onclick: () => go({ id: s.id, page: 'steps' }) },
            h('span.label', s.title, h('span.muted.small.ws-b-sub', when(s.at))),
            h(sm.explained === sm.total ? 'span.badge.leaf' : 'span.badge', `${sm.explained}/${sm.total}`));
        }))) : null);
  }

  function stepsView(set) {
    const progress = h('p.muted.small', { 'aria-live': 'polite' });
    const bar = h('span');
    const refresh = () => {
      const sm = summarize(get(set.id).steps);
      progress.textContent = t('progress', { n: sm.explained, total: sm.total });
      bar.style.width = `${sm.total ? (sm.explained / sm.total) * 100 : 0}%`;
    };
    const patchStep = (i, fn) => {
      const cur = get(set.id);
      put({ ...cur, steps: cur.steps.map((s, k) => (k === i ? fn(s) : s)) });
      refresh();
    };
    const items = set.steps.map((s, i) => {
      const li = h('li.ws-selfexp-step', { 'data-state': stepState(s) });
      const tag = h('span.badge.ws-selfexp-tag');
      const paint = (st) => { li.dataset.state = stepState(st); tag.textContent = t(`state.${stepState(st)}`); };
      const why = h('textarea.field', { id: `selfexp-why-${i + 1}`, rows: 2, placeholder: t('whyPlaceholder'), 'aria-label': t('whyLabel', { n: i + 1 }), 'data-focus': i === set.steps.findIndex((x) => stepState(x) === 'empty') },
        s.why);
      const stuck = h('button.chip.ws-selfexp-stuck', { type: 'button', 'aria-pressed': String(!!s.stuck) }, '🤔 ', t('stuck'));
      why.addEventListener('input', () => patchStep(i, (x) => { const n = { ...x, why: why.value }; paint(n); return n; }));
      stuck.addEventListener('click', () => patchStep(i, (x) => {
        const n = { ...x, stuck: !x.stuck }; stuck.setAttribute('aria-pressed', String(n.stuck)); paint(n); return n;
      }));
      paint(s);
      li.append(
        h('div.ws-selfexp-head', h('span.ws-selfexp-n', { 'aria-hidden': 'true' }, String(i + 1)), h('p.ws-selfexp-text', h('span.sr-only', `${t('stepN', { n: i + 1 })}: `), s.text), tag),
        why,
        h('div.row', stuck));
      return li;
    });
    refresh();
    return h('div.stack-lg',
      h('div.stack',
        h('div.row.ws-b-between',
          h('div', { style: { minWidth: '0' } }, h('p.eyebrow', api.topicName(set.topic) || t('eyebrow')), h('h2.ws-b-wrap', set.title)),
          h('button.btn.ghost.small', { type: 'button', onclick: () => editSteps(set) }, '✏️ ', t('editSteps'))),
        h('p.muted.small', t('stepsLede')),
        progress,
        h('div.progress', bar)),
      h('ol.plain.ws-selfexp-steps', items),
      aiSlot(api, t('ai'), () => ({ steps: get(set.id).steps })),
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: () => go({ id: null }) }, t('later')),
        h('button.btn', { type: 'button', onclick: () => go({ id: set.id, page: 'summary' }) }, t('toSummary'))));
  }

  function editSteps(set) {
    const area = h('textarea.field', { id: 'selfexp-edit', rows: 10, 'aria-label': t('sourceLabel') }, set.steps.map((s) => s.text).join('\n'));
    let close;
    close = sheet(h('form.stack', { onsubmit: (e) => {
      e.preventDefault();
      if (!lines(area.value).length) return;
      put({ ...get(set.id), steps: toSteps(area.value, get(set.id).steps) });
      close(); draw();
    } },
      h('h2', t('editSteps')),
      h('p.muted.small', t('editLede')),
      area,
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: () => close() }, t('cancel')),
        h('button.btn.small', { type: 'submit' }, t('save')))), { label: t('editSteps') });
    setTimeout(() => area.focus(), 50);
  }

  function summary(set) {
    const sm = summarize(set.steps);
    const all = sm.explained === sm.total;
    return h('div.stack-lg',
      h('div.ws-b-center.stack',
        h('p.ws-b-emoji', all ? '🌟' : '🪜'),
        h('h2', all ? t('allExplained') : t('summaryTitle')),
        h('p.muted', set.title)),
      h('div.ws-selfexp-counts',
        h('div.card.soft-card', h('strong', String(sm.explained)), h('span.muted.small', tn('ws.selfexp.explainedN', sm.explained))),
        h('div.card.soft-card', h('strong', String(sm.stuck)), h('span.muted.small', tn('ws.selfexp.stuckN', sm.stuck))),
        h('div.card.soft-card', h('strong', String(sm.empty)), h('span.muted.small', tn('ws.selfexp.emptyN', sm.empty)))),
      sm.open.length ? h('section.stack',
        h('h3', '🔍 ', t('openTitle')),
        h('p.muted.small', t('openLede')),
        h('ul.plain.ws-selfexp-open', sm.open.map((o) => h('li', { 'data-state': o.state },
          h('span.badge', t('stepN', { n: o.n })), ' ', o.text, ' ', h('span.muted.small', `(${t(`state.${o.state}`)})`))))) : null,
      h('p.ws-b-note', '💡 ', t('nextTip')),
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: async () => {
          if (await confirmSheet({ title: t('deleteTitle'), ok: t('delete'), danger: true })) { api.update('sets', (l) => l.filter((x) => x.id !== set.id), []); go({ id: null }); }
        } }, t('delete')),
        h('button.btn.ghost.small', { type: 'button', onclick: () => go({ id: set.id, page: 'steps' }) }, '← ', t('backToSteps')),
        h('button.btn', { type: 'button', onclick: () => go({ id: null }) }, t('done'))));
  }

  draw();
}
