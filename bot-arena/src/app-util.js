// Small helpers shared by the app modules. Everything that shows bot-provided
// text (names, descriptions, logs, errors) goes through textContent, never HTML.

export const PLAYER_NAMES = ['Blue', 'Orange'];

// h('div', { class: 'x', onclick: fn }, 'text', childNode, ...)
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % 1000000;
}

export function normalizeSeed(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n >>> 0 : 0;
}

// Line 1 of every bot is "// Name — description".
export function parseHeader(source, fallbackName = 'Bot') {
  const first = String(source).split('\n', 1)[0];
  const m = /^\s*\/\/\s*(.+?)\s+(?:—|–|-{1,2})\s+(.+?)\s*$/.exec(first);
  if (m) return { name: m[1], description: m[2] };
  const bare = /^\s*\/\/\s*(.+?)\s*$/.exec(first);
  return { name: bare ? bare[1] : fallbackName, description: '' };
}

const sourceCache = new Map();

export function fetchBotSource(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return Promise.reject(new Error(`bad bot id "${id}"`));
  if (!sourceCache.has(id)) {
    const p = fetch(`bots/${id}.js`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`couldn't load bots/${id}.js (HTTP ${r.status})`);
      return r.text();
    });
    p.catch(() => sourceCache.delete(id));
    sourceCache.set(id, p);
  }
  return sourceCache.get(id);
}

let ladderPromise = null;

// Resolves to the ladder object, or null when data/ladder.json isn't there yet.
export function loadLadder() {
  if (!ladderPromise) {
    ladderPromise = fetch('data/ladder.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((l) => (l && Array.isArray(l.bots) ? l : null))
      .catch(() => null);
  }
  return ladderPromise;
}

const REASONS = {
  core: 'took the enemy core',
  tiles: 'held more tiles at the time limit',
  mass: 'tied on tiles, won on total mass',
  fault: 'opponent forfeited',
  draw: 'draw',
};

export function reasonText(reason) {
  return REASONS[reason] || String(reason);
}

// "Blue wins by core on tick 212" / "Draw on tick 400"
export function outcomeText({ winner, reason, ticks }, names = PLAYER_NAMES) {
  if (winner === null || winner === undefined) {
    return reason === 'draw' || !reason ? `Draw on tick ${ticks}` : `Draw (${reason}) on tick ${ticks}`;
  }
  return `${names[winner]} wins by ${reason} on tick ${ticks}`;
}

export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
