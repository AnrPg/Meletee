// "My why": a short note the learner writes once and reads in hard weeks.
import { h, toast } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import * as data from '../../grow/data.js';
import { back } from './ui.js';

export function whyView() {
  const root = h('div.stack-lg');
  const show = () => {
    const w = data.why();
    root.replaceChildren(
      back(),
      h('h1', '💜 ', t('grow.why.title')),
      h('figure.why-card', h('blockquote', w.text), h('figcaption.muted.small', t('grow.why.caption'))),
      h('label.check.why-toggle',
        h('input', { type: 'checkbox', id: 'why-home', checked: !!w.home, onchange: (e) => { data.saveWhy({ ...data.why(), home: e.target.checked }); toast(e.target.checked ? t('grow.why.onHome') : t('grow.why.offHome')); } }),
        h('span', t('grow.why.showHome'))),
      h('div.row', h('button.btn.soft.small', { onclick: edit }, t('grow.why.edit'))));
  };
  const edit = () => {
    const w = data.why();
    const text = h('textarea.field', { id: 'why-text', rows: 6, maxlength: 1200, placeholder: t('grow.why.placeholder') }, w.text || '');
    root.replaceChildren(
      back(),
      h('div', h('h1', '💜 ', t('grow.why.title')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.why.lede'))),
      h('ul.why-hints.muted', [1, 2, 3].map((n) => h('li', t(`grow.why.hint.${n}`)))),
      h('label.sr-only', { for: 'why-text' }, t('grow.why.label')),
      text,
      h('div.center', h('button.btn', { onclick: () => {
        const v = text.value.trim();
        if (!v) { text.focus(); return; }
        data.saveWhy({ ...data.why(), text: v });
        toast(t('grow.why.saved'));
        show();
      } }, t('common.save'))));
    text.focus?.();
  };
  data.why().text ? show() : edit();
  return root;
}
