# Changelog

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
