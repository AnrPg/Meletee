// Tiny DOM helper: h('div.card', {onclick}, child, 'text', [more]).
// Strings are always inserted as text; trusted HTML goes through { html } only.
export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Inline SVG from a trusted string (icons, companion).
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

// One polite live region for the whole app: short news (toasts, a finished timer) is read out
// once by screen readers, without making whole screens "live".
export function announce(text) {
  let live = document.getElementById('live');
  if (!live) {
    live = h('div.sr-only', { id: 'live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(live);
  }
  live.textContent = '';
  setTimeout(() => { live.textContent = String(text); }, 60);
}

export function toast(text, ms = 2200) {
  document.querySelector('.toast')?.remove();
  const el = h('div.toast', { 'aria-hidden': 'true' }, text);
  document.body.append(el);
  announce(text);
  setTimeout(() => el.remove(), ms);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden]') && el.getClientRects().length);

// A bottom sheet (a modal dialog). Focus stays inside while it is open (Tab and Shift+Tab wrap),
// Escape or a tap on the backdrop closes it, and focus returns to whatever opened it.
// Returns a close function.
export function sheet(content, { label } = {}) {
  const prev = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove(); document.removeEventListener('keydown', onKey, true);
    if (prev?.isConnected) prev.focus?.();
  };
  const onKey = (e) => {
    if (!back.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
    // only the topmost sheet answers
    const sheets = document.querySelectorAll('.sheet-backdrop');
    if (sheets[sheets.length - 1] !== back) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(box);
    if (!f.length) { e.preventDefault(); box.focus(); return; }
    const first = f[0]; const last = f[f.length - 1];
    const inside = box.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  };
  const box = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, h('div.grip', { 'aria-hidden': 'true' }), content);
  const back = h('div.sheet-backdrop', { onclick: (e) => { if (e.target === back) close(); } }, box);
  document.body.append(back);
  document.addEventListener('keydown', onKey, true);
  box.focus();
  return close;
}
