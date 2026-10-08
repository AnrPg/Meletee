import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { companion } from '../ui/art.js';

// Gentle placeholder for areas that arrive in later phases.
export function soon(area) {
  const items = t(`soon.${area}.items`).split('|');
  return h('div.stack-lg',
    h('section.hero',
      companion({ mood: 'sleepy', leaves: 1, label: t('companion.label') }),
      h('h1', t(`nav.${area}`)),
      h('p.lede', t(`soon.${area}.lede`))),
    h('div.cards', items.map((it) => h('div.card.soon', h('p', it)))));
}
