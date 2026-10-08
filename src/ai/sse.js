// Server-sent events, as both vendors stream them. Pure and small so it can be unit-tested.
//   const p = sseParser(); for (const ev of p.push(chunk)) …; for (const ev of p.flush()) …
// Each event is { event, data } with the data lines joined by "\n".
export function sseParser() {
  let buf = '';
  const drain = (final) => {
    const out = [];
    // normalise CRLF / CR line ends, but keep a trailing "\r" until we know what follows it
    let text = buf;
    let hold = '';
    if (!final && text.endsWith('\r')) { hold = '\r'; text = text.slice(0, -1); }
    text = text.replace(/\r\n?/g, '\n');
    let i;
    while ((i = text.indexOf('\n\n')) >= 0) {
      const ev = parseEvent(text.slice(0, i));
      if (ev) out.push(ev);
      text = text.slice(i + 2);
    }
    if (final) { const ev = parseEvent(text); if (ev) out.push(ev); text = ''; }
    buf = text + hold;
    return out;
  };
  return {
    push(chunk) { buf += chunk; return drain(false); },
    flush() { return drain(true); },
  };
}

function parseEvent(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const c = line.indexOf(':');
    const field = c < 0 ? line : line.slice(0, c);
    let v = c < 0 ? '' : line.slice(c + 1);
    if (v.startsWith(' ')) v = v.slice(1);
    if (field === 'event') event = v;
    else if (field === 'data') data.push(v);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

// Folds Claude Messages stream events into one result.
// apply(obj) takes one parsed `data` object; state: { text, stop, model, usage, error, refusal }.
export function claudeReducer() {
  const s = { text: '', stop: null, model: null, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, error: null, refusal: null };
  return {
    state: s,
    apply(d) {
      if (!d || typeof d !== 'object') return s;
      if (d.type === 'message_start') {
        const u = d.message?.usage || {};
        s.model = d.message?.model || s.model;
        s.usage.input += u.input_tokens || 0;
        s.usage.cacheRead += u.cache_read_input_tokens || 0;
        s.usage.cacheWrite += u.cache_creation_input_tokens || 0;
      } else if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') {
        s.text += d.delta.text || '';
      } else if (d.type === 'message_delta') {
        s.usage.output += d.usage?.output_tokens || 0;
        if (d.delta?.stop_reason) s.stop = d.delta.stop_reason;
        if (d.delta?.stop_details) s.refusal = d.delta.stop_details;
      } else if (d.type === 'error') {
        s.error = { type: d.error?.type || 'api_error', message: d.error?.message || 'stream error' };
      }
      return s;
    },
  };
}

// Gemini streams whole GenerateContentResponse objects; this joins their text parts.
export function geminiText(d) {
  return (d?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
}
