// "Do": one main action (focus), then today at a glance.
import { h } from '../core/dom.js';
import { t, tn } from '../core/i18n.js';
import * as study from '../core/study.js';
import { iso, nice } from '../core/dates.js';
import { timerState } from './focus.js';

function top3() {
  const day = study.today();
  const wrap = h('div.stack');
  const draw = () => {
    const d = study.today();
    const rows = d.top3.map((item, i) => h('label.check',
      h('input', { type: 'checkbox', checked: item.done, onchange: (e) => { d.top3[i].done = e.target.checked; study.saveToday(d); } }),
      h('span', item.text)));
    const add = d.top3.length < 3 ? h('form', { onsubmit: (e) => {
      e.preventDefault();
      const v = e.target.elements.top.value.trim();
      if (!v) return;
      d.top3.push({ text: v, done: false }); study.saveToday(d); draw();
    } }, h('input.field.quiet', { name: 'top', id: 'top3-input', placeholder: t('do.top3Placeholder', { n: d.top3.length + 1 }), autocomplete: 'off' })) : null;
    wrap.replaceChildren(...rows, ...(add ? [add] : []));
  };
  draw();
  void day;
  return wrap;
}

export function doView() {
  const courses = study.courses();
  const due = study.dueList(courses);
  const exam = study.nearestExam(courses);
  const tm = timerState();
  const mins = study.minutesOn();

  return h('div.stack-lg',
    h('div', h('p.eyebrow', nice(iso(), { weekday: 'long', day: 'numeric', month: 'long' })), h('h1', t('do.title'))),

    exam && exam.days <= 14 ? h('a.card.exam', { href: `#/do/course/${exam.course.id}` },
      h('p.eyebrow', t('do.examMode')),
      h('h3', tn('do.examIn', exam.days, { course: exam.course.name }))) : null,

    h('a.card.focus-card', { href: '#/do/focus' },
      h('div.row', { style: { justifyContent: 'space-between' } },
        h('div', h('h3', tm ? t('do.focusRunning') : t('do.focus')), h('p.muted.small', { style: { margin: 0 } }, mins ? t('focus.today', { n: mins }) : t('do.focusText'))),
        h('span.play', '▶'))),

    h('section.stack', h('h2', t('do.top3')), top3()),

    h('div.cards',
      h('a.card.row-card', { href: '#/do/reviews' },
        h('span', '🔁'), h('div', h('h3', t('do.reviews')), h('p.muted.small', due.length ? tn('do.dueCount', due.length) : t('do.noneDue')))),
      h('a.card.row-card', { href: '#/do/courses' },
        h('span', '📚'), h('div', h('h3', t('do.courses')), h('p.muted.small', courses.length ? tn('do.courseCount', courses.length) : t('do.coursesEmpty')))),
      h('a.card.row-card', { href: '#/do/plan' },
        h('span', '🗓'), h('div', h('h3', t('do.plan')), h('p.muted.small', t('do.planText'))))));
}
