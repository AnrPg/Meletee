// Errors and retries shared by both vendors.
export class AIError extends Error {
  // kind: nokey | auth | quota | network | api | aborted | refusal | invalid | truncated
  constructor(message, kind = 'api', status = 0) { super(message); this.kind = kind; this.status = status; }
}

export const wait = (ms, signal) => new Promise((res, rej) => {
  const id = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(id); rej(new AIError('Stopped.', 'aborted')); }, { once: true });
});

// How long to wait before retry number `attempt` (0-based), honouring Retry-After (seconds).
export function backoff(attempt, retryAfter) {
  const ra = Number(retryAfter);
  if (ra > 0) return Math.min(ra * 1000, 60000);
  return Math.min(30000, 1000 * 2 ** attempt);
}

export const transient = (status) => status === 429 || status === 529 || status >= 500;
export const MAX_RETRIES = 4;

// A model id as the vendors write them (gemini-flash-latest, gemini-2.5-pro, claude-opus-4-1-20250805):
// letters, digits, dots and dashes only. Model ids come from synced settings and restored backups, and the
// Gemini one goes into the request path (with the API key header), so anything else is refused.
export const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,79}$/i;
export const isModelId = (m) => typeof m === 'string' && MODEL_ID.test(m) && !m.includes('..');
export const safeModel = (m, fallback) => (isModelId(m) ? m : fallback);

export function kindOf(status, message = '') {
  if (status === 401 || status === 403) return 'auth';
  if (/credit balance|billing|quota/i.test(message) || status === 429) return 'quota';
  return 'api';
}
