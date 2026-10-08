import { h } from './core/dom.js';
import * as i18n from './core/i18n.js';
import * as router from './core/router.js';
import * as store from './core/store.js';
import { icon, logo } from './ui/art.js';
import { registerViews, NAV, startBackground } from './views/index.js';
import { openParking } from './ui/parking.js';
import { backend } from './cloud/client.js';
import { needsAccount, required, readLink, OPEN_ROUTES } from './cloud/gate.js';

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
  const app = h('div.app', skip, top, main, nav);
  document.getElementById('app').replaceChildren(app);
  return { main, nav, app };
}

let els;

// Without an account the welcome screen stands in for every screen but the privacy page; right after
// signing in on a new device, "bringing your study over…" stands in until the first sync is done.
const welcomeView = async () => {
  const w = await import('./views/welcome.js');
  if (linkNote) { w.noteOnWelcome(i18n.t(linkNote)); linkNote = ''; }
  return w.welcome();
};
let firstSync = null;
const bringingView = async () => {
  const w = await import('./views/welcome.js');
  firstSync ||= (async () => {
    const sync = await import('./cloud/sync.js');
    let late = 0;
    const slow = new Promise((r) => { late = setTimeout(r, 15000); });
    const ok = await Promise.race([sync.firstSync().then(() => true, () => false), slow.then(() => false)]);
    clearTimeout(late);
    // offline, or slow: the app opens with whatever is on this device and syncs when it can
    if (!ok) (await import('./core/dom.js')).toast(i18n.t('welcome.offlineLater'), 3500);
    firstSync = 'done';
    router.refresh();
  })();
  return w.bringing();
};
async function stage() {
  if (needsAccount()) return 'welcome';
  const b = backend();
  if (!required() || !b?.session() || firstSync === 'done') return null;
  if (!store.account().startsWith('u_')) {
    // signed in from an e-mail link: this device's own study moves into the account first
    await (await import('./cloud/settings.js')).afterSignIn({ wait: 0 });
  }
  // offline there is nothing to bring: the app opens with this device's data and syncs when it can
  if (navigator.onLine === false) return null;
  return (await import('./cloud/sync.js')).firstSyncDone() ? null : 'bringing';
}

async function render(m) {
  const path = router.current();
  const st = await stage();
  if (path !== router.current()) return;   // a newer navigation is on its way
  els.app.classList.toggle('gated', st === 'welcome');
  if (st === 'welcome' && !OPEN_ROUTES.includes(path)) m = { view: welcomeView, params: {} };
  else if (st === 'bringing') m = { view: bringingView, params: {} };
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

let linkNote = '';
// Supabase's e-mail links (confirm the address, reset the password) come back as '#access_token=…'
// or '#error=…': sign in from the tokens, then take them out of the address bar.
async function fromEmailLink() {
  const link = readLink(location.hash);
  if (!link) return;
  history.replaceState(null, '', location.pathname + location.search + '#/');
  if (link.error) { linkNote = 'welcome.linkExpired'; return; }
  try {
    await backend().fromLink(link);
    if (link.type === 'recovery') try { sessionStorage.setItem('meletee-device:newPassword', '1'); } catch { /* blocked */ }
    // the first screen then shows "bringing your study over…" while stage() syncs the account (render)
  } catch { linkNote = 'welcome.linkExpired'; }
}

async function boot() {
  applyTheme();
  await i18n.setLang(i18n.detect());
  registerViews(router);
  if (backend()) await fromEmailLink();
  els = shell();
  router.start(render);
  // The server turned the session down (signed out elsewhere, password changed): back to the welcome screen.
  addEventListener('meletee:signedout', () => { if (required()) router.refresh(); });
  try {
    if (sessionStorage.getItem('meletee-device:newPassword') && backend()?.session()) {
      sessionStorage.removeItem('meletee-device:newPassword');
      import('./views/welcome.js').then((w) => w.askNewPassword());
    }
  } catch { /* storage blocked */ }
  // background work starts now (its first step is an async import, so the first paint is not held up):
  // Grow's activity log must be listening before the first workspace can save anything
  startBackground().catch((e) => console.warn('[background]', e));
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
