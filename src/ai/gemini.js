// Gemini through the Generative Language API, as noema-lite's geminiCall: x-goog-api-key,
// generateContent (JSON mode for structured jobs) and streamGenerateContent?alt=sse for chat.
import { sseParser, geminiText } from './sse.js';
import { AIError, wait, backoff, transient, MAX_RETRIES, kindOf, safeModel, isModelId } from './http.js';

export const DEFAULT_GEMINI = 'gemini-flash-latest';
const base = () => (window.MELETEE_CONFIG?.geminiBase || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const noThinking = new Set();

function thinkingFor(model) {
  if (noThinking.has(model)) return null;
  if (/gemini-3/.test(model)) return { thinkingLevel: 'low' };
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  return null;
}

/**
 * { key, model, system, contents:[{role:'user'|'model', parts:[{text}]}], json, maxTokens, signal, onText }
 * → { text, refused, truncated, model, usage }
 */
export async function geminiCall({ key, model = DEFAULT_GEMINI, system, contents, json = false, maxTokens = 8192, signal, onText }) {
  if (!key) throw new AIError('No Gemini key on this device.', 'nokey', 401);
  model = safeModel(model, DEFAULT_GEMINI); // it goes into the URL path: never anything but a plain model id
  const stream = !!onText && !json;
  for (let attempt = 0; ; attempt++) {
    const gc = { maxOutputTokens: maxTokens, temperature: json ? 0.4 : 0.7 };
    if (json) gc.responseMimeType = 'application/json';
    const th = thinkingFor(model);
    if (th) gc.thinkingConfig = th;
    const body = { contents, generationConfig: gc, systemInstruction: { parts: [{ text: system }] } };
    const url = `${base()}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    let r;
    try { r = await fetch(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }); }
    catch (e) {
      if (signal?.aborted) throw new AIError('Stopped.', 'aborted');
      if (attempt < MAX_RETRIES) { await wait(backoff(attempt), signal); continue; }
      throw new AIError('No connection to Gemini.', 'network');
    }
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 400 && /thinking/i.test(t) && th) { noThinking.add(model); attempt--; continue; }
      if (transient(r.status) && attempt < MAX_RETRIES) { await wait(backoff(attempt, r.headers.get('retry-after')), signal); continue; }
      const auth = r.status === 400 && /API key/i.test(t);
      throw new AIError(t.slice(0, 200) || `HTTP ${r.status}`, auth ? 'auth' : kindOf(r.status, t), r.status);
    }
    let text = '';
    let finish = null;
    let blocked = false;
    let usage = {};
    const take = (d) => {
      const piece = geminiText(d);
      if (piece) { text += piece; onText?.(text); }
      const c = d?.candidates?.[0];
      if (c?.finishReason) finish = c.finishReason;
      if (d?.promptFeedback?.blockReason) blocked = true;
      if (d?.usageMetadata) usage = { input: d.usageMetadata.promptTokenCount || 0, output: d.usageMetadata.candidatesTokenCount || 0 };
    };
    if (stream) {
      const p = sseParser();
      try {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        const feed = (evs) => { for (const ev of evs) { try { take(JSON.parse(ev.data)); } catch { /* skip */ } } };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          feed(p.push(dec.decode(value, { stream: true })));
        }
        feed(p.flush());
      } catch (e) {
        if (signal?.aborted) { const err = new AIError('Stopped.', 'aborted'); err.partial = text; throw err; }
        if (!text && attempt < MAX_RETRIES) { await wait(backoff(attempt), signal); continue; }
        throw new AIError('The connection to Gemini dropped.', 'network');
      }
    } else {
      take(await r.json());
    }
    const refused = blocked || (!text && /SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(finish || ''));
    return { text, refused, truncated: finish === 'MAX_TOKENS', model, usage };
  }
}

function modelScore(n) {
  if (/(image|tts|audio|live|embed|aqa|gemma|robotics|computer|native|veo|imagen|learnlm|nano|banana|research|deep)/i.test(n) || !/gemini/i.test(n)) return -1;
  let s = 0;
  const v = n.match(/gemini-(\d+(?:\.\d+)?)/);
  if (v) s += parseFloat(v[1]) * 100; else if (/latest/.test(n)) s += 240;
  if (/flash/.test(n)) s += 60;
  if (/lite/.test(n)) s -= 45;
  if (/pro/.test(n)) s += 20;
  if (/preview|exp/.test(n)) s -= 8;
  return s;
}

export async function geminiModels(key) {
  const r = await fetch(`${base()}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new AIError(t.slice(0, 200) || `HTTP ${r.status}`, r.status === 400 || r.status === 403 ? 'auth' : kindOf(r.status, t), r.status);
  }
  const d = await r.json();
  return (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, '')).filter((n) => isModelId(n) && modelScore(n) >= 0)
    .sort((a, b) => modelScore(b) - modelScore(a));
}
