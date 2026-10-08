// Small in-page dialogs (the artifact viewer blocks prompt() and confirm()).
import { h, sheet } from '../core/dom.js';
import { t } from '../core/i18n.js';

export function askText({ title, placeholder = '', value = '', type = 'text', ok = t('common.save'), multiline = false }) {
  return new Promise((resolve) => {
    let done = false;
    const input = multiline
      ? h('textarea.field', { rows: 5, placeholder, id: 'ask-input' }, value)
      : h('input.field', { type, placeholder, value, id: 'ask-input' });
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    const form = h('form.stack', { onsubmit: (e) => { e.preventDefault(); finish(type === 'date' ? input.value || null : input.value.trim() || null); } },
      h('h2', title),
      input,
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn.ghost.small', { type: 'button', onclick: () => finish(null) }, t('common.cancel')),
        h('button.btn.small', { type: 'submit' }, ok)));
    const close = sheet(form, { label: title });
    const observer = new MutationObserver(() => { if (!form.isConnected) { observer.disconnect(); if (!done) { done = true; resolve(null); } } });
    observer.observe(document.body, { childList: true });
    setTimeout(() => input.focus(), 50);
  });
}

export function confirmSheet({ title, text, ok, danger = false }) {
  return new Promise((resolve) => {
    let close;
    const pick = (v) => { close(); resolve(v); };
    close = sheet(h('div.stack',
      h('h2', title), text ? h('p.muted', text) : null,
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn.ghost.small', { onclick: () => pick(false) }, t('common.cancel')),
        h(danger ? 'button.btn.small.danger' : 'button.btn.small', { onclick: () => pick(true) }, ok))), { label: title });
  });
}
