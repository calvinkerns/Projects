// Play one match headlessly.
//   node tools/run.mjs site/bots/sprawl.js site/bots/drunkard.js [seed] [--out replay.json]

import { writeFileSync } from 'node:fs';
import { loadBot, playMatch } from './lib.mjs';
import { score } from '../site/js/engine.js';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const [pathA, pathB, seedArg] = args;
if (!pathA || !pathB) {
  console.error('usage: node tools/run.mjs <botA.js> <botB.js> [seed] [--out replay.json]');
  process.exit(1);
}

const seed = seedArg !== undefined ? Number(seedArg) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
const a = loadBot(pathA), b = loadBot(pathB);
const t0 = performance.now();
const { replay, state, cpu, errors, lastError } = playMatch(a, b, seed);
const ms = performance.now() - t0;

const { tiles, mass } = score(state);
const r = replay.result;
const winner = r.winner === -1 ? 'draw' : replay.names[r.winner];
console.log(`seed ${seed}: ${a.name} vs ${b.name} -> ${winner} (${r.reason}) at tick ${r.tick}`);
console.log(`  tiles ${tiles[0]} / ${tiles[1]}   mass ${mass[0]} / ${mass[1]}   energy ${state.energy[0]} / ${state.energy[1]}`);
console.log(`  bot cpu ${cpu[0].toFixed(1)}ms / ${cpu[1].toFixed(1)}ms   match ${ms.toFixed(1)}ms`);
for (const p of [0, 1]) {
  if (errors[p]) console.log(`  ${replay.names[p]} threw ${errors[p]}x, last: ${lastError[p]?.message}`);
}
if (out) {
  writeFileSync(out, JSON.stringify(replay));
  console.log(`  replay -> ${out}`);
}
