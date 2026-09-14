// The bot a visitor sees first in the editor. It is meant to be read.
// (Kept free of backticks and dollar-brace so it can live in a template literal.)

export const STARTER_SOURCE = String.raw`// Starter — spreads out from many stacks at once, grabs wells, hunts the enemy core.
//
// Your bot is one function: bot(state) -> array of orders.
// It is called once per tick. Each order pushes mass from a tile you own
// into one of its four neighbours:
//
//   { from: tileIndex, dir: 0 | 1 | 2 | 3, all: false }
//       dir: 0 = north, 1 = east, 2 = south, 3 = west
//       all: false moves half the stack (mass >> 1), true moves all of it
//
// Tiles are numbered row by row: index = y * state.W + x.
// Every order costs 1 energy, and you only get a few per tick, so the real
// question each tick is: which few moves matter most?
//
// Try console.log(...) — the output shows up in the console under the editor.
// Press Ctrl/Cmd+Enter to run a match.

const WALL = 1, WELL = 2, CORE = 3;   // values in state.terrain (0 = plain)
const DX = [0, 1, 0, -1];             // x step for dir 0..3 (N, E, S, W)
const DY = [-1, 0, 1, 0];             // y step for dir 0..3

// Top-level variables keep their values between ticks.
let ticksSeen = 0;

// Optional: called once before the first tick with the map layout.
function init(map) {
  console.log('Hello! Board is ' + map.W + 'x' + map.H + ', my core is tile ' + map.cores[map.me]);
}

// The neighbour of tile i in direction dir, or -1 if that is off the board.
function step(s, i, dir) {
  const x = (i % s.W) + DX[dir];
  const y = Math.floor(i / s.W) + DY[dir];
  if (x < 0 || y < 0 || x >= s.W || y >= s.H) return -1;
  return y * s.W + x;
}

// How far every tile is from the nearest tile I don't own yet (walking around
// walls). Interior stacks use this to march their mass toward the frontier.
function distanceToFrontier(s) {
  const dist = new Array(s.W * s.H).fill(Infinity);
  const queue = [];
  for (let i = 0; i < dist.length; i++) {
    if (s.terrain[i] !== WALL && s.owner[i] !== s.me) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {       // plain breadth-first search
    const i = queue[q];
    for (let dir = 0; dir < 4; dir++) {
      const j = step(s, i, dir);
      if (j >= 0 && s.terrain[j] !== WALL && dist[j] === Infinity) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}

function bot(s) {
  ticksSeen++;
  const myCore = s.cores[s.me];
  const enemyCore = s.cores[s.enemy];
  const dist = distanceToFrontier(s);
  const moves = [];   // every move worth considering, each with a score

  for (let from = 0; from < s.W * s.H; from++) {
    if (s.owner[from] !== s.me || s.mass[from] < 2) continue;  // mass 1 can't split

    const half = s.mass[from] >> 1;
    const all = s.mass[from];
    // Never empty the core: it is the one tile you can't afford to lose.
    const canSendAll = from !== myCore;

    for (let dir = 0; dir < 4; dir++) {
      const to = step(s, from, dir);
      if (to < 0 || s.terrain[to] === WALL) continue;

      if (s.owner[to] === s.me) {
        // Reinforce: walk a big interior stack one step closer to the frontier.
        if (dist[to] < dist[from] && all >= 4) {
          moves.push({ from, dir, all: canSendAll, score: 5 + all });
        }
        continue;
      }

      // Attack or expand. Neighbours of my tiles are always in vision, so
      // s.mass[to] is real here (fogged tiles would read -1).
      const defense = s.mass[to];
      let send = 0, useAll = false;
      if (half > defense) send = half;
      else if (canSendAll && all > defense) { send = all; useAll = true; }
      if (send === 0) continue;   // we'd just bounce off; don't waste energy

      let score;
      if (to === enemyCore) score = 10000;                 // game over, we win
      else if (s.terrain[to] === WELL) score = 1000;       // wells pay mass every tick
      else if (s.owner[to] === s.enemy) score = 300 + defense;
      else score = 100;                                    // empty land
      // Spend a big stack before a small one, and prefer not to go all-in.
      score += Math.min(send, 50) - (useAll ? 20 : 0);
      moves.push({ from, dir, all: useAll, score });
    }
  }

  // Best moves first. Each tile may give one order per tick, and we can't
  // spend more energy than we have.
  moves.sort((a, b) => b.score - a.score);
  const budget = Math.min(s.energy, s.maxOrders);
  const orders = [];
  const usedFrom = new Set();
  const usedTo = new Set();
  for (const m of moves) {
    if (orders.length >= budget) break;
    const to = step(s, m.from, m.dir);
    if (usedFrom.has(m.from)) continue;
    // Two stacks landing on the same empty tile is wasted energy (but piling
    // onto an enemy core or a well is fine).
    if (usedTo.has(to) && m.score < 1000) continue;
    usedFrom.add(m.from);
    usedTo.add(to);
    orders.push({ from: m.from, dir: m.dir, all: m.all });
  }

  if (ticksSeen % 100 === 0) {
    console.log('tick ' + s.tick + ': ' + s.tileCount[s.me] + ' tiles, ' + s.myMass + ' mass');
  }
  return orders;
}
`;
