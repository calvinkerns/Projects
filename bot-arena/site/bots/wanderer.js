// Wanderer: moves a random tile in a random direction.
function bot(game) {
  const movable = game.myTiles.filter((t) => t.mass >= 2);
  if (movable.length === 0) return;
  const from = movable[Math.floor(Math.random() * movable.length)];
  const to = from.neighbors[Math.floor(Math.random() * from.neighbors.length)];
  return from.moveTo(to);
}
