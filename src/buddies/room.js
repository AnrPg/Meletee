// One visit to a focus room: presence + the shared timer.
// The database is the source of truth (meletee_buddy_room_join answers with who was seen in the last
// ~90 s and the timer); the Realtime channel makes it instant. Without a socket, the room simply
// polls every few seconds, so it always works.
import { openChannel, TIMERS } from './realtime.js';
import { mergeMembers, newerTimer } from './logic.js';

export function joinRoom(roomId, {
  me, rpc, info = null, connect = openChannel, onChange = () => {},
  pollMs = 5000, beatMs = 30000, timers = TIMERS,
}) {
  let mode = 'connecting';
  let status = 'here';
  let live = [];
  let polled = [];
  let timer = null;
  let ch = null;
  let loop = null;
  let gone = false;

  const emit = () => { if (!gone) onChange({ mode, timer, members: mergeMembers(live, polled) }); };
  const absorb = (st) => {
    if (!st) return;
    polled = (st.members || []).map((m) => ({ id: m.id, name: m.name, emoji: m.emoji, status: m.status }));
    timer = newerTimer(timer, st.timer && st.timer.v ? st.timer : null);
  };
  const beat = async () => {
    try { absorb(await rpc('meletee_buddy_room_join', { p_room: roomId, p_status: status })); emit(); } catch { /* next beat */ }
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
      onPresence: (list) => { live = list; emit(); },
      onBroadcast: (event, payload) => {
        if (event === 'timer' && payload) { timer = newerTimer(timer, payload); emit(); }
        if (event === 'nudge') beat();
      },
    });
  };
  const ready = start();

  return {
    ready,
    get state() { return { mode, timer, members: mergeMembers(live, polled) }; },
    async setStatus(s) {
      if (s === status) return;
      status = s;
      if (mode === 'live') ch.track({ name: me.name, emoji: me.emoji, status });
      await beat();
    },
    async setTimer(next) {
      timer = newerTimer(timer, next);
      emit();
      if (mode === 'live') ch.broadcast('timer', next);
      await rpc('meletee_buddy_room_timer', { p_room: roomId, p_timer: next });
    },
    async leave() {
      if (gone) return;
      gone = true;
      timers.clearInterval(loop);
      ch?.close();
      try { await rpc('meletee_buddy_room_leave', { p_room: roomId }); } catch { /* it expires anyway */ }
    },
  };
}
