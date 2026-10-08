// Tests for the generated content/<lang>.json files. Run: node --test tests/content.test.mjs
// (Build first with: node tools/build-content.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inline, md } from '../tools/build-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'el', 'ru', 'fr'];
const file = (lang) => join(ROOT, 'content', `${lang}.json`);
const load = (lang) => JSON.parse(readFileSync(file(lang), 'utf8'));

// Every html string in a value, with a path for error messages.
function* htmlStrings(v, path = '') {
  if (typeof v === 'string') { if (/html$/i.test(path.split('.').pop()) || /\.parts\./.test(path)) yield [path, v]; return; }
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* htmlStrings(v[i], `${path}[${i}]`); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* htmlStrings(x, path ? `${path}.${k}` : k);
}
// Links in the canonical (non-duplicated) html: section intro + section reading + item body + item reading.
function countLinks(doc) {
  const count = (h) => (h.match(/<a /g) || []).length;
  let n = 0;
  for (const s of doc.sections) {
    n += count(s.introHtml) + (s.reading || []).reduce((a, r) => a + count(r.html), 0);
    for (const it of s.items) n += count(it.bodyHtml) + (it.reading || []).reduce((a, r) => a + count(r.html), 0);
  }
  return n;
}

test('all 4 language files exist and parse', () => {
  for (const lang of LANGS) {
    assert.ok(existsSync(file(lang)), `missing content/${lang}.json`);
    const d = load(lang);
    assert.equal(d.lang, lang);
    assert.ok(d.title && d.sections.length === 15, `${lang}: title and 15 sections`);
  }
});

test('same section ids, kinds and item ids in the same order in every language', () => {
  const shape = (d) => d.sections.map((s) => ({
    id: s.id, kind: s.kind,
    items: s.items.map((i) => [i.id, ...(i.subitems || []).map((u) => u.id)].join('/')),
  }));
  const en = shape(load('en'));
  assert.equal(en.reduce((n, s) => n + s.items.length, 0), 123);
  for (const lang of LANGS.slice(1)) assert.deepEqual(shape(load(lang)), en, lang);
});

test('ids are unique across a file', () => {
  const d = load('en');
  const ids = d.sections.flatMap((s) => [s.id, ...s.items.flatMap((i) => [i.id, ...(i.subitems || []).map((u) => u.id)])]);
  assert.equal(new Set(ids).size, ids.length);
});

test('every item has bodyHtml', () => {
  for (const lang of LANGS) for (const s of load(lang).sections) for (const it of s.items) {
    assert.ok(typeof it.bodyHtml === 'string' && it.bodyHtml.length > 0, `${lang}: ${it.id} bodyHtml`);
  }
});

test('every English technique has why, how and time', () => {
  const tech = load('en').sections.find((s) => s.kind === 'techniques');
  const items = tech.items.filter((i) => i.structured);
  assert.ok(items.length >= 13);
  for (const it of items) {
    for (const k of ['why', 'how', 'time']) assert.ok(it.parts[k], `${it.id} missing ${k}`);
    assert.ok(it.parts.examples?.simple && it.parts.examples?.nontrivial, `${it.id} examples`);
    assert.ok(Array.isArray(it.time.x) && it.time.x.length === 2, `${it.id} time.x`);
  }
});

test('link counts match English and the markdown source', () => {
  const en = countLinks(load('en'));
  const src = (readFileSync(join(ROOT, 'tools', 'compendium', 'en.md'), 'utf8').match(/\]\(/g) || []).length;
  assert.equal(en, src, 'every markdown link in en.md is rendered');
  for (const lang of LANGS.slice(1)) assert.equal(countLinks(load(lang)), en, lang);
});

test('no leftover raw markdown markers and no <script', () => {
  for (const lang of LANGS) {
    for (const [path, h] of htmlStrings(load(lang))) {
      assert.ok(!h.includes('**'), `${lang} ${path}: "**"`);
      assert.ok(!h.includes('](http'), `${lang} ${path}: "](http"`);
      assert.ok(!/<script/i.test(h), `${lang} ${path}: <script`);
      assert.ok(!/\\[~*_[\]]/.test(h), `${lang} ${path}: unprocessed escape`);
    }
  }
});

test('time.x and labels agree across languages', () => {
  const xs = (d) => d.sections.flatMap((s) => s.items.map((i) => JSON.stringify(i.time?.x ?? null)));
  const en = xs(load('en'));
  for (const lang of LANGS.slice(1)) assert.deepEqual(xs(load(lang)), en, lang);
});

test('markdown converter escapes html and handles the subset', () => {
  assert.equal(inline('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  assert.equal(inline('**a** *b* `c<d`'), '<strong>a</strong> <em>b</em> <code>c&lt;d</code>');
  assert.equal(inline('\\~10 \\*x\\*'), '~10 *x*');
  assert.equal(inline('[t](javascript:alert(1))'), 't');
  assert.equal(inline('[x](<https://a.b/c(1)>)'), '<a href="https://a.b/c(1)" target="_blank" rel="noopener">x</a>');
  assert.equal(inline('[x "q"](https://a.b/?a=1&b=2)'), '<a href="https://a.b/?a=1&amp;b=2" target="_blank" rel="noopener">x &quot;q&quot;</a>');
  assert.equal(md('- a\n  - b\n- c'), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  assert.equal(md('3. a\n4. b'), '<ol start="3"><li>a</li><li>b</li></ol>');
  assert.equal(md('- [ ] a\n- [x] b'), '<ul class="checklist"><li class="task"><input type="checkbox" disabled> a</li><li class="task"><input type="checkbox" disabled checked> b</li></ul>');
  assert.equal(md('| a | b |\n| --- | --- |\n| 1 | 2 |'), '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
  assert.equal(md('> **q**\n>\n> - x'), '<blockquote><p><strong>q</strong></p><ul><li>x</li></ul></blockquote>');
});
