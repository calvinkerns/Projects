import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE, DEFAULT_CONFIG, generateMap, newGame, WALL, WELL } from '../src/engine.js';

// Map properties only, never specific numbers: constants are still being tuned.
const CONFIGS = [
  ['default', DEFAULT_CONFIG],
  ['small odd board', { ...DEFAULT_CONFIG, W: 15, H: 11, CORE_MIN_CENTER_DIST: 4, WELL_PAIRS: 3 }],
];

function reachable(terrain, start, W, H) {
  const seen = new Uint8Array(W * H);
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.shift();
    const x = i % W;
    const next = [];
    if (i >= W) next.push(i - W);
    if (i < W * (H - 1)) next.push(i + W);
    if (x > 0) next.push(i - 1);
    if (x < W - 1) next.push(i + 1);
    for (const j of next) {
      if (!seen[j] && terrain[j] !== WALL) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return seen;
}

for (const [label, cfg] of CONFIGS) {
  test(`maps are symmetric, well-formed and connected (${label}, 200 seeds)`, () => {
    const { W, H } = cfg;
    const N = W * H;
    for (let seed = 1; seed <= 200; seed++) {
      const m = generateMap(seed, cfg);
      const where = `seed ${seed}`;
      assert.equal(m.terrain.length, N, where);

      for (let i = 0; i < N; i++) {
        assert.equal(m.terrain[i], m.terrain[N - 1 - i], `${where}: tile ${i} not rotationally symmetric`);
      }

      assert.equal(m.cores.length, 2, where);
      assert.equal(m.cores[1], N - 1 - m.cores[0], `${where}: cores are not rotations of each other`);
      assert.notEqual(m.cores[0], m.cores[1], where);
      for (const c of m.cores) assert.equal(m.terrain[c], CORE, where);

      assert.equal(m.wells.length, cfg.WELL_PAIRS * 2, `${where}: well count`);
      assert.equal(new Set(m.wells).size, m.wells.length, `${where}: duplicate wells`);
      const wellSet = new Set(m.wells);
      for (const w of m.wells) {
        assert.equal(m.terrain[w], WELL, where);
        assert.ok(wellSet.has(N - 1 - w), `${where}: well ${w} has no rotated partner`);
      }

      // No stray special tiles beyond the listed cores and wells.
      const cores = m.terrain.filter((t) => t === CORE).length;
      const wells = m.terrain.filter((t) => t === WELL).length;
      assert.equal(cores, 2, where);
      assert.equal(wells, m.wells.length, where);

      const seen = reachable(m.terrain, m.cores[0], W, H);
      assert.ok(seen[m.cores[1]], `${where}: enemy core unreachable`);
      for (const w of m.wells) assert.ok(seen[w], `${where}: well ${w} unreachable`);
    }
  });
}

test('same seed gives an identical map and game; different seeds differ', () => {
  const distinct = new Set();
  for (let seed = 0; seed < 50; seed++) {
    assert.deepEqual(generateMap(seed), generateMap(seed));
    assert.deepEqual(newGame(seed), newGame(seed));
    distinct.add(JSON.stringify(generateMap(seed).terrain));
  }
  assert.ok(distinct.size > 40, 'seeds should produce varied maps');
});

test('newGame starts both players on equal footing', () => {
  const cfg = { ...DEFAULT_CONFIG };
  for (let seed = 1; seed <= 20; seed++) {
    const s = newGame(seed, cfg);
    const N = cfg.W * cfg.H;
    assert.equal(s.owner[s.cores[0]], 0);
    assert.equal(s.owner[s.cores[1]], 1);
    assert.deepEqual(s.energy, [cfg.ENERGY_START, cfg.ENERGY_START]);
    for (let i = 0; i < N; i++) {
      assert.equal(s.mass[i], s.mass[N - 1 - i]);
      const o = s.owner[i];
      const r = s.owner[N - 1 - i];
      assert.equal(o < 0 ? o : 1 - o, r);
    }
    assert.equal(s.over, false);
  }
});
