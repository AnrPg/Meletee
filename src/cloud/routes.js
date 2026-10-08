// Routes for the noema-lite screens, and the background work of phase 6 (started once at boot,
// because registerCloud runs once while the app starts):
//   - key/value sync with meletee_kv + the daily restore point (signed in only)
//   - AI conversations -> noema_conversations (when src/ai/convos.js exists)
//   - results of noema-linked topics -> noema-lite's inbox (when noema-lite supports it)
import { hub, subjectView } from '../noema/views.js';
import { backend } from './client.js';
import * as sync from './sync.js';
import { startConvoSync } from './convos.js';
import { watch, flush } from '../noema/results.js';
import * as study from '../core/study.js';

// The AI tutor's "Continue in noema-lite" link: a conversation whose context names a noema-linked
// course or topic (by id or by its exact title) opens that subject.
export function noemaSubjectOf(ctx, courses = study.courses()) {
  if (!ctx) return null;
  const keys = [ctx.courseId, ctx.topicId, ctx.id, ctx.label].filter(Boolean).map(String);
  for (const c of courses) {
    if (!c.noema?.subject) continue;
    if (keys.includes(c.id) || keys.includes(c.name)) return c.noema.subject;
    if ((c.topics || []).some((t) => t.noema && (keys.includes(t.id) || keys.includes(t.title)))) return c.noema.subject;
  }
  return null;
}

export function registerCloud(router) {
  router.route('/noema', hub);
  router.route('/noema/:id', subjectView);
  try {
    sync.start();
    watch();
    import('../ai/index.js').then((m) => m.setNoemaSubjectResolver?.((ctx) => noemaSubjectOf(ctx))).catch(() => {});
    if (backend()?.session()) {
      startConvoSync().catch(() => {});
      flush().catch(() => {});
    }
  } catch (e) { console.warn('[cloud]', e); }
}
