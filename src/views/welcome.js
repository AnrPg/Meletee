// The welcome screen: shown instead of the app while nobody is signed in (config.js requireAccount).
// Two doors into the same Supabase account: create one, or sign in with a noema-lite account (one account
// works in both apps). Also: forgot password, "confirm your e-mail first" sign-ups, the "bringing your study
// over…" state after signing in, and the new-password sheet opened from a reset link.
import { h, sheet, toast, announce } from '../core/dom.js';
import { t, LANGS, lang, setLang } from '../core/i18n.js';
import { companion } from '../ui/art.js';
import { backend } from '../cloud/client.js';
import { localStudy } from '../cloud/gate.js';

// Friendly words for the errors Supabase Auth sends back.
export function friendly(e) {
  const m = String(e?.message || e || '');
  if (e?.network || /network|failed to fetch/i.test(m)) return t('welcome.err.offline');
  if (/invalid login credentials|invalid grant/i.test(m)) return t('welcome.err.credentials');
  if (/not confirmed/i.test(m)) return t('welcome.err.unconfirmed');
  if (/already (been )?registered|already exists/i.test(m)) return t('welcome.err.exists');
  if (/at least|password should|weak/i.test(m)) return t('welcome.err.weak');
  if (/rate limit|too many|security purposes/i.test(m)) return t('welcome.err.slow');
  return t('cloud.failed', { msg: m });
}

// "Bringing your study over…": while the first sync of this account runs.
export function bringing() {
  return h('div.welcome.welcome-busy', { role: 'status', 'aria-live': 'polite' },
    companion({ mood: 'calm', leaves: 3, label: t('companion.label') }),
    h('h1', t('welcome.bringing')),
    h('p.lede', t('welcome.bringingText')),
    h('div.welcome-dots', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')));
}

let linkNote = '';
// A message to show once on the welcome screen (an expired e-mail link, a confirmed address…).
export function noteOnWelcome(text) { linkNote = text; }

export function welcome() {
  const b = backend();
  const root = h('div.welcome');
  let mode = 'start';
  let email = '';
  let note = linkNote; linkNote = '';

  const field = (id, label, attrs) => {
    const input = h('input.field', { id, name: id, ...attrs });
    return [h('label.field-row', { for: id }, label, input), input];
  };

  // Signed in: bring this device's study and the account's data together, then start the app.
  async function enter() {
    root.replaceChildren(bringing());
    try { await (await import('../cloud/settings.js')).afterSignIn(); } catch { /* the app syncs again after the reload */ }
    location.reload();
  }

  function form() {
    const up = mode === 'up';
    const msg = h('p.small.welcome-msg', { role: 'status', 'aria-live': 'polite' });
    const [nameRow, name] = field('welcome-name', t('cloud.name'), { type: 'text', autocomplete: 'nickname' });
    const [emailRow, mail] = field('welcome-email', t('cloud.email'), { type: 'email', autocomplete: 'email', required: true, value: email });
    const [pwRow, pw] = field('welcome-password', t('cloud.password'), { type: 'password', autocomplete: up ? 'new-password' : 'current-password', minlength: '8', required: true });
    mail.addEventListener('input', () => { email = mail.value.trim(); });
    const submit = h('button.btn', { type: 'submit' }, up ? t('welcome.create') : t('cloud.signIn'));
    const f = h('form.stack.welcome-form', { novalidate: true },
      up ? nameRow : null, emailRow, pwRow, msg, submit);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      email = mail.value.trim();
      // our own checks (novalidate): the browser's bubbles would speak the browser's language, not the app's
      if (!email || !mail.checkValidity()) { msg.textContent = t('cloud.needEmail'); mail.focus(); return; }
      if (pw.value.length < 8) { msg.textContent = t('welcome.err.weak'); pw.focus(); return; }
      submit.disabled = true; msg.textContent = '…';
      try {
        if (up) {
          const r = await b.signUp(email, pw.value, name.value.trim());
          if (!r.session) { mode = 'confirm'; draw(true); return; }
        } else {
          await b.signIn(email, pw.value);
        }
      } catch (err) {
        msg.textContent = friendly(err);
        submit.disabled = false;
        return;
      }
      await enter();
    });
    const forgot = !up ? h('button.btn.ghost.small', { type: 'button', onclick: async () => {
      email = mail.value.trim();
      if (!email) { msg.textContent = t('cloud.needEmail'); mail.focus(); return; }
      try { await b.recover(email); msg.textContent = t('welcome.resetSent', { email }); }
      catch (e2) { msg.textContent = friendly(e2); }
    } }, t('cloud.forgot')) : null;
    const other = h('button.btn.ghost.small', { type: 'button', onclick: () => { mode = up ? 'in' : 'up'; draw(true); } },
      up ? t('welcome.haveOne') : t('cloud.toSignUp'));
    return { f, links: h('div.welcome-links', forgot, other) };
  }

  function langPicker() {
    const sel = h('select.field.welcome-lang', { id: 'welcome-lang', 'aria-label': t('settings.language'), onchange: async () => {
      await setLang(sel.value);
      (await import('../main.js')).rebuild();
    } }, LANGS.map((l) => h('option', { value: l.code, selected: l.code === lang() }, l.name)));
    return sel;
  }

  const back = () => h('button.btn.ghost.small.welcome-back', { type: 'button', onclick: () => { mode = 'start'; draw(true); } },
    h('span', { 'aria-hidden': 'true' }, '← '), t('welcome.back'));

  function draw(focus = false) {
    let heading;
    if (mode === 'start') {
      heading = h('h1', { tabindex: '-1' }, t('welcome.title'));
      root.replaceChildren(
        companion({ mood: 'happy', leaves: 2, label: t('companion.label') }),
        heading,
        h('p.lede', t('welcome.lede')),
        note ? h('p.welcome-note', { role: 'status' }, note) : null,
        localStudy() ? h('p.welcome-note.welcome-local', h('span', { 'aria-hidden': 'true' }, '🌱 '), t('welcome.localData')) : null,
        h('div.welcome-doors',
          h('button.btn', { type: 'button', onclick: () => { mode = 'up'; draw(true); } }, t('welcome.create')),
          h('button.btn.soft', { type: 'button', onclick: () => { mode = 'in'; draw(true); } },
            h('span', { 'aria-hidden': 'true' }, '🦉 '), t('welcome.withNoema'))),
        h('p.small.muted.welcome-one', t('welcome.oneAccount')),
        h('div.welcome-foot', langPicker(), h('a.small', { href: '#/privacy' }, t('welcome.privacy'))));
    } else if (mode === 'confirm') {
      heading = h('h1', { tabindex: '-1' }, '✉️ ', t('welcome.confirmTitle'));
      root.replaceChildren(
        heading,
        h('p.lede', t('welcome.confirmText', { email })),
        h('div.welcome-doors', h('button.btn', { type: 'button', onclick: () => { mode = 'in'; draw(true); } }, t('welcome.confirmed'))),
        back());
    } else {
      const { f, links } = form();
      heading = h('h1', { tabindex: '-1' }, mode === 'up' ? t('welcome.createTitle') : t('welcome.signInTitle'));
      root.replaceChildren(
        back(),
        heading,
        h('p.muted', mode === 'up' ? t('welcome.createLede') : t('welcome.signInLede')),
        f, links);
    }
    note = '';
    // Only after a click (never on a timer): the new panel's heading takes focus, so nothing typed is lost.
    if (focus) heading.focus({ preventScroll: true });
  }
  draw();
  return root;
}

// Opened after a password-reset link signed the learner in.
export function askNewPassword() {
  const b = backend();
  const pw = h('input.field', { id: 'new-password', type: 'password', autocomplete: 'new-password', minlength: '8', required: true });
  const msg = h('p.small', { role: 'status', 'aria-live': 'polite' });
  let close;
  const f = h('form.stack.welcome-form', { novalidate: true },
    h('h2', '🔑 ', t('welcome.newPassword')),
    h('label.field-row', { for: 'new-password' }, t('cloud.password'), pw),
    msg,
    h('button.btn', { type: 'submit' }, t('welcome.savePassword')));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pw.value.length < 8) { msg.textContent = t('welcome.err.weak'); return; }
    try { await b.setPassword(pw.value); close(); toast(t('welcome.passwordSaved')); }
    catch (err) { msg.textContent = friendly(err); }
  });
  close = sheet(f, { label: t('welcome.newPassword') });
  pw.focus();
  announce(t('welcome.newPassword'));
}
