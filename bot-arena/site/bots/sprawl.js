// Sprawl: push half of my biggest stack into the first neighbor I don't own.
// Greedy, never banks, never defends.
const DIRS = [-21, 1, 21, -1]; // N E S W

function bot(s) {
  const W = s.W, N = W * s.H;

  let src = -1, best = 1;
  for (let i = 0; i < N; i++) {
    if (s.owner[i] === s.me && s.mass[i] > best) { src = i; best = s.mass[i]; }
  }
  if (src < 0) return [];

  const x = src % W;
  for (let d = 0; d < 4; d++) {
    if (d === 1 && x === W - 1) continue;
    if (d === 3 && x === 0) continue;
    const t = src + DIRS[d];
    if (t < 0 || t >= N) continue;
    if (s.terrain[t] === 1) continue; // wall
    if (s.owner[t] === s.me) continue;
    return [{ from: src, dir: d, all: false }];
  }
  return [];
}
