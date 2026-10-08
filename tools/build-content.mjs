#!/usr/bin/env node
// Build content/<lang>.json from the compendium markdown in tools/compendium/<lang>.md.
// Node 22, zero dependencies. Run: node tools/build-content.mjs
//
// Shape (per language):
// { lang, title, byline?, sections: [{ id, kind, title, introHtml, reading:[{kind,label,html}], items: [Item] }] }
// Item: { id, title, leadHtml, structured, parts:{why,how,examples:{simple,nontrivial,html},time,watch,feels,evidence,instead},
//         time:{x:[lo,hi]|null,label:string|null}, reading:[{kind,label,html}], bodyHtml, subitems?:[Item] }
// item.reading holds every box in the item (subitems' too); subitem.reading holds only that subitem's boxes.
// `structured` = the item follows the why/how (or myth feels/instead) pattern; bodyHtml is always complete.
// Section and item ids are slugs of the ENGLISH headings and are identical in every language.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools', 'compendium');
const OUT = join(ROOT, 'content');
export const LANGS = ['en', 'el', 'ru', 'fr'];

// ---------------------------------------------------------------------------
// Labels per language -> part keys
// ---------------------------------------------------------------------------
const LABELS = {
  en: {
    why: 'Why it works.', how: 'How to do it.', examples: 'Examples.', time: '⏱ Time cost.', watch: 'Watch out.',
    feels: 'Why it feels productive.', evidence: 'What the evidence says.', instead: 'What to do instead.',
    simple: 'Simple:', nontrivial: 'Non-trivial:', reading: '📚 Further reading',
    article: 'Article:', paper: 'Paper:',
  },
  el: {
    why: 'Γιατί λειτουργεί.', how: 'Πώς να το κάνεις.', examples: 'Παραδείγματα.', time: '⏱ Χρόνος.', watch: 'Προσοχή.',
    feels: 'Γιατί μοιάζει παραγωγικό.', evidence: 'Τι λένε τα δεδομένα.', instead: "Τι να κάνεις αντί γι' αυτό.",
    simple: 'Απλό:', nontrivial: 'Πιο σύνθετο:', reading: '📚 Για περισσότερα',
    article: 'Άρθρο:', paper: 'Μελέτη:',
  },
  ru: {
    why: 'Почему это работает.', how: 'Как это делать.', examples: 'Примеры.', time: '⏱ Затраты времени.', watch: 'Осторожно.',
    feels: 'Почему кажется продуктивным.', evidence: 'Что говорят исследования.', instead: 'Что делать вместо этого.',
    simple: 'Простой:', nontrivial: 'Нетривиальный:', reading: '📚 Что почитать',
    article: 'Статья:', paper: 'Исследование:',
  },
  fr: {
    why: 'Pourquoi ça marche.', how: 'Comment faire.', examples: 'Exemples.', time: '⏱ Coût en temps.', watch: 'Attention.',
    feels: 'Pourquoi ça semble productif.', evidence: 'Ce que disent les données.', instead: 'Quoi faire à la place.',
    simple: 'Simple :', nontrivial: 'Plus subtil :', reading: '📚 Pour aller plus loin',
    article: 'Article :', paper: 'Étude :',
  },
};
const PART_KEYS = ['why', 'how', 'examples', 'time', 'watch', 'feels', 'evidence', 'instead'];

// Kinds keyed by the English section id.
const SECTION_KINDS = {
  'start-here': 'intro',
  'how-learning-works': 'principles',
  'time-cost-at-a-glance': 'timecost',
  'core-learning-techniques': 'techniques',
  'note-taking-and-understanding': 'notes',
  'memory-techniques-for-high-volume-facts': 'memory',
  'managing-many-sources': 'sources',
  'planning-and-organisation-across-a-term': 'planning',
  'focus-procrastination-and-adhd-friendly-strategies': 'focus',
  'anxiety-stress-and-wellbeing': 'anxiety',
  'motivation-and-making-study-enjoyable': 'motivation',
  'exams-and-exam-season': 'exams',
  'myths-and-low-yield-habits-to-drop': 'myths',
  'ideas-this-implies-for-the-app': 'app',
  'sources-and-further-reading': 'references',
};

// Normalise a label for comparison: unify all spaces (NBSP, narrow NBSP), apostrophes, case.
const norm = (s) => s.replace(/[\s\u00a0\u202f]+/g, ' ').replace(/[’ʼ]/g, "'").replace(/\s+([:.])/g, '$1').trim().toLowerCase();

// ---------------------------------------------------------------------------
// Markdown -> HTML (safe subset)
// ---------------------------------------------------------------------------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const PH = '\u0000'; // placeholder delimiter, never present in input
const PUNCT = '\\`*_{}[]()#+-.!|~<>"\'';

function safeUrl(url) {
  const u = url.trim();
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[#/.]/.test(u) && !/^\/\//.test(u)) return u; // relative
  return null;
}

// Find the closing bracket of a link label starting at i (s[i] === '['), honouring nesting.
function findClose(s, i, open, close) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j;
  }
  return -1;
}

export function inline(src) {
  const store = [];
  const raws = [];
  const put = (html, raw) => { raws.push(raw); return `${PH}${store.push(html) - 1}${PH}`; };
  const toRaw = (t) => t.replace(new RegExp(`${PH}(\\d+)${PH}`, 'g'), (_, n) => raws[+n]);
  let s = String(src);

  // 1. backslash escapes
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>"'])/g, (m, c) => put(escapeHtml(c), m));
  // 2. code spans
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, __, code) => put(`<code>${escapeHtml(code.trim())}</code>`, m));
  // 3. links [text](url) or [text](<url>)
  let out = '';
  for (let i = 0; i < s.length;) {
    if (s[i] === '[' ) {
      const close = findClose(s, i, '[', ']');
      if (close > 0 && s[close + 1] === '(') {
        let url, end;
        if (s[close + 2] === '<') {
          end = s.indexOf('>)', close + 3);
          if (end > 0) { url = s.slice(close + 3, end); end += 2; }
        } else {
          const pclose = findClose(s, close + 1, '(', ')');
          if (pclose > 0) { url = s.slice(close + 2, pclose).trim().split(/\s+/)[0]; end = pclose + 1; }
        }
        if (url !== undefined) {
          const label = inline(toRaw(s.slice(i + 1, close)));
          const href = safeUrl(toRaw(url).replace(/\\(.)/g, '$1'));
          out += put(href
            ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>`
            : label, toRaw(s.slice(i, end)));
          i = end;
          continue;
        }
      }
    }
    out += s[i++];
  }
  s = out;
  // 4. escape the rest, then emphasis
  s = escapeHtml(s);
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>');
  s = s.replace(/\*(?=[^\s*])([^*])\*/g, '<em>$1</em>');
  // 5. restore placeholders (repeat for nesting)
  const re = new RegExp(`${PH}(\\d+)${PH}`, 'g');
  while (re.test(s)) s = s.replace(re, (_, n) => store[+n]);
  return s;
}
// --- block parsing ---
const RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const indentOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (t[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += t[i];
  }
  cells.push(cur.trim());
  return cells;
}

export function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  const startsBlock = (l, next) =>
    RE_HEAD.test(l) || /^\s*>/.test(l) || RE_LIST.test(l) || RE_HR.test(l) || (/^\s*\|/.test(l) && next !== undefined && isTableSep(next));
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(RE_HEAD))) { blocks.push({ type: 'heading', level: m[1].length, text: m[2] }); i++; continue; }
    if (RE_HR.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const inner = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', blocks: parseBlocks(inner) });
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null));
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: 'table', head, aligns, rows });
      continue;
    }
    if (RE_LIST.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    // paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push({ type: 'p', text: para.join(' ') });
  }
  return blocks;
}

function parseList(lines, start) {
  const first = lines[start].match(RE_LIST);
  const baseIndent = indentOf(lines[start]);
  const ordered = /\d/.test(first[2]);
  const block = { type: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items: [] };
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(RE_LIST);
    if (m && indentOf(line) === baseIndent && /\d/.test(m[2]) === ordered) {
      let text = m[3];
      const item = { text: '', task: null, children: [] };
      const t = text.match(/^\[([ xX])\]\s+(.*)$/);
      if (t) { item.task = t[1] !== ' '; text = t[2]; }
      const own = [text];
      const sub = [];
      i++;
      // continuation and nested content: lines indented deeper than the marker, or lazy continuation
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // blank: continue only if the next non-blank line is indented deeper (nested content) or a sibling item
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && indentOf(lines[j]) > baseIndent) { sub.push(''); i++; continue; }
          break;
        }
        if (indentOf(l) > baseIndent) { (sub.length || RE_LIST.test(l) ? sub : own).push(sub.length || RE_LIST.test(l) ? l : l.trim()); i++; continue; }
        if (!RE_LIST.test(l) && !RE_HEAD.test(l) && !/^\s*[>|]/.test(l) && !sub.length) { own.push(l.trim()); i++; continue; }
        break;
      }
      item.text = own.join(' ');
      if (sub.length) {
        const minIndent = Math.min(...sub.filter((l) => l.trim()).map(indentOf));
        item.children = parseBlocks(sub.map((l) => l.slice(Math.min(minIndent, indentOf(l)))));
      }
      block.items.push(item);
      // allow one blank line between sibling items (loose list)
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      const nm = j < lines.length && lines[j].match(RE_LIST);
      if (nm && indentOf(lines[j]) === baseIndent && /\d/.test(nm[2]) === ordered && j > i) i = j;
      continue;
    }
    break;
  }
  return { block, next: i };
}

export function renderBlocks(blocks) {
  return blocks.map(renderBlock).join('');
}
function renderBlock(b) {
  switch (b.type) {
    case 'p': return `<p>${inline(b.text)}</p>`;
    case 'heading': return `<h${b.level}>${inline(b.text)}</h${b.level}>`;
    case 'hr': return '<hr>';
    case 'quote': return `<blockquote>${renderBlocks(b.blocks)}</blockquote>`;
    case 'table': {
      const cell = (tag, c, k) => `<${tag}${b.aligns[k] ? ` style="text-align:${b.aligns[k]}"` : ''}>${inline(c)}</${tag}>`;
      const head = `<thead><tr>${b.head.map((c, k) => cell('th', c, k)).join('')}</tr></thead>`;
      const body = `<tbody>${b.rows.map((r) => `<tr>${b.head.map((_, k) => cell('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody>`;
      return `<table>${head}${body}</table>`;
    }
    case 'list': {
      const isTask = b.items.some((it) => it.task !== null);
      const tag = b.ordered ? 'ol' : 'ul';
      const attrs = (b.ordered && b.start !== 1 ? ` start="${b.start}"` : '') + (isTask ? ' class="checklist"' : '');
      const items = b.items.map((it) => {
        const box = it.task === null ? '' : `<input type="checkbox" disabled${it.task ? ' checked' : ''}> `;
        return `<li${it.task === null ? '' : ' class="task"'}>${box}${inline(it.text)}${renderBlocks(it.children)}</li>`;
      }).join('');
      return `<${tag}${attrs}>${items}</${tag}>`;
    }
    default: throw new Error(`unknown block ${b.type}`);
  }
}

export const md = (text) => renderBlocks(parseBlocks(String(text).split('\n')));

// ---------------------------------------------------------------------------
// Compendium structure
// ---------------------------------------------------------------------------
export function slug(s) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’"“”«»]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Strip markdown emphasis from a heading-ish string for plain titles.
const plain = (s) => s.replace(/\\(.)/g, '$1').replace(/\*\*|\*/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
const unescapeMd = (s) => s.replace(/\\(.)/g, '$1');

// Split a document into title, byline, and sections -> items (### ) -> lines
function splitDoc(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const doc = { title: null, byline: null, sections: [] };
  let sec = null, item = null, pre = [];
  for (const line of lines) {
    let m;
    if (!doc.title && (m = line.match(/^#\s+(.*)$/))) { doc.title = m[1].trim(); continue; }
    if ((m = line.match(/^##\s+(.*)$/))) {
      sec = { title: m[1].trim(), intro: [], items: [] };
      doc.sections.push(sec);
      item = null;
      continue;
    }
    if ((m = line.match(/^###\s+(.*)$/)) && sec) {
      item = { title: m[1].trim(), lines: [] };
      sec.items.push(item);
      continue;
    }
    if (item) item.lines.push(line);
    else if (sec) sec.intro.push(line);
    else pre.push(line);
  }
  const by = pre.map((l) => l.trim()).filter(Boolean);
  if (by.length) doc.byline = by.join(' ');
  return doc;
}

const isReadingBox = (b, L) => b.type === 'quote' && b.blocks[0]?.type === 'p' && /^\*\*\s*📚/.test(b.blocks[0].text);

function readingEntries(box, L) {
  const out = [];
  for (const b of box.blocks.slice(1)) {
    const lines = b.type === 'list' ? b.items.map((it) => it) : [{ text: b.text, children: [] }];
    for (const it of lines) {
      let text = it.text;
      let kind = 'other';
      const m = text.match(/^([^:\[\]*]{1,40}?)\s*:\s+/);
      if (m) {
        const label = norm(m[1] + ':');
        if (label === norm(L.article)) kind = 'article';
        else if (label === norm(L.paper)) kind = 'paper';
        text = text.slice(m[0].length);
      }
      out.push({ kind, label: m ? m[1].trim() : null, html: inline(text) + renderBlocks(it.children || []) });
    }
  }
  return out;
}

// Which part label (if any) a paragraph starts with. Returns { key, rest }.
function partLabel(b, L) {
  if (b.type !== 'p') return null;
  const m = b.text.match(/^\*\*(.+?)\*\*\s*/);
  if (!m) return null;
  const n = norm(m[1]);
  for (const k of PART_KEYS) if (norm(L[k]) === n) return { key: k, rest: b.text.slice(m[0].length) };
  return null;
}

const MULT_RE = /(~|≈|около\s|environ\s|περίπου\s)?\s*(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*(\d+(?:[.,]\d+)?))?\s*×/;
const APPROX_RE = /(about|roughly|around|environ|à peu près|περίπου|γύρω στα|около|примерно|порядка)\s*$/i;
export function parseTime(md) {
  if (!md) return { x: null, label: null };
  const text = unescapeMd(md);
  const m = text.match(MULT_RE);
  if (!m) return { x: null, label: null };
  const lo = parseFloat(m[2].replace(',', '.'));
  const hi = m[3] ? parseFloat(m[3].replace(',', '.')) : lo;
  // "~" when the source marks the figure as approximate (tilde or an "about/roughly" word right before it).
  const tilde = m[1] || APPROX_RE.test(text.slice(Math.max(0, m.index - 24), m.index)) ? '~' : '';
  return { x: [lo, hi], label: `${tilde}${m[2]}${m[3] ? '–' + m[3] : ''}×` };
}

// Analyse a block list belonging to one item (or subitem): lead + parts.
function analyse(blocks, L) {
  const lead = [];
  const segs = [];
  let cur = null;
  for (const b of blocks) {
    const lab = partLabel(b, L);
    if (lab) {
      cur = { key: lab.key, blocks: lab.rest.trim() ? [{ type: 'p', text: lab.rest.trim() }] : [], rawFirst: lab.rest };
      segs.push(cur);
      continue;
    }
    (cur ? cur.blocks : lead).push(b);
  }
  const parts = {};
  let timeRaw = null;
  for (const s of segs) {
    if (s.key === 'examples') {
      const ex = { simple: null, nontrivial: null, html: renderBlocks(s.blocks) };
      for (const b of s.blocks) {
        if (b.type !== 'list') continue;
        for (const it of b.items) {
          const m = it.text.match(/^\*([^*]+)\*\s*/);
          if (!m) continue;
          const n = norm(m[1]);
          const rest = inline(it.text.slice(m[0].length)) + renderBlocks(it.children);
          if (n === norm(L.simple) && ex.simple === null) ex.simple = rest;
          else if (n === norm(L.nontrivial) && ex.nontrivial === null) ex.nontrivial = rest;
        }
      }
      parts.examples = parts.examples ? { ...parts.examples, html: parts.examples.html + ex.html } : ex;
    } else {
      const html = renderBlocks(s.blocks);
      parts[s.key] = parts[s.key] ? parts[s.key] + html : html;
      if (s.key === 'time') timeRaw = (timeRaw ? timeRaw + ' ' : '') + blocksText(s.blocks);
    }
  }
  return { leadHtml: renderBlocks(lead), parts, time: parseTime(timeRaw) };
}
const blocksText = (blocks) => blocks.map((b) => (b.type === 'p' ? b.text : b.type === 'list' ? b.items.map((i) => i.text).join(' ') : '')).join(' ');

function buildItem(raw, L) {
  const blocks = parseBlocks(raw.lines);
  const reading = [];
  const body = [];
  // group into pre-subitem blocks and #### subitems
  const groups = [{ title: null, blocks: [], reading: [] }];
  for (const b of blocks) {
    if (b.type === 'heading' && b.level >= 4) {
      groups.push({ title: b.text, blocks: [], reading: [] });
      body.push(b);
      continue;
    }
    if (isReadingBox(b, L)) {
      const entries = readingEntries(b, L);
      reading.push(...entries);
      // A box whose header carries a qualifier, e.g. "Further reading (Staying organised)", belongs to the parent item.
      const qualified = /\(.+\)\s*\*\*\s*$/.test(b.blocks[0].text);
      if (!qualified) groups[groups.length - 1].reading.push(...entries);
      continue;
    }
    groups[groups.length - 1].blocks.push(b);
    body.push(b);
  }
  const a = analyse(groups[0].blocks, L);
  const item = {
    title: plain(raw.title),
    leadHtml: a.leadHtml,
    structured: false,
    parts: a.parts,
    time: a.time,
    reading,
    bodyHtml: renderBlocks(body),
  };
  item.structured = isStructured(item.parts);
  if (groups.length > 1) {
    item.subitems = groups.slice(1).map((g) => {
      const s = analyse(g.blocks, L);
      const sub = {
        title: plain(g.title),
        leadHtml: s.leadHtml,
        structured: isStructured(s.parts),
        parts: s.parts,
        time: s.time,
        reading: g.reading,
        bodyHtml: renderBlocks(g.blocks),
      };
      return sub;
    });
  }
  return item;
}
const isStructured = (p) => Boolean((p.why && p.how) || (p.feels && p.instead));

export function buildLang(lang, text) {
  const L = LABELS[lang];
  const doc = splitDoc(text);
  return {
    lang,
    title: plain(doc.title || ''),
    ...(doc.byline ? { byline: doc.byline } : {}),
    sections: doc.sections.map((s) => {
      // Section intros can carry their own Further reading box (e.g. Motivation): lift it into section.reading.
      const blocks = parseBlocks(s.intro);
      const reading = blocks.filter((b) => isReadingBox(b, L)).flatMap((b) => readingEntries(b, L));
      return {
        id: null,
        kind: null,
        title: plain(s.title),
        introHtml: renderBlocks(blocks.filter((b) => !isReadingBox(b, L))),
        reading,
        items: s.items.map((it) => buildItem(it, L)),
      };
    }),
  };
}

// Structural signature used to check that languages line up.
const signature = (d) => d.sections.map((s) => `${s.items.length}[${s.items.map((i) => i.subitems?.length ?? 0).join(',')}]`).join('|');

function assignIds(en) {
  const used = new Set();
  const uniq = (base, prefix) => {
    let id = base || 'item';
    if (used.has(id)) id = `${prefix}-${base}`;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  const ids = [];
  for (const s of en.sections) {
    const sid = slug(s.title.split(':')[0]);
    if (!(sid in SECTION_KINDS)) throw new Error(`No kind for section id "${sid}"`);
    const sec = { id: uniq(sid, 'section'), items: [] };
    for (const it of s.items) {
      const iid = uniq(slug(it.title), sid);
      sec.items.push({ id: iid, subitems: (it.subitems || []).map((sub) => uniq(slug(sub.title), iid)) });
    }
    ids.push(sec);
  }
  return ids;
}

function applyIds(doc, ids) {
  doc.sections = doc.sections.map((s, k) => {
    const sid = ids[k].id;
    const kind = SECTION_KINDS[sid];
    const out = { id: sid, kind, title: s.title, introHtml: s.introHtml, reading: s.reading, items: [] };
    if (kind === 'app') {
      // Checklist section: keep only html.
      out.items = s.items.map((it, j) => ({ id: ids[k].items[j].id, title: it.title, bodyHtml: it.bodyHtml }));
      return out;
    }
    out.items = s.items.map((it, j) => {
      const o = { id: ids[k].items[j].id, ...it };
      if (it.subitems) o.subitems = it.subitems.map((sub, n) => ({ id: ids[k].items[j].subitems[n], ...sub }));
      return o;
    });
    return out;
  });
  return doc;
}

export function buildAll() {
  const docs = {};
  for (const lang of LANGS) docs[lang] = buildLang(lang, readFileSync(join(SRC, `${lang}.md`), 'utf8'));
  const ids = assignIds(docs.en);
  const sigEn = signature(docs.en);
  const warnings = [];
  for (const lang of LANGS) {
    const sig = signature(docs[lang]);
    if (sig !== sigEn) throw new Error(`Structure of ${lang}.md differs from en.md:\n en: ${sigEn}\n ${lang}: ${sig}`);
    applyIds(docs[lang], ids);
  }
  // Cross-language checks on parsed parts (warnings only).
  for (const lang of LANGS.slice(1)) {
    docs.en.sections.forEach((s, k) => s.items.forEach((it, j) => {
      const other = docs[lang].sections[k].items[j];
      const a = Object.keys(it.parts || {}).sort().join(','), b = Object.keys(other.parts || {}).sort().join(',');
      if (a !== b) warnings.push(`${lang}: ${it.id} parts [${b}] vs en [${a}]`);
      if (JSON.stringify(it.time?.x) !== JSON.stringify(other.time?.x)) warnings.push(`${lang}: ${it.id} time.x ${JSON.stringify(other.time?.x)} vs en ${JSON.stringify(it.time?.x)}`);
    }));
  }
  return { docs, warnings };
}

// The app loads a small index first and each section on demand:
//   content/<lang>/index.json   titles, kinds, time badges and a short lead per item
//   content/<lang>/<section>.json   the full section
const toText = (html = '') => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const clip = (s, n = 160) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
function writeSplit(lang, doc) {
  const dir = join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  const index = { lang: doc.lang, title: doc.title, sections: doc.sections.map((s) => ({
    id: s.id, title: s.title, kind: s.kind,
    items: s.items.map((it) => ({ id: it.id, title: it.title, time: it.time, lead: clip(toText(it.leadHtml || it.bodyHtml)) })),
  })) };
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index) + '\n');
  for (const s of doc.sections) writeFileSync(join(dir, `${s.id}.json`), JSON.stringify(s) + '\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { docs, warnings } = buildAll();
  mkdirSync(OUT, { recursive: true });
  for (const lang of LANGS) {
    const file = join(OUT, `${lang}.json`);
    const json = JSON.stringify(docs[lang]);
    writeFileSync(file, json + '\n');
    const items = docs[lang].sections.reduce((n, s) => n + s.items.length, 0);
    console.log(`content/${lang}.json  ${(json.length / 1024).toFixed(1)} KB  ${docs[lang].sections.length} sections, ${items} items`);
    writeSplit(lang, docs[lang]);
  }
  for (const w of warnings) console.warn('warn:', w);
}
