import { parentPort } from 'node:worker_threads';
import { playMatch } from '../../tools/lib.mjs';
import { score } from '../../site/js/engine.js';

parentPort.on('message', ({ id, job }) => {
  const { a, b, seed, rules, keepReplay } = job;
  const t0 = performance.now();
  const r = playMatch(a, b, seed, { rules });
  const s = score(r.state);
  parentPort.postMessage({
    id,
    result: {
      names: [a.name, b.name],
      seed,
      rules: r.state.rules,
      winner: r.state.result.winner,
      reason: r.state.result.reason,
      tick: r.state.result.tick,
      tiles: s.tiles,
      mass: s.mass,
      errors: r.errors,
      cpuMs: r.cpu.map((c) => Math.round(c)),
      wallMs: Math.round(performance.now() - t0),
      replay: keepReplay ? r.replay : undefined,
    },
  });
});
