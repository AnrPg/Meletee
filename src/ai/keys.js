// The learner's own API keys: on THIS device only. They live outside the synced
// "meletee1:" prefix, so they are never in a backup file and never reach the cloud.
//   meletee-device:anthropicKey:<account>   meletee-device:geminiKey:<account>
// "Remember on this device" keeps a key in localStorage; otherwise it lasts for this tab
// (sessionStorage), like noema-lite's Key.
const NAMES = { claude: 'anthropicKey', gemini: 'geminiKey' };
export const PROVIDERS = ['claude', 'gemini'];

function account() {
  try { return localStorage.getItem('meletee1:current') || 'local'; } catch { return 'local'; }
}

export const keyName = (provider, acc = account()) => `meletee-device:${NAMES[provider]}:${acc}`;

export function getKey(provider) {
  const k = keyName(provider);
  try { return sessionStorage.getItem(k) || localStorage.getItem(k) || ''; } catch { return ''; }
}

export function setKey(provider, value, remember = true) {
  forgetKey(provider);
  const v = String(value || '').trim();
  if (!v) return;
  try { (remember ? localStorage : sessionStorage).setItem(keyName(provider), v); } catch { /* storage blocked */ }
}

export function remembered(provider) {
  try { return !!localStorage.getItem(keyName(provider)); } catch { return false; }
}

export function forgetKey(provider) {
  try { localStorage.removeItem(keyName(provider)); sessionStorage.removeItem(keyName(provider)); } catch { /* ignore */ }
}

export function available() {
  return { claude: !!getKey('claude'), gemini: !!getKey('gemini') };
}

export const looksLike = {
  claude: (k) => /^sk-ant-[A-Za-z0-9_-]{10,}$/.test(String(k || '').trim()),
  gemini: (k) => /^[A-Za-z0-9_-]{20,}$/.test(String(k || '').trim()),
};

// Small device-only flags (e.g. "this key does not take the fallback beta header").
export const deviceFlag = {
  get(name) { try { return localStorage.getItem(`meletee-device:${name}`); } catch { return null; } },
  set(name, v) { try { localStorage.setItem(`meletee-device:${name}`, v); } catch { /* ignore */ } },
};
