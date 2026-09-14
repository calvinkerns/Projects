// Surge — the deterministic game engine, shared by the browser and Node.
//
// A match is a pure function of (seed, orders). Integer math only: no clocks,
// no Math.random, no floating point. Any machine replaying the same orders gets
// bit-identical state, which is what lets a visitor's browser verify a ladder
// result that was computed somewhere else.

export const ENGINE_VERSION = 1;

export const PLAIN = 0;
export const WALL = 1;
export const WELL = 2;
export const CORE = 3;

export const DEFAULT_CONFIG = Object.freeze({
  W: 21,
  H: 21,
  MAX_TICKS: 400,
  WALL_PERMILLE: 180, // wall density out of 1000
  CORE_MIN_CENTER_DIST: 7, // cores sit near the edges
  WELL_PAIRS: 5,
  CORE_START_MASS: 10,
  CORE_INCOME: 1, // mass per tick on an owned core
  WELL_START_MASS: 24, // a neutral well must be hit with 25+
  WELL_INCOME: 1, // mass per tick on an owned well
  PULSE_EVERY: 12, // every owned tile gains 1 mass every N ticks
  ENERGY_START: 5,
  ENERGY_REGEN: 1,
  ENERGY_CAP: 20,
  MAX_ORDERS: 5, // orders per tick; each costs 1 energy
  VISION: 2, // Chebyshev radius around owned tiles
});

// N, E, S, W as index offsets.
export function dirOffsets(W) {
  return [-W, 1, W, -1];
}

// mulberry32: a 32-bit integer PRNG that is identical in every JS engine.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Seed for a bot's Math.random, so bots may be random and still replay exactly.
export function botSeed(matchSeed, player) {
  return (Math.imul(matchSeed >>> 0, 0x9e3779b1) ^ Math.imul(player + 1, 0x85ebca77)) >>> 0;
}

function cheb(a, b, W) {
  return Math.max(Math.abs((a % W) - (b % W)), Math.abs(((a / W) | 0) - ((b / W) | 0)));
}

function reachesAll(terrain, start, targets, W, H) {
  const seen = new Uint8Array(W * H);
  const stack = [start];
  seen[start] = 1;
  const visit = (j) => {
    if (!seen[j] && terrain[j] !== WALL) {
      seen[j] = 1;
      stack.push(j);
    }
  };
  while (stack.length) {
    const i = stack.pop();
    const x = i % W;
    if (i >= W) visit(i - W);
    if (i < W * (H - 1)) visit(i + W);
    if (x > 0) visit(i - 1);
    if (x < W - 1) visit(i + 1);
  }
  return targets.every((t) => seen[t]);
}

// Maps are symmetric under 180-degree rotation (tile i <-> N-1-i), so both
// players always have exactly the same material and neither side is favored.
export function generateMap(seed, cfg = DEFAULT_CONFIG) {
  const { W, H } = cfg;
  const N = W * H;
  if (N % 2 === 0) throw new Error('board must have an odd number of tiles');
  const center = (N - 1) / 2;
  const rot = (i) => N - 1 - i;

  for (let attempt = 0; attempt < 64; attempt++) {
    const wallPermille = attempt < 56 ? cfg.WALL_PERMILLE : 0;
    const r = makeRng((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
    const terrain = new Array(N).fill(PLAIN);
    for (let i = 0; i < center; i++) {
      if (r() % 1000 < wallPermille) terrain[i] = terrain[rot(i)] = WALL;
    }

    const coreCandidates = [];
    for (let i = 0; i < center; i++) {
      if (cheb(i, center, W) >= cfg.CORE_MIN_CENTER_DIST) coreCandidates.push(i);
    }
    const core0 = coreCandidates[r() % coreCandidates.length];
    const core1 = rot(core0);
    const cx = core0 % W;
    const cy = (core0 / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x;
        terrain[j] = terrain[rot(j)] = PLAIN;
      }
    }
    terrain[core0] = terrain[core1] = CORE;

    const wells = [];
    for (let tries = 0; wells.length < cfg.WELL_PAIRS * 2 && tries < 2000; tries++) {
      const i = r() % center;
      const j = rot(i);
      if (terrain[i] !== PLAIN) continue;
      if (cheb(i, core0, W) < 3 || cheb(i, core1, W) < 3 || cheb(i, j, W) < 3) continue;
      if (wells.some((w) => cheb(i, w, W) < 3)) continue;
      terrain[i] = terrain[j] = WELL;
      wells.push(i, j);
    }
    if (wells.length < cfg.WELL_PAIRS * 2) continue;
    if (!reachesAll(terrain, core0, [core1, ...wells], W, H)) continue;

    wells.sort((a, b) => a - b);
    return { terrain, cores: [core0, core1], wells };
  }
  throw new Error(`map generation failed for seed ${seed}`);
}

export function newGame(seed, cfg = DEFAULT_CONFIG) {
  const { terrain, cores, wells } = generateMap(seed, cfg);
  const N = cfg.W * cfg.H;
  const owner = new Array(N).fill(-1);
  const mass = new Array(N).fill(0);
  for (const w of wells) mass[w] = cfg.WELL_START_MASS;
  for (let p = 0; p < 2; p++) {
    owner[cores[p]] = p;
    mass[cores[p]] = cfg.CORE_START_MASS;
  }
  return {
    cfg,
    seed: seed >>> 0,
    tick: 0,
    terrain,
    cores,
    wells,
    owner,
    mass,
    energy: [cfg.ENERGY_START, cfg.ENERGY_START],
    over: false,
    winner: null, // 0, 1, or null for a draw
    reason: null, // 'core' | 'tiles' | 'mass' | 'draw' | 'fault'
  };
}

// 1 where player p can see, 0 elsewhere.
export function visibility(owner, p, cfg) {
  const { W, H, VISION: V } = cfg;
  const vis = new Array(W * H).fill(0);
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== p) continue;
    const cx = i % W;
    const cy = (i / W) | 0;
    const y1 = Math.min(H - 1, cy + V);
    const x1 = Math.min(W - 1, cx + V);
    for (let y = Math.max(0, cy - V); y <= y1; y++) {
      for (let x = Math.max(0, cx - V); x <= x1; x++) vis[y * W + x] = 1;
    }
  }
  return vis;
}

export function tally(owner, mass) {
  const tiles = [0, 0];
  const total = [0, 0];
  for (let i = 0; i < owner.length; i++) {
    const o = owner[i];
    if (o === 0 || o === 1) {
      tiles[o]++;
      total[o] += mass[i];
    }
  }
  return { tiles, mass: total };
}

// Everything bot() receives. Built fresh every tick, so a bot can never hold a
// reference that later reveals fogged tiles. Hidden: enemy energy, and enemy
// owner/mass outside vision (owner -2, mass -1).
export function viewFor(state, p) {
  const { cfg, owner, mass } = state;
  const vis = visibility(owner, p, cfg);
  const N = owner.length;
  const vOwner = new Array(N);
  const vMass = new Array(N);
  for (let i = 0; i < N; i++) {
    vOwner[i] = vis[i] ? owner[i] : -2;
    vMass[i] = vis[i] ? mass[i] : -1;
  }
  const t = tally(owner, mass);
  return {
    tick: state.tick,
    maxTicks: cfg.MAX_TICKS,
    me: p,
    enemy: 1 - p,
    W: cfg.W,
    H: cfg.H,
    energy: state.energy[p],
    energyCap: cfg.ENERGY_CAP,
    maxOrders: cfg.MAX_ORDERS,
    terrain: state.terrain.slice(),
    cores: state.cores.slice(),
    wells: state.wells.slice(),
    owner: vOwner,
    mass: vMass,
    visible: vis,
    tileCount: t.tiles,
    myMass: t.mass[p],
  };
}

// What init(map) receives once before tick 0.
export function mapInfo(state, p) {
  const { cfg } = state;
  return {
    W: cfg.W,
    H: cfg.H,
    maxTicks: cfg.MAX_TICKS,
    maxOrders: cfg.MAX_ORDERS,
    me: p,
    enemy: 1 - p,
    terrain: state.terrain.slice(),
    cores: state.cores.slice(),
    wells: state.wells.slice(),
    config: { ...cfg },
  };
}

// Copy a bot's return value into plain orders. Returns null if it isn't an
// array at all (a fault); silently drops malformed entries.
export function sanitizeOrders(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (let k = 0; k < raw.length && k < 64; k++) {
    const o = raw[k];
    if (o === null || typeof o !== 'object') continue;
    if (!Number.isInteger(o.from) || !Number.isInteger(o.dir)) continue;
    out.push({ from: o.from, dir: o.dir, all: o.all === true });
  }
  return out;
}

function end(state, winner, reason) {
  state.over = true;
  state.winner = winner;
  state.reason = reason;
}

function checkEnd(state) {
  const { cores, owner, mass, cfg } = state;
  const lost0 = owner[cores[0]] !== 0;
  const lost1 = owner[cores[1]] !== 1;
  if (lost0 || lost1) return end(state, lost0 && lost1 ? null : lost0 ? 1 : 0, 'core');
  if (state.tick >= cfg.MAX_TICKS) {
    const t = tally(owner, mass);
    if (t.tiles[0] !== t.tiles[1]) return end(state, t.tiles[0] > t.tiles[1] ? 0 : 1, 'tiles');
    if (t.mass[0] !== t.mass[1]) return end(state, t.mass[0] > t.mass[1] ? 0 : 1, 'mass');
    return end(state, null, 'draw');
  }
}

// A bot that throws, times out, or returns a non-array forfeits.
export function finishByFault(state, faults) {
  const f0 = Boolean(faults[0]);
  const f1 = Boolean(faults[1]);
  if (!f0 && !f1) return;
  end(state, f0 && f1 ? null : f0 ? 1 : 0, 'fault');
}

// Advance one tick. Both players' orders are read against the same starting
// snapshot, so neither player's orders can observe the other's.
// Illegal orders are skipped and cost nothing; each legal order costs 1 energy.
export function resolveTick(state, orders) {
  if (state.over) throw new Error('match is over');
  const { cfg, terrain, owner, mass } = state;
  const { W, H } = cfg;
  const N = W * H;
  const offs = dirOffsets(W);
  const startOwner = owner.slice();
  const startMass = mass.slice();
  const incoming = [new Array(N).fill(0), new Array(N).fill(0)];
  const touched = [];
  const applied = [[], []];

  for (let p = 0; p < 2; p++) {
    const used = new Set();
    let spent = 0;
    for (const o of orders[p] || []) {
      if (spent >= cfg.MAX_ORDERS || spent >= state.energy[p]) break;
      const { from, dir } = o;
      if (!(from >= 0 && from < N) || startOwner[from] !== p || used.has(from)) continue;
      if (!(dir >= 0 && dir <= 3)) continue;
      const x = from % W;
      if ((dir === 1 && x === W - 1) || (dir === 3 && x === 0)) continue;
      const to = from + offs[dir];
      if (to < 0 || to >= N || terrain[to] === WALL) continue;
      const amount = o.all ? startMass[from] : startMass[from] >> 1;
      if (amount <= 0) continue;
      used.add(from);
      spent++;
      mass[from] -= amount;
      if (incoming[0][to] === 0 && incoming[1][to] === 0) touched.push(to);
      incoming[p][to] += amount;
      applied[p].push({ from, to, dir, amount });
    }
    state.energy[p] -= spent;
  }

  // Opposing forces arriving at the same tile cancel first; the survivor then
  // fights whatever is on the tile. Order-independent and symmetric.
  for (const t of touched) {
    const net = incoming[0][t] - incoming[1][t];
    if (net === 0) continue;
    const p = net > 0 ? 0 : 1;
    const n = net > 0 ? net : -net;
    if (owner[t] === p) mass[t] += n;
    else if (n > mass[t]) {
      owner[t] = p;
      mass[t] = n - mass[t];
    } else mass[t] -= n;
  }

  state.tick++;
  for (let p = 0; p < 2; p++) {
    state.energy[p] = Math.min(cfg.ENERGY_CAP, state.energy[p] + cfg.ENERGY_REGEN);
  }
  for (const c of state.cores) if (owner[c] >= 0) mass[c] += cfg.CORE_INCOME;
  for (const w of state.wells) if (owner[w] >= 0) mass[w] += cfg.WELL_INCOME;
  if (state.tick % cfg.PULSE_EVERY === 0) {
    for (let i = 0; i < N; i++) if (owner[i] >= 0) mass[i]++;
  }
  checkEnd(state);
  return { applied };
}
