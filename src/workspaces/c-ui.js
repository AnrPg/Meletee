// Small UI helpers shared by the group-c workspaces.
import { h, sheet } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { confirmSheet } from '../ui/forms.js';

// A segmented control. options: [[value, label], ...].
export function seg(options, current, onPick, label) {
  return h('div.seg.ws-c-seg', { role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(v === current), 'data-v': v, onclick: () => onPick(v) }, text)));
}

let n = 0;
// A labelled field: label text above the control. The control gets an id if it has none.
export function field(label, control, hint) {
  if (!control.id) control.id = `wsc-f${++n}`;
  return h('div.field-row', h('label', { for: control.id }, label), control, hint ? h('span.muted.small.ws-c-hint', hint) : null);
}

export const input = (props = {}) => h('input.field', { type: 'text', autocomplete: 'off', ...props });
export const area = (props = {}, value = '') => h('textarea.field', { rows: 3, ...props }, value);

export function empty(emoji, text) {
  return h('div.empty.ws-c-empty', h('p', { 'aria-hidden': 'true' }, emoji), h('p.muted', text));
}

// A bottom sheet with a form around `body`; onSubmit(form) returns false to keep it open.
export function formSheet(title, body, submitLabel, onSubmit) {
  let close;
  const form = h('form.stack', { onsubmit: (e) => { e.preventDefault(); if (onSubmit(form) !== false) close(); } },
    h('h2', title),
    body,
    h('div.row', { style: { justifyContent: 'flex-end' } },
      h('button.btn.ghost.small', { type: 'button', onclick: () => close() }, t('common.cancel')),
      h('button.btn.small', { type: 'submit' }, submitLabel)));
  close = sheet(form, { label: title });
  form.querySelector('input,textarea,select')?.focus();
  return close;
}

export async function confirmDelete(title) {
  return confirmSheet({ title, ok: t('common.delete'), danger: true });
}

// Where a tutor button will go once api.ai exists (phase 4). Renders nothing without it.
export function aiSlot(api, task, context) {
  if (!api.ai || typeof api.ai.button !== 'function') return null;
  return api.ai.button(task, context);
}

// A small "back to the list" button.
export function backBtn(label, onclick) {
  return h('button.btn.ghost.small.ws-c-back', { type: 'button', onclick }, '← ', label);
}

// Remember small UI choices (which tab) per workspace.
export function uiState(api) {
  return {
    get: (k, d) => (api.data('ui', {}) || {})[k] ?? d,
    set: (k, v) => api.update('ui', (u) => ({ ...(u || {}), [k]: v }), {}),
  };
}
