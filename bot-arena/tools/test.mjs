// Engine and bot API invariants. Run with: node tools/test.mjs

import { SIZES, WALL, MIN_TICKS, MAX_TICKS, RULES, createMatch, generateMap, step, neighbor, buildReplay, makeRules, viewFor, rng32 } from '../site/js/engine.js';
import { makeGame } from '../site/js/botapi.js';
import { loadBot, playMatch, seedFor } from './lib.mjs';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log(`FAIL: ${msg}`); } };

// 1. Maps are rotationally symmetric and fully connected, at every size.
for (const size of SIZES) {
  const n = size * size;
  const rot = (i) => n - 1 - i;
  for (let k = 0; k < 40; k++) {
    const { terrain, cores } = generateMap(seedFor(k), size, 12);
    let symmetric = true;
    for (let i = 0; i < n; i++) if (terrain[i] !== terrain[rot(i)]) symmetric = false;
    check(symmetric, `${size}x${size} map ${k} not symmetric`);
    check(cores[1] === rot(cores[0]) && terrain[cores[0]] !== WALL, `${size}x${size} map ${k} cores`);
    const seen = new Uint8Array(n), queue = [cores[0]];
    seen[cores[0]] = 1;
    for (let h = 0; h < queue.length; h++) {
      for (let d = 0; d < 4; d++) {
        const j = neighbor(size, queue[h], d);
        if (j >= 0 && !seen[j] && terrain[j] !== WALL) { seen[j] = 1; queue.push(j); }
      }
    }
    let connected = true;
    for (let i = 0; i < n; i++) if (terrain[i] !== WALL && !seen[i]) connected = false;
    check(connected, `${size}x${size} map ${k} has unreachable tiles`);
  }
}

// 2. Mirrored moves keep the board mirrored: no hidden player-index bias.
for (const size of SIZES) {
  const n = size * size;
  const rot = (i) => n - 1 - i;
  for (let k = 0; k < 8; k++) {
    const state = createMatch(seedFor(k), { size, maxTicks: 400 });
    const rand = rng32(k + 7);
    let symmetric = true;
    while (!state.result && symmetric) {
      const mine = [];
      for (let i = 0; i < n; i++) if (state.owner[i] === 0 && state.mass[i] >= 2) mine.push(i);
      const m0 = mine.length ? { from: mine[rand() % mine.length], dir: rand() % 4 } : null;
      const m1 = m0 && { from: rot(m0.from), dir: (m0.dir + 2) % 4 };
      step(state, m0, m1);
      for (let i = 0; i < n && symmetric; i++) {
        const other = state.owner[rot(i)];
        if (state.owner[i] !== (other < 0 ? other : 1 - other) || state.mass[i] !== state.mass[rot(i)]) symmetric = false;
      }
    }
    check(symmetric, `${size}x${size} seed ${k} lost symmetry at tick ${state.tick}`);
    if (state.result) check(state.result.winner === -1, `mirrored ${size}x${size} game ${k} should draw`);
  }
}

// 3. A replay rebuilds exactly the final state of the live match, even through JSON.
const bots = ['grower', 'wanderer', 'rusher', 'captain'].map((b) => loadBot(`site/bots/${b}.js`));
for (let k = 0; k < 12; k++) {
  const size = SIZES[k % SIZES.length];
  const { replay, state } = playMatch(bots[k % 4], bots[(k + 1) % 4], seedFor(k), { rules: { size, maxTicks: 400 } });
  const rebuilt = buildReplay(JSON.parse(JSON.stringify(replay)), 16);
  const last = rebuilt.frameAt(rebuilt.length);
  check(rebuilt.size === size, `replay ${k} size`);
  check(last.tick === state.tick, `replay ${k} tick ${last.tick} != ${state.tick}`);
  check(last.owner.every((v, i) => v === state.owner[i]) && last.mass.every((v, i) => v === state.mass[i]), `replay ${k} board mismatch`);
  check(JSON.stringify(rebuilt.result) === JSON.stringify(state.result), `replay ${k} result mismatch`);
}

// 4. The bot API sees the board from the right side and its helpers work.
{
  const state = createMatch(seedFor(3), { size: 15 });
  const game = makeGame(viewFor(state, 1));
  check(game.myCore.index === state.cores[1] && game.myCore.mine && game.enemyCore.enemy, 'cores from player 1 side');
  check(game.myTiles.length === 1 && game.enemyTiles.length === 1, 'one tile each at the start');
  const next = game.myCore.stepToward(game.enemyCore);
  check(next && next.distanceTo(game.enemyCore) === game.myCore.distanceTo(game.enemyCore) - 1, 'stepToward gets closer');
  const move = game.myCore.moveTo(next);
  check(move && neighbor(15, move.from, move.dir) === next.index, 'moveTo picks the right direction');
  check(game.myCore.moveTo(game.enemyCore) === null, 'moveTo refuses tiles that are not neighbours');
  check(game.tiles.every((t) => t.neighbors.every((nb) => !nb.wall)), 'neighbors never include walls');
  check(game.tile(0, 0) === game.tiles[0] && game.tile(-1, 0) === null, 'tile(x, y)');
}

// 5. Combat arithmetic: a move sends all but 1, and the bigger number wins.
{
  const state = createMatch(seedFor(5), { size: 21 });
  const c = state.cores[0];
  let t = -1, dir = -1;
  for (let d = 0; d < 4; d++) {
    const j = neighbor(21, c, d);
    if (j >= 0 && state.terrain[j] !== WALL) { t = j; dir = d; break; }
  }
  state.mass[c] = 21;
  state.owner[t] = 1;
  state.mass[t] = 15;
  step(state, { from: c, dir }, null);
  check(state.owner[t] === 0 && state.mass[t] === 5, `20 attacking 15 should capture with 5, got owner ${state.owner[t]} mass ${state.mass[t]}`);
  check(state.mass[c] === 2, `core keeps 1 and grows by 1, got ${state.mass[c]}`);
  step(state, { from: 99999, dir: 0 }, 'junk');
  check(state.tick === 2, 'junk moves are ignored');
}

// 6. The tick limit is chosen by the player, within bounds.
{
  check(makeRules({ maxTicks: 1234 }).maxTicks === 1234, 'a tick limit inside the range is kept');
  check(makeRules({ maxTicks: 10 }).maxTicks === MIN_TICKS, `tick limits below ${MIN_TICKS} are raised`);
  check(makeRules({ maxTicks: 999999 }).maxTicks === MAX_TICKS, `tick limits above ${MAX_TICKS} are capped`);
  check(makeRules({ maxTicks: 'abc' }).maxTicks === RULES.maxTicks, 'a nonsense tick limit falls back to the default');
  check(makeRules({ size: 999 }).size === RULES.size, 'an unsupported size falls back to the default');
  const state = createMatch(seedFor(9), { size: 15, maxTicks: MIN_TICKS });
  while (!state.result) step(state, null, null);
  check(state.tick === MIN_TICKS, `an idle match ends exactly at the tick limit, got ${state.tick}`);
}

// 7. Seeking backwards through a replay rebuilds the same board as playing forwards.
{
  const { replay } = playMatch(bots[0], bots[3], seedFor(4), { rules: { size: 15, maxTicks: 400 } });
  const forwards = buildReplay(replay, 16);
  const backwards = buildReplay(replay, 16);
  let same = true;
  const snapshots = [];
  for (let k = 0; k <= forwards.length; k++) snapshots.push(Array.from(forwards.frameAt(k).owner));
  for (let k = backwards.length; k >= 0; k--) {
    const frame = backwards.frameAt(k);
    if (frame.tick !== k || !snapshots[k].every((v, i) => v === frame.owner[i])) same = false;
  }
  check(same, 'rewinding a replay gives the same boards as playing it forwards');
}

console.log(failures ? `\n${failures} failure(s)` : 'all tests passed');
process.exit(failures ? 1 : 0);
