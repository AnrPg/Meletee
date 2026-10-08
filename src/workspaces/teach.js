// Learning by teaching: plan a tiny lesson (audience, three key points, an example,
// a question for the student, likely confusions), teach it one big card at a time,
// then reflect on what was hard to explain.
import { h } from '../core/dom.js';
import { confirmSheet } from '../ui/forms.js';
import { teachCards, lessonReady, clock } from './b-core.js';
import { uid, now, when, liveClock, aiSlot, field } from './b-ui.js';

const blankLesson = () => ({ id: uid('ls'), at: now(), title: '', topic: null, audience: '', points: ['', '', ''], example: '', question: '', confusions: '', runs: [] });

export default async function mount(root, api) {
  const t = api.t;
  const el = h('div.ws-b.ws-teach');
  root.append(el);
  const all = () => api.data('lessons', []);
  const get = (id) => all().find((l) => l.id === id) || null;
  const put = (l) => api.update('lessons', (list) => (list.some((x) => x.id === l.id) ? list.map((x) => (x.id === l.id ? l : x)) : [l, ...list]), []);
  let fresh = null; // an unsaved new lesson, stored on first keystroke

  const draw = () => {
    const run = api.data('run', null);
    const lesson = run && get(run.lessonId);
    if (lesson && run.stage === 'reflect') el.replaceChildren(reflect(lesson, run));
    else if (lesson && lessonReady(lesson)) el.replaceChildren(teaching(lesson, run));
    else el.replaceChildren(planner(get(api.data('current', null)) || (fresh ||= blankLesson())));
    el.querySelector('[data-focus]')?.focus();
  };

  // ---- plan ----
  function planner(lesson) {
    let l = { ...lesson, points: [...lesson.points] };
    const save = () => { put(l); api.save('current', l.id); fresh = null; };
    const input = (id, key, ph, multi = false, idx = null) => {
      const value = idx == null ? l[key] : l.points[idx];
      const ctl = multi
        ? h('textarea.field', { id, rows: 2, placeholder: ph }, value)
        : h('input.field', { id, placeholder: ph, value });
      ctl.addEventListener('input', () => {
        if (idx == null) l[key] = ctl.value; else l.points[idx] = ctl.value;
        save();
      });
      return ctl;
    };
    const list = all();
    const teachIt = () => {
      if (!lessonReady(l)) { el.querySelector(l.title.trim() ? '#teach-point-1' : '#teach-title')?.focus(); hint.hidden = false; return; }
      save();
      api.save('run', { lessonId: l.id, i: 0, startedAt: Date.now() });
      draw();
    };
    const hint = h('p.ws-b-note', { hidden: true, role: 'status' }, t('needMore'));
    const runs = lesson.runs || [];
    return h('div.stack-lg',
      list.length ? h('div.row.ws-b-between',
        list.length > 1 || !list.some((x) => x.id === l.id) ? h('select.field.ws-b-switch', { 'aria-label': t('switch'), onchange: (e) => { api.save('current', e.target.value); fresh = null; draw(); } },
          !list.some((x) => x.id === l.id) ? h('option', { value: '', selected: true }, t('newLesson')) : null,
          list.map((x) => h('option', { value: x.id, selected: x.id === l.id }, x.title || t('untitled')))) : h('span'),
        list.some((x) => x.id === l.id) ? h('button.btn.ghost.small', { type: 'button', onclick: () => { api.save('current', null); fresh = blankLesson(); draw(); } }, '＋ ', t('newLesson')) : null) : null,
      h('div.stack',
        h('h2', t('planTitle')),
        h('p.muted', t('planLede'))),
      h('section.card.stack.ws-b-calm',
        h('h3', '🎯 ', t('whoWhat')),
        field(t('titleLabel'), input('teach-title', 'title', t('titlePlaceholder'))),
        field(t('audienceLabel'), input('teach-audience', 'audience', t('audiencePlaceholder')))),
      h('section.card.stack.ws-b-calm',
        h('h3', '🔑 ', t('pointsTitle')),
        [0, 1, 2].map((i) => field(t('pointN', { n: i + 1 }), input(`teach-point-${i + 1}`, 'points', t('pointPlaceholder'), true, i)))),
      h('section.card.stack.ws-b-calm',
        h('h3', '🧩 ', t('stickTitle')),
        field(t('exampleLabel'), input('teach-example', 'example', t('examplePlaceholder'), true)),
        field(t('questionLabel'), input('teach-question', 'question', t('questionPlaceholder'), true)),
        field(t('confusionsLabel'), input('teach-confusions', 'confusions', t('confusionsPlaceholder'), true))),
      hint,
      aiSlot(api, t('ai'), () => ({ lesson: l })),
      h('div.row.ws-b-actions', h('button.btn', { type: 'button', onclick: teachIt }, '▶ ', t('teachIt'))),
      runs.length ? h('details.ws-b-fold',
        h('summary', '🪞 ', t('reflectionsTitle'), ' ', h('span.badge', String(runs.length))),
        h('ul.plain.ws-teach-runs', runs.map((r) => h('li.stack',
          h('p.muted.small', `${when(r.at, true)} · ⏱ ${clock(r.seconds)}`),
          r.hard ? h('p', h('strong', t('hardShort')), ' ', r.hard) : null,
          r.fix ? h('p', h('strong', t('fixShort')), ' ', r.fix) : null)))) : null,
      list.some((x) => x.id === l.id) ? h('div.row', h('button.btn.ghost.small.ws-b-danger', { type: 'button', onclick: async () => {
        if (await confirmSheet({ title: t('deleteTitle'), ok: t('delete'), danger: true })) {
          api.update('lessons', (ls) => ls.filter((x) => x.id !== l.id), []); api.save('current', null); fresh = null; draw();
        }
      } }, t('delete'))) : null);
  }

  // ---- teach it ----
  function teaching(lesson, run) {
    const cards = teachCards(lesson);
    const i = Math.min(run.i || 0, cards.length - 1);
    const card = cards[i];
    const go = (n) => { api.save('run', { ...run, i: n }); draw(); };
    const finish = () => { api.save('run', { lessonId: lesson.id, stage: 'reflect', seconds: Math.round((Date.now() - run.startedAt) / 1000) }); draw(); };
    const label = { title: t('cardTitle'), point: t('pointN', { n: card.n }), example: t('cardExample'), question: t('cardQuestion'), confusions: t('cardConfusions') }[card.kind];
    const emoji = { title: '🧑‍🏫', point: '🔑', example: '🧩', question: '🙋', confusions: '⚠️' }[card.kind];
    const last = i === cards.length - 1;
    return h('div.stack-lg.ws-teach-stage',
      h('div.row.ws-b-between',
        h('span.muted.small', { 'aria-live': 'polite' }, t('cardOf', { n: i + 1, total: cards.length })),
        liveClock({ startedAt: run.startedAt })),
      h('div.ws-teach-dots', { 'aria-hidden': 'true' }, cards.map((_, k) => h('i', { class: k <= i ? 'on' : null }))),
      h('article.card.ws-teach-card', { 'data-kind': card.kind, 'aria-roledescription': 'card' },
        h('p.eyebrow', emoji, ' ', label),
        h('p.ws-teach-text', card.text),
        card.sub ? h('p.muted', '👥 ', card.sub) : null),
      h('div.row.ws-b-actions',
        i > 0 ? h('button.btn.ghost.small', { type: 'button', onclick: () => go(i - 1) }, '← ', t('prev')) : h('button.btn.ghost.small', { type: 'button', onclick: () => { api.save('run', null); draw(); } }, t('stop')),
        h('button.btn', { type: 'button', 'data-focus': true, onclick: () => (last ? finish() : go(i + 1)) }, last ? t('finishTeaching') : `${t('next')} →`)));
  }

  // ---- reflect ----
  function reflect(lesson, run) {
    const hard = h('textarea.field', { id: 'teach-hard', rows: 3, placeholder: t('hardPlaceholder'), 'data-focus': true });
    const fix = h('textarea.field', { id: 'teach-fix', rows: 2, placeholder: t('fixPlaceholder') });
    return h('form.stack-lg', { onsubmit: (e) => {
      e.preventDefault();
      put({ ...lesson, runs: [{ at: now(), seconds: run.seconds, hard: hard.value.trim(), fix: fix.value.trim() }, ...(lesson.runs || [])] });
      api.save('run', null); api.save('current', lesson.id);
      draw();
    } },
      h('div.ws-b-center.stack',
        h('p.ws-b-emoji', '🎓'),
        h('h2', t('reflectTitle')),
        h('p.muted', t('taughtFor', { time: clock(run.seconds) }))),
      h('div.card.stack.ws-b-calm',
        field(t('hardLabel'), hard),
        field(t('fixLabel'), fix)),
      h('div.row.ws-b-actions', h('button.btn', { type: 'submit' }, t('saveReflection'))));
  }

  draw();
}
