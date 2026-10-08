import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { index, item as findItem, section as findSection } from '../core/content.js';
import { icon } from '../ui/art.js';
import { forItem } from '../workspaces/registry.js';
export { find } from './find.js';

const KIND_EMOJI = {
  intro: '🧭', principles: '🧠', timecost: '⏱', techniques: '🛠', notes: '📝', memory: '🗝', sources: '📚',
  planning: '🗓', focus: '🎯', anxiety: '🌿', motivation: '✨', exams: '🎓', myths: '🫧', app: '🧩', references: '🔖',
};

const textOf = (html = '') => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.trim(); };
const short = (html, n = 140) => { const s = textOf(html); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };

function header(eyebrow, title, lede, back) {
  return h('div',
    back ? h('a.btn.ghost.small', { href: back, style: { marginLeft: '-12px', marginBottom: '8px' } }, icon('back'), t('common.back')) : null,
    eyebrow ? h('p.eyebrow', eyebrow) : null,
    h('h1', title),
    lede ? h('p.lede', { style: { marginTop: '8px' } }, lede) : null);
}

function timeBadge(it) {
  return it.time?.label ? h('span.badge.time', { title: t('learn.timeHint') }, '⏱ ', it.time.label) : null;
}

function itemCard(it) {
  return h('a.card', { href: `#/learn/method/${it.id}` },
    h('div.row', { style: { justifyContent: 'space-between', alignItems: 'flex-start' } }, h('h3', it.title), timeBadge(it)),
    h('p.muted.small', it.lead ?? short(it.leadHtml || it.bodyHtml)));
}

export function learn() {
  const cards = [
    { emoji: '🧭', href: '#/learn/find', title: t('learn.find'), text: t('learn.findText') },
    { emoji: '🛠', href: '#/learn/methods', title: t('learn.methods'), text: t('learn.methodsText') },
    { emoji: '🌱', href: '#/learn/guide', title: t('learn.guide'), text: t('learn.guideText') },
    { emoji: '🫧', href: '#/learn/myths', title: t('learn.myths'), text: t('learn.mythsText') },
  ];
  return h('div.stack-lg',
    header(t('nav.learn'), t('learn.title'), t('learn.lede')),
    h('div.cards.two', cards.map((c) => h('a.card', { href: c.href }, h('span.emoji', c.emoji), h('h3', c.title), h('p.muted.small', c.text)))));
}

export async function methods() {
  const c = await index();
  const groups = c.sections.filter((s) => ['techniques', 'notes', 'memory'].includes(s.kind));
  return h('div.stack-lg',
    header(t('nav.learn'), t('learn.methods'), t('learn.methodsLede'), '#/learn'),
    groups.map((s) => h('section.stack', h('h2', s.title), h('div.cards', s.items.map(itemCard)))));
}

export async function method({ id }) {
  const found = await findItem(id);
  if (!found) return h('p.muted', t('error.notFound'));
  const { item: it, section: s } = found;
  const p = it.parts || {};
  const block = (title, html) => html ? h('section', h('h3', { style: { marginBottom: '8px' } }, title), h('div.prose', { html })) : null;
  const hasParts = it.structured && (p.why || p.how);
  const ex = p.examples || {};
  const ws = forItem(it.id);
  return h('article.stack-lg',
    h('div', header(s.title, it.title, null, s.kind === 'techniques' ? '#/learn/methods' : `#/learn/guide/${s.id}`),
      (timeBadge(it) || ws || ['techniques', 'notes', 'memory'].includes(s.kind)) ? h('div.row', { style: { marginTop: '12px' } }, timeBadge(it),
        ws ? h('a.btn.soft.small', { href: `#/ws/${ws.id}` }, ws.emoji, ' ', t('learn.openWorkspace')) : null,
        ['techniques', 'notes', 'memory'].includes(s.kind) ? h('a.btn.ghost.small', { href: `#/grow/lab/new/${it.id}` }, '🧪 ', t('grow.lab.start')) : null) : null),
    hasParts
      ? h('div.stack-lg',
          it.leadHtml ? h('div.prose.lede', { html: it.leadHtml }) : null,
          block(t('learn.part.why'), p.why),
          block(t('learn.part.how'), p.how),
          (ex.simple || ex.nontrivial) ? h('section.stack',
            h('h3', t('learn.part.examples')),
            ex.simple ? h('div.card', h('p.eyebrow', t('learn.part.simple')), h('div.prose', { html: ex.simple })) : null,
            ex.nontrivial ? h('div.card', h('p.eyebrow', t('learn.part.nontrivial')), h('div.prose', { html: ex.nontrivial })) : null) : null,
          block('⏱ ' + t('learn.part.time'), p.time),
          block(t('learn.part.watch'), p.watch))
      : h('div.prose', { html: it.bodyHtml }),
    readingBox(it));
}

function readingBox(it) {
  if (!it.reading?.length) return null;
  return h('details.reading',
    h('summary', '📚 ', t('learn.reading')),
    h('ul', it.reading.map((r) => h('li', { html: r.html }))));
}

export async function guide() {
  const c = await index();
  const sections = c.sections.filter((s) => !['app', 'references'].includes(s.kind));
  return h('div.stack-lg',
    header(t('nav.learn'), t('learn.guide'), t('learn.guideLede'), '#/learn'),
    h('div.cards', sections.map((s) => h('a.card', { href: `#/learn/guide/${s.id}` },
      h('div.row', h('span', { style: { fontSize: '22px' } }, KIND_EMOJI[s.kind] || '•'), h('h3', { style: { margin: 0 } }, s.title))))));
}

export async function guideSection({ id }) {
  const s = await findSection(id);
  if (!s) return h('p.muted', t('error.notFound'));
  return h('div.stack-lg',
    header(t('learn.guide'), s.title, null, '#/learn/guide'),
    s.introHtml ? h('div.prose', { html: s.introHtml }) : null,
    s.items.length ? h('div.cards', s.items.map(itemCard)) : null);
}

export async function myths() {
  const meta = (await index()).sections.find((x) => x.kind === 'myths');
  const s = meta && await findSection(meta.id);
  if (!s) return h('p.muted', t('error.notFound'));
  return h('div.stack-lg',
    header(t('nav.learn'), t('learn.myths'), t('learn.mythsLede'), '#/learn'),
    h('div.cards', s.items.map((it) => h('details.card',
      h('summary', { style: { cursor: 'pointer', listStyle: 'none' } }, h('h3', '🫧 ', it.title), h('p.muted.small', { style: { margin: 0 } }, t('learn.mythTap'))),
      h('div.prose', { style: { marginTop: '16px' }, html: it.bodyHtml }),
      readingBox(it)))));
}
