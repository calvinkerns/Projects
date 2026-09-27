// Plays bots against each other and saves every game as one JSON line:
// seed, rules, names, result and all moves, so any tick can be rebuilt exactly.
//   node ml/selfplay.mjs [--games 200] [--sizes 15,21,31] [--ticks 400,800] [--out ml/data/games.jsonl] [bot.js ...]
// With no bots listed, uses the house bots plus fetched community bots.

import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runJobs } from './lib/pool.mjs';
import { load, opponentPool } from './lib/bots.mjs';
import { parseArgs } from './lib/stats.mjs';
import { rng32 } from '../site/js/engine.js';

const args = parseArgs(process.argv.slice(2), { games: 200, sizes: '21', ticks: '800', out: 'ml/data/games.jsonl', seed: 1 });
const bots = args._.length ? args._.map(load) : opponentPool();
const sizes = args.sizes.split(',').map(Number);
const ticks = args.ticks.split(',').map(Number);
const rand = rng32(args.seed);
const pick = (list) => list[rand() % list.length];

const jobs = [];
for (let g = 0; g < args.games; g++) {
  const a = pick(bots);
  let b = pick(bots);
  while (bots.length > 1 && b === a) b = pick(bots);
  jobs.push({ a, b, seed: rand(), rules: { size: pick(sizes), maxTicks: pick(ticks) }, keepReplay: true });
}

mkdirSync(dirname(args.out), { recursive: true });
const out = createWriteStream(args.out, { flags: 'a' });
await runJobs(jobs, {
  onResult(r, done, total) {
    out.write(JSON.stringify({ ...r.replay, tiles: r.tiles, mass: r.mass }) + '\n');
    if (done % 20 === 0 || done === total) process.stderr.write(`\r${done}/${total} games`);
  },
});
out.end();
console.error(`\nappended to ${args.out}`);
