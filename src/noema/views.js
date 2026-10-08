// noema-lite screens: the subject list (#/noema), one subject (#/noema/:id), the card on an imported
// course and the deep links on its topics.
import { h, toast } from '../core/dom.js';
import { t, tn } from '../core/i18n.js';
import * as study from '../core/study.js';
import { iso } from '../core/dates.js';
import { icon } from '../ui/art.js';
import { config, signedIn } from '../cloud/client.js';
import * as source from './source.js';
import { link } from './ids.js';
import { importCourse, defaultMode, counts as packCounts } from './import.js';
import { whatNext, sharedQueue, summary } from './progress.js';
import { outbox } from './results.js';

const back = (href, label) => h('a.btn.ghost.small', { href, style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), label);
const ext = (href, label, cls = 'a.chip') => h(cls, { href, target: '_blank', rel: 'noopener' }, label, h('span', { 'aria-hidden': 'true' }, ' ↗'));
const base = () => config().noemaUrl;
const linkedCourse = (id) => study.courses().find((c) => c.noema?.subject === id) || null;

function bar(share, label) {
  return h('div.progress', { role: 'img', 'aria-label': label }, h('span', { style: { width: `${Math.round(share * 100)}%` } }));
}

// ---------- what next ----------
export function nextText(n) {
  switch (n.kind) {
    case 'review': return t('noema.next.review', { title: n.title });
    case 'cards': return tn('noema.next.cards', n.count);
    case 'mistakes': return tn('noema.next.mistakes', n.count);
    case 'read': return t('noema.next.read', { title: n.title });
    case 'start': return t('noema.next.start', { title: n.title });
    case 'practice': return t('noema.next.practice', { title: n.title });
    default: return t('noema.next.done');
  }
}

export function nextHref(subject, n, caps = {}) {
  switch (n.kind) {
    case 'review': return '#/do/reviews';
    case 'cards': return link(base(), subject, { cards: true, chapter: n.chapter }, caps);
    case 'mistakes': return link(base(), subject, { mistakes: true }, caps);
    case 'read': case 'start': return link(base(), subject, { section: n.section }, caps);
    case 'practice': return link(base(), subject, { practice: n.chapter }, caps);
    default: return null;
  }
}

function nextCard(course, state) {
  const n = whatNext({ course, state, today: iso() });
  const href = nextHref(course.noema.subject, n);
  return h('div.card.soft-card.noema-next',
    h('p.eyebrow', '🧭 ', t('noema.next')),
    h('p.noema-next-text', nextText(n)),
    href ? (href.startsWith('#') ? h('a.btn.small', { href }, t('noema.go')) : ext(href, t('noema.go'), 'a.btn.small')) : null);
}

// ---------- #/noema ----------
export function hub() {
  const root = h('div.stack-lg.noema');
  const list = h('div.cards', h('p.muted', { role: 'status' }, t('noema.loading')));
  const queueBox = h('div');
  root.append(
    back('#/do/courses', t('noema.courses')),
    h('div', h('p.eyebrow', '🦉 noema-lite'), h('h1', t('noema.title')), h('p.lede', { style: { marginTop: '8px' } }, t('noema.lede'))),
    signedIn() ? null : h('p.muted.small.noema-hint', t('noema.signInHint'), ' ', h('a', { href: '#/settings' }, t('noema.toSettings'))),
    queueBox,
    h('section.stack', h('h2', t('noema.subjects')), list));
  (async () => {
    let subs = [];
    try { subs = await source.subjects(); } catch { /* offline */ }
    list.replaceChildren(...(subs.length ? subs.map(subjectCard) : [h('div.empty', h('p', '🌙'), h('p.muted', t('noema.empty')))]));
    const linked = study.courses().filter((c) => c.noema);
    if (linked.length && signedIn()) queueBox.replaceChildren(queueSection(linked, await source.states().catch(() => ({}))));
  })();
  return root;
}

function subjectCard(s) {
  const mine = linkedCourse(s.id);
  return h('a.card.noema-subj', { href: `#/noema/${encodeURIComponent(s.id)}` },
    h('div.row', { style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
      h('span.noema-emoji', { 'aria-hidden': 'true' }, s.emoji || '📘'),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('h3', s.title),
        s.description ? h('p.muted.small.noema-desc', s.description) : null),
      mine ? h('span.badge.leaf', '✓ ', t('noema.imported')) : null),
    s.progress?.touched ? h('div', { style: { marginTop: '12px' } }, bar(s.progress.share, t('noema.progress', { n: Math.round(s.progress.share * 100) }))) : null);
}

export function queueSection(courses, states) {
  const q = sharedQueue({ courses, states, today: iso() }).slice(0, 8);
  return h('section.stack.noema-queue',
    h('div', h('h2', t('noema.queue')), h('p.muted.small', t('noema.queueLede'))),
    q.length
      ? h('div.list', q.map((i) => {
          const tags = [
            i.review ? h('span.badge.time', '🔁 ', t('noema.q.review')) : null,
            i.cards ? h('span.badge', '🃏 ', tn('noema.q.cards', i.cards)) : null,
            i.mistakes ? h('span.badge', '🔁 ', tn('noema.q.mistakes', i.mistakes)) : null,
            i.playbooks ? h('span.badge', '🔧 ', tn('noema.q.playbooks', i.playbooks)) : null,
          ];
          const href = i.review ? '#/do/reviews'
            : i.mistakes ? link(base(), i.subject, { mistakes: true })
              : i.cards ? link(base(), i.subject, { cards: true, chapter: i.chapter })
                : link(base(), i.subject, { chapter: i.chapter, tab: 'debug' });
          const attrs = href.startsWith('#') ? { href } : { href, target: '_blank', rel: 'noopener' };
          return h('a', { ...attrs, 'data-key': i.key }, h('span.label', i.title, h('span.muted.small.noema-qcourse', i.course)), h('span.row.noema-tags', tags));
        }))
      : h('p.muted', t('noema.queueEmpty')));
}

// ---------- #/noema/:id ----------
export function subjectView({ id }) {
  const root = h('div.stack-lg.noema');
  root.append(back('#/noema', t('noema.title')), h('p.muted', { role: 'status' }, t('noema.loading')));
  (async () => {
    const subs = await source.subjects().catch(() => []);
    const meta = subs.find((s) => s.id === id) || { id, title: id, emoji: '📘' };
    let pack = null;
    try { pack = await source.pack(meta); } catch { /* shown below */ }
    const draw = () => {
      const course = linkedCourse(id);
      const c = pack ? packCounts(pack) : meta.counts;
      let mode = course?.noema?.mode || (pack ? defaultMode(pack) : 'chapter');
      const modes = h('div.seg', { role: 'group', 'aria-label': t('noema.mode') }, ['chapter', 'section'].map((m) => h('button', {
        'aria-pressed': String(m === mode),
        onclick: (e) => { mode = m; for (const b of modes.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); },
      }, t(`noema.mode.${m}`))));
      const doImport = () => {
        const next = importCourse(pack, { mode, existing: course, today: iso() });
        study.upsertCourse(next);
        toast(course ? t('noema.updatedToast') : t('noema.importedToast', { n: next.topics.length }));
        location.hash = `#/do/course/${next.id}`;
      };
      root.replaceChildren(
        back('#/noema', t('noema.title')),
        h('div.noema-head',
          h('span.noema-emoji.big', { 'aria-hidden': 'true' }, meta.emoji || pack?.subject?.emoji || '📘'),
          h('h1', meta.title || pack?.subject?.title),
          meta.description ? h('p.lede', meta.description) : null,
          c ? h('p.muted.small', t('noema.counts', { c: c.chapters, s: c.sections, e: c.exercises })) : null,
          meta.progress?.touched ? bar(meta.progress.share, t('noema.progress', { n: Math.round(meta.progress.share * 100) })) : null),
        course && course.noema ? nextCard(course, meta.state) : null,
        !pack ? h('p.muted', t('noema.packFailed'))
          : course
            ? h('div.stack.noema-actions',
                h('a.btn', { href: `#/do/course/${course.id}` }, t('noema.openCourse')),
                h('button.btn.ghost.small', { onclick: doImport }, t('noema.update')))
            : h('div.stack.noema-actions',
                h('div', h('p.eyebrow', t('noema.mode')), modes),
                h('button.btn', { onclick: doImport }, t('noema.import'))),
        h('p', ext(link(base(), id), t('noema.openIn'), 'a.btn.ghost.small')));
    };
    draw();
  })();
  return root;
}

// ---------- on an imported course ----------
export function courseCard(course) {
  if (!course?.noema?.subject) return null;
  const subject = course.noema.subject;
  const box = h('div.card.soft-card.noema-card',
    h('p.eyebrow', '🦉 ', t('noema.inSubject')),
    h('p.noema-next-text', { role: 'status' }, t('noema.loading')));
  (async () => {
    const states = await source.states().catch(() => ({}));
    const caps = await source.caps().catch(() => ({}));
    const state = states[subject] || null;
    const n = whatNext({ course, state, today: iso() });
    const href = nextHref(subject, n, caps);
    const s = summary(state);
    const waiting = outbox().filter((i) => i.subject === subject).length;
    box.replaceChildren(
      h('p.eyebrow', '🦉 ', t('noema.inSubject')),
      h('p.noema-next-text', '🧭 ', nextText(n)),
      h('div.row',
        href ? (href.startsWith('#') ? h('a.btn.small', { href }, t('noema.go')) : ext(href, t('noema.go'), 'a.btn.small')) : null,
        ext(link(base(), subject, { cards: true }, caps), s.cardsDue ? `🃏 ${s.cardsDue}` : t('noema.link.cards')),
        ext(link(base(), subject, { mistakes: true }, caps), s.mistakes ? `🔁 ${s.mistakes}` : t('noema.link.mistakes'))),
      waiting ? h('p.muted.small', tn('noema.pending', waiting)) : null);
  })();
  return box;
}

export function topicLinks(tp) {
  const n = tp?.noema;
  if (!n?.subject) return null;
  const b = base();
  return h('div.stack.noema-links', { style: { gap: '8px' } },
    h('p.eyebrow', '🦉 ', t('noema.inSubject')),
    h('div.row',
      ext(link(b, n.subject, n.section ? { section: n.section } : { chapter: n.chapter }), '📖 ' + t('noema.link.read')),
      ext(link(b, n.subject, { practice: n.chapter }), '🎯 ' + t('noema.link.practice')),
      ext(link(b, n.subject, { cards: true, chapter: n.chapter }), '🃏 ' + t('noema.link.cards'))));
}
