// Downloads community bots from the live API into ml/private/community
// (git-ignored: their authors submitted them to stay hidden).
//   node ml/fetch-community.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { COMMUNITY_API } from '../site/js/config.js';
import { unscramble } from '../site/js/community.js';
import { PRIVATE } from './lib/bots.mjs';

const dir = join(PRIVATE, 'community');
mkdirSync(dir, { recursive: true });
const res = await fetch(`${COMMUNITY_API}/bots`);
if (!res.ok) throw new Error(`API answered ${res.status}`);
const body = await res.json();
for (const b of body.bots || body) {
  const file = `${b.name.replace(/[^A-Za-z0-9_-]/g, '_')}.js`;
  writeFileSync(join(dir, file), unscramble(b.code));
  console.log(`${b.rank ? '#' + b.rank : '  '}\t${b.name} by ${b.author} -> ${file}`);
}
