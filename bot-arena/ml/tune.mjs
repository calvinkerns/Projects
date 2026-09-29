// Tunes a bot's `const P = { ... }` numbers by evolution: each generation tries
// a few mutated copies against the opponent pool on shared seeds, and keeps a
// mutant only if it beats the current best twice, the second time on fresh seeds. Progress is saved after every
// generation, so it can be stopped and resumed.
//   node ml/tune.mjs ml/private/apex.js [--gens 20] [--kids 6] [--seeds 12] [--size 21] [--ticks 800]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runJobs } from './lib/pool.mjs';
import { load, opponentPool, readParams, withParams } from './lib/bots.mjs';
import { parseArgs, winRate, pct } from './lib/stats.mjs';
import { rng32 } from '../site/js/engine.js';

const args = parseArgs(process.argv.slice(2), { gens: 20, kids: 6, seeds: 12, size: 21, ticks: 800, sigma: 0.25, seed: 7 });
const [path] = args._;
if (!path) throw new Error('usage: node ml/tune.mjs bot.js');
const base = load(path);
const saveTo = path.replace(/\.js$/, '.tuned.json');
const opponents = opponentPool();
const rand = rng32(args.seed);
const uniform = () => rand() / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(uniform() || 1e-9)) * Math.cos(2 * Math.PI * uniform());

let best = existsSync(saveTo) ? JSON.parse(readFileSync(saveTo, 'utf8')).params : readParams(base.src);
const integer = Object.fromEntries(Object.entries(readParams(base.src)).map(([k, v]) => [k, Number.isInteger(v)]));

// Scale each knob by a random factor; nudge integers by at least one.
function mutate(params) {
  const out = { ...params };
  for (const k of Object.keys(out)) {
    if (typeof out[k] !== 'number' || uniform() < 0.5) continue;
    let v = out[k] * Math.exp(args.sigma * gauss());
    if (integer[k]) v = Math.round(v) === out[k] ? out[k] + (uniform() < 0.5 ? -1 : 1) : Math.round(v);
    out[k] = Math.max(0, v);
  }
  return out;
}

// Everyone in a generation plays the same seeds from both sides, so luck cancels out.
async function evaluate(candidates, seeds) {
  const jobs = [];
  candidates.forEach((params, c) => {
    const me = withParams(base, params, `cand${c}`);
    for (const opp of opponents) for (const seed of seeds) {
      const rules = { size: args.size, maxTicks: args.ticks };
      jobs.push({ a: me, b: opp, seed, rules }, { a: opp, b: me, seed, rules });
    }
  });
  const results = await runJobs(jobs);
  return candidates.map((_, c) => winRate(results, `cand${c}`));
}

console.log(`tuning ${base.name} vs ${opponents.map((o) => o.name).join(', ')}`);
for (let gen = 1; gen <= args.gens; gen++) {
  const seeds = Array.from({ length: args.seeds }, () => rand());
  const candidates = [best, ...Array.from({ length: args.kids }, () => mutate(best))];
  const scores = await evaluate(candidates, seeds);
  const top = scores.indexOf(Math.max(...scores));
  let note = '';
  if (top > 0) {
    // A lucky run is easy to mistake for progress: replay on fresh seeds before switching.
    const fresh = Array.from({ length: args.seeds }, () => rand());
    const [again, mutant] = await evaluate([best, candidates[top]], fresh);
    if (mutant > again) { best = candidates[top]; note = `  -> new best (confirmed ${pct(mutant)} vs ${pct(again)})`; }
    else note = `  -> not confirmed (${pct(mutant)} vs ${pct(again)})`;
  }
  console.log(`gen ${gen}: best so far ${pct(scores[0])}, top mutant ${pct(Math.max(...scores.slice(1)))}${note}`);
  writeFileSync(saveTo, JSON.stringify({ params: best, score: scores[top], gen }, null, 2));
}
console.log(`best params saved to ${saveTo}:\n${JSON.stringify(best)}`);
