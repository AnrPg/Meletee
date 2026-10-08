// Active recall: one shared deck of question -> answer cards, a quiet quiz with
// optional confidence ratings, and a gentle summary that points at the
// "confident but wrong" answers (the misconceptions worth fixing first).
import { h, toast } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import * as deck from './deck.js';
import { record, shuffle, summary, inTopic, newCard } from './deck-core.js';

const ROUND = 10;

export default async function mount(root, api) {
  const t = api.t;
  let tab = api.data('tab', 'practise');
  let filter = api.data('filter', null);
  let askSure = api.data('askSure', true);

  const tabs = () => h('div.seg', { role: 'tablist', 'aria-label': t('tabsLabel') }, ['practise', 'deck'].map((k) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(tab === k),
    onclick: () => { tab = k; api.save('tab', k); draw(); },
  }, t(`tab.${k}`))));

  const draw = () => {
    const all = deck.cards();
    if (!all.length) tab = 'deck';
    root.replaceChildren(tabs(), tab === 'deck' ? deckView(all) : practiseView(all));
  };

  function deckView(all) {
    return h('div.stack.ws-recall',
      h('div.row',
        h('button.btn', { type: 'button', onclick: async () => { if (await deck.editCard(api)) { toast(t('added')); draw(); } } }, t('add')),
        h('button.btn.ghost.small', { type: 'button', onclick: async () => { const n = await deck.importCards(api); if (n) { toast(tn('ws.recall.imported', n)); draw(); } } }, t('import')),
        api.ai ? api.ai.button('questions', {}, { onAdd: (list) => {
          deck.addCards(list.map((x) => newCard({ q: x.q, a: x.a, topic: api.data('lastTopic', null) })));
          toast(tn('ws.recall.imported', list.length)); draw();
        } }) : null),
      all.length ? h('p.muted.small', deck.countLabel(all.length)) : null,
      deck.deckList(api, draw),
      h('p.muted.small.ws-recall-tip', t('tip')));
  }

  function practiseView(all) {
    const pool = inTopic(all, filter);
    const sure = h('input', { type: 'checkbox', id: 'recall-sure', checked: askSure, onchange: () => { askSure = sure.checked; api.save('askSure', askSure); } });
    return h('div.stack-lg.ws-recall',
      h('div.stack',
        h('p.lede', pool.length ? t('ready', { cards: deck.countLabel(pool.length) }) : t('noneInTopic')),
        h('div.field-row', h('label', { for: 'recall-topic' }, t('from')), api.topicPicker(filter, (v) => { filter = v; api.save('filter', v); draw(); })),
        h('label.check.ws-recall-sure', sure, h('span', t('askSure')))),
      h('div.row', h('button.btn', { type: 'button', disabled: !pool.length, onclick: () => quiz(shuffle(pool).slice(0, ROUND)) }, t('start'))));
  }

  function quiz(list) {
    const answers = [];
    const next = (i) => {
      if (i >= list.length) return done(list, answers);
      root.replaceChildren(deck.flipCard({
        card: list[i], api, step: i + 1, total: list.length, confidence: askSure,
        onGrade: (result, extra) => {
          answers.push({ id: list[i].id, result, sure: extra.sure });
          deck.updateCard(list[i].id, (c) => record(c, result));
          next(i + 1);
        },
      }), h('div.row', h('button.btn.ghost.small', { type: 'button', onclick: () => (answers.length ? done(list.slice(0, answers.length), answers) : draw()) }, t('stop'))));
      root.querySelector('#flip-typed')?.focus();
    };
    next(0);
  }

  function done(list, answers) {
    const s = summary(answers);
    const again = list.filter((c, i) => answers[i] && answers[i].result !== 'got');
    const emoji = s.got === s.total ? '🌟' : s.got >= s.total / 2 ? '🌱' : '🌧️';
    root.replaceChildren(h('section.stack-lg.ws-recall-sum',
      h('div.center.stack',
        h('p.ws-recall-emoji', { 'aria-hidden': 'true' }, emoji),
        h('h2', t('doneTitle')),
        h('p.muted', t('doneText', { got: s.got, n: s.total }))),
      h('div.row.ws-recall-tally', { style: { justifyContent: 'center' } },
        ['got', 'partly', 'missed'].map((k) => h('span.badge', `${t(`tally.${k}`)} · ${s[k]}`))),
      askSure && s.confidentWrong
        ? h('div.card.soft-card.ws-recall-cw', h('h3', tn('ws.recall.confidentWrong', s.confidentWrong)), h('p.muted.small', t('confidentWrongText')))
        : askSure ? h('p.muted.small.center', t('noConfidentWrong')) : null,
      h('div.row', { style: { justifyContent: 'center' } },
        again.length ? h('button.btn', { type: 'button', onclick: () => quiz(shuffle(again)) }, t('again')) : null,
        h(again.length ? 'button.btn.ghost.small' : 'button.btn', { type: 'button', onclick: draw }, t('finish')))));
  }

  draw();
}
