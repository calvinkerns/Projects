// Starter bot: a solid first bot to edit.
//
// Every tick, look at my tiles from biggest to smallest. Each one either
// captures a neighbour it can beat (enemy tiles and wells first), or, if it's
// stuck inside my territory, walks its mass toward the nearest border.
//
// Tiles are numbered y * 21 + x. Directions: 0 north, 1 east, 2 south, 3 west.

// Neighbours of tile i as [direction, tile] pairs, skipping walls and edges.
function neighbours(s, i) {
  const out = [];
  const x = i % s.W;
  if (i >= s.W) out.push([0, i - s.W]);
  if (x < s.W - 1) out.push([1, i + 1]);
  if (i < s.W * (s.H - 1)) out.push([2, i + s.W]);
  if (x > 0) out.push([3, i - 1]);
  return out.filter(([, t]) => s.terrain[t] !== 1);
}

function bot(s) {
  const n = s.W * s.H;

  // Distance from every tile to the nearest tile I don't own.
  const dist = new Array(n).fill(Infinity);
  const queue = [];
  for (let i = 0; i < n; i++) {
    if (s.terrain[i] !== 1 && s.owner[i] !== s.me) { dist[i] = 0; queue.push(i); }
  }
  for (let q = 0; q < queue.length; q++) {
    for (const [, t] of neighbours(s, queue[q])) {
      if (dist[t] === Infinity) { dist[t] = dist[queue[q]] + 1; queue.push(t); }
    }
  }

  const mine = [];
  for (let i = 0; i < n; i++) if (s.owner[i] === s.me && s.mass[i] >= 2) mine.push(i);
  mine.sort((a, b) => s.mass[b] - s.mass[a]);

  const orders = [];
  for (const from of mine) {
    if (orders.length >= s.maxOrders) break;
    const send = s.mass[from] >> 1;

    // Best capture: enemy core > enemy tiles and wells > empty land.
    let best = -1, bestScore = 0;
    for (const [dir, t] of neighbours(s, from)) {
      if (s.owner[t] === s.me) continue;
      if (send <= Math.max(0, s.mass[t])) continue; // can't win that fight yet
      let score = s.owner[t] >= 0 ? 3 : 1;
      if (s.terrain[t] === 2) score += 2;
      if (s.terrain[t] === 3) score += 100;
      if (score > bestScore) { bestScore = score; best = dir; }
    }
    if (best >= 0) { orders.push({ from, dir: best }); continue; }

    // Nothing to capture: move big stacks through my land toward the border.
    if (s.mass[from] < 6) continue;
    for (const [dir, t] of neighbours(s, from)) {
      if (s.owner[t] === s.me && dist[t] < dist[from]) {
        orders.push({ from, dir, all: true });
        break;
      }
    }
  }
  return orders;
}
