// Which arena size and tick limit make the best game? Plays a round robin at each
// setting and measures what makes a match fair and skill-based:
//   side bias   how far player 0's win rate is from 50% (lower is fairer)
//   skill       how often the stronger bot of each pair wins (higher: skill matters)
//   timeouts    share of games that hit the tick limit instead of a core capture
//   draws, average length, and time per match (spectators wait on that)
//   node ml/settings.mjs [--sizes 15,21,31] [--ticks 400,800,1600,3000] [--seeds 10] [bot.js ...]

import { runJobs } from './lib/pool.mjs';
import { load, opponentPool } from './lib/bots.mjs';
import { parseArgs, pct } from './lib/stats.mjs';
import { seedFor } from '../tools/lib.mjs';

const args = parseArgs(process.argv.slice(2), { sizes: '15,21,31', ticks: '400,800,1600,3000', seeds: 10 });
const bots = args._.length ? args._.map(load) : opponentPool();
const sizes = args.sizes.split(',').map(Number);
const tickList = args.ticks.split(',').map(Number);

const jobs = [];
for (const size of sizes) for (const maxTicks of tickList) {
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) {
    for (let k = 0; k < args.seeds; k++) {
      const [a, b] = k % 2 ? [bots[j], bots[i]] : [bots[i], bots[j]];
      jobs.push({ a, b, seed: seedFor(k), rules: { size, maxTicks } });
    }
  }
}
console.error(`${jobs.length} matches across ${sizes.length * tickList.length} settings`);
const results = await runJobs(jobs, {
  onResult: (_, done, total) => done % 50 === 0 && process.stderr.write(`\r${done}/${total}`),
});
console.error('');

const rows = [];
for (const size of sizes) for (const maxTicks of tickList) {
  const rs = results.filter((r) => r.rules.size === size && r.rules.maxTicks === maxTicks);
  const decided = rs.filter((r) => r.winner >= 0);
  const p0 = decided.filter((r) => r.winner === 0).length / (decided.length || 1);
  // Per pair: the share of games won by whichever bot won more of them.
  const pairs = new Map();
  for (const r of rs) {
    const key = [...r.names].sort().join(' v ');
    const tally = pairs.get(key) || {};
    const w = r.winner >= 0 ? r.names[r.winner] : 'draw';
    tally[w] = (tally[w] || 0) + 1;
    pairs.set(key, tally);
  }
  let skill = 0;
  for (const tally of pairs.values()) {
    const wins = Object.entries(tally).filter(([k]) => k !== 'draw').map(([, v]) => v);
    skill += Math.max(0, ...wins) / Object.values(tally).reduce((s, v) => s + v, 0);
  }
  skill /= pairs.size || 1;
  rows.push({
    size, maxTicks,
    sideBias: Math.abs(p0 - 0.5),
    skill,
    timeouts: rs.filter((r) => r.reason !== 'core captured').length / rs.length,
    draws: rs.filter((r) => r.winner === -1).length / rs.length,
    length: rs.reduce((s, r) => s + r.tick, 0) / rs.length,
    ms: rs.reduce((s, r) => s + r.wallMs, 0) / rs.length,
  });
}

// One number to sort by. The weights are a judgement call: change them to taste.
const scoreOf = (r) => r.skill - r.sideBias - 0.5 * r.draws - 0.1 * r.timeouts - 0.0001 * r.length;
rows.sort((a, b) => scoreOf(b) - scoreOf(a));
console.log('size  ticks  skill  sideBias  timeouts  draws  avgLen  ms/match  score');
for (const r of rows) {
  console.log(`${String(r.size).padStart(4)} ${String(r.maxTicks).padStart(6)}  ${pct(r.skill).padStart(6)}  ${pct(r.sideBias).padStart(7)}  ${pct(r.timeouts).padStart(8)}  ${pct(r.draws).padStart(5)}  ${r.length.toFixed(0).padStart(6)}  ${r.ms.toFixed(0).padStart(8)}  ${scoreOf(r).toFixed(3)}`);
}
