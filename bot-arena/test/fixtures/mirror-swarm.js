// Mirror Swarm — a rotation-invariant greedy bot for symmetry tests.
// author: test
//
// It thinks in a canonical frame where its own core is always cores[0], so as
// player 1 it sees the board rotated 180 degrees. Two copies therefore play
// exact mirror images of each other, unlike Sprawl, whose index-order tie
// breaks differ between the two sides.

var ME_CORE = 0;

function init(map) {
  ME_CORE = map.cores[0];
}

function bot(s) {
  var N = s.W * s.H;
  var flip = s.me === 1;
  var c = function (i) { return flip ? N - 1 - i : i; }; // canonical <-> real (self-inverse)
  var enemyCore = s.cores[1]; // in the canonical frame the enemy core is always cores[1]
  if (flip) enemyCore = N - 1 - s.cores[0];
  var ex = enemyCore % s.W, ey = Math.floor(enemyCore / s.W);
  var STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  var orders = [];
  for (var k = 0; k < N && orders.length < Math.min(s.maxOrders, s.energy); k++) {
    var i = c(k); // real index of canonical tile k
    if (s.owner[i] !== s.me || s.mass[i] < 4) continue;
    var x = k % s.W, y = Math.floor(k / s.W);
    var best = -1, bestScore = 1e9;
    for (var d = 0; d < 4; d++) {
      var nx = x + STEPS[d][0], ny = y + STEPS[d][1];
      if (nx < 0 || ny < 0 || nx >= s.W || ny >= s.H) continue;
      var to = c(ny * s.W + nx);
      if (s.terrain[to] === 1) continue;
      var score = Math.abs(nx - ex) + Math.abs(ny - ey) + (s.owner[to] === s.me ? 3 : 0);
      if (score < bestScore) { bestScore = score; best = d; }
    }
    if (best < 0) continue;
    var realDir = flip ? (best + 2) % 4 : best;
    orders.push({ from: i, dir: realDir, all: s.mass[i] >= 12 });
  }
  return orders;
}
