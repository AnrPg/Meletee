// Claude through the Messages API, straight from the browser with the learner's own key.
// Plain fetch, streamed (SSE text_delta). No temperature/top_p/thinking settings: the
// default model thinks adaptively and depth is set with output_config.effort.
import { sseParser, claudeReducer } from './sse.js';
import { AIError, wait, backoff, transient, MAX_RETRIES, kindOf, safeModel, isModelId } from './http.js';
import { deviceFlag } from './keys.js';

export const DEFAULT_CLAUDE = 'claude-opus-5-5';
const base = () => (window.MELETEE_CONFIG?.anthropicBase || 'https://api.anthropic.com').replace(/\/$/, '');
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const NO_FALLBACK = 'claude-no-fallback';

const headers = (key) => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
  'content-type': 'application/json',
});

/**
 * One streamed Messages call.
 * { key, model, rules, material, messages:[{role,content}], effort, format, maxTokens, signal, onText(fullText) }
 * → { text, stop, refused, truncated, model, usage }
 */
export async function claudeCall({ key, model = DEFAULT_CLAUDE, rules, material = '', messages, effort = 'low', format = null, maxTokens = 16000, signal, onText }) {
  model = safeModel(model, DEFAULT_CLAUDE);
  if (!key) throw new AIError('No Claude key on this device.', 'nokey', 401);
  let fallback = deviceFlag.get(NO_FALLBACK) !== '1';
  const system = [{ type: 'text', text: rules, cache_control: { type: 'ephemeral' } }];
  if (material) system.push({ type: 'text', text: material, cache_control: { type: 'ephemeral' } });
  for (let attempt = 0; ; attempt++) {
    const body = { model, max_tokens: maxTokens, stream: true, system, messages, output_config: { effort, ...(format ? { format } : {}) } };
    const h = headers(key);
    if (fallback) { h['anthropic-beta'] = FALLBACK_BETA; body.fallbacks = 'default'; }
    let r;
    try { r = await fetch(base() + '/v1/messages', { method: 'POST', headers: h, body: JSON.stringify(body), signal }); }
    catch (e) {
      if (signal?.aborted) throw new AIError('Stopped.', 'aborted');
      if (attempt < MAX_RETRIES) { await wait(backoff(attempt), signal); continue; }
      throw new AIError('No connection to Claude.', 'network');
    }
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json())?.error?.message || ''; } catch { /* not JSON */ }
      if (r.status === 400 && fallback && /fallback|beta/i.test(msg)) {
        fallback = false; deviceFlag.set(NO_FALLBACK, '1'); attempt--; continue;
      }
      if (transient(r.status) && attempt < MAX_RETRIES && !/credit balance/i.test(msg)) {
        await wait(backoff(attempt, r.headers.get('retry-after')), signal); continue;
      }
      throw new AIError(msg || `HTTP ${r.status}`, kindOf(r.status, msg), r.status);
    }
    const red = claudeReducer();
    const p = sseParser();
    const feed = (events) => {
      for (const ev of events) {
        let d; try { d = JSON.parse(ev.data); } catch { continue; }
        const before = red.state.text.length;
        red.apply(d);
        if (onText && red.state.text.length !== before) onText(red.state.text);
      }
    };
    try {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        feed(p.push(dec.decode(value, { stream: true })));
      }
      feed(p.flush());
    } catch (e) {
      if (signal?.aborted) {
        const err = new AIError('Stopped.', 'aborted'); err.partial = red.state.text; throw err;
      }
      if (!red.state.text && attempt < MAX_RETRIES) { await wait(backoff(attempt), signal); continue; }
      throw new AIError('The connection to Claude dropped.', 'network');
    }
    const s = red.state;
    if (s.error) {
      if (s.error.type === 'overloaded_error' && !s.text && attempt < MAX_RETRIES) { await wait(backoff(attempt), signal); continue; }
      throw new AIError(s.error.message, 'api');
    }
    return { text: s.text, stop: s.stop, refused: s.stop === 'refusal', truncated: s.stop === 'max_tokens', model: s.model || model, usage: s.usage };
  }
}

export async function claudeModels(key) {
  const r = await fetch(base() + '/v1/models?limit=100', { headers: headers(key) });
  if (!r.ok) {
    let msg = ''; try { msg = (await r.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new AIError(msg || `HTTP ${r.status}`, kindOf(r.status, msg), r.status);
  }
  const d = await r.json();
  return (d.data || []).map((m) => m.id).filter(isModelId);
}
