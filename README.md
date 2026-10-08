# ◆ Meletee

A calm, playful companion for studying well. Meletee (Μελέτη, the Muse of practice) helps you **learn how to learn**, plan your time, keep going and study with friends. It works alongside [noema-lite](https://github.com/AnrPg/noema-lite), the subject engine: noema-lite holds *what* to learn, Meletee holds *how*.

Plain ES modules and CSS: no framework, no bundler and no runtime dependencies. English, Ελληνικά, Русский and Français.

## What it does

**Learn**: techniques that work, explained simply.
- *Find your method*: three gentle questions, then a starter set of techniques.
- A method library with time badges, the research behind each technique and myths to drop.
- The full study guide (15 sections), loaded section by section.

**Do**: plan and focus.
- A focus timer (Pomodoro presets, "just 5 minutes", a recall prompt after every block, a parking lot for stray thoughts).
- Today's top three, courses and topics with exam dates, spaced reviews, a week planner and a term map.
- **15 workspaces**, one per technique: active recall, spaced repetition, interleaving, pretesting, successive relearning, blank-page recall, Feynman, learning by teaching, self-explanation, dual coding, practice questions with an error log, elaborative interrogation, concrete examples, note formats (Cornell, question notes, concept maps, tables, one-pagers, objective checklists) and memory tools (mnemonics, memory palace, chunking).

**AI tutors** (optional): Claude and Gemini, with your own key, inside every workspace (hints, grading, questions, a Socratic tutor) and as a coach in the Method Lab. Every workspace works fully without a key. See [docs/AI.md](docs/AI.md).

**Grow**: keep going.
- The Method Lab (try one method for 1–2 weeks, rate each session, then keep, tweak or drop it) and your methods profile.
- A forgiving streak, a done list and wins, a weekly reflection, a calm corner (worry dump, breathing) and "my why".
- A little garden that grows with real study.

**Buddies** (with an account): invite codes, cheers and nudges, a shared focus room with a synced timer, shared and team goals and opt-in weekly challenges. Each person chooses exactly what buddies see.

**Your account and noema-lite**: Meletee asks for an account first (create one, or sign in with your noema-lite account: one account works in both apps). Everything you do is synced, so progress, logs and history are never lost and come back on any device you sign in from: courses, focus sessions, reviews, plans, workspaces, Grow and AI conversations, with daily restore points. Changes made on two devices before they synced are merged entry by entry. Offline, the app keeps working with the cached session and syncs when it is back online. Plus noema-lite subjects imported as courses with deep links, and "what next" from your noema-lite progress.

**Everywhere**: works offline once installed (service worker), installable as an app, a single-file build, keyboard and screen-reader friendly, light and dark themes, reduced motion respected. What stays on the device and what syncs is explained in the app at `#/privacy` (Settings → Privacy).

## Run it

```bash
npm install                    # dev dependencies only: Playwright and axe-core for tests
node tools/serve.mjs           # http://localhost:5173 (serves the repository as it is)
```

`content/<lang>/` is generated from the compendium in `tools/compendium/` by `node tools/build-content.mjs` (the build runs it too).

## Test

```bash
npm test                       # node:test unit tests, then every Playwright spec on desktop and phone
node --test tests/*.test.mjs   # unit tests only
npx playwright test tests/a11y.spec.js   # one spec (axe on every screen, light and dark, two languages)
```

Tests never use the network: Supabase is replaced by `tests/fixtures/fake-supabase.js`, noema-lite and the AI providers by `page.route()`. Specs import `test` from `tests/fixtures/test.js`, which turns `requireAccount` off so they can test the app itself; `tests/account.spec.js` and one check in `tests/single.spec.js` test the account gate with it on.

## Build

```bash
npm run build                  # dist/site: the static site (Netlify publishes this folder)
npm run build:single           # dist/meletee.html: everything in one file, works from file://
npm run icons                  # re-render the PNG app icons from assets/icon.svg (after changing it)
```

- **Static site.** `tools/build.mjs` builds the content, copies the app to `dist/site` and stamps the service worker with a version and the list of files to precache (the app shell: HTML, styles, every module, interface strings, icons). Compendium sections are cached as they are read. The worker is registered only over https.
- **Single file.** `tools/build-single.mjs` inlines styles and `config.js`, turns every module into a `data:` URL in an import map (relative imports rewritten, no bundler) and carries the strings and content of all four languages. It asks for an account like the site; once signed in, everything local works offline, and the cloud, buddies, noema-lite and the AI tutors need a connection.
- **First load.** Only the home screen's modules (and the small account gate, `src/cloud/gate.js`) load at start; the welcome screen loads only while nobody is signed in; every other area (Learn, Do, workspaces, Grow, Buddies, Settings, noema-lite, the AI tutors) is a dynamic import fetched when first opened. Cloud sync and the buddies' live status load only with an account.

## Cloud setup

Meletee uses the same Supabase project as noema-lite, so one account works in both, and an account is required to use the app (`requireAccount` in `config.js`, on by default). To set it up, run `cloud/supabase.sql` once in the Supabase SQL editor and check `config.js`: step by step in [cloud/README.md](cloud/README.md). `config.js` holds only the project URL and the publishable key, which are public by design (every table has row-level security). Never put a secret key in this repository.

## AI keys

Each learner brings their own Claude (Anthropic) or Gemini (Google) key in Settings → AI tutors. Keys stay on the device (this tab only, unless "Remember on this device" is ticked), are never in a backup or the cloud, and are sent only to Anthropic or Google, straight from the browser. Details, models and prompts: [docs/AI.md](docs/AI.md).

## noema-lite integration

Sign-in, data sync, AI conversations in `noema_conversations`, importing noema-lite subjects as courses, deep links, "what next" and the results inbox are described in [docs/NOEMA.md](docs/NOEMA.md), together with the small changes noema-lite needs on its side.

## Layout

```
index.html, sw.js, manifest.webmanifest, config.js
src/core/        dom helper (sheets, toasts, live region), storage (meletee1:<account>:…), i18n, router, content, study model
src/ui/          companion, icons, small dialogs, parking lot
src/views/       one module per screen (grow/ and buddies/ for those areas); index.js holds every route
src/workspaces/  the 15 technique workspaces and their shared api
src/ai/          AI tutors (Claude, Gemini), keys, prompts, conversations
src/grow/        Method Lab, streak, wins, reflection, garden (logic)
src/buddies/     buddy data, rules, realtime room
src/cloud/       Supabase client, sync, restore points, conversations
src/noema/       noema-lite adapters: subjects, import, progress, results
styles/          tokens (shared with noema-lite), base, components, one file per area
i18n/            interface strings per language and per area
content/         compendium content per language (generated)
cloud/           supabase.sql and setup notes
tools/           build, single-file build, icons, content pipeline, dev server, compendium sources
tests/           node:test unit tests and Playwright specs
docs/            PLAN.md, AI.md, NOEMA.md
```

## Design rules

The interface stays decluttered, minimal and whimsical: one main action per screen, lots of white space, extra options only when asked for. Whimsy comes from illustrations, gentle motion and friendly words, never from more things on screen. Colours come from the tokens in `styles/tokens.css` (AA contrast in light and dark), every action is a real button or link, and motion stops when the system asks for reduced motion.
