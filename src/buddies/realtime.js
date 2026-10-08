// A very small Supabase Realtime client (Phoenix channels over a websocket, protocol vsn 1.0.0),
// enough for one focus room: join a private channel, presence (who is here) and broadcast
// (the shared timer). No supabase-js. Everything it needs is injectable, so tests use a fake socket.
//
//   const ch = openChannel({ url, topic: 'meletee-room:<id>', token, key: userId, onPresence, onBroadcast, onStatus });
//   ch.track({ name, emoji, status });  ch.broadcast('timer', {...});  ch.close();
//
// onStatus gets 'live' once the server accepted the join, and 'failed' when anything goes wrong
// (no socket, refused join, no answer in time, socket closed): the caller then falls back to polling.
import { applyPresenceDiff, presenceList } from './logic.js';

// Bound wrappers: calling window.setTimeout as a method of another object throws "Illegal invocation".
export const TIMERS = {
  setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id),
  setInterval: (f, ms) => setInterval(f, ms), clearInterval: (id) => clearInterval(id),
};

export function openChannel({
  url, topic, token, key, onPresence = () => {}, onBroadcast = () => {}, onStatus = () => {},
  WS = typeof WebSocket !== 'undefined' ? WebSocket : null,
  timers = TIMERS,
  joinTimeout = 8000, heartbeatMs = 25000,
}) {
  const full = 'realtime:' + topic;
  let ref = 0;
  const joinRef = String(++ref);
  let status = 'connecting';
  let presence = {};
  let ws = null, hb = null, jt = null, queued = null;

  const raw = (msg) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch { /* closed */ } };
  const push = (event, payload) => raw({ topic: full, event, payload, ref: String(++ref), join_ref: joinRef });
  const stop = () => {
    timers.clearInterval(hb); timers.clearTimeout(jt); hb = jt = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; try { ws.close(); } catch { /* fine */ } }
  };
  const set = (s) => { if (status === s || status === 'closed') return; status = s; onStatus(s); };
  const fail = () => { if (status === 'failed' || status === 'closed') return; stop(); set('failed'); };

  const api = {
    get status() { return status; },
    track(meta) { if (status === 'live') push('presence', { type: 'presence', event: 'track', payload: meta }); else queued = meta; },
    broadcast(event, payload) { if (status === 'live') push('broadcast', { type: 'broadcast', event, payload }); },
    close() {
      if (status === 'closed') return;
      if (status === 'live') push('phx_leave', {});
      stop(); status = 'closed';
    },
  };

  if (!WS || !url) { timers.setTimeout(fail, 0); return api; }
  try { ws = new WS(url); } catch { timers.setTimeout(fail, 0); return api; }

  ws.onopen = () => {
    raw({ topic: full, event: 'phx_join', ref: joinRef, join_ref: joinRef, payload: {
      config: { broadcast: { self: false, ack: false }, presence: { key }, private: true },
      access_token: token,
    } });
    hb = timers.setInterval(() => raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }), heartbeatMs);
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.topic !== full) return;
    switch (m.event) {
      case 'phx_reply':
        if (m.ref === joinRef) {
          if (m.payload?.status === 'ok') {
            timers.clearTimeout(jt);
            set('live');
            if (queued) { const q = queued; queued = null; api.track(q); }
          } else fail();
        }
        break;
      case 'presence_state':
        presence = m.payload || {};
        onPresence(presenceList(presence));
        break;
      case 'presence_diff':
        presence = applyPresenceDiff(presence, m.payload || {});
        onPresence(presenceList(presence));
        break;
      case 'broadcast':
        if (m.payload?.event) onBroadcast(m.payload.event, m.payload.payload);
        break;
      case 'system':
        if (m.payload?.status === 'error') fail();
        break;
      case 'phx_error':
      case 'phx_close':
        fail();
        break;
      default:
    }
  };
  ws.onerror = fail;
  ws.onclose = fail;
  jt = timers.setTimeout(() => { if (status === 'connecting') fail(); }, joinTimeout);
  return api;
}
