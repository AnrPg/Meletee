// My buddy card (name, emoji, what I share), invites and the invite link's landing screen.
import { h, toast } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import * as router from '../../core/router.js';
import { confirmSheet } from '../../ui/forms.js';
import * as data from '../../buddies/data.js';
import { EMOJIS, SHARE_KEYS, DEFAULT_SHARE, parseCode, inviteLink } from '../../buddies/logic.js';
import { back, avatar } from './ui.js';

let formSeq = 0;

// The card form: used for the first card and for changes later.
export function cardForm(card, { onSaved = () => {}, submitLabel = null } = {}) {
  const id = `bud-form-${++formSeq}`;
  let emoji = card?.emoji || EMOJIS[Math.floor(Math.random() * 6)];
  const share = { ...DEFAULT_SHARE, ...(card?.share || {}) };
  const name = h('input.field', { id: `${id}-name`, type: 'text', maxlength: '40', autocomplete: 'nickname', required: true, value: card?.display_name || data.suggestedName() });
  const preview = avatar(emoji, { big: true });
  const emojis = h('div.bud-emojis', { role: 'radiogroup', 'aria-label': t('buddies.card.emoji') },
    EMOJIS.map((e) => h('button.bud-emoji', {
      type: 'button', role: 'radio', 'aria-checked': String(e === emoji), 'aria-label': e,
      onclick: (ev) => {
        emoji = e;
        preview.textContent = e;
        for (const b of emojis.children) b.setAttribute('aria-checked', String(b === ev.currentTarget));
      },
    }, e)));
  const toggles = SHARE_KEYS.map((k) => {
    const box = h('input', { type: 'checkbox', id: `${id}-share-${k}`, 'data-share': k, checked: share[k] || null });
    return h('label.bud-toggle', { for: `${id}-share-${k}` }, box,
      h('span', h('span.bud-toggle-title', t(`buddies.share.${k}`)), h('span.muted.small', t(`buddies.share.${k}.hint`))));
  });
  const msg = h('p.muted.small', { role: 'status', 'aria-live': 'polite' });
  const form = h('form.stack.bud-card-form',
    h('div.row.bud-card-top', preview,
      h('label.field-row.bud-grow', { for: `${id}-name` }, t('buddies.card.name'), name)),
    h('fieldset.bud-fieldset', h('legend', t('buddies.card.emoji')), emojis),
    h('fieldset.bud-fieldset',
      h('legend', t('buddies.card.share')),
      h('p.muted.small', t('buddies.card.shareHint')),
      h('div.bud-toggles', toggles)),
    msg,
    h('button.btn', { type: 'submit' }, submitLabel || t('buddies.card.save')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    if (!name.value.trim()) { msg.textContent = t('buddies.card.needName'); name.focus(); return; }
    btn.disabled = true;
    try {
      const sh = Object.fromEntries(SHARE_KEYS.map((k) => [k, form.querySelector(`[data-share="${k}"]`).checked]));
      await data.saveCard({ display_name: name.value, emoji, share: sh, compete: card?.compete || false });
      toast(t('buddies.card.saved'));
      onSaved();
    } catch (err) {
      msg.textContent = t('buddies.failed');
      console.warn('[buddies]', err);
    } finally { btn.disabled = false; }
  });
  return form;
}

export async function cardView(params, node, card) {
  const view = h('div.stack-lg',
    back(),
    h('header.stack', h('h1', card ? t('buddies.card.title') : t('buddies.first.title')), h('p.lede', t('buddies.card.lede'))),
    cardForm(card, { onSaved: () => router.go('/buddies') }));
  if (card) {
    let o = null;
    try { o = await data.overview(); } catch { /* the list below is optional */ }
    if (o?.blocked.length) {
      view.append(h('section.stack',
        h('h2', '🚫 ', t('buddies.blocked.title')),
        h('p.muted.small', t('buddies.blocked.text')),
        h('div.list', o.blocked.map((b) => h('div',
          avatar(b.emoji), h('span.label', b.name),
          h('button.btn.ghost.small', { onclick: async () => {
            try { await data.unblock(b.id); toast(t('buddies.blocked.done')); router.refresh(); } catch { toast(t('buddies.failed')); }
          } }, t('buddies.blocked.unblock')))))));
    }
  }
  return view;
}

function copy(text) {
  try { return navigator.clipboard.writeText(text).then(() => true, () => false); } catch { return Promise.resolve(false); }
}

export function inviteView() {
  const out = h('div.stack');
  const make = h('button.btn', { onclick: async () => {
    make.disabled = true;
    try {
      const code = await data.createInvite();
      const link = inviteLink(code, location.href);
      const linkField = h('input.field.bud-link', { id: 'bud-invite-link', type: 'text', readonly: true, value: link });
      out.replaceChildren(h('section.card.bud-invite.stack.center',
        h('p.eyebrow', t('buddies.invite.code')),
        h('p.bud-code', { 'aria-label': code.split('').join(' ') }, code),
        h('label.field-row.bud-full', { for: 'bud-invite-link' }, t('buddies.invite.link'), linkField),
        h('div.row', { style: { justifyContent: 'center' } },
          h('button.btn.soft.small', { onclick: async () => {
            const ok = await copy(link);
            if (!ok) { linkField.select(); }
            toast(ok ? t('buddies.invite.copied') : t('buddies.invite.selectIt'));
          } }, '📋 ', t('buddies.invite.copy')),
          navigator.share ? h('button.btn.ghost.small', { onclick: () => navigator.share({ title: t('buddies.invite.shareTitle'), text: t('buddies.invite.shareText'), url: link }).catch(() => {}) }, '📤 ', t('buddies.invite.share')) : null),
        h('p.muted.small', t('buddies.invite.once'))));
      make.remove();
    } catch (e) { toast(t('buddies.failed')); make.disabled = false; }
  } }, '✉️ ', t('buddies.invite.create'));

  const codeIn = h('input.field', { id: 'bud-code-in', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'ABCD 2345' });
  const msg = h('p.muted.small', { role: 'status', 'aria-live': 'polite' });
  const enter = h('form.stack.bud-enter', { onsubmit: (e) => {
    e.preventDefault();
    const code = parseCode(codeIn.value);
    if (!code) { msg.textContent = t('buddies.invite.badCode'); codeIn.focus(); return; }
    router.go('/buddies/join/' + code);
  } },
    h('h2', '🔑 ', t('buddies.invite.haveCode')),
    h('label.field-row', { for: 'bud-code-in' }, t('buddies.invite.codeLabel'), codeIn),
    msg,
    h('button.btn.ghost.small', { type: 'submit', style: { alignSelf: 'flex-start' } }, t('buddies.invite.open')));

  return h('div.stack-lg',
    back(),
    h('header.stack', h('h1', t('buddies.invite.title')), h('p.lede', t('buddies.invite.lede'))),
    h('div.stack.center', make, out),
    enter);
}

export async function joinView({ code: raw }, node, card) {
  const code = parseCode(raw);
  const shell = (...kids) => h('div.stack-lg', back(), ...kids);
  if (!code) return shell(h('div.empty', h('p', '🔍'), h('h2', t('buddies.join.invalid')), h('a.btn.soft.small', { href: '#/buddies/invite' }, t('buddies.invite.haveCode'))));
  if (!card) {
    return shell(
      h('header.stack', h('h1', t('buddies.join.firstCard')), h('p.lede', t('buddies.first.lede'))),
      cardForm(null, { submitLabel: t('buddies.join.continue'), onSaved: () => router.refresh() }));
  }
  const p = await data.previewInvite(code);
  const st = p?.status || 'invalid';
  if (st === 'already') return shell(h('div.empty', h('p', p.emoji || '🤝'), h('h2', t('buddies.join.already', { name: p.name })), h('a.btn.soft.small', { href: '#/buddies' }, t('nav.buddies'))));
  if (st !== 'ok') {
    const emoji = { self: '🪞', used: '🎟️', expired: '⌛' }[st] || '🔍';
    return shell(h('div.empty', h('p', emoji), h('h2', t(`buddies.join.${st}`)), st === 'self'
      ? h('a.btn.soft.small', { href: '#/buddies/invite' }, t('buddies.invite.title'))
      : h('p.muted', t('buddies.join.askNew'))));
  }
  const accept = h('button.btn', { onclick: async () => {
    accept.disabled = true;
    try {
      const r = await data.acceptInvite(code);
      toast(t('buddies.join.welcome', { name: p.name }));
      router.go(r?.id ? '/buddies/b/' + r.id : '/buddies');
    } catch { toast(t('buddies.failed')); accept.disabled = false; }
  } }, '🤝 ', t('buddies.join.accept'));
  return shell(h('section.hero.bud-hero',
    avatar(p.emoji, { big: true }),
    h('h1', t('buddies.join.title', { name: p.name })),
    h('p.lede', t('buddies.join.lede')),
    h('div.stack.center',
      accept,
      h('button.btn.ghost.small', { onclick: async () => {
        if (!(await confirmSheet({ title: t('buddies.join.declineTitle'), text: t('buddies.join.declineText'), ok: t('buddies.join.decline') }))) return;
        try { await data.declineInvite(code); toast(t('buddies.join.declined')); router.go('/buddies'); } catch { toast(t('buddies.failed')); }
      } }, t('buddies.join.decline')))));
}
