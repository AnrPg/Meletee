// Goals together (cooperation: each of us does N; co-competition: all of us reach N together)
// and friendly challenges (opt-in competition with a light weekly board).
import { h, sheet, toast } from '../../core/dom.js';
import { t, tn } from '../../core/i18n.js';
import * as router from '../../core/router.js';
import * as data from '../../buddies/data.js';
import { METRICS, byWeek, daysLeft, sharedProgress, teamProgress, challengeBoard } from '../../buddies/logic.js';
import { back, avatar, progress, metricLabel } from './ui.js';

const DEFAULTS = { shared: { sessions: 5, minutes: 120, reviews: 30 }, team: { sessions: 20, minutes: 600, reviews: 100 } };

async function load() {
  await Promise.race([data.publish(), new Promise((r) => setTimeout(r, 2500))]);
  return data.overview({ fresh: true });
}

const weekNote = () => {
  const n = daysLeft();
  return n > 0 ? tn('buddies.week.left', n) : t('buddies.week.lastDay');
};

function seg(options, value, onPick, label) {
  const box = h('div.seg', { role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(v === value), 'data-v': v, onclick: (e) => {
      for (const b of box.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      onPick(v);
    } }, text)));
  return box;
}

function joinRow(g) {
  const btn = h(g.joined ? 'button.btn.ghost.small' : 'button.btn.soft.small', { onclick: async () => {
    btn.disabled = true;
    try {
      if (g.joined) await data.leaveGoal(g.id); else await data.joinGoal(g.id);
      toast(g.joined ? t('buddies.goals.left') : t('buddies.goals.joined'));
      router.refresh();
    } catch { btn.disabled = false; toast(t('buddies.failed')); }
  } }, g.joined ? t('buddies.goals.leave') : t('buddies.goals.join'));
  return h('div.row.bud-join', btn, g.joined ? null : h('span.muted.small', t('buddies.goals.joinNote', { what: t('buddies.metricWord.' + g.metric) })));
}

function goalCard(g) {
  const isTeam = g.kind === 'team';
  const title = isTeam ? t('buddies.goals.teamTitle', { what: metricLabel(g.metric, g.target) }) : t('buddies.goals.sharedTitle', { what: metricLabel(g.metric, g.target) });
  let bar, rows, done;
  if (isTeam) {
    const p = teamProgress(g.members, g.target);
    done = p.met;
    bar = progress(p.pct, title);
    rows = p.rows.map((m) => h('li.row.bud-member', avatar(m.emoji), h('span.bud-grow', m.name), h('span.muted.small', metricLabel(g.metric, m.value), m.value ? ` · ${t('buddies.goals.part', { n: m.part })}` : '')));
    rows.unshift(h('li.bud-total', h('strong', t('buddies.goals.teamTotal', { n: p.total, of: g.target })), p.met ? null : h('span.muted.small', ' · ', t('buddies.goals.toGo', { n: p.left }))));
  } else {
    const p = sharedProgress(g.members, g.target);
    done = p.allDone;
    bar = progress(p.combined, title);
    rows = p.rows.map((m) => h('li.row.bud-member', avatar(m.emoji), h('span.bud-grow', m.name), h('span.muted.small', `${m.value} / ${g.target}`, m.done ? ' ✓' : '')));
  }
  return h('article.card.stack.bud-goal', { 'data-kind': g.kind },
    h('div', h('h3', isTeam ? '🌍 ' : '🤝 ', title), h('p.muted.small', isTeam ? t('buddies.goals.teamHint') : t('buddies.goals.sharedHint'))),
    bar,
    done ? h('p.bud-yay', '🎉 ', t('buddies.goals.done')) : null,
    h('ul.plain.bud-members', rows),
    joinRow(g));
}

function lastWeek(goals, text) {
  if (!goals.length) return null;
  return h('section.stack.bud-last', h('h2', t('buddies.week.last')), h('ul.plain', goals.map((g) => h('li.muted.small', text(g)))));
}

function newGoalSheet() {
  let kind = 'shared', metric = 'sessions', close;
  const target = h('input.field', { id: 'bud-goal-target', type: 'number', min: '1', max: '100000', inputmode: 'numeric', value: String(DEFAULTS.shared.sessions) });
  const targetLabel = h('span', t('buddies.goals.targetShared'));
  const sync = () => { target.value = String(DEFAULTS[kind][metric]); targetLabel.textContent = t(kind === 'team' ? 'buddies.goals.targetTeam' : 'buddies.goals.targetShared'); };
  const form = h('form.stack',
    h('h2', t('buddies.goals.new')),
    seg([['shared', '🤝 ' + t('buddies.goals.kindShared')], ['team', '🌍 ' + t('buddies.goals.kindTeam')]], kind, (v) => { kind = v; sync(); }, t('buddies.goals.kind')),
    seg(METRICS.map((m) => [m, t('buddies.metricName.' + m)]), metric, (v) => { metric = v; sync(); }, t('buddies.goals.metric')),
    h('label.field-row', { for: 'bud-goal-target' }, targetLabel, target),
    h('div.row', { style: { justifyContent: 'flex-end' } },
      h('button.btn.ghost.small', { type: 'button', onclick: () => close() }, t('common.cancel')),
      h('button.btn.small', { type: 'submit' }, t('buddies.goals.create'))));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = Math.round(Number(target.value));
    if (!(n >= 1 && n <= 100000)) { target.focus(); return; }
    try { await data.createGoal({ kind, metric, target: n }); close(); toast(t('buddies.goals.created')); router.refresh(); } catch { toast(t('buddies.failed')); }
  });
  close = sheet(form, { label: t('buddies.goals.new') });
}

export async function goalsView() {
  const o = await load();
  const { now, last } = byWeek(o.goals.filter((g) => g.kind !== 'challenge'));
  return h('div.stack-lg',
    back(),
    h('header.stack', h('h1', t('buddies.goals.title')), h('p.lede', t('buddies.goals.lede')), h('p.muted.small', weekNote())),
    h('div.stack.center', h('button.btn', { onclick: newGoalSheet }, '✨ ', t('buddies.goals.new'))),
    now.length ? h('div.stack', now.map(goalCard)) : h('div.empty', h('p', '🌱'), h('p.muted', t('buddies.goals.none'))),
    lastWeek(last, (g) => {
      const total = g.members.reduce((n, m) => n + (m.value || 0), 0);
      if (g.kind === 'team') return total >= g.target ? t('buddies.week.teamMet', { what: metricLabel(g.metric, total) }) : t('buddies.week.teamTried', { what: metricLabel(g.metric, total) });
      return t('buddies.week.sharedDone', { n: sharedProgress(g.members, g.target).doneCount, of: g.members.length, what: metricLabel(g.metric, g.target) });
    }));
}

function challengeCard(g) {
  const b = challengeBoard(g.members);
  return h('article.card.stack.bud-goal.bud-challenge',
    h('div', h('h3', '🏆 ', t('buddies.ch.most', { what: t('buddies.metricWord.' + g.metric) })), h('p.muted.small', t('buddies.ch.together', { what: metricLabel(g.metric, b.total) }))),
    h('ol.plain.bud-board', b.rows.map((m) => h('li.row.bud-member', { 'data-top': String(!!m.top) },
      h('span.bud-crown', { 'aria-hidden': 'true' }, m.top ? '👑' : m.rank ? '✨' : '🌱'),
      avatar(m.emoji),
      h('span.bud-grow', m.name, m.top ? h('span.sr-only', ' · ', t('buddies.ch.leading')) : null),
      h('span.muted.small', m.rank ? metricLabel(g.metric, m.value) : t('buddies.ch.warming'))))),
    joinRow(g));
}

export async function challengesView(params, node, card) {
  const o = await load();
  const head = h('header.stack', h('h1', t('buddies.ch.title')), h('p.lede', t('buddies.ch.lede')));
  if (!o.compete) {
    const on = h('button.btn', { onclick: async () => {
      on.disabled = true;
      try { await data.saveCard({ ...card, compete: true }); data.invalidate(); router.refresh(); } catch { on.disabled = false; toast(t('buddies.failed')); }
    } }, '🏆 ', t('buddies.ch.optIn'));
    return h('div.stack-lg', back(), head,
      h('ul.plain.bud-rules', ['fresh', 'kind', 'optional'].map((k) => h('li', t('buddies.ch.rule.' + k)))),
      h('div.stack.center', on));
  }
  const { now, last } = byWeek(o.goals.filter((g) => g.kind === 'challenge'));
  const newCh = () => {
    let metric = 'sessions', close;
    const form = h('form.stack',
      h('h2', t('buddies.ch.new')),
      seg(METRICS.map((m) => [m, t('buddies.metricName.' + m)]), metric, (v) => { metric = v; }, t('buddies.goals.metric')),
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn.ghost.small', { type: 'button', onclick: () => close() }, t('common.cancel')),
        h('button.btn.small', { type: 'submit' }, t('buddies.ch.create'))));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await data.createGoal({ kind: 'challenge', metric }); close(); toast(t('buddies.ch.created')); router.refresh(); } catch { toast(t('buddies.failed')); }
    });
    close = sheet(form, { label: t('buddies.ch.new') });
  };
  return h('div.stack-lg', back(), head,
    h('p.muted.small', t('buddies.ch.resets'), ' · ', weekNote()),
    h('div.stack.center', h('button.btn', { onclick: newCh }, '✨ ', t('buddies.ch.new'))),
    now.length ? h('div.stack', now.map(challengeCard)) : h('div.empty', h('p', '🏁'), h('p.muted', t('buddies.ch.none'))),
    lastWeek(last, (g) => {
      const b = challengeBoard(g.members);
      return b.leaders ? t('buddies.ch.lastWeek', { names: b.rows.filter((m) => m.top).map((m) => m.name).join(', '), what: metricLabel(g.metric, b.total) }) : t('buddies.ch.lastQuiet');
    }),
    h('button.btn.ghost.small.bud-optout', { onclick: async () => {
      try { await data.saveCard({ ...card, compete: false }); data.invalidate(); toast(t('buddies.ch.optedOut')); router.go('/buddies'); } catch { toast(t('buddies.failed')); }
    } }, t('buddies.ch.optOut')));
}
