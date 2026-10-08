// Calm corner: a worry dump (write it, then put it away) and a breathing exercise.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import * as data from '../../grow/data.js';
import { back, entry, reducedMotion } from './ui.js';

export function calmView() {
  return h('div.stack-lg',
    back(),
    h('div', h('h1', '🫧 ', t('grow.calm.title')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.calm.lede'))),
    h('div.cards',
      entry('#/grow/calm/worry', '📝', t('grow.worry.title'), t('grow.worry.short')),
      entry('#/grow/calm/breathe', '🌬️', t('grow.breathe.title'), t('grow.breathe.short'))),
    h('p.muted.small.calm-note', t('grow.calm.note'), ' ', h('a', { href: '#/learn/method/ask-for-help-early' }, t('grow.calm.help'))));
}

export function worryView() {
  const root = h('div.stack-lg');
  const write = () => {
    const text = h('textarea.field.worry-text', { id: 'worry-text', rows: 8, placeholder: t('grow.worry.placeholder') });
    const go = () => {
      const v = text.value.trim();
      text.value = '';
      if (!v) { text.focus(); return; }
      data.bumpCalm('worries');
      const paper = h('div.worry-paper', { 'aria-hidden': 'true' }, v.slice(0, 400));
      const stage = h('div.worry-stage', paper, h('div.worry-box', { 'aria-hidden': 'true' }, '📦'));
      root.replaceChildren(back('#/grow/calm', t('grow.calm.title')), stage);
      const done = () => { if (root.isConnected) after(); };
      if (reducedMotion()) { done(); return; }
      requestAnimationFrame(() => stage.classList.add('away'));
      setTimeout(done, 1500);
    };
    root.replaceChildren(
      back('#/grow/calm', t('grow.calm.title')),
      h('div', h('h1', '📝 ', t('grow.worry.title')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.worry.lede'))),
      h('label.sr-only', { for: 'worry-text' }, t('grow.worry.label')),
      text,
      h('div.center', h('button.btn', { onclick: go }, '📦 ', t('grow.worry.putAway')), h('p.muted.small', { style: { marginTop: 'var(--s3)' } }, t('grow.worry.private'))));
  };
  const after = () => root.replaceChildren(
    back('#/grow/calm', t('grow.calm.title')),
    h('section.hero.worry-done', { role: 'status' },
      h('p.big-emoji', { 'aria-hidden': 'true' }, '📦✨'),
      h('h1', t('grow.worry.doneTitle')),
      h('p.lede', t('grow.worry.doneText')),
      h('div.stack.center',
        h('a.btn', { href: '#/do/focus' }, t('grow.worry.startFive')),
        h('a.btn.ghost.small', { href: '#/grow/calm/breathe' }, '🌬️ ', t('grow.worry.breatheFirst')))));
  write();
  return root;
}

export const PATTERNS = {
  '446': [{ k: 'in', s: 4 }, { k: 'hold', s: 4 }, { k: 'out', s: 6 }],
  sigh: [{ k: 'in', s: 2 }, { k: 'top', s: 1 }, { k: 'out', s: 6 }],
  '46': [{ k: 'in', s: 4 }, { k: 'out', s: 6 }],
};
const ORDER = ['446', 'sigh', '46'];
const ROUNDS = { '446': 4, sigh: 5, '46': 6 };
const SIZE = { in: 1, top: 1.12, hold: null, out: 0.55 };

export function breatheView() {
  const root = h('div.stack-lg');
  let pattern = '446';
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };

  const idle = (finished = false) => {
    stop();
    const chips = h('div.row', { role: 'group', 'aria-label': t('grow.breathe.pattern'), style: { justifyContent: 'center' } },
      ORDER.map((p) => h('button.chip', {
        'aria-pressed': String(p === pattern),
        onclick: (e) => { pattern = p; for (const b of chips.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); hint.textContent = t(`grow.breathe.p.${p}.hint`); },
      }, t(`grow.breathe.p.${p}`))));
    const hint = h('p.muted.small.center', t(`grow.breathe.p.${pattern}.hint`));
    root.replaceChildren(
      back('#/grow/calm', t('grow.calm.title')),
      h('div', h('h1', '🌬️ ', t('grow.breathe.title')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.breathe.lede'))),
      h('div.breath-wrap', h('div.breath-circle', { 'aria-hidden': 'true' }), h('div.breath-label', finished ? t('grow.breathe.done') : t('grow.breathe.ready'))),
      chips, hint,
      h('div.center', h('button.btn', { onclick: run }, finished ? t('grow.breathe.again') : t('grow.breathe.start'))));
  };

  const run = () => {
    stop();
    const steps = PATTERNS[pattern];
    const rounds = ROUNDS[pattern];
    const circle = h('div.breath-circle', { 'aria-hidden': 'true' });
    const word = h('div.breath-word');
    const count = h('div.breath-count');
    const label = h('div.breath-label', { role: 'status', 'aria-live': 'polite' }, word, count);
    const roundLine = h('p.muted.small.center');
    root.replaceChildren(
      back('#/grow/calm', t('grow.calm.title')),
      h('div.breath-wrap.running', circle, label),
      roundLine,
      h('div.center', h('button.btn.soft', { onclick: () => idle() }, t('grow.breathe.stop'))));
    let r = 0, i = 0, left = 0;
    const phase = () => {
      const st = steps[i];
      left = st.s;
      word.textContent = t(`grow.breathe.${st.k}`);
      count.textContent = String(left);
      roundLine.textContent = t('grow.breathe.round', { n: r + 1, of: rounds });
      circle.style.transitionDuration = `${st.s}s`;
      if (SIZE[st.k] != null) circle.style.transform = `scale(${SIZE[st.k]})`;
      circle.dataset.phase = st.k;
    };
    const tick = () => {
      if (!root.isConnected) return stop();
      left--;
      if (left > 0) { count.textContent = String(left); timer = setTimeout(tick, 1000); return; }
      i++;
      if (i >= steps.length) { i = 0; r++; }
      if (r >= rounds) { data.bumpCalm('breaths'); idle(true); return; }
      phase();
      timer = setTimeout(tick, 1000);
    };
    circle.style.transitionDuration = '0s';
    circle.style.transform = `scale(${SIZE.out})`;
    void circle.getBoundingClientRect(); // let the small circle render before it grows
    phase();
    timer = setTimeout(tick, 1000);
  };

  idle();
  return root;
}
