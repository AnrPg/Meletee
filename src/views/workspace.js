// The toolshed (#/ws): every tool of the app, either grouped into a toolshed per technique
// (tap one and a side panel shows its tools) or all in one flat list with a search.
// Then the workspace shell (#/ws/<id>[/<tab>]): a quiet header, then the technique's own tools.
import { h, sheet } from '../core/dom.js';
import { t, tn, lang } from '../core/i18n.js';
import { index } from '../core/content.js';
import * as store from '../core/store.js';
import { byId } from '../workspaces/registry.js';
import { TOOLS, SHEDS, tool, shed, toolHref, cameFrom } from '../workspaces/tools.js';
import { makeApi } from '../workspaces/api.js';
import { icon } from '../ui/art.js';
import { hasAI } from '../ai/index.js';

const VIEW_KEY = 'ws:view';
const view = () => (store.get(VIEW_KEY, 'sheds') === 'flat' ? 'flat' : 'sheds');

// Where each technique lives in the compendium: its title, short lead and section.
async function items() {
  const idx = await index();
  const map = new Map();
  for (const s of idx.sections) for (const it of s.items) map.set(it.id, { ...it, section: s });
  return { idx, map };
}

// One tool as a card: a link, or a button for tools that open in place (the parking lot).
function toolCard(x, { onOpen } = {}) {
  const body = [h('span', { 'aria-hidden': 'true' }, x.emoji),
    h('div', { style: { minWidth: '0' } }, h('h3', t(`tools.${x.id}.name`)), h('p.muted.small', t(`tools.${x.id}.hint`)))];
  const href = toolHref(x);
  return href
    ? h('a.card.row-card.tool-card', { href, 'data-tool': x.id, onclick: () => onOpen?.(x) }, body)
    : h('button.card.row-card.tool-card', { type: 'button', 'data-tool': x.id, onclick: () => { onOpen?.(x); x.action(); } }, body);
}

// The side panel of one toolshed. Its address (#/ws/shed/<technique>) replaces #/ws while it
// is open, so Back from a tool comes back to the open panel.
function openShed(s, it) {
  cameFrom(s.id);
  const here = `#/ws/shed/${s.id}`;
  if (location.hash !== here) history.replaceState(null, '', here);
  let close = null;
  let going = false; // leaving through one of the panel's links: keep the address for Back
  const onHash = () => { cameFrom(null); close?.(); };
  const follow = () => { going = true; close(); };
  const panel = h('div.stack.shed-panel',
    h('div.row.shed-head', { style: { justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' } },
      h('div', { style: { minWidth: '0' } },
        h('p.eyebrow', it.section.title),
        h('h2', { style: { margin: 0 } }, it.title)),
      h('button.btn.ghost.small', { type: 'button', 'aria-label': t('tools.close'), onclick: () => close() }, '✕')),
    it.lead ? h('p.muted', it.lead) : null,
    h('div.stack', s.tools.map((id) => toolCard(tool(id), { onOpen: (x) => { if (toolHref(x)) follow(); else close(); cameFrom(s.id); } }))),
    h('a.btn.ghost.small', { href: `#/learn/method/${s.id}`, style: { alignSelf: 'flex-start' }, onclick: follow }, '📖 ', t('tools.readAbout')));
  close = sheet(panel, { label: it.title, side: true, onClose: () => {
    window.removeEventListener('hashchange', onHash);
    if (!going && location.hash === here) { cameFrom(null); history.replaceState(null, '', '#/ws'); }
  } });
  window.addEventListener('hashchange', onHash);
}

function shedsView(idx, map) {
  const bySection = new Map();
  for (const s of SHEDS) {
    const it = map.get(s.id);
    if (!it) continue;
    if (!bySection.has(it.section.id)) bySection.set(it.section.id, []);
    bySection.get(it.section.id).push({ s, it });
  }
  const groups = idx.sections.filter((sec) => bySection.has(sec.id));
  const first = groups.find((g) => g.kind === 'techniques') || groups[0];
  return h('div.stack.shed-groups', groups.map((g) => {
    const list = bySection.get(g.id);
    return h('details.shed-group', { open: g === first },
      h('summary', h('span', g.title), h('span.muted.small', String(list.length))),
      h('div.shed-list', list.map(({ s, it }) => h('button.shed-row', { type: 'button', 'data-shed': s.id, onclick: () => openShed(s, it) },
        h('span.shed-emoji', { 'aria-hidden': 'true' }, tool(s.tools[0]).emoji),
        h('span.shed-name', it.title),
        h('span.muted.small', tn('tools.count', s.tools.length))))));
  }));
}

function flatView() {
  const coll = new Intl.Collator(lang());
  const all = [...TOOLS].sort((a, b) => coll.compare(t(`tools.${a.id}.name`), t(`tools.${b.id}.name`)));
  const cards = all.map((x) => ({ x, el: toolCard(x, { onOpen: () => cameFrom(null) }), text: `${t(`tools.${x.id}.name`)} ${t(`tools.${x.id}.hint`)}`.toLocaleLowerCase() }));
  const none = h('p.muted', { hidden: true }, t('tools.noMatch'));
  const search = h('input.field.quiet', { type: 'search', placeholder: t('tools.search'), 'aria-label': t('tools.search'), autocomplete: 'off',
    oninput: () => {
      const q = search.value.trim().toLocaleLowerCase();
      let shown = 0;
      for (const c of cards) { c.el.hidden = !!q && !c.text.includes(q); if (!c.el.hidden) shown++; }
      none.hidden = shown > 0;
    } });
  return h('div.stack', search, h('div.cards.two', cards.map((c) => c.el)), none);
}

export async function workspaces({ id } = {}) {
  const { idx, map } = await items();
  const body = h('div');
  let mode = view();
  const seg = h('div.seg', { role: 'group', 'aria-label': t('tools.view') });
  const draw = () => {
    seg.replaceChildren(...[['sheds', t('tools.bySheds')], ['flat', t('tools.flat')]].map(([k, label]) => h('button', {
      type: 'button', 'aria-pressed': String(mode === k), 'data-view': k,
      onclick: () => { mode = k; store.set(VIEW_KEY, k); draw(); },
    }, label)));
    body.replaceChildren(mode === 'flat' ? flatView() : shedsView(idx, map));
  };
  draw();
  const out = h('div.stack-lg',
    h('a.btn.ghost.small', { href: '#/do', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('nav.do')),
    h('div', h('h1', t('ws.title')), h('p.lede', { style: { marginTop: '8px' } }, t('ws.lede'))),
    h('div', seg),
    hasAI() ? null : h('a.ai-key-hint', { href: '#/settings' }, t('ai.keyHint')),
    body);
  // #/ws/shed/<technique>: the list with that toolshed's panel open (from Learn, or Back from a tool)
  const s = id && shed(id);
  if (s && map.get(s.id)) {
    if (mode !== 'sheds') { mode = 'sheds'; draw(); }
    setTimeout(() => openShed(s, map.get(s.id)));
  } else cameFrom(null);
  return out;
}

export async function workspace({ id, tab }) {
  const ws = byId(id);
  if (!ws) return h('p.muted', t('error.notFound'));
  const { map } = await items();
  const it = map.get(ws.items[0]);
  const api = makeApi(ws);
  if (tab && ws.tab) ws.tab(api, tab);
  const from = cameFrom();
  const back = from ? `#/ws/shed/${from}` : '#/ws';
  const backLabel = from && map.get(from) ? map.get(from).title : t('ws.title');
  const x = tab ? TOOLS.find((y) => y.ws === id && y.tab === tab) : null;
  const body = h('div.ws-body');
  const out = h('div.stack-lg',
    h('a.btn.ghost.small', { href: back, style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), backLabel),
    h('div.ws-head',
      h('span.ws-emoji', x?.emoji || ws.emoji),
      h('div', { style: { minWidth: '0' } },
        h('h1', x ? t(`tools.${x.id}.name`) : it?.title || id),
        h('p.muted', { style: { margin: '4px 0 0' } }, x ? t(`tools.${x.id}.hint`) : t(`ws.${ws.id}.hint`), ' ',
          it ? h('a', { href: `#/learn/method/${it.id}` }, t('ws.readAbout')) : null))),
    body);
  const mod = await ws.load();
  await mod.default(body, api);
  return out;
}
