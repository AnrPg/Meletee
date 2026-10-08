// Done list and wins log: write down what you did, not only what's left.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { nice } from '../../core/dates.js';
import * as data from '../../grow/data.js';
import * as W from '../../grow/wins.js';
import { back, celebrate } from './ui.js';

function itemRow(x, redraw, editable = true) {
  return h('li.win-item', { 'data-kind': x.kind },
    h('span.win-emoji', { 'aria-hidden': 'true' }, x.kind === 'win' ? '🏆' : '✅'),
    h('span.win-text', x.text),
    editable ? h('button.icon-btn.small-icon', {
      'aria-label': x.kind === 'win' ? t('grow.wins.unstar') : t('grow.wins.star'), 'aria-pressed': String(x.kind === 'win'),
      onclick: () => { data.saveWins(W.toggleWin(data.wins(), x.id)); redraw(); },
    }, x.kind === 'win' ? '★' : '☆') : null,
    editable ? h('button.icon-btn.small-icon', {
      'aria-label': t('grow.wins.remove', { text: x.text }),
      onclick: () => { data.saveWins(W.removeItem(data.wins(), x.id)); redraw(); },
    }, '×') : null);
}

export function winsView() {
  const root = h('div.stack-lg.grow-celebrate-host');
  let kind = 'done';
  let winsOnly = false;
  let openArchive = false;
  const draw = (focusInput = false) => {
    const all = data.wins();
    const today = W.todays(all);
    const arch = W.archive(all).map((g) => ({ ...g, items: winsOnly ? g.items.filter((x) => x.kind === 'win') : g.items })).filter((g) => g.items.length);
    const input = h('input.field', { id: 'win-text', name: 'text', autocomplete: 'off', maxlength: 280, placeholder: t('grow.wins.placeholder') });
    const seg = h('div.seg', { role: 'group', 'aria-label': t('grow.wins.kind') }, ['done', 'win'].map((k) => h('button', {
      type: 'button', 'aria-pressed': String(kind === k),
      onclick: (e) => { kind = k; for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); input.focus(); },
    }, t(`grow.wins.${k}`))));
    const form = h('form.stack', { onsubmit: (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      data.saveWins(W.addItem(data.wins(), { text: v, kind }));
      if (kind === 'win') celebrate(form);
      draw(true);
    } },
      h('label.sr-only', { for: 'win-text' }, t('grow.wins.label')),
      h('div.win-add', input, h('button.btn.small', { type: 'submit' }, t('common.add'))),
      seg);
    const details = arch.length || winsOnly ? h('details.grow-details', { open: openArchive, ontoggle: (e) => { openArchive = e.target.open; } },
      h('summary', t('grow.wins.archive')),
      h('div.stack', { style: { marginTop: 'var(--s3)' } },
        h('button.chip', { 'aria-pressed': String(winsOnly), onclick: () => { winsOnly = !winsOnly; openArchive = true; draw(); } }, '🏆 ', t('grow.wins.winsOnly')),
        arch.length ? arch.map((g) => h('section.stack',
          h('h3.small.muted', t('grow.wins.weekOf', { date: nice(g.week) })),
          h('ul.plain.win-list', g.items.map((x) => itemRow(x, draw, false))))) : h('p.muted.small', t('grow.wins.noWins')))) : null;
    root.replaceChildren(
      back(),
      h('div', h('h1', '✅ ', t('grow.wins.title')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.wins.lede'))),
      form,
      h('section.stack',
        h('h2', t('grow.wins.todayTitle'), today.length ? h('span.badge.leaf', { style: { marginLeft: '8px' } }, String(today.length)) : null),
        today.length ? h('ul.plain.win-list', today.map((x) => itemRow(x, draw))) : h('p.muted', t('grow.wins.empty'))),
      details);
    if (focusInput) input.focus();
  };
  draw();
  return root;
}
