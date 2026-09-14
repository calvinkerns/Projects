// Node-side match runner. Bots run in-process here (no sandbox): this is for
// development and balance testing only. The browser runs bots in Web Workers.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createMatch, step, viewFor, forfeit, rng32, newReplay, recordTick } from '../site/js/engine.js';
import { makeGame } from '../site/js/botapi.js';

export function loadBot(path) {
  return { name: basename(path, '.js'), src: readFileSync(path, 'utf8') };
}

// Each call returns a fresh instance, so a bot's variables never leak between matches.
export function compileBot(src) {
  const bot = new Function(`"use strict";\n${src}\n;return typeof bot === "function" ? bot : null;`)();
  if (!bot) throw new Error('no bot(game) function defined');
  return bot;
}

export function playMatch(a, b, seed, { rules, timeLimitMs = Infinity } = {}) {
  const state = createMatch(seed, rules);
  const replay = newReplay(state, [a.name, b.name]);
  const cpu = [0, 0];
  const errors = [0, 0];
  const lastError = [null, null];

  const realRandom = Math.random;
  const rand = rng32(state.seed ^ 0x5bf03635);
  Math.random = () => rand() / 4294967296;
  try {
    const bots = [null, null];
    forfeit(state, [a, b].map((bot, p) => {
      try { bots[p] = compileBot(bot.src); return null; }
      catch (e) { lastError[p] = e; return `crashed on load: ${e.message}`; }
    }));

    while (!state.result) {
      const moves = [null, null];
      const faults = [null, null];
      for (const p of [0, 1]) {
        const t0 = performance.now();
        try {
          moves[p] = bots[p](makeGame(viewFor(state, p)));
        } catch (e) {
          errors[p]++;
          lastError[p] = e;
        }
        const dt = performance.now() - t0;
        cpu[p] += dt;
        if (dt > timeLimitMs) faults[p] = `timed out on tick ${state.tick}`;
      }
      if (faults[0] || faults[1]) { forfeit(state, faults); break; }
      recordTick(replay, step(state, moves[0], moves[1]));
    }
  } finally {
    Math.random = realRandom;
  }
  replay.result = state.result;
  return { replay, state, cpu, errors, lastError };
}

// Stable, spread-out seeds so tournaments are reproducible.
export const seedFor = (k) => (0x2545f491 + Math.imul(k + 1, 0x9e3779b9)) >>> 0;
