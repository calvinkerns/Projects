// Raider: an all-in rush at the enemy core.
//
// Every stack marches down the shortest path to the enemy core, merging into
// the stack ahead of it. The lead stack waits two steps out until it's heavier
// than its guess of the core's mass, then charges. It ignores wells and barely
// expands, so if the rush fails it has little to fall back on.

let W, N, nbr, toCore;
let coreSeen = -1, coreSeenTick = 0; // last time we saw the enemy core, and its mass then

function buildNeighbors(s) {
  nbr = new Int16Array(N * 4).fill(-1);
  const step = [-W, 1, W, -1];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    for (let d = 0; d < 4; d++) {
      if ((d === 1 && x === W - 1) || (d === 3 && x === 0)) continue;
      const j = i + step[d];
      if (j >= 0 && j < N && s.terrain[j] !== 1) nbr[i * 4 + d] = j;
    }
  }
}

function bfs(sources) {
  const dist = new Int16Array(N).fill(999);
  const queue = new Int16Array(N);
  let tail = 0;
  for (const src of sources) { dist[src] = 0; queue[tail++] = src; }
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    for (let d = 0; d < 4; d++) {
      const j = nbr[i * 4 + d];
      if (j >= 0 && dist[j] === 999) { dist[j] = dist[i] + 1; queue[tail++] = j; }
    }
  }
  return dist;
}

function init(s) {
  W = s.W; N = s.W * s.H;
  buildNeighbors(s);
  toCore = bfs([s.cores[1]]);
}

function bot(s) {
  const me = s.me, enemyCore = s.cores[1];
  const orders = [];
  let budget = Math.min(s.energy, s.maxOrders);

  // Cores grow 1 per tick. If we can't see it, assume it grew since we last looked.
  if (s.visible[enemyCore]) { coreSeen = s.mass[enemyCore]; coreSeenTick = s.tick; }
  const coreGuess = coreSeen < 0 ? s.rules.coreStartMass + s.tick : coreSeen + (s.tick - coreSeenTick);

  // Heaviest stacks first: they matter most.
  const stacks = [];
  for (let i = 0; i < N; i++) if (s.owner[i] === me && s.mass[i] >= 2) stacks.push(i);
  stacks.sort((a, b) => toCore[a] - toCore[b] || s.mass[b] - s.mass[a]);

  for (const i of stacks) {
    if (budget <= 0) break;
    const m = s.mass[i];
    // Charge from next to the core, or from two steps out when heavy enough.
    if (toCore[i] <= 2 && m <= coreGuess + 2) continue;
    if (i === s.cores[0] && m < 6) continue; // let the core refill a little between waves
    let best = -1, bestScore = -1e9;
    for (let d = 0; d < 4; d++) {
      const j = nbr[i * 4 + d];
      if (j < 0 || toCore[j] >= toCore[i]) continue;
      const ours = s.owner[j] === me;
      const blocker = ours ? 0 : s.visible[j] ? s.mass[j] : 0;
      if (!ours && blocker >= m) continue;
      const score = (ours ? s.mass[j] : -blocker) + (j === enemyCore ? 1000 : 0);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (best >= 0) { orders.push({ from: i, dir: best, all: true }); budget--; }
  }
  return orders;
}
