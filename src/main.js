import { h } from './core/dom.js';
import * as i18n from './core/i18n.js';
import * as router from './core/router.js';
import * as store from './core/store.js';
import { icon, logo } from './ui/art.js';
import { registerViews, NAV, startBackground } from './views/index.js';
import { openParking } from './ui/parking.js';

export function applyTheme(theme = store.get('settings', {}).theme || 'auto') {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function shell() {
  const { t } = i18n;
  const main = h('main', { id: 'main', tabindex: '-1' });
  const nav = h('nav.nav', { 'aria-label': t('nav.label') },
    NAV.map((n) => h('a', { href: '#' + n.path, 'data-path': n.path }, icon(n.icon), h('span', t(n.label)))));
  const top = h('header.topbar',
    h('a.brand', { href: '#/', 'aria-label': t('app.name') }, logo(), h('span', t('app.name'))),
    h('div.spacer'),
    h('button.icon-btn', { 'aria-label': t('parking.title'), title: t('parking.title'), onclick: openParking }, icon('park')),
    h('a.icon-btn', { href: '#/settings', 'aria-label': t('nav.settings'), title: t('nav.settings') }, icon('settings')));
  const skip = h('a.skip-link', { href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, t('a11y.skip'));
  document.getElementById('app').replaceChildren(h('div.app', skip, top, main, nav));
  return { main, nav };
}

let els;

async function render(m) {
  const path = router.current();
  for (const a of els.nav.querySelectorAll('a')) {
    const p = a.dataset.path;
    const on = p === '/' ? path === '/' : path === p || path.startsWith(p + '/');
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  const view = m ? m.view : registerViews.notFound;
  const node = h('div.view');
  els.main.replaceChildren(node);
  try {
    const out = await view(m?.params || {}, node);
    if (out && !node.contains(out)) node.append(out);
  } catch (e) {
    console.error(e);
    node.replaceChildren(h('p.muted', i18n.t('error.generic')));
  }
  if (!node.isConnected) return; // a newer navigation already replaced this screen
  if (m?.pattern !== undefined) window.scrollTo({ top: 0 });
  const heading = node.querySelector('h1')?.textContent.trim();
  document.title = heading && path !== '/' ? `${heading} · ${i18n.t('app.name')}` : i18n.t('app.name');
  // After a navigation, keyboard and screen-reader users start at the new screen's content
  // (unless the screen already put focus somewhere on purpose).
  const a = document.activeElement;
  if (rendered && (!a || a === document.body || els.nav.contains(a) || !a.isConnected)) els.main.focus({ preventScroll: true });
  rendered = true;
}

let rendered = false;

export function rebuild() {
  els = shell();
  router.refresh();
}

async function boot() {
  applyTheme();
  await i18n.setLang(i18n.detect());
  registerViews(router);
  els = shell();
  router.start(render);
  setTimeout(() => startBackground().catch((e) => console.warn('[background]', e)), 0);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
