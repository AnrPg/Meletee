// Courses: a source map, a topic list and each topic's lecture lifecycle.
import { h, sheet, toast } from '../core/dom.js';
import { t, tn } from '../core/i18n.js';
import * as study from '../core/study.js';
import { iso, nice, diffDays, relative } from '../core/dates.js';
import { askText, confirmSheet } from '../ui/forms.js';
import { icon } from '../ui/art.js';
import { courseCard, topicLinks } from '../noema/views.js';

const back = (href, label) => h('a.btn.ghost.small', { href, style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), label);

export function courses() {
  const list = study.courses();
  const add = async () => {
    const name = await askText({ title: t('courses.addTitle'), placeholder: t('courses.namePlaceholder'), ok: t('common.add') });
    if (!name) return;
    const c = study.upsertCourse(study.newCourse(name));
    location.hash = `#/do/course/${c.id}`;
  };
  return h('div.stack-lg',
    back('#/do', t('nav.do')),
    h('div', h('h1', t('do.courses')), h('p.lede', { style: { marginTop: '8px' } }, t('courses.lede'))),
    list.length
      ? h('div.cards', list.map((c) => {
          const studied = c.topics.filter((x) => x.studiedAt).length;
          return h('a.card', { href: `#/do/course/${c.id}` },
            h('div.row', { style: { justifyContent: 'space-between' } }, h('h3', c.name),
              c.examDate ? h('span.badge', '🎓 ', nice(c.examDate)) : null),
            h('div.progress', { role: 'img', 'aria-label': t('courses.progress', { a: studied, b: c.topics.length }) },
              h('span', { style: { width: `${c.topics.length ? (100 * studied) / c.topics.length : 0}%` } })),
            h('p.muted.small', { style: { margin: '8px 0 0' } }, t('courses.progress', { a: studied, b: c.topics.length })));
        }))
      : h('div.empty', h('p', '📚'), h('p.muted', t('courses.empty'))),
    h('div.noema-addrow',
      h('button.btn', { onclick: add }, t('courses.add')),
      h('a.btn.ghost.small', { href: '#/noema' }, '🦉 ', t('noema.importButton'))));
}

export function course({ id }) {
  const c = study.courses().find((x) => x.id === id);
  if (!c) return h('p.muted', t('error.notFound'));
  const save = () => study.upsertCourse(c);
  const root = h('div.stack-lg');

  const draw = () => {
    const pace = study.termPace(c);
    root.replaceChildren(
      back('#/do/courses', t('do.courses')),
      h('div.row', { style: { justifyContent: 'space-between', alignItems: 'flex-start' } },
        h('h1', { style: { flex: '1', minWidth: '0' } }, c.name),
        h('button.icon-btn', { 'aria-label': t('courses.rename'), onclick: async () => {
          const n = await askText({ title: t('courses.rename'), value: c.name }); if (n) { c.name = n; save(); draw(); }
        } }, '✎')),

      // exam date and pace
      h('div.card.soft-card',
        h('div.row', { style: { justifyContent: 'space-between' } },
          h('div', h('p.eyebrow', t('courses.exam')),
            h('h3', c.examDate ? `${nice(c.examDate, { weekday: 'short', day: 'numeric', month: 'long' })} · ${relative(diffDays(c.examDate, iso()))}` : t('courses.noExam'))),
          h('button.btn.ghost.small', { onclick: async () => {
            const d = await askText({ title: t('courses.exam'), type: 'date', value: c.examDate || '' });
            c.examDate = d; save(); draw();
          } }, c.examDate ? t('common.change') : t('common.set'))),
        pace && pace.days > 0 ? h('p.muted.small', { style: { margin: '8px 0 0' } }, tn('courses.pace', pace.perWeek, { left: pace.left })) : null),

      // linked noema-lite subject: what next and deep links
      courseCard(c),

      // source map
      h('section.stack',
        h('h2', t('courses.sources')),
        h('p.muted.small', t('courses.sourcesLede')),
        h('div.list', study.SOURCE_KINDS.map((kind) => {
          const src = c.sources.find((s) => s.kind === kind);
          return h('button', { onclick: async () => {
            const v = await askText({ title: t(`source.${kind}`), placeholder: t('courses.sourcePlaceholder'), value: src?.title || '' });
            c.sources = c.sources.filter((s) => s.kind !== kind);
            if (v) c.sources.push({ kind, title: v });
            save(); draw();
          } }, h('span.label', t(`source.${kind}`)), h('span.muted.small', src?.title || '+'));
        }))),

      // topics
      h('section.stack',
        h('div.row', { style: { justifyContent: 'space-between' } }, h('h2', t('courses.topics')),
          h('button.btn.soft.small', { onclick: async () => {
            const v = await askText({ title: t('courses.addTopics'), placeholder: t('courses.topicsPlaceholder'), multiline: true, ok: t('common.add') });
            if (!v) return;
            for (const line of v.split('\n').map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean)) c.topics.push(study.newTopic(line));
            save(); draw();
          } }, t('common.add'))),
        c.topics.length
          ? h('div.list.topics', c.topics.map((tp) => topicRow(c, tp, draw)))
          : h('p.muted.small', t('courses.topicsEmpty'))),

      h('button.btn.ghost.small', { style: { alignSelf: 'center', color: 'var(--bad)' }, onclick: async () => {
        if (await confirmSheet({ title: t('courses.delete'), text: t('courses.deleteText', { name: c.name }), ok: t('common.delete'), danger: true })) {
          study.removeCourse(c.id); location.hash = '#/do/courses';
        }
      } }, t('courses.delete')));
  };
  draw();
  return root;
}

function stageDots(tp) {
  return h('span.dots', { 'aria-hidden': 'true' }, study.LIFECYCLE.map((s) => h(tp.stages?.[s] ? 'i.on' : 'i')));
}

function topicRow(c, tp, redraw) {
  const next = study.nextReview(tp);
  return h('button', { onclick: () => topicSheet(c, tp, redraw) },
    h('span.label', tp.title),
    next ? h('span.badge', next <= iso() ? '🔁 ' + t('reviews.due') : '🔁 ' + nice(next)) : null,
    stageDots(tp));
}

function topicSheet(c, tp, redraw) {
  let close;
  const set = (fn) => { const updated = study.updateTopic(c.id, tp.id, fn); Object.assign(tp, updated); c.topics = study.courses().find((x) => x.id === c.id).topics; };
  const body = h('div.stack');
  const draw = () => {
    const next = study.nextReview(tp);
    body.replaceChildren(
      h('h2', tp.title),
      h('p.eyebrow', t('lifecycle.title')),
      h('div.stack', { style: { gap: '4px' } }, study.LIFECYCLE.map((s) => h('label.check',
        h('input', { type: 'checkbox', checked: !!tp.stages?.[s], onchange: (e) => {
          set((x) => {
            let y = { ...x, stages: { ...x.stages, [s]: e.target.checked } };
            if (s === 'recall' && e.target.checked) y = study.markStudied(y);
            return y;
          });
          draw();
        } }),
        h('span', t(`lifecycle.${s}`))))),
      tp.studiedAt
        ? h('p.muted.small', next ? t('reviews.nextOn', { date: nice(next, { weekday: 'long', day: 'numeric', month: 'short' }) }) : t('reviews.finished'))
        : h('button.btn.small', { onclick: () => { set((x) => study.markStudied(x)); toast(t('reviews.scheduled')); draw(); } }, t('reviews.studiedToday')),
      topicLinks(tp),
      h('div.row', { style: { justifyContent: 'space-between' } },
        h('button.btn.ghost.small', { style: { color: 'var(--bad)' }, onclick: () => {
          const list = study.courses(); const cc = list.find((x) => x.id === c.id);
          cc.topics = cc.topics.filter((x) => x.id !== tp.id); study.saveCourses(list); c.topics = cc.topics; close(); redraw();
        } }, t('common.delete')),
        h('button.btn.soft.small', { onclick: () => { close(); redraw(); } }, t('common.done'))));
  };
  draw();
  close = sheet(body, { label: tp.title });
}
