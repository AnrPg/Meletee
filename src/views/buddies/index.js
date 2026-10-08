// The Buddies area (phase 7): study buddies by invite code, cheers and nudges, a shared focus room
// with a synced Pomodoro, shared and team goals, and opt-in weekly challenges.
// Buddies need an account (phase 6); signed out, one friendly screen explains them and links to
// Settings, and the rest of the app keeps working as before.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { companion } from '../../ui/art.js';
import * as data from '../../buddies/data.js';
import { trouble } from './ui.js';
import { buddiesHome, buddyView } from './home.js';
import { cardView, cardForm, inviteView, joinView } from './card.js';
import { roomsView, roomView } from './room.js';
import { goalsView, challengesView } from './goals.js';

export function signedOutView({ configured = true } = {}) {
  const idea = (emoji, title, text) => h('div.card.soft-card.bud-idea', h('span.bud-idea-emoji', { 'aria-hidden': 'true' }, emoji), h('div', h('h3', title), h('p.muted.small', text)));
  return h('div.stack-lg.bud-out',
    h('section.hero',
      companion({ mood: 'happy', leaves: 2, label: t('companion.label') }),
      h('h1', t('buddies.title')),
      h('p.lede', t('buddies.out.lede'))),
    h('div.cards',
      idea('📣', t('buddies.out.cheer'), t('buddies.out.cheerText')),
      idea('👯', t('buddies.out.together'), t('buddies.out.togetherText')),
      idea('🌍', t('buddies.out.team'), t('buddies.out.teamText'))),
    h('div.stack.center',
      configured ? h('a.btn', { href: '#/settings' }, t('buddies.out.signIn')) : h('p.muted.small', t('buddies.out.noCloud')),
      h('p.muted.small', t('buddies.out.private'))));
}

// Every buddy screen: signed in, with a buddy card (except the card screen itself).
const gate = (view, { needCard = true } = {}) => async (params, node) => {
  if (!data.configured()) return signedOutView({ configured: false });
  if (!data.signedIn()) return signedOutView();
  let card;
  try { card = await data.myCard(); } catch (e) { return trouble(e, () => import('../../core/router.js').then((r) => r.refresh())); }
  if (needCard && !card) return firstCard(params);
  try { return await view(params, node, card); } catch (e) {
    console.warn('[buddies]', e);
    return trouble(e, () => import('../../core/router.js').then((r) => r.refresh()));
  }
};

function firstCard() {
  const box = h('div.stack-lg.bud-first',
    h('section.hero.bud-hero',
      companion({ mood: 'happy', leaves: 2, label: t('companion.label') }),
      h('h1', t('buddies.first.title')),
      h('p.lede', t('buddies.first.lede'))));
  box.append(cardForm(null, { onSaved: () => import('../../core/router.js').then((r) => r.refresh()) }));
  return box;
}

export function registerBuddies(router) {
  data.watchActivity();
  router.route('/buddies', gate(buddiesHome));
  router.route('/buddies/me', gate(cardView, { needCard: false }));
  router.route('/buddies/invite', gate(inviteView));
  router.route('/buddies/join/:code', gate(joinView, { needCard: false }));
  router.route('/buddies/b/:id', gate(buddyView));
  router.route('/buddies/room', gate(roomsView));
  router.route('/buddies/room/:id', gate(roomView));
  router.route('/buddies/goals', gate(goalsView));
  router.route('/buddies/challenges', gate(challengesView));
}
