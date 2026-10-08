// Small shared pieces for the Grow views.
import { h, svg } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { companion, icon } from '../../ui/art.js';
import { gardenSvg, MELE } from '../../grow/garden.js';

export const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export const back = (href = '#/grow', label = t('nav.grow')) =>
  h('a.btn.ghost.small.grow-back', { href }, icon('back'), label);

// The garden with Mele sitting in it.
export function garden({ stage = 0, sunny = false, small = false } = {}) {
  const el = svg(gardenSvg({ stage, sunny, label: t('grow.garden.label', { n: stage }) }));
  const m = companion({ mood: sunny ? 'happy' : 'calm', leaves: 1 + Math.min(2, Math.floor(stage / 4)), label: '' });
  m.setAttribute('x', MELE.x); m.setAttribute('y', MELE.y);
  m.setAttribute('width', MELE.size); m.setAttribute('height', MELE.size);
  m.setAttribute('aria-hidden', 'true');
  m.removeAttribute('role');
  el.append(m);
  if (small) el.classList.add('small');
  return el;
}

// Gentle sparkles over an element. With reduced motion, a single still sparkle.
export function celebrate(target = document.body) {
  const box = h('div.sparkles', { 'aria-hidden': 'true' });
  if (reducedMotion()) {
    box.classList.add('still');
    box.append(h('span', '✨'));
  } else {
    const bits = ['✨', '🌸', '🍃', '✨', '💜', '🌼', '✨', '🍃', '🌸', '✨', '💫', '🌱'];
    bits.forEach((b, i) => {
      const a = (i / bits.length) * Math.PI * 2;
      box.append(h('span', { style: { '--x': `${Math.round(Math.cos(a) * (60 + (i % 3) * 22))}px`, '--y': `${Math.round(Math.sin(a) * (50 + (i % 4) * 14) - 30)}px`, '--d': `${(i % 4) * 60}ms` } }, b));
    });
  }
  const host = target.closest?.('.grow-celebrate-host') || target;
  host.append(box);
  setTimeout(() => box.remove(), 1800);
}

// A 1-5 tap scale. Returns { el, value() }.
export function scale(name, value = null, onPick = () => {}) {
  let v = value;
  const label = t(`grow.scale.${name}`);
  const btns = [1, 2, 3, 4, 5].map((n) => h('button.tap', {
    type: 'button', 'aria-pressed': String(v === n), 'aria-label': t('grow.scale.aria', { scale: label, n }),
    onclick: () => { v = n; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n))); onPick(n); },
  }, String(n)));
  const el = h('fieldset.scale', { 'data-scale': name },
    h('legend', h('span', t(`grow.scale.${name}.emoji`), ' ', label), h('span.muted.small', t(`grow.scale.${name}.hint`))),
    h('div.taps', btns),
    h('div.ends.muted', h('span', t('grow.scale.low')), h('span', t('grow.scale.high'))));
  return { el, value: () => v };
}

export const entry = (href, emoji, title, text) =>
  h('a.card.row-card', { href }, h('span', emoji), h('div', h('h3', title), text ? h('p.muted.small', text) : null));
