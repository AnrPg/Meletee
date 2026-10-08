// Buddies home (cheers received, buddies at a glance, ways to study together) and a buddy's page.
import { h, sheet, toast } from '../../core/dom.js';
import { t, tn, lang } from '../../core/i18n.js';
import * as router from '../../core/router.js';
import { confirmSheet } from '../../ui/forms.js';
import * as data from '../../buddies/data.js';
import { CHEERS, byWeek } from '../../buddies/logic.js';
import { back, avatar, glance } from './ui.js';

export const CHEER_EMOJI = { proud: '🌟', youGotThis: '💪', highFive: '🙌', niceStreak: '🌿', keepGoing: '🚀', studyNow: '⏰', oneSession: '🍅', joinRoom: '👯', thinkingOfYou: '💜' };
const msgText = (key) => `${CHEER_EMOJI[key] || '💜'} ${t('buddies.msg.' + key)}`;

const entry = (href, emoji, title, text) =>
  h('a.card.row-card', { href }, h('span', { 'aria-hidden': 'true' }, emoji), h('div', h('h3', title), text ? h('p.muted.small', text) : null));

// Publish my numbers first (quietly, never for long), then read everything.
async function load() {
  await Promise.race([data.publish(), new Promise((r) => setTimeout(r, 2500))]);
  return data.overview();
}

export function cheerSheet(buddy, kind = 'cheer') {
  let close;
  const title = t(kind === 'cheer' ? 'buddies.cheer.title' : 'buddies.nudge.title', { name: buddy.name });
  const pick = async (key, btn) => {
    btn.disabled = true;
    try {
      await data.cheer(buddy.id, kind, key);
      close();
      toast(t('buddies.cheer.sent', { name: buddy.name }));
    } catch (e) {
      btn.disabled = false;
      toast(/slow/i.test(e.message) ? t('buddies.cheer.slow') : t('buddies.failed'));
    }
  };
  close = sheet(h('div.stack.bud-cheers',
    h('h2', title),
    h('p.muted.small', t(kind === 'cheer' ? 'buddies.cheer.hint' : 'buddies.nudge.hint')),
    h('div.bud-presets', CHEERS[kind].map((key) => h('button.chip.bud-preset', { type: 'button', 'data-msg': key, onclick: (e) => pick(key, e.currentTarget) }, msgText(key))))), { label: title });
}

function cheersCard(cheers) {
  const fresh = cheers.filter((c) => !c.seen).slice(0, 3);
  if (!fresh.length) return null;
  data.cheersSeen();
  return h('section.card.soft-card.bud-inbox', { 'aria-label': t('buddies.home.cheers') },
    h('p.eyebrow', '💌 ', t('buddies.home.cheers')),
    h('ul.plain', fresh.map((c) => h('li.row.bud-inbox-row',
      avatar(c.emoji),
      h('span', h('strong', c.name), ' · ', msgText(c.message))))));
}

export async function buddiesHome(params, node, card) {
  const o = await load();
  const hasBuddies = o.buddies.length > 0;
  const people = new Set(o.rooms.flatMap((r) => r.members.map((m) => m.id)));
  const goalsNow = byWeek(o.goals).now;
  const head = h('header.bud-head',
    h('div', h('h1', t('buddies.title')), h('p.lede', hasBuddies ? t('buddies.home.lede') : t('buddies.home.ledeEmpty'))),
    h('a.bud-me', { href: '#/buddies/me', 'aria-label': t('buddies.card.title'), title: t('buddies.card.title') }, avatar(card.emoji)));

  const main = hasBuddies
    ? h('div.stack.center',
      h('a.btn', { href: '#/buddies/room' }, '👯 ', t('buddies.home.together')),
      people.size ? h('p.muted.small', tn('buddies.home.inRooms', people.size)) : null)
    : h('div.empty',
      h('p', '👋'),
      h('h2', t('buddies.home.noneTitle')),
      h('p.muted', t('buddies.home.noneText')),
      h('a.btn', { href: '#/buddies/invite' }, '✉️ ', t('buddies.invite.title')));

  const list = hasBuddies ? h('section.stack',
    h('h2', t('buddies.home.yours')),
    h('div.list.bud-list', o.buddies.map((b) => h('div.bud-row',
      avatar(b.emoji),
      h('div.bud-row-main',
        h('a.bud-name', { href: '#/buddies/b/' + encodeURIComponent(b.id) }, b.name),
        glance(b.shared) || h('span.muted.small', t('buddies.private'))),
      h('button.btn.soft.small.bud-cheer-btn', { 'aria-label': t('buddies.cheer.title', { name: b.name }), onclick: () => cheerSheet(b, 'cheer') }, '📣'))))) : null;

  const more = h('section.stack',
    h('h2.sr-only', t('buddies.home.more')),
    h('div.cards',
      hasBuddies ? entry('#/buddies/goals', '🤝', t('buddies.goals.title'), goalsNow.filter((g) => g.kind !== 'challenge').length ? tn('buddies.goals.count', goalsNow.filter((g) => g.kind !== 'challenge').length) : t('buddies.goals.entry')) : null,
      hasBuddies ? entry('#/buddies/challenges', '🏆', t('buddies.ch.title'), o.compete ? t('buddies.ch.entryOn') : t('buddies.ch.entryOff')) : null,
      hasBuddies ? entry('#/buddies/invite', '✉️', t('buddies.invite.title'), t('buddies.invite.entry')) : null,
      entry('#/buddies/me', card.emoji, t('buddies.card.title'), t('buddies.card.entry'))));

  return h('div.stack-lg', head, cheersCard(o.cheers), main, list, more);
}

export async function buddyView({ id }) {
  const o = await load();
  const b = o.buddies.find((x) => x.id === id);
  if (!b) return h('div.stack-lg', back(), h('div.empty', h('p', '🍃'), h('h2', t('buddies.buddy.gone')), h('a.btn.soft.small', { href: '#/buddies' }, t('nav.buddies'))));
  const since = b.since ? new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(b.since)) : null;
  const shared = glance(b.shared);
  const more = h('details.bud-more',
    h('summary', t('buddies.buddy.more')),
    h('div.stack',
      h('button.btn.ghost.small', { onclick: async () => {
        if (!(await confirmSheet({ title: t('buddies.buddy.removeTitle', { name: b.name }), text: t('buddies.buddy.removeText'), ok: t('buddies.buddy.remove') }))) return;
        try { await data.removeBuddy(b.id); toast(t('buddies.buddy.removed')); router.go('/buddies'); } catch { toast(t('buddies.failed')); }
      } }, t('buddies.buddy.remove')),
      h('button.btn.ghost.small.bud-danger', { onclick: async () => {
        if (!(await confirmSheet({ title: t('buddies.buddy.blockTitle', { name: b.name }), text: t('buddies.buddy.blockText'), ok: t('buddies.buddy.block'), danger: true }))) return;
        try { await data.blockBuddy(b.id); toast(t('buddies.buddy.blocked')); router.go('/buddies'); } catch { toast(t('buddies.failed')); }
      } }, t('buddies.buddy.block'))));
  return h('div.stack-lg',
    back(),
    h('section.hero.bud-hero',
      avatar(b.emoji, { big: true }),
      h('h1', b.name),
      since ? h('p.muted.small', t('buddies.buddy.since', { date: since })) : null,
      shared || h('p.muted', t('buddies.buddy.private', { name: b.name }))),
    h('div.stack.center',
      h('button.btn', { onclick: () => cheerSheet(b, 'cheer') }, '📣 ', t('buddies.buddy.cheer')),
      h('button.btn.ghost.small', { onclick: () => cheerSheet(b, 'nudge') }, '🔔 ', t('buddies.buddy.nudge'))),
    more);
}
