# Cloud setup (one time, about 5 minutes)

Meletee uses the **same Supabase project as noema-lite**, so one account works in both apps.
An account is required (`requireAccount: true` in `config.js`): signed out, Meletee shows only its welcome
screen (create an account, or sign in with a noema-lite account) and the privacy page. Once signed in it
works offline with the cached session and syncs when it is back online; only a refresh token the server
rejects asks for a new sign-in, and the learner's data stays on the device meanwhile.

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

Authentication settings are shared with noema-lite:

- **Authentication → Sign In / Providers → Email**: *Enable Email provider* and *Allow new users to sign up*
  must be on (the welcome screen creates accounts). With **Confirm email** on, a new account confirms its
  e-mail first: the welcome screen says so and signs in once the link is used; with it off, a new account
  goes straight in. Either works; this is shared with noema-lite.
- **Authentication → URL Configuration → Redirect URLs**: add `https://meletee.netlify.app/**` (and any other
  address Meletee is served from, e.g. a Netlify preview pattern). Meletee asks for its own address in the
  confirmation and password-reset e-mails; the welcome screen then signs in from the link and, after a reset,
  asks for the new password. Without this entry Supabase sends people to the **Site URL** (noema-lite's),
  which also works, since it is the same account.
- **Authentication → Emails** (optional): the templates are shared with noema-lite, so keep their wording
  app-neutral (e.g. "your noema-lite / Meletee account").

## What is stored where

| Data | Where | Notes |
|---|---|---|
| Meletee's own data: every `a:<name>` key (list below) | `meletee_kv`, one row per key | pushed ~3 s after a change (at most 10 s), on hide and when back online; pulled on sign-in (before the app opens on a new device), on focus and when the tab is shown. A key changed on one device: the newer copy wins. Changed on two devices before they synced: merged entry by entry (by `id`, or by content for entries without one), so appended logs never lose entries. Values over ~900 KB go up in parts (`a:<name>#1…n`). |
| Daily and manual restore points | `meletee_snapshots` | the newest 30 daily ones are kept, at most 20 manual ones, ≤ 5 MB each and 50 MB in all per person (enforced by the database); restore in Settings → Cloud sync → Restore points |
| AI conversations (`meta.app = 'meletee'`) | noema-lite's `noema_conversations` | same row shape as noema-lite, so they appear there too |
| AI keys | only this browser (`meletee-device:*` keys) | never synced, never in restore points |
| Running focus timer (`a:timer`), caches (`cache:noema` subject list, `a:cache.*`), sync bookkeeping (`meta:*`), the session (`meletee1:cloud:session`) | only this browser | device-only by design: a timer runs on one device (the finished session is synced), the rest can be rebuilt |
| Results waiting for noema-lite's inbox (`cache:noemaOutbox`) | only this browser until delivered | a delivery queue; what was studied is also in the synced courses |
| noema-lite progress | read from `noema_kv` (`s:*:state`, `a:packmeta:*`, `a:subjoverride:*`, `a:caps`) | never `a:settings`; never written, except new inbox rows (docs/NOEMA.md) |

### What syncs

Everything that is the learner's progress, logs or history (all under `meletee1:u_<user id>:a:`):

- courses and topics with their review stages (`courses`), focus sessions (`sessions`), recall prompts
  (`recalls`), today's top three (`today`), the week plan (`blocks`), the parking lot (`parking`), the method
  found (`method`), profile, settings and UI choices (`profile`, `settings`, `ui`, `ai` without keys);
- every workspace's data (`ws:<workspace>:<key>`): cards and their schedule, error logs, notes, Feynman
  versions, sketches (as strokes) and the rest;
- Grow: Method Lab experiments and ratings (`grow:lab`), done list and wins (`grow:wins`), reflections
  (`grow:reflect`), "my why" (`grow:why`), calm-corner counts (`grow:calm`), the activity log by day
  (`grow:days`), the garden (`grow:garden`), and the minutes already sent to buddies (`buddies:logged`);
- AI conversations (IndexedDB `meletee-convos`) → `noema_conversations`, per conversation (newer copy wins).

Buddies' cards, invites, goals and contributions live in the `meletee_buddy_*` tables already.

Study kept on a device before accounts (the `local` profile) moves into the account at the first sign-in
and is merged with what the account already has; then the local copy is removed (only the language and
theme stay, for the welcome screen). Another account's data is never copied.

## Buddies (phase 7)

The buddy tables, functions and Realtime policies live in the marked phase 7 section at the end of
`cloud/supabase.sql`; running the whole file (step 1) sets them up. The last result then also lists the eleven
`meletee_buddy_*` tables with `rls_enabled = true` (two of them, `meletee_buddy_code_tries` and
`meletee_buddy_invite_seen`, have no policies at all: only the functions use them).

- **Who sees what.** Each person sees only their own rows. Everything between people goes through
  `SECURITY DEFINER` functions (`meletee_buddy_*`, called as `POST /rest/v1/rpc/<name>`) that check `auth.uid()`:
  buddies' cards are masked to what each person ticked (by default only the forgiving streak), goal numbers are
  shown only to the members of that goal (before joining you see who is in it among your buddies, without
  numbers), and blocked people see nothing, including each other in a mutual buddy's focus room.
  **By design**, a weekly challenge is a public board among people who opted in to challenges: an opted-in buddy
  who has not joined a challenge can see the numbers of its members who are their buddies.
- **Finding buddies.** Only by a single-use invite code (14 days). There is no directory and no e-mail lookup.
  Codes are made by the server (`meletee_buddy_invite_create`: 10 characters, 31^10 ≈ 8·10^14 possible codes,
  at most 20 open invites per person); people can read and delete their own invites but never insert or change
  them. Each account may try at most 30 codes an hour (preview, accept and decline together), and only someone
  who has opened an invite can decline it.
- **Cheers and nudges.** Preset message keys only (no free text), at most 6 per hour to the same buddy.
- **Numbers.** Weekly minutes, sessions and reviews are computed by the app from its own study data and written
  by each person for themselves only (`meletee_buddy_contributions`).
- **Focus rooms** use Supabase Realtime (presence and broadcast) on private channels `meletee-room:<room id>`.
  Realtime is on by default in Supabase projects; check **Project Settings → Realtime** is enabled. No table
  needs to be added to the `supabase_realtime` publication. The SQL adds two policies on `realtime.messages`
  so only people who may see a room can listen or send. Without a working socket the app polls every few
  seconds instead, so rooms still work.
- **Required: turn off public Realtime channels.** In the Supabase dashboard, open **Realtime → Settings** and turn
  off **Allow public access**, so that only private (policy-checked) channels can be joined. Otherwise a client
  that joins `meletee-room:<id>` with `private: false` (for example an ex-buddy who still knows a room's id) is
  not checked against the policies above. noema-lite does not use Realtime, so this does not affect it.
  To verify: with the setting off, joining any channel with `private: false` is refused.
- **Shared timer.** `meletee_buddy_room_timer` accepts only well-formed timers (1-120 minute blocks, a 0-60
  minute break, started about now, `v` not in the future) and stores a rebuilt copy; the app checks every timer
  it receives the same way and logs only the minutes the person was actually in the room.
