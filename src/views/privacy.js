// #/privacy: a calm page that says exactly where data goes, based on what the code does:
//   device   every meletee1:* key in this browser's storage, AI conversations in IndexedDB "meletee-convos"
//   cloud    meletee_kv + meletee_snapshots (src/cloud/sync.js), noema_conversations (src/cloud/convos.js),
//            buddy tables (cloud/supabase.sql), noema_kv read + inbox (src/noema/*), signed in only
//   AI keys  meletee-device:* keys, sent only to Anthropic or Google (src/ai/keys.js, claude.js, gemini.js)
// Plus the two ways out: a backup file (Settings) and deleting Meletee's data here, and in the cloud.
import { h, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { icon } from '../ui/art.js';
import { confirmSheet } from '../ui/forms.js';
import { needsAccount } from '../cloud/gate.js';

const part = (emoji, key) => h('section.card.soft-card.privacy-part',
  h('h2', h('span', { 'aria-hidden': 'true' }, emoji, ' '), t(`privacy.${key}.title`)),
  h('p.muted', t(`privacy.${key}.text`)));

// Everything Meletee keeps in this browser: its storage keys and the conversation database.
export function wipeDevice() {
  for (const get of [() => localStorage, () => sessionStorage]) {
    try { const s = get(); for (const k of Object.keys(s)) if (/^meletee/.test(k)) s.removeItem(k); } catch { /* storage blocked */ }
  }
  try { indexedDB.deleteDatabase('meletee-convos'); } catch { /* not available */ }
}

// Meletee's own rows in the cloud. Buddy links and other people's goals stay theirs; conversations
// are removed by id (only the ones this app wrote).
async function wipeCloud() {
  const { backend } = await import('../cloud/client.js');
  const b = backend(); const uid = b?.session()?.user?.id;
  if (!uid) return;
  const mine = [['user_id', 'eq', uid]];
  for (const table of ['meletee_kv', 'meletee_snapshots', 'meletee_buddy_contributions', 'meletee_buddy_invites', 'meletee_buddy_profiles']) {
    await b.remove(table, mine);
  }
  let convos = [];
  try { convos = await (await import('../ai/convos.js')).list({ includeDeleted: true }); } catch { convos = []; }
  for (const c of convos) if (c?.id) await b.remove('noema_conversations', [['user_id', 'eq', uid], ['id', 'eq', c.id]]).catch(() => {});
  await b.signOut?.().catch?.(() => {});
}

export async function privacy() {
  let signedIn = false;
  try { signedIn = (await import('../cloud/client.js')).signedIn(); } catch { signedIn = false; }
  const done = () => { toast(t('privacy.wiped')); setTimeout(() => { location.hash = '#/'; location.reload(); }, 700); };
  const wipeHere = async () => {
    if (!await confirmSheet({ title: t('privacy.wipeConfirm'), text: t('privacy.wipeText'), ok: t('privacy.wipe'), danger: true })) return;
    wipeDevice(); done();
  };
  const wipeAll = async () => {
    if (!await confirmSheet({ title: t('privacy.wipeCloudConfirm'), text: t('privacy.wipeCloudText'), ok: t('privacy.wipeCloud'), danger: true })) return;
    try { await wipeCloud(); } catch (e) { toast(t('privacy.failed', { msg: e.message })); return; }
    wipeDevice(); done();
  };
  return h('div.stack-lg.privacy',
    // from the welcome screen (no account yet) the way back is the welcome screen
    needsAccount()
      ? h('a.btn.ghost.small', { href: '#/', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('welcome.back'))
      : h('a.btn.ghost.small', { href: '#/settings', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('nav.settings')),
    h('div', h('h1', '🔒 ', t('privacy.title')), h('p.lede', { style: { marginTop: '8px' } }, t('privacy.lede'))),
    part('📱', 'device'),
    part('☁️', 'cloud'),
    part('🔑', 'keys'),
    part('👯', 'buddies'),
    part('🔗', 'noema'),
    h('section.stack',
      h('h2', h('span', { 'aria-hidden': 'true' }, '🧺 '), t('privacy.data.title')),
      h('p.muted', t('privacy.data.text')),
      h('div.row',
        needsAccount() ? null : h('a.btn.soft.small', { href: '#/settings' }, t('privacy.backup')),
        h('button.btn.ghost.small', { type: 'button', onclick: wipeHere }, t('privacy.wipe')),
        signedIn ? h('button.btn.ghost.small', { type: 'button', onclick: wipeAll }, t('privacy.wipeCloud')) : null)));
}
