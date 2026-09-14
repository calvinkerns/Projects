// Engine invariants. Run with: node tools/test.mjs

import {
  N, W, WALL, CORE, WELL, createMatch, generateMap, step, neighbor, replayFrames, viewFor, FOG, rng32, RULES,
} from '../site/js/engine.js';
import { loadBot, playMatch, seedFor } from './lib.mjs';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log(`FAIL: ${msg}`); } };
const rot = (i) => N - 1 - i;
const rotDir = (d) => (d + 2) % 4;

// 1. Maps are rotationally symmetric, fully connected, and have what they should.
for (let k = 0; k < 300; k++) {
  const seed = seedFor(k);
  const { terrain, cores, wells } = generateMap(seed);
  let sym = true;
  for (let i = 0; i < N; i++) if (terrain[i] !== terrain[rot(i)]) sym = false;
  check(sym, `map ${seed} not symmetric`);
  check(cores[1] === rot(cores[0]), `map ${seed} cores not rotated`);
  check(terrain[cores[0]] === CORE && terrain[cores[1]] === CORE, `map ${seed} core terrain`);
  check(wells.length === RULES.wellPairs * 2 && wells.every((w) => terrain[w] === WELL), `map ${seed} wells`);
  const seen = new Uint8Array(N), q = [cores[0]];
  seen[cores[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    for (let d = 0; d < 4; d++) {
      const j = neighbor(q[h], d);
      if (j >= 0 && !seen[j] && terrain[j] !== WALL) { seen[j] = 1; q.push(j); }
    }
  }
  let connected = true;
  for (let i = 0; i < N; i++) if (terrain[i] !== WALL && !seen[i]) connected = false;
  check(connected, `map ${seed} has unreachable open tiles`);
}

// 2. Mirrored orders keep the whole board mirrored: no hidden player-index bias.
for (let k = 0; k < 40; k++) {
  const state = createMatch(seedFor(k));
  const rand = rng32(k + 1);
  let symmetric = true;
  while (!state.result && symmetric) {
    const mine = [];
    for (let i = 0; i < N; i++) if (state.owner[i] === 0 && state.mass[i] > 0) mine.push(i);
    const o0 = [];
    for (let c = 0; c < 7 && mine.length; c++) {
      o0.push({ from: mine[rand() % mine.length], dir: rand() % 4, all: rand() % 3 === 0 });
    }
    const o1 = o0.map((o) => ({ from: rot(o.from), dir: rotDir(o.dir), all: o.all }));
    step(state, o0, o1);
    for (let i = 0; i < N && symmetric; i++) {
      const a = state.owner[i], b = state.owner[rot(i)];
      const flipped = b === -1 ? -1 : 1 - b;
      if (a !== flipped || state.mass[i] !== state.mass[rot(i)]) symmetric = false;
    }
    if (state.energy[0] !== state.energy[1]) symmetric = false;
  }
  check(symmetric, `seed ${seedFor(k)} lost symmetry at tick ${state.tick}`);
  if (state.result) check(state.result.winner === -1, `mirrored game ${seedFor(k)} should draw, got ${JSON.stringify(state.result)}`);
}

// 3. A replay rebuilds exactly the final state of the live match, even through JSON.
const bots = ['sprawl', 'drunkard', 'idler'].map((b) => loadBot(`site/bots/${b}.js`));
for (let k = 0; k < 15; k++) {
  const { replay, state } = playMatch(bots[k % 2], bots[(k + 1) % 3], seedFor(k));
  const rebuilt = replayFrames(JSON.parse(JSON.stringify(replay)));
  const last = rebuilt.frames[rebuilt.frames.length - 1];
  check(last.tick === state.tick, `replay ${k} tick ${last.tick} != ${state.tick}`);
  check(last.owner.every((v, i) => v === state.owner[i]), `replay ${k} owner mismatch`);
  check(last.mass.every((v, i) => v === state.mass[i]), `replay ${k} mass mismatch`);
  check(JSON.stringify(rebuilt.result) === JSON.stringify(state.result), `replay ${k} result mismatch`);
}

// 4. Views hide what they should and never alias engine memory.
{
  const state = createMatch(seedFor(3));
  const v = viewFor(state, 0);
  check(v.owner[state.cores[1]] === FOG, 'enemy core should start fogged');
  check(v.mass[state.cores[1]] === -1, 'fogged mass should be -1');
  check(v.cores[0] === state.cores[0] && v.cores[1] === state.cores[1], 'cores are [mine, theirs]');
  v.owner[state.cores[0]] = 1;
  v.mass.fill(9999);
  check(state.owner[state.cores[0]] === 0 && state.mass[state.cores[0]] !== 9999, 'view aliases engine state');
  const v1 = viewFor(state, 1);
  check(v1.cores[0] === state.cores[1], 'player 1 sees its own core first');
}

// 5. Combat arithmetic.
{
  const state = createMatch(seedFor(5));
  const c = state.cores[0];
  let t = -1, dir = -1;
  for (let d = 0; d < 4; d++) { const j = neighbor(c, d); if (j >= 0 && state.terrain[j] !== WALL) { t = j; dir = d; break; } }
  state.mass[c] = 40; // half = 20
  state.owner[t] = 1; state.mass[t] = 15;
  step(state, [{ from: c, dir }], []);
  check(state.owner[t] === 0 && state.mass[t] === 5, `20 attacking 15 should capture with 5, got owner ${state.owner[t]} mass ${state.mass[t]}`);
  check(state.energy[0] === RULES.energyStart - 1 + RULES.energyRegen, 'order costs one energy');
  const e = state.energy[0];
  step(state, [{ from: c, dir: 99 }, { from: 9999, dir: 0 }, 'junk', null], []);
  check(state.energy[0] === Math.min(RULES.energyCap, e + RULES.energyRegen), 'invalid orders must be free');
}

console.log(failures ? `\n${failures} failure(s)` : 'all engine tests passed');
process.exit(failures ? 1 : 0);
