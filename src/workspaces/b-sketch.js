// A tiny sketch pad for the dual-coding workspace: pointer events on a <canvas>,
// pen, eraser, undo and clear; works with mouse, pen and touch.
// Strokes are kept as vectors (in units of the canvas width) and drawn with the
// current theme's ink colour, so sketches follow light and dark mode.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { compact } from './b-core.js';

export const ASPECT = 0.75; // height / width

function ink() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  return v || getComputedStyle(document.body).color;
}

function paint(ctx, a, w, color) {
  const p = a.p;
  if (!p?.length) return;
  ctx.save();
  ctx.globalCompositeOperation = a.t === 'erase' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.lineWidth = (a.t === 'erase' ? 0.045 : 0.008) * w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p[0] * w, p[1] * w);
  if (p.length === 2) ctx.lineTo(p[0] * w + 0.1, p[1] * w);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * w, p[i + 1] * w);
  ctx.stroke();
  ctx.restore();
}

export function render(canvas, actions, color = ink()) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const a of compact(actions)) paint(ctx, a, canvas.width, color);
}

// Keeps a canvas sized to its box (crisp on high-DPI screens) and redrawn on theme change.
function autoSize(canvas, redraw) {
  const fit = () => {
    const w = canvas.clientWidth;
    if (!w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * ASPECT * dpr);
    redraw();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onScheme = () => (canvas.isConnected ? redraw() : mq.removeEventListener?.('change', onScheme));
  mq?.addEventListener?.('change', onScheme);
  const mo = new MutationObserver(() => (canvas.isConnected ? redraw() : (mo.disconnect(), ro.disconnect())));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  requestAnimationFrame(fit);
}

// A read-only view of saved strokes.
export function sketchView(actions, label) {
  const canvas = h('canvas.ws-dual-canvas.ws-dual-view', { role: 'img', 'aria-label': label });
  autoSize(canvas, () => render(canvas, actions));
  return canvas;
}

// Renders strokes to a small PNG (transparent background) for storage or export.
export function toPNG(actions, width = 480) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round(width * ASPECT);
  render(c, actions);
  return c.toDataURL('image/png');
}

export function sketchPad({ label, actions = [], onChange = () => {} } = {}) {
  let hist = [...actions];
  let tool = 'pen';
  let cur = null;
  let raf = 0;
  const canvas = h('canvas.ws-dual-canvas.ws-dual-live', { role: 'img', 'aria-label': label, tabindex: '-1' });
  const redraw = () => render(canvas, hist);
  const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };
  autoSize(canvas, redraw);

  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    const round = (v) => Math.round(v * 10000) / 10000;
    return [round((e.clientX - r.left) / r.width), round((e.clientY - r.top) / r.width)];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    cur = { t: tool, p: pt(e) };
    hist.push(cur);
    later();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ev of evs.length ? evs : [e]) cur.p.push(...pt(ev));
    later();
  });
  const end = () => { if (!cur) return; cur = null; redraw(); sync(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);

  const btn = (key, emoji, onclick, pressed) => h('button.ws-dual-tool', { type: 'button', 'aria-label': t(`ws.dual.${key}`), title: t(`ws.dual.${key}`), 'aria-pressed': pressed, onclick }, h('span', { 'aria-hidden': 'true' }, emoji), h('span.ws-dual-toollabel', t(`ws.dual.${key}`)));
  const penBtn = btn('pen', '✏️', () => setTool('pen'), 'true');
  const eraseBtn = btn('eraser', '🩹', () => setTool('erase'), 'false');
  const undoBtn = btn('undo', '↶', () => { hist.pop(); redraw(); sync(); });
  const clearBtn = btn('clear', '🧽', () => { if (compact(hist).length) { hist.push({ t: 'clear' }); redraw(); sync(); } });
  function setTool(x) {
    tool = x;
    penBtn.setAttribute('aria-pressed', String(x === 'pen'));
    eraseBtn.setAttribute('aria-pressed', String(x === 'erase'));
    canvas.dataset.tool = x;
  }
  canvas.dataset.tool = 'pen';
  function sync() {
    undoBtn.disabled = !hist.length;
    clearBtn.disabled = !compact(hist).length;
    onChange(compact(hist));
  }
  undoBtn.disabled = !hist.length;
  clearBtn.disabled = !compact(hist).length;

  const el = h('div.ws-dual-pad',
    h('div.ws-dual-tools', { role: 'toolbar', 'aria-label': t('ws.dual.tools') }, penBtn, eraseBtn, undoBtn, clearBtn),
    canvas);
  return {
    el,
    canvas,
    actions: () => compact(hist),
    isEmpty: () => !compact(hist).some((a) => a.t === 'pen'),
    reset(next = []) { hist = [...next]; redraw(); sync(); },
  };
}
