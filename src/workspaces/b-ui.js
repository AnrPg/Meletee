// Small shared pieces for the group-b workspaces: dates, timers, the AI hook point.
import { h } from '../core/dom.js';
import { lang } from '../core/i18n.js';
import { clock } from './b-core.js';

export const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const now = () => new Date().toISOString();

export function when(isoString, withTime = false) {
  try {
    const opts = withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat(lang(), opts).format(new Date(isoString));
  } catch { return ''; }
}

// A live mm:ss clock. With `seconds` it counts down from `startedAt`; without, it counts up.
// Stops itself when the element leaves the page.
export function liveClock({ startedAt, seconds = null, onEnd, cls = 'ws-b-clock' }) {
  const el = h(`span.${cls}`, { role: 'timer', 'aria-live': 'off' });
  let ended = false;
  const tick = () => {
    if (!el.isConnected && el.dataset.mounted) { clearInterval(id); return; }
    if (el.isConnected) el.dataset.mounted = '1';
    const gone = (Date.now() - startedAt) / 1000;
    if (seconds == null) { el.textContent = clock(gone); return; }
    el.textContent = clock(Math.ceil(seconds - gone));
    if (gone >= seconds && !ended) { ended = true; clearInterval(id); el.dataset.done = 'true'; onEnd?.(); }
  };
  const id = setInterval(tick, 500);
  tick();
  return el;
}

// The single tutor button of a workspace (src/ai picks the tutor for api.id). Renders
// nothing while api.ai is null.
export function aiSlot(api, label, getContext) {
  if (!api.ai) return null;
  return api.ai.button(null, getContext, { label });
}

// A labelled field: <label class="field-row">Label <input|textarea></label>
export function field(label, control) {
  return h('label.field-row', label, control);
}

// A calm two-or-three-option choice built from chips.
export function chips(options, value, onPick, label) {
  return h('div.row.ws-b-chips', { role: 'group', 'aria-label': label }, options.map((o) => h('button.chip', {
    type: 'button', 'aria-pressed': String(o.value === value), onclick: () => onPick(o.value),
  }, o.label)));
}
