# Meletee 1.0 review: security, privacy and translations

Reviewed on 2026-10-08 against the working tree (no git history was used). Part 1 lists findings only; no
application code was changed. Part 2's fixes were made directly in `i18n/`.

---

## Part 1: security and privacy

### Summary

| # | Severity | Finding | Where | Status |
|---|---|---|---|---|
| 1 | Medium | Remote JavaScript from `noemaUrl` runs inside Meletee (script fallback); no CSP | `src/noema/source.js:22-31, 47, 95`; `netlify.toml` | Fixed in code; `netlify.toml` additions in docs/SECURITY-HEADERS.md |
| 2 | Medium | A buddy controls the shared room timer: they can write any number of minutes into every member's study log, and lock the room for good | `src/buddies/room.js:25, 47`; `src/views/buddies/room.js:56-61, 131-134`; `cloud/supabase.sql:351-359` | Fixed |
| 3 | Medium | Goal numbers leak to people who are not members of the goal | `cloud/supabase.sql:423-440` | Fixed |
| 4 | Low | Invite codes: no attempt limit, owners can make their invites reusable and never-expiring, no cap on how many invites a person creates | `cloud/supabase.sql:213, 231-268`; `src/buddies/logic.js:116` | Fixed |
| 5 | Low | Blocking someone does not hide you in a room you both visit | `cloud/supabase.sql:321-331, 441-447` | Fixed |
| 6 | Low | Realtime private channels depend on a project setting that the docs do not mention | `cloud/README.md`; `src/buddies/realtime.js:56` | Documented; dashboard step for the owner |
| 7 | Low | `importBackup()` accepts any key; the Gemini model id goes into the URL path unchecked | `src/core/store.js:82-87`; `src/ai/gemini.js:31`; `src/ai/index.js:18` | Fixed |
| 8 | Low | No size caps on `meletee_kv.value` or snapshots, and manual snapshots have no count limit | `cloud/supabase.sql:13-30` | Fixed |

Checked and found sound (details at the end): every HTML sink, the AI keys, RLS on all eleven tables,
`SECURITY DEFINER` hygiene, noema-lite's tables, `postMessage`/`eval`, deep links and prototype pollution.

---

### 1. Medium: remote JavaScript runs in Meletee's origin through the `<script>` fallback

**Status: fixed.** `script()` is gone; the library is fetched as data only, via the same-origin `/noema-library/*` proxy first, then `<noemaUrl>/library` directly. The proxy redirect and CSP/security headers for `netlify.toml` are written in `docs/SECURITY-HEADERS.md` (to be applied by the owner of `netlify.toml`).

**Where.** `src/noema/source.js:22-31` (`script()`), line 47 (`registry.js`) and line 95 (`pack.js`). There is
no Content-Security-Policy, either in `index.html` or in `netlify.toml`.

**Why it matters.** noema-lite does not send CORS headers yet (docs/NOEMA.md change 0), so today every
library load takes the fallback. `registry.js` and `pack.js` run as classic scripts with Meletee's full
privileges. They can read:
- `meletee-device:anthropicKey:*` and `meletee-device:geminiKey:*` (the learner's paid API keys);
- `meletee1:cloud:session` (a Supabase access and **refresh** token, which also unlocks the person's noema-lite data);

and they can then send all of it anywhere.

**Exploit path.** Someone who can change what `noema-lite.netlify.app/library/` serves gets code execution in
every Meletee tab that opens `#/noema` or `#/noema/<id>`. That includes a leaked Netlify deploy token, a
compromised CI step or dependency in noema-lite's build, or a malicious pull request to the library content
that `tools/build.py` turns into `pack.js`. Nobody needs to touch Meletee itself. The same compromise in
noema-lite alone would not reach Meletee's AI keys. The fallback is what joins the two blast radii.

**Fix.** Never execute library files: read them as data only. Until change 0 ships, proxy the library through
Meletee's own origin so no CORS is needed. Add a CSP so that a regression cannot silently bring script
loading back.

```diff
--- a/netlify.toml
+++ b/netlify.toml
@@
 [[headers]]
   for = "/sw.js"
   [headers.values]
     Cache-Control = "no-cache"
+
+# noema-lite's public library, same-origin, read as data (no CORS needed, nothing is executed)
+[[redirects]]
+  from = "/noema-library/*"
+  to = "https://noema-lite.netlify.app/library/:splat"
+  status = 200
+  force = true
+
+[[headers]]
+  for = "/*"
+  [headers.values]
+    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com https://awlvbxlpvjkhkreumfln.supabase.co wss://awlvbxlpvjkhkreumfln.supabase.co https://noema-lite.netlify.app; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
+    Referrer-Policy = "strict-origin-when-cross-origin"
+    X-Content-Type-Options = "nosniff"
```

(`'unsafe-inline'` for styles is needed because `src/grow/garden.js:29,49` writes `style="--d:…"` into SVG markup.)

```diff
--- a/src/noema/source.js
+++ b/src/noema/source.js
@@
-function script(src) {
-  return new Promise((res, rej) => {
-    const s = document.createElement('script');
-    s.src = src; s.async = true;
-    s.onload = () => { s.remove(); res(); };
-    s.onerror = () => { s.remove(); rej(new Error('load ' + src)); };
-    document.head.append(s);
-  });
-}
+// The public library is only ever read as data. Same-origin through the Netlify proxy
+// (netlify.toml /noema-library/*) until noema-lite sends CORS headers; then config.noemaLibrary
+// can point straight at <noemaUrl>/library.
+const library = () => (window.MELETEE_CONFIG?.noemaLibrary || '/noema-library').replace(/\/+$/, '');
@@ export function registry() {
-  const base = config().noemaUrl;
-  if (!base) return Promise.resolve(null);
+  if (!config().noemaUrl) return Promise.resolve(null);
   registryP ||= (async () => {
     try {
-      const r = await fetch(`${base}/library/registry.js`);
+      const r = await fetch(`${library()}/registry.js`);
       if (r.ok) { const j = parseRegistry(await r.text()); if (j) return j; }
-    } catch { /* no CORS yet */ }
-    try { await script(`${base}/library/registry.js`); return window.NOEMA_REGISTRY || null; } catch { return null; }
+    } catch { /* offline */ }
+    return null;
   })();
@@ export async function pack(meta) {
-  if (base) tries.push(async () => { const r = await fetch(`${base}/library/subjects/${encodeURIComponent(id)}/pack.json`); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
+  if (base) tries.push(async () => { const r = await fetch(`${library()}/subjects/${encodeURIComponent(id)}/pack.json`); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
@@
-  if (base) tries.push(async () => { await script(`${base}/library/subjects/${encodeURIComponent(id)}/pack.js`); const p = window.NOEMA_PACKS?.[id]; if (!p) throw new Error('no pack'); return p; });
```

`tools/serve.mjs` should proxy `/noema-library/*` in the same way for local work. Otherwise set
`noemaLibrary` in a local config. The docs table in `docs/NOEMA.md` §2 ("otherwise loaded as a classic
`<script>`") should be updated.

---

### 2. Medium: a buddy's timer is trusted, logged as everyone's study time, and can lock the room

**Status: fixed.** `meletee_buddy_room_timer` validates and rebuilds the record (1-120 min, 0-60 rest, start about now, `v` not in the future, poisoned stored `v` is overwritable); `cleanTimer()` filters every network timer; the room logs only the minutes the person was present (`roomMinutes()`).

**Where.**
- `src/buddies/room.js:47`: `onBroadcast` takes any `timer` payload a room member broadcasts.
- `src/buddies/room.js:25`: the same applies to the polled `st.timer`.
- `src/views/buddies/room.js:132-133`: when the focus block ends, `logOnce(..., state.timer.minutes)` writes the
  timer's `minutes` into **my** `sessions` with `study.logSession`, and that syncs to the cloud.
- `cloud/supabase.sql:351-359`: `meletee_buddy_room_timer` checks only `phase`. Its `v` comparison is the only
  ordering.

**Exploit path.** Any accepted buddy of the room owner, including a buddy who has turned hostile, sends
`{"phase":"focus","minutes":100000,"rest":0,"startedAt":<now>,"endsAt":<now+1000>,"v":1e300}`, either as a
Realtime broadcast on `meletee-room:<id>` or through `POST /rest/v1/rpc/meletee_buddy_room_timer`. The
`meletee room members send` policy allows both.
- One second later, every member's client logs a 100,000-minute session. That corrupts their minutes, streak,
  garden and Method Lab data, syncs to the cloud, and feeds `meletee_buddy_contributions`. Upserts there then
  fail the `minutes <= 10080` check, so the person's real weekly numbers stop updating.
- A non-number `minutes` such as `"5"` turns sums into string concatenation in `study.minutesOn`.
- `v = 1e300` makes `newerTimer()` and the SQL `v` guard reject every later timer, so the room's timer stays
  stuck until the row is edited by hand.

**Fix.** Validate on both sides, and never log more than the person was actually present for.

```diff
--- a/cloud/supabase.sql
+++ b/cloud/supabase.sql
@@ create or replace function public.meletee_buddy_room_timer(p_room uuid, p_timer jsonb) returns void
   if jsonb_typeof(p_timer) <> 'object' or coalesce(p_timer ->> 'phase', '') not in ('focus', 'idle') then raise exception 'bad timer'; end if;
+  if jsonb_typeof(p_timer -> 'v') is distinct from 'number'
+     or (p_timer ->> 'v')::numeric > extract(epoch from now()) * 1000 + 60000 then raise exception 'bad timer'; end if;
+  if p_timer ->> 'phase' = 'focus' and not (
+       jsonb_typeof(p_timer -> 'minutes') = 'number' and (p_timer ->> 'minutes')::numeric between 1 and 120
+       and jsonb_typeof(p_timer -> 'rest') = 'number' and (p_timer ->> 'rest')::numeric between 0 and 60
+       and jsonb_typeof(p_timer -> 'startedAt') = 'number'
+       and abs((p_timer ->> 'startedAt')::numeric - extract(epoch from now()) * 1000) < 120000
+       and (p_timer ->> 'endsAt')::numeric = (p_timer ->> 'startedAt')::numeric + (p_timer ->> 'minutes')::numeric * 60000)
+    then raise exception 'bad timer'; end if;
-  update public.meletee_buddy_rooms set timer = p_timer || jsonb_build_object('by', me), updated_at = now()
+  update public.meletee_buddy_rooms set timer = (select jsonb_object_agg(k, p_timer -> k) from unnest(array['phase','minutes','rest','startedAt','endsAt','v']) k where p_timer ? k) || jsonb_build_object('by', me), updated_at = now()
```

```diff
--- a/src/buddies/logic.js
+++ b/src/buddies/logic.js
@@
+// A timer from the network (another member, the database): only well-formed, plausible values.
+export function cleanTimer(tm, now = Date.now()) {
+  if (!tm || typeof tm !== 'object') return null;
+  const v = Number(tm.v);
+  if (!Number.isFinite(v) || v > now + 60000) return null;
+  if (tm.phase === 'idle') return { phase: 'idle', by: typeof tm.by === 'string' ? tm.by : null, v };
+  const minutes = Number(tm.minutes), rest = Number(tm.rest), startedAt = Number(tm.startedAt);
+  if (tm.phase !== 'focus' || !Number.isInteger(minutes) || minutes < 1 || minutes > 120
+      || !(rest >= 0 && rest <= 60) || !Number.isFinite(startedAt)) return null;
+  return { phase: 'focus', minutes, rest, startedAt, endsAt: startedAt + minutes * 60000, by: typeof tm.by === 'string' ? tm.by : null, v };
+}
--- a/src/buddies/room.js
+++ b/src/buddies/room.js
@@
-import { mergeMembers, newerTimer } from './logic.js';
+import { mergeMembers, newerTimer, cleanTimer } from './logic.js';
@@
-    timer = newerTimer(timer, st.timer && st.timer.v ? st.timer : null);
+    timer = newerTimer(timer, cleanTimer(st.timer));
@@
-        if (event === 'timer' && payload) { timer = newerTimer(timer, payload); emit(); }
+        if (event === 'timer') { const tm = cleanTimer(payload); if (tm) { timer = newerTimer(timer, tm); emit(); } }
--- a/src/views/buddies/room.js
+++ b/src/views/buddies/room.js
@@
+  const joinedAt = Date.now();
@@
-        if (logOnce(`${id}:${state.timer.startedAt}`, state.timer.minutes)) toast(t('buddies.room.logged', { n: state.timer.minutes }));
+        const mins = Math.max(0, Math.min(state.timer.minutes, Math.round((state.timer.endsAt - Math.max(joinedAt, state.timer.startedAt)) / 60000)));
+        if (mins > 0 && logOnce(`${id}:${state.timer.startedAt}`, mins)) toast(t('buddies.room.logged', { n: mins }));
```

---

### 3. Medium: goal numbers are visible to buddies who never joined the goal

**Status: fixed.** `overview` returns `value` only to members (challenges by design, documented in `cloud/README.md`); before joining only members who are your buddies are listed, and the goal card shows names without numbers.

**Where.** `cloud/supabase.sql:423-440` (`meletee_buddy_overview`, the `goals` part).

**Why.** A goal is listed for anyone who is a buddy of its **owner** (`g.owner = me or meletee_buddy_with(g.owner)
…`). Each member's weekly `minutes`/`sessions`/`reviews` value is returned with it. Neither the
`members`/`value` subquery nor the outer `where` requires the viewer to be a member. `cloud/README.md` promises
the opposite: "goal numbers are shown only to the members of that goal".

**Exploit path.** A is buddies with B and with C. B and C do not know each other. C creates a "shared" goal with
A, and B is not in it. B calls `POST /rest/v1/rpc/meletee_buddy_overview` (or simply opens the Buddies screen)
and gets C's display name, emoji and exact weekly study minutes. That is a person B is not connected to, and
whose own buddy card may keep minutes private.

**Fix.** Return values only to members. For a `challenge`, the opted-in board shows values by design, but
only between people who opted in.

```diff
--- a/cloud/supabase.sql
+++ b/cloud/supabase.sql
@@ 'goals', coalesce((
           select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(p.display_name, '…'), 'emoji', coalesce(p.emoji, '🌱'),
-            'value', coalesce((to_jsonb(c) ->> g.metric)::int, 0)) order by m.joined_at)
+            'value', case when g.kind = 'challenge'
+                            or exists (select 1 from public.meletee_buddy_goal_members x2 where x2.goal_id = g.id and x2.user_id = me)
+                          then coalesce((to_jsonb(c) ->> g.metric)::int, 0) end) order by m.joined_at)
```

The goal cards must then show "join to see the numbers" when `value` is `null`. Consider also limiting the
member list of a goal you have not joined to members who are your buddies.

---

### 4. Low: invite codes can be probed without limit, and owners can rewrite their own invites

**Status: fixed.** Invites have select and delete policies only; `meletee_buddy_invite_create` makes 10-character codes server-side (≤ 20 open, ≤ 50 a day); preview/accept/decline share a 30-an-hour budget; decline needs a prior successful preview; the 31^8 comment is corrected; the client calls the RPC.

**Where.** `cloud/supabase.sql:213` (policy `own buddy invites` is `for all`), `231-268` (`invite_preview`,
`accept_invite`, `decline_invite`), `src/buddies/logic.js:116-125`.

**Exploit paths.**
- *Probing.* `meletee_buddy_invite_preview`, `accept` and `decline` have no attempt limit. The code space is
  31^8 ≈ 8.5·10^11 (the alphabet has 31 characters, not 32 as the comment says). With N live codes, one random
  guess hits with probability N / 8.5·10^11. A script at PostgREST speed can find someone's open invite in
  days once N is in the thousands. It then learns their display name and emoji, and can become their buddy and
  see whatever they share. `decline` also lets anyone holding a guessed code burn it.
- *Reusable invites.* `with check (user_id = me and used_by is null)` lets the owner `PATCH` their own used invite
  back to `used_by = null`, with any `expires_at`. That turns a single-use, 14-day link into a permanent
  multi-use one, which can then be posted publicly. That contradicts "only by a single-use invite code" in
  `cloud/README.md`.
- *Unbounded creation.* Nothing caps how many invites one account inserts.

**Fix.** Create invites only through a function, add an attempt budget, and stop direct updates.

```diff
--- a/cloud/supabase.sql
+++ b/cloud/supabase.sql
@@
-create policy "own buddy invites"       on public.meletee_buddy_invites       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and used_by is null);
+create policy "see own buddy invites"    on public.meletee_buddy_invites       for select to authenticated using (user_id = (select auth.uid()));
+create policy "delete own buddy invites" on public.meletee_buddy_invites       for delete to authenticated using (user_id = (select auth.uid()));
+
+create table if not exists public.meletee_buddy_code_tries (
+  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
+  at      timestamptz not null default now());
+create index if not exists meletee_buddy_code_tries_user on public.meletee_buddy_code_tries (user_id, at desc);
+alter table public.meletee_buddy_code_tries enable row level security;   -- no policies: functions only
+
+create or replace function public.meletee_buddy_code_try(me uuid) returns void
+language plpgsql security definer set search_path = public as $$
+begin
+  if (select count(*) from public.meletee_buddy_code_tries where user_id = me and at > now() - interval '1 hour') >= 30
+    then raise exception 'slow down'; end if;
+  insert into public.meletee_buddy_code_tries (user_id) values (me);
+  delete from public.meletee_buddy_code_tries where user_id = me and at < now() - interval '1 day';
+end $$;
+
+create or replace function public.meletee_buddy_invite_create() returns text
+language plpgsql security definer set search_path = public as $$
+declare me uuid := public.meletee_buddy_me(); c text;
+begin
+  if (select count(*) from public.meletee_buddy_invites where user_id = me and used_by is null and expires_at > now()) >= 20
+    then raise exception 'enough open invites'; end if;
+  c := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '' order by i)
+        from (select gen_random_bytes(10) b) r, generate_series(0, 9) i);
+  insert into public.meletee_buddy_invites (code, user_id) values (c, me);
+  return c;
+end $$;
```

Then:
- Change `invite_preview` from `stable` to volatile and start it, `accept_invite` and `decline_invite` with
  `perform public.meletee_buddy_code_try(me);`.
- Widen the code check to `'^[A-HJKMNP-Z2-9]{8,10}$'`.
- Add the two new functions to the grant loop (`meletee_buddy_code_try` should not be granted at all).
- In `src/buddies/data.js:120-123`, call `rpc('meletee_buddy_invite_create')` instead of inserting.
- Update `CODE_LENGTH`/`parseCode` to accept 10 characters.

---

### 5. Low: a blocked person still sees you (and you them) in a mutual buddy's room

**Status: fixed.** `room_state` and `overview.rooms` drop both sides of a block; the client shows live presence only for people the database lists (presence on the channel itself still cannot be filtered per viewer).

**Where.** `cloud/supabase.sql:321-331` (`room_state`) and `441-447` (`overview.rooms`): members are listed
without checking blocks. `meletee_buddy_block` (277-286) only removes memberships in the two people's own rooms.

**Exploit path.** You block C, and you both stay buddies with A. Whenever you sit in A's room, C sees your
name, emoji and live status (`focus`/`break`) through `room_state`, the `rooms` overview and Realtime
presence. C can also keep broadcasting to the room you are in. Blocking is meant to stop exactly this kind of
monitoring.

**Fix.** Filter out the other side of a block in both member lists:

```diff
@@ room_state / overview rooms members subqueries
       where m.room_id = p_room and m.last_seen > now() - interval '90 seconds'
+        and not exists (select 1 from public.meletee_buddy_links bl where bl.status = 'blocked'
+          and bl.user_a = least(me, m.user_id) and bl.user_b = greatest(me, m.user_id))
```

Presence over Realtime cannot be filtered per viewer. The client should drop presence entries whose key is
not in the filtered `room_state` member list (`mergeMembers` in `src/buddies/logic.js`).

---

### 6. Low: Realtime authorisation assumes "private channels only"

**Status: fixed (documented).** `cloud/README.md` now has the required "turn off Allow public access" step with a way to verify it; the owner must apply it in the dashboard.

**Where.** `src/buddies/realtime.js:56` joins with `private: true`, and the RLS policies on `realtime.messages`
(`cloud/supabase.sql:470-482`) protect private channels only.

**Exploit path.** If the project still allows public channels (the Supabase default), a client that joins the
same topic with `private: false` is not checked against those policies. One example is an ex-buddy who still
knows the room's UUID from an earlier visit. Whether that lets them listen to the private channel's broadcasts
depends on the Realtime version, so **verify** it on the project.

**Fix (configuration).** In the Supabase dashboard, open Realtime → Settings and turn off public channel
access ("Allow public access"), so only private, policy-checked channels can be joined. Add the step to the
Buddies section of `cloud/README.md`:

```diff
+- In **Realtime → Settings**, turn off **Allow public access** so that only private (policy-checked) channels
+  can be joined. noema-lite does not use Realtime, so this does not affect it.
```

---

### 7. Low: restoring a backup trusts every key in it; the Gemini model id is not validated

**Status: fixed.** `importBackup()` restores only known `a:` names (plus `grow:*`, `ws:<id>:*`), valid JSON ≤ 1 MB, never `cache:*`/`meta:*`/`a:timer`; model ids must match `MODEL_ID` in `aiPrefs()`, `setAiPrefs()`, the model lists and inside `geminiCall`/`claudeCall`.

**Where.**
- `src/core/store.js:82-87` writes every string in `obj.data` under `meletee1:<acc>:`, including non-`a:` keys
  such as `cache:noemaOutbox` and `meta:*`.
- `src/ai/index.js:18` takes `geminiModel` from the synced `a:ai` key.
- `src/ai/gemini.js:31` interpolates it into the request path, which carries the `x-goog-api-key` header.

**Exploit path.** A classmate shares "my study plan" as a Meletee backup, and the learner restores it.
- A crafted `cache:noemaOutbox` lands in the outbox. As soon as noema-lite announces `resultsInbox`, it is
  written to the learner's own `noema_kv` inbox and merged into their noema-lite progress, for example by
  marking whole subjects as studied or rewriting card schedules.
- A crafted `a:ai.geminiModel` such as `../../v1beta/cachedContents` points the learner's key at other
  endpoints on the same Google host.
- Everything under `a:` then syncs to the cloud.

There is no prototype pollution: `Object.entries` over `JSON.parse` output only writes strings into localStorage.

**Fix.**

```diff
--- a/src/core/store.js
+++ b/src/core/store.js
@@ export function importBackup(obj) {
   const prefix = `${PREFIX}${account()}:`;
-  for (const [k, v] of Object.entries(obj.data)) if (typeof v === 'string') setItem(prefix + k, v);
-  return Object.keys(obj.data).length;
+  let n = 0;
+  for (const [k, v] of Object.entries(obj.data)) {
+    if (typeof v !== 'string' || v.length > 2e6 || !/^a:[\w.:-]{1,120}$/.test(k) || /^a:(cache\.|timer$)/.test(k)) continue;
+    try { JSON.parse(v); } catch { continue; }
+    setItem(prefix + k, v); n++;
+  }
+  return n;
 }
--- a/src/ai/index.js
+++ b/src/ai/index.js
@@
-export const aiPrefs = () => ({ prefer: 'auto', claudeModel: DEFAULT_CLAUDE, geminiModel: DEFAULT_GEMINI, ...store.get('ai', {}) });
+const MODEL_ID = /^[a-z0-9][a-z0-9.\-]{1,80}$/i;
+export const aiPrefs = () => {
+  const p = { prefer: 'auto', claudeModel: DEFAULT_CLAUDE, geminiModel: DEFAULT_GEMINI, ...store.get('ai', {}) };
+  if (!MODEL_ID.test(p.claudeModel)) p.claudeModel = DEFAULT_CLAUDE;
+  if (!MODEL_ID.test(p.geminiModel)) p.geminiModel = DEFAULT_GEMINI;
+  return p;
+};
```

---

### 8. Low: no size limits on what a signed-in client stores in the shared project

**Status: fixed.** Check constraints cap `meletee_kv.value` (1 MB) and snapshots (5 MB); a trigger allows ≤ 20 manual / ≤ 40 automatic restore points and 50 MB in total per person (also on update); another caps synced keys at 2000.

**Where.** `cloud/supabase.sql:13-30`: `meletee_kv.value` and `meletee_snapshots.data` have no size checks.
Manual snapshots have no count limit, and only automatic ones are trimmed to 30 (`src/cloud/sync.js`
`snapshots.auto`).

**Exploit path.** Sign-up is open. Any account can loop `POST /rest/v1/meletee_snapshots` with multi-megabyte
`data`, or upsert huge `meletee_kv` values. That fills the database, which is shared with noema-lite (the free
tier has 500 MB), and takes both apps down for everyone. A buggy client could do the same by accident.

**Fix.**

```diff
@@ create table if not exists public.meletee_kv (
-  value      text not null,
+  value      text not null check (char_length(value) <= 1000000),
@@ create table if not exists public.meletee_snapshots (
-  data       jsonb not null,
+  data       jsonb not null check (pg_column_size(data) <= 5000000),
+alter table public.meletee_kv        drop constraint if exists meletee_kv_value_size;
+alter table public.meletee_kv        add  constraint meletee_kv_value_size check (char_length(value) <= 1000000) not valid;
+alter table public.meletee_snapshots drop constraint if exists meletee_snapshots_size;
+alter table public.meletee_snapshots add  constraint meletee_snapshots_size check (pg_column_size(data) <= 5000000) not valid;
+-- at most 20 manual restore points per person
+create or replace function public.meletee_snapshots_cap() returns trigger language plpgsql security definer set search_path = public as $$
+begin
+  if new.kind = 'manual' and (select count(*) from public.meletee_snapshots where user_id = new.user_id and kind = 'manual') >= 20
+    then raise exception 'too many restore points'; end if;
+  return new;
+end $$;
+drop trigger if exists meletee_snapshots_cap on public.meletee_snapshots;
+create trigger meletee_snapshots_cap before insert on public.meletee_snapshots for each row execute function public.meletee_snapshots_cap();
```

(The `create table` edits only affect new projects. The `alter … not valid` lines cover existing ones.)

---

### Checked and found sound

- **HTML sinks.**
  - The `html` prop of `h()` is used only in `src/views/learn.js:70-116`, with `leadHtml`, `bodyHtml`,
    `introHtml`, `simple`/`nontrivial` and `reading[].html`. All of it comes from `content/<lang>.json`, which
    `tools/build-content.mjs` generates from the compendium at build time and which is served same-origin.
  - `svg()` (`src/core/dom.js:33`) receives only static templates, numbers and two translation strings:
    `companion.label` and `grow.garden.label`. The translation check below enforces that these two contain no
    `"`, `<`, `>` or `&`.
  - There is no `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval`, `new Function` or `postMessage` anywhere.
  - `src/ai/ui.js` `richText()` builds `strong`, `ul`/`ol`, `li`, `p` and `br` nodes and appends model text
    through `append()` as text nodes. Grades, hints, quizzes, error groups and question lists use text children.
  - Buddy names, emoji, noema-lite pack titles and descriptions, conversation records and cloud-synced values
    are always text children.
  - Hardening only: `learn.js:13` `textOf()` parses into a detached `<div>` via `innerHTML`. With trusted
    content that is fine, but `new DOMParser().parseFromString(html, 'text/html').body.textContent` would stay
    safe even if the content source changed.
- **Links.** Every `href` is a constant, a hash route with an encoded id, or `link()`/`noemaLink()` built from
  `config.noemaUrl` with `encodeURIComponent` ids. There is no `javascript:` path and no open redirect: the
  router only reads `location.hash` and never navigates to a URL taken from it. `inviteLink()` uses
  `location.href` without its hash.
- **AI keys.**
  - Keys are stored only as `meletee-device:{anthropicKey,geminiKey}:<acc>` in localStorage or sessionStorage
    (`src/ai/keys.js`).
  - `exportBackup()` (`store.js:76`) and `localData()`/`syncable()` (`sync.js:17`, `:55`) read only
    `meletee1:<acc>:`, so keys never reach backups, `meletee_kv` or snapshots.
  - Conversation records (`ai/convos.js` → `cloud/convos.js` → `noema_conversations`) carry messages, model
    name and context, never the key.
  - Gemini sends the key in the `x-goog-api-key` header, not the URL. Error texts are vendor messages cut to 200
    characters, and there is no `console.*` logging in `src/ai`.
  - The noema-lite inbox rows (`noema/results.js`) contain only result items.
  - Informational: keys are scoped per account id and are not cleared on sign-out, so a remembered key
    survives on a shared computer. That is the documented meaning of "Remember on this device".
- **RLS and functions.**
  - Row-level security is enabled on all 11 tables.
  - Every `SECURITY DEFINER` function pins `search_path = public` and references schema-qualified objects.
    Every exposed function starts with `meletee_buddy_me()` or `auth.uid() is not null`.
  - `execute` is revoked from `public` and `anon`.
  - Links, cheers, rooms, members and goals have no client write policies, so they change only through the
    functions.
  - Cheers are preset keys (regex), limited to 6 per hour per pair. The count-then-insert is not locked, so a
    burst of parallel calls can slightly exceed it, which is harmless.
- **noema-lite.** `cloud/supabase.sql` never alters `noema_*`. Meletee reads `noema_kv` (never `a:settings`,
  `source.js:56`), writes only `a:inbox:meletee:*` rows after `a:caps.resultsInbox`, and upserts its own
  conversation rows. noema-lite's RLS keeps all of that per user.

---

## Part 2: translations (el, ru, fr)

### What was checked

- All 36 bundle files, about 6,600 strings: `i18n/{en,el,ru,fr}.json`, `i18n/ws/{a,b,c}.*.json`,
  `i18n/{ai,grow,cloud,buddies,meta}.*.json`.
- Every non-English string was read next to the English one.
- Fixes were made in place. A throwaway script (kept outside the repo) then checked that:
  - every file parses;
  - key sets are identical across the four languages of each bundle;
  - `{placeholders}` match per key (a plural `.one` may say "one" in English where other languages keep `{n}`);
  - every `tn()` key used in `src/` has `.one/.other`, plus `.few/.many` in Russian;
  - the two strings that go into SVG attributes are attribute-safe.

  Result: **ALL OK** (36 files, 6,688 strings, 64 `tn()` calls).

### Glossary (one term per concept)

| English | Ελληνικά | Русский | Français |
|---|---|---|---|
| workspace | χώρος εργασίας | мастерская | espace de travail |
| course | μάθημα | курс | cours |
| topic | θέμα | тема | sujet |
| subject (noema-lite) | αντικείμενο | предмет | matière |
| chapter / section (noema-lite) | κεφάλαιο / ενότητα | глава / раздел | chapitre / section |
| review (spaced) | επανάληψη | повторение | révision |
| study session | συνεδρία | занятие | séance |
| focus session | συνεδρία συγκέντρωσης | сеанс концентрации | séance de concentration |
| focus room | δωμάτιο συγκέντρωσης | комната концентрации | salle de concentration |
| buddy / buddies | φίλος μελέτης / φίλοι μελέτης (nav: Φίλοι) | друг по учёбе / друзья | binôme(s) |
| cheer / nudge | ενθάρρυνση / σκούντημα | поддержка / мягкое напоминание | encouragement / petit rappel |
| challenge | πρόκληση | соревнование | défi |
| Method Lab | Εργαστήριο μεθόδων | Лаборатория методов | Labo des méthodes |
| (forgiving) streak | (επιεικές) σερί | (мягкая) серия | série (bienveillante) |
| why-chain | αλυσίδα «γιατί» | цепочка «почему» | chaîne des pourquoi |
| flashcard / deck | κάρτα / τράπουλα | карточка / колода | carte / paquet |
| set (relearn, practice) | σετ | набор / подход | lot |
| guide card | κάρτα οδηγού | карточка | fiche |
| AI tutor | βοηθός | репетитор | tuteur |
| restore point | σημείο επαναφοράς | точка восстановления | point de restauration |
| light points | πόντοι φωτός | очки света | points de lumière |
| notes (study notes) | σημειώσεις | конспект | notes |

Address: friendly informal everywhere (εσύ / ты / tu). Plural "you" is used only where a group is meant
(buddies studying together).

### Changes by language

**Русский (about 265 strings).**
- **Informal address.** The whole `ws/b` bundle (Blank page, Feynman, Teach-back, Self-explanation, Sketch;
  46 strings) and most of `ai`, `cloud` and `buddies` (about 90 strings) used «вы». All of them now use «ты»,
  like the rest of the app.
- **Gender.** Masculine-only or «(а)» forms addressed to the learner are now neutral wherever a natural
  wording exists. Examples: «Не вспомнил(а)» → «Не помню», «Ты вспомнил(а) {got} из {n}» →
  «Вспомнилось: {got} из {n}», «Что ты сделал?» → «Что сделано?», «Где я застрял?» → «Где были заминки?»,
  «Будь к себе терпелив» → «Будь к себе терпеливее». No «(а)» forms are left.
- **Terminology.**
  - Study session «сессия» → «занятие» everywhere. In Russian «сессия» is the exam period, which the app itself
    uses for `do.examMode`.
  - Focus session → «сеанс концентрации». Focus room: «комната фокуса» → «комната концентрации».
  - Challenge: «вызов» → «соревнование».
  - «Method Lab» inside AI strings → «Лаборатория методов».
  - AI workspace names now match the workspaces («Претест», «Конспекты»).
- **Mistranslations.**
  - «лёгкое очко» ("easy point") → «очко света» for the garden's light points.
  - «Лопни миф» (лопнуть is intransitive) → «Развей миф».
  - «опоздание {n} день» → «просрочено на {n} день/дня/дней».
  - «{n} минут позади» (wrong plural for 1, 2, 21…) → «Готово: {n} мин!».
  - «Урок» for a lesson learned from a mistake → «Вывод».
- **Placeholders.** Example placeholders now read «Например: …» with a lower-case continuation, instead of a
  mix of «напр. X» and «например, X».
- **Plurals.** Every `tn()` key has one/few/many/other, checked against Intl rules.

**Ελληνικά (about 70 strings).**
- **Terminology.**
  - "topic" is now «θέμα» everywhere. It was «ενότητα» in the core bundle and «θέμα» in the workspaces, and
    «ενότητα» is kept for noema-lite sections.
  - noema-lite subjects are «αντικείμενα». They were «μαθήματα», the same word as Meletee courses, which made
    "import a subject as a course" read as "import a course as a course".
  - The AI tutor is «ο βοηθός» everywhere. The workspaces said «δάσκαλος».
  - "Method Lab" → «Εργαστήριο μεθόδων» in AI strings.
  - Hint is «υπόδειξη» (it was «βοήθεια»).
  - A lesson learned is «δίδαγμα» (it was «μάθημα», which is "course").
  - A notes chunk is «κομμάτι» (it was «ενότητα»).
  - Nudges are «σκουντήματα» everywhere.
- **Gender.** Slashes («ξύπνιος/α», «έτοιμος/η», «Ο/Η {name}», «του/της», «Νέος/νέα», «περήφανος/η») were replaced
  by neutral phrasings: «Ακόμα στο πόδι», «Όποτε θες», «Έχεις πρόσκληση από {name}», «Σε καμαρώνω τόσο!» and so on.
- **Wording.**
  - «Σκάσε έναν μύθο» (σκάσε also means "shut up") → «Κατάρριψε έναν μύθο».
  - «της χθες» → «από χθες».
  - The pace line no longer agrees its verb with the wrong number.
  - «Γράψ' την» now uses a typographic apostrophe.
- **Typography.** Greek question marks (;), «» quotes and accents were already correct.

**Français (about 105 strings, plus spacing).**
- **Informal address.** The whole `ai` bundle used «vous» (26 strings) and is now «tu». «Vous» stays only where
  two buddies are addressed together.
- **Terminology.**
  - "streak" alone is «série». Practice/relearn sets are «lots» (they were «séries») and a recall round is a
    «manche».
  - Topic is always «sujet»: «thème» was removed in 7 places.
  - Session is always «séance»: «session» was removed in the buddies metrics.
  - Nudge is «petit rappel» (it was also «petits coups de coude»).
- **Gender.** «sûr(e)», «surpris(e)», «concentré·e», «présent·e», «fier·e», «Bloqué·e» and masculine-only «flou» /
  «patient» were replaced with neutral wording. Examples: «J’hésite / Je sais», «ce qui te surprend»,
  «en pleine concentration», «Prends patience avec toi-même», «Chapeau, tu m’impressionnes !».
- **Mistranslations.**
  - «jusqu’à toucher le fond» ("hit rock bottom") → «jusqu’à atteindre les fondements».
  - «Qu’est-ce qui a glissé» → «Qu’est-ce qui a coincé».
  - `do.examIn.one` said «demain», but French uses the singular for 0 too, so "exam today" read "tomorrow". It is
    now «dans {n} jour».
  - «{n} sûr(e) mais faux» → «{n} réponse(s) sûre(s) mais fausse(s)».
- **Typography.** The space before ; : ! ? » and after « is now a no-break space (U+00A0) in every string (26
  fixed), and «n° {n}» has a no-break space. Apostrophes were already typographic (’).

**English.** No wording changes. In `i18n/en.json`, `el.json` and `fr.json`, the `.few`/`.many` plural keys
(copies of `.other`) that only `ru.json` had are now present too, so all four core files have identical key sets.

### Notes for the builders

- `i18n/meta.*.json` (the privacy page) was outside the files this review was allowed to edit, so it was only read.
  Two fixes are needed in `meta.ru.json` to match the rest:
  - `privacy.buddies.text`: «люди, которых ты принял(а) по коду приглашения» → «люди, добавленные по коду
    приглашения». Also «твои сессии» → «твои занятия».
  - `privacy.noema.text`: «то, что ты изучил(а) здесь» → «то, что изучено здесь».

- `do.examIn` is called with `exam.days` = 0 on exam day. English then says "exam in 0 days". A separate
  `do.examToday` key would read better in all four languages.
- The `ws.srs.boxLabel` "every {d} days" reads oddly for box 1 (d = 1) in every language. `tn()` with
  `ws.srs.every` would fix it.

### Please have a native speaker skim

These fixes were made carefully, but by a reviewer, not by native speakers. Before release, a native Greek, Russian
and French speaker should skim the app in their language, especially:
- the Russian bundles that were switched from «вы» to «ты» (`ws/b`, `ai`, `cloud`, `buddies`);
- the Greek topic and subject terminology («θέμα», «αντικείμενο»);
- the French gender-neutral rewrites.
