// Builds dist/meletee.html: the whole app in one file that also works opened from disk (file://).
//   node tools/build-single.mjs        (npm run build:single)
// No bundler: every ES module under src/ becomes a data: URL in an import map, with its relative
// imports (static and dynamic) rewritten to the map's names ("@meletee/src/…"). Stylesheets and
// config.js are inlined, and the interface strings and compendium content of every language travel
// in one JSON block (globalThis.__meleteeFiles, read by src/core/i18n.js and src/core/content.js).
// Everything local works offline; the cloud, buddies, noema-lite and the AI tutors need a connection.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'meletee.html');
const PREFIX = '@meletee/';

const walk = (dir) => readdirSync(dir).sort().flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const rel = (p) => relative(root, p).split(/[\\/]/).join('/');

// content/<lang>/*.json come from the compendium; build them if this checkout has none yet.
if (!existsSync(join(root, 'content', 'en', 'index.json'))) {
  execFileSync(process.execPath, [join(root, 'tools', 'build-content.mjs')], { stdio: 'inherit' });
}

// ---------- modules -> import map ----------
// Matches  from './x.js'  |  import './x.js'  |  import('./x.js')  with a relative specifier.
const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g;

export function rewrite(code, file) {
  const dir = posix.dirname(file);
  return code.replace(SPEC, (m, head, q, spec) => `${head}${q}${PREFIX}${posix.normalize(posix.join(dir, spec))}${q}`);
}

const imports = {};
const modules = walk(join(root, 'src')).filter((p) => p.endsWith('.js'));
for (const p of modules) {
  const name = rel(p);
  const code = rewrite(readFileSync(p, 'utf8'), name) + `\n//# sourceURL=${name}\n`;
  imports[PREFIX + name] = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
}

// ---------- data: interface strings and content for every language ----------
const files = {};
for (const p of walk(join(root, 'i18n')).filter((f) => f.endsWith('.json'))) files[rel(p)] = JSON.parse(readFileSync(p, 'utf8'));
for (const p of walk(join(root, 'content')).filter((f) => /content[\\/][a-z]{2}[\\/][^\\/]+\.json$/.test(f))) files[rel(p)] = JSON.parse(readFileSync(p, 'utf8'));

// JSON inside <script>: "</" must not end the element early.
const safe = (v) => JSON.stringify(v).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');

// ---------- page ----------
let html = readFileSync(join(root, 'index.html'), 'utf8');
const icon = 'data:image/svg+xml;base64,' + readFileSync(join(root, 'assets', 'icon.svg')).toString('base64');
html = html
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
  .replace(/<link rel="icon" href="assets\/icon\.svg"[^>]*>/, `<link rel="icon" href="${icon}" type="image/svg+xml">`)
  .replace(/<link rel="stylesheet" href="(styles\/[^"]+)">/g, (m, href) => `<style>\n${readFileSync(join(root, href), 'utf8')}</style>`)
  .replace('<script src="config.js"></script>', () => `<script>\n${readFileSync(join(root, 'config.js'), 'utf8')}</script>`)
  .replace('<script type="module" src="src/main.js"></script>', () => [
    `<script>globalThis.__meleteeFiles = ${safe(files)};</script>`,
    `<script type="importmap">${safe({ imports })}</script>`,
    `<script type="module">import '${PREFIX}src/main.js';</script>`,
  ].join('\n'));
if (/src="src\/|href="styles\//.test(html)) throw new Error('index.html changed: something was not inlined');

mkdirSync(dirname(out), { recursive: true });
// write then rename, so a reader (or a parallel test run) never sees half a file
const tmp = `${out}.${process.pid}.tmp`;
writeFileSync(tmp, html);
renameSync(tmp, out);
console.log(`built dist/meletee.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB, ${modules.length} modules, ${Object.keys(files).length} data files)`);
