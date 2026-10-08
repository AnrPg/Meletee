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
| Daily and manual restore points | `meletee_snapshots` | the newest 30 daily ones are kept, at most 20 manual ones, ≤ 5 MB each and 50 MB in all per person (enforced by the database); restore in Settings → Cloud sync → Restore points |
| AI conversations (`meta.app = 'meletee'`) | noema-lite's `noema_conversations` | same row shape as noema-lite, so they appear there too |
| AI keys | only this browser (`meletee-device:*` keys) | never synced, never in restore points |
| noema-lite progress | read from `noema_kv` (`s:*:state`, `a:packmeta:*`, `a:subjoverride:*`, `a:caps`) | never `a:settings`; never written, except new inbox rows (docs/NOEMA.md) |

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
