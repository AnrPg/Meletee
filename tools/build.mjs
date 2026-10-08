// Builds the static site into dist/site.
//   node tools/build.mjs          content + site
// The app runs unbundled (ES modules), so the build copies files and stamps the
// service-worker cache version with a hash of everything it ships.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'site');
const SHIP = ['index.html', 'config.js', 'manifest.webmanifest', 'sw.js', 'src', 'styles', 'i18n', 'content', 'assets'];

execFileSync(process.execPath, [join(root, 'tools', 'build-content.mjs')], { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// content/<lang>.json are the full build outputs used by tests; the app ships only the split files.
const skip = (src) => /[/\\]content[/\\][a-z]{2}\.json$/.test(src);
for (const p of SHIP) if (existsSync(join(root, p))) cpSync(join(root, p), join(out, p), { recursive: true, filter: (src) => !skip(src) });

const hash = createHash('sha256');
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else hash.update(name).update(readFileSync(p));
  }
})(out);
const version = hash.digest('hex').slice(0, 10);
const sw = join(out, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace("const VERSION = 'dev';", `const VERSION = '${version}';`));
console.log(`built dist/site (version ${version})`);
