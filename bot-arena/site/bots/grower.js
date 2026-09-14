// Grower: its biggest stack walks to the nearest land it can take.
function bot(game) {
  const biggest = game.myTiles.sort((a, b) => b.mass - a.mass)[0];
  if (biggest.mass < 2) return;
  const targets = game.tiles.filter((t) => !t.mine && !t.wall && t.mass < biggest.mass - 1);
  const target = biggest.closest(targets);
  if (target) return biggest.moveTo(biggest.stepToward(target));
}
