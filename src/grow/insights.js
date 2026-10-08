// Insight of the day: short, accurate notes drawn from the compendium (no celebrity quotes).
// Text lives in i18n/grow.<lang>.json as grow.insight.<n>; `item` links to the full entry.
import { iso, parse } from '../core/dates.js';

export const INSIGHTS = [
  { n: 1, item: 'recognising-is-not-remembering' },
  { n: 2, item: 'active-recall-practice-testing' },
  { n: 3, item: 'forgetting-is-part-of-the-process' },
  { n: 4, item: 'spaced-repetition' },
  { n: 5, item: 'desirable-difficulties' },
  { n: 6, item: 'sleep-consolidates-memory' },
  { n: 7, item: 'pretesting-errorful-generation' },
  { n: 8, item: 'interleaving' },
  { n: 9, item: 'elaborative-interrogation' },
  { n: 10, item: 'feynman-technique-explain-it-simply' },
  { n: 11, item: 'learning-by-teaching' },
  { n: 12, item: 'dual-coding' },
  { n: 13, item: 'concrete-examples' },
  { n: 14, item: 'step-3-give-it-enough-time' },
  { n: 15, item: 'step-4-rate-every-session' },
  { n: 16, item: 'step-2-change-one-thing-at-a-time' },
  { n: 17, item: 'step-6-decide-keep-tweak-or-drop' },
  { n: 18, item: 'use-fresh-starts-and-forgive-missed-days' },
  { n: 19, item: 'habit-stacking' },
  { n: 20, item: 'worry-dump' },
  { n: 21, item: 'breathing' },
  { n: 22, item: 'reframe-stress' },
  { n: 23, item: 'self-compassion-over-perfectionism' },
  { n: 24, item: 'compare-less' },
  { n: 25, item: 'define-a-stopping-point' },
  { n: 26, item: 'rest-without-guilt' },
  { n: 27, item: 'starting' },
  { n: 28, item: 'starting' },
  { n: 29, item: 'make-it-beautiful-a-bit' },
  { n: 30, item: 'curiosity-first' },
  { n: 31, item: 'hours-studied-as-the-measure-of-progress' },
  { n: 32, item: 'staying-organised' },
];

// Same insight all day, a different one each day, cycling through the list.
export function insightOfDay(day = iso(), list = INSIGHTS) {
  const n = Math.floor(parse(day).getTime() / 86400000 + 0.5);
  return list[((n % list.length) + list.length) % list.length];
}
