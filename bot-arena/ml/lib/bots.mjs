// Finding bots and making tunable variants of them.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
export const PRIVATE = join(ROOT, 'ml/private');

export function load(path) {
  return { name: basename(path, '.js'), src: readFileSync(path, 'utf8') };
}

// House bots, plus any community bots fetched into ml/private/community.
export function opponentPool({ house = ['captain', 'rusher', 'starter', 'grower'], community = true } = {}) {
  const bots = house.map((h) => load(join(ROOT, 'site/bots', `${h}.js`)));
  const dir = join(PRIVATE, 'community');
  if (community && existsSync(dir)) {
    for (const f of readdirSync(dir)) if (f.endsWith('.js')) bots.push(load(join(dir, f)));
  }
  return bots;
}

// A tunable bot declares its knobs on its first line as `const P = { ... };`.
export function readParams(src) {
  const m = src.match(/^const P = (\{[^\n]*\});/m);
  if (!m) throw new Error('bot has no `const P = { ... };` line to tune');
  return Function(`return ${m[1]}`)();
}

export function withParams(bot, params, name = bot.name) {
  const src = bot.src.replace(/^const P = \{[^\n]*\};/m, `const P = ${JSON.stringify(params)};`);
  return { name, src };
}
