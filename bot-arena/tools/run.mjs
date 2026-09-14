// Play one match headlessly.
//   node tools/run.mjs site/bots/captain.js site/bots/rusher.js [seed] [--size 15] [--out replay.json]

import { writeFileSync } from 'node:fs';
import { loadBot, playMatch } from './lib.mjs';
import { score } from '../site/js/engine.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : args.splice(i, 2)[1];
};
const out = flag('--out');
const size = Number(flag('--size') ?? 15);
const [pathA, pathB, seedArg] = args;
if (!pathA || !pathB) {
  console.error('usage: node tools/run.mjs <botA.js> <botB.js> [seed] [--size 15] [--out replay.json]');
  process.exit(1);
}

const seed = seedArg !== undefined ? Number(seedArg) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
const a = loadBot(pathA), b = loadBot(pathB);
const t0 = performance.now();
const { replay, state, cpu, errors, lastError } = playMatch(a, b, seed, { rules: { size } });
const ms = performance.now() - t0;

const { tiles, mass } = score(state);
const r = replay.result;
const winner = r.winner === -1 ? 'draw' : replay.names[r.winner];
console.log(`seed ${seed}, ${state.size}x${state.size}: ${a.name} vs ${b.name} -> ${winner} (${r.reason}) at tick ${r.tick}`);
console.log(`  tiles ${tiles[0]} / ${tiles[1]}   mass ${mass[0]} / ${mass[1]}`);
console.log(`  bot cpu ${cpu[0].toFixed(1)}ms / ${cpu[1].toFixed(1)}ms   match ${ms.toFixed(1)}ms`);
for (const p of [0, 1]) {
  if (errors[p]) console.log(`  ${replay.names[p]} threw ${errors[p]}x, last: ${lastError[p]?.message}`);
}
if (out) {
  writeFileSync(out, JSON.stringify(replay));
  console.log(`  replay -> ${out}`);
}
