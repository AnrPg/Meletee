import { h, sheet } from '../core/dom.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { companion } from '../ui/art.js';
import { snapshot, why } from '../grow/data.js';
import { insightOfDay } from '../grow/insights.js';
import { garden } from './grow/ui.js';
import { streakLine } from './grow/home.js';

// One small, calm glimpse of the Grow garden and today's insight.
function glimpse() {
  let snap;
  try { snap = snapshot(); } catch { return null; }
  const w = why();
  const ins = insightOfDay();
  return h('div.stack.home-grow',
    w.home && w.text ? h('a.home-why', { href: '#/grow/why' }, h('span', { 'aria-hidden': 'true' }, '💜 '), h('q', w.text)) : null,
    h('a.card.soft-card.home-glimpse', { href: '#/grow', 'aria-label': `${t('nav.grow')}: ${streakLine(snap.streak)}` },
      garden({ stage: snap.stage, sunny: snap.studiedToday, small: true }),
      h('div',
        h('p.small.muted', { style: { margin: 0 } }, '🍃 ', streakLine(snap.streak)),
        h('p.small', { style: { margin: '4px 0 0' } }, '💡 ', t(`grow.insight.${ins.n}`)))));
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? t('home.greet.night') : hr < 12 ? t('home.greet.morning') : hr < 18 ? t('home.greet.afternoon') : t('home.greet.evening');
}

function whatNow() {
  const found = store.get('method', null);
  const options = [
    found
      ? { emoji: '📚', title: t('home.next.library'), text: t('home.next.libraryText'), href: '#/learn/methods' }
      : { emoji: '🧭', title: t('home.next.find'), text: t('home.next.findText'), href: '#/learn/find' },
    { emoji: '🌱', title: t('home.next.guide'), text: t('home.next.guideText'), href: '#/learn/guide' },
    { emoji: '🫧', title: t('home.next.myth'), text: t('home.next.mythText'), href: '#/learn/myths' },
  ];
  let close;
  const pick = (href) => { close(); location.hash = href; };
  close = sheet(h('div.stack',
    h('h2', t('home.whatNow')),
    h('div.cards', options.map((o) => h('button.card', { onclick: () => pick(o.href) },
      h('span.emoji', o.emoji), h('h3', o.title), h('p.muted.small', o.text))))), { label: t('home.whatNow') });
}

export function home() {
  const name = store.get('profile', {}).name;
  return h('div.stack',
    h('section.hero',
      companion({ mood: 'happy', leaves: 2, label: t('companion.label') }),
      h('h1', name ? `${greeting()}, ${name}` : greeting()),
      h('p.lede', t('home.lede')),
      h('button.btn', { onclick: whatNow }, t('home.whatNow'))),
    glimpse());
}
