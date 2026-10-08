import { home } from './home.js';
import { learn, methods, method, guide, guideSection, myths, find } from './learn.js';
import { soon } from './soon.js';
import { settings } from './settings.js';
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';

export const NAV = [
  { path: '/', icon: 'home', label: 'nav.home' },
  { path: '/learn', icon: 'learn', label: 'nav.learn' },
  { path: '/do', icon: 'do', label: 'nav.do' },
  { path: '/grow', icon: 'grow', label: 'nav.grow' },
  { path: '/buddies', icon: 'buddies', label: 'nav.buddies' },
];

export function registerViews(router) {
  router.route('/', home);
  router.route('/learn', learn);
  router.route('/learn/methods', methods);
  router.route('/learn/method/:id', method);
  router.route('/learn/guide', guide);
  router.route('/learn/guide/:id', guideSection);
  router.route('/learn/myths', myths);
  router.route('/learn/find', find);
  router.route('/do', () => soon('do'));
  router.route('/grow', () => soon('grow'));
  router.route('/buddies', () => soon('buddies'));
  router.route('/settings', settings);
}

registerViews.notFound = () => h('div.hero', h('h1', t('error.notFound')), h('a.btn', { href: '#/' }, t('nav.home')));
