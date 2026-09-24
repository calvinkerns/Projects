// Adds a version to every file the page loads (app.js?v=3fa9c21b) to avoid
// stale caches. Run it after changing anything in site/:
//   node tools/stamp.mjs           update the versions
//   node tools/stamp.mjs --check   fail if they're out of date (npm test runs this)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const STAMP = /\?v=[0-9a-f]{8}/g;

const files = [
  'index.html',
  ...readdirSync(join(SITE, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  ...readdirSync(join(SITE, 'css')).filter((f) => f.endsWith('.css')).map((f) => `css/${f}`),
].sort();

const read = (f) => readFileSync(join(SITE, f), 'utf8');

// one hash for the whole site, ignoring the versions themselves
const hash = createHash('sha256');
for (const f of files) hash.update(`${f}\n${read(f).replace(STAMP, '')}\n`);
const version = hash.digest('hex').slice(0, 8);

const stamp = {
  js: (text) => text.replace(/(from '\.\/[\w-]+\.js)(\?v=[0-9a-f]{8})?'/g, `$1?v=${version}'`),
  html: (text) => text.replace(/((?:src|href)="(?:js|css)\/[\w-]+\.(?:js|css))(\?v=[0-9a-f]{8})?"/g, `$1?v=${version}"`),
  css: (text) => text,
};

const checkOnly = process.argv.includes('--check');
const stale = [];
for (const f of files) {
  const before = read(f);
  const after = stamp[f.split('.').pop()](before);
  if (after === before) continue;
  stale.push(f);
  if (!checkOnly) writeFileSync(join(SITE, f), after);
}

if (checkOnly && stale.length) {
  console.error(`File versions are out of date in ${stale.join(', ')}. Run: node tools/stamp.mjs`);
  process.exit(1);
}
console.log(checkOnly ? `file versions are up to date (${version})` : `stamped ${stale.length} file(s) with version ${version}`);
