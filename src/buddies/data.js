// The buddy data layer: my buddy card, the overview (buddies, cheers, goals, rooms), invites,
// cheers, goals and challenges. Reads of other people's data go through SECURITY DEFINER SQL
// functions that only return what accepted buddies chose to share (cloud/supabase.sql, phase 7).
// My own numbers are computed here from Meletee's activity and written for the signed-in user only.
import { backend } from '../cloud/client.js';
import * as store from '../core/store.js';
import * as study from '../core/study.js';
import { iso } from '../core/dates.js';
import { rpc } from './rpc.js';
import * as L from './logic.js';
import { snapshot as growSnapshot } from '../grow/data.js';

export const PROFILES = 'meletee_buddy_profiles';
export const INVITES = 'meletee_buddy_invites';
export const CONTRIB = 'meletee_buddy_contributions';

export const configured = () => !!backend();
export const me = () => backend()?.session()?.user || null;
export const signedIn = () => !!me();

// ---------- my buddy card ----------
let card; // undefined = not loaded, null = none yet
let cardUser = null;

export async function myCard({ force = false } = {}) {
  const u = me();
  if (!u) return null;
  if (!force && card !== undefined && cardUser === u.id) return card;
  const rows = await backend().select(PROFILES, { select: 'user_id,display_name,emoji,share,compete,stats,updated_at', filters: [['user_id', 'eq', u.id]], limit: 1 });
  cardUser = u.id;
  card = rows[0] ? { ...rows[0], share: L.normalizeShare(rows[0].share) } : null;
  return card;
}

export function suggestedName() {
  const u = me();
  return L.cleanName(u?.user_metadata?.name || (u?.email || '').split('@')[0]) || '';
}

export async function saveCard({ display_name, emoji, share, compete }) {
  const u = me();
  const name = L.cleanName(display_name);
  if (!name) throw new Error('name');
  const sh = L.normalizeShare(share);
  const row = { user_id: u.id, display_name: name, emoji: L.cleanEmoji(emoji), share: sh, compete: !!compete, stats: L.maskShared(sh, localStats()), updated_at: new Date().toISOString() };
  await backend().upsert(PROFILES, [row], { onConflict: 'user_id' });
  card = row; cardUser = u.id;
  invalidate();
  return row;
}

// ---------- my numbers (computed on this device) ----------
function localStats(now = Date.now()) {
  let streak = null, stage = 0;
  try { const snap = growSnapshot(); streak = snap.streak; stage = snap.stage || 0; } catch { /* storage blocked */ }
  return L.cardStats({ streak, stage, contrib: myContrib(), timer: store.get('timer', null), now });
}


export const myContrib = (today = iso()) => L.contributions({ sessions: study.sessions(), courses: study.courses(), week: L.weekOf(today), today });

// Write my card's shared stats and this week's contributions. Quiet: never throws.
let publishing = null;
export function publish() {
  if (!signedIn()) return Promise.resolve(false);
  publishing ||= (async () => {
    try {
      const c = await myCard();
      if (!c) return false;
      const c2 = myContrib();
      const stats = L.maskShared(c.share, localStats());
      await Promise.all([
        backend().upsert(CONTRIB, [{ user_id: me().id, week: c2.week, minutes: c2.minutes, sessions: c2.sessions, reviews: c2.reviews, updated_at: new Date().toISOString() }], { onConflict: 'user_id,week' }),
        JSON.stringify(stats) === JSON.stringify(c.stats || {}) ? null
          : backend().upsert(PROFILES, [{ user_id: me().id, display_name: c.display_name, emoji: c.emoji, share: c.share, compete: c.compete, stats, updated_at: new Date().toISOString() }], { onConflict: 'user_id' }).then(() => { card = { ...c, stats }; }),
      ]);
      return true;
    } catch { return false; } finally { publishing = null; }
  })();
  return publishing;
}

// After study changes (sessions, reviews, the timer), publish again a few seconds later.
let watching = false;
export function watchActivity() {
  if (watching) return;
  watching = true;
  let t = null;
  store.onChange((name) => {
    if (!['sessions', 'courses', 'timer'].includes(name) || !signedIn() || !card) return;
    clearTimeout(t);
    t = setTimeout(() => publish(), name === 'timer' ? 800 : 4000);
  });
}

// ---------- the overview: one call for the whole Buddies area ----------
let cache = null;
const ALL = Object.fromEntries(L.SHARE_KEYS.map((k) => [k, true]));
export const invalidate = () => { cache = null; };

export async function overview({ fresh = true } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 8000) return cache.data;
  const raw = await rpc('meletee_buddy_overview', { p_week: L.weekOf() });
  const data = {
    // only the known fields, whatever the server sends
    buddies: (raw?.buddies || []).map((b) => ({ ...b, shared: L.maskShared(ALL, b.shared) })),
    blocked: raw?.blocked || [],
    cheers: raw?.cheers || [],
    goals: raw?.goals || [],
    rooms: raw?.rooms || [],
    compete: !!raw?.compete,
  };
  cache = { at: Date.now(), data };
  return data;
}

// ---------- invites ----------
export async function createInvite() {
  for (let i = 0; i < 3; i++) {
    const code = L.newCode();
    try {
      await backend().insert(INVITES, [{ code, user_id: me().id }]);
      return code;
    } catch (e) { if (i === 2 || !/duplicate|conflict|409/i.test(e.message + (e.status || ''))) throw e; }
  }
  return null;
}
export const previewInvite = (code) => rpc('meletee_buddy_invite_preview', { p_code: code });
export async function acceptInvite(code) { const r = await rpc('meletee_buddy_accept_invite', { p_code: code }); invalidate(); return r; }
export async function declineInvite(code) { await rpc('meletee_buddy_decline_invite', { p_code: code }); }

// ---------- buddies ----------
export async function removeBuddy(id) { await rpc('meletee_buddy_remove', { p_other: id }); invalidate(); }
export async function blockBuddy(id) { await rpc('meletee_buddy_block', { p_other: id }); invalidate(); }
export async function unblock(id) { await rpc('meletee_buddy_unblock', { p_other: id }); invalidate(); }

export async function cheer(to, kind, message) {
  if (!L.isPreset(kind, message)) throw new Error('preset');
  await rpc('meletee_buddy_cheer', { p_to: to, p_kind: kind, p_message: message });
}
export async function cheersSeen() { try { await rpc('meletee_buddy_cheers_seen', {}); } catch { /* next time */ } }

// ---------- goals and challenges ----------
export async function createGoal({ kind, metric, target = null }) {
  const id = await rpc('meletee_buddy_goal_create', { p_kind: kind, p_metric: metric, p_target: kind === 'challenge' ? null : target, p_week: L.weekOf() });
  invalidate();
  return id;
}
export async function joinGoal(id) { await publish(); await rpc('meletee_buddy_goal_join', { p_goal: id }); invalidate(); }
export async function leaveGoal(id) { await rpc('meletee_buddy_goal_leave', { p_goal: id }); invalidate(); }

// ---------- rooms ----------
export async function openMyRoom() { const id = await rpc('meletee_buddy_room_open', {}); invalidate(); return id; }
