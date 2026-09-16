// Starter bot: edit me!
//
// Every tick, return one move: tile.moveTo(neighbour).
// A move sends all but 1 of the tile's mass, and the bigger number wins a fight.

function bot(game) {
  // If an enemy stack is getting close to my core, keep my core's mass at home.
  const danger = game.enemyTiles.some((t) => t.mass > 2 * t.distanceTo(game.myCore));
  const stacks = game.myTiles.filter((t) => t.mass >= 2 && !(danger && t === game.myCore));
  if (stacks.length === 0) return; // nothing to move yet

  // Work with my biggest stack.
  const biggest = stacks.sort((a, b) => b.mass - a.mass)[0];

  // Big enough to win? March on the enemy core.
  const distance = biggest.distanceTo(game.enemyCore);
  if (biggest.mass > game.enemyCore.mass + 2 * distance + 5) {
    return biggest.moveTo(biggest.stepToward(game.enemyCore));
  }

  // Otherwise grab the closest tile it can beat.
  const targets = game.tiles.filter((t) => !t.mine && !t.wall && !t.core && t.mass < biggest.mass - 1);
  const target = biggest.closest(targets);
  if (target) return biggest.moveTo(biggest.stepToward(target));
}
