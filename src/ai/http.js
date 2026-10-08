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

export function kindOf(status, message = '') {
  if (status === 401 || status === 403) return 'auth';
  if (/credit balance|billing|quota/i.test(message) || status === 429) return 'quota';
  return 'api';
}
