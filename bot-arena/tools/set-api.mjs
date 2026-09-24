// Point the site at a deployed Surge API.
//   node tools/set-api.mjs https://surge-api.<you>.workers.dev
// Writes the address into site/js/config.js and lets the page connect to it
// (the Content-Security-Policy in site/index.html).

import { readFileSync, writeFileSync } from 'node:fs';

let origin;
try {
  origin = new URL(process.argv[2]).origin;
} catch {
  console.error('usage: node tools/set-api.mjs https://surge-api.<you>.workers.dev');
  process.exit(1);
}

const replaceIn = (relative, pattern, replacement) => {
  const path = new URL(relative, import.meta.url);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before && !before.includes(replacement)) {
    console.error(`couldn't update ${relative}`);
    process.exit(1);
  }
  writeFileSync(path, after);
};

replaceIn('../site/js/config.js', /export const COMMUNITY_API = '.*';/, `export const COMMUNITY_API = '${origin}';`);
replaceIn('../site/index.html', /connect-src 'self'[^;]*;/, `connect-src 'self' ${origin};`);
console.log(`The site now loads and submits community bots at ${origin}`);
