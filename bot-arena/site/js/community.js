// Community bots: bots other people submitted, loaded from the Surge API.
//
// A submitted bot is minified in the submitter's browser (comments stripped,
// variables renamed) and then scrambled, so its code never appears on the
// page as readable source. It isn't encrypted: someone determined could
// recover the minified code from DevTools. That's an accepted trade-off.

import { COMMUNITY_API } from './config.js';

export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,23}$/;

// Top-level names stay as they are, so bot() and helpers keep working.
export const MINIFY_OPTIONS = { compress: { passes: 2 }, mangle: true, format: { comments: false } };

const PREFIX = 's1:';
const KEY = [...'surge-arena'].map((c) => c.charCodeAt(0));

export const communityEnabled = () => Boolean(COMMUNITY_API);

function xor(bytes) {
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= KEY[i % KEY.length] ^ ((i * 131) & 0xff);
  return bytes;
}

export function scramble(code) {
  let binary = '';
  for (const b of xor(new TextEncoder().encode(code))) binary += String.fromCharCode(b);
  return PREFIX + btoa(binary);
}

export function unscramble(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) throw new Error('not a scrambled bot');
  const binary = atob(text.slice(PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(xor(bytes));
}

// The minifier is large, so it only loads when someone submits a bot.
let terser = null;
function loadMinifier() {
  terser ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/terser.min.js';
    script.onload = () => (globalThis.Terser ? resolve(globalThis.Terser) : reject(new Error('the minifier failed to load')));
    script.onerror = () => { terser = null; reject(new Error('the minifier failed to load')); };
    document.head.append(script);
  });
  return terser;
}

export async function minifyBot(source) {
  const { minify } = await loadMinifier();
  try {
    return (await minify(source, MINIFY_OPTIONS)).code;
  } catch (e) {
    throw new Error(`your code has a syntax error${e.line ? ` on line ${e.line}` : ""}: ${e.message}`);
  }
}

// Resolves to [{ id, name, author, blurb, source }], newest first. Bots that
// fail to unscramble are skipped rather than breaking the list.
export async function fetchCommunityBots() {
  const res = await fetch(`${COMMUNITY_API}/bots`);
  if (!res.ok) throw new Error(`the server said ${res.status}`);
  const bots = [];
  for (const b of await res.json()) {
    try {
      bots.push({ id: `community:${b.id}`, name: String(b.name), author: String(b.author || ''), blurb: 'Submitted by a visitor.', source: unscramble(b.code) });
    } catch { /* skip a damaged entry */ }
  }
  return bots;
}

export async function submitBot({ name, author, minified }) {
  const res = await fetch(`${COMMUNITY_API}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, author, code: scramble(minified) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `the server said ${res.status}`);
  return data;
}
