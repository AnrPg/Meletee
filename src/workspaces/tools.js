// Tools and toolsheds. A tool is one thing you can open: a part of a workspace (the shared
// deck, Cornell notes, the memory palace…) or a tool that lives elsewhere in the app (the
// focus timer, the plan, wins…). A toolshed is a view over tools for one technique of the
// compendium: it owns nothing, so a tool can sit in many toolsheds and keeps one set of data.

// ws + tab: opens a workspace (on that tab). href: an app route. action: a function to run.
export const TOOLS = [
  { id: 'deck', emoji: '🃏', ws: 'recall', tab: 'deck' },
  { id: 'quiz', emoji: '🧠', ws: 'recall', tab: 'practise' },
  { id: 'leitner', emoji: '🔁', ws: 'srs' },
  { id: 'mix', emoji: '🔀', ws: 'interleave' },
  { id: 'guess', emoji: '🎯', ws: 'pretest' },
  { id: 'relearn', emoji: '♻️', ws: 'relearn' },
  { id: 'blank', emoji: '📄', ws: 'blank' },
  { id: 'feynman', emoji: '🧒', ws: 'feynman' },
  { id: 'lesson', emoji: '🧑‍🏫', ws: 'teach' },
  { id: 'steps', emoji: '🪜', ws: 'selfexp' },
  { id: 'sketch', emoji: '✏️', ws: 'dual' },
  { id: 'sets', emoji: '📝', ws: 'practice', tab: 'sets' },
  { id: 'errors', emoji: '🩹', ws: 'practice', tab: 'errors' },
  { id: 'whychain', emoji: '❓', ws: 'why' },
  { id: 'examples', emoji: '🧺', ws: 'examples' },
  { id: 'cornell', emoji: '📐', ws: 'notes', tab: 'cornell' },
  { id: 'questions', emoji: '❔', ws: 'notes', tab: 'questions' },
  { id: 'map', emoji: '🕸', ws: 'notes', tab: 'map' },
  { id: 'table', emoji: '⚖️', ws: 'notes', tab: 'table' },
  { id: 'summary', emoji: '📃', ws: 'notes', tab: 'summary' },
  { id: 'objectives', emoji: '☑️', ws: 'notes', tab: 'objectives' },
  { id: 'acronym', emoji: '🔤', ws: 'memory', tab: 'acronym' },
  { id: 'palace', emoji: '🏛', ws: 'memory', tab: 'palace' },
  { id: 'chunk', emoji: '🧩', ws: 'memory', tab: 'chunk' },
  { id: 'focus', emoji: '⏱', href: '#/do/focus' },
  { id: 'parking', emoji: '🅿️', action: async () => (await import('../ui/parking.js')).openParking() },
  { id: 'plan', emoji: '🗓', href: '#/do/plan' },
  { id: 'reviews', emoji: '📬', href: '#/do/reviews' },
  { id: 'courses', emoji: '📚', href: '#/do/courses' },
  { id: 'top3', emoji: '⭐', href: '#/do' },
  { id: 'lab', emoji: '🧪', href: '#/grow/lab' },
  { id: 'wins', emoji: '🏆', href: '#/grow/wins' },
  { id: 'reflect', emoji: '🪞', href: '#/grow/reflect' },
  { id: 'worry', emoji: '🫧', href: '#/grow/calm/worry' },
  { id: 'breathe', emoji: '🌬', href: '#/grow/calm/breathe' },
  { id: 'mywhy', emoji: '💡', href: '#/grow/why' },
  { id: 'buddies', emoji: '👥', href: '#/buddies' },
];

// One toolshed per technique: the compendium item id, then its tools (the first one leads).
// Pure advice (sleep, food, "during the exam"…) has no toolshed: there is nothing to open.
export const SHEDS = [
  // start here
  ['finding-your-method-how-to-experiment-and-track-what-works', 'lab', 'reflect'],
  // core techniques
  ['active-recall-practice-testing', 'quiz', 'deck', 'blank', 'reviews'],
  ['spaced-repetition', 'leitner', 'deck', 'reviews', 'plan'],
  ['blank-page-recall-brain-dump', 'blank', 'focus', 'summary'],
  ['practice-questions', 'sets', 'errors', 'mix'],
  ['interleaving', 'mix', 'deck', 'sets'],
  ['elaborative-interrogation', 'whychain', 'examples'],
  ['self-explanation', 'steps', 'whychain'],
  ['feynman-technique-explain-it-simply', 'feynman', 'lesson', 'blank'],
  ['learning-by-teaching', 'lesson', 'feynman', 'buddies'],
  ['dual-coding', 'sketch', 'map'],
  ['concrete-examples', 'examples', 'whychain'],
  ['pretesting-errorful-generation', 'guess', 'deck'],
  ['successive-relearning', 'relearn', 'deck', 'leitner'],
  // notes
  ['cornell-notes', 'cornell', 'deck'],
  ['question-based-notes', 'questions', 'deck'],
  ['annotate-the-slides-instead-of-rewriting-them', 'questions', 'cornell', 'objectives'],
  ['concept-maps', 'map', 'sketch'],
  ['flowcharts-and-pathway-sketches', 'sketch', 'map'],
  ['comparison-tables', 'table', 'mix'],
  ['one-page-summaries', 'summary', 'blank'],
  ['pre-reading-priming', 'guess', 'objectives'],
  ['learning-objectives-as-a-checklist', 'objectives', 'courses'],
  ['which-note-format-for-which-material', 'cornell', 'questions', 'map', 'table', 'summary'],
  // memory
  ['anki-and-flashcards-done-well', 'deck', 'leitner', 'quiz'],
  ['premade-decks', 'deck', 'leitner'],
  ['dont-let-cards-replace-understanding', 'whychain', 'feynman', 'deck'],
  ['mnemonics-and-acronyms', 'acronym', 'deck'],
  ['memory-palace-method-of-loci', 'palace'],
  ['chunking', 'chunk', 'deck'],
  ['story-and-case-links', 'examples', 'palace'],
  ['spaced-reviews-for-whole-topics-too', 'reviews', 'plan', 'blank'],
  // planning
  ['the-lifecycle-of-one-lesson-lecture-or-chapter', 'guess', 'cornell', 'quiz', 'reviews'],
  ['semester-map', 'plan', 'courses'],
  ['weekly-plan', 'plan', 'top3'],
  ['daily-plan', 'top3', 'plan', 'focus'],
  ['time-blocking', 'plan', 'focus'],
  ['plan-reviews-before-new-material', 'reviews', 'top3'],
  ['a-catch-up-rule', 'plan', 'courses'],
  ['buffer-days', 'plan'],
  ['single-capture-system', 'parking', 'top3'],
  ['weekly-review', 'reflect', 'wins', 'plan'],
  // focus
  ['starting', 'top3', 'focus'],
  ['sustaining-focus', 'focus', 'parking', 'breathe'],
  ['staying-organised', 'plan', 'courses', 'parking'],
  ['support', 'buddies'],
  // anxiety and wellbeing
  ['test-yourself-often-in-low-stakes-ways', 'quiz', 'guess'],
  ['worry-dump', 'worry'],
  ['define-a-stopping-point', 'focus', 'top3'],
  ['productive-struggle-vs-panic', 'breathe', 'errors'],
  ['breathing', 'breathe'],
  ['reframe-stress', 'worry', 'breathe'],
  ['self-compassion-over-perfectionism', 'wins', 'reflect'],
  ['compare-less', 'wins', 'mywhy'],
  ['protected-time-off', 'plan'],
  ['ask-for-help-early', 'buddies'],
  // motivation
  ['choose-your-own-methods', 'lab'],
  ['make-progress-visible', 'wins', 'reflect'],
  ['gamify-it', 'buddies', 'wins'],
  ['use-fresh-starts-and-forgive-missed-days', 'reflect', 'top3'],
  ['curiosity-first', 'guess', 'whychain'],
  ['connect-it-to-your-future-use', 'mywhy', 'examples'],
  ['variety', 'mix', 'lab'],
  ['study-socially', 'buddies', 'lesson'],
  ['small-wins-and-rewards', 'wins', 'focus'],
  ['identity-not-willpower', 'mywhy', 'wins'],
  ['habit-stacking', 'plan', 'top3'],
  ['revisit-your-why', 'mywhy'],
  ['make-it-beautiful-a-bit', 'sketch', 'map'],
  // exams
  ['start-practice-questions-early', 'sets', 'errors'],
  ['past-papers-and-question-banks', 'sets', 'errors', 'focus'],
  ['simulate-the-exam', 'focus', 'mix', 'errors'],
  ['error-log', 'errors', 'sets'],
  ['weak-topics-first', 'sets', 'errors'],
  ['interleave-in-the-final-weeks', 'mix', 'sets'],
  ['calm-exam-day-nerves', 'breathe', 'worry'],
  ['after-the-exam', 'reflect', 'errors'],
].map(([id, ...tools]) => ({ id, tools }));

export const tool = (id) => TOOLS.find((x) => x.id === id) || null;
export const shed = (id) => SHEDS.find((s) => s.id === id) || null;
export const toolHref = (x) => x.href || (x.ws ? `#/ws/${x.ws}${x.tab ? `/${x.tab}` : ''}` : null);

// The toolshed a tool was last opened from, so the workspace's back button returns to it.
let from = null;
export const cameFrom = (id) => { if (id !== undefined) from = id; return from; };
