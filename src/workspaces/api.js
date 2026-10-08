// What every workspace module receives. A workspace module looks like:
//
//   export default async function mount(root, api) { root.append(...) }
//
// api.data(key, fallback) / api.save(key, value) keep the workspace's own data under
// meletee1:<account>:a:ws:<workspace>:<key>. api.topicPicker() lets the learner tie
// work to one of their courses and topics. api.ai is null until phase 4 adds the
// Claude/Gemini tutors; workspaces must work fully without it.
import * as store from '../core/store.js';
import * as study from '../core/study.js';
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';

export function makeApi(ws) {
  const key = (k) => `ws:${ws.id}:${k}`;
  return {
    id: ws.id,
    t: (k, vars) => t(`ws.${ws.id}.${k}`, vars),
    data: (k, fallback = null) => store.get(key(k), fallback),
    save: (k, v) => store.set(key(k), v),
    update: (k, fn, fallback) => store.update(key(k), fn, fallback),
    courses: () => study.courses(),
    // A select for "which course / topic is this about?". Value is { courseId, topicId } or null.
    topicPicker(value = null, onChange = () => {}) {
      const courses = study.courses();
      const sel = h('select.field', { id: `${ws.id}-topic`, 'aria-label': t('ws.common.topic'), onchange: () => {
        const [courseId, topicId] = sel.value.split('|');
        onChange(sel.value ? { courseId, topicId: topicId || null } : null);
      } },
      h('option', { value: '' }, t('ws.common.anyTopic')),
      courses.map((c) => [
        h('option', { value: c.id, selected: value?.courseId === c.id && !value?.topicId }, c.name),
        c.topics.map((tp) => h('option', { value: `${c.id}|${tp.id}`, selected: value?.topicId === tp.id }, `${c.name} › ${tp.title}`)),
      ]));
      return sel;
    },
    topicName(ref) {
      if (!ref) return '';
      const c = study.courses().find((x) => x.id === ref.courseId);
      if (!c) return '';
      const tp = ref.topicId && c.topics.find((x) => x.id === ref.topicId);
      return tp ? `${c.name} › ${tp.title}` : c.name;
    },
    ai: null,
  };
}
