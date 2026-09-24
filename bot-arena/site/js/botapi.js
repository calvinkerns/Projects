// Bot API. Must stay self-contained (no imports), since the sandbox
// injects its source into each bot's worker.

export function makeGame(view) {
  const size = view.size;
  const n = size * size;
  const tiles = new Array(n);
  const distanceCache = new Map();

  // Walking distance from tile `from` to every tile, -1 where unreachable.
  function distancesFrom(from) {
    let dist = distanceCache.get(from);
    if (dist) return dist;
    dist = new Int16Array(n).fill(-1);
    dist[from] = 0;
    const queue = [from];
    for (let h = 0; h < queue.length; h++) {
      for (const next of tiles[queue[h]].neighbors) {
        if (dist[next.index] < 0) {
          dist[next.index] = dist[queue[h]] + 1;
          queue.push(next.index);
        }
      }
    }
    distanceCache.set(from, dist);
    return dist;
  }

  const tileMethods = {
    // The move to return from bot(): send this tile's mass (all but 1) to a neighbour.
    moveTo(target) {
      if (!target) return null;
      const dx = target.x - this.x, dy = target.y - this.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1 || target.wall) return null;
      return { from: this.index, dir: dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3 };
    },
    // Walking distance to another tile, going around walls.
    distanceTo(target) {
      if (!target) return Infinity;
      const d = distancesFrom(target.index)[this.index];
      return d < 0 ? Infinity : d;
    },
    // The neighbour one step closer to target, or null if already there or unreachable.
    stepToward(target) {
      if (!target) return null;
      const dist = distancesFrom(target.index);
      let best = null;
      for (const t of this.neighbors) {
        const d = dist[t.index];
        if (d >= 0 && d < dist[this.index] && (!best || d < dist[best.index])) best = t;
      }
      return best;
    },
    // The tile in a list that is the shortest walk from this one.
    closest(list) {
      const dist = distancesFrom(this.index);
      let best = null;
      for (const t of list) {
        if (dist[t.index] >= 0 && (!best || dist[t.index] < dist[best.index])) best = t;
      }
      return best;
    },
  };

  for (let i = 0; i < n; i++) {
    const owner = view.owner[i];
    const tile = Object.create(tileMethods);
    tile.index = i;
    tile.x = i % size;
    tile.y = Math.floor(i / size);
    tile.mass = view.mass[i];
    tile.wall = view.walls[i] === 1;
    tile.mine = owner === view.me;
    tile.enemy = owner === 1 - view.me;
    tile.neutral = owner === -1 && !tile.wall;
    tile.core = i === view.cores[0] || i === view.cores[1];
    tile.neighbors = [];
    tiles[i] = tile;
  }
  for (const tile of tiles) {
    if (tile.wall) continue;
    for (const [x, y] of [[tile.x, tile.y - 1], [tile.x + 1, tile.y], [tile.x, tile.y + 1], [tile.x - 1, tile.y]]) {
      if (x >= 0 && y >= 0 && x < size && y < size && !tiles[y * size + x].wall) tile.neighbors.push(tiles[y * size + x]);
    }
  }

  return {
    tick: view.tick,
    maxTicks: view.maxTicks,
    size,
    tiles,
    myTiles: tiles.filter((t) => t.mine),
    enemyTiles: tiles.filter((t) => t.enemy),
    neutralTiles: tiles.filter((t) => t.neutral),
    myCore: tiles[view.cores[0]],
    enemyCore: tiles[view.cores[1]],
    tile: (x, y) => (x >= 0 && y >= 0 && x < size && y < size ? tiles[y * size + x] : null),
  };
}
