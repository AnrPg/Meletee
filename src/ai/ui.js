// What the learner sees of the tutors: one quiet button per workspace screen, inline
// results (answer checker, hints, error patterns) and a calm tutor sheet for conversations.
// Model text is always inserted as text (richText builds DOM nodes, never innerHTML).
import { h, sheet, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { TASKS, taskFor } from './router.js';
import * as ai from './index.js';

// ---------- small pieces ----------
const PROVIDER_NAME = { claude: 'Claude', gemini: 'Gemini' };

export function badge(provider, model) {
  if (!provider) return null;
  return h('span.ai-badge', { title: t('ai.answeredBy', { name: model || PROVIDER_NAME[provider] }) }, '✦ ', PROVIDER_NAME[provider]);
}

// **bold**, "- " lists and paragraphs, as DOM nodes.
export function richText(text) {
  const frag = document.createDocumentFragment();
  const inline = (line, el) => {
    const parts = String(line).split(/(\*\*[^*]+\*\*)/g);
    for (const p of parts) {
      if (!p) continue;
      if (/^\*\*[^*]+\*\*$/.test(p)) el.append(h('strong', p.slice(2, -2)));
      else el.append(p);
    }
    return el;
  };
  for (const block of String(text || '').trim().split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      const ordered = /^\s*\d/.test(lines[0]);
      frag.append(h(ordered ? 'ol' : 'ul', lines.map((l) => inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), h('li')))));
    } else {
      const p = h('p');
      lines.forEach((l, i) => { if (i) p.append(h('br')); inline(l, p); });
      frag.append(p);
    }
  }
  return frag;
}

function errorText(e) {
  const kind = e?.kind || 'api';
  return t(`ai.err.${['nokey', 'auth', 'quota', 'network', 'refusal', 'invalid'].includes(kind) ? kind : 'api'}`);
}

// Read live values: a context can be a function, and fields can be inputs.
export function resolve(context) {
  const c = typeof context === 'function' ? context() : (context || {});
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    out[k] = v && typeof v === 'object' && 'value' in v && typeof v.tagName === 'string' ? v.value : v;
  }
  return out;
}

const first = (o, keys) => { for (const k of keys) if (typeof o[k] === 'string' && o[k].trim()) return o[k].trim(); return ''; };

function labelFor(ws, ctx) {
  const s = first(ctx, ['title', 'fact', 'idea', 'question', 'q', 'topic']) || first(ctx.note || {}, ['title']) || first(ctx.lesson || {}, ['title', 'topic']);
  return `${ws.emoji || ''} ${s || t(`ai.ws.${ws.id}`)}`.trim().slice(0, 90);
}

const label = (tk, opts) => opts.label || t(`ai.btn.${tk}`);

// ---------- the button ----------
export function aiButton(ws, tk, context, opts = {}) {
  const task = TASKS[tk];
  if (!task || !ai.providerFor(tk)) return null;
  if (task.chat) {
    return h('button.btn.ghost.small.ai-btn', { type: 'button', onclick: () => openTutor(ws, tk, resolve(context), { label: opts.label }) }, '✨ ', label(tk, opts));
  }
  if (tk === 'grade') return gradeButton(ws, context, opts);
  if (tk === 'hint') return hintButton(ws, context, opts);
  if (tk === 'questions') return questionsButton(ws, context, opts);
  if (tk === 'errors') return errorsButton(ws, context, opts);
  if (tk === 'quiz') return h('button.btn.ghost.small.ai-btn', { type: 'button', onclick: () => openTutor(ws, 'socratic', resolve(context), { quiz: true }) }, '⚡ ', label(tk, opts));
  return null;
}

function busy(btn, on, text) {
  btn.disabled = on;
  btn.setAttribute('aria-busy', String(on));
  if (text) btn.lastChild.textContent = text;
}

function gradeButton(ws, context, opts) {
  const out = h('div.ai-out', { 'aria-live': 'polite' });
  const btn = h('button.btn.ghost.small.ai-btn', { type: 'button', onclick: async () => {
    const c = resolve(context);
    const question = c.question ?? c.q ?? '';
    const answer = c.answer ?? c.mine ?? c.typed ?? '';
    const reference = c.reference ?? c.correct ?? c.a ?? '';
    if (!String(answer).trim()) { toast(t('ai.tryFirst')); return; }
    busy(btn, true, t('ai.checking'));
    try {
      const g = await ai.grade({ question, answer, reference, workspace: ws.id, label: labelFor(ws, { question }) });
      out.replaceChildren(gradeCard(g));
      btn.remove();
      opts.onResult?.(g);
    } catch (e) {
      out.replaceChildren(h('p.ai-note', errorText(e)));
      busy(btn, false, label('grade', opts));
    }
  } }, '✨ ', label('grade', opts));
  return h('div.ai-inline', btn, out);
}

export function gradeCard(g) {
  const mood = g.score >= 85 ? '🌟' : g.score >= 60 ? '🌱' : '🌧️';
  const list = (emoji, items, cls) => (items?.length ? h(`ul.plain.ai-points.${cls}`, items.map((x) => h('li', h('span', { 'aria-hidden': 'true' }, emoji, ' '), x))) : null);
  return h('section.ai-card.ai-grade',
    h('div.row.ai-card-head',
      h('span.ai-score', { 'aria-label': t('ai.score', { n: g.score }) }, mood, ' ', `${g.score}`, h('small', '/100')),
      h('strong.ai-verdict', g.verdict),
      badge(g.provider, g.model)),
    list('✅', g.covered, 'ok'),
    list('➕', g.missing, 'miss'),
    list('❌', g.mistakes, 'bad'),
    g.feedback ? h('div.ai-feedback', richText(g.feedback)) : null);
}

function hintButton(ws, context, opts) {
  const given = [];
  const out = h('div.ai-out', { 'aria-live': 'polite' });
  const btn = h('button.btn.ghost.small.ai-btn', { type: 'button', onclick: async () => {
    const c = resolve(context);
    busy(btn, true, t('ai.thinking'));
    try {
      const r = await ai.hint({ question: c.question ?? c.q ?? '', attempt: c.attempt ?? c.answer ?? '', previous: given, workspace: ws.id, label: labelFor(ws, c) });
      given.push(r.text);
      out.append(h('p.ai-hint', h('span', { 'aria-hidden': 'true' }, '💡 '), r.text, ' ', badge(r.provider, r.model)));
      if (given.length >= 3) btn.remove(); else busy(btn, false, t('ai.btn.hintMore'));
    } catch (e) {
      out.append(h('p.ai-note', errorText(e)));
      busy(btn, false, given.length ? t('ai.btn.hintMore') : label('hint', opts));
    }
  } }, '💡 ', label('hint', opts));
  return h('div.ai-inline', btn, out);
}

function errorsButton(ws, context, opts) {
  const out = h('div.ai-out', { 'aria-live': 'polite' });
  const btn = h('button.btn.ghost.small.ai-btn', { type: 'button', onclick: async () => {
    const c = resolve(context);
    const errors = c.errors || [];
    if (errors.length < 2) { toast(t('ai.needMoreErrors')); return; }
    busy(btn, true, t('ai.thinking'));
    try {
      const r = await ai.groupErrors({ errors, workspace: ws.id });
      out.replaceChildren(h('section.ai-card.stack',
        h('div.row.ai-card-head', h('strong', '🧩 ', t('ai.patterns')), badge(r.provider, r.model)),
        h('p', r.summary),
        h('ul.plain.ai-groups', r.groups.map((g) => h('li',
          h('p', h('strong', g.name), h('span.muted.small', ` · ${g.count}`)),
          h('p.muted.small', g.why),
          h('p.small', '👉 ', g.tip))))));
      btn.remove();
    } catch (e) {
      out.replaceChildren(h('p.ai-note', errorText(e)));
      busy(btn, false, label('errors', opts));
    }
  } }, '✨ ', label('errors', opts));
  return h('div.ai-inline', btn, out);
}

// Question maker. With opts.onResult(questions) the workspace takes the questions itself
// (needs a topic or material in the context); otherwise a sheet lets the learner paste notes
// and pick which questions to keep (opts.onAdd(list)).
function questionsButton(ws, context, opts) {
  const btn = h('button.btn.ghost.small.ai-btn', { type: 'button', onclick: async () => {
    const c = resolve(context);
    if (opts.onResult) {
      if (!first(c, ['topic', 'material'])) { toast(t('ai.needTopic')); return; }
      busy(btn, true, t('ai.thinking'));
      try {
        const r = await ai.makeQuestions({ topic: c.topic || '', material: c.material || '', count: c.count || 5, workspace: ws.id });
        opts.onResult(r.questions, r);
        toast(t('ai.madeQuestions', { name: PROVIDER_NAME[r.provider] }));
      } catch (e) { toast(errorText(e), 3500); }
      busy(btn, false, label('questions', opts));
      return;
    }
    questionsSheet(ws, c, opts);
  } }, '✨ ', label('questions', opts));
  return btn;
}

function questionsSheet(ws, c, opts) {
  const area = h('textarea.field', { id: 'ai-material', rows: 6, placeholder: t('ai.materialPh') }, c.material || '');
  const status = h('p.muted.small', { role: 'status' });
  const results = h('div.stack');
  const go = h('button.btn', { type: 'submit' }, '✨ ', t('ai.makeGo'));
  let close;
  const form = h('form.stack', { onsubmit: async (e) => {
    e.preventDefault();
    if (!area.value.trim() && !c.topic) { area.focus(); return; }
    go.disabled = true; status.textContent = t('ai.thinking');
    try {
      const r = await ai.makeQuestions({ topic: c.topic || '', material: area.value, count: 5, workspace: ws.id });
      status.textContent = '';
      const boxes = r.questions.map((q, i) => ({ q, box: h('input', { type: 'checkbox', id: `ai-q-${i}`, checked: true }) }));
      results.replaceChildren(
        h('div.row.ai-card-head', h('strong', t('ai.pickQuestions')), badge(r.provider, r.model)),
        h('ul.plain.ai-qlist', boxes.map(({ q, box }, i) => h('li', h('label.check', { for: `ai-q-${i}` }, box, h('span', h('span', q.q), h('span.muted.small', ` → ${q.a}`)))))),
        opts.onAdd ? h('div.row', h('button.btn', { type: 'button', onclick: () => {
          const keep = boxes.filter((b) => b.box.checked).map((b) => b.q);
          if (keep.length) opts.onAdd(keep);
          close();
        } }, t('ai.addPicked'))) : null);
    } catch (err) { status.textContent = errorText(err); }
    go.disabled = false;
  } },
  h('h2', '✨ ', t('ai.makeTitle')),
  h('p.muted.small', t('ai.makeLede')),
  h('div.field-row', h('label', { for: 'ai-material' }, t('ai.material')), area),
  h('div.row', go), status, results);
  const closeSheet = sheet(form, { label: t('ai.makeTitle') });
  close = () => { window.removeEventListener('hashchange', close); closeSheet(); };
  window.addEventListener('hashchange', close);
  setTimeout(() => area.focus(), 50);
}

// ---------- the tutor sheet ----------
const KICKOFF = 'I opened this tool in the app. My material is in your instructions. Please start, following your role and the ground rules.';

export function openTutor(ws, tk, ctx = {}, { label: given, quiz = false } = {}) {
  const provider = ai.providerFor(tk);
  if (!provider) { toast(t('ai.err.nokey')); return null; }
  const title = given || t(`ai.btn.${tk}`);
  const convLabel = labelFor(ws, ctx);
  const history = []; // { role, content, createdAt, meta? }
  let recId = null;
  let controller = null;
  let lastModel = ai.modelOf(provider);

  const msgs = h('div.ai-msgs', { 'aria-live': 'polite' });
  const input = h('textarea.field.ai-input', { id: 'ai-input', rows: 2, placeholder: t('ai.inputPh'), 'aria-label': t('ai.inputLabel'),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } } });
  const send = h('button.btn.small.ai-send', { type: 'submit' }, t('ai.send'));
  const stop = h('button.btn.soft.small.ai-stop', { type: 'button', hidden: true, onclick: () => controller?.abort() }, '■ ', t('ai.stop'));
  const who = h('span', badge(provider, lastModel));
  const form = h('form.ai-composer', { onsubmit: (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v || controller) return;
    input.value = '';
    turn(v);
  } }, input, h('div.row.ai-actions', stop, send));

  const extras = [];
  if (tk === 'socratic') {
    extras.push(h('a.btn.ghost.small.ai-noema', { href: ai.noemaLink(ctx), target: '_blank', rel: 'noopener' }, t('ai.noema'), ' ↗'));
  }
  if (tk === 'socratic' && ai.providerFor('quiz')) {
    extras.push(h('button.btn.ghost.small', { type: 'button', onclick: () => runQuiz() }, '⚡ ', t('ai.btn.quiz')));
  }

  const box = h('div.stack.ai-sheet',
    h('div.row.ai-head', h('h2', '✨ ', title), who),
    msgs,
    form,
    extras.length ? h('div.row.ai-extras', extras) : null,
    h('p.muted.small.ai-foot', t('ai.footNote')));
  const closeSheet = sheet(box, { label: title });
  const close = () => { controller?.abort(); window.removeEventListener('hashchange', close); closeSheet(); };
  window.addEventListener('hashchange', close);

  const bubble = (role, node) => { const b = h(`div.ai-msg.${role}`, node); msgs.append(b); b.scrollIntoView?.({ block: 'nearest' }); return b; };

  async function persist() {
    try {
      const r = await ai.convos.put(ai.record({ id: recId, task: tk, provider, model: lastModel, workspace: ws.id, label: convLabel, messages: history }));
      recId = r.id;
    } catch { /* saving must never break the chat */ }
  }

  async function turn(text, hidden = false) {
    history.push({ role: 'user', content: text, createdAt: new Date().toISOString(), ...(hidden ? { meta: { kickoff: true } } : {}) });
    if (!hidden) bubble('me', richText(text));
    const out = bubble('ai', h('span.ai-typing', { 'aria-label': t('ai.thinking') }, h('i'), h('i'), h('i')));
    controller = new AbortController();
    stop.hidden = false; send.disabled = true;
    try {
      const r = await ai.chat({ task: tk, ctx, provider, history, signal: controller.signal,
        onText: (full) => { out.replaceChildren(richText(full)); } });
      lastModel = r.model || lastModel;
      who.replaceChildren(badge(provider, lastModel));
      if (r.refused) {
        out.classList.add('note');
        out.replaceChildren(h('p', '🌿 ', t('ai.refused')));
        history.pop();
      } else {
        out.replaceChildren(richText(r.text || '…'));
        if (r.truncated) out.append(h('p.muted.small', t('ai.truncated')));
        history.push({ role: 'assistant', content: r.text, createdAt: new Date().toISOString() });
        await persist();
      }
    } catch (e) {
      if (e.kind === 'aborted') {
        if (e.partial) { out.replaceChildren(richText(e.partial)); history.push({ role: 'assistant', content: e.partial, createdAt: new Date().toISOString(), meta: { stopped: true } }); await persist(); }
        else { out.remove(); history.pop(); }
      } else {
        out.classList.add('note');
        out.replaceChildren(h('p', errorText(e)));
        history.pop();
      }
    } finally {
      controller = null; stop.hidden = true; send.disabled = false;
      if (box.isConnected) input.focus();
    }
  }

  async function runQuiz() {
    const out = bubble('ai', h('span.ai-typing', { 'aria-label': t('ai.thinking') }, h('i'), h('i'), h('i')));
    try {
      const r = await ai.lightningQuiz({ ctx, workspace: ws.id, label: convLabel });
      out.replaceChildren(h('p', h('strong', '⚡ ', t('ai.btn.quiz')), ' ', badge(r.provider, r.model)),
        h('ol.ai-quiz', r.questions.map((q) => h('li', h('p', q.q), h('details', h('summary', t('ai.showAnswer')), h('p', q.a))))));
    } catch (e) { out.classList.add('note'); out.replaceChildren(h('p', errorText(e))); }
  }

  if (quiz) runQuiz();
  else turn(KICKOFF, true);
  setTimeout(() => input.focus(), 60);
  return close;
}

// ---------- the workspace hook ----------
/** api.ai for one workspace, or null when no AI can answer (no key, or offline). */
export function forWorkspace(ws) {
  if (!ai.hasAI()) return null;
  return {
    workspace: ws.id,
    provider: (task) => ai.providerFor(taskFor(task, ws.id)),
    /** The AI entry point of a workspace screen: a quiet button (or null). */
    button: (task, context, opts) => {
      const tk = taskFor(task, ws.id);
      return tk ? aiButton(ws, tk, context, opts) : null;
    },
    /** Open the tutor sheet: { task?, context?, label? } (context may hold extra fields). */
    open: ({ task = null, label: l, workspace, ...context } = {}) => openTutor(ws, taskFor(task, ws.id) || 'socratic', context, { label: l }),
    grade: (o) => ai.grade({ workspace: ws.id, ...o }),
    hint: (o) => ai.hint({ workspace: ws.id, ...o }),
    makeQuestions: (o) => ai.makeQuestions({ workspace: ws.id, ...o }),
    groupErrors: (o) => ai.groupErrors({ workspace: ws.id, ...o }),
  };
}

