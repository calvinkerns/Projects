// Rusher: saves up in its core, then marches straight at the enemy core.
function bot(game) {
  const biggest = game.myTiles.sort((a, b) => b.mass - a.mass)[0];
  if (biggest.mass < 2) return;
  // Enough to survive the walk and still beat their core when it arrives?
  const needed = 10 + 2 * game.myCore.distanceTo(game.enemyCore);
  if (biggest === game.myCore && biggest.mass < needed) return;
  return biggest.moveTo(biggest.stepToward(game.enemyCore));
}
