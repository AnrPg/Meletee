// Study together: focus rooms (body doubling) with presence and a synced Pomodoro.
import { h, svg, toast, sheet } from '../../core/dom.js';
import { t, tn } from '../../core/i18n.js';
import * as router from '../../core/router.js';
import * as store from '../../core/store.js';
import * as study from '../../core/study.js';
import { iso } from '../../core/dates.js';
import * as data from '../../buddies/data.js';
import { rpc, realtimeInfo } from '../../buddies/rpc.js';
import { joinRoom } from '../../buddies/room.js';
import { ROOM_PRESETS, startTimer, stopTimer, timerView } from '../../buddies/logic.js';
import { back, avatar } from './ui.js';

const R = 92, C = 2 * Math.PI * R;
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const roomName = (r, meId) => (r.owner === meId ? t('buddies.room.yours') : t('buddies.room.of', { name: r.name }));

function timerLine(tm) {
  const v = timerView(tm);
  if (v.phase === 'focus') return t('buddies.room.focusLeft', { n: Math.ceil(v.left / 60000) });
  if (v.phase === 'break') return t('buddies.room.breakLeft', { n: Math.ceil(v.left / 60000) });
  return null;
}

export async function roomsView() {
  const o = await data.overview({ fresh: true });
  const meId = data.me().id;
  const busy = o.rooms.filter((r) => r.owner !== meId && r.members.length);
  const open = h('button.btn', { onclick: async () => {
    open.disabled = true;
    try { router.go('/buddies/room/' + (await data.openMyRoom())); } catch { open.disabled = false; toast(t('buddies.failed')); }
  } }, '🚪 ', t('buddies.room.open'));
  return h('div.stack-lg',
    back(),
    h('header.stack', h('h1', t('buddies.room.title')), h('p.lede', t('buddies.room.lede'))),
    h('div.stack.center', open),
    h('section.stack',
      h('h2', t('buddies.room.now')),
      busy.length
        ? h('div.cards', busy.map((r) => h('a.card.row-card.bud-room-card', { href: '#/buddies/room/' + r.id },
          avatar(r.emoji),
          h('div',
            h('h3', roomName(r, meId)),
            h('p.muted.small', r.members.map((m) => m.emoji).join(' '), ' · ', tn('buddies.room.here', r.members.length), timerLine(r.timer) ? ' · ' + timerLine(r.timer) : '')))))
        : h('p.muted', t('buddies.room.nobody'))));
}

function ringEl(time, label) {
  const el = h('div.ring.bud-ring');
  el.append(svg(`<svg viewBox="0 0 200 200" aria-hidden="true"><circle class="ring-track" cx="100" cy="100" r="${R}"/><circle class="ring-arc" cx="100" cy="100" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`),
    h('div.ring-inner', time, label));
  return el;
}

// Remember which shared focus blocks were already logged as sessions (on this device).
function logOnce(key, minutes) {
  const done = store.get('buddies:logged', []);
  if (done.includes(key)) return false;
  store.set('buddies:logged', [...done, key].slice(-30));
  study.logSession({ date: iso(), minutes, preset: 'room', room: true });
  return true;
}

function nudgeSheet(buddies) {
  let close;
  close = sheet(h('div.stack',
    h('h2', '📣 ', t('buddies.room.invite')),
    buddies.length ? h('div.list', buddies.map((b) => h('button', { onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { await data.cheer(b.id, 'nudge', 'joinRoom'); toast(t('buddies.cheer.sent', { name: b.name })); } catch { toast(t('buddies.failed')); }
    } }, avatar(b.emoji), h('span.label', b.name), h('span.muted.small', '👯')))) : h('p.muted', t('buddies.home.noneText')),
    h('button.btn.ghost.small', { onclick: () => close() }, t('common.done'))), { label: t('buddies.room.invite') });
}

export async function roomView({ id }, node, card) {
  const o = await data.overview({ fresh: true });
  const meId = data.me().id;
  const room = o.rooms.find((r) => r.id === id);
  if (!room) return h('div.stack-lg', back('#/buddies/room', t('buddies.room.title')), h('div.empty', h('p', '🚪'), h('h2', t('buddies.room.gone'))));

  const me = { id: meId, name: card.display_name, emoji: card.emoji };
  const modeLine = h('p.muted.small.bud-mode', { role: 'status' }, t('buddies.room.connecting'));
  const people = h('ul.plain.bud-people', { 'aria-label': t('buddies.room.people') });
  const time = h('div.ring-time', '25:00');
  const label = h('div.ring-label', t('buddies.room.ready'));
  const ring = ringEl(time, label);
  const controls = h('div.stack.center.bud-controls');
  let chosen = ROOM_PRESETS[0];
  let state = { mode: 'connecting', timer: room.timer, members: [] };
  let lastPhase = null, lastControls = null;

  const visit = joinRoom(id, { me, rpc, info: realtimeInfo(), onChange: (s) => { state = s; paint(); } });

  const drawControls = (phase) => {
    if (lastControls === phase) return;
    lastControls = phase;
    if (phase === 'idle') {
      const chips = h('div.row', { role: 'group', 'aria-label': t('focus.presets'), style: { justifyContent: 'center' } },
        ROOM_PRESETS.map((p) => h('button.chip', { type: 'button', 'aria-pressed': String(p === chosen), onclick: (e) => {
          chosen = p;
          for (const b of chips.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          paint();
        } }, `${p.focus} / ${p.rest}`)));
      controls.replaceChildren(chips,
        h('button.btn', { onclick: () => visit.setTimer(startTimer({ minutes: chosen.focus, rest: chosen.rest, by: meId })).catch(() => toast(t('buddies.failed'))) }, '🍅 ', t('buddies.room.start')),
        h('button.btn.ghost.small', { onclick: () => nudgeSheet(o.buddies) }, '📣 ', t('buddies.room.invite')));
    } else {
      controls.replaceChildren(
        h('p.muted.small', t('buddies.room.together')),
        h('button.btn.ghost.small', { onclick: () => visit.setTimer(stopTimer({ by: meId })).catch(() => toast(t('buddies.failed'))) }, t('buddies.room.stop')));
    }
  };

  const paint = () => {
    const v = timerView(state.timer);
    time.textContent = v.phase === 'idle' ? `${chosen.focus}:00` : fmt(v.left);
    label.textContent = t(`buddies.room.phase.${v.phase}`);
    ring.querySelector('.ring-arc').style.strokeDashoffset = String(v.phase === 'idle' ? 0 : C * Math.max(0, v.left) / (v.total || 1));
    modeLine.textContent = t(`buddies.room.mode.${state.mode}`);
    const members = state.members.some((m) => m.id === meId) ? state.members : [...state.members, { ...me, status: 'here' }];
    const sig = JSON.stringify(members);
    if (people.dataset.sig !== sig) {
      people.dataset.sig = sig;
      people.replaceChildren(...members.map((m) => h('li.bud-person', { 'data-status': m.status },
        avatar(m.emoji),
        h('span.bud-person-name', m.id === meId ? t('buddies.room.you', { name: m.name }) : m.name),
        h('span.muted.small', t(`buddies.room.status.${m.status || 'here'}`)))));
    }
    drawControls(v.phase === 'idle' ? 'idle' : 'running');
    // follow the shared phase: my status, and a logged session when a shared focus block ends
    if (v.phase !== lastPhase) {
      if (lastPhase === 'focus' && v.phase !== 'focus' && state.timer?.startedAt && Date.now() >= state.timer.endsAt) {
        if (logOnce(`${id}:${state.timer.startedAt}`, state.timer.minutes)) toast(t('buddies.room.logged', { n: state.timer.minutes }));
      }
      lastPhase = v.phase;
      visit.setStatus(v.phase === 'focus' ? 'focus' : v.phase === 'break' ? 'break' : 'here');
    }
  };

  const view = h('div.stack-lg.bud-room',
    back('#/buddies/room', t('buddies.room.title')),
    h('header.stack.center',
      h('h1', roomName(room, meId)),
      modeLine),
    h('div.stack-lg.center', ring, controls),
    h('section.stack', h('h2', t('buddies.room.people')), people),
    h('p.muted.small.center', t('buddies.room.privacy')));

  paint();
  const tick = setInterval(() => {
    if (!view.isConnected) { clearInterval(tick); removeEventListener('pagehide', bye); visit.leave(); return; }
    paint();
  }, 250);
  const bye = () => visit.leave();
  addEventListener('pagehide', bye);
  return view;
}
