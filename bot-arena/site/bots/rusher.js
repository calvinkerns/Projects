// Rusher: saves up in its core, then marches straight at the enemy core.
function bot(game) {
  const biggest = game.myTiles.sort((a, b) => b.mass - a.mass)[0];
  if (biggest.mass < 2) return;
  if (biggest === game.myCore && biggest.mass < 25) return; // still saving up
  return biggest.moveTo(biggest.stepToward(game.enemyCore));
}
