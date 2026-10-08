// Distraction parking lot: jot a stray thought and get back to work.
import { h, sheet, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import * as study from '../core/study.js';

export function openParking() {
  const input = h('input.field', { id: 'park-input', placeholder: t('parking.placeholder'), autocomplete: 'off' });
  const list = h('ul.plain');
  const draw = () => list.replaceChildren(...study.parking().map((p) => h('li.row', { style: { justifyContent: 'space-between' } },
    h('span', p.text),
    h('button.btn.ghost.small', { 'aria-label': t('parking.clear'), onclick: () => { study.unpark(p.id); draw(); } }, '✓'))));
  draw();
  sheet(h('div.stack',
    h('h2', '🅿 ', t('parking.title')),
    h('p.muted.small', t('parking.lede')),
    h('form', { onsubmit: (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      study.park(v); input.value = ''; draw(); toast(t('parking.parked'));
    } }, input),
    list), { label: t('parking.title') });
  setTimeout(() => input.focus(), 50);
}
