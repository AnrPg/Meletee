// Successive relearning: a session runs until every card in the set was recalled
// correctly once; then the next session is scheduled (1, 3, 7, 14 days later).
import { h, toast } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { iso, diffDays, relative } from '../core/dates.js';
import { confirmSheet } from '../ui/forms.js';
import * as deck from './deck.js';
import { newRelearnSet, finishRelearnSession, startRun, runAnswer, runFinished, inTopic, record } from './deck-core.js';

export default async function mount(root, api) {
  const t = api.t;
  const sets = () => api.data('sets', []);
  const put = (s) => api.update('sets', (l) => (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [...l, s]), []);
  const whenLabel = (s) => {
    const d = diffDays(s.next, iso());
    return d <= 0 ? t('dueNow') : t('nextIn', { when: relative(d) });
  };

  function list() {
    if (!deck.cards().length) return root.replaceChildren(deck.emptyDeck(true));
    const all = sets();
    root.replaceChildren(h('div.stack-lg.ws-rl',
      all.length ? null : h('p.lede', t('lede')),
      h('div.row', h('button.btn', { type: 'button', onclick: create }, t('new'))),
      all.length ? h('div.cards', all.map((s) => {
        const ready = deck.byIds(s.cardIds);
        const due = s.next <= iso();
        return h('div.card.stack.ws-rl-set',
          h('div', h('h3', s.name), h('p.muted.small', `${deck.countLabel(ready.length)} · ${tn('ws.relearn.sessions', s.sessions.length)}`)),
          h('div.row.ws-rl-dots', { 'aria-hidden': 'true' }, s.sessions.map(() => '🌿').join(' ') || '🌰'),
          h('div.row',
            h(due ? 'button.btn.small' : 'button.btn.soft.small', { type: 'button', disabled: !ready.length, onclick: () => session(s) }, due ? t('startNow') : t('startEarly')),
            h('span.muted.small', whenLabel(s)),
            h('button.btn.ghost.small', { type: 'button', 'aria-label': `${t('delete')}: ${s.name}`, onclick: async () => {
              if (await confirmSheet({ title: t('deleteTitle'), text: s.name, ok: t('delete'), danger: true })) { api.update('sets', (l) => l.filter((x) => x.id !== s.id), []); list(); }
            } }, '🗑')));
      })) : null,
      h('p.muted.small', t('how'))));
  }

  function create() {
    let topic = null;
    const nameIn = h('input.field', { id: 'relearn-name', placeholder: t('namePlaceholder') });
    const box = h('div.list.ws-rl-pick');
    const chosen = new Set();
    const fill = () => {
      const pool = inTopic(deck.cards(), topic);
      box.replaceChildren(...pool.map((c) => h('label.check', h('input', { type: 'checkbox', checked: chosen.has(c.id), onchange: (e) => { e.target.checked ? chosen.add(c.id) : chosen.delete(c.id); } }), h('span', c.q))));
      if (!nameIn.value && topic) nameIn.value = api.topicName(topic);
    };
    const all = h('button.btn.ghost.small', { type: 'button', onclick: () => { for (const c of inTopic(deck.cards(), topic)) chosen.add(c.id); fill(); } }, t('selectAll'));
    root.replaceChildren(h('form.stack-lg.ws-rl', { onsubmit: (e) => {
      e.preventDefault();
      if (!chosen.size) return toast(t('pickSome'));
      const s = newRelearnSet(nameIn.value.trim() || t('defaultName'), [...chosen]);
      put(s);
      list();
    } },
      h('button.btn.ghost.small', { type: 'button', onclick: list, style: { alignSelf: 'flex-start' } }, '← ', t('all')),
      h('div.stack',
        h('div.field-row', h('label', { for: 'relearn-name' }, t('nameLabel')), nameIn),
        h('div.field-row', h('label', { for: 'relearn-topic' }, t('filter')), api.topicPicker(topic, (v) => { topic = v; fill(); })),
        h('div.row', h('span.muted.small', t('pickLabel')), all),
        box),
      h('div.row', h('button.btn', { type: 'submit' }, t('save')))));
    fill();
    nameIn.focus();
  }

  function session(set) {
    const cards = deck.byIds(set.cardIds);
    let run = startRun(cards.map((c) => c.id));
    const byId = new Map(cards.map((c) => [c.id, c]));
    const next = () => {
      if (runFinished(run)) {
        const done = finishRelearnSession(set);
        put(done);
        return root.replaceChildren(h('section.center.stack-lg.ws-rl-done',
          h('p.ws-rl-emoji', { 'aria-hidden': 'true' }, '♻️'),
          h('h2', t('doneTitle')),
          h('p.muted', t('doneText', { n: tn('ws.relearn.sessions', done.sessions.length), when: relative(diffDays(done.next, iso())) })),
          h('button.btn', { type: 'button', onclick: list }, t('finish'))));
      }
      const card = byId.get(run.queue[0]);
      root.replaceChildren(
        h('p.muted.small.ws-rl-left', { role: 'status' }, t('progress', { done: run.done.length, n: cards.length })),
        deck.flipCard({
          card, api, grades: ['missed', 'got'], gradeLabel: (g) => t(`grade.${g}`),
          onGrade: (result) => {
            deck.updateCard(card.id, (c) => record(c, result));
            run = runAnswer(run, card.id, result === 'got');
            next();
          },
        }),
        h('div.row', h('button.btn.ghost.small', { type: 'button', onclick: list }, t('stop'))));
      root.querySelector('#flip-typed')?.focus();
    };
    next();
  }

  list();
}
