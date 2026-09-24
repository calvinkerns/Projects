// The scoreboard ladder. A new bot challenges #1, then #2, and so on down the
// board. Each challenge is up to 10 games, swapping sides every game, and
// winning 6 takes that spot. A challenge stops once its result is certain.

import { runMatch } from './match.js?v=f5617c9e';

export const LADDER = Object.freeze({ size: 21, maxTicks: 800, games: 10, winsNeeded: 6, top: 10 });

const rules = { size: LADDER.size, maxTicks: LADDER.maxTicks };
const players = (challenger, opponent, side) => (side === 0 ? [challenger, opponent] : [opponent, challenger]);

// challenger: { name, source }. ranked: community bots on the scoreboard, #1 first.
// Resolves to { rank, challenges }; rank is null if it beat nobody on a full board.
export async function climbLadder(challenger, ranked, { onProgress, signal } = {}) {
  const challenges = [];
  for (const [i, opponent] of ranked.entries()) {
    const challenge = { opponentId: opponent.serverId, opponentName: opponent.name, wins: 0, losses: 0, draws: 0, games: [] };
    challenges.push(challenge);
    for (let g = 0; g < LADDER.games; g++) {
      const side = g % 2;
      const seed = (Math.random() * 2 ** 32) >>> 0;
      const [a, b] = players(challenger, opponent, side);
      const { replay } = await runMatch({ a, b, seed, rules, signal });
      const { winner, reason, tick } = replay.result;
      challenge.games.push({ seed, side, winner, reason, tick });
      if (winner === -1) challenge.draws++;
      else if (winner === side) challenge.wins++;
      else challenge.losses++;
      onProgress?.({ rank: i + 1, opponent, challenge });
      if (challenge.wins >= LADDER.winsNeeded) return { rank: i + 1, challenges };
      if (challenge.losses + challenge.draws > LADDER.games - LADDER.winsNeeded) break; // can't reach 6 now
    }
  }
  return { rank: ranked.length < LADDER.top ? ranked.length + 1 : null, challenges };
}

// Play a recorded game again so it can be watched. Games are deterministic,
// so only the seed and sides were stored.
export async function replayGame(challenger, opponent, game, signal) {
  const [a, b] = players(challenger, opponent, game.side);
  const { replay } = await runMatch({ a, b, seed: game.seed, rules, signal });
  return replay;
}
