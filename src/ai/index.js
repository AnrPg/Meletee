// The AI layer: two providers, a task router, saved conversations and the hooks the
// workspaces use. Workspaces get `api.ai` from forWorkspace(); it is null without a key,
// so every tool keeps its own self-check path when there is no key or no connection.
import * as store from '../core/store.js';
import { lang } from '../core/i18n.js';
import { available as keysAvailable, getKey } from './keys.js';
import { route, taskFor, TASKS, vendorOf } from './router.js';
import { systemFor, JSON_PROMPTS } from './prompts.js';
import { validate, GRADE, gradeCheck, QUESTIONS, questionsCheck, ERRORS } from './schema.js';
import { claudeCall, DEFAULT_CLAUDE } from './claude.js';
import { geminiCall, DEFAULT_GEMINI } from './gemini.js';
import { AIError } from './http.js';
import * as convos from './convos.js';

export { AIError, convos, TASKS };

// ---------- settings (model choice and who answers; not secret, so they live in the store) ----------
export const aiPrefs = () => ({ prefer: 'auto', claudeModel: DEFAULT_CLAUDE, geminiModel: DEFAULT_GEMINI, ...store.get('ai', {}) });
export const setAiPrefs = (patch) => store.update('ai', (p) => ({ ...p, ...patch }), {});

const online = () => (typeof navigator === 'undefined' || navigator.onLine !== false);

export function available() {
  const a = keysAvailable();
  return online() ? a : { claude: false, gemini: false };
}
export const hasAI = () => { const a = available(); return a.claude || a.gemini; };
export const providerFor = (task) => route(task, available(), aiPrefs().prefer);
export const modelOf = (provider) => (provider === 'claude' ? aiPrefs().claudeModel || DEFAULT_CLAUDE : aiPrefs().geminiModel || DEFAULT_GEMINI);

// ---------- one call, whichever provider ----------
// history: [{ role: 'user'|'assistant', content }]
async function call(provider, { task, ctx, history, json = false, format = null, signal, onText, maxTokens }) {
  const t = TASKS[task] || {};
  const { rules, material } = systemFor(task, t.mode, lang(), ctx);
  const model = modelOf(provider);
  if (provider === 'claude') {
    return claudeCall({
      key: getKey('claude'), model, rules, material, signal, onText, maxTokens,
      effort: t.effort || (json ? 'medium' : 'low'), format,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
  }
  return geminiCall({
    key: getKey('gemini'), model, system: material ? `${rules}\n\n${material}` : rules, json, signal, onText, maxTokens,
    contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  });
}

/**
 * Ask for one JSON object matching `schema`, with one repair round (like noema-lite's json()).
 * → { data, provider, model }
 */
export async function askJSON({ task, ctx, prompt, schema, check, signal, provider = providerFor(task) }) {
  if (!provider) throw new AIError('No AI key on this device.', 'nokey');
  const content = provider === 'gemini'
    ? `${prompt}\n\nReturn exactly one JSON object that matches this JSON Schema (no prose, no code fence):\n${JSON.stringify(schema)}`
    : prompt;
  let history = [{ role: 'user', content }];
  const format = provider === 'claude' ? { type: 'json_schema', schema } : null;
  let errors = [];
  for (let round = 0; round <= 1; round++) {
    const r = await call(provider, { task, ctx, history, json: true, format, signal });
    if (r.refused) throw new AIError('declined', 'refusal');
    const v = validate(r.text, schema, check);
    if (!v.errors.length) return { data: v.data, provider, model: r.model };
    errors = r.truncated ? ['The answer was cut off. Be more concise; same structure.'] : v.errors;
    history = history.concat({ role: 'assistant', content: r.text || '(no answer)' },
      { role: 'user', content: `Your answer has these problems:\n- ${errors.slice(0, 20).join('\n- ')}\nReturn the complete corrected JSON object.` });
  }
  throw new AIError(errors.join('; '), 'invalid');
}

/** A streamed chat turn. history ends with the learner's message. → { text, provider, model, refused, truncated } */
export async function chat({ task, ctx, history, signal, onText, provider = providerFor(task) }) {
  if (!provider) throw new AIError('No AI key on this device.', 'nokey');
  const r = await call(provider, { task, ctx, history, signal, onText });
  return { ...r, provider };
}

// ---------- saving ----------
export function record({ task, provider, model, workspace, label, messages, subject = null, id }) {
  const t = TASKS[task] || {};
  return {
    ...(id ? { id } : {}),
    kind: t.kind || 'tutor',
    mode: t.kind === 'tutor' ? t.mode : null,
    title: label || null,
    subject,
    context: { type: 'workspace', id: workspace || null, label: label || null },
    model: { provider: vendorOf(provider), name: model || modelOf(provider) },
    messages: messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt || new Date().toISOString(), ...(m.meta ? { meta: m.meta } : {}) })),
    meta: { app: 'meletee', task },
  };
}

async function saveOneShot({ task, provider, model, workspace, label, prompt, response }) {
  try { return await convos.put(record({ task, provider, model, workspace, label, messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: response }] })); }
  catch { return null; }
}

// ---------- the structured helpers ----------
const clip = (s, n = 4000) => String(s ?? '').slice(0, n);

/** The answer checker (noema-lite aiGrade format). → { score, verdict, covered, missing, mistakes, feedback, provider, model } */
export async function grade({ question, answer, reference = '', workspace, label, signal }) {
  const prompt = `Question:\n${clip(question)}\n\n${reference ? `Reference answer:\n${clip(reference)}\n\n` : ''}Learner's answer:\n"""${clip(answer)}"""`;
  const r = await askJSON({ task: 'grade', prompt, schema: GRADE, check: gradeCheck, signal });
  const g = { ...r.data, score: Math.max(0, Math.min(100, Math.round(r.data.score))) };
  saveOneShot({ task: 'grade', provider: r.provider, model: r.model, workspace, label: label || clip(question, 80), prompt,
    response: `**${g.score}/100** · ${g.verdict}\n\n${g.covered.length ? '✅ ' + g.covered.join(' · ') + '\n\n' : ''}${g.missing.length ? '➕ ' + g.missing.join(' · ') + '\n\n' : ''}${g.mistakes.length ? '❌ ' + g.mistakes.join(' · ') + '\n\n' : ''}${g.feedback}` });
  return { ...g, provider: r.provider, model: r.model };
}

/** The question maker. → { questions:[{q,a}], provider } */
export async function makeQuestions({ topic = '', material = '', count = 5, workspace, signal }) {
  const prompt = `Make ${count} questions${topic ? ` on "${clip(topic, 200)}"` : ''}.${material ? `\n\nMaterial:\n${clip(material, 9000)}` : ''}`;
  const r = await askJSON({ task: 'questions', prompt, schema: QUESTIONS, check: questionsCheck, signal });
  const questions = r.data.questions.filter((x) => x.q.trim()).slice(0, count);
  saveOneShot({ task: 'questions', provider: r.provider, model: r.model, workspace, label: topic || 'Questions', prompt,
    response: questions.map((x, i) => `${i + 1}. ${x.q}\n   → ${x.a}`).join('\n') });
  return { questions, provider: r.provider, model: r.model };
}

/** The lightning quiz: three quick questions on some material. */
export async function lightningQuiz({ ctx, workspace, label, signal }) {
  const r = await askJSON({ task: 'quiz', ctx, prompt: 'Make the lightning quiz on my material.', schema: QUESTIONS, check: questionsCheck, signal });
  const questions = r.data.questions.slice(0, 3);
  saveOneShot({ task: 'quiz', provider: r.provider, model: r.model, workspace, label, prompt: 'Lightning quiz',
    response: questions.map((x, i) => `${i + 1}. ${x.q}\n   → ${x.a}`).join('\n') });
  return { questions, provider: r.provider, model: r.model };
}

/** Error-log grouping. errors: [{ question, myAnswer, correct, cause, lesson, topic }] */
export async function groupErrors({ errors, workspace, signal }) {
  const lines = errors.slice(0, 60).map((e, i) => `${i + 1}. [${e.topic || '-'}] Q: ${clip(e.question, 300)} | mine: ${clip(e.myAnswer, 200)} | correct: ${clip(e.correct, 200)} | cause: ${e.cause || '-'} | lesson: ${clip(e.lesson, 200)}`);
  const prompt = `My error log:\n${lines.join('\n')}`;
  const r = await askJSON({ task: 'errors', prompt, schema: ERRORS, signal });
  saveOneShot({ task: 'errors', provider: r.provider, model: r.model, workspace, label: 'Error log', prompt,
    response: `${r.data.summary}\n\n${r.data.groups.map((g) => `- **${g.name}** (${g.count}): ${g.why} → ${g.tip}`).join('\n')}` });
  return { ...r.data, provider: r.provider, model: r.model };
}

/** One rung of the hint ladder. previous: hints already given. */
export async function hint({ question, attempt = '', previous = [], workspace, label, signal }) {
  const level = Math.min(3, previous.length + 1);
  const prompt = `Question: ${clip(question)}\n${attempt ? `My attempt so far: ${clip(attempt, 1000)}\n` : ''}${previous.length ? `Hints I already had:\n- ${previous.join('\n- ')}\n` : ''}Give me hint level ${level}.`;
  const provider = providerFor('hint');
  if (!provider) throw new AIError('No AI key on this device.', 'nokey');
  const r = await call(provider, { task: 'hint', history: [{ role: 'user', content: prompt }], signal, maxTokens: provider === 'claude' ? 4000 : 1024 });
  if (r.refused) throw new AIError('declined', 'refusal');
  const text = r.text.trim();
  saveOneShot({ task: 'hint', provider, model: r.model, workspace, label: label || clip(question, 80), prompt, response: text });
  return { text, provider, model: r.model };
}

/** For later phases (Method Lab, the plan maker): a one-off coach answer in plain text. */
export async function coach(task, { ctx, prompt, signal, onText, workspace = task, label } = {}) {
  const history = [{ role: 'user', content: prompt || 'Please start.' }];
  const r = await chat({ task, ctx, history, signal, onText });
  if (r.refused) throw new AIError('declined', 'refusal');
  saveOneShot({ task, provider: r.provider, model: r.model, workspace, label: label || task, prompt: history[0].content, response: r.text });
  return { text: r.text, provider: r.provider, model: r.model };
}
export const methodLabCoach = (ctx, opts = {}) => coach('methodlab', { ...opts, ctx, prompt: opts.prompt || 'Here are my experiment and ratings. How is it going, and should I keep, tweak or drop this method?' });
export const studyPlanHelper = (ctx, opts = {}) => coach('plan', { ...opts, ctx, prompt: opts.prompt || 'Help me plan this term.' });

// ---------- noema-lite hand-off (phase 6 can teach it about imported subjects) ----------
let subjectOf = () => null;
/** fn(context) → noema-lite subject id or null (only for courses imported from noema-lite). */
export function setNoemaSubjectResolver(fn) { subjectOf = typeof fn === 'function' ? fn : () => null; }
export function noemaLink(ctx) {
  const baseUrl = (window.MELETEE_CONFIG?.noemaUrl || 'https://noema-lite.netlify.app').replace(/\/$/, '');
  let id = null;
  try { id = subjectOf(ctx); } catch { id = null; }
  return id ? `${baseUrl}/?subject=${encodeURIComponent(id)}` : `${baseUrl}/`;
}
