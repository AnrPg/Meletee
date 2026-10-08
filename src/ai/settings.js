// Settings section for the AI tutors: the learner's own Claude and Gemini keys (device
// only), the model each one uses, and who answers first.
import { h, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { getKey, setKey, forgetKey, remembered, looksLike } from './keys.js';
import { aiPrefs, setAiPrefs } from './index.js';
import { claudeModels, DEFAULT_CLAUDE } from './claude.js';
import { geminiModels, DEFAULT_GEMINI } from './gemini.js';

const INFO = {
  claude: { name: 'Claude', emoji: '🟣', defaultModel: DEFAULT_CLAUDE, list: claudeModels, pref: 'claudeModel', listPref: 'claudeModels', where: 'https://platform.claude.com/settings/keys' },
  gemini: { name: 'Gemini', emoji: '🔷', defaultModel: DEFAULT_GEMINI, list: geminiModels, pref: 'geminiModel', listPref: 'geminiModels', where: 'https://aistudio.google.com/apikey' },
};

function providerBlock(p) {
  const info = INFO[p];
  const has = () => !!getKey(p);
  const chip = h('span.badge.ai-state');
  const paint = () => {
    chip.textContent = has() ? t('ai.set.on') : t('ai.set.off');
    chip.classList.toggle('leaf', has());
    forget.hidden = !has();
    test.hidden = !has();
  };
  const input = h('input.field', { id: `ai-key-${p}`, type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: has() ? '••••••••' : t(`ai.set.${p}Ph`) });
  const remember = h('input', { type: 'checkbox', id: `ai-remember-${p}`, checked: has() ? remembered(p) : true });
  const status = h('p.muted.small', { role: 'status' });
  const models = () => {
    const prefs = aiPrefs();
    const list = [...new Set([prefs[info.pref] || info.defaultModel, info.defaultModel, ...(prefs[info.listPref] || [])])];
    return list.map((m) => h('option', { value: m, selected: m === (prefs[info.pref] || info.defaultModel) }, m));
  };
  const select = h('select.field', { id: `ai-model-${p}`, onchange: () => { setAiPrefs({ [info.pref]: select.value }); toast(t('settings.saved')); } }, models());

  const check = async () => {
    status.textContent = t('ai.set.testing');
    try {
      const list = await info.list(getKey(p));
      if (list.length) setAiPrefs({ [info.listPref]: list.slice(0, 40) });
      select.replaceChildren(...models());
      status.textContent = t('ai.set.works');
      return true;
    } catch (e) {
      status.textContent = e.kind === 'auth' ? t('ai.err.auth') : e.kind === 'network' ? t('ai.err.network') : t('ai.set.testFailed');
      return false;
    }
  };
  const save = h('button.btn.small', { type: 'submit' }, t('common.save'));
  const test = h('button.btn.soft.small', { type: 'button', onclick: check }, t('ai.set.test'));
  const forget = h('button.btn.ghost.small', { type: 'button', onclick: () => { forgetKey(p); input.value = ''; input.placeholder = t(`ai.set.${p}Ph`); status.textContent = t('ai.set.forgotten'); paint(); } }, t('ai.set.forget'));
  remember.addEventListener('change', () => { if (has()) { setKey(p, getKey(p), remember.checked); toast(t('settings.saved')); } });

  const form = h('form.stack.ai-key-form', { onsubmit: (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    setKey(p, v, remember.checked);
    input.value = '';
    input.placeholder = '••••••••';
    status.textContent = looksLike[p](v) ? t('ai.set.saved') : t('ai.set.oddKey');
    paint();
  } },
  h('div.field-row', h('label', { for: `ai-key-${p}` }, t('ai.set.key', { name: info.name })), input),
  h('label.check', { for: `ai-remember-${p}` }, remember, h('span', t('ai.set.remember'))),
  h('div.row', save, test, forget),
  status,
  h('div.field-row', h('label', { for: `ai-model-${p}` }, t('ai.set.model')), select),
  h('p.muted.small', h('a', { href: info.where, target: '_blank', rel: 'noopener' }, t('ai.set.getKey', { name: info.name }), ' ↗')));

  paint();
  return h('details.card.ai-provider',
    h('summary.row', h('span', { 'aria-hidden': 'true' }, info.emoji), h('strong', info.name), h('span.muted.small.ai-role', t(`ai.set.${p}Role`)), chip),
    form);
}

export function aiSettings() {
  const prefs = aiPrefs();
  const prefer = h('select.field', { id: 'ai-prefer', onchange: () => { setAiPrefs({ prefer: prefer.value }); toast(t('settings.saved')); } },
    ['auto', 'claude', 'gemini'].map((v) => h('option', { value: v, selected: prefs.prefer === v }, t(`ai.set.prefer.${v}`))));
  return h('section.stack.ai-settings',
    h('div', h('h2', '✨ ', t('ai.set.title')), h('p.muted.small', t('ai.set.lede'))),
    providerBlock('claude'),
    providerBlock('gemini'),
    h('details.ai-more',
      h('summary', t('ai.set.more')),
      h('div.field-row', h('label', { for: 'ai-prefer' }, t('ai.set.prefer')), prefer)),
    h('p.muted.small.ai-device', '🔒 ', t('ai.set.device')));
}
