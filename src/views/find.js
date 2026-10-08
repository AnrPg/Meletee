// "Find your method": three gentle questions, one per screen, then a starter set.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { index } from '../core/content.js';
import { companion, icon } from '../ui/art.js';

const QUESTIONS = [
  { id: 'subject', options: ['facts', 'ideas', 'problems', 'skills'], emoji: ['🗂', '🕸', '🧩', '🎻'] },
  { id: 'time', options: ['short', 'medium', 'long'], emoji: ['☕', '🍵', '🫖'] },
  { id: 'hardest', options: ['starting', 'remembering', 'understanding', 'nerves'], emoji: ['🐢', '🫥', '🌀', '🦋'] },
];

// Technique id prefixes (ids are slugs of the English headings).
const PICKS = {
  facts: ['active-recall', 'spaced-repetition', 'successive-relearning'],
  ideas: ['blank-page', 'elaborative', 'feynman'],
  problems: ['practice-questions', 'interleaving', 'self-explanation'],
  skills: ['practice-questions', 'learning-by-teaching', 'spaced-repetition'],
};
const HELP = { starting: 'focus', remembering: 'memory', understanding: 'notes', nerves: 'anxiety' };

export function find() {
  const root = h('div');
  const answers = {};
  let step = 0;

  const show = () => {
    if (step >= QUESTIONS.length) return result(root, answers);
    const q = QUESTIONS[step];
    root.replaceChildren(h('div.stack-lg.view',
      h('div',
        h('a.btn.ghost.small', { href: step ? undefined : '#/learn', style: { marginLeft: '-12px', marginBottom: '8px' },
          onclick: step ? () => { step--; show(); } : null }, icon('back'), t('common.back')),
        h('p.eyebrow', t('find.step', { n: step + 1, total: QUESTIONS.length })),
        h('h1', t(`find.q.${q.id}`))),
      h('div.cards', q.options.map((o, i) => h('button.card', { onclick: () => { answers[q.id] = o; step++; show(); } },
        h('div.row', h('span', { style: { fontSize: '24px' } }, q.emoji[i]),
          h('div', h('h3', t(`find.a.${q.id}.${o}`)), h('p.muted.small', { style: { margin: 0 } }, t(`find.a.${q.id}.${o}.hint`)))))))));
  };
  show();
  return root;
}

async function result(root, answers) {
  const c = await index();
  const techniques = c.sections.find((s) => s.kind === 'techniques')?.items || [];
  let picks = PICKS[answers.subject].map((p) => techniques.find((it) => it.id.startsWith(p))).filter(Boolean);
  if (answers.time === 'short') picks.sort((a, b) => (a.time?.x?.[0] ?? 99) - (b.time?.x?.[0] ?? 99));
  const help = c.sections.find((s) => s.kind === HELP[answers.hardest]);
  store.set('method', { answers, picks: picks.map((p) => p.id), at: new Date().toISOString() });

  root.replaceChildren(h('div.stack-lg.view',
    h('section.hero', { style: { paddingBottom: 0 } },
      companion({ mood: 'happy', leaves: 3, label: t('companion.label') }),
      h('h1', t('find.result.title')),
      h('p.lede', t(`find.result.time.${answers.time}`))),
    h('div.cards', picks.map((it, i) => h('a.card', { href: `#/learn/method/${it.id}` },
      h('div.row', { style: { justifyContent: 'space-between' } },
        h('h3', `${i + 1}. ${it.title}`),
        it.time?.label ? h('span.badge.time', '⏱ ', it.time.label) : null)))),
    help ? h('a.card', { href: `#/learn/guide/${help.id}`, style: { background: 'var(--leaf-bg)', borderColor: 'transparent' } },
      h('p.eyebrow', t('find.result.help')), h('h3', help.title)) : null,
    h('p.muted.small', t('find.result.experiment'))));
}
