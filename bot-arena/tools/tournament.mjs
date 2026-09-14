// Round-robin tournament for balance testing.
//   node tools/tournament.mjs [--seeds 20] [--mirror] bot1.js bot2.js ...
//
// Each pair plays every seed once, swapping which bot is player 0 on alternate
// seeds. --mirror also plays each bot against itself: player 0 should win about
// half the non-drawn games, or the engine has a side bias.

import { loadBot, playMatch, seedFor } from './lib.mjs';

const args = process.argv.slice(2);
const take = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const seeds = Number(take('--seeds', 20));
const mirrorAt = args.indexOf('--mirror');
const mirror = mirrorAt >= 0;
if (mirror) args.splice(mirrorAt, 1);

const bots = args.map(loadBot);
if (bots.length < 2 && !mirror) {
  console.error('need at least two bots');
  process.exit(1);
}
const n = bots.length;
const games = [];
const reasons = {};
let ticks = 0, matches = 0, p0wins = 0, decided = 0;
const errorCount = new Array(n).fill(0);
const cpuTotal = new Array(n).fill(0), cpuGames = new Array(n).fill(0);
const t0 = performance.now();

function play(i, j, k) {
  const swap = k % 2 === 1;
  const [p0, p1] = swap ? [j, i] : [i, j];
  const { replay, cpu, errors } = playMatch(bots[p0], bots[p1], seedFor(k));
  const r = replay.result;
  const key = r.reason.startsWith('crashed') ? 'crashed' : r.reason;
  reasons[key] = (reasons[key] || 0) + 1;
  ticks += r.tick;
  matches++;
  if (r.winner !== -1) { decided++; if (r.winner === 0) p0wins++; }
  errorCount[p0] += errors[0]; errorCount[p1] += errors[1];
  cpuTotal[p0] += cpu[0]; cpuTotal[p1] += cpu[1];
  cpuGames[p0]++; cpuGames[p1]++;
  const score0 = r.winner === -1 ? 0.5 : r.winner === 0 ? 1 : 0;
  return { a: p0, b: p1, score: score0 };
}

if (mirror) {
  console.log(`\nMirror test (${seeds} seeds each): player 0 win share among decided games`);
  for (let i = 0; i < n; i++) {
    let w = 0, d = 0, dr = 0;
    for (let k = 0; k < seeds; k++) {
      const { replay } = playMatch(bots[i], bots[i], seedFor(k));
      if (replay.result.winner === -1) dr++;
      else { d++; if (replay.result.winner === 0) w++; }
    }
    const share = d ? ((100 * w) / d).toFixed(0) + '%' : 'n/a';
    console.log(`  ${bots[i].name.padEnd(12)} p0 ${share.padStart(4)} of ${d} decided, ${dr} draws`);
  }
}

if (n >= 2) {
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = 0; k < seeds; k++) games.push(play(i, j, k));

  // Win share matrix: row vs column.
  const pts = Array.from({ length: n }, () => new Float64Array(n));
  const cnt = Array.from({ length: n }, () => new Float64Array(n));
  for (const g of games) {
    pts[g.a][g.b] += g.score; pts[g.b][g.a] += 1 - g.score;
    cnt[g.a][g.b]++; cnt[g.b][g.a]++;
  }
  const ratings = bradleyTerry(n, games);
  const order = [...Array(n).keys()].sort((x, y) => ratings[y] - ratings[x]);
  const w = Math.max(...bots.map((b) => b.name.length), 6);
  const short = (s) => s.slice(0, 6).padStart(7);

  console.log(`\n${matches} matches, ${seeds} seeds per pair, ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`\nWin share (row vs column):`);
  console.log(' '.repeat(w + 2) + order.map((j) => short(bots[j].name)).join(''));
  for (const i of order) {
    const row = order.map((j) => (i === j ? '     --' : `${Math.round((100 * pts[i][j]) / cnt[i][j])}%`.padStart(7)));
    console.log(`${bots[i].name.padEnd(w)}  ${row.join('')}`);
  }
  console.log(`\nRatings (Bradley-Terry):`);
  for (const i of order) {
    const avg = (cpuTotal[i] / cpuGames[i]).toFixed(1);
    const errs = errorCount[i] ? `  threw ${errorCount[i]}x` : '';
    console.log(`  ${bots[i].name.padEnd(w)} ${String(ratings[i]).padStart(5)}   ${avg}ms cpu/match${errs}`);
  }
  console.log(`\nHow matches ended:`);
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(4)}  (${Math.round((100 * v) / matches)}%)`);
  }
  console.log(`  average length   ${Math.round(ticks / matches)} ticks`);
  console.log(`  player 0 won     ${decided ? Math.round((100 * p0wins) / decided) : 0}% of decided games`);
}

// Bradley-Terry by minorisation-maximisation. Draws count as half a win.
// A weak prior (one win and one loss against a strength-1 opponent) keeps
// unbeaten or winless bots finite.
function bradleyTerry(n, games) {
  const wins = new Float64Array(n);
  const count = Array.from({ length: n }, () => new Float64Array(n));
  for (const g of games) {
    wins[g.a] += g.score; wins[g.b] += 1 - g.score;
    count[g.a][g.b]++; count[g.b][g.a]++;
  }
  let p = new Float64Array(n).fill(1);
  for (let it = 0; it < 1000; it++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let denom = 2 / (p[i] + 1);
      for (let j = 0; j < n; j++) if (count[i][j]) denom += count[i][j] / (p[i] + p[j]);
      next[i] = (wins[i] + 1) / denom;
    }
    let lg = 0;
    for (const v of next) lg += Math.log(v);
    const g = Math.exp(lg / n);
    for (let i = 0; i < n; i++) next[i] /= g;
    p = next;
  }
  return Array.from(p, (v) => Math.round(1500 + 400 * Math.log10(v)));
}
