// Captain: expands, keeps its core safe, and attacks when it can win.
function bot(game) {
  const { myCore, enemyCore } = game;
  const stacks = game.myTiles.filter((t) => t.mass >= 2).sort((a, b) => b.mass - a.mass);
  if (stacks.length === 0) return;

  // Moving out of my core leaves it with 1. An enemy stack d steps away arrives
  // with about (mass - d), by which time my core has regrown to (1 + d) and
  // defends at double strength. Only empty the core if every stack would lose.
  const coreSafeToEmpty = game.enemyTiles.every((t) => {
    const d = t.distanceTo(myCore);
    return t.mass - d < 2 * (1 + d);
  });
  const usable = stacks.filter((t) => t !== myCore || coreSafeToEmpty);
  if (usable.length === 0) return; // keep the core home and let it grow

  // 1. Take the biggest enemy tile next to one of my stacks that I can beat.
  let best = null;
  for (const stack of usable) {
    for (const t of stack.neighbors) {
      const defense = t.core ? t.mass * 2 : t.mass;
      if (t.enemy && stack.mass - 1 > defense && (!best || t.mass > best.target.mass)) best = { stack, target: t };
    }
  }
  if (best) return best.stack.moveTo(best.target);

  // 2. Attack the enemy core if my biggest stack will still win when it arrives.
  const biggest = usable[0];
  const distance = biggest.distanceTo(enemyCore);
  if (biggest.mass - distance > 2 * (enemyCore.mass + distance) + 3) {
    return biggest.moveTo(biggest.stepToward(enemyCore));
  }

  // 3. Expand: grab an empty neighbour, using the biggest stacks first.
  for (const stack of usable.slice(0, 8)) {
    const grab = stack.neighbors.find((t) => t.neutral && t.mass < stack.mass - 1);
    if (grab) return stack.moveTo(grab);
  }

  // 4. Nothing next to my stacks: walk the biggest toward land it can take.
  const target = biggest.closest(game.tiles.filter((t) => !t.mine && !t.wall && !t.core && t.mass < biggest.mass - 1));
  if (target) return biggest.moveTo(biggest.stepToward(target));
}
