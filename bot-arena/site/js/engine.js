// Surge engine. Deterministic and integer-only: the same seed and the same
// moves produce the same match on every machine. Shared by the browser and
// the Node tools.

export const PLAIN = 0, WALL = 1, NEUTRAL = -1;
export const SIZES = [11, 15, 21];

export const RULES = Object.freeze({
  size: 15,
  wallPercent: 12,
  coreStartMass: 5,
  growEvery: 10,
  ticksPerSize: 20,
  coreDefense: 2,
});

// Fills in defaults, keeps the size to a supported value, and derives the tick limit.
export function makeRules(overrides = {}) {
  const rules = { ...RULES, ...overrides };
  if (!SIZES.includes(rules.size)) rules.size = RULES.size;
  rules.maxTicks = rules.size * rules.ticksPerSize;
  return Object.freeze(rules);
}

// xorshift32. Integer-only so every JS engine produces the same stream.
export function rng32(seed) {
  let s = seed >>> 0 || 0x9e3779b9;
  return function next() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s;
  };
}

// Tile one step from i in direction dir (0 north, 1 east, 2 south, 3 west), or -1 if off the board.
export function neighbor(size, i, dir) {
  const x = i % size;
  if (dir === 0) return i >= size ? i - size : -1;
  if (dir === 1) return x < size - 1 ? i + 1 : -1;
  if (dir === 2) return i < size * size - size ? i + size : -1;
  if (dir === 3) return x > 0 ? i - 1 : -1;
  return -1;
}

// ---------------------------------------------------------------------------
// Map generation

export function generateMap(seed, size, wallPercent) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const map = tryMap(rng32((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0), size, wallPercent);
    if (map) return map;
  }
  return tryMap(rng32(seed), size, 0);
}

function tryMap(rand, size, wallPercent) {
  const n = size * size;
  const half = Math.floor(n / 2);
  const rot = (i) => n - 1 - i; // 180-degree rotation: neither side gets a better map
  const terrain = new Uint8Array(n);
  for (let i = 0; i < half; i++) {
    if (rand() % 100 < wallPercent) terrain[i] = terrain[rot(i)] = WALL;
  }

  // Cores sit well away from the centre, on opposite sides.
  const far = 2 * Math.floor(size / 3);
  const candidates = [];
  for (let i = 0; i < half; i++) {
    const x = i % size, y = Math.floor(i / size);
    if (Math.max(Math.abs(2 * x - size + 1), Math.abs(2 * y - size + 1)) >= far) candidates.push(i);
  }
  const first = candidates[rand() % candidates.length];
  const cores = [first, rot(first)];
  for (const c of cores) {
    const cx = c % size, cy = Math.floor(c / size);
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x >= 0 && y >= 0 && x < size && y < size) terrain[y * size + x] = PLAIN;
      }
    }
  }

  // Every open tile must be reachable; sealed pockets become wall.
  const seen = new Uint8Array(n);
  const queue = [cores[0]];
  seen[cores[0]] = 1;
  for (let h = 0; h < queue.length; h++) {
    for (let d = 0; d < 4; d++) {
      const j = neighbor(size, queue[h], d);
      if (j >= 0 && !seen[j] && terrain[j] !== WALL) { seen[j] = 1; queue.push(j); }
    }
  }
  if (!seen[cores[1]]) return null;
  for (let i = 0; i < n; i++) if (!seen[i]) terrain[i] = WALL;
  return { terrain, cores };
}

// ---------------------------------------------------------------------------
// Match state

export function createMatch(seed, overrides) {
  const rules = makeRules(overrides);
  seed = seed >>> 0;
  const { terrain, cores } = generateMap(seed, rules.size, rules.wallPercent);
  const n = rules.size * rules.size;
  const owner = new Int8Array(n).fill(NEUTRAL);
  const mass = new Int32Array(n);
  cores.forEach((c, p) => { owner[c] = p; mass[c] = rules.coreStartMass; });
  return { seed, rules, size: rules.size, tick: 0, terrain, cores, owner, mass, result: null };
}

// Bot output is untrusted: returns { from, dir } or null.
export function sanitizeMove(raw, n) {
  if (!raw || typeof raw !== 'object') return null;
  const { from, dir } = raw;
  if (!Number.isInteger(from) || from < 0 || from >= n) return null;
  if (!Number.isInteger(dir) || dir < 0 || dir > 3) return null;
  return { from, dir };
}

// Advance one tick. A move sends all but 1 mass from one of your tiles to a
// neighbour. Both moves happen at once, so neither player sees the other's first.
// Returns the moves that actually happened: [moveP0 | null, moveP1 | null].
export function step(state, move0, move1) {
  const executed = [null, null];
  if (state.result) return executed;
  const { rules, size, terrain, owner, mass, cores } = state;
  const n = size * size;

  const arrivals = [];
  [move0, move1].forEach((raw, p) => {
    const m = sanitizeMove(raw, n);
    if (!m || owner[m.from] !== p || mass[m.from] < 2) return;
    const to = neighbor(size, m.from, m.dir);
    if (to < 0 || terrain[to] === WALL) return;
    arrivals.push([to, p, mass[m.from] - 1]);
    executed[p] = m;
  });
  for (const m of executed) if (m) mass[m.from] = 1;

  // Opposing arrivals on one tile cancel first; the survivor then fights the occupant.
  const inflow = new Map();
  for (const [t, p, amount] of arrivals) {
    const pair = inflow.get(t) || [0, 0];
    pair[p] += amount;
    inflow.set(t, pair);
  }
  const coreLost = [false, false];
  for (const [t, [a, b]] of inflow) {
    const net = a - b;
    if (net === 0) continue;
    const p = net > 0 ? 0 : 1;
    const amount = Math.abs(net);
    if (owner[t] === p) {
      mass[t] += amount;
    } else {
      // Cores are fortified: every point of core mass counts coreDefense times.
      const isCore = t === cores[0] || t === cores[1];
      const multiplier = isCore ? rules.coreDefense : 1;
      if (amount > mass[t] * multiplier) {
        if (isCore) coreLost[owner[t]] = true;
        owner[t] = p;
        mass[t] = amount - mass[t] * multiplier;
      } else {
        mass[t] -= Math.floor(amount / multiplier);
      }
    }
  }

  state.tick += 1;
  const grow = state.tick % rules.growEvery === 0;
  for (let i = 0; i < n; i++) {
    if (owner[i] >= 0 && (grow || i === cores[0] || i === cores[1])) mass[i] += 1;
  }

  if (coreLost[0] || coreLost[1]) {
    const winner = coreLost[0] && coreLost[1] ? -1 : coreLost[0] ? 1 : 0;
    state.result = { winner, reason: winner === -1 ? 'both cores fell' : 'core captured', tick: state.tick };
  } else if (state.tick >= rules.maxTicks) {
    state.result = timeoutResult(state);
  }
  return executed;
}

export function score(state) {
  const tiles = [0, 0], total = [0, 0];
  for (let i = 0; i < state.owner.length; i++) {
    const o = state.owner[i];
    if (o >= 0) { tiles[o]++; total[o] += state.mass[i]; }
  }
  return { tiles, mass: total };
}

function timeoutResult(state) {
  const { tiles, mass } = score(state);
  if (tiles[0] !== tiles[1]) return { winner: tiles[0] > tiles[1] ? 0 : 1, reason: 'most tiles', tick: state.tick };
  if (mass[0] !== mass[1]) return { winner: mass[0] > mass[1] ? 0 : 1, reason: 'more mass', tick: state.tick };
  return { winner: -1, reason: 'draw', tick: state.tick };
}

// End the match because of a bot failure. faults: [reasonP0 | null, reasonP1 | null].
export function forfeit(state, faults) {
  if (state.result) return;
  const [f0, f1] = faults;
  if (f0 && f1) state.result = { winner: -1, reason: `both bots failed (${f0})`, tick: state.tick };
  else if (f0) state.result = { winner: 1, reason: f0, tick: state.tick, forfeit: 0 };
  else if (f1) state.result = { winner: 0, reason: f1, tick: state.tick, forfeit: 1 };
}

// Plain data sent to a bot each tick; the sandbox wraps it with makeGame().
export function viewFor(state, p) {
  return {
    tick: state.tick,
    maxTicks: state.rules.maxTicks,
    size: state.size,
    me: p,
    walls: state.terrain.slice(),
    owner: state.owner.slice(),
    mass: state.mass.slice(),
    cores: [state.cores[p], state.cores[1 - p]],
  };
}

// ---------------------------------------------------------------------------
// Replays: the seed, the rules, and every move that happened. Replaying re-runs
// the engine on those moves (never the bots), which re-validates each one.

export const encodeMove = (m) => (m ? m.from * 4 + m.dir : -1);
export const decodeMove = (code) => (Number.isInteger(code) && code >= 0 ? { from: code >> 2, dir: code & 3 } : null);

export function newReplay(state, names) {
  return { format: 'surge-lite-1', seed: state.seed, rules: state.rules, names, moves: [], result: null };
}

export function recordTick(replay, executed) {
  replay.moves.push(executed.map(encodeMove));
}

// Rebuild every frame of a replay. frames[k].moves are the moves that produced frame k.
export function replayFrames(replay) {
  const state = createMatch(replay.seed, replay.rules);
  const snap = (moves) => ({ tick: state.tick, owner: state.owner.slice(), mass: state.mass.slice(), moves });
  const frames = [snap([null, null])];
  for (const [c0, c1] of replay.moves) {
    frames.push(snap(step(state, decodeMove(c0), decodeMove(c1))));
    if (state.result) break;
  }
  return {
    rules: state.rules,
    size: state.size,
    terrain: state.terrain,
    cores: state.cores,
    names: replay.names,
    frames,
    // A forfeit can't be derived from moves, so fall back to the recorded result.
    result: state.result || replay.result,
  };
}
