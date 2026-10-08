// Settings section for the account and cloud sync: sign in with the noema-lite account (optional),
// sync status, restore points and sign out. Returns null when no Supabase project is configured.
import { h, sheet, toast } from '../core/dom.js';
import { t, tn, lang } from '../core/i18n.js';
import { confirmSheet } from '../ui/forms.js';
import { backend } from './client.js';
import * as sync from './sync.js';
import { loadStore } from './convos.js';

const reload = () => setTimeout(() => location.reload(), 500);

function statusText(s) {
  if (s.syncing) return t('cloud.status.syncing');
  if (s.error) return /network|fetch/i.test(s.error) || (typeof navigator !== 'undefined' && navigator.onLine === false) ? t('cloud.status.offline') : t('cloud.status.error');
  if (s.pending) return tn('cloud.status.pending', s.pending);
  return t('cloud.status.synced');
}

export async function afterSignIn() {
  const b = backend();
  // AI conversations saved before signing in come along (ids are unique, so copying twice never duplicates)
  const convos = await loadStore();
  let before = [];
  try { before = convos?.list ? await convos.list({ includeDeleted: true }) : []; } catch { before = []; }
  await sync.activate(b.session().user.id);
  for (const r of before) { try { await convos.put(r, { keepUpdatedAt: true }); } catch { /* keep going */ } }
  try { await Promise.race([sync.pull().then(() => sync.push()), new Promise((r) => setTimeout(r, 7000))]); } catch { /* will retry after reload */ }
}

function signInSheet() {
  const b = backend();
  let mode = 'in';
  let close;
  const email = h('input.field', { id: 'cloud-email', type: 'email', autocomplete: 'email', required: true });
  const pw = h('input.field', { id: 'cloud-password', type: 'password', autocomplete: 'current-password', minlength: '8', required: true });
  const name = h('input.field', { id: 'cloud-name', type: 'text', autocomplete: 'nickname' });
  const msg = h('p.muted.small', { role: 'status', 'aria-live': 'polite' });
  const form = h('form.stack.cloud-form');
  const draw = () => {
    pw.setAttribute('autocomplete', mode === 'in' ? 'current-password' : 'new-password');
    form.replaceChildren(
      h('h2', mode === 'in' ? '☁️ ' + t('cloud.signIn') : '🌱 ' + t('cloud.signUp')),
      h('p.muted.small', t('cloud.sameAccount')),
      mode === 'up' ? h('label.field-row', { for: 'cloud-name' }, t('cloud.name'), name) : null,
      h('label.field-row', { for: 'cloud-email' }, t('cloud.email'), email),
      h('label.field-row', { for: 'cloud-password' }, t('cloud.password'), pw),
      msg,
      h('button.btn', { type: 'submit' }, mode === 'in' ? t('cloud.signIn') : t('cloud.signUp')),
      h('div.row', { style: { justifyContent: 'space-between' } },
        h('button.btn.ghost.small', { type: 'button', onclick: () => { mode = mode === 'in' ? 'up' : 'in'; msg.textContent = ''; draw(); } },
          mode === 'in' ? t('cloud.toSignUp') : t('cloud.toSignIn')),
        mode === 'in' ? h('button.btn.ghost.small', { type: 'button', onclick: async () => {
          if (!email.value.trim()) { msg.textContent = t('cloud.needEmail'); email.focus(); return; }
          try { await b.recover(email.value.trim()); msg.textContent = t('cloud.recoverSent'); } catch (e) { msg.textContent = t('cloud.failed', { msg: e.message }); }
        } }, t('cloud.forgot')) : null));
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; msg.textContent = '…';
    try {
      if (mode === 'in') await b.signIn(email.value.trim(), pw.value);
      else {
        const r = await b.signUp(email.value.trim(), pw.value, name.value.trim());
        if (!r.session) { msg.textContent = t('cloud.confirmEmail'); mode = 'in'; btn.disabled = false; return; }
      }
      msg.textContent = t('cloud.welcome');
      await afterSignIn();
      close();
      toast(t('cloud.welcome'));
      reload();
    } catch (err) {
      msg.textContent = t('cloud.failed', { msg: err.message });
      btn.disabled = false;
    }
  });
  draw();
  close = sheet(form, { label: t('cloud.signIn') });
  setTimeout(() => email.focus(), 50);
}

const when = (s) => new Intl.DateTimeFormat(lang(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s));

function restoreSheet() {
  const body = h('div.stack.cloud-restore');
  const list = h('div', h('p.muted', { role: 'status' }, t('cloud.loading')));
  const fill = async () => {
    let rows = [];
    try { rows = await sync.snapshots.list(); } catch (e) { list.replaceChildren(h('p.muted', t('cloud.failed', { msg: e.message }))); return; }
    list.replaceChildren(rows.length
      ? h('div.list', rows.map((r) => h('div',
          h('span.label', when(r.created_at), h('span.muted.small.cloud-kind', r.kind === 'auto' ? t('cloud.auto') : (r.label || t('cloud.manual')))),
          h('button.btn.soft.small', { onclick: async () => {
            if (!(await confirmSheet({ title: t('cloud.restoreTitle'), text: t('cloud.restoreText', { date: when(r.created_at) }), ok: t('cloud.restoreThis') }))) return;
            try {
              await sync.snapshots.save(t('cloud.beforeRestore'), 'manual').catch(() => {});
              await sync.snapshots.restore(r.id);
              toast(t('cloud.restored'));
              reload();
            } catch (e) { toast(t('cloud.failed', { msg: e.message })); }
          } }, t('cloud.restoreThis')))))
      : h('p.muted', t('cloud.noPoints')));
  };
  body.append(
    h('h2', '📌 ', t('cloud.restore')),
    h('p.muted.small', t('cloud.restoreLede')),
    list,
    h('button.btn.ghost.small', { style: { alignSelf: 'center' }, onclick: async () => {
      try { await sync.snapshots.save('', 'manual'); toast(t('cloud.savedPoint')); fill(); } catch (e) { toast(t('cloud.failed', { msg: e.message })); }
    } }, t('cloud.saveNow')));
  sheet(body, { label: t('cloud.restore') });
  fill();
}

export function cloudSettings() {
  const b = backend();
  if (!b) return null;
  const s = b.session();
  if (!s) {
    return h('section.stack.cloud',
      h('h2', '☁️ ', t('cloud.title')),
      h('p.muted', t('cloud.lede')),
      h('div.row',
        h('button.btn.soft.small', { onclick: signInSheet }, t('cloud.signIn')),
        h('a.btn.ghost.small', { href: '#/noema' }, '🦉 ', t('cloud.noemaLink'))));
  }
  const badge = h('span.badge.cloud-status', { role: 'status' }, statusText(sync.status()));
  const off = sync.onStatus((x) => { if (!badge.isConnected) { off(); return; } badge.textContent = statusText(x); });
  return h('section.stack.cloud',
    h('h2', '☁️ ', t('cloud.title')),
    h('div.list',
      h('div', h('span.label', t('cloud.signedInAs'), h('span.muted.small.cloud-email', s.user.email)), badge),
      h('button', { onclick: async () => {
        try { await sync.syncNow(); toast(t('cloud.synced')); } catch (e) { toast(t('cloud.failed', { msg: e.message })); }
      } }, h('span.label', '🔄 ', t('cloud.syncNow'))),
      h('button', { onclick: restoreSheet }, h('span.label', '📌 ', t('cloud.restore'))),
      h('a', { href: '#/noema' }, h('span.label', '🦉 ', t('cloud.noemaLink'))),
      h('button', { onclick: async () => {
        if (!(await confirmSheet({ title: t('cloud.signOutTitle'), text: t('cloud.signOutText'), ok: t('cloud.signOut') }))) return;
        await sync.push().catch(() => {});
        await b.signOut();
        sync.deactivate();
        reload();
      } }, h('span.label', '👋 ', t('cloud.signOut')))));
}
