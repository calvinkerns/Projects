// Shared test helpers: hand-built states, mirroring, and a seeded RNG.
// Every config here is explicit so tests never depend on the tuned defaults.

import { CORE, DEFAULT_CONFIG, makeRng, PLAIN } from '../../src/engine.js';

// A quiet config: no income, no pulses, no regen, plenty of energy and ticks.
export function quietConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    W: 5,
    H: 5,
    MAX_TICKS: 1000,
    CORE_START_MASS: 1000,
    CORE_INCOME: 0,
    WELL_INCOME: 0,
    PULSE_EVERY: 1000,
    ENERGY_START: 10,
    ENERGY_REGEN: 0,
    ENERGY_CAP: 100,
    MAX_ORDERS: 10,
    VISION: 1,
    ...overrides,
  };
}

// A blank board: plain terrain, cores in the two corners (0 and N-1), each
// owned by its player with CORE_START_MASS so nothing ends by accident.
export function blankState(overrides = {}) {
  const cfg = quietConfig(overrides);
  const N = cfg.W * cfg.H;
  const s = {
    cfg,
    seed: 0,
    tick: 0,
    terrain: new Array(N).fill(PLAIN),
    cores: [0, N - 1],
    wells: [],
    owner: new Array(N).fill(-1),
    mass: new Array(N).fill(0),
    energy: [cfg.ENERGY_START, cfg.ENERGY_START],
    over: false,
    winner: null,
    reason: null,
  };
  for (let p = 0; p < 2; p++) {
    s.terrain[s.cores[p]] = CORE;
    s.owner[s.cores[p]] = p;
    s.mass[s.cores[p]] = cfg.CORE_START_MASS;
  }
  return s;
}

export const at = (s, x, y) => y * s.cfg.W + x;

export function put(s, x, y, owner, mass) {
  const i = at(s, x, y);
  s.owner[i] = owner;
  s.mass[i] = mass;
  return i;
}

export function clone(s) {
  return structuredClone(s);
}

const swapOwner = (o) => (o === 0 ? 1 : o === 1 ? 0 : o);

// Rotate the board 180 degrees and swap the players.
export function mirrorState(s) {
  const N = s.owner.length;
  const rot = (i) => N - 1 - i;
  return {
    ...s,
    terrain: s.terrain.slice().reverse(),
    owner: s.owner.slice().reverse().map(swapOwner),
    mass: s.mass.slice().reverse(),
    cores: [rot(s.cores[1]), rot(s.cores[0])],
    wells: s.wells.map(rot).sort((a, b) => a - b),
    energy: [s.energy[1], s.energy[0]],
    winner: s.winner === null ? null : 1 - s.winner,
  };
}

// Mirror one order. Off-board sources stay off-board and invalid directions
// stay invalid, so a skipped order is still skipped in the mirror.
export function mirrorOrder(o, N) {
  return {
    ...o,
    from: Number.isInteger(o.from) ? N - 1 - o.from : o.from,
    dir: o.dir >= 0 && o.dir <= 3 ? (o.dir + 2) % 4 : o.dir,
  };
}

export function mirrorOrders(orders, N) {
  return [orders[1], orders[0]].map((list) => (list || []).map((o) => mirrorOrder(o, N)));
}

export function mirrorApplied(applied, N) {
  return [applied[1], applied[0]].map((list) =>
    list.map((a) => ({ from: N - 1 - a.from, to: N - 1 - a.to, dir: (a.dir + 2) % 4, amount: a.amount })),
  );
}

// Float in [0, 1) from the engine's integer PRNG, for reproducible randomness.
export function rng(seed) {
  const next = makeRng(seed);
  const r = () => next() / 4294967296;
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)); // inclusive
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}
