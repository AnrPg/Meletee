# ◆ Melete

A calm, playful companion for studying well. Melete (Μελέτη, the Muse of practice) helps you **learn how to learn**, plan your time, keep going and study with friends. It works alongside [noema-lite](https://github.com/AnrPg/noema-lite), the subject engine: noema-lite holds *what* to learn, Melete holds *how*.

- Techniques that work, explained simply, with how long each one takes and the research behind it
- Focus timer, schedule maker and spaced review planner (coming in phase 2)
- A workspace for every technique, plus AI tutors powered by Claude and Gemini (phases 3–4)
- Study buddies: shared focus rooms, cheers, friendly challenges and team goals (phase 7)
- English, Ελληνικά, Русский and Français

The full plan is in [docs/PLAN.md](docs/PLAN.md).

## Run it

```bash
node tools/build-content.mjs   # compendium markdown → content/<lang>.json
node tools/serve.mjs           # http://localhost:5173
```

No framework and no runtime dependencies: plain ES modules and CSS.

## Test

```bash
npm install                    # only @playwright/test
npm test                       # unit tests + end-to-end tests (desktop and phone)
```

## Layout

```
index.html, sw.js, manifest.webmanifest
src/core/      dom helper, storage (melete1:<account>:…), i18n, router, content loader
src/ui/        companion and icons
src/views/     one module per screen
styles/        tokens (shared with noema-lite), base, components
i18n/          interface strings per language
content/       compendium content per language (generated)
tools/         build, content pipeline, dev server, compendium sources
tests/         node:test unit tests and Playwright specs
```

## Design rules

The interface stays decluttered, minimal and whimsical: one main action per screen, lots of white space, extra options only when asked for. Whimsy comes from illustrations, gentle motion and friendly words, never from more things on screen.
