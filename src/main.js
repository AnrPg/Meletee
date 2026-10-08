import { h } from './core/dom.js';
import * as i18n from './core/i18n.js';
import * as router from './core/router.js';
import * as store from './core/store.js';
import { icon, logo } from './ui/art.js';
import { registerViews, NAV } from './views/index.js';
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
  document.getElementById('app').replaceChildren(h('div.app', top, main, nav));
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
  if (m?.pattern !== undefined) window.scrollTo({ top: 0 });
  document.title = `${i18n.t('app.name')}`;
}

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
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
