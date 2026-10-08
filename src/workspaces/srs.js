// Spaced repetition: the shared deck in Leitner boxes (1, 2, 4, 8, 16, 32 days).
// Right moves a card up a box, wrong sends it back to box 1. Calm, no streaks.
import { h } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { iso, weekday } from '../core/dates.js';
import * as deck from './deck.js';
import { BOX_DAYS, schedule, dueCards, upcoming, boxCounts } from './deck-core.js';

export default async function mount(root, api) {
  const t = api.t;

  const draw = () => {
    const all = deck.cards();
    if (!all.length) return root.replaceChildren(deck.emptyDeck(true));
    const today = iso();
    const due = dueCards(all, today);
    const load = upcoming(all, today, 7);
    const boxes = boxCounts(all);
    const max = Math.max(1, ...load.map((d) => d.count));
    root.replaceChildren(
      h('section.card.ws-srs-today.center.stack',
        h('p.ws-srs-big', { 'aria-hidden': 'true' }, due.length ? '🗂️' : '🍃'),
        h('h2', due.length ? tn('ws.srs.due', due.length) : t('nothingDue')),
        h('p.muted', due.length ? t('dueText') : t('nothingDueText')),
        due.length ? h('button.btn', { type: 'button', onclick: () => review(due) }, t('start')) : null),
      h('section.stack',
        h('h3', t('week')),
        h('div.ws-srs-strip', load.map((d, i) => h('div.ws-srs-day', { title: d.date },
          h('span.muted.small', i === 0 ? t('today') : weekday(d.date)),
          h('span.ws-srs-bar', { style: { height: `${6 + Math.round((d.count / max) * 46)}px` }, 'data-empty': String(!d.count) }),
          h('span.small', String(d.count)))))),
      h('section.stack',
        h('h3', t('boxes')),
        h('div.ws-srs-boxes', boxes.map((n, i) => h('div.ws-srs-box', { 'aria-label': t('boxLabel', { b: i + 1, d: BOX_DAYS[i], n }) },
          h('span.ws-srs-box-n', String(n)),
          h('span.muted.small', tn('ws.srs.every', BOX_DAYS[i]))))),
        h('p.muted.small', t('howBoxes'))));
  };

  function review(list) {
    let i = 0;
    let right = 0;
    const next = () => {
      if (i >= list.length) {
        return root.replaceChildren(h('section.center.stack-lg.ws-srs-done',
          h('p.ws-srs-big', { 'aria-hidden': 'true' }, '🌙'),
          h('h2', t('doneTitle')),
          h('p.muted', t('doneText', { got: right, n: list.length })),
          h('button.btn', { type: 'button', onclick: draw }, t('finish'))));
      }
      const card = list[i];
      root.replaceChildren(deck.flipCard({
        card, api, step: i + 1, total: list.length,
        onGrade: (result) => {
          if (result === 'got') right++;
          deck.updateCard(card.id, (c) => schedule(c, result, iso()));
          i++;
          next();
        },
      }), h('div.row', h('button.btn.ghost.small', { type: 'button', onclick: draw }, t('later'))));
      root.querySelector('#flip-typed')?.focus();
    };
    next();
  }

  draw();
}
