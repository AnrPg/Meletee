# Cloud setup (one time, about 5 minutes)

Meletee uses the **same Supabase project as noema-lite**, so one account works in both apps.
Signing in is optional: signed out, Meletee keeps everything on the device.

## 1. Create Meletee's tables

1. Supabase dashboard → **SQL Editor** → *New query*.
2. Paste the whole of `cloud/supabase.sql` → **Run**.
3. The last result lists `meletee_kv` and `meletee_snapshots` with `rls_enabled = true`.

The script is idempotent: run it again whenever the file changes. It creates only `meletee_*` objects and
never changes noema-lite's `noema_*` tables. noema-lite's own `cloud/supabase.sql` must already have been run
(Meletee reads `noema_kv` and writes to `noema_conversations`).

## 2. Configuration

`config.js` holds the project URL and the **publishable** key (`sb_publishable_…`). Both are public by design:
every table is protected by row-level security. Never put the secret key or the database password anywhere
in this repository.

Authentication settings are shared with noema-lite (Authentication → Sign In / Providers → Email). If
"Confirm email" is on, new accounts confirm their e-mail before the first sign-in.
Add Meletee's address to **Authentication → URL Configuration → Redirect URLs** so password-reset e-mails can
link back to it.

## What is stored where

| Data | Where | Notes |
|---|---|---|
| Meletee's own data (courses, sessions, plans, settings…) | `meletee_kv`, one row per `a:<name>` key | last write wins per key, pushed ~3 s after a change, pulled on sign-in and when the tab gets focus |
| Daily and manual restore points | `meletee_snapshots` | the newest 30 daily ones are kept; restore in Settings → Cloud sync → Restore points |
| AI conversations (`meta.app = 'meletee'`) | noema-lite's `noema_conversations` | same row shape as noema-lite, so they appear there too |
| AI keys | only this browser (`meletee-device:*` keys) | never synced, never in restore points |
| noema-lite progress | read from `noema_kv` (`s:*:state`, `a:packmeta:*`, `a:subjoverride:*`, `a:caps`) | never `a:settings`; never written, except new inbox rows (docs/NOEMA.md) |

## Phase 7

Buddies (shared rooms, invites) add their tables at the marked section at the end of `cloud/supabase.sql`.
They need Supabase Realtime enabled on the project.
