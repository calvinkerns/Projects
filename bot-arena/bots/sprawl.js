// Sprawl — pushes half of its biggest stack into any neighbor it doesn't own.
// Simple, greedy, and genuinely bad. A good first opponent.

const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // dir 0=N 1=E 2=S 3=W

function bot(s) {
  // Find my biggest stack.
  let from = -1;
  let best = 1;
  for (let i = 0; i < s.W * s.H; i++) {
    if (s.owner[i] === s.me && s.mass[i] > best) {
      from = i;
      best = s.mass[i];
    }
  }
  if (from < 0) return [];

  // Push half of it into the first neighbor that isn't a wall and isn't mine.
  const x = from % s.W;
  const y = Math.floor(from / s.W);
  for (let dir = 0; dir < 4; dir++) {
    const nx = x + STEPS[dir][0];
    const ny = y + STEPS[dir][1];
    if (nx < 0 || ny < 0 || nx >= s.W || ny >= s.H) continue;
    const to = ny * s.W + nx;
    if (s.terrain[to] === 1 || s.owner[to] === s.me) continue;
    return [{ from, dir }];
  }
  return [];
}
