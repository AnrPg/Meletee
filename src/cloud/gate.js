// The account gate (config.js requireAccount, on by default): small and loaded with the first screen.
//   needsAccount()  true while nobody is signed in, so main.js shows the welcome screen instead of the app.
//                   A cached session counts as signed in, even when it has expired: offline, the learner keeps
//                   using their data and the app syncs once it is back online. Only when the server rejects
//                   the refresh token (client.js emits 'meletee:signedout') is a new sign-in needed.
//   localStudy()    true when this device holds study from before accounts (the 'local' profile), which moves
//                   into the account at the first sign-in (sync.activate).
//   readLink()      the tokens or error that Supabase's e-mail links (confirm, reset password) put in the hash.
import { backend, config } from './client.js';

export const OPEN_ROUTES = ['/privacy'];

export function required() { return config().requireAccount !== false; }

export function needsAccount() {
  if (!required()) return false;
  const b = backend();
  return !!b && !b.session();
}

// What counts as study: any account data except the interface settings (language, theme) and UI state.
const NOT_STUDY = /^meletee1:local:a:(settings|ui)$/;
export function localStudy(storage = globalThis.localStorage) {
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('meletee1:local:a:') && !NOT_STUDY.test(k) && !k.startsWith('meletee1:local:a:cache.')) {
        const v = storage.getItem(k);
        if (v && v !== '[]' && v !== '{}' && v !== 'null') return true;
      }
    }
  } catch { /* storage blocked */ }
  return false;
}

// '#access_token=…&refresh_token=…&type=recovery' or '#error=…&error_description=…' (pure; unit-tested)
export function readLink(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  if (!/(^|&)(access_token|error|error_code)=/.test(raw)) return null;
  const p = Object.fromEntries(new URLSearchParams(raw));
  if (p.error || p.error_code) return { error: p.error_description || p.error_code || p.error, code: p.error_code || p.error };
  if (!p.access_token || !p.refresh_token) return null;
  return { access_token: p.access_token, refresh_token: p.refresh_token, expires_in: Number(p.expires_in) || 3600, expires_at: Number(p.expires_at) || 0, type: p.type || 'signup' };
}
