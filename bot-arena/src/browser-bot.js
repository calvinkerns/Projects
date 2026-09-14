// Runs one bot inside its own Web Worker.
//
// The bot's source is placed directly into the worker script (no eval), after a
// one-line prelude that seeds Math.random, freezes the clock, removes network
// APIs, and answers engine requests. The page's Content-Security-Policy is
// inherited by the worker, which is the real network block; the prelude is
// just belt and braces.

import { botSeed, DEFAULT_CONFIG } from './engine.js';
import { playMatch } from './match.js';

function prelude(seed) {
  return [
    'var __surgePost=self.postMessage.bind(self),__surgeTick=0,__surgeLogs=0;',
    `(function(){var a=${seed >>> 0};Math.random=function(){a=(a+0x6d2b79f5)>>>0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};})();`,
    'Date.now=function(){return __surgeTick;};try{performance.now=function(){return __surgeTick;};}catch(e){}',
    "['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','Worker','SharedWorker','indexedDB','caches','BroadcastChannel','WebTransport'].forEach(function(k){try{self[k]=undefined;}catch(e){}});",
    "console.log=console.info=console.warn=console.error=console.debug=function(){if(__surgeLogs++>=200)return;var p=[];for(var i=0;i<arguments.length;i++){var x=arguments[i];if(typeof x==='string'){p.push(x);continue;}try{p.push(JSON.stringify(x));}catch(e){p.push(String(x));}}__surgePost({type:'log',text:p.join(' ')});};",
    "self.onmessage=function(e){var m=e.data;try{if(typeof bot!=='function')throw new Error('Your code must define a function named bot(state)');if(m.type==='init'){if(typeof init==='function')init(m.map);__surgePost({type:'result',id:m.id,value:null});}else{__surgeTick=m.state.tick;__surgePost({type:'result',id:m.id,value:bot(m.state)});}}catch(err){__surgePost({type:'error',id:m.id,message:String(err&&err.message||err)});}};",
  ].join('');
}

export function createBrowserBot(source, { seed = 0, turnMs = 100, initMs = 3000, onLog } = {}) {
  // The prelude is exactly one line, so bot line numbers are offset by 1.
  const url = URL.createObjectURL(new Blob([prelude(seed) + '\n' + source], { type: 'text/javascript' }));
  let worker = new Worker(url);
  let pending = null;
  let dead = null;
  let nextId = 1;

  function dispose() {
    if (!worker) return;
    worker.terminate();
    worker = null;
    URL.revokeObjectURL(url);
  }

  function settle(reply) {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { resolve } = pending;
    pending = null;
    resolve(reply);
  }

  function fail(message) {
    if (!dead) dead = message;
    settle({ ok: false, error: dead });
    dispose();
  }

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'log') return onLog?.(m.text);
    if (!pending || m.id !== pending.id) return;
    if (m.type === 'result') settle({ ok: true, value: m.value });
    else fail(m.message);
  };
  worker.onerror = (e) => {
    e.preventDefault();
    fail(e.lineno > 1 ? `${e.message} (line ${e.lineno - 1})` : e.message || 'bot crashed');
  };

  function call(type, payload, ms) {
    if (dead || !worker) return Promise.resolve({ ok: false, error: dead || 'bot was stopped' });
    return new Promise((resolve) => {
      const id = nextId++;
      pending = { id, resolve, timer: setTimeout(() => fail(`bot took longer than ${ms}ms`), ms) };
      worker.postMessage({ type, id, ...payload });
    });
  }

  return {
    init: (map) => call('init', { map }, initMs),
    turn: (view) => call('turn', { state: view }, turnMs),
    dispose,
  };
}

// Runs a full match in this browser. Resolves with the result including every
// frame, ready for the replay viewer.
export function runBrowserMatch({ seed, sources, cfg = DEFAULT_CONFIG, turnMs, onLog, onTick }) {
  const bots = [0, 1].map((p) =>
    createBrowserBot(sources[p], { seed: botSeed(seed, p), turnMs, onLog: onLog && ((t) => onLog(p, t)) }),
  );
  return playMatch({ seed, bots, cfg, frames: true, onTick });
}
