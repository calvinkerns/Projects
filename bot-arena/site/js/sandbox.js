// Runs one untrusted bot in its own Web Worker.
//
// The bot's source is pasted into the worker script as text (no eval), after a
// prelude that removes network and storage APIs, makes time and randomness
// deterministic, and defines the friendly game API. The page's
// Content-Security-Policy is inherited by the worker, so even a bot that undoes
// the prelude can't reach other hosts.

import { makeGame } from './botapi.js?v=ea5fcfd1';

const LOG_LINES_PER_TICK = 30;
const LOG_LINES_PER_MATCH = 500;
const LOG_LINE_CHARS = 300;

function prelude(seed) {
  return [
    '"use strict";',
    'const __post = self.postMessage.bind(self);',
    'let __tick = 0, __logs = [], __logTotal = 0;',
    'const __text = (v) => { if (typeof v === "string") return v; try { return JSON.stringify(v); } catch (e) { return String(v); } };',
    `const __log = (level) => (...args) => { if (__logs.length < ${LOG_LINES_PER_TICK} && __logTotal < ${LOG_LINES_PER_MATCH}) { __logTotal++; __logs.push({ tick: __tick, level, text: args.map(__text).join(" ").slice(0, ${LOG_LINE_CHARS}) }); } };`,
    'self.console = { log: __log("log"), info: __log("log"), debug: __log("log"), warn: __log("warn"), error: __log("error") };',
    `let __seed = ${seed >>> 0} || 1;`,
    'Math.random = () => { __seed ^= __seed << 13; __seed >>>= 0; __seed ^= __seed >>> 17; __seed ^= __seed << 5; __seed >>>= 0; return __seed / 4294967296; };',
    'Date.now = () => __tick;',
    'performance.now = () => __tick;',
    'for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "indexedDB", "caches", "BroadcastChannel"]) {',
    '  for (let o = self; o; o = Object.getPrototypeOf(o)) {',
    '    try { if (Object.prototype.hasOwnProperty.call(o, name)) Object.defineProperty(o, name, { value: undefined, writable: false, configurable: false }); } catch (e) {}',
    '  }',
    '}',
    `const __makeGame = ${makeGame.toString()};`,
    'const __bot = (function () {',
    '"use strict";',
  ].join('\n');
}

const EPILOGUE = [
  '',
  ';return typeof bot === "function" ? bot : null;',
  '})();',
  'self.onmessage = (event) => {',
  '  const view = event.data;',
  '  __tick = view.tick;',
  '  __logs = [];',
  '  if (!__bot) { __post({ fatal: "no bot(game) function defined", logs: [] }); return; }',
  '  let move = null, error = null;',
  '  try {',
  '    const result = __bot(__makeGame(view));',
  '    if (result && Number.isInteger(result.from) && Number.isInteger(result.dir)) move = { from: result.from, dir: result.dir };',
  '  } catch (e) {',
  '    error = { message: String(e && e.message !== undefined ? e.message : e), stack: String((e && e.stack) || "") };',
  '  }',
  '  __post({ move, logs: __logs, error });',
  '};',
].join('\n');

// Returns { tick(view, limitMs) -> Promise<reply>, terminate() }.
// A reply is { move, logs, error } or, when the bot is dead, { fatal, logs }.
export function createBotRunner({ source, seed }) {
  const head = prelude(seed);
  const offset = head.split('\n').length; // the user's line 1 is script line offset + 1
  const userLines = source.split('\n').length;
  const url = URL.createObjectURL(new Blob([`${head}\n${source}${EPILOGUE}`], { type: 'text/javascript' }));
  const worker = new Worker(url);
  let pending = null;
  let dead = null;

  const userLine = (scriptLine) => {
    const n = scriptLine - offset;
    return n >= 1 && n <= userLines ? n : null;
  };
  const lineFromStack = (stack) => {
    for (const m of stack.matchAll(/blob:[^\s)]*:(\d+):\d+/g)) {
      const n = userLine(Number(m[1]));
      if (n) return n;
    }
    return null;
  };
  const settle = (reply) => {
    if (!pending) return;
    const { resolve, timer } = pending;
    pending = null;
    clearTimeout(timer);
    resolve(reply);
  };
  const kill = (reason) => {
    if (dead) return;
    dead = reason;
    worker.terminate();
    URL.revokeObjectURL(url);
  };

  worker.onmessage = (event) => {
    const d = event.data || {};
    if (d.fatal) {
      const reason = `crashed on load: ${d.fatal}`;
      kill(reason);
      settle({ fatal: reason, logs: [] });
      return;
    }
    const error = d.error ? { message: String(d.error.message), line: lineFromStack(String(d.error.stack || '')) } : null;
    settle({ move: d.move ?? null, logs: Array.isArray(d.logs) ? d.logs : [], error });
  };
  worker.onerror = (event) => {
    event.preventDefault();
    const line = event.lineno ? userLine(event.lineno) : null;
    const reason = `crashed: ${event.message || 'script error'}${line ? ` (line ${line})` : ''}`;
    kill(reason);
    settle({ fatal: reason, logs: [] });
  };

  return {
    tick(view, limitMs) {
      return new Promise((resolve) => {
        if (dead) return resolve({ fatal: dead, logs: [] });
        const timer = setTimeout(() => {
          const reason = `timed out on tick ${view.tick}`;
          kill(reason);
          settle({ fatal: reason, logs: [] });
        }, limitMs);
        pending = { resolve, timer };
        worker.postMessage(view);
      });
    },
    terminate() {
      kill('terminated');
    },
  };
}
