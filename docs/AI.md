# AI tutors (phase 4)

Meletee's tutors call **Claude** (Anthropic Messages API) and **Gemini** (Generative Language API)
straight from the browser with the learner's **own keys**, like noema-lite. There is no server, no SDK
and no bundler: plain `fetch`. Every workspace works fully without a key. The AI is only a layer on top.

## Files

| File | What it does |
| --- | --- |
| `src/ai/keys.js` | Keys on this device only: `meletee-device:anthropicKey:<account>` and `meletee-device:geminiKey:<account>`. "Remember on this device" uses localStorage, otherwise sessionStorage (this tab only). Outside the synced `meletee1:` prefix, so keys are never in `exportBackup()` and never synced. |
| `src/ai/claude.js` | Streamed `POST /v1/messages` (SSE `text_delta`), `GET /v1/models`. |
| `src/ai/gemini.js` | `generateContent` (JSON mode) and `streamGenerateContent?alt=sse`, `GET models`, the same as noema-lite's `geminiCall`. |
| `src/ai/router.js` | The task → provider table, fallbacks and workspace hook names. Pure. |
| `src/ai/prompts.js` | Ground rules, per-tutor roles, the learner's material as text. Pure. |
| `src/ai/schema.js` | JSON schemas (grade, questions, error groups), a small validator, JSON parsing. Pure. |
| `src/ai/sse.js` | SSE parser, Claude stream reducer, Gemini text joiner. Pure. |
| `src/ai/convos.js` | `noema.conversation/v1` records in IndexedDB. |
| `src/ai/index.js` | `askJSON`, `chat`, `grade`, `hint`, `makeQuestions`, `lightningQuiz`, `groupErrors`, `coach`, `methodLabCoach`, `studyPlanHelper`, `noemaLink`, `setNoemaSubjectResolver`. |
| `src/ai/ui.js` | Buttons, inline results, the tutor sheet, and `forWorkspace(ws)` (this becomes `api.ai`). |
| `src/ai/settings.js` | The settings section: keys (password inputs, remember, test, forget), the model pickers and who answers first. |

## Claude request

`POST https://api.anthropic.com/v1/messages` with the headers `x-api-key`, `anthropic-version: 2023-06-01`,
`anthropic-dangerous-direct-browser-access: true` and `anthropic-beta: server-side-fallback-2026-07-01`.

The body has `model` (default `claude-opus-5-5`, changeable in Settings from `GET /v1/models`),
`stream: true`, `system` (the ground rules and the learner's material as two blocks, each with `cache_control: ephemeral`),
`messages` and `fallbacks: "default"`. It also sets `output_config.effort`: `low` for chat and hints, `medium` for grading and planning.

- No `temperature`, `top_p`, `thinking` or `budget_tokens` (thinking is adaptive by default), no assistant prefill and no forced `tool_choice`.
- JSON jobs use `output_config.format: {type: "json_schema", schema}`. The schemas have `additionalProperties: false` and `required`. The text is parsed and validated in the app, with one repair round.
- `stop_reason: "refusal"` shows a gentle message, and the turn is not kept in the history. `max_tokens` is marked as cut short.
- If the fallback beta header causes a 400, the request is retried once without it, and the device remembers (`meletee-device:claude-no-fallback`).
- 429, 529 and 5xx responses are retried with backoff, honouring `retry-after`.

## Who does what

| Task | Provider | UI |
| --- | --- | --- |
| `grade` answer checker (`{score, verdict, covered, missing, mistakes, feedback}`) | Gemini | Inline card after a flip card is revealed (recall, srs, interleave, relearn) and in the practice error form |
| `hint` hint ladder (never the answer, up to 3) | Gemini | Flip card, before the reveal |
| `questions` question maker | Gemini | Recall → Cards ("make cards from your notes"); Pretest ("Make questions" for the chosen topic) |
| `quiz` lightning quiz | Gemini | A chip in the Socratic sheet (notes, self-explanation, sketch) |
| `errors` error grouping | Gemini | Practice → error log |
| `mnemonic` | Gemini | Memory → mnemonic helper (sheet) |
| `feynman`, `teachback`, `why`, `examples`, `examiner` | Claude | Tutor sheet in Feynman, Teach, Why-chain, Examples and Blank page |
| `socratic` | Claude | Tutor sheet in Notes, Self-explanation and Sketch, with "Continue in noema-lite" |
| `methodlab`, `plan` | Claude | Exported for phases 5 and 2: `methodLabCoach(ctx)` and `studyPlanHelper(ctx)` |

`route(task, {claude, gemini}, prefer)` picks the preferred provider. If that one has no key, it uses the other one. If neither has a key, it returns `null`. When offline it also returns `null`, and the tool keeps its own self-check. Settings → More options → "Who answers first" can prefer one provider for everything.

## Workspace hook

`api.ai` is `null` without a key. With a key it is:

```js
api.ai.button(task, context, opts)  // → one quiet button, or null
api.ai.open({ task, label, ...context })
api.ai.grade({ question, answer, reference }) / hint / makeQuestions / groupErrors
```

`task` can be a router task, an alias (`practice.grade`, `why.probe`, `notes.<type>` …) or `null` (the workspace's own tutor).
`context` can be an object or a function, and its input elements are read when the button is pressed.
The group helpers `deck.js aiSlot`, `b-ui.js aiSlot` and `c-ui.js aiSlot` all call `api.ai.button`.
Each workspace screen shows at most one AI entry point.

## Conversations

Every interaction is saved as one `noema.conversation/v1` record, using the same `normalize()` as noema-lite.

- Chats are kind `tutor` with a `mode` (`feynman`, `teach-back`, `why-chain`, `examples`, `interview`, `socratic`, `hint`, `mnemonic`, `method-lab`, `plan`).
- One-shot jobs are kind `grading` or `question`.
- Every record has `context {type: 'workspace', id, label}`, `model {provider: 'anthropic'|'google', name}` and `meta {app: 'meletee', task}`.
- The hidden opening message of a sheet carries `meta.kickoff`.

Records are stored in IndexedDB `meletee-convos` → store `convos`, under the key `<account>|<id>`. API (`src/ai/convos.js`):

```js
list({ includeDeleted, kinds, workspace }) → records   get(id) → record|null
put(record, { silent, keepUpdatedAt }) → record          save(record)   remove(id) (tombstone)
onChange(fn(record)) → unsubscribe
```

noema-lite's own `MODES` list does not know Meletee's new modes yet. Its `normalize()` reads them as `socratic`, so `meta.task` keeps the real one. Phase 6 can add the modes to noema-lite in a small pull request.

## Phase 6 hooks

- `setNoemaSubjectResolver(fn(context) → subjectId|null)`: when a course came from noema-lite, the
  Socratic sheet's "Continue in noema-lite" link becomes `<noemaUrl>/?subject=<id>`.
- Sync conversations with `convos.list` / `convos.onChange` / `convos.put`.

## Tests

- `tests/ai.test.mjs`: router, SSE parser, Claude reducer, JSON validation, conversation normalisation, prompts and backoff.
- `tests/ai.spec.js`: both vendors are stubbed with `page.route()` (a fake SSE stream for Claude, including a refusal, and fake JSON for Gemini). It covers:
  - keys are stored on the device only and are not in the backup
  - no AI UI without a key
  - the hint and answer checker, with a Gemini grading record
  - the fallback to Claude when only a Claude key is set, and the exact request shape
  - the tutor sheet streams, handles a refusal and saves its record
  - the question maker
  - Greek
  - the Socratic sheet with its noema-lite link and the lightning quiz
