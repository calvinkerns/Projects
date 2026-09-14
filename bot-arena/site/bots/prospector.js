// Prospector: an economy bot that hunts wells.
//
// It picks the nearest well it doesn't own and grows one big stack of mass (the
// "carrier", usually its core). When the carrier is heavier than the well, it
// marches along the shortest path, soaking up mass from its own tiles on the
// way, and captures the well. Spare energy expands the border, favouring tiles
// on the way to that well. It never banks energy and barely defends.

let W, N, nbr, wellDist, enemyDist;

// nbr[i * 4 + d] is the tile one step from i in direction d (0 N, 1 E, 2 S, 3 W), or -1 for walls/edges.
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

// Walking distance from the nearest source to every tile (999 = unreachable).
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
  wellDist = s.wells.map((w) => bfs([w])); // static maps: compute once
  enemyDist = bfs([s.cores[1]]);
}

function bot(s) {
  const me = s.me;
  const orders = [];
  const used = new Uint8Array(N);
  let budget = Math.min(s.energy, s.maxOrders);
  const give = (from, dir, all) => { orders.push({ from, dir, all }); used[from] = 1; budget--; };
  // Under fog, assume a well still has its starting mass.
  const guess = (t) => (s.visible[t] ? s.mass[t] : s.terrain[t] === 2 ? s.rules.wellMass : 0);

  // 1. Take any well we can beat right now from a neighbouring tile.
  for (const w of s.wells) {
    if (s.owner[w] === me) continue;
    for (let d = 0; d < 4 && budget > 0; d++) {
      const from = nbr[w * 4 + d];
      if (from >= 0 && !used[from] && s.owner[from] === me && s.mass[from] > guess(w)) {
        give(from, (d + 2) % 4, true);
        break;
      }
    }
  }

  // 2. Choose the target well: closest to our territory, enemy-held wells cost extra.
  let target = -1, targetCost = 1e9;
  for (let k = 0; k < s.wells.length; k++) {
    const w = s.wells[k];
    if (s.owner[w] === me) continue;
    let near = 999;
    for (let i = 0; i < N; i++) if (s.owner[i] === me && wellDist[k][i] < near) near = wellDist[k][i];
    const cost = near + (s.owner[w] === 1 - me ? 8 : 0);
    if (cost < targetCost) { targetCost = cost; target = k; }
  }

  // 3. The carrier is our heaviest tile. Once it can beat the well, walk it one step closer.
  let carrier = -1;
  for (let i = 0; i < N; i++) {
    if (s.owner[i] === me && !used[i] && (carrier < 0 || s.mass[i] > s.mass[carrier])) carrier = i;
  }
  if (target >= 0 && carrier >= 0 && budget > 0) {
    const dist = wellDist[target];
    const need = guess(s.wells[target]) + 2;
    if (s.mass[carrier] > need && dist[carrier] > 1) {
      let best = -1, bestScore = -1e9;
      for (let d = 0; d < 4; d++) {
        const j = nbr[carrier * 4 + d];
        if (j < 0 || dist[j] >= dist[carrier]) continue;
        const theirs = s.owner[j] !== me;
        if (theirs && (s.terrain[j] !== 0 || s.mass[j] >= s.mass[carrier] - need)) continue;
        const score = theirs ? 0 : s.mass[j]; // prefer rolling over our own mass
        if (score > bestScore) { bestScore = score; best = d; }
      }
      if (best >= 0) give(carrier, best, true);
    }
  }

  // 4. Expand into neutral plain tiles, closest to the target well first.
  const moves = [];
  for (let i = 0; i < N; i++) {
    if (s.owner[i] !== me || used[i] || s.mass[i] < 1) continue;
    const plain = s.terrain[i] === 0;
    // Cores and wells keep half their mass; plain tiles send everything forward.
    if (!plain && s.mass[i] < 2) continue;
    // Don't nibble at the carrier unless energy is about to overflow.
    if (i === carrier && s.energy < s.rules.energyCap - 2) continue;
    for (let d = 0; d < 4; d++) {
      const j = nbr[i * 4 + d];
      if (j < 0 || s.owner[j] !== -1 || s.terrain[j] !== 0) continue;
      const toWell = target >= 0 ? wellDist[target][j] : 0;
      moves.push({ from: i, dir: d, all: plain, score: -3 * toWell - enemyDist[j] + s.mass[i] });
    }
  }
  moves.sort((a, b) => b.score - a.score);
  for (const m of moves) {
    if (budget <= 0) break;
    if (!used[m.from]) give(m.from, m.dir, m.all);
  }
  return orders;
}
