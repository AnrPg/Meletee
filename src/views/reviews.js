// Due reviews: recall first, then rate how it went.
import { h } from '../core/dom.js';
import { t, tn } from '../core/i18n.js';
import * as study from '../core/study.js';
import { iso, weekday } from '../core/dates.js';
import { companion, icon } from '../ui/art.js';

export function reviews() {
  const root = h('div.stack-lg');
  const draw = () => {
    const courses = study.courses();
    const due = study.dueList(courses);
    const load = study.reviewLoad(courses, iso(), 7);
    root.replaceChildren(
      h('a.btn.ghost.small', { href: '#/do', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('nav.do')),
      h('div', h('h1', t('do.reviews')), h('p.lede', { style: { marginTop: '8px' } }, due.length ? t('reviews.lede') : '')),
      due.length
        ? h('div.cards', due.map(({ course, topic, late }) => {
            const card = h('div.card.stack',
              h('div', h('p.eyebrow', course.name), h('h3', topic.title),
                late > 0 ? h('p.muted.small', { style: { margin: 0 } }, tn('reviews.late', late)) : null),
              h('div.row',
                ['hard', 'ok', 'easy'].map((r) => h(r === 'ok' ? 'button.btn.small' : 'button.btn.soft.small', { onclick: () => {
                  study.updateTopic(course.id, topic.id, (x) => study.review(x, r));
                  card.classList.add('leaving');
                  setTimeout(draw, 250);
                } }, t(`reviews.${r}`)))));
            return card;
          }))
        : h('section.hero', companion({ mood: 'calm', leaves: 3, label: t('companion.label') }), h('h2', t('reviews.allDone')), h('p.muted', t('reviews.allDoneText'))),
      h('section.stack',
        h('h2', t('reviews.week')),
        h('div.week', load.map((d) => h('div.day', { title: d.date },
          h('span.muted.small', weekday(d.date)),
          h('span.bar', { style: { height: `${Math.min(64, 8 + d.count * 10)}px` }, 'data-empty': String(!d.count) }),
          h('span.small', String(d.count)))))));
  };
  draw();
  return root;
}
