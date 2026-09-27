// Win rate for `name` over match results, draws counting half.
export function winRate(results, name) {
  let points = 0, games = 0;
  for (const r of results) {
    const side = r.names.indexOf(name);
    if (side < 0) continue;
    games++;
    points += r.winner === side ? 1 : r.winner === -1 ? 0.5 : 0;
  }
  return games ? points / games : NaN;
}

// 95% Wilson interval, so small samples don't look more certain than they are.
export function wilson(p, n, z = 1.96) {
  if (!n) return [0, 1];
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export const pct = (x) => `${(100 * x).toFixed(1)}%`;

export function parseArgs(argv, defaults) {
  const out = { ...defaults, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const v = argv[i + 1];
    out[key] = typeof defaults[key] === 'number' ? Number(v) : v;
    i++;
  }
  return out;
}
