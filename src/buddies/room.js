// One visit to a focus room: presence + the shared timer.
// The database is the source of truth (meletee_buddy_room_join answers with who was seen in the last
// ~90 s and the timer); the Realtime channel makes it instant. Without a socket, the room simply
// polls every few seconds, so it always works.
// Nothing from the network is trusted as is: timers go through cleanTimer() (a buddy could broadcast any
// payload), and live presence only shows people the database also lists for me (it leaves out both sides
// of a block; presence on the channel itself cannot be filtered per viewer).
import { openChannel, TIMERS } from './realtime.js';
import { mergeMembers, newerTimer, cleanTimer } from './logic.js';

export { cleanTimer };

export function joinRoom(roomId, {
  me, rpc, info = null, connect = openChannel, onChange = () => {},
  pollMs = 5000, beatMs = 30000, refreshMs = 1000, timers = TIMERS,
}) {
  let mode = 'connecting';
  let status = 'here';
  let live = [];
  let polled = [];
  let timer = null;
  let ch = null;
  let loop = null;
  let gone = false;

  let soon = false, soonId = null;
  let liveIds = '';
  // live presence, limited to people the database lists for me (plus me)
  const shown = () => {
    const known = new Set(polled.map((m) => m.id));
    if (me?.id) known.add(me.id);
    return live.filter((m) => known.has(m.id));
  };
  const members = () => mergeMembers(shown(), polled);
  const emit = () => { if (!gone) onChange({ mode, timer, members: members() }); };
  const absorb = (st) => {
    if (!st) return;
    polled = (Array.isArray(st.members) ? st.members : []).filter((m) => m && typeof m.id === 'string')
      .map((m) => ({ id: m.id, name: m.name, emoji: m.emoji, status: m.status }));
    timer = newerTimer(timer, cleanTimer(st.timer));
  };
  const beat = async () => {
    try { absorb(await rpc('meletee_buddy_room_join', { p_room: roomId, p_status: status })); emit(); } catch { /* next beat */ }
  };
  // someone came or went on the socket: ask the database who is here (once per burst of changes)
  const recheck = () => {
    const ids = live.map((m) => m.id).sort().join(',');
    if (ids === liveIds) return;
    liveIds = ids;
    if (soon || gone) return;
    soon = true;
    soonId = timers.setTimeout(() => { soon = false; if (!gone) beat(); }, refreshMs);
  };
  const every = (ms) => { timers.clearInterval(loop); loop = timers.setInterval(beat, ms); };

  const start = async () => {
    await beat();
    if (gone) return;
    if (!info) { mode = 'polling'; every(pollMs); emit(); return; }
    every(beatMs);
    ch = connect({
      url: info.url, token: info.token, key: me.id, topic: 'meletee-room:' + roomId,
      onStatus: (s) => {
        if (gone) return;
        if (s === 'live') { mode = 'live'; ch.track({ name: me.name, emoji: me.emoji, status }); }
        if (s === 'failed') { mode = 'polling'; live = []; every(pollMs); }
        emit();
      },
      onPresence: (list) => { live = Array.isArray(list) ? list : []; emit(); recheck(); },
      onBroadcast: (event, payload) => {
        if (event === 'timer') { const tm = cleanTimer(payload); if (tm) { timer = newerTimer(timer, tm); emit(); } }
        if (event === 'nudge') beat();
      },
    });
  };
  const ready = start();

  return {
    ready,
    get state() { return { mode, timer, members: members() }; },
    async setStatus(s) {
      if (s === status) return;
      status = s;
      if (mode === 'live') ch.track({ name: me.name, emoji: me.emoji, status });
      await beat();
    },
    async setTimer(next) {
      next = cleanTimer(next);
      if (!next) throw new Error('bad timer');
      timer = newerTimer(timer, next);
      emit();
      if (mode === 'live') ch.broadcast('timer', next);
      await rpc('meletee_buddy_room_timer', { p_room: roomId, p_timer: next });
    },
    async leave() {
      if (gone) return;
      gone = true;
      timers.clearInterval(loop);
      if (soonId != null) timers.clearTimeout(soonId);
      ch?.close();
      try { await rpc('meletee_buddy_room_leave', { p_room: roomId }); } catch { /* it expires anyway */ }
    },
  };
}
