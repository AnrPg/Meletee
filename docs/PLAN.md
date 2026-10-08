# Meletee: implementation plan

Named Meletee (from Μελέτη, the Muse of practice; Greek for study). Code: https://github.com/AnrPg/Meletee

## What we are building

A study-habits companion for every student. It sits next to noema-lite. noema-lite holds **what** to learn: subjects, sections, exercises and its tutor. Meletee holds **how** to learn it, how to plan it and how to keep going. All 82 features in the compendium's app checklist are in scope, and you ticked all of them.

Rules that apply to every phase:

- **Calm and whimsical.** The interface is decluttered and minimal, never crowded. Each screen has one main action and plenty of white space, and extra options stay hidden until asked for. The whimsy comes from small illustrations, gentle motion and friendly wording, never from more things on screen.
- **Four languages from day one:** English, Ελληνικά, Русский and Français. Every string and every piece of content goes through the translation layer.
- **Two AI providers, each doing what it is best at.** Gemini does the quick, structured jobs. Claude does the long conversations and the careful judgement. Each tool falls back to the other provider if only one key is set, and to a self-check mode when offline.
- **Compatible with noema-lite.** It uses the same ids, the same conversation format, the same look and the same accounts.
- **Your data is yours.** The app works fully offline on one device. The cloud is optional, and API keys never leave the device.

## Architecture

| Area | Choice | Why |
| --- | --- | --- |
| Front end | Vanilla JavaScript ES modules and plain CSS, no framework | Same as noema-lite, so the code can later be shared or merged. Fast, small and with nothing to upgrade. |
| Build | A small Node script: copies, fingerprints and bundles into `dist/site`, plus an optional single-file HTML | Same idea as noema-lite's `tools/build.py`. |
| Hosting | Netlify, static site | Same as noema-lite. |
| Storage on device | localStorage for small state; IndexedDB for sessions, logs and drawings | Works offline. Keys are namespaced `melete1:<account>:…`, mirroring noema-lite's `noema1:` scheme. |
| Cloud (optional) | The same Supabase project as noema-lite, with the same users and its own `melete_*` tables and row-level security | One sign-in for both apps. The two apps never write each other's rows. |
| Real-time (buddies) | Supabase Realtime channels | Synced Pomodoro rooms, pings and presence. |
| Translations | `i18n/<lang>.json` for interface strings and `content/<lang>/*.json` for the compendium content | Content is generated from the compendium tabs, so the app and the doc say the same thing. |
| AI | One `ai/` layer with two providers: Claude through the Messages API, called from the browser with the user's own key, and Gemini through the Generative Language API. A task router picks the provider for each tool. | Matches noema-lite: keys stay on the device and no server holds them. |
| Offline | Service worker (installable PWA) | Timers, plans and workspaces work without a connection. |
| Tests | Playwright end-to-end tests and unit tests with Node's built-in runner; GitHub Actions CI | Same as noema-lite. |

How the AI work is split. This is a default that can be changed in settings.

| Task | Provider | Notes |
| --- | --- | --- |
| Answer checker | Gemini | Uses noema-lite's score format: score, verdict, covered, missing, mistakes, feedback. |
| Question maker, hints, lightning quiz, error-log grouping | Gemini | JSON output with a schema; fast and cheap. |
| Feynman coach, explain to a friend, why-chain partner, example coach | Claude | Long, patient conversations. |
| Examiner (oral exam or interview), Method Lab coach, term plan in the schedule maker | Claude | Careful judgement and planning. |
| Socratic tutor | Claude inside Meletee | Has a "continue in noema-lite" button that opens noema-lite's own Gemini tutor on the same section. |

Every AI conversation is saved as a `noema.conversation/v1` record, with `kind` set to feynman, teach-back, examiner and so on. noema-lite can then list them too.

## Phases

Each phase ends with something usable that is deployed and tested. The work runs in order, and each phase starts as soon as the previous one passes its checks.

### Phase 0: Foundations

- Repository, CI, Netlify deploy, build script and a test harness.
- Design system: noema-lite's colour tokens (warm paper background, violet accent, 18px rounded cards, Plus Jakarta Sans), dark mode, an animation scale and a small illustration set (a little companion creature and a garden).
- App shell: a calm home screen with one main action ("What now?"), a quiet bottom navigation (Learn · Do · Grow · Buddies), routing, and settings.
- i18n engine with all four languages and a language switch. The app starts in the browser's language.
- Storage layer: namespaced keys, export and import of a backup file, and an account profile on the device.

**Done when:** the empty app shell runs in all four languages, light and dark, on a phone and on a laptop, and CI is green.

### Phase 1: Learn

- Content pipeline: a script that turns the compendium export for each language into structured JSON with the techniques, guide cards, myths, time costs and further reading.
- "Find your method": a short onboarding quiz from the Start here section, giving a suggested starter set of techniques.
- Guide cards: each section of the compendium as one-minute cards.
- Method library: one calm card per technique showing what it is, why it works, how to do it, the simple and non-trivial examples, an ADHD-friendly tip, the time-cost badge and the Further reading box.
- Myth-buster cards.

**Done when:** every technique and myth from the compendium is browsable in all four languages and every link works.

### Phase 2: Do (planning and focus)

- Pomodoro and focus timer: presets of 25/5, 50/10 and 15/5, a "just 5 minutes" start, a calm visible countdown, optional ticking, and a distraction parking lot that is reachable from any screen.
- Courses with a source map (spine, reference, videos, question bank, deck) and topic lists.
- Spaced review planner on a 1, 3, 7, 14, 30-day rhythm, with a "due today" list.
- Schedule maker: a term map from exam dates, weekly time blocks, a daily top 3 and a weekly plan, with reviews placed automatically.
- Lecture lifecycle checklist, exam countdown and exam-season mode.
- Blank-page recall prompt at the end of each session.

### Phase 3: Technique workspaces

A small toolshed opens for each technique you choose. The tools are:

- Active recall deck with quiz mode and confidence ratings.
- Spaced repetition queue.
- Blank-page canvas for text and sketches, with "reveal and mark gaps".
- Practice-question log and an error log with cause tags; question-bank score tracker.
- Interleaving mixer.
- Why-chain.
- Self-explanation steps.
- Feynman plain-words editor that flags jargon.
- Teach-back lesson planner.
- Dual-coding sketch pad with a redraw-from-memory mode.
- Example collector.
- Pretest with a before-and-after comparison.
- Successive-relearning loop.
- Note templates: Cornell, question-based, concept map, comparison table and one-page summary.
- Memory tools: mnemonic helper, memory palace and chunking.

Every workspace works without AI. Phase 4 adds the AI on top.

### Phase 4: AI tutors

- Provider layer, with Claude and Gemini keys stored only on this device, model choice, streaming and a cost-aware router.
- The tools: Feynman coach, Socratic tutor, explain to a friend (teach-back), answer checker, question maker, why-chain partner, example coach, examiner mode, error-log analyst and Method Lab coach.
- Ground rules in every prompt: you try first; in recall tools the AI never just gives the answer; it answers in the language you chose.
- A self-check fallback when there is no key or no connection.
- Conversations are saved in noema-lite's format.

### Phase 5: Explore and Sustain

- Method Lab: experiments of one to two weeks with one method, session ratings (recall, enjoyment, focus, effort), a comparison, keep, tweak or drop decisions, and a "my method" profile.
- Forgiving streak (5 of 7 days), done list and wins log, a weekly reflection, a worry dump and breathing exercise, a "my why" card, and the insight or quote of the day.
- Something that grows with your study (a garden or a little creature), small celebrations, and light points.

### Phase 6: Cloud and noema-lite

- Sign in with the noema-lite account (the same Supabase project), sync Meletee's own tables, and keep daily snapshots.
- Import a noema-lite subject as a course. Workspaces draw on its exercises, flashcards, playbooks and pitfalls.
- Deep links into noema-lite (`?subject=…#/s/<section>`, practice, cards, mistakes). Its progress is read to suggest what to do next.
- One shared review queue keyed by noema-lite ids, and results written back.
- Changes noema-lite needs, each as a small separate pull request on noema-lite:
  - a route to a single exercise
  - stable flashcard ids
  - a safe way to append results
  - translated menus
  - keeping the Gemini key out of the cloud sync

### Phase 7: Buddies

- Buddy invites by link, profiles, and privacy controls for what each buddy sees.
- Shared focus rooms with a synced Pomodoro (body doubling), plus "I'm starting now" pings, cheers and nudges.
- Cooperation: shared decks, quizzing each other, teach-back sessions.
- Friendly competition: weekly challenges and an opt-in leaderboard.
- Team play (συναγωνισμός): pooling minutes or reviews toward a shared goal.

### Phase 8: Polish and release — done (1.0.0)

- Accessibility pass: `tests/a11y.spec.js` runs axe on every screen in light and dark, in two languages, on desktop and phone; contrast tokens, focus handling in sheets, a skip link, focus and titles on navigation, one polite live region, reduced motion everywhere.
- Performance: every area loads on first use; the home route went from 104 requests / 587 KB to 42 / 222 KB.
- Service worker precaches the app shell and caches compendium sections as they are read; installable app with PNG icons and shortcuts (`npm run icons`).
- Single-file build `npm run build:single` → `dist/meletee.html`, tested from `file://`.
- Privacy page at `#/privacy` in four languages; README and CHANGELOG for the release.

## Phase 0 and 1 task list (starting now)

1. Scaffold the repository: `index.html`, `src/` (core, ui, i18n, storage, views), `styles/`, `i18n/`, `content/`, `tools/build.mjs`, `tests/`, CI and Netlify config.
2. Design tokens and base components: card, button, chip, sheet, toast, empty state, and the companion illustration.
3. Shell and router: Home, Learn, Do, Grow, Buddies and Settings, with placeholders for later phases shown as "coming soon" cards.
4. i18n engine and a language switch, with all strings in four languages.
5. Storage, backup export and import.
6. Content pipeline from the compendium tabs into `content/<lang>/`.
7. Learn screens: Find your method, guide cards, method library, myths.
8. Tests (smoke tests in four languages, mobile and desktop) and a deploy preview.

## Risks and open points

- **API keys in the browser.** Each user brings their own Claude or Gemini key, as in noema-lite. A small server proxy could come later if you want to give keys to friends.
- **Buddies needs the cloud.** The real-time rooms depend on Supabase Realtime being enabled on the noema-lite project.
- **Content size.** About 300 KB per language. It is loaded per section, so the first screen stays fast.
- **Translations.** The compendium translations are by Claude. A native speaker should skim each language before release.
