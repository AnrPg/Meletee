import { h, sheet } from '../core/dom.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { companion } from '../ui/art.js';

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
  return h('section.hero',
    companion({ mood: 'happy', leaves: 2, label: t('companion.label') }),
    h('h1', name ? `${greeting()}, ${name}` : greeting()),
    h('p.lede', t('home.lede')),
    h('button.btn', { onclick: whatNow }, t('home.whatNow')));
}
