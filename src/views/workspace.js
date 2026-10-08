// The workspace shell: a quiet header, then the technique's own tools.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { index } from '../core/content.js';
import { WORKSPACES, byId } from '../workspaces/registry.js';
import { makeApi } from '../workspaces/api.js';
import { icon } from '../ui/art.js';

async function titleOf(ws) {
  const idx = await index();
  for (const s of idx.sections) {
    const it = s.items.find((i) => i.id === ws.items[0]);
    if (it) return it;
  }
  return null;
}

export async function workspaces() {
  const idx = await index();
  const title = (ws) => { for (const s of idx.sections) { const it = s.items.find((i) => i.id === ws.items[0]); if (it) return it.title; } return ws.id; };
  return h('div.stack-lg',
    h('a.btn.ghost.small', { href: '#/do', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('nav.do')),
    h('div', h('h1', t('ws.title')), h('p.lede', { style: { marginTop: '8px' } }, t('ws.lede'))),
    h('div.cards.two', WORKSPACES.map((ws) => h('a.card.row-card', { href: `#/ws/${ws.id}` },
      h('span', ws.emoji), h('div', { style: { minWidth: '0' } }, h('h3', title(ws)), h('p.muted.small', t(`ws.${ws.id}.hint`)))))));
}

export async function workspace({ id }) {
  const ws = byId(id);
  if (!ws) return h('p.muted', t('error.notFound'));
  const it = await titleOf(ws);
  const body = h('div.ws-body');
  const view = h('div.stack-lg',
    h('a.btn.ghost.small', { href: '#/ws', style: { marginLeft: '-12px', alignSelf: 'flex-start' } }, icon('back'), t('ws.title')),
    h('div.ws-head',
      h('span.ws-emoji', ws.emoji),
      h('div', { style: { minWidth: '0' } },
        h('h1', it?.title || id),
        h('p.muted', { style: { margin: '4px 0 0' } }, t(`ws.${ws.id}.hint`), ' ',
          it ? h('a', { href: `#/learn/method/${it.id}` }, t('ws.readAbout')) : null))),
    body);
  const mod = await ws.load();
  await mod.default(body, makeApi(ws));
  return view;
}
