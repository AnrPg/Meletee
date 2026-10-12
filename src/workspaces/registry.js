// The workspaces: each holds one or more tools (see tools.js, which groups them into a toolshed
// per technique). `items` are the compendium item ids this workspace was first built for.
// `tab(api, value)` makes a workspace with several tools open on one of them (#/ws/<id>/<tab>).
const uiTab = (k, extra = {}) => (api, v) => api.update('ui', (u) => ({ ...(u || {}), ...extra, [k]: v }), {});
export const WORKSPACES = [
  // group a: the question deck and everything built on it
  { id: 'recall', emoji: '🧠', group: 'a', items: ['active-recall-practice-testing', 'anki-and-flashcards-done-well', 'premade-decks', 'dont-let-cards-replace-understanding'], tab: (api, v) => api.save('tab', v), load: () => import('./recall.js') },
  { id: 'srs', emoji: '🔁', group: 'a', items: ['spaced-repetition', 'spaced-reviews-for-whole-topics-too'], load: () => import('./srs.js') },
  { id: 'interleave', emoji: '🔀', group: 'a', items: ['interleaving', 'interleave-in-the-final-weeks'], load: () => import('./interleave.js') },
  { id: 'pretest', emoji: '🎯', group: 'a', items: ['pretesting-errorful-generation', 'pre-reading-priming'], load: () => import('./pretest.js') },
  { id: 'relearn', emoji: '♻️', group: 'a', items: ['successive-relearning'], load: () => import('./relearn.js') },
  // group b: writing, drawing and explaining
  { id: 'blank', emoji: '📄', group: 'b', items: ['blank-page-recall-brain-dump'], load: () => import('./blank.js') },
  { id: 'feynman', emoji: '🧒', group: 'b', items: ['feynman-technique-explain-it-simply'], load: () => import('./feynman.js') },
  { id: 'teach', emoji: '🧑‍🏫', group: 'b', items: ['learning-by-teaching'], load: () => import('./teach.js') },
  { id: 'selfexp', emoji: '🪜', group: 'b', items: ['self-explanation'], load: () => import('./selfexp.js') },
  { id: 'dual', emoji: '✏️', group: 'b', items: ['dual-coding', 'flowcharts-and-pathway-sketches'], load: () => import('./dual.js') },
  // group c: questions, notes and memory tools
  { id: 'practice', emoji: '📝', group: 'c', items: ['practice-questions', 'error-log', 'past-papers-and-question-banks', 'start-practice-questions-early', 'weak-topics-first'], tab: uiTab('tab'), load: () => import('./practice.js') },
  { id: 'why', emoji: '❓', group: 'c', items: ['elaborative-interrogation'], load: () => import('./why.js') },
  { id: 'examples', emoji: '🧺', group: 'c', items: ['concrete-examples', 'story-and-case-links'], load: () => import('./examples.js') },
  { id: 'notes', emoji: '🗒', group: 'c', items: ['cornell-notes', 'question-based-notes', 'concept-maps', 'comparison-tables', 'one-page-summaries', 'which-note-format-for-which-material', 'learning-objectives-as-a-checklist'], tab: uiTab('type', { open: null }), load: () => import('./notes.js') },
  { id: 'memory', emoji: '🏛', group: 'c', items: ['mnemonics-and-acronyms', 'memory-palace-method-of-loci', 'chunking'], tab: uiTab('tab', { palace: null }), load: () => import('./memory.js') },
];

export const byId = (id) => WORKSPACES.find((w) => w.id === id) || null;
