// Small shared pieces for the Buddies views.
import { h } from '../../core/dom.js';
import { t, tn } from '../../core/i18n.js';
import { icon } from '../../ui/art.js';
import { isFocusing } from '../../buddies/logic.js';

export const back = (href = '#/buddies', label = t('nav.buddies')) =>
  h('a.btn.ghost.small.bud-back', { href }, icon('back'), label);

export const avatar = (emoji, { big = false, label = null } = {}) =>
  h(big ? 'span.bud-avatar.big' : 'span.bud-avatar', label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }, emoji || '🌱');

// What a buddy shares, as a few quiet chips (nothing when they keep things private).
export function glance(shared = {}, now = Date.now()) {
  const chips = [];
  if (isFocusing(shared, now)) chips.push(h('span.badge.bud-live', '🎯 ', t('buddies.glance.focusing')));
  if (shared.streak) chips.push(h('span.badge.leaf', '🌿 ', shared.streak.weeks ? tn('buddies.glance.weeks', shared.streak.weeks) : tn('buddies.glance.days', shared.streak.days || 0)));
  if (shared.minutes != null) chips.push(h('span.badge.time', '⏱ ', tn('buddies.glance.minutes', shared.minutes)));
  if (shared.garden != null) chips.push(h('span.badge', '🌸 ', t('buddies.glance.garden', { n: shared.garden })));
  return chips.length ? h('div.row.bud-glance', chips) : null;
}

export const progress = (pct, label) =>
  h('div.progress.bud-progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label },
    h('span', { style: { width: `${pct}%` } }));

// A calm message when the cloud cannot be reached.
export function trouble(err, retry) {
  const offline = err?.network || (typeof navigator !== 'undefined' && navigator.onLine === false);
  return h('div.empty.bud-trouble', { role: 'status' },
    h('p', '☁️'),
    h('h2', offline ? t('buddies.trouble.offline') : t('buddies.trouble.title')),
    h('p.muted', t('buddies.trouble.text')),
    retry ? h('button.btn.soft.small', { onclick: retry }, t('buddies.trouble.retry')) : null);
}

export const metricLabel = (metric, n) => tn(`buddies.metric.${metric}`, n);
