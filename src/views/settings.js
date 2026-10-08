import { h, toast } from '../core/dom.js';
import { t, LANGS, lang, setLang } from '../core/i18n.js';
import * as store from '../core/store.js';
import { applyTheme, rebuild } from '../main.js';
import { aiSettings } from '../ai/settings.js';
import { cloudSettings } from '../cloud/settings.js';

function seg(options, value, onPick) {
  const wrap = h('div.seg', { role: 'group' });
  for (const o of options) {
    wrap.append(h('button', {
      'aria-pressed': String(o.value === value),
      onclick: () => {
        for (const b of wrap.children) b.setAttribute('aria-pressed', 'false');
        wrap.children[options.indexOf(o)].setAttribute('aria-pressed', 'true');
        onPick(o.value);
      },
    }, o.label));
  }
  return wrap;
}

function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

export function settings() {
  const s = store.get('settings', {});
  const profile = store.get('profile', {});
  const nameInput = h('input', {
    type: 'text', value: profile.name || '', placeholder: t('settings.namePlaceholder'), 'aria-label': t('settings.name'),
    style: { border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', minWidth: '0', flex: '1' },
    onchange: (e) => { store.update('profile', (p) => ({ ...p, name: e.target.value.trim() })); toast(t('settings.saved')); },
  });
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const n = store.importBackup(JSON.parse(await f.text())); toast(t('settings.restored', { n })); setTimeout(() => location.reload(), 600); }
    catch { toast(t('settings.restoreFailed')); }
  } });
  return h('div.stack-lg',
    h('div', h('p.eyebrow', t('nav.settings')), h('h1', t('settings.title'))),
    h('div.list',
      h('label', h('span.label', t('settings.name')), nameInput),
      h('div', h('span.label', t('settings.language')),
        seg(LANGS.map((l) => ({ value: l.code, label: l.name })), lang(), async (code) => { await setLang(code); rebuild(); })),
      h('div', h('span.label', t('settings.theme')),
        seg([{ value: 'auto', label: t('settings.theme.auto') }, { value: 'light', label: t('settings.theme.light') }, { value: 'dark', label: t('settings.theme.dark') }],
          s.theme || 'auto', (v) => { store.update('settings', (x) => ({ ...x, theme: v })); applyTheme(v); }))),
    cloudSettings(),
    aiSettings(),
    h('div.stack',
      h('h2', t('settings.data')),
      h('p.muted', t('settings.dataText')),
      h('div.row',
        h('button.btn.soft.small', { onclick: () => download(`meletee-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.exportBackup(), null, 2)) }, t('settings.export')),
        h('button.btn.ghost.small', { onclick: () => file.click() }, t('settings.import')), file)),
    h('p.muted.small', t('settings.about')));
}
