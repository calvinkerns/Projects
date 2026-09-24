// Community bots are minified and scrambled before upload. This checks that
// what comes back out still plays exactly like the original.
// Run with: node tools/test-community.mjs

import { minify } from 'terser';
import { MINIFY_OPTIONS, scramble, unscramble } from '../site/js/community.js';
import { loadBot, playMatch, seedFor } from './lib.mjs';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log(`FAIL: ${msg}`); } };

const names = ['wanderer', 'grower', 'starter', 'rusher', 'captain'];
const originals = names.map((n) => loadBot(`site/bots/${n}.js`));

for (const bot of originals) {
  const { code } = await minify(bot.src, MINIFY_OPTIONS);
  const packed = scramble(code);
  check(unscramble(packed) === code, `${bot.name}: scramble round-trips`);
  check(!packed.includes('function bot') && !packed.includes('stepToward'), `${bot.name}: scrambled text isn't readable`);
  check(!code.includes('//'), `${bot.name}: comments stripped`);
  const minified = { name: bot.name, src: unscramble(packed) };

  // Same seeds, same opponents: the minified bot must make exactly the same moves.
  for (const [k, opponent] of originals.entries()) {
    const size = [15, 21, 31][k % 3];
    const a = playMatch(bot, opponent, seedFor(k), { rules: { size, maxTicks: 400 } }).replay;
    const b = playMatch(minified, opponent, seedFor(k), { rules: { size, maxTicks: 400 } }).replay;
    check(JSON.stringify(a.moves) === JSON.stringify(b.moves), `${bot.name} vs ${opponent.name}: minified bot played differently`);
  }
  console.log(`${bot.name.padEnd(9)} ${String(bot.src.length).padStart(5)} chars -> ${String(code.length).padStart(5)} minified`);
}

// Unicode survives the round trip.
check(unscramble(scramble('// héllo ✓ 👾\nfunction bot() {}')) === '// héllo ✓ 👾\nfunction bot() {}', 'unicode round-trips');
let threw = false;
try { unscramble('plain text'); } catch { threw = true; }
check(threw, 'unscramble refuses text that was never scrambled');

console.log(failures ? `\n${failures} failure(s)` : 'all community tests passed');
process.exit(failures ? 1 : 0);
