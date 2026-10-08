// Schedule maker: a weekly rhythm of time blocks, plus a term map from exam dates.
import { h, sheet } from '../core/dom.js';
import { t, tn } from '../core/i18n.js';
import * as store from '../core/store.js';
import * as study from '../core/study.js';
import { iso, addDays, weekStart, weekday, nice } from '../core/dates.js';
import { icon } from '../ui/art.js';

export function plan() {
  const root = h('div.stack-lg');
  let tab = store.get('ui', {}).planTab || 'week';
  const draw = () => {
    const seg = h('div.seg', { role: 'tablist' }, ['week', 'term'].map((k) => h('button', {
      role: 'tab', 'aria-selected': String(tab === k),
      onclick: () => { tab = k; store.update('ui', (u) => ({ ...u, planTab: k })); draw(); },
    }, t(`plan.${k}`))));
    root.replaceChildren(
      h('a.btn.ghost.small', { href: '#/do', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('nav.do')),
      h('div', h('h1', t('do.plan'))),
      seg,
      tab === 'week' ? week(draw) : term());
  };
  draw();
  return root;
}

function week(redraw) {
  const courses = study.courses();
  const blocks = study.blocks();
  const start = weekStart();
  const load = study.reviewLoad(courses, start, 7);
  const today = iso();
  const name = (b) => b.label || courses.find((c) => c.id === b.courseId)?.name || t('plan.study');
  const total = blocks.reduce((n, b) => n + b.minutes, 0);
  return h('div.stack',
    h('p.muted', total ? t('plan.weekTotal', { h: Math.floor(total / 60), m: total % 60 }) : t('plan.weekLede')),
    h('div.days', Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const mine = blocks.filter((b) => b.day === i).sort((a, b) => a.start.localeCompare(b.start));
      return h('div.daycol', { 'data-today': String(date === today) },
        h('div.row', { style: { justifyContent: 'space-between' } },
          h('strong', `${weekday(date)} ${nice(date, { day: 'numeric' })}`),
          load[i].count ? h('span.badge', '🔁 ', String(load[i].count)) : null),
        mine.map((b) => h('button.block', { onclick: () => editBlock(b, redraw) }, h('span', b.start), ' ', name(b), h('span.muted', ` · ${b.minutes}′`))),
        h('button.add', { 'aria-label': t('plan.addBlock'), onclick: () => editBlock({ id: study.uid('b'), day: i, start: '09:00', minutes: 50, courseId: courses[0]?.id || null, label: '' }, redraw, true) }, '+'));
    })));
}

function editBlock(b, redraw, isNew = false) {
  const courses = study.courses();
  let close;
  const f = h('form.stack', { onsubmit: (e) => {
    e.preventDefault();
    const el = e.target.elements;
    const next = { ...b, day: Number(el.day.value), start: el.start.value || '09:00', minutes: Math.max(5, Number(el.minutes.value) || 25), courseId: el.course.value || null, label: el.label.value.trim() };
    study.saveBlocks([...study.blocks().filter((x) => x.id !== b.id), next]);
    close(); redraw();
  } },
    h('h2', isNew ? t('plan.addBlock') : t('plan.editBlock')),
    h('label.field-row', t('plan.day'), h('select.field', { name: 'day', id: 'block-day' }, Array.from({ length: 7 }, (_, i) => h('option', { value: i, selected: i === b.day }, weekday(addDays(weekStart(), i), 'long'))))),
    h('div.row',
      h('label.field-row', { style: { flex: '1' } }, t('plan.start'), h('input.field', { type: 'time', name: 'start', id: 'block-start', value: b.start })),
      h('label.field-row', { style: { flex: '1' } }, t('plan.minutes'), h('input.field', { type: 'number', min: 5, step: 5, name: 'minutes', id: 'block-minutes', value: b.minutes }))),
    h('label.field-row', t('plan.course'), h('select.field', { name: 'course', id: 'block-course' },
      h('option', { value: '' }, '—'), courses.map((c) => h('option', { value: c.id, selected: c.id === b.courseId }, c.name)))),
    h('label.field-row', t('plan.label'), h('input.field', { name: 'label', id: 'block-label', value: b.label || '', placeholder: t('plan.labelPlaceholder') })),
    h('div.row', { style: { justifyContent: 'space-between' } },
      isNew ? h('span') : h('button.btn.ghost.small', { type: 'button', style: { color: 'var(--bad-ink)' }, onclick: () => { study.saveBlocks(study.blocks().filter((x) => x.id !== b.id)); close(); redraw(); } }, t('common.delete')),
      h('button.btn.small', { type: 'submit' }, t('common.save'))));
  close = sheet(f, { label: t('plan.addBlock') });
}

function term() {
  const courses = study.courses().filter((c) => c.examDate).sort((a, b) => a.examDate.localeCompare(b.examDate));
  if (!courses.length) return h('div.empty', h('p', '🗺'), h('p.muted', t('plan.termEmpty')), h('a.btn.soft.small', { href: '#/do/courses' }, t('do.courses')));
  return h('div.stack',
    h('p.muted', t('plan.termLede')),
    h('div.cards', courses.map((c) => {
      const p = study.termPace(c);
      return h('a.card', { href: `#/do/course/${c.id}` },
        h('div.row', { style: { justifyContent: 'space-between' } }, h('h3', c.name), h('span.badge', '🎓 ', nice(c.examDate))),
        h('p.muted.small', { style: { margin: '6px 0 0' } },
          p.days < 0 ? t('plan.examPast') : `${tn('plan.daysLeft', p.days)} · ${tn('courses.pace', p.perWeek, { left: p.left })}`));
    })));
}
