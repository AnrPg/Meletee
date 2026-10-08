// Interleaving: pick two or more topics, get one shuffled mixed set. For each
// question, first name which topic it belongs to, then answer it.
import { h } from '../core/dom.js';
import * as deck from './deck.js';
import { mixedSet, groupByTopic, keyToRef, topicKey, record } from './deck-core.js';

const MAX = 12;

export default async function mount(root, api) {
  const t = api.t;
  let picked = new Set(api.data('picked', []));
  const name = (k) => (k ? api.topicName(keyToRef(k)) || t('lostTopic') : t('noTopic'));

  const draw = () => {
    const groups = groupByTopic(deck.cards());
    if (!deck.cards().length) return root.replaceChildren(deck.emptyDeck(true));
    picked = new Set([...picked].filter((k) => groups.has(k)));
    const keys = [...groups.keys()].sort((a, b) => name(a).localeCompare(name(b)));
    const count = [...picked].reduce((n, k) => n + groups.get(k).length, 0);
    root.replaceChildren(h('div.stack-lg.ws-il',
      h('div.stack',
        h('p.lede', t('pickLede')),
        keys.length < 2 ? h('p.muted.small', t('needTopics')) : null,
        h('div.row.ws-il-chips', { role: 'group', 'aria-label': t('pickLabel') }, keys.map((k) => h('button.chip', {
          type: 'button', 'aria-pressed': String(picked.has(k)),
          onclick: () => { picked.has(k) ? picked.delete(k) : picked.add(k); api.save('picked', [...picked]); draw(); },
        }, name(k), h('span.muted.small', String(groups.get(k).length)))))),
      h('div.stack',
        h('div.row', h('button.btn', { type: 'button', disabled: picked.size < 2, onclick: () => run(mixedSet(deck.cards(), [...picked], MAX)) },
          picked.size < 2 ? t('pickTwo') : t('start', { cards: deck.countLabel(Math.min(count, MAX)) }))),
        h('p.muted.small', t('why')))));
  };

  function run(list) {
    const keys = [...picked];
    let i = 0;
    let kindRight = 0;
    let got = 0;
    const next = () => {
      if (i >= list.length) return finish(list.length, kindRight, got);
      const card = list[i];
      const own = topicKey(card.topic);
      const before = (go) => {
        const box = h('div.stack.ws-il-kind',
          h('p.muted.small', { id: 'il-kind-q' }, t('whichTopic')),
          h('div.row', { role: 'group', 'aria-labelledby': 'il-kind-q' }, keys.map((k) => h('button.chip', { type: 'button', onclick: () => {
            const ok = k === own;
            if (ok) kindRight++;
            box.replaceChildren(h('p.ws-il-feedback', { 'data-ok': String(ok), role: 'status' }, ok ? t('kindRight', { topic: name(own) }) : t('kindWrong', { topic: name(own) })));
            go();
          } }, name(k)))));
        return box;
      };
      root.replaceChildren(deck.flipCard({
        card, api, step: i + 1, total: list.length, before, grades: ['missed', 'got'],
        onGrade: (result) => { if (result === 'got') got++; deck.updateCard(card.id, (c) => record(c, result)); i++; next(); },
      }), h('div.row', h('button.btn.ghost.small', { type: 'button', onclick: draw }, t('stop'))));
    };
    next();
  }

  function finish(n, kinds, got) {
    root.replaceChildren(h('section.center.stack-lg.ws-il-done',
      h('p.ws-il-emoji', { 'aria-hidden': 'true' }, '🔀'),
      h('h2', t('doneTitle')),
      h('div.stack',
        h('p', t('doneKinds', { k: kinds, n })),
        h('p', t('doneAnswers', { a: got, n })),
        h('p.muted.small', t('doneText'))),
      h('div.row', { style: { justifyContent: 'center' } },
        h('button.btn', { type: 'button', onclick: () => run(mixedSet(deck.cards(), [...picked], MAX)) }, t('again')),
        h('button.btn.ghost.small', { type: 'button', onclick: draw }, t('finish')))));
  }

  draw();
}
