// Feynman technique: explain a concept in plain words, as if to a 12-year-old.
// Gentle live flags for jargon and long sentences, a "where did I get stuck?" list,
// and saved versions so each rewrite can be compared with the last.
import { h, sheet, toast } from '../core/dom.js';
import { lang, tn } from '../core/i18n.js';
import { jargon, longSentences, words, norm } from './b-core.js';
import { uid, now, when, aiSlot, field } from './b-ui.js';

export default async function mount(root, api) {
  const t = api.t;
  const el = h('div.ws-b.ws-feynman');
  root.append(el);
  const all = () => api.data('concepts', []);
  const get = (id) => all().find((c) => c.id === id) || null;
  const put = (c) => api.update('concepts', (l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [c, ...l]), []);
  const patch = (id, fn) => { const c = get(id); if (c) put(fn(c)); return get(id); };

  const draw = (focus) => {
    const cur = get(api.data('current', null));
    el.replaceChildren(cur ? explain(cur) : start());
    (focus ? el.querySelector(focus) : el.querySelector('[data-focus]'))?.focus();
  };

  function start() {
    const title = h('input.field', { id: 'feynman-title', placeholder: t('titlePlaceholder'), 'data-focus': true });
    let topic = null;
    const list = all();
    return h('div.stack-lg',
      h('form.card.stack.ws-b-calm', { onsubmit: (e) => {
        e.preventDefault();
        if (!title.value.trim()) { title.focus(); return; }
        const c = { id: uid('fy'), at: now(), title: title.value.trim(), topic, text: '', marked: [], ignore: [], stuck: [], versions: [] };
        put(c); api.save('current', c.id); draw();
      } },
        h('h2', t('startTitle')),
        h('p.muted', t('startLede')),
        field(t('titleLabel'), title),
        field(t('topic'), api.topicPicker(null, (v) => { topic = v; })),
        h('div.row.ws-b-actions', h('button.btn', { type: 'submit' }, t('start')))),
      list.length ? h('section.stack',
        h('h2', t('pastTitle')),
        h('div.list', list.map((c) => h('button.ws-b-row', { type: 'button', onclick: () => { api.save('current', c.id); draw(); } },
          h('span.label', c.title, h('span.muted.small.ws-b-sub', when(c.at))),
          h('span.badge', tn('ws.feynman.versions', c.versions.length)))))) : null);
  }

  function explain(c) {
    const area = h('textarea.field.ws-b-page', { id: 'feynman-text', rows: 10, 'aria-label': t('textLabel'), placeholder: t('textPlaceholder'), 'data-focus': true }, c.text);
    const flags = h('div.stack.ws-feynman-flags', { 'aria-live': 'polite' });
    const drawFlags = () => {
      const cur = get(c.id);
      const text = area.value;
      const jw = jargon(text, { lang: lang(), marked: cur.marked, ignore: cur.ignore });
      const ls = longSentences(text);
      if (!words(text).length) { flags.replaceChildren(h('p.muted.small', '🧒 ', t('kidHint'))); return; }
      if (!jw.length && !ls.length) { flags.replaceChildren(h('p.ws-b-note.ok', '✨ ', t('allPlain'))); return; }
      flags.replaceChildren(
        jw.length ? h('div.stack',
          h('p.small.ws-b-flaghead', '🧐 ', t('jargonHead')),
          h('div.row.ws-feynman-words', jw.map((j) => h('button.chip.ws-feynman-word', {
            type: 'button', 'data-why': j.why, title: t(`why.${j.why}`), 'aria-label': `${j.word}. ${t(`why.${j.why}`)}. ${t('fineTip')}`,
            onclick: () => { patch(c.id, (x) => ({ ...x, ignore: [...x.ignore, j.key], marked: x.marked.filter((m) => m !== j.key) })); drawFlags(); },
          }, j.word, h('span.ws-feynman-x', { 'aria-hidden': 'true' }, '✓')))),
          h('p.muted.small', t('fineTip'))) : null,
        ls.length ? h('div.stack',
          h('p.small.ws-b-flaghead', '🫧 ', t('longHead')),
          h('ul.ws-b-gaps', ls.map((s) => h('li.small', `“${s.text.split(/\s+/).slice(0, 8).join(' ')}…” `, h('span.muted', tn('ws.feynman.sentenceWords', s.words)))))) : null);
    };
    area.addEventListener('input', () => { patch(c.id, (x) => ({ ...x, text: area.value })); drawFlags(); });
    drawFlags();

    const markInput = h('input.field', { id: 'feynman-mark', placeholder: t('markPlaceholder') });
    const markForm = h('form.row.ws-b-inline', { onsubmit: (e) => {
      e.preventDefault();
      const w = markInput.value.trim();
      if (!w) return;
      patch(c.id, (x) => ({ ...x, marked: [...new Set([...x.marked, norm(w)])], ignore: x.ignore.filter((i) => i !== norm(w)) }));
      markInput.value = '';
      drawFlags();
    } }, h('label.sr-only', { for: 'feynman-mark' }, t('markLabel')), markInput, h('button.btn.soft.small', { type: 'submit' }, t('mark')));

    const stuckInput = h('input.field', { id: 'feynman-stuck', placeholder: t('stuckPlaceholder') });
    const stuckList = (cur) => h('ul.plain.ws-feynman-stuck', cur.stuck.map((s) => h('li', h('label.check',
      h('input', { type: 'checkbox', checked: s.done, onchange: (e) => { patch(c.id, (x) => ({ ...x, stuck: x.stuck.map((y) => (y.id === s.id ? { ...y, done: e.target.checked } : y)) })); } }),
      h('span', s.text)))));
    const list = all();
    return h('div.stack-lg',
      h('div.stack',
        h('div.row.ws-b-between',
          h('div', { style: { minWidth: '0' } }, h('p.eyebrow', api.topicName(c.topic) || t('eyebrow')), h('h2.ws-b-wrap', c.title)),
          h('div.row',
            list.length > 1 ? h('select.field.ws-b-switch', { 'aria-label': t('switch'), onchange: (e) => { api.save('current', e.target.value); draw(); } },
              list.map((x) => h('option', { value: x.id, selected: x.id === c.id }, x.title))) : null,
            h('button.btn.ghost.small', { type: 'button', onclick: () => { api.save('current', null); draw(); } }, '＋ ', t('new')))),
        h('p.muted.small', t('explainLede')),
        area,
        flags,
        aiSlot(api, t('ai'), () => ({ title: c.title, text: area.value })),
        h('div.row.ws-b-actions', h('button.btn', { type: 'button', onclick: () => {
          const text = area.value.trim();
          if (!text) { area.focus(); return; }
          const cur = patch(c.id, (x) => ({ ...x, text: area.value, versions: [{ at: now(), text }, ...x.versions] }));
          toast(t('saved', { n: cur.versions.length }));
          draw('#feynman-text');
        } }, t('saveVersion')))),
      h('details.ws-b-fold', { open: c.stuck.some((s) => !s.done) },
        h('summary', '🪨 ', t('stuckTitle'), ' ', h('span.badge', String(c.stuck.filter((s) => !s.done).length))),
        h('div.stack',
          h('p.muted.small', t('stuckLede')),
          stuckList(c),
          h('form.row.ws-b-inline', { onsubmit: (e) => {
            e.preventDefault();
            const v = stuckInput.value.trim();
            if (!v) return;
            patch(c.id, (x) => ({ ...x, stuck: [...x.stuck, { id: uid('st'), text: v, done: false }] }));
            draw('#feynman-stuck');
          } }, h('label.sr-only', { for: 'feynman-stuck' }, t('stuckLabel')), stuckInput, h('button.btn.soft.small', { type: 'submit' }, t('add'))))),
      h('details.ws-b-fold',
        h('summary', '🏷 ', t('jargonTitle')),
        h('div.stack', h('p.muted.small', t('jargonLede')), markForm)),
      h('details.ws-b-fold',
        h('summary', '🗂 ', t('versionsTitle'), ' ', h('span.badge', String(c.versions.length))),
        c.versions.length ? h('div.list', c.versions.map((v, i) => h('button.ws-b-row', { type: 'button', onclick: () => showVersion(c, v, c.versions.length - i) },
          h('span.label', t('versionN', { n: c.versions.length - i }), h('span.muted.small.ws-b-sub', when(v.at, true))),
          h('span.badge', tn('ws.feynman.words', words(v.text).length)))))
          : h('p.muted.small', t('noVersions'))));
  }

  function showVersion(c, v, n) {
    let close;
    close = sheet(h('div.stack',
      h('p.eyebrow', when(v.at, true)),
      h('h2', t('versionN', { n })),
      h('p.ws-b-pre', v.text),
      h('div.row.ws-b-actions',
        h('button.btn.ghost.small', { type: 'button', onclick: () => close() }, t('close')),
        h('button.btn.small', { type: 'button', onclick: () => { patch(c.id, (x) => ({ ...x, text: v.text })); close(); draw('#feynman-text'); } }, t('restore')))),
    { label: t('versionN', { n }) });
  }

  draw();
}
