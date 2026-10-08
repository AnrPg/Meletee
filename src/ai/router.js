// Which AI does what (docs/PLAN.md). Gemini: quick, structured jobs. Claude: long
// conversations and careful judgement. A task falls back to the other provider when only
// one key is set, and to null (the workspace's own self-check) when there is none.
export const TASKS = {
  grade: { provider: 'gemini', kind: 'grading', json: true, effort: 'medium' },
  questions: { provider: 'gemini', kind: 'question', json: true, effort: 'medium' },
  hint: { provider: 'gemini', kind: 'tutor', mode: 'hint', effort: 'low' },
  quiz: { provider: 'gemini', kind: 'question', mode: 'quiz', json: true, effort: 'low' },
  errors: { provider: 'gemini', kind: 'grading', json: true, effort: 'medium' },
  mnemonic: { provider: 'gemini', kind: 'tutor', mode: 'mnemonic', chat: true, effort: 'low' },
  feynman: { provider: 'claude', kind: 'tutor', mode: 'feynman', chat: true, effort: 'low' },
  teachback: { provider: 'claude', kind: 'tutor', mode: 'teach-back', chat: true, effort: 'low' },
  why: { provider: 'claude', kind: 'tutor', mode: 'why-chain', chat: true, effort: 'low' },
  examples: { provider: 'claude', kind: 'tutor', mode: 'examples', chat: true, effort: 'low' },
  examiner: { provider: 'claude', kind: 'tutor', mode: 'interview', chat: true, effort: 'low' },
  methodlab: { provider: 'claude', kind: 'tutor', mode: 'method-lab', chat: true, effort: 'medium' },
  plan: { provider: 'claude', kind: 'tutor', mode: 'plan', chat: true, effort: 'medium' },
  socratic: { provider: 'claude', kind: 'tutor', mode: 'socratic', chat: true, effort: 'low' },
};

// Names the workspaces use for their hook, mapped to a task.
export const ALIASES = {
  'practice.grade': 'grade', 'deck.check': 'grade', check: 'grade',
  'deck.hint': 'hint', 'deck.make': 'questions', 'pretest.make': 'questions', 'practice.errors': 'errors',
  'why.probe': 'why', 'examples.suggest': 'examples', 'memory.mnemonic': 'mnemonic',
};

// The one tutor each workspace opens when it does not name a task.
export const WORKSPACE_TASK = {
  recall: 'grade', srs: 'grade', interleave: 'grade', relearn: 'grade', pretest: 'questions',
  blank: 'examiner', feynman: 'feynman', teach: 'teachback', selfexp: 'socratic', dual: 'socratic',
  practice: 'grade', why: 'why', examples: 'examples', notes: 'socratic', memory: 'mnemonic',
};

export function taskFor(name, workspaceId) {
  if (name && TASKS[name]) return name;
  if (name && ALIASES[name]) return ALIASES[name];
  if (name && /^notes\./.test(name)) return 'socratic';
  if (name) return null; // an unknown hook renders nothing
  return WORKSPACE_TASK[workspaceId] || null;
}

// avail: { claude: bool, gemini: bool }; prefer: 'auto' | 'claude' | 'gemini'
export function route(task, avail, prefer = 'auto') {
  const t = TASKS[task];
  if (!t) return null;
  const first = prefer === 'claude' || prefer === 'gemini' ? prefer : t.provider;
  const other = first === 'claude' ? 'gemini' : 'claude';
  if (avail?.[first]) return first;
  if (avail?.[other]) return other;
  return null;
}

export const vendorOf = (provider) => (provider === 'claude' ? 'anthropic' : 'google');
