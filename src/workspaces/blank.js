// Blank-page recall: pick a topic, write everything you remember on a clean page,
// then check it against the key points from your source. Past pages stay, so growth shows.
import { h } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { confirmSheet } from '../ui/forms.js';
import { checkPoints, coverage, previousOf, words } from './b-core.js';
import { uid, now, when, liveClock, aiSlot, field, chips } from './b-ui.js';

export default async function mount(root, api) {
  const t = api.t;
  const el = h('div.ws-b.ws-blank');
  root.append(el);
  const dumps = () => api.data('dumps', []);
  const saveDump = (d) => api.update('dumps', (l) => [d, ...l.filter((x) => x.id !== d.id)], []);
  const draft = () => api.data('draft', null);
  const setDraft = (d) => { api.save('draft', d); draw(); };

  let setup = { title: '', topic: null, minutes: 0 };

  const draw = () => {
    const d = draft();
    if (d?.stage === 'write') el.replaceChildren(writing(d));
    else if (d?.stage === 'check' && dumps().some((x) => x.id === d.id)) el.replaceChildren(checking(dumps().find((x) => x.id === d.id)));
    else el.replaceChildren(start());
    el.querySelector('[data-focus]')?.focus();
  };

  // ---- 1. choose a topic ----
  function start() {
    const title = h('input.field', { id: 'blank-title', value: setup.title, placeholder: t('titlePlaceholder'), oninput: () => { setup.title = title.value; } });
    const timerRow = h('div');
    const drawTimer = () => timerRow.replaceChildren(chips(
      [{ value: 0, label: t('noTimer') }, { value: 5, label: t('minutes5') }, { value: 10, label: t('minutes10') }],
      setup.minutes, (v) => { setup.minutes = v; drawTimer(); }, t('timer')));
    drawTimer();
    const go = (e) => {
      e.preventDefault();
      if (!title.value.trim()) { title.focus(); title.setAttribute('aria-invalid', 'true'); return; }
      setDraft({ stage: 'write', title: title.value.trim(), topic: setup.topic, minutes: setup.minutes, startedAt: Date.now(), text: '' });
    };
    const past = dumps();
    return h('div.stack-lg',
      h('form.card.stack.ws-b-calm', { onsubmit: go },
        h('h2', t('startTitle')),
        h('p.muted', t('startLede')),
        field(t('titleLabel'), title),
        field(t('topic'), api.topicPicker(setup.topic, (v) => { setup.topic = v; })),
        h('div.field-row', h('span', t('timer')), timerRow),
        h('div.row.ws-b-actions', h('button.btn', { type: 'submit' }, t('start')))),
      past.length ? h('section.stack',
        h('h2', t('pastTitle')),
        h('div.list', past.map((x) => {
          const c = coverage(x.results);
          return h('button.ws-b-row', { type: 'button', onclick: () => setDraft({ stage: 'check', id: x.id }) },
            h('span.label', x.title, h('span.muted.small.ws-b-sub', when(x.at), ' · ', tn('ws.blank.words', words(x.text).length))),
            c ? h('span.badge.leaf', `${c.found}/${c.total}`) : h('span.badge', t('unchecked')));
        }))) : h('p.muted.small.ws-b-center', t('emptyPast')));
  }

  // ---- 2. the blank page ----
  function writing(d) {
    const area = h('textarea.field.ws-b-page', { id: 'blank-dump', rows: 14, 'aria-label': t('pageLabel'), placeholder: t('pagePlaceholder'), 'data-focus': true,
      oninput: () => api.save('draft', { ...draft(), text: area.value }) }, d.text || '');
    const timeUp = h('p.ws-b-note', { hidden: true, role: 'status' }, t('timeUp'));
    const clockEl = d.minutes ? liveClock({ startedAt: d.startedAt, seconds: d.minutes * 60, onEnd: () => { timeUp.hidden = false; } }) : null;
    const finish = () => {
      const text = area.value.trim();
      if (!text) { area.focus(); return; }
      const dump = { id: uid('dump'), at: now(), title: d.title, topic: d.topic || null, minutes: d.minutes || 0, text, points: '', results: null };
      saveDump(dump);
      setDraft({ stage: 'check', id: dump.id });
    };
    return h('div.stack',
      h('div.row.ws-b-between',
        h('div', { style: { minWidth: '0' } }, h('p.eyebrow', api.topicName(d.topic) || t('blankPage')), h('h2.ws-b-wrap', d.title)),
        clockEl),
      h('p.muted.small', t('writeLede')),
      area,
      timeUp,
      h('p.muted.small', '💭 ', t('ranDry')),
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: async () => {
          if (!area.value.trim() || await confirmSheet({ title: t('discardTitle'), ok: t('discard'), danger: true })) setDraft(null);
        } }, t('discard')),
        h('button.btn', { type: 'button', onclick: finish }, t('done'))));
  }

  // ---- 3. check against notes ----
  function checking(dump) {
    const pts = h('textarea.field', { id: 'blank-points', rows: 6, placeholder: t('pointsPlaceholder'), 'data-focus': !dump.results }, dump.points || '');
    const results = dump.results;
    const c = coverage(results);
    const prev = previousOf(dumps(), dump);
    const pc = prev && coverage(prev.results);
    const check = () => {
      const r = checkPoints(dump.text, pts.value);
      if (!r.length) { pts.focus(); return; }
      saveDump({ ...dump, points: pts.value, results: r.map(({ point, status }) => ({ point, status })) });
      draw();
    };
    const gaps = (results || []).filter((r) => r.status !== 'found');
    const mark = { found: '✓', partial: '◐', gap: '○' };
    return h('div.stack-lg',
      h('div.stack',
        h('div', h('p.eyebrow', `${when(dump.at)}${api.topicName(dump.topic) ? ` · ${api.topicName(dump.topic)}` : ''}`), h('h2.ws-b-wrap', dump.title)),
        h('details.ws-b-fold', { open: !results },
          h('summary', '📄 ', t('yourPage'), ' ', h('span.muted.small', tn('ws.blank.words', words(dump.text).length))),
          h('p.ws-b-pre', dump.text))),
      h('section.stack',
        h('h3', t('checkTitle')),
        h('p.muted.small', t('checkLede')),
        field(t('pointsLabel'), pts),
        results ? h('button.btn.soft.small', { type: 'button', onclick: check }, t('recheck')) : h('div.row.ws-b-actions', h('button.btn', { type: 'button', onclick: check }, t('check')))),
      results ? h('section.stack.ws-blank-results', { 'aria-live': 'polite' },
        h('p.ws-b-big', c.found === c.total ? '🌟 ' : '🌱 ', t('score', { found: c.found, total: c.total })),
        pc ? h('p.muted.small', '📈 ', t('growth', { before: pc.pct, now: c.pct })) : null,
        h('ul.plain.ws-blank-points', results.map((r) => h('li', { 'data-status': r.status },
          h('span.ws-blank-mark', { 'aria-hidden': 'true' }, mark[r.status]),
          h('span', r.point),
          h('span.sr-only', ` (${t(r.status)})`)))),
        gaps.length ? h('div.card.soft-card.stack',
          h('h3', '🔍 ', t('gapsTitle')),
          h('p.muted.small', t('gapsLede')),
          h('ul.ws-b-gaps', gaps.map((g) => h('li', g.point)))) : h('p.muted', t('noGaps')),
        aiSlot(api, t('ai'), () => ({ text: dump.text, points: dump.points })),
        h('div.row.ws-b-actions',
          h('button.btn.ghost.small', { type: 'button', onclick: async () => {
            if (await confirmSheet({ title: t('deleteTitle'), ok: t('delete'), danger: true })) { api.update('dumps', (l) => l.filter((x) => x.id !== dump.id), []); setDraft(null); }
          } }, t('delete')),
          h('button.btn', { type: 'button', onclick: () => setDraft(null) }, t('finish')))) : h('div.row',
        h('button.btn.ghost.small', { type: 'button', onclick: () => setDraft(null) }, t('later'))));
  }

  draw();
}
