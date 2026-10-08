# Changelog

## 1.1.0 (2026-10-08)

### An account for everyone, so nothing is ever lost
- Meletee now asks for an account before the app opens (`requireAccount: true` in `config.js`). A calm welcome
  screen offers two doors into the same Supabase account: *Create an account* and *Sign in with your
  noema-lite account* (one account works in both apps), plus forgot password, a language picker and the
  privacy page. Sign-ups that must confirm their e-mail first are told so and signed in once confirmed;
  confirmation and reset e-mails now link back to Meletee, which signs in from the link and asks for the new
  password after a reset. Signing out returns to the welcome screen.
- Study kept on a device from earlier versions moves into the account at the first sign-in (the welcome screen
  says so only when there is some), merged with what the account already has, AI conversations included.
- A new device shows "bringing your study over…" until the account's data, conversations included, has come
  down, instead of an empty app.
- Offline, the app keeps working with the cached session, even an expired one, and syncs when it is back
  online. Only a refresh token the server truly rejects asks for a new sign-in (the data stays on the device).
  Token refreshes are single-flight, so two requests never race the rotating refresh token.

### Sync that never drops progress
- A key changed on two devices before they synced (e.g. both offline) is now merged entry by entry instead of
  last-write-wins, so focus sessions, wins, cards, error-log entries and Grow days added on each device are all
  kept; deletions and edits made on one side win; an entry edited on both takes the newer copy.
- Values over ~900 KB (e.g. many sketches) are synced in parts instead of failing the size cap.
- The conversation sync's bookkeeping is per account, and data of one account is never copied into another
  on a shared device.
- Audit of everything the app stores, with the full list of what syncs and what stays on the device by design
  (AI keys, a running timer, caches, sync bookkeeping) in cloud/README.md.

### Tests
- `tests/account.spec.js`: the gate, sign-up (with and without e-mail confirmation), noema-lite sign-in, wrong
  password, forgot password, e-mail links, sign-out, moving local study in, a second device getting everything
  back (conversations and logs too), two offline devices merging a log, offline with a cached or rejected
  session, the installed app offline, axe on the welcome screen in light/dark and Greek, translations.
- Other specs run with `requireAccount` off through `tests/fixtures/test.js`; the single-file build checks the
  gate by default.

## 1.0.0 (2026-10-08)

The first public release: everything in docs/PLAN.md, phases 0 to 8.

### Learn
- *Find your method* in three questions, a method library with time badges and research notes, myths to drop.
- The full study guide in English, Ελληνικά, Русский and Français, loaded section by section.

### Do
- Focus timer with presets, "just 5 minutes", a recall prompt after each block and a parking lot for stray thoughts.
- Today's top three, courses and topics with exam dates, spaced reviews, a week planner and a term map.
- 15 technique workspaces: recall, spaced repetition, interleaving, pretesting, successive relearning, blank page, Feynman, teaching, self-explanation, dual coding, practice questions and error log, "why?", concrete examples, note formats and memory tools.

### AI tutors
- Claude and Gemini with the learner's own key, straight from the browser: hints, grading, questions, a tutor in every workspace and a Method Lab coach. Every workspace works without a key.

### Grow
- Method Lab experiments and a methods profile, a forgiving streak, done list and wins, weekly reflection, calm corner, "my why" and a garden that grows with real study.

### Cloud and noema-lite
- Optional sign-in with the same account as noema-lite, sync of Meletee's data (`meletee_kv`) with daily restore points (`meletee_snapshots`), AI conversations in `noema_conversations`.
- noema-lite subjects imported as courses with deep links, "what next" from noema-lite progress, results sent back to noema-lite's inbox.

### Buddies
- Invite codes, preset cheers and nudges, a shared focus room with a synced timer, shared and team goals and opt-in weekly challenges; each person picks what buddies see.

### Polish and release (phase 8)
- Accessibility: axe checks on every screen in light and dark and in two languages (`tests/a11y.spec.js`); accent, muted-text and signal colours adjusted for AA contrast in both themes (`--c`, `--ink3`, `--on-c`, `--bad-ink`, `--leaf-ink`); sheets keep focus inside, close on Escape and return focus; a skip link; focus moves to the new screen after navigation and the page title names it; one polite live region for toasts and the finished timer; tabs use `aria-selected`; everything stays still with reduced motion.
- Performance: every area except the home screen loads on first use (dynamic imports); cloud sync and buddies' live status load only with an account; interface strings are fetched once instead of twice. Home: 104 requests and 587 KB before, 42 requests and 222 KB after (uncompressed, development server).
- Offline: the service worker precaches the app shell (filled in by the build) and caches compendium sections as they are read, in a cache that survives updates.
- Installable app: PNG icons (192, 512, maskable) rendered from `assets/icon.svg` by `npm run icons`, theme colours and shortcuts to Focus, Reviews and Workspaces.
- Single-file build: `npm run build:single` writes `dist/meletee.html` with every module, style, string and section inlined; it works from `file://`.
- Privacy page (`#/privacy`, linked from Settings) in four languages: what stays on the device, what syncs, AI keys, what buddies see, how to export or delete data, with "delete from this device" and, signed in, "delete here and in the cloud".
