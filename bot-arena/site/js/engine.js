// Surge — the arena game engine.
// Deterministic and integer-only: the same seed and the same orders produce the
// same match on every machine. Shared by the browser and the Node tools.

export const W = 21;
export const H = 21;
export const N = W * H;

export const PLAIN = 0, WALL = 1, WELL = 2, CORE = 3;
export const NEUTRAL = -1, FOG = -2;

// Direction index -> 0=N 1=E 2=S 3=W
export const DIRS = [-W, 1, W, -1];

export const RULES = Object.freeze({
  maxTicks: 400,
  energyStart: 5,
  energyRegen: 1,
  energyCap: 20,
  maxOrders: 5,
  coreStartMass: 10,
  wellMass: 30,
  wellPairs: 5,
  wallPercent: 18,
  pulseEvery: 12,
  vision: 1,
});

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

export const xOf = (i) => i % W;
export const yOf = (i) => (i / W) | 0;

export function chebyshev(a, b) {
  return Math.max(Math.abs(xOf(a) - xOf(b)), Math.abs(yOf(a) - yOf(b)));
}

// Index of the tile one step from i in direction dir, or -1 if off the board.
export function neighbor(i, dir) {
  const x = i % W;
  if (dir === 0) return i >= W ? i - W : -1;
  if (dir === 1) return x < W - 1 ? i + 1 : -1;
  if (dir === 2) return i < N - W ? i + W : -1;
  if (dir === 3) return x > 0 ? i - 1 : -1;
  return -1;
}

// 180-degree rotation. Maps are symmetric under it, so neither side has an edge.
const rot = (i) => N - 1 - i;
const CENTER = (N - 1) / 2;

// ---------------------------------------------------------------------------
// Map generation

export function generateMap(seed, rules = RULES) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const walls = attempt < 20 ? rules.wallPercent : Math.max(0, rules.wallPercent - (attempt - 19) * 3);
    const map = tryMap(rng32((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0), walls, rules);
    if (map) return map;
  }
  return tryMap(rng32(seed), 0, rules);
}

function tryMap(rand, wallPercent, rules) {
  const terrain = new Int8Array(N);
  for (let i = 0; i < CENTER; i++) {
    if (rand() % 100 < wallPercent) terrain[i] = terrain[rot(i)] = WALL;
  }

  const coreCandidates = [];
  for (let i = 0; i < CENTER; i++) if (chebyshev(i, CENTER) >= 7) coreCandidates.push(i);
  const core0 = coreCandidates[rand() % coreCandidates.length];
  const core1 = rot(core0);
  for (const c of [core0, core1]) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = xOf(c) + dx, y = yOf(c) + dy;
        if (x >= 0 && x < W && y >= 0 && y < H) terrain[y * W + x] = PLAIN;
      }
    }
  }
  terrain[core0] = terrain[core1] = CORE;
  terrain[CENTER] = PLAIN;

  const wells = [];
  for (let tries = 0; wells.length < rules.wellPairs * 2 && tries < 2000; tries++) {
    const i = rand() % CENTER;
    const j = rot(i);
    if (terrain[i] !== PLAIN) continue;
    if (chebyshev(i, j) < 3) continue;
    if (chebyshev(i, core0) < 3 || chebyshev(i, core1) < 3) continue;
    if (wells.some((w) => chebyshev(i, w) < 2)) continue;
    terrain[i] = terrain[j] = WELL;
    wells.push(i, j);
  }
  if (wells.length < rules.wellPairs * 2) return null;

  // Everything must be reachable from core 0; sealed pockets become wall.
  const seen = new Uint8Array(N);
  const queue = [core0];
  seen[core0] = 1;
  for (let q = 0; q < queue.length; q++) {
    for (let d = 0; d < 4; d++) {
      const j = neighbor(queue[q], d);
      if (j >= 0 && !seen[j] && terrain[j] !== WALL) { seen[j] = 1; queue.push(j); }
    }
  }
  if (!seen[core1] || wells.some((w) => !seen[w])) return null;
  for (let i = 0; i < N; i++) if (!seen[i]) terrain[i] = WALL;

  return { terrain, cores: [core0, core1], wells: wells.sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------
// Match state

export function createMatch(seed, rules = RULES) {
  rules = Object.freeze({ ...RULES, ...rules });
  seed = seed >>> 0;
  const { terrain, cores, wells } = generateMap(seed, rules);
  const owner = new Int8Array(N).fill(NEUTRAL);
  const mass = new Int32Array(N);
  for (const w of wells) mass[w] = rules.wellMass;
  owner[cores[0]] = 0;
  owner[cores[1]] = 1;
  mass[cores[0]] = mass[cores[1]] = rules.coreStartMass;
  return {
    seed, rules, tick: 0, terrain, cores, wells, owner, mass,
    energy: [rules.energyStart, rules.energyStart],
    result: null,
  };
}

// Bot output is untrusted: keep only well-formed orders, and never read more than `limit`.
export function sanitizeOrders(raw, limit = 64) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let k = 0; k < raw.length && k < limit; k++) {
    const o = raw[k];
    if (!o || typeof o !== 'object') continue;
    const { from, dir } = o;
    if (!Number.isInteger(from) || from < 0 || from >= N) continue;
    if (!Number.isInteger(dir) || dir < 0 || dir > 3) continue;
    out.push({ from, dir, all: o.all === true });
  }
  return out;
}

// Advance one tick. Both players' orders resolve simultaneously against the
// tick-start snapshot, so neither side's orders can see the other's.
// Returns the orders that actually executed: [ordersP0, ordersP1].
export function step(state, orders0, orders1) {
  if (state.result) return [[], []];
  const { rules, terrain, owner, mass } = state;
  const snapOwner = owner.slice();
  const snapMass = mass.slice();
  const inflow = [new Int32Array(N), new Int32Array(N)];
  const executed = [[], []];
  const lists = [sanitizeOrders(orders0), sanitizeOrders(orders1)];

  for (let p = 0; p < 2; p++) {
    const used = new Uint8Array(N);
    let energy = state.energy[p];
    for (const o of lists[p]) {
      if (executed[p].length >= rules.maxOrders || energy < 1) break;
      // Invalid orders are skipped and cost nothing.
      if (snapOwner[o.from] !== p || used[o.from]) continue;
      const to = neighbor(o.from, o.dir);
      if (to < 0 || terrain[to] === WALL) continue;
      const amount = o.all ? snapMass[o.from] : snapMass[o.from] >> 1;
      if (amount <= 0) continue;
      used[o.from] = 1;
      energy -= 1;
      mass[o.from] -= amount;
      inflow[p][to] += amount;
      executed[p].push(o);
    }
    state.energy[p] = energy;
  }

  // Opposing arrivals annihilate first; the survivor then fights the occupant.
  // Summing per tile makes this independent of order and player index.
  const coreLost = [false, false];
  for (let t = 0; t < N; t++) {
    const net = inflow[0][t] - inflow[1][t];
    if (net === 0) continue;
    const p = net > 0 ? 0 : 1;
    const n = net > 0 ? net : -net;
    if (owner[t] === p) {
      mass[t] += n;
    } else if (n > mass[t]) {
      if (terrain[t] === CORE && owner[t] >= 0) coreLost[owner[t]] = true;
      owner[t] = p;
      mass[t] = n - mass[t];
    } else {
      mass[t] -= n;
    }
  }

  state.tick += 1;
  for (let p = 0; p < 2; p++) {
    state.energy[p] = Math.min(rules.energyCap, state.energy[p] + rules.energyRegen);
  }
  const pulse = state.tick % rules.pulseEvery === 0;
  for (let t = 0; t < N; t++) {
    if (owner[t] < 0) continue;
    if (terrain[t] === CORE || terrain[t] === WELL) mass[t] += 1;
    else if (pulse) mass[t] += 1;
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
  for (let t = 0; t < N; t++) {
    const o = state.owner[t];
    if (o >= 0) { tiles[o]++; total[o] += state.mass[t]; }
  }
  return { tiles, mass: total };
}

function timeoutResult(state) {
  const { tiles, mass } = score(state);
  if (tiles[0] !== tiles[1]) return { winner: tiles[0] > tiles[1] ? 0 : 1, reason: 'most territory', tick: state.tick };
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

// ---------------------------------------------------------------------------
// What a bot is allowed to see

export function visibilityOf(owner, player, vision) {
  const vis = new Uint8Array(N);
  for (let t = 0; t < N; t++) {
    if (owner[t] !== player) continue;
    const x = t % W, y = (t / W) | 0;
    const y0 = Math.max(0, y - vision), y1 = Math.min(H - 1, y + vision);
    const x0 = Math.max(0, x - vision), x1 = Math.min(W - 1, x + vision);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) vis[yy * W + xx] = 1;
  }
  return vis;
}

// A fresh copy of everything player p may know. Nothing in it aliases engine state.
export function viewFor(state, p) {
  const visible = visibilityOf(state.owner, p, state.rules.vision);
  const owner = new Int8Array(N);
  const mass = new Int32Array(N);
  const tiles = [0, 0];
  let myMass = 0;
  for (let t = 0; t < N; t++) {
    const o = state.owner[t];
    if (o >= 0) tiles[o]++;
    if (o === p) myMass += state.mass[t];
    if (visible[t]) { owner[t] = o; mass[t] = state.mass[t]; }
    else { owner[t] = FOG; mass[t] = -1; }
  }
  return {
    tick: state.tick,
    me: p,
    energy: state.energy[p],
    maxOrders: state.rules.maxOrders,
    maxTicks: state.rules.maxTicks,
    rules: { ...state.rules },
    W, H,
    terrain: state.terrain.slice(),
    owner, mass, visible,
    cores: [state.cores[p], state.cores[1 - p]],
    wells: state.wells.slice(),
    tileCount: [tiles[p], tiles[1 - p]],
    myMass,
  };
}

// ---------------------------------------------------------------------------
// Replays: the seed, the rules, and every executed order. Replaying re-runs
// the engine on those orders (never the bots), which re-validates each one.

export const encodeOrder = (o) => o.from * 8 + o.dir * 2 + (o.all ? 1 : 0);
export const decodeOrder = (n) => ({ from: n >> 3, dir: (n >> 1) & 3, all: (n & 1) === 1 });

export function newReplay(state, names) {
  return { format: 'surge-replay-1', seed: state.seed, rules: state.rules, names, orders: [], result: null };
}

export function recordTick(replay, executed) {
  replay.orders.push([executed[0].map(encodeOrder), executed[1].map(encodeOrder)]);
}

// Rebuild every frame of a replay. frames[k].orders are the orders that produced frame k.
export function replayFrames(replay) {
  const state = createMatch(replay.seed, replay.rules);
  const snap = (orders) => ({
    tick: state.tick,
    owner: state.owner.slice(),
    mass: state.mass.slice(),
    energy: state.energy.slice(),
    orders,
  });
  const frames = [snap([[], []])];
  for (const [o0, o1] of replay.orders) {
    const executed = step(state, o0.map(decodeOrder), o1.map(decodeOrder));
    frames.push(snap(executed));
    if (state.result) break;
  }
  return {
    rules: state.rules,
    terrain: state.terrain,
    cores: state.cores,
    wells: state.wells,
    names: replay.names,
    frames,
    // A forfeit can't be derived from orders, so fall back to the recorded result.
    result: state.result || replay.result,
  };
}
