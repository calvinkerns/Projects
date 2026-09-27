// Turns saved games into a training table: one row per sampled tick, seen from
// player 0, labelled with how the game ended (1 win, 0.5 draw, 0 loss).
// A first model can learn "who is winning from here", which a bot can then use
// to score its moves.
//   node ml/features.mjs [--in ml/data/games.jsonl] [--out ml/data/features.csv] [--every 10]

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createMatch, step, decodeMove } from '../site/js/engine.js';
import { parseArgs } from './lib/stats.mjs';

const args = parseArgs(process.argv.slice(2), { in: 'ml/data/games.jsonl', out: 'ml/data/features.csv', every: 10 });

// Hand-made summary of a position for player p. Add columns here as ideas come.
export function featuresFor(state, p) {
  const { size, owner, mass, cores } = state;
  const n = size * size;
  const q = 1 - p;
  const f = { tiles: 0, enemyTiles: 0, mass: 0, enemyMass: 0, biggest: 0, enemyBiggest: 0, frontier: 0 };
  for (let i = 0; i < n; i++) {
    if (owner[i] === p) {
      f.tiles++; f.mass += mass[i];
      if (i !== cores[p]) f.biggest = Math.max(f.biggest, mass[i]);
    } else if (owner[i] === q) {
      f.enemyTiles++; f.enemyMass += mass[i];
      if (i !== cores[q]) f.enemyBiggest = Math.max(f.enemyBiggest, mass[i]);
    }
  }
  for (let i = 0; i < n; i++) {
    if (owner[i] !== p) continue;
    const x = i % size, y = (i / size) | 0;
    if ((x > 0 && owner[i - 1] === q) || (x < size - 1 && owner[i + 1] === q) || (y > 0 && owner[i - size] === q) || (y < size - 1 && owner[i + size] === q)) f.frontier++;
  }
  return {
    progress: state.tick / state.rules.maxTicks,
    size,
    ...f,
    core: mass[cores[p]],
    enemyCore: mass[cores[q]],
  };
}

const rows = [];
let header = null, games = 0;
const lines = createInterface({ input: createReadStream(args.in) });
for await (const line of lines) {
  if (!line.trim()) continue;
  const game = JSON.parse(line);
  const state = createMatch(game.seed, game.rules);
  const label = game.result.winner === 0 ? 1 : game.result.winner === 1 ? 0 : 0.5;
  for (const pair of game.moves) {
    if (state.tick % args.every === 0) {
      const f = featuresFor(state, 0);
      header ??= [...Object.keys(f), 'p0', 'p1', 'label'];
      rows.push([...Object.values(f), game.names[0], game.names[1], label].join(','));
    }
    step(state, decodeMove(pair[0]), decodeMove(pair[1]));
  }
  games++;
}
writeFileSync(args.out, [header.join(','), ...rows].join('\n') + '\n');
console.log(`${rows.length} rows from ${games} games -> ${args.out}`);
