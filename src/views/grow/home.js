// Grow: one calm hero (the garden and the forgiving streak) and a short list of ways in.
import { h, toast } from '../../core/dom.js';
import { t, tn } from '../../core/i18n.js';
import { weekday } from '../../core/dates.js';
import * as data from '../../grow/data.js';
import * as labLogic from '../../grow/lab.js';
import { weekKey, isFilled } from '../../grow/reflect.js';
import { todays } from '../../grow/wins.js';
import { insightOfDay } from '../../grow/insights.js';
import { garden, celebrate, entry } from './ui.js';

export function streakLine(s) {
  if (s.met) return t('grow.streak.met', { n: s.count });
  if (s.reachable) return `${tn('grow.streak.progress', s.count)} · ${tn('grow.streak.need', s.need)}`;
  return t('grow.streak.fresh');
}

export function weekDots(s) {
  return h('ol.week-dots', { 'aria-label': tn('grow.streak.progress', s.count) },
    s.dates.map((d, i) => h('li', { 'data-on': String(s.studied[i]), 'data-today': String(i === s.todayIndex), 'data-future': String(i > s.todayIndex) },
      h('span.leafdot', { 'aria-hidden': 'true' }, s.studied[i] ? '🍃' : ''),
      h('span.muted', weekday(d, 'narrow')),
      h('span.sr-only', `${weekday(d, 'long')}: ${s.studied[i] ? t('grow.streak.studied') : t('grow.streak.notYet')}`))));
}

export function insightCard() {
  const ins = insightOfDay();
  return h('section.card.soft-card.insight',
    h('p.eyebrow', '💡 ', t('grow.insight.title')),
    h('p', t(`grow.insight.${ins.n}`)),
    h('a.small', { href: `#/learn/method/${ins.item}` }, t('grow.insight.more')));
}

export function growHome() {
  const snap = data.snapshot();
  const s = snap.streak;
  const lab = data.lab();
  const active = lab.filter((e) => labLogic.isActive(e));
  const decide = lab.filter((e) => labLogic.needsDecision(e));
  const today = todays(data.wins());
  const reflected = isFilled(data.reflections()[weekKey()]);
  const why = data.why();

  const labText = decide.length ? t('grow.home.labDecide')
    : active.length ? `${t('grow.lab.dayOf', { n: labLogic.dayNumber(active[0]), of: active[0].days })} · ${tn('grow.lab.sessions', active[0].sessions.length)}`
      : t('grow.home.labText');

  const hero = h('section.grow-hero.grow-celebrate-host',
    garden({ stage: snap.stage, sunny: snap.studiedToday }),
    h('h1', t('grow.title')),
    h('p.lede', streakLine(s)),
    weekDots(s),
    h('div.row.grow-meta',
      h('span.badge.leaf', '✨ ', tn('grow.points', snap.points)),
      s.streak >= 1 ? h('span.badge', '🌿 ', tn('grow.streak.weeks', s.streak)) : null,
      snap.next != null ? h('span.muted.small', tn('grow.nextBloom', snap.next - snap.points)) : h('span.muted.small', t('grow.fullBloom'))));

  const view = h('div.stack-lg',
    hero,
    insightCard(),
    h('section.stack',
      h('h2.sr-only', t('grow.more')),
      h('div.cards',
        entry('#/grow/lab', '🧪', t('grow.lab.title'), labText),
        entry('#/grow/wins', '✅', t('grow.wins.title'), today.length ? tn('grow.wins.today', today.length) : t('grow.home.winsText')),
        entry('#/grow/reflect', '💭', t('grow.reflect.title'), reflected ? t('grow.home.reflectDone') : t('grow.home.reflectText')),
        entry('#/grow/calm', '🫧', t('grow.calm.title'), t('grow.home.calmText')),
        entry('#/grow/why', '💜', t('grow.why.title'), why.text ? why.text.slice(0, 70) + (why.text.length > 70 ? '…' : '') : t('grow.home.whyText')))));

  if (snap.stage > 0 && data.markSeen(snap.stage)) {
    setTimeout(() => { celebrate(hero); toast(t('grow.garden.grew')); }, 400);
  }
  return view;
}
