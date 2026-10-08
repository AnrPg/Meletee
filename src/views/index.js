// Every route of the app. Only the home screen ships with the first load: each other area is a
// dynamic import, fetched the first time its route opens (and cached by the service worker).
import { home } from './home.js';
import { registerGrow } from './grow/index.js';
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';

export const NAV = [
  { path: '/', icon: 'home', label: 'nav.home' },
  { path: '/learn', icon: 'learn', label: 'nav.learn' },
  { path: '/do', icon: 'do', label: 'nav.do' },
  { path: '/grow', icon: 'grow', label: 'nav.grow' },
  { path: '/buddies', icon: 'buddies', label: 'nav.buddies' },
];

// lazy(() => import('./x.js'), 'name') -> a view that loads its module on first use.
export const lazy = (load, name) => async (params, node) => {
  const mod = await load();
  const view = typeof name === 'function' ? name(mod) : mod[name];
  return view(params, node);
};

const learn = () => import('./learn.js');
const courses = () => import('./courses.js');
const ws = () => import('./workspace.js');
const buddies = () => import('./buddies/index.js');
const noema = () => import('../noema/views.js');

export function registerViews(router) {
  router.route('/', home);
  router.route('/learn', lazy(learn, 'learn'));
  router.route('/learn/methods', lazy(learn, 'methods'));
  router.route('/learn/method/:id', lazy(learn, 'method'));
  router.route('/learn/guide', lazy(learn, 'guide'));
  router.route('/learn/guide/:id', lazy(learn, 'guideSection'));
  router.route('/learn/myths', lazy(learn, 'myths'));
  router.route('/learn/find', lazy(learn, 'find'));
  router.route('/do', lazy(() => import('./do.js'), 'doView'));
  router.route('/do/focus', lazy(() => import('./focus.js'), 'focus'));
  router.route('/do/courses', lazy(courses, 'courses'));
  router.route('/do/course/:id', lazy(courses, 'course'));
  router.route('/do/reviews', lazy(() => import('./reviews.js'), 'reviews'));
  router.route('/do/plan', lazy(() => import('./plan.js'), 'plan'));
  router.route('/ws', lazy(ws, 'workspaces'));
  router.route('/ws/:id', lazy(ws, 'workspace'));
  registerGrow(router, lazy);
  const bud = (k) => lazy(buddies, (m) => m.views[k]);
  router.route('/buddies', bud('home'));
  router.route('/buddies/me', bud('me'));
  router.route('/buddies/invite', bud('invite'));
  router.route('/buddies/join/:code', bud('join'));
  router.route('/buddies/b/:id', bud('buddy'));
  router.route('/buddies/room', bud('rooms'));
  router.route('/buddies/room/:id', bud('room'));
  router.route('/buddies/goals', bud('goals'));
  router.route('/buddies/challenges', bud('challenges'));
  router.route('/noema', lazy(noema, 'hub'));
  router.route('/noema/:id', lazy(noema, 'subjectView'));
  router.route('/settings', lazy(() => import('./settings.js'), 'settings'));
  router.route('/privacy', lazy(() => import('./privacy.js'), 'privacy'));
}

registerViews.notFound = () => h('div.hero', h('h1', t('error.notFound')), h('a.btn', { href: '#/' }, t('nav.home')));

// Work that runs app-wide in the background, started once after the first screen is drawn.
// Grow's activity log is tiny and always on; the cloud (sync, AI conversations, noema-lite
// results) and the buddies' live status only matter with an account or a noema-linked course,
// so a signed-out learner never downloads them.
export async function startBackground() {
  (await import('../grow/data.js')).listen();
  let cloudish = false;
  try {
    cloudish = !!window.__meleteeSupabase || !!localStorage.getItem('meletee1:cloud:session')
      || (await import('../core/store.js')).account().startsWith('u_')
      || (await import('../core/study.js')).courses().some((c) => c.noema?.subject);
  } catch { cloudish = !!window.__meleteeSupabase; }
  if (!cloudish) return;
  try {
    (await import('../cloud/routes.js')).startCloud();
    (await import('../buddies/data.js')).watchActivity();
  } catch (e) { console.warn('[background]', e); }
}
