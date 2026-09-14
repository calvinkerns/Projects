// Plays one match between two bot handles. Shared by the browser and Node.
//
// A bot handle is { init(map), turn(view), dispose() } where init and turn
// return a Promise of { ok: true, value } or { ok: false, error }.

import {
  DEFAULT_CONFIG,
  ENGINE_VERSION,
  finishByFault,
  mapInfo,
  newGame,
  resolveTick,
  sanitizeOrders,
  viewFor,
} from './engine.js';

function snapshot(state, applied) {
  return {
    tick: state.tick,
    owner: state.owner.slice(),
    mass: state.mass.slice(),
    energy: state.energy.slice(),
    applied,
  };
}

export async function playMatch({ seed, bots, cfg = DEFAULT_CONFIG, frames = false, onTick }) {
  const state = newGame(seed, cfg);
  const result = {
    engine: ENGINE_VERSION,
    seed: state.seed,
    map: { W: cfg.W, H: cfg.H, terrain: state.terrain, cores: state.cores, wells: state.wells },
    config: cfg,
    frames: frames ? [snapshot(state, [[], []])] : null,
    winner: null,
    reason: null,
    ticks: 0,
    faults: [null, null],
  };

  try {
    const inits = await Promise.all([0, 1].map((p) => bots[p].init(mapInfo(state, p))));
    let faults = inits.map((r) => (r.ok ? null : r.error));

    while (!faults[0] && !faults[1] && !state.over) {
      const replies = await Promise.all([0, 1].map((p) => bots[p].turn(viewFor(state, p))));
      const orders = [null, null];
      faults = replies.map((r, p) => {
        if (!r.ok) return r.error;
        orders[p] = sanitizeOrders(r.value);
        return orders[p] ? null : 'bot() must return an array of orders';
      });
      if (faults[0] || faults[1]) break;
      const { applied } = resolveTick(state, orders);
      if (frames) result.frames.push(snapshot(state, applied));
      if (onTick) await onTick(state);
    }

    finishByFault(state, faults);
    result.faults = faults;
  } finally {
    for (const b of bots) b.dispose?.();
  }

  result.winner = state.winner;
  result.reason = state.reason;
  result.ticks = state.tick;
  return result;
}
