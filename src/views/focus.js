// Focus timer (Pomodoro). The timer lives in storage as an absolute end time,
// so it survives reloads and keeps counting while the tab sleeps.
import { h, svg, toast, announce } from '../core/dom.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import * as study from '../core/study.js';
import { iso } from '../core/dates.js';
import { companion, icon } from '../ui/art.js';
import { openParking } from '../ui/parking.js';

const R = 92, C = 2 * Math.PI * R;
let audio;

function sound(kind) {
  if (!store.get('settings', {}).tick && kind === 'tick') return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    const now = audio.currentTime;
    o.type = 'sine';
    o.frequency.value = kind === 'tick' ? 1400 : 660;
    g.gain.setValueAtTime(kind === 'tick' ? 0.015 : 0.12, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'tick' ? 0.05 : 1.2));
    o.connect(g).connect(audio.destination);
    o.start(now); o.stop(now + (kind === 'tick' ? 0.06 : 1.3));
    if (kind === 'chime') setTimeout(() => sound('chime2'), 350);
    if (kind === 'chime2') o.frequency.value = 880;
  } catch { /* sound is optional */ }
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const timerState = () => store.get('timer', null);
const saveTimer = (v) => (v ? store.set('timer', v) : store.remove('timer'));

export function startTimer({ minutes, rest = 5, phase = 'focus', preset = null, label = '' }) {
  saveTimer({ phase, minutes, rest, preset, label, startedAt: Date.now(), endsAt: Date.now() + minutes * 60000, paused: null });
}

export function focus() {
  const root = h('div.focus');
  let tick;

  const render = () => {
    clearInterval(tick);
    const tm = timerState();
    if (!tm) return idle();
    if (tm.phase === 'recall') return recall(tm);
    running(tm);
  };

  const idle = () => {
    const last = store.get('settings', {}).preset || '25-5';
    let chosen = study.PRESETS.find((p) => p.id === last) || study.PRESETS[0];
    const chips = h('div.row', { role: 'group', 'aria-label': t('focus.presets'), style: { justifyContent: 'center' } },
      study.PRESETS.map((p) => h('button.chip', {
        'aria-pressed': String(p.id === chosen.id),
        onclick: (e) => {
          chosen = p;
          for (const b of chips.children) b.setAttribute('aria-pressed', 'false');
          e.currentTarget.setAttribute('aria-pressed', 'true');
          time.textContent = `${p.focus}:00`;
        },
      }, `${p.focus} / ${p.rest}`)));
    const time = h('div.ring-time', `${chosen.focus}:00`);
    root.replaceChildren(h('div.stack-lg.center',
      ring(1, time, h('div.ring-label', t('focus.ready'))),
      chips,
      h('div.stack.center',
        h('button.btn', { onclick: () => {
          store.update('settings', (s) => ({ ...s, preset: chosen.id }));
          startTimer({ minutes: chosen.focus, rest: chosen.rest, preset: chosen.id });
          render();
        } }, t('focus.start')),
        h('button.btn.ghost.small', { onclick: () => { startTimer({ minutes: 5, rest: 0, preset: 'five' }); render(); } }, t('focus.justFive'))),
      footer()));
  };

  const running = (tm) => {
    const time = h('div.ring-time', { role: 'timer', 'aria-live': 'off' });
    const label = h('div.ring-label', tm.phase === 'focus' ? t('focus.focusing') : t('focus.resting'));
    const arc = ring(0, time, label);
    const pauseBtn = h('button.btn.soft', { onclick: () => {
      const cur = timerState();
      if (cur.paused) saveTimer({ ...cur, endsAt: Date.now() + cur.paused, paused: null });
      else saveTimer({ ...cur, paused: cur.endsAt - Date.now() });
      update();
    } });
    const stopBtn = h('button.btn.ghost.small', { onclick: () => {
      const cur = timerState();
      if (cur.phase === 'focus') {
        const mins = Math.floor((Date.now() - cur.startedAt) / 60000);
        if (mins >= 1) study.logSession({ date: iso(), minutes: mins, preset: cur.preset, stopped: true });
      }
      saveTimer(null); render();
    } }, t('focus.stop'));
    root.replaceChildren(h('div.stack-lg.center', arc, h('div.stack.center', pauseBtn, stopBtn), footer()));

    let lastSec = -1;
    const update = () => {
      const cur = timerState();
      if (!cur) return render();
      const left = cur.paused ?? cur.endsAt - Date.now();
      const total = (cur.phase === 'focus' ? cur.minutes : cur.rest) * 60000;
      time.textContent = fmt(left);
      arc.querySelector('.ring-arc').style.strokeDashoffset = String(C * Math.max(0, left) / total);
      pauseBtn.textContent = cur.paused ? t('focus.resume') : t('focus.pause');
      document.title = `${fmt(left)} · ${t('app.name')}`;
      const sec = Math.ceil(left / 1000);
      if (!cur.paused && sec !== lastSec && cur.phase === 'focus') { lastSec = sec; sound('tick'); }
      if (left <= 0 && !cur.paused) finish(cur);
    };
    update();
    tick = setInterval(() => { if (!root.isConnected) { clearInterval(tick); return; } update(); }, 250);
  };

  const finish = (tm) => {
    clearInterval(tick);
    sound('chime');
    if (tm.phase === 'focus') {
      study.logSession({ date: iso(), minutes: tm.minutes, preset: tm.preset });
      saveTimer({ ...tm, phase: 'recall' });
      announce(t('focus.done', { n: tm.minutes }));
    } else {
      saveTimer(null);
      toast(t('focus.breakOver'));
    }
    render();
  };

  // After each focus block: a blank-page recall prompt, then the break.
  const recall = (tm) => {
    const text = h('textarea.field', { rows: 6, id: 'recall-text', placeholder: t('focus.recallPlaceholder') });
    const next = () => {
      const v = text.value.trim();
      if (v) store.update('recalls', (l) => [...l, { date: iso(), text: v }].slice(-500), []);
      if (tm.rest) startTimer({ minutes: tm.rest, phase: 'rest', preset: tm.preset }); else saveTimer(null);
      render();
    };
    root.replaceChildren(h('div.stack-lg',
      h('section.hero', { style: { paddingBottom: 0 } },
        h('div.celebrate', companion({ mood: 'happy', leaves: 3, label: t('companion.label') })),
        h('h1', t('focus.done', { n: tm.minutes })),
        h('p.lede', t('focus.recallLede'))),
      text,
      h('div.row', { style: { justifyContent: 'center' } },
        h('button.btn', { onclick: next }, tm.rest ? t('focus.takeBreak', { n: tm.rest }) : t('common.done')),
        h('button.btn.ghost.small', { onclick: () => { text.value = ''; next(); } }, t('focus.skip')))));
  };

  const footer = () => {
    const s = store.get('settings', {});
    const today = study.minutesOn();
    return h('div.row', { style: { justifyContent: 'center', gap: '4px' } },
      h('button.btn.ghost.small', { onclick: openParking }, '🅿 ', t('parking.title')),
      h('button.btn.ghost.small', { 'aria-pressed': String(!!s.tick), onclick: (e) => {
        const on = !store.get('settings', {}).tick;
        store.update('settings', (x) => ({ ...x, tick: on }));
        e.currentTarget.setAttribute('aria-pressed', String(on));
        e.currentTarget.textContent = (on ? '🔔 ' : '🔕 ') + (on ? t('focus.tickOn') : t('focus.tickOff'));
      } }, s.tick ? '🔔 ' : '🔕 ', s.tick ? t('focus.tickOn') : t('focus.tickOff')),
      today ? h('span.badge.leaf', t('focus.today', { n: today })) : null);
  };

  render();
  return h('div.stack-lg',
    h('a.btn.ghost.small', { href: '#/do', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('nav.do')),
    h('h1.sr-only', t('do.focus')),
    root);
}

function ring(progress, ...inner) {
  return h('div.ring',
    svg(`<svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="${R}" class="ring-track"/><circle cx="110" cy="110" r="${R}" class="ring-arc" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - progress)}"/></svg>`),
    h('div.ring-inner', inner));
}
