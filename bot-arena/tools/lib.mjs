// Node-side match runner. Bots run in-process here (no sandbox) — this is for
// development and balance testing only. The browser runs bots in Web Workers.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createMatch, step, viewFor, forfeit, rng32, newReplay, recordTick } from '../site/js/engine.js';

export function loadBot(path) {
  return { name: basename(path, '.js'), src: readFileSync(path, 'utf8') };
}

// Each call returns a fresh instance, so a bot's globals never leak between matches.
export function compileBot(src) {
  const factory = new Function(
    `"use strict";\n${src}\n;return { bot: typeof bot === "function" ? bot : null, init: typeof init === "function" ? init : null };`
  );
  const api = factory();
  if (!api.bot) throw new Error('no bot(state) function defined');
  return api;
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
    const faults = [null, null];
    for (const p of [0, 1]) {
      try {
        bots[p] = compileBot([a, b][p].src);
        bots[p].init?.(viewFor(state, p));
      } catch (e) {
        faults[p] = `crashed on load: ${e.message}`;
        lastError[p] = e;
      }
    }
    forfeit(state, faults);

    while (!state.result) {
      const orders = [[], []];
      const tickFaults = [null, null];
      for (const p of [0, 1]) {
        const view = viewFor(state, p);
        const t0 = performance.now();
        try {
          orders[p] = bots[p].bot(view);
        } catch (e) {
          errors[p]++;
          lastError[p] = e;
          orders[p] = [];
        }
        const dt = performance.now() - t0;
        cpu[p] += dt;
        if (dt > timeLimitMs) tickFaults[p] = 'timed out';
      }
      if (tickFaults[0] || tickFaults[1]) { forfeit(state, tickFaults); break; }
      recordTick(replay, step(state, orders[0], orders[1]));
    }
  } finally {
    Math.random = realRandom;
  }
  replay.result = state.result;
  return { replay, state, cpu, errors, lastError };
}

// Stable, spread-out seeds so tournaments are reproducible.
export const seedFor = (k) => (0x2545f491 + Math.imul(k + 1, 0x9e3779b9)) >>> 0;
