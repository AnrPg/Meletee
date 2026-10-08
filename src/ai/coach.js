// The Method Lab coach, loaded on demand by the Grow area. It never calls an AI on its own:
// it returns a button, and only a tap spends tokens.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { hasAI, methodLabCoach } from './index.js';

export function labCoach(summary, ctx = {}) {
  if (!hasAI()) return null;
  const out = h('p.muted', { style: { whiteSpace: 'pre-wrap', margin: 0 } });
  const btn = h('button.btn.soft.small', { onclick: async () => {
    btn.disabled = true; out.textContent = t('ai.thinking');
    try {
      const r = await methodLabCoach({ summary, ...ctx }, { onText: (s) => { out.textContent = s; }, label: ctx.experiment?.method || 'methodlab' });
      out.textContent = r.text;
    } catch (e) { out.textContent = e?.kind === 'refusal' ? t('ai.refused') : (e?.message || t('error.generic')); }
    btn.disabled = false;
  } }, '✦ ', t('ai.btn.methodlab'));
  return h('div.card.soft-card.stack', btn, out);
}
