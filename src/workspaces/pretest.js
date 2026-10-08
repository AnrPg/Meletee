// Pretesting: before studying a topic, guess answers to a few questions and lock
// them. After studying, compare each guess with the answer and mark the surprises.
import { h, toast } from '../core/dom.js';
import { tn } from '../core/i18n.js';
import { nice } from '../core/dates.js';
import { confirmSheet } from '../ui/forms.js';
import * as deck from './deck.js';
import { newPretest, lockPretest, inTopic, newCard } from './deck-core.js';

export default async function mount(root, api) {
  const t = api.t;
  const sets = () => api.data('sets', []);
  const put = (p) => api.update('sets', (l) => (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [p, ...l]), []);
  const get = (id) => sets().find((x) => x.id === id);
  const back = () => h('button.btn.ghost.small.ws-pt-back', { type: 'button', onclick: list }, '← ', t('all'));
  const topicLine = (p) => (p.topic && api.topicName(p.topic)) || t('untitled');

  function list() {
    const all = sets();
    root.replaceChildren(h('div.stack-lg.ws-pt',
      all.length ? null : h('p.lede', t('lede')),
      h('div.row', h('button.btn', { type: 'button', onclick: create }, t('new'))),
      all.length ? h('div.cards', all.map((p) => h('button.card.row-card.ws-pt-item', { type: 'button', onclick: () => open(p.id) },
        h('span', { 'aria-hidden': 'true' }, p.stage === 'done' ? '✅' : p.stage === 'locked' ? '🔒' : '✏️'),
        h('div', { style: { minWidth: '0' } }, h('h3', topicLine(p)),
          h('p.muted.small', `${tn('ws.pretest.questions', p.items.length)} · ${t(`stage.${p.stage}`)}`))))) : null));
  }

  function open(id) {
    const p = get(id);
    if (!p) return list();
    ({ guess, locked: lockedView, done: doneView })[p.stage](p);
  }

  function create() {
    let topic = api.data('lastTopic', null);
    const area = h('textarea.field', { id: 'pretest-questions', rows: 5, placeholder: t('questionsPlaceholder') });
    const answers = new Map();
    const fromCards = () => {
      const pool = inTopic(deck.cards(), topic).slice(0, 5);
      if (!pool.length) return toast(t('noCards'));
      for (const c of pool) answers.set(c.q, c.a);
      area.value = [area.value.trim(), ...pool.map((c) => c.q)].filter(Boolean).join('\n');
    };
    root.replaceChildren(h('form.stack-lg.ws-pt', { onsubmit: (e) => {
      e.preventDefault();
      const qs = area.value.split(/\r?\n/).map((q) => q.trim()).filter(Boolean).map((q) => ({ q, a: answers.get(q) || '' }));
      if (!qs.length) return area.focus();
      api.save('lastTopic', topic);
      const p = newPretest(topic, qs);
      put(p);
      guess(p);
    } },
      back(),
      h('div.stack',
        h('div.field-row', h('label', { for: 'pretest-topic' }, t('topicQ')), api.topicPicker(topic, (v) => { topic = v; })),
        h('div.field-row', h('label', { for: 'pretest-questions' }, t('questionsLabel')), area),
        h('div.row', h('button.btn.soft.small', { type: 'button', onclick: fromCards }, t('fromCards'))),
        h('p.muted.small', t('questionsHelp'))),
      h('div.row', h('button.btn', { type: 'submit' }, t('toGuess')))));
    area.focus();
  }

  function guess(p) {
    const save = (i, v) => { p.items[i].guess = v; put(p); };
    root.replaceChildren(h('div.stack-lg.ws-pt',
      back(),
      h('div', h('h2', topicLine(p)), h('p.muted', t('guessLede'))),
      h('ol.ws-pt-qs', p.items.map((it, i) => h('li.stack',
        h('label.ws-pt-q', { for: `pretest-g-${i}` }, it.q),
        h('textarea.field', { id: `pretest-g-${i}`, rows: 2, placeholder: t('guessPlaceholder'), oninput: (e) => save(i, e.target.value) }, it.guess)))),
      h('div.row', h('button.btn', { type: 'button', onclick: () => { const l = lockPretest(get(p.id)); put(l); lockedView(l); } }, t('lock')))));
    root.querySelector('#pretest-g-0')?.focus();
  }

  function lockedView(p) {
    root.replaceChildren(h('div.stack-lg.ws-pt',
      back(),
      h('section.card.center.stack',
        h('p.ws-pt-emoji', { 'aria-hidden': 'true' }, '🔒'),
        h('h2', t('lockedTitle')),
        h('p.muted', t('lockedText', { topic: topicLine(p), date: nice(p.lockedAt) })),
        h('button.btn', { type: 'button', onclick: () => compare(p) }, t('studied')))));
  }

  function compare(p) {
    const rows = p.items.map((it, i) => {
      const ans = it.a ? null : h('textarea.field', { id: `pretest-a-${i}`, rows: 2, placeholder: t('answerPlaceholder') });
      const box = h('input', { type: 'checkbox', id: `pretest-s-${i}`, checked: it.surprised });
      return { it, ans, box, el: h('li.card.stack.ws-pt-compare',
        h('p.ws-pt-q', it.q),
        h('div.ws-pt-guess', h('p.eyebrow', t('yourGuess')), h('p', it.guess || t('noGuess'))),
        it.a ? h('div.ws-pt-answer', h('p.eyebrow', t('answer')), h('p', it.a))
          : h('div.field-row', h('label', { for: `pretest-a-${i}` }, t('answerLabel')), ans),
        h('label.check.ws-pt-surprise', { for: `pretest-s-${i}` }, box, h('span', t('surprised')))) };
    });
    root.replaceChildren(h('div.stack-lg.ws-pt',
      back(),
      h('div', h('h2', topicLine(p)), h('p.muted', t('compareLede'))),
      h('ol.plain.stack.ws-pt-qs', rows.map((r) => r.el)),
      h('div.row', h('button.btn', { type: 'button', onclick: () => {
        const next = { ...get(p.id), stage: 'done' };
        next.items = next.items.map((it, i) => ({ ...it, a: it.a || rows[i].ans?.value.trim() || '', surprised: rows[i].box.checked }));
        put(next);
        doneView(next);
      } }, t('finishCompare')))));
  }

  function doneView(p) {
    const surprises = p.items.filter((x) => x.surprised);
    const known = new Set(deck.cards().map((c) => c.q));
    const addable = surprises.filter((x) => x.a && !known.has(x.q));
    root.replaceChildren(h('div.stack-lg.ws-pt',
      back(),
      h('div.center.stack',
        h('p.ws-pt-emoji', { 'aria-hidden': 'true' }, surprises.length ? '😮' : '🎯'),
        h('h2', topicLine(p)),
        h('p.muted', surprises.length ? tn('ws.pretest.surprises', surprises.length) : t('noSurprises'))),
      h('ol.plain.ws-pt-review', p.items.map((it) => h('li.stack',
        h('p.ws-pt-q', it.surprised ? '😮 ' : '', it.q),
        h('p.muted.small', `${t('yourGuess')}: ${it.guess || t('noGuess')}`),
        it.a ? h('p.small', `${t('answer')}: ${it.a}`) : null))),
      h('div.row',
        addable.length ? h('button.btn', { type: 'button', onclick: () => {
          deck.addCards(addable.map((x) => newCard({ q: x.q, a: x.a, topic: p.topic })));
          toast(tn('ws.pretest.added', addable.length));
          doneView(p);
        } }, t('addToDeck')) : null,
        h('button.btn.ghost.small', { type: 'button', onclick: async () => {
          if (await confirmSheet({ title: t('deleteTitle'), ok: t('delete'), danger: true })) { api.update('sets', (l) => l.filter((x) => x.id !== p.id), []); list(); }
        } }, t('delete')))));
  }

  list();
}
