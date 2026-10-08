// Weekly reflection: three short prompts, saved per ISO week, past weeks browsable.
import { h, toast } from '../../core/dom.js';
import { t, tn } from '../../core/i18n.js';
import { addDays, nice } from '../../core/dates.js';
import * as store from '../../core/store.js';
import * as data from '../../grow/data.js';
import { PROMPTS, weekKey, weekMonday, pastWeeks } from '../../grow/reflect.js';
import { thisWeek } from '../../grow/wins.js';
import { back } from './ui.js';

const range = (monday) => `${nice(monday)} – ${nice(addDays(monday, 6))}`;

export function reflectView() {
  const key = weekKey();
  const monday = weekMonday(key);
  const cur = { done: '', slipped: '', change: '', ...(data.reflections()[key] || {}) };
  const snap = data.snapshot();
  const doneCount = thisWeek(data.wins()).length;
  let timer;
  const status = h('p.muted.small', { role: 'status', 'aria-live': 'polite' });
  const save = (quiet = true) => {
    store.update('grow:reflect', (all) => ({ ...all, [key]: { ...cur, at: new Date().toISOString() } }), {});
    status.textContent = t('grow.reflect.saved');
    if (!quiet) toast(t('grow.reflect.savedToast'));
  };
  const fields = PROMPTS.map((k) => h('label.field-row', { for: `reflect-${k}` },
    h('span', t(`grow.reflect.${k}.emoji`), ' ', t(`grow.reflect.${k}`)),
    h('textarea.field', { id: `reflect-${k}`, rows: 3, placeholder: t(`grow.reflect.${k}.hint`),
      oninput: (e) => { cur[k] = e.target.value; clearTimeout(timer); timer = setTimeout(save, 500); } }, cur[k])));
  const past = pastWeeks(data.reflections(), key);
  return h('div.stack-lg',
    back(),
    h('div',
      h('p.eyebrow', range(monday)),
      h('h1', '💭 ', t('grow.reflect.title')),
      h('p.lede', { style: { marginTop: '8px' } }, t('grow.reflect.lede'))),
    h('p.muted.small.reflect-facts', '🍃 ', tn('grow.reflect.days', snap.streak.count), ' · ✅ ', tn('grow.reflect.doneCount', doneCount)),
    h('div.stack', fields, h('div.row', { style: { justifyContent: 'space-between' } }, status, h('button.btn.small', { onclick: () => { clearTimeout(timer); save(false); } }, t('common.save')))),
    past.length ? h('section.stack',
      h('h2', t('grow.reflect.past')),
      past.slice(0, 26).map((w) => h('details.grow-details.reflect-week',
        h('summary', range(w.monday)),
        h('dl', PROMPTS.filter((k) => (w[k] || '').trim()).map((k) => [h('dt', t(`grow.reflect.${k}.emoji`), ' ', t(`grow.reflect.${k}`)), h('dd', w[k])]))))) : null);
}
