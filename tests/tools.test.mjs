// Toolsheds: every toolshed points at a real technique and real tools, and every tool has words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS, SHEDS, toolHref } from '../src/workspaces/tools.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const LANGS = ['en', 'el', 'ru', 'fr'];
const registry = readFileSync(new URL('../src/workspaces/registry.js', import.meta.url), 'utf8');

test('every toolshed is a compendium technique, in every language', () => {
  for (const l of LANGS) {
    const ids = new Set(json(`content/${l}/index.json`).sections.flatMap((s) => s.items.map((i) => i.id)));
    for (const s of SHEDS) assert.ok(ids.has(s.id), `${l}: ${s.id}`);
  }
  assert.equal(new Set(SHEDS.map((s) => s.id)).size, SHEDS.length, 'no technique twice');
});

test('every method in Learn has a toolshed', () => {
  const idx = json('content/en/index.json');
  const advice = new Set(['a-simple-rule-of-thumb', 'longhand-vs-laptop', 'dont-over-polish-notes']);
  const methods = idx.sections.filter((s) => ['techniques', 'notes', 'memory'].includes(s.kind)).flatMap((s) => s.items.map((i) => i.id));
  for (const id of methods) if (!advice.has(id)) assert.ok(SHEDS.some((s) => s.id === id), id);
});

test('toolsheds only use known tools, and every tool is in some toolshed', () => {
  const ids = new Set(TOOLS.map((x) => x.id));
  assert.equal(ids.size, TOOLS.length);
  for (const s of SHEDS) {
    assert.ok(s.tools.length >= 1 && s.tools.length <= 5, s.id);
    for (const t of s.tools) assert.ok(ids.has(t), `${s.id}: ${t}`);
  }
  for (const x of TOOLS) assert.ok(SHEDS.some((s) => s.tools.includes(x.id)), `unused ${x.id}`);
});

test('every tool opens something', () => {
  for (const x of TOOLS) {
    assert.ok(toolHref(x) || typeof x.action === 'function', x.id);
    if (x.ws) assert.match(registry, new RegExp(`id: '${x.ws}'`), x.ws);
    if (x.tab) assert.match(registry, new RegExp(`id: '${x.ws}'[^\\n]*tab:`), `${x.ws} takes a tab`);
  }
});

test('every tool has a name and a hint in all four languages', () => {
  const en = json('i18n/tools.en.json');
  for (const l of LANGS) {
    const d = json(`i18n/tools.${l}.json`);
    for (const x of TOOLS) for (const k of ['name', 'hint']) assert.ok(d[`tools.${x.id}.${k}`]?.trim(), `${l}: ${x.id}.${k}`);
    for (const k of Object.keys(en)) if (!/\.(one|few|many|other)$/.test(k)) assert.ok(d[k], `${l}: ${k}`);
  }
});
