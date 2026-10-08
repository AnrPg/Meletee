// The shared question deck for group a (recall, srs, interleave, relearn, pretest).
//
// Storage: api.data() is per workspace, but all these tools must see the SAME cards,
// so the deck lives directly in the store under the account-wide key
//   'ws:deck:cards'   ->  meletee1:<account>:a:ws:deck:cards
// as an array of cards shaped like noema-lite flashcards (see deck-core.js):
//   { id, q, a, topic: { courseId, topicId } | null, created, box, due, seen, right, wrong }
// Shared UI strings use the global keys ws.deck.* (in i18n/ws/a.<lang>.json).
import * as store from '../core/store.js';
import { h, sheet } from '../core/dom.js';
import { t, tn } from '../core/i18n.js';
import { confirmSheet } from '../ui/forms.js';
import { newCard, parseLines } from './deck-core.js';

export const DECK_KEY = 'ws:deck:cards';

export const cards = () => store.get(DECK_KEY, []);
export const saveCards = (list) => store.set(DECK_KEY, list);
export const byIds = (ids) => { const m = new Map(cards().map((c) => [c.id, c])); return ids.map((id) => m.get(id)).filter(Boolean); };
export function addCards(list) { saveCards([...cards(), ...list]); return list.length; }
export function updateCard(id, fn) { saveCards(cards().map((c) => (c.id === id ? fn(c) : c))); }
export function removeCard(id) { saveCards(cards().filter((c) => c.id !== id)); }

const label = (forId, text) => h('label.field-row', { for: forId }, text);

// Add or edit one card in a bottom sheet. Resolves true when something was saved.
export function editCard(api, card = null) {
  return new Promise((resolve) => {
    let topic = card ? card.topic : api.data('lastTopic', null);
    const q = h('textarea.field', { id: 'deck-q', rows: 2, required: true }, card?.q || '');
    const a = h('textarea.field', { id: 'deck-a', rows: 3, required: true }, card?.a || '');
    let done = false;
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    const form = h('form.stack', { onsubmit: (e) => {
      e.preventDefault();
      if (!q.value.trim() || !a.value.trim()) return;
      if (card) updateCard(card.id, (c) => ({ ...c, q: q.value.trim(), a: a.value.trim(), topic }));
      else addCards([newCard({ q: q.value, a: a.value, topic })]);
      api.save('lastTopic', topic);
      finish(true);
    } },
      h('h2', card ? t('ws.deck.editTitle') : t('ws.deck.addTitle')),
      h('div.field-row', label('deck-q', t('ws.deck.question')), q),
      h('div.field-row', label('deck-a', t('ws.deck.answer')), a),
      h('div.field-row', label(`${api.id}-topic`, t('ws.common.topic')), api.topicPicker(topic, (v) => { topic = v; })),
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn.ghost.small', { type: 'button', onclick: () => finish(false) }, t('common.cancel')),
        h('button.btn.small', { type: 'submit' }, t('common.save'))));
    const close = sheet(form, { label: card ? t('ws.deck.editTitle') : t('ws.deck.addTitle') });
    const obs = new MutationObserver(() => { if (!form.isConnected) { obs.disconnect(); if (!done) { done = true; resolve(false); } } });
    obs.observe(document.body, { childList: true });
    q.focus();
  });
}

// Paste "question | answer" lines. Resolves the number of cards added.
export function importCards(api) {
  return new Promise((resolve) => {
    let topic = api.data('lastTopic', null);
    const area = h('textarea.field', { id: 'deck-import', rows: 6, placeholder: t('ws.deck.importPlaceholder') });
    let done = false;
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    const form = h('form.stack', { onsubmit: (e) => {
      e.preventDefault();
      const rows = parseLines(area.value);
      if (!rows.length) { hint.textContent = t('ws.deck.importNone'); return; }
      addCards(rows.map((r) => newCard({ ...r, topic })));
      api.save('lastTopic', topic);
      finish(rows.length);
    } },
      h('h2', t('ws.deck.importTitle')),
      h('div.field-row', label('deck-import', t('ws.deck.importHelp')), area),
      h('div.field-row', label(`${api.id}-topic`, t('ws.common.topic')), api.topicPicker(topic, (v) => { topic = v; })),
      h('p.muted.small', { role: 'status' }),
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn.ghost.small', { type: 'button', onclick: () => finish(0) }, t('common.cancel')),
        h('button.btn.small', { type: 'submit' }, t('ws.deck.importGo'))));
    const hint = form.querySelector('[role=status]');
    const close = sheet(form, { label: t('ws.deck.importTitle') });
    const obs = new MutationObserver(() => { if (!form.isConnected) { obs.disconnect(); if (!done) { done = true; resolve(0); } } });
    obs.observe(document.body, { childList: true });
    area.focus();
  });
}

// The card list with edit / delete. onChange() is called after any change.
export function deckList(api, onChange) {
  const list = cards();
  if (!list.length) return emptyDeck(false);
  return h('div.list.ws-deck-list', list.slice().reverse().map((c) => h('div.ws-deck-item',
    h('div.ws-deck-text',
      h('span.label', c.q),
      h('span.muted.small', c.a),
      c.topic && api.topicName(c.topic) ? h('span.badge', api.topicName(c.topic)) : null),
    h('div.row.ws-deck-actions',
      h('button.btn.ghost.small', { type: 'button', 'aria-label': `${t('ws.deck.edit')}: ${c.q}`, onclick: async () => { if (await editCard(api, c)) onChange(); } }, t('ws.deck.edit')),
      h('button.btn.ghost.small', { type: 'button', 'aria-label': `${t('common.delete')}: ${c.q}`, onclick: async () => {
        if (await confirmSheet({ title: t('ws.deck.deleteTitle'), text: c.q, ok: t('common.delete'), danger: true })) { removeCard(c.id); onChange(); }
      } }, '🗑')))));
}

// Shown when there is nothing to practise. linkToRecall: offer a way to make cards.
export function emptyDeck(linkToRecall = true) {
  return h('div.empty',
    h('p', '🃏'),
    h('h3', t('ws.deck.emptyTitle')),
    h('p.muted', t('ws.deck.emptyText')),
    linkToRecall ? h('a.btn.soft.small', { href: '#/ws/recall' }, t('ws.deck.makeCards')) : null);
}

export const countLabel = (n) => tn('ws.deck.cards', n);

// One question on screen: think (or type), optionally say how sure you are, reveal,
// then grade yourself. grades: list of result ids ('missed' | 'partly' | 'got').
// before: optional element shown above the reveal (interleave's "which topic?").
export function flipCard({ card, api, step, total, typed = true, confidence = false, grades = ['missed', 'partly', 'got'], gradeLabel, before = null, onGrade }) {
  let sure = null;
  const root = h('section.card.ws-flip', { 'aria-live': 'polite' });
  const fill = (...nodes) => root.replaceChildren(...nodes.filter(Boolean));
  const meta = h('div.row.ws-flip-meta',
    total ? h('span.muted.small', t('ws.deck.progress', { i: step, n: total })) : null,
    card.topic && api.topicName(card.topic) && !before ? h('span.badge', api.topicName(card.topic)) : null);
  const bar = total ? h('div.progress', h('span', { style: { width: `${Math.round(((step - 1) / total) * 100)}%` } })) : null;
  const typedBox = typed ? h('textarea.field.quiet', { id: 'flip-typed', rows: 2, placeholder: t('ws.deck.typePlaceholder'), 'aria-label': t('ws.deck.typeLabel') }) : null;
  const sureSeg = confidence ? h('div.stack.ws-flip-sure',
    h('p.muted.small', { id: 'flip-sure-label' }, t('ws.deck.sureQ')),
    h('div.seg', { role: 'group', 'aria-labelledby': 'flip-sure-label' }, [['unsure', false], ['sure', true]].map(([k, v]) => h('button', {
      type: 'button', 'aria-pressed': 'false',
      onclick: (e) => { sure = v; for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); },
    }, t(`ws.deck.${k}`))))) : null;

  let beforeEl = null;
  const reveal = () => {
    const mine = typedBox && typedBox.value.trim();
    fill(meta, bar,
      h('p.ws-flip-q', card.q), beforeEl,
      mine ? h('div.ws-flip-mine', h('p.eyebrow', t('ws.deck.yourAnswer')), h('p', mine)) : null,
      h('div.ws-flip-a', h('p.eyebrow', t('ws.deck.answer')), h('p', card.a)),
      aiSlot(api, card, mine),
      h('p.muted.small', t('ws.deck.howDid')),
      h('div.row.ws-flip-grades', grades.map((g) => h(g === 'got' ? 'button.btn.small' : 'button.btn.soft.small', {
        type: 'button', onclick: () => onGrade(g, { sure, typed: mine || '' }),
      }, gradeLabel ? gradeLabel(g) : t(`ws.deck.${g}`)))));
    root.querySelector('.ws-flip-grades button:last-child')?.focus();
  };

  const revealBtn = h('button.btn', { type: 'button', onclick: reveal }, t('ws.deck.reveal'));
  const show = () => fill(meta, bar, h('p.ws-flip-q', card.q), beforeEl, typedBox, sureSeg, h('div.row', revealBtn));
  if (before) {
    // before(next) builds its own step; it calls next() when the learner may go on.
    beforeEl = before(() => { show(); revealBtn.focus(); });
    fill(meta, bar, h('p.ws-flip-q', card.q), beforeEl);
  } else show();
  return root;
}

// Hook point for phase 4: when api.ai exists, a "check my answer with the tutor"
// button can be returned here. Nothing is rendered while api.ai is null.
function aiSlot(api /* , card, mine */) {
  if (!api.ai) return null;
  return null;
}
