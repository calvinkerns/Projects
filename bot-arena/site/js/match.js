// Plays a full match in the browser, each bot in its own sandboxed worker.

import { createMatch, viewFor, step, forfeit, newReplay, recordTick } from './engine.js';
import { createBotRunner } from './sandbox.js';

export const INIT_LIMIT_MS = 1000;
export const TICK_LIMIT_MS = 50;
const ERRORS_LOGGED = 20;

const where = (error) => (error.line ? ` (line ${error.line})` : '');

// Resolves to { replay, logs: [logsP0, logsP1] }; log entries are { tick, level, text }.
export async function runMatch({ a, b, seed, onProgress, signal }) {
  const state = createMatch(seed);
  const replay = newReplay(state, [a.name, b.name]);
  const logs = [[], []];
  const errors = [0, 0];
  const runners = [a, b].map((bot, p) =>
    createBotRunner({ source: bot.source, seed: (state.seed ^ Math.imul(p + 1, 0x5bf03635)) >>> 0 })
  );

  try {
    const loaded = await Promise.all(runners.map((r, p) => r.call('init', viewFor(state, p), INIT_LIMIT_MS)));
    forfeit(state, loaded.map((reply, p) => {
      logs[p].push(...(reply.logs || []));
      const reason = reply.fatal || (reply.error ? `crashed on load: ${reply.error.message}${where(reply.error)}` : null);
      if (reason) logs[p].push({ tick: 0, level: 'error', text: `Forfeit: ${reason}` });
      return reason;
    }));

    while (!state.result) {
      if (signal?.aborted) throw new DOMException('Match cancelled', 'AbortError');
      const replies = await Promise.all(runners.map((r, p) => r.call('tick', viewFor(state, p), TICK_LIMIT_MS)));
      const faults = replies.map((reply, p) => {
        logs[p].push(...(reply.logs || []));
        if (reply.error && ++errors[p] <= ERRORS_LOGGED) {
          logs[p].push({ tick: state.tick, level: 'error', text: `bot() threw: ${reply.error.message}${where(reply.error)}` });
        }
        if (reply.fatal) logs[p].push({ tick: state.tick, level: 'error', text: `Forfeit: ${reply.fatal}` });
        return reply.fatal || null;
      });
      if (faults[0] || faults[1]) {
        forfeit(state, faults);
        break;
      }
      recordTick(replay, step(state, replies[0].orders, replies[1].orders));
      if (onProgress && state.tick % 25 === 0) onProgress(state.tick, state.rules.maxTicks);
    }
  } finally {
    runners.forEach((r) => r.terminate());
  }

  for (const p of [0, 1]) {
    if (errors[p] > ERRORS_LOGGED) {
      logs[p].push({ tick: state.tick, level: 'warn', text: `bot() threw ${errors[p]} times in total; only the first ${ERRORS_LOGGED} are shown.` });
    }
  }
  replay.result = state.result;
  return { replay, logs };
}
