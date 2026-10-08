# Meletee and noema-lite

Meletee is the study-habits companion; noema-lite holds the subject packs (theory, exercises, flashcards,
debugging playbooks, pitfalls). This document says what the integration does today, where its data comes
from, and the small changes noema-lite needs so the two apps work as one. Each change is written so it can
become its own small pull request on noema-lite.

Code: `src/cloud/` (sign-in, sync, restore points, AI conversations) and `src/noema/` (adapters).
Tests: `tests/cloud.test.mjs`, `tests/cloud.spec.js` (a fake Supabase in `tests/fixtures/fake-supabase.js`
and a trimmed real pack in `tests/fixtures/noema-pack.json`; nothing touches the real project).

## 1. What Meletee does

| Feature | Where | How |
|---|---|---|
| One account for both apps | Settings → Cloud sync | E-mail + password against the same Supabase project (`window.MELETEE_CONFIG`). No supabase-js: plain `fetch` to Auth, PostgREST and Storage, exactly like noema-lite's `engine/cloud.js`. The session lives in `meletee1:cloud:session`. |
| Sync of Meletee's own data | `src/cloud/sync.js` | Every `meletee1:<acc>:a:<name>` key ↔ row `a:<name>` in `meletee_kv`. Last write wins per key (`updated_at`, local mtimes in `meta:mtime`). Push 3 s after a change (at most 10 s), on hide (keepalive) and when back online; pull on sign-in and on focus. Signing in moves the app to the account `u_<user id>` (like noema-lite); the first time, this device's data comes along and cloud copies win where both exist. |
| Never synced | `syncable()` in `src/cloud/sync.js` | Anything outside `meletee1:<acc>:a:` (so every `meletee-device:*` key, i.e. the AI keys), the running timer (`a:timer`) and `a:cache.*`. |
| Restore points | Settings → Cloud sync → Restore points | One automatic per day (newest 30 kept) + manual ones in `meletee_snapshots`. Restoring first saves today's data as a restore point. |
| AI conversations | `src/cloud/convos.js` | Records with `meta.app = 'meletee'` are upserted into noema-lite's `noema_conversations` with noema-lite's exact row shape, so they appear in noema-lite. |
| noema-lite subjects | `#/noema` | Library subjects + your imported subjects + anything with progress, with your own names. |
| Import a subject as a course | `#/noema/<id>` | Chapters (or sections) → topics with `topic.noema = { subject, chapter, section }`. Updating keeps Meletee progress and your own topics. The course keeps a small outline in `course.noema`. |
| Deep links | course page, topic sheet | Section `?subject=<id>#/s/<sec>`, chapter `#/ch/<ch>`, practice `#/practice/<ch>`, cards `#/cards` or `#/ch/<ch>/cards`, mistakes `#/mistakes` (`src/noema/ids.js`). |
| What next | course page, subject page | From noema-lite progress: due Meletee reviews → ≥5 due cards → ≥3 open mistakes → the next unread section → practise the weakest chapter → leftovers. |
| Shared review queue | `#/noema`, `sharedQueue()` in `src/noema/progress.js` | One list keyed by noema ids (`noema:<subject>:section:<id>`, `noema:<subject>:chapter:<id>`) merging Meletee's spaced topic reviews with noema-lite's due cards, due playbooks and open mistakes. |
| Results back to noema-lite | `src/noema/results.js` | Only through an append-only inbox, and only when noema-lite says it reads it (change 3). Until then results wait on the device. |
| Material for workspaces | `material(pack, topic.noema)` in `src/noema/import.js`, `pack(meta)` in `src/noema/source.js` | Exercises, flashcards (with their progress keys), playbooks and pitfalls of a topic. |

## 2. How Meletee reaches noema-lite

| Data | Source | Notes |
|---|---|---|
| Library list | `<noemaUrl>/library/registry.js` | Fetched as text and parsed (never run) when CORS allows; otherwise loaded as a classic `<script>` (sets `window.NOEMA_REGISTRY`, no CORS needed). |
| Library pack | `<noemaUrl>/library/subjects/<id>/pack.json` | With CORS. Fallback: `pack.js` as a classic script (sets `window.NOEMA_PACKS[id]`). |
| Imported pack | Storage `noema-private/<user id>/packs/<id>.json` | The person's own files; noema-lite's storage policy already allows them to read it. |
| Explore pack | Storage `noema-public/<owner>/<id>.json` | Public bucket, when `a:packmeta:<id>` names a `publicOwner`. |
| Progress | `noema_kv`: `s:*:state` | Read only. Shape: `{ read: {sec: true}, res: {ex: {n, ok, last, t}}, fc: {cardKey: {box, due}}, pb: {pb: {box, due}}, boss, xp }`. |
| Subject metadata | `noema_kv`: `a:packmeta:*`, `a:subjoverride:*` | Read only. |
| Capabilities | `noema_kv`: `a:caps` | Read only; written by noema-lite (see changes). |
| Never read | `noema_kv`: `a:settings` | It holds the Gemini key today (change 5). |

The script fallback runs code from the noema-lite site inside Meletee. It is the owner's own site and the
same account, but CORS (change 0) lets Meletee drop the fallback.

## 3. AI conversations (interface expected from phase 4)

`src/cloud/convos.js` imports `../ai/convos.js` dynamically and does nothing if it is missing. It needs:

```js
get(id)                       // -> noema.conversation/v1 record | null          (required)
onChange(fn)                  // fn(record) after each local save; returns unsubscribe   (required)
list({ includeDeleted: true })// -> records                                         (optional: first push)
put(record, { silent: true, keepUpdatedAt: true })   // (optional: pull records written on other devices)
```

Only records with `meta.app === 'meletee'` are pushed, as rows
`{ user_id, id, subject_id, kind, mode, title, context_label, message_count, deleted, created_at, updated_at, record }`
(`on_conflict=user_id,id`), exactly like `pushConvos()` in noema-lite's `engine/cloud.js`. Meletee pulls back
only its own records (`record->meta->>app = meletee`, newer `synced_at` than the last pull).
noema-lite lists conversations per subject (`subject.id`), so Meletee chats without a subject show only in
noema-lite's all-conversations views; unknown modes (e.g. `feynman`) are read there as `socratic` by
`normalize()` (`engine/convos.js`).

## 4. Changes noema-lite needs (one small pull request each)

Line numbers refer to noema-lite at the time of writing; `engine/engine.js` is generated from
`engine/src/*.js` by `tools/build.py`, so edit the sources and rebuild.

### 0. CORS for the public library (one line)
- `tools/build.py` line 114, `build_site()`: in the `_headers` text, under `/library/*`, add
  `  Access-Control-Allow-Origin: *`. The library is public anyway; this lets Meletee fetch `registry.js` and
  `pack.json` as data instead of running `pack.js`.

### 1. A route to a single exercise
- `engine/src/40_views.js` lines 542–558, `route()`: add before the last line
  `if (p[0] === 'ex') { const e = EX[p[1]]; return e ? startRun([e], { title: '🎯 ' + (SEC[e.section]?.title || e._ch.title), count: 1, keepOrder: true, back: '#/s/' + e.section }) : homeView(); }`
  (`EX` and `SEC` are the indexes in `engine/src/10_core.js`; `startRun` is at line 323).
- Announce it: write `exerciseRoute: 1` into `a:caps` (see change 3 for where `a:caps` is written).
- Meletee: `link(base, subject, { exercise }, caps)` in `src/noema/ids.js` then opens `#/ex/<id>`; without
  the cap it opens the exercise's section or its chapter practice.

### 2. Stable flashcard ids
Today a card's progress key is its position, `ch05#3` (`engine/src/50_sources.js` line 12), so inserting a
card shifts every later card's schedule, and Meletee cannot point at one card reliably.
- Content: give every card an `id` like `ch05-f003` (`tools/validate.py` around line 220 checks cards: require
  a unique `id` matching `^ch\d+-f\d{3}$`; `tools/noema_lib.py` line 62 appends patch cards: assign the next free id).
- `tools/build.py` (pack assembly near line 63): fill missing ids in order, `f"{c['id']}-f{k+1:03d}"`, so old packs keep working.
- `engine/src/50_sources.js` line 12: `f._key = f.id || f._key || c.id + '#' + k;`
- `engine/src/10_core.js` after line 149 (`S` is built): migrate once per subject: for each chapter `c` and card
  index `k`, if `S.fc[c.id + '#' + k]` exists and `S.fc[card.id]` does not, move it; then `save()`.
- `tools/db_sync.py` line 35/111: add an `id` column to `flashcards`.
- `engine/src/40_views.js` lines 179, 438, 439 already use `f._key`; no change.
- Announce it: `stableCardIds: 1` in `a:caps`. Meletee's `cardKey()` already prefers `card.id`.

### 3. A safe way to append results
noema-lite keeps a subject's progress in one blob (`s:<subject>:state`) and its open tab rewrites the whole
blob on each save (`flushSave()`, `engine/src/10_core.js` lines 151–157), so no other app may write it.
Meletee instead appends rows to `noema_kv` under `a:inbox:<app>:<id>`, value:

```json
{ "schema": "noema.results/v1", "app": "meletee", "subject": "databricks", "at": "2026-10-08T10:00:00Z",
  "items": [
    { "kind": "section", "id": "ch01-s02", "event": "studied", "at": "…" },
    { "kind": "chapter", "id": "ch01", "event": "review", "rating": "hard", "date": "2026-10-08", "at": "…" },
    { "kind": "exercise", "id": "ch01-e004", "ok": true, "at": "…" },
    { "kind": "card", "id": "ch01-f003", "grade": 2, "at": "…" }
  ] }
```

noema-lite side (the same pattern it already uses for `a:curin:` rows from the Claude app):
- `engine/cloud.js` lines 74 and 79, `pull()`: skip `a:inbox:` keys like `a:curin:` (never mirrored locally).
- New `engine/src/15_inbox.js` (after `10_core.js`, so `S`, `record()` at line 172 and `save()` exist): on boot and
  after each pull, `NoemaCloud.kvRows('a:inbox:')`; for each row whose `subject` is the open subject, apply to `S`:
  `studied` section → `S.read[id] = true`; `exercise` → `record(EX[id], ok)`; `card` → the Leitner update from
  `flashDeck`'s `rate` (`engine/src/40_views.js` line 461) with `q = grade`; `review` → append to
  `S.ext.meletee` (keep the last 200) so noema-lite can show it. Then `save()` and `NoemaCloud.kvDelete(row.key)`.
  Rows of other subjects: apply the same rules to that subject's `s:<id>:state` through `Noema.kv`, or leave them
  for when that subject is opened.
- `engine/src/90_boot.js`: once per start, `Noema.kv.set(Noema.kv.accountKey('caps'), JSON.stringify({ resultsInbox: 1, exerciseRoute: 1, stableCardIds: 1 }))`
  (only the caps that are really shipped).
- Meletee writes inbox rows only when `a:caps.resultsInbox` is set (`flush()` in `src/noema/results.js`).
  Until then they wait in `meletee1:<acc>:cache:noemaOutbox` (the course page says how many).

### 4. Translated menus
noema-lite's interface strings are English literals. A first pass covers the menus Meletee links into:
- New `engine/src/05_i18n.js` with `t(key, vars)` and flat bundles `en`, `el`, `ru`, `fr` (the language comes
  from `S.settings.lang`, falling back to `navigator.language`), loaded before `10_core.js` by `tools/build.py`.
- `engine/src/40_views.js`: `topbar()` (line 13), the home mode tiles (lines 108–112), the chapter tabs
  (line 153), the "← Home" back buttons (lines 366, 376, 403, 443, 486) and the view titles next to them.
- `engine/src/50_sources.js` line 176 (back button) and `engine/src/70_account.js` (Settings tabs, line 19).
- `engine/loader.js` `pickAccount()` (line 276) and `pickSubject()` (line 341).
- `engine/src/70_account.js` Settings: a language select that writes `settings.lang`.
Meletee's own strings for these screens are in `i18n/cloud.<lang>.json`, so the wording can be shared.

### 5. Keep the Gemini key out of the cloud sync
**Confirmed: the key is synced today.** `S.settings.apiKey` (`engine/src/10_core.js` line 139) is written into
`noema1:<acc>:a:settings` by `flushSave()` (lines 151–157); `Noema.kv.set` marks the key changed
(`engine/loader.js` lines 91–100) and `startAutoSync()` pushes it to `noema_kv` (`engine/cloud.js` lines 85–97,
listener at line 104). The Settings screen even says "Saved to your account and synced privately to your devices"
(`engine/src/70_account.js` line 41). Only backups and snapshots strip it (`engine/loader.js` line 980,
`includeSecrets: false`). Row-level security protects the row, but any app or token that can read the user's
`noema_kv` (including a connector) can read the key. Fix, mirroring the Claude key (`engine/claude.js` lines 20–25):
- Store the key in `noema-device:geminiKey:<acc>` (localStorage, never synced): `engine/src/10_core.js` line 139/149
  read it from there (fallback: the old `settings.apiKey`, then move it); `flushSave()` (line 156) deletes `apiKey`
  from what it writes to `a:settings`.
- `engine/cloud.js` `push()` (line 90): as a safety net, strip `apiKey` from `a:settings` values before upsert.
- One-time cleanup: after moving it, rewrite `a:settings` without `apiKey` so the cloud row loses it.
- `engine/src/70_account.js` line 41: "Stored only in this browser. Add it once on each device."
Meletee never reads `a:settings` (`src/noema/source.js`) and keeps its own AI keys in `meletee-device:*`, which
never sync.

## 5. Not done yet / limits

- Deleting a key with `store.remove()` is not noticed by the store's change listener, so deletions sync only
  when Meletee writes the key again (today only the focus timer, which never syncs).
- Cards and mistakes are grouped per chapter in the queue: without the pack, a card key `ch05#3` only tells its
  chapter. With the pack loaded (`material()`), per-section grouping is possible.
- noema-lite's own conversations are not pulled into Meletee; they stay in noema-lite.
