// Method Lab: one method for 1-2 weeks, a quick rating after each session,
// a next-day recall check, then keep / tweak / drop. Plus the "my methods" profile.
import { h, sheet, toast } from '../../core/dom.js';
import { t, tn, lang } from '../../core/i18n.js';
import { iso, nice } from '../../core/dates.js';
import { index } from '../../core/content.js';
import * as study from '../../core/study.js';
import * as data from '../../grow/data.js';
import * as L from '../../grow/lab.js';
import { back, scale, celebrate } from './ui.js';

const KINDS = ['techniques', 'notes', 'memory'];

async function methodGroups() {
  try {
    const c = await index();
    return c.sections.filter((s) => KINDS.includes(s.kind)).map((s) => ({ title: s.title, items: s.items.filter((i) => i.id !== 'a-simple-rule-of-thumb' && i.id !== 'which-note-format-for-which-material') }));
  } catch { return []; }
}

async function titles() {
  const map = new Map();
  for (const g of await methodGroups()) for (const i of g.items) map.set(i.id, i.title);
  return map;
}

const nameOf = (e, map) => (e.method === L.BASELINE ? t('grow.lab.usual') : map.get(e.method) || e.title || e.method);
const courseName = (id) => study.courses().find((c) => c.id === id)?.name || '';

function subline(e) {
  const bits = [];
  if (e.contentType) bits.push(t(`grow.lab.type.${e.contentType}`));
  const c = e.courseId && courseName(e.courseId);
  if (c) bits.push(c);
  return bits.join(' · ');
}

function progress(e) {
  const n = e.sessions.length;
  return h('div.lab-progress', { 'aria-label': tn('grow.lab.sessionsOf', n, { min: L.MIN_SESSIONS }) },
    h('span.dots', Array.from({ length: Math.max(L.MIN_SESSIONS, n) }, (_, i) => h(i < n ? 'i.on' : 'i'))),
    h('span.muted.small', n >= L.MIN_SESSIONS ? tn('grow.lab.sessions', n) : tn('grow.lab.sessionsOf', n, { min: L.MIN_SESSIONS })));
}

function expCard(e, map) {
  const status = e.decision ? `${t(`grow.lab.decision.${e.decision}.emoji`)} ${t(`grow.lab.decision.${e.decision}`)}`
    : L.needsDecision(e) ? t('grow.lab.timeToDecide')
      : t('grow.lab.dayOf', { n: L.dayNumber(e), of: e.days });
  return h('a.card.lab-card', { href: `#/grow/lab/${e.id}` },
    h('div.row', { style: { justifyContent: 'space-between' } },
      h('h3', nameOf(e, map)),
      h('span.badge', status)),
    subline(e) ? h('p.muted.small', { style: { margin: 0 } }, subline(e)) : null,
    e.decision ? null : progress(e),
    !e.decision && L.pendingRecall(e) ? h('p.small.lab-pending', '🌅 ', t('grow.lab.recallWaiting')) : null);
}

export async function labList() {
  const map = await titles();
  const all = data.lab();
  const running = all.filter((e) => !e.decision);
  const done = all.filter((e) => e.decision);
  const howSteps = [1, 2, 3, 4].map((n) => h('li', t(`grow.lab.how.${n}`)));
  return h('div.stack-lg',
    back(),
    h('div', h('h1', '🧪 ', t('grow.lab.title')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.lab.lede'))),
    running.length ? h('div.cards', running.map((e) => expCard(e, map))) : h('div.empty', h('p', '🧪'), h('p.muted', t('grow.lab.empty'))),
    h('div.center', h('a.btn', { href: '#/grow/lab/new' }, t('grow.lab.start'))),
    running.length === 1 && running[0].method !== L.BASELINE ? h('p.muted.small.center', t('grow.lab.baselineHint')) : null,
    done.length ? h('a.card.row-card', { href: '#/grow/methods' }, h('span', '🧬'), h('div', h('h3', t('grow.profile.title')), h('p.muted.small', tn('grow.profile.count', done.length)))) : null,
    done.length ? h('details.grow-details', h('summary', tn('grow.lab.past', done.length)), h('div.cards', done.map((e) => expCard(e, map)))) : null,
    h('details.grow-details', h('summary', t('grow.lab.howTitle')), h('ol.how', howSteps)));
}

export async function labNew({ method: preset } = {}) {
  const groups = await methodGroups();
  const courses = study.courses();
  let type = null;
  let days = 14;
  const select = h('select.field', { id: 'lab-method', name: 'method', required: true },
    h('option', { value: '' }, t('grow.lab.pick')),
    h('option', { value: L.BASELINE, selected: preset === L.BASELINE }, t('grow.lab.usualOption')),
    groups.map((g) => h('optgroup', { label: g.title }, g.items.map((i) => h('option', { value: i.id, selected: i.id === preset }, i.title)))));
  const typeChips = h('div.row', { role: 'group', 'aria-labelledby': 'lab-type-label' }, L.CONTENT_TYPES.map((k) => h('button.chip', {
    type: 'button', 'aria-pressed': 'false',
    onclick: (e) => {
      type = type === k ? null : k;
      for (const b of typeChips.children) b.setAttribute('aria-pressed', String(b === e.currentTarget && type === k));
    },
  }, t(`grow.lab.type.${k}`))));
  const lenSeg = h('div.seg', { role: 'group', 'aria-labelledby': 'lab-len-label' }, [7, 14].map((d) => h('button', {
    type: 'button', 'aria-pressed': String(d === days),
    onclick: (e) => { days = d; for (const b of lenSeg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); },
  }, d === 7 ? t('grow.lab.oneWeek') : t('grow.lab.twoWeeks'))));
  const form = h('form.stack', { onsubmit: (ev) => {
    ev.preventDefault();
    const m = select.value;
    if (!m) { select.focus(); return; }
    const title = m === L.BASELINE ? '' : select.selectedOptions[0]?.textContent || '';
    const e = L.newExperiment({ method: m, title, courseId: form.elements.course?.value || null, contentType: type, days });
    data.saveLab([...data.lab(), e]);
    location.hash = `#/grow/lab/${e.id}`;
  } },
    h('label.field-row', { for: 'lab-method' }, t('grow.lab.whichMethod')), select,
    h('p.muted.small', t('grow.lab.oneThing')),
    courses.length ? h('label.field-row', t('grow.lab.course'),
      h('select.field', { name: 'course', id: 'lab-course' }, h('option', { value: '' }, t('grow.lab.anyCourse')), courses.map((c) => h('option', { value: c.id }, c.name)))) : null,
    h('div.stack', { style: { marginTop: 'var(--s5)' } }, h('p.field-row', { id: 'lab-type-label' }, t('grow.lab.contentType')), typeChips),
    h('div.stack', h('p.field-row', { id: 'lab-len-label' }, t('grow.lab.length')), lenSeg),
    h('div.center', { style: { marginTop: 'var(--s6)' } }, h('button.btn', { type: 'submit' }, t('grow.lab.begin'))));
  return h('div.stack-lg',
    back('#/grow/lab', t('grow.lab.title')),
    h('div', h('h1', t('grow.lab.newTitle')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.lab.newLede'))),
    form);
}

function rateSheet(e, onSaved) {
  const scales = L.NOW_SCALES.map((k) => scale(k));
  let close;
  const minutes = h('input.field', { type: 'number', min: 1, max: 600, id: 'lab-minutes', name: 'minutes', inputmode: 'numeric' });
  const form = h('form.stack', { onsubmit: (ev) => {
    ev.preventDefault();
    const v = Object.fromEntries(L.NOW_SCALES.map((k, i) => [k, scales[i].value()]));
    if (!v.enjoy && !v.focus && !v.effort) { toast(t('grow.lab.tapSome')); return; }
    data.updateExperiment(e.id, (x) => L.rate(x, { ...v, minutes: minutes.value || null }));
    close();
    onSaved();
  } },
    h('h2', t('grow.lab.rateTitle')),
    h('p.muted.small', t('grow.lab.rateLede')),
    scales.map((s) => s.el),
    h('label.field-row', t('grow.lab.minutes'), minutes),
    h('div.center', h('button.btn', { type: 'submit' }, t('common.save'))));
  close = sheet(form, { label: t('grow.lab.rateTitle') });
}

function bars(sum) {
  return h('div.lab-bars', L.SCALES.map((k) => {
    const v = sum.averages[k];
    return h('div.lab-bar', { 'data-scale': k },
      h('span.small', t(`grow.scale.${k}.emoji`), ' ', t(`grow.scale.${k}`)),
      h('span.track', h('span', { style: { width: v == null ? '0%' : `${(v / 5) * 100}%` } })),
      h('strong.small', v == null ? '–' : String(v)));
  }));
}

// Optional AI coach (phase 4 builds src/ai). Renders nothing unless the module exists and answers.
function coachSlot(e, sum) {
  const slot = h('div.lab-coach');
  // --- optional hook: AI Method Lab coach -------------------------------------------
  import('../../ai/coach.js')
    .then((m) => m.labCoach?.(sum, { lang: lang(), experiment: e, all: data.lab().map((x) => L.summary(x)) }))
    .then((out) => {
      if (!out || !slot.isConnected) return;
      if (out instanceof Node) slot.append(out);
      else if (typeof out === 'string') slot.append(h('div.card.soft-card', h('p.eyebrow', '🤖 ', t('grow.lab.coach')), h('p', out)));
    })
    .catch(() => null);
  // -----------------------------------------------------------------------------------
  return slot;
}

function compareBox(e, map) {
  const others = data.lab().filter((x) => x.id !== e.id && x.sessions.length);
  if (!others.length || !e.sessions.length) return null;
  const out = h('div.stack');
  const pickDefault = others.find((x) => x.method === L.BASELINE) || others[0];
  const sel = h('select.field', { id: 'lab-compare', onchange: () => draw() },
    others.map((x) => h('option', { value: x.id, selected: x.id === pickDefault.id }, `${nameOf(x, map)} · ${nice(x.start)}`)));
  const draw = () => {
    const other = others.find((x) => x.id === sel.value);
    const c = L.compare(e, other);
    out.replaceChildren(h('table.lab-compare',
      h('thead', h('tr', h('th', h('span.sr-only', t('grow.lab.scale'))), h('th', nameOf(e, map)), h('th', nameOf(other, map)))),
      h('tbody', L.SCALES.map((k) => h('tr', h('th', t(`grow.scale.${k}.emoji`), ' ', t(`grow.scale.${k}`)),
        h('td', c.a.averages[k] ?? '–'), h('td', c.b.averages[k] ?? '–'))))),
    h('p.muted.small', c.better === e.id ? t('grow.lab.betterThis') : c.better === other.id ? t('grow.lab.betterOther') : t('grow.lab.similar')));
  };
  draw();
  return h('section.stack', h('h2', t('grow.lab.compare')), h('label.field-row', { for: 'lab-compare' }, t('grow.lab.compareWith')), sel, out);
}

export async function labDetail({ id }) {
  const map = await titles();
  const root = h('div.stack-lg.grow-celebrate-host');
  const draw = () => {
    const e = data.lab().find((x) => x.id === id);
    if (!e) { root.replaceChildren(back('#/grow/lab', t('grow.lab.title')), h('p.muted', t('error.notFound'))); return; }
    const sum = L.summary(e);
    const pending = !e.decision && L.pendingRecall(e);
    const today = iso();
    const ratedToday = e.sessions.some((s) => s.date === today);

    const recallCard = pending ? h('section.card.lab-recall',
      h('p.eyebrow', '🌅 ', t('grow.lab.nextDay')),
      h('p', t('grow.lab.recallAsk', { date: nice(pending.date, { weekday: 'long', day: 'numeric', month: 'short' }) })),
      scale('recall', null, (n) => {
        data.updateExperiment(e.id, (x) => L.rateRecall(x, pending.id, n));
        setTimeout(draw, 250);
      }).el) : null;

    let verdict = null;
    if (!e.decision && (sum.enough || sum.over)) {
      const sug = sum.suggestion;
      let note = '';
      const noteField = h('textarea.field', { rows: 2, id: 'lab-note', placeholder: t('grow.lab.notePlaceholder'), oninput: (ev) => { note = ev.target.value; } });
      verdict = h('section.card.stack.lab-verdict',
        h('h2', t('grow.lab.decideTitle')),
        sug ? h('p', t(`grow.lab.suggest.${sug}`)) : h('p.muted', t('grow.lab.suggest.few')),
        h('label.field-row', { for: 'lab-note' }, t('grow.lab.note')), noteField,
        h('div.row', L.DECISIONS.map((d) => h(d === (sug === 'dropWarmup' ? 'drop' : sug) ? 'button.btn.small' : 'button.btn.soft.small', {
          onclick: () => {
            data.updateExperiment(e.id, (x) => ({ ...x, decision: d, decidedAt: iso(), note: note.trim() }));
            celebrate(root);
            toast(t('grow.lab.decided'));
            draw();
          },
        }, t(`grow.lab.decision.${d}.emoji`), ' ', t(`grow.lab.decision.${d}`)))));
    }

    root.replaceChildren(
      back('#/grow/lab', t('grow.lab.title')),
      h('div',
        subline(e) ? h('p.eyebrow', subline(e)) : null,
        h('h1', nameOf(e, map)),
        h('p.muted', { style: { marginTop: '8px' } }, e.decision
          ? `${t(`grow.lab.decision.${e.decision}.emoji`)} ${t(`grow.lab.decision.${e.decision}`)}${e.note ? ` · ${e.note}` : ''}`
          : `${t('grow.lab.dayOf', { n: sum.day, of: e.days })} · ${t('grow.lab.until', { date: nice(sum.end) })}`)),
      recallCard,
      e.decision ? null : h('section.stack.center',
        progress(e),
        h('button.btn', { onclick: () => rateSheet(e, () => { draw(); toast(t('grow.lab.saved')); }) }, ratedToday ? t('grow.lab.rateAnother') : t('grow.lab.rate')),
        !sum.enough && !sum.over ? h('p.muted.small', tn('grow.lab.judgeAfter', sum.left)) : null),
      verdict,
      e.sessions.length ? h('section.stack', h('h2', t('grow.lab.results')), bars(sum),
        h('p.muted.small', t('grow.lab.effortNote')),
        sum.sessions && !sum.recallRated ? h('p.muted.small', t('grow.lab.recallLater')) : null) : null,
      sum.enough ? coachSlot(e, sum) : null,
      compareBox(e, map),
      e.method !== L.BASELINE ? h('a.btn.ghost.small', { href: `#/learn/method/${e.method}`, style: { alignSelf: 'flex-start' } }, '📖 ', t('grow.lab.about')) : null,
      h('details.grow-details',
        h('summary', t('grow.lab.more')),
        h('div.row', { style: { marginTop: 'var(--s3)' } },
          e.decision ? h('button.btn.soft.small', { onclick: () => { data.updateExperiment(e.id, (x) => ({ ...x, decision: null, decidedAt: null })); draw(); } }, t('grow.lab.undo')) : null,
          h('button.btn.ghost.small.grow-danger', { onclick: (ev) => {
            const b = ev.currentTarget;
            if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = t('grow.lab.deleteSure'); return; }
            data.saveLab(data.lab().filter((x) => x.id !== e.id));
            location.hash = '#/grow/lab';
          } }, t('grow.lab.delete')))));
  };
  draw();
  return root;
}

export async function methodsProfile() {
  const map = await titles();
  const p = L.profile(data.lab());
  const row = (x) => h('li.profile-row',
    h('div', h('strong', x.method === L.BASELINE ? t('grow.lab.usual') : map.get(x.method) || x.title || x.method),
      x.contentType ? h('span.muted.small', ' · ', t(`grow.lab.type.${x.contentType}`)) : null,
      x.note ? h('p.muted.small', { style: { margin: 0 } }, x.note) : null),
    h('span.muted.small.nowrap', `${t('grow.scale.recall.emoji')} ${x.averages.recall ?? '–'} · ${t('grow.scale.enjoy.emoji')} ${x.averages.enjoy ?? '–'}`));
  const group = (d) => (p[d].length ? h('section.stack',
    h('h2', t(`grow.lab.decision.${d}.emoji`), ' ', t(`grow.profile.${d}`)),
    h('ul.plain.profile', p[d].map(row))) : null);
  const allIds = [...map.keys()];
  const next = L.untried(data.lab(), ['blank-page-recall-brain-dump', 'practice-questions', 'active-recall-practice-testing', 'self-explanation', 'interleaving', 'dual-coding', ...allIds])[0];
  const types = Object.entries(p.byType).filter(([k]) => k !== 'any');
  return h('div.stack-lg',
    back('#/grow/lab', t('grow.lab.title')),
    h('div', h('h1', '🧬 ', t('grow.profile.title')), h('p.lede', { style: { marginTop: '8px' } }, t('grow.profile.lede'))),
    p.count ? null : h('div.empty', h('p', '🌱'), h('p.muted', t('grow.profile.empty'))),
    types.length ? h('section.card.soft-card.stack',
      h('h2', t('grow.profile.byType')),
      h('ul.plain', types.map(([k, xs]) => h('li', h('strong', t(`grow.lab.type.${k}`)), ': ', xs.map((x) => (x.method === L.BASELINE ? t('grow.lab.usual') : map.get(x.method) || x.title)).join(', '))))) : null,
    group('keep'), group('tweak'), group('drop'),
    next ? h('a.card.row-card', { href: `#/grow/lab/new/${next}` }, h('span', '🔭'), h('div', h('h3', t('grow.profile.next')), h('p.muted.small', map.get(next) || next))) : null,
    h('p.muted.small', t('grow.profile.monthly')));
}
