// Practice questions: log sets, see weak topics first, keep an error log.
import { h } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { iso, nice } from '../core/dates.js';
import { CAUSES, makeSet, makeError, topicStats, causeBreakdown, pct } from './c-core.js';
import { seg, field, input, area, empty, formSheet, confirmDelete, aiSlot, uiState } from './c-ui.js';

export const CAUSE_EMOJI = { unknown: '🤷', misread: '👀', careless: '🙈', time: '⏳', reasoning: '🧩' };

export default async function mount(root, api) {
  const T = api.t;
  const ui = uiState(api);
  let tab = ui.get('tab', 'sets');
  let filter = null;
  const sets = () => api.data('sets', []);
  const errors = () => api.data('errors', []);

  root.classList.add('ws-c', 'ws-practice');

  const draw = () => {
    root.replaceChildren(
      seg([['sets', T('tabSets')], ['errors', T('tabErrors')]], tab, (v) => { tab = v; ui.set('tab', v); draw(); }, T('tabs')),
      tab === 'sets' ? setsView() : errorsView());
  };

  // A topic: either picked from the learner's courses or typed.
  const topicFields = (cur = {}) => {
    let ref = cur.ref || null;
    const text = input({ name: 'topic', value: cur.ref ? '' : (cur.topic || ''), placeholder: T('topicPh') });
    const picker = api.topicPicker(ref, (v) => { ref = v; text.setCustomValidity(''); });
    const has = api.courses().length > 0;
    return {
      el: h('div.stack.ws-c-tight', has ? field(T('topicPick'), picker) : null, field(has ? T('topicOr') : T('topic'), text)),
      value: () => ({ topic: text.value.trim() || api.topicName(ref), ref: text.value.trim() ? null : ref }),
      text,
    };
  };

  // ---------- sets ----------
  const setForm = () => {
    const tf = topicFields();
    const source = input({ name: 'source', placeholder: T('sourcePh') });
    const attempted = input({ name: 'attempted', type: 'number', min: '1', inputmode: 'numeric', required: true });
    const right = input({ name: 'right', type: 'number', min: '0', inputmode: 'numeric', required: true });
    const date = input({ name: 'date', type: 'date', value: iso() });
    formSheet(T('logSet'), [
      tf.el,
      field(T('source'), source),
      h('div.ws-c-pair', field(T('attempted'), attempted), field(T('right'), right)),
      field(T('date'), date),
    ], T('save'), () => {
      const tp = tf.value();
      if (!tp.topic) { tf.text.setCustomValidity(T('needTopic')); tf.text.reportValidity(); return false; }
      if (Number(right.value) > Number(attempted.value)) { right.setCustomValidity(T('tooMany')); right.reportValidity(); right.oninput = () => right.setCustomValidity(''); return false; }
      api.update('sets', (xs) => [makeSet({ ...tp, source: source.value, attempted: attempted.value, right: right.value, date: date.value || iso() }), ...(xs || [])], []);
      draw();
    });
  };

  const setsView = () => {
    const all = sets();
    const stats = topicStats(all);
    return h('div.stack-lg',
      h('div.stack',
        h('p.muted', T('setsLede')),
        h('button.btn.ws-c-main', { type: 'button', onclick: setForm }, '＋ ', T('logSet'))),
      !all.length ? empty('📝', T('setsEmpty')) : [
        h('section.stack',
          h('div', h('h2', T('weakFirst')), h('p.muted.small', T('weakFirstSub'))),
          h('ol.ws-practice-topics.plain', stats.map((s, i) => h('li.ws-practice-topic',
            h('div.row.ws-c-between',
              h('strong.ws-c-wrap', i === 0 && stats.length > 1 ? '🎯 ' : '', s.topic),
              h('span.badge', { class: s.accuracy < 0.6 ? 'ws-c-low' : s.accuracy >= 0.85 ? 'leaf' : '' }, `${pct(s.accuracy)}%`)),
            h('div.progress', { role: 'img', 'aria-label': `${pct(s.accuracy)}%` }, h('span', { style: { width: `${pct(s.accuracy)}%` } })),
            h('p.muted.small.ws-c-meta', `${s.right}/${s.attempted} · `, tn('ws.practice.sets', s.sets)))))),
        h('details.ws-c-details',
          h('summary', T('recent')),
          h('ul.plain', all.slice(0, 20).map((s) => h('li.row.ws-c-between',
            h('span.ws-c-wrap', h('strong', s.topic), h('span.muted.small', ` · ${s.source ? s.source + ' · ' : ''}${s.right}/${s.attempted} · ${s.date ? nice(s.date) : ''}`)),
            h('button.btn.ghost.small', { type: 'button', 'aria-label': T('deleteSet'), onclick: async () => {
              if (await confirmDelete(T('deleteSet'))) { api.update('sets', (xs) => (xs || []).filter((x) => x.id !== s.id), []); draw(); }
            } }, '✕'))))),
      ]);
  };

  // ---------- errors ----------
  const errorForm = (cur = null) => {
    const tf = topicFields(cur || {});
    const question = area({ name: 'question', rows: 2 }, cur?.question || '');
    const mine = input({ name: 'myAnswer', value: cur?.myAnswer || '' });
    const correct = input({ name: 'correct', value: cur?.correct || '' });
    const lesson = area({ name: 'lesson', rows: 2, placeholder: T('lessonPh') }, cur?.lesson || '');
    const causes = h('fieldset.ws-c-causes',
      h('legend', T('cause')),
      h('div.row', CAUSES.map((c) => h('label.chip.ws-c-radio',
        h('input', { type: 'radio', name: 'cause', value: c, checked: cur?.cause === c }),
        h('span', `${CAUSE_EMOJI[c]} ${T(`cause.${c}`)}`)))));
    formSheet(cur ? T('editError') : T('logError'), [
      field(T('question'), question),
      h('div.ws-c-pair', field(T('myAnswer'), mine), field(T('correct'), correct)),
      tf.el,
      causes,
      field(T('lesson'), lesson),
      aiSlot(api, 'practice.grade', { question, mine, correct }),
    ], T('save'), (form) => {
      if (!question.value.trim()) { question.setCustomValidity(T('needQuestion')); question.reportValidity(); question.oninput = () => question.setCustomValidity(''); return false; }
      const cause = form.querySelector('input[name=cause]:checked')?.value || null;
      const next = makeError({ ...tf.value(), question: question.value, myAnswer: mine.value, correct: correct.value, cause, lesson: lesson.value, date: cur?.date || iso() });
      if (cur) { next.id = cur.id; for (const k of ['score', 'missing', 'mistakes']) if (cur[k] != null) next[k] = cur[k]; }
      api.update('errors', (xs) => (cur ? (xs || []).map((x) => (x.id === cur.id ? next : x)) : [next, ...(xs || [])]), []);
      draw();
    });
  };

  const errorsView = () => {
    const all = errors();
    const br = causeBreakdown(all);
    const top = br.rows[0];
    const shown = filter ? all.filter((e) => e.cause === filter) : all;
    return h('div.stack-lg',
      h('div.stack',
        h('p.muted', T('errorsLede')),
        h('button.btn.ws-c-main', { type: 'button', onclick: () => errorForm() }, '＋ ', T('logError'))),
      !all.length ? empty('🔍', T('errorsEmpty')) : [
        br.rows.length ? h('section.stack',
          h('div', h('h2', T('breakdown')), top ? h('p.muted.small', `${CAUSE_EMOJI[top.cause]} `, T(`insight.${top.cause}`)) : null),
          aiSlot(api, 'practice.errors', () => ({ errors: errors() })),
          h('div.ws-practice-causes', br.rows.map((r) => h('button.ws-practice-cause', {
            type: 'button', 'aria-pressed': String(filter === r.cause),
            onclick: () => { filter = filter === r.cause ? null : r.cause; draw(); },
          },
          h('span.ws-c-wrap', `${CAUSE_EMOJI[r.cause]} ${T(`cause.${r.cause}`)}`),
          h('span.ws-practice-bar', { 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.max(6, pct(r.share))}%` } })),
          h('span.small.muted', String(r.n)))))) : null,
        h('section.stack',
          h('h2', filter ? `${CAUSE_EMOJI[filter]} ${T(`cause.${filter}`)}` : T('log')),
          shown.map((e) => h('article.card.ws-practice-error.stack',
            h('div.row.ws-c-between',
              h('p.eyebrow.ws-c-wrap', { style: { margin: 0 } }, e.topic || T('noTopic')),
              e.cause ? h('span.badge', `${CAUSE_EMOJI[e.cause]} ${T(`cause.${e.cause}`)}`) : h('span.badge', T('cause.none'))),
            h('p.ws-c-wrap.ws-practice-q', e.question),
            (e.myAnswer || e.correct) ? h('dl.ws-practice-ans',
              e.myAnswer ? [h('dt.muted.small', T('myAnswer')), h('dd.ws-c-wrap', e.myAnswer)] : null,
              e.correct ? [h('dt.muted.small', T('correct')), h('dd.ws-c-wrap', e.correct)] : null) : null,
            e.lesson ? h('p.ws-practice-lesson.ws-c-wrap', '💡 ', e.lesson) : h('p.muted.small', T('noLesson')),
            h('div.row.ws-c-between',
              h('span.muted.small', e.date ? nice(e.date) : ''),
              h('div.row',
                h('button.btn.ghost.small', { type: 'button', onclick: () => errorForm(e) }, T('edit')),
                h('button.btn.ghost.small', { type: 'button', 'aria-label': T('deleteError'), onclick: async () => {
                  if (await confirmDelete(T('deleteError'))) { api.update('errors', (xs) => (xs || []).filter((x) => x.id !== e.id), []); draw(); }
                } }, '✕'))))),
          filter ? h('button.btn.ghost.small', { type: 'button', onclick: () => { filter = null; draw(); } }, T('showAll')) : null),
      ]);
  };

  draw();
}
