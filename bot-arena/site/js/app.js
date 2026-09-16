// Surge app: editor, matches, tournament, and share links.

import { RULES, MIN_TICKS, MAX_TICKS } from './engine.js';
import { createViewer } from './viewer.js';
import { runMatch, TICK_LIMIT_MS } from './match.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

const viewer = createViewer($('viewer'), { autoplay: true });
const code = $('code');
const nameInput = $('bot-name');
let seedBots = [];
let challenger = null;
let currentReplay = null;
let running = null; // AbortController for the match or tournament in progress

// ------------------------------------------------------------------ docs

for (const node of document.querySelectorAll('[data-rule]')) node.textContent = String(RULES[node.dataset.rule]);
for (const node of document.querySelectorAll('[data-limit]')) node.textContent = String(TICK_LIMIT_MS);
$('docs-open').addEventListener('click', () => $('docs').showModal());
$('docs-close').addEventListener('click', () => $('docs').close());

// ------------------------------------------------------------------ editor

function updateGutter() {
  const lines = code.value.split('\n').length;
  let text = '';
  for (let i = 1; i <= lines; i++) text += `${i}\n`;
  $('gutter').textContent = text;
  $('gutter').scrollTop = code.scrollTop;
}

function setSource(source) {
  code.value = source;
  updateGutter();
  store.set('surge-lite.source', source);
}

let tabLeavesEditor = false;
code.addEventListener('focus', () => { tabLeavesEditor = false; });
code.addEventListener('input', () => { updateGutter(); store.set('surge-lite.source', code.value); });
code.addEventListener('scroll', () => { $('gutter').scrollTop = code.scrollTop; });
code.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { tabLeavesEditor = true; return; }
  if (e.key === 'Tab' && !e.shiftKey && !tabLeavesEditor) {
    e.preventDefault();
    code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
    code.dispatchEvent(new Event('input'));
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    fight();
  }
  if (e.key !== 'Tab') tabLeavesEditor = false;
});

nameInput.addEventListener('input', () => store.set('surge-lite.name', nameInput.value));
const botName = () => nameInput.value.trim().slice(0, 24) || 'My bot';
const arenaSize = () => Number($('size').value);
$('size').addEventListener('change', () => store.set('surge-lite.size', $('size').value));

const tickLimit = () => {
  const typed = Math.round(Number($('ticks').value));
  const clamped = Number.isFinite(typed) ? Math.min(MAX_TICKS, Math.max(MIN_TICKS, typed)) : RULES.maxTicks;
  $('ticks').value = String(clamped);
  return clamped;
};
$('ticks').addEventListener('change', () => store.set('surge-lite.ticks', String(tickLimit())));

$('template').addEventListener('change', () => {
  const select = $('template');
  const bot = seedBots.find((b) => b.id === select.value);
  select.value = '';
  if (!bot || code.value === bot.source) return;
  if (code.value.trim() && !confirm(`Replace your code with ${bot.name}?`)) return;
  setSource(bot.source);
});

// ------------------------------------------------------------------ status and console

function status(text, kind = '') {
  $('status').textContent = text;
  $('status').className = `status ${kind}`;
}

const consoleList = $('console');
const clearConsole = () => consoleList.replaceChildren();
$('clear-console').addEventListener('click', clearConsole);

function logLine({ tick, text, level = 'log' }) {
  if (consoleList.childElementCount >= 1000) return;
  const item = document.createElement('li');
  item.className = `log-${level}`;
  if (Number.isInteger(tick)) {
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'tick';
    jump.textContent = `t${tick}`;
    jump.title = `Jump to tick ${tick}`;
    jump.addEventListener('click', () => { viewer.pause(); viewer.seek(tick); });
    item.append(jump);
  }
  const message = document.createElement('span');
  message.textContent = text;
  item.append(message);
  consoleList.append(item);
  consoleList.scrollTop = consoleList.scrollHeight;
}

function showReplay(replay) {
  currentReplay = replay;
  viewer.load(replay);
}

// ------------------------------------------------------------------ matches

const opponents = () => (challenger ? [challenger, ...seedBots] : seedBots);

function fillOpponents(selectedId) {
  const select = $('opponent');
  select.replaceChildren();
  for (const bot of opponents()) {
    const option = document.createElement('option');
    option.value = bot.id;
    option.textContent = bot === challenger ? `⚔ ${bot.name} (challenge)` : bot.name;
    option.title = bot.blurb;
    select.append(option);
  }
  select.value = selectedId;
}

function setRunning(controller) {
  running = controller;
  $('fight').disabled = Boolean(controller);
  $('tourney').textContent = controller ? 'Cancel' : 'Tournament';
}

function describe(result, mySide, opponentName) {
  if (result.forfeit === mySide) return [`You forfeit: ${result.reason}.`, 'loss'];
  if (result.forfeit === 1 - mySide) return [`You win: ${opponentName} ${result.reason}.`, 'win'];
  if (result.winner === -1) return [`Draw: ${result.reason} at tick ${result.tick}.`, ''];
  return result.winner === mySide
    ? [`You win: ${result.reason} at tick ${result.tick}.`, 'win']
    : [`You lose: ${result.reason} at tick ${result.tick}.`, 'loss'];
}

async function fight() {
  if (running) return;
  const opponent = opponents().find((b) => b.id === $('opponent').value);
  if (!opponent) return;
  const controller = new AbortController();
  setRunning(controller);
  clearConsole();
  status(`Fighting ${opponent.name}…`);
  try {
    const { replay, logs } = await runMatch({
      a: { name: botName(), source: code.value },
      b: { name: opponent.name, source: opponent.source },
      seed: Number($('seed').value) >>> 0,
      rules: { size: arenaSize(), maxTicks: tickLimit() },
      signal: controller.signal,
      onProgress: (tick, max) => status(`Fighting ${opponent.name}… tick ${tick} / ${max}`),
    });
    logs[0].forEach(logLine);
    if (!logs[0].length) logLine({ text: 'No output. console.log() in your bot prints here.', level: 'info' });
    showReplay(replay);
    status(...describe(replay.result, 0, opponent.name));
  } catch (e) {
    if (e.name === 'AbortError') status('Cancelled.');
    else status(`Something went wrong: ${e.message}`, 'error');
  } finally {
    setRunning(null);
  }
}

$('fight').addEventListener('click', fight);
$('reseed').addEventListener('click', () => { $('seed').value = String(Math.floor(Math.random() * 1e6)); });

// ------------------------------------------------------------------ tournament

const TOURNAMENT_SEEDS = 4;

function cell(row, text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  row.append(td);
  return td;
}

async function tournament() {
  if (running) { running.abort(); return; }
  const controller = new AbortController();
  setRunning(controller);
  clearConsole();

  const me = { name: botName(), source: code.value };
  const field = opponents();
  const total = field.length * TOURNAMENT_SEEDS;
  const tally = { w: 0, l: 0, d: 0 };
  let done = 0;

  const box = $('results');
  box.hidden = false;
  box.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = `Tournament: ${me.name} vs every bot, ${TOURNAMENT_SEEDS} maps each, ${arenaSize()}×${arenaSize()}, ${tickLimit()} ticks`;
  const progress = document.createElement('div');
  progress.className = 'progress';
  const bar = document.createElement('div');
  progress.append(bar);
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const label of ['Opponent', 'W', 'L', 'D', 'Win %', '']) {
    const th = document.createElement('th');
    th.textContent = label;
    head.append(th);
  }
  table.append(head);
  box.append(heading, progress, table);

  const rows = field.map((opponent) => {
    const tr = document.createElement('tr');
    const row = { opponent, w: 0, l: 0, d: 0, loss: null, first: null };
    cell(tr, opponent.name);
    row.cells = [cell(tr, '0', 'num'), cell(tr, '0', 'num'), cell(tr, '0', 'num'), cell(tr, '–', 'num')];
    const watch = document.createElement('button');
    watch.type = 'button';
    watch.className = 'btn small';
    watch.textContent = 'Watch';
    watch.disabled = true;
    watch.addEventListener('click', () => showReplay(row.loss || row.first));
    cell(tr, '').append(watch);
    row.watch = watch;
    table.append(tr);
    return row;
  });

  try {
    for (const row of rows) {
      for (let k = 0; k < TOURNAMENT_SEEDS; k++) {
        if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const swap = k % 2 === 1;
        const them = { name: row.opponent.name, source: row.opponent.source };
        const { replay } = await runMatch({ a: swap ? them : me, b: swap ? me : them, seed: 1000 + k * 7919, rules: { size: arenaSize(), maxTicks: tickLimit() }, signal: controller.signal });
        const mySide = swap ? 1 : 0;
        const { winner } = replay.result;
        if (winner === -1) { row.d++; tally.d++; }
        else if (winner === mySide) { row.w++; tally.w++; }
        else { row.l++; tally.l++; row.loss ??= replay; }
        row.first ??= replay;
        done++;
        const played = row.w + row.l + row.d;
        row.cells[0].textContent = String(row.w);
        row.cells[1].textContent = String(row.l);
        row.cells[2].textContent = String(row.d);
        row.cells[3].textContent = `${Math.round((100 * (row.w + row.d / 2)) / played)}%`;
        row.watch.disabled = false;
        row.watch.textContent = row.loss ? 'Watch a loss' : 'Watch';
        bar.style.width = `${(100 * done) / total}%`;
        status(`Tournament: ${done} / ${total} matches…`);
      }
    }
    const kind = tally.w > tally.l ? 'win' : tally.w < tally.l ? 'loss' : '';
    status(`Tournament done: ${tally.w} wins, ${tally.l} losses, ${tally.d} draws.`, kind);
  } catch (e) {
    if (e.name === 'AbortError') status(`Tournament cancelled after ${done} matches.`);
    else status(`Something went wrong: ${e.message}`, 'error');
  } finally {
    setRunning(null);
  }
}

$('tourney').addEventListener('click', tournament);

// ------------------------------------------------------------------ share links

const toBase64Url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
};

async function pack(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return `p${toBase64Url(bytes)}`;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return `z${toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}

async function unpack(packed) {
  const bytes = fromBase64Url(packed.slice(1));
  if (packed[0] !== 'z') return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

async function copyLink(hash, what) {
  const url = `${location.origin}${location.pathname}#${hash}`;
  try {
    await navigator.clipboard.writeText(url);
    status(`${what} link copied to your clipboard.`);
  } catch {
    window.prompt(`Copy this ${what.toLowerCase()} link:`, url);
  }
}

$('share-bot').addEventListener('click', async () => {
  copyLink(`bot=${await pack(code.value)}&name=${encodeURIComponent(botName())}`, 'Challenge');
});
$('share-replay').addEventListener('click', async () => {
  if (currentReplay) copyLink(`replay=${await pack(JSON.stringify(currentReplay))}`, 'Replay');
});

// Returns true if the link opened a replay.
async function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  try {
    if (params.has('replay')) {
      const replay = JSON.parse(await unpack(params.get('replay')));
      if (!replay || !Array.isArray(replay.moves) || replay.moves.length > 5000) throw new Error('not a valid replay');
      showReplay(replay);
      status('Shared replay loaded.');
      return true;
    }
    if (params.has('bot')) {
      const source = await unpack(params.get('bot'));
      const name = (params.get('name') || '').trim().slice(0, 24) || 'Challenger';
      challenger = { id: '#challenge', name, source, blurb: 'Sent to you in a challenge link.' };
      const box = $('challenge');
      box.hidden = false;
      const label = document.createElement('span');
      label.textContent = `⚔ ${name} challenges you. They're in the opponent list, so hit Fight.`;
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'btn small';
      load.textContent = 'See their code';
      load.addEventListener('click', () => {
        if (code.value.trim() && !confirm(`Replace your code with ${name}'s bot?`)) return;
        setSource(source);
      });
      box.replaceChildren(label, load);
    }
  } catch (e) {
    status(`Couldn't open that link: ${e.message}`, 'error');
  }
  return false;
}

window.addEventListener('hashchange', () => location.reload());

// ------------------------------------------------------------------ start

async function start() {
  nameInput.value = store.get('surge-lite.name') || 'My bot';
  const savedSize = store.get('surge-lite.size');
  if ([...$('size').options].some((o) => o.value === savedSize)) $('size').value = savedSize;
  $('ticks').value = store.get('surge-lite.ticks') || String(RULES.maxTicks);
  tickLimit();
  $('seed').value = String(Math.floor(Math.random() * 1e6));
  const demo = fetch('replays/demo.json').then((r) => r.json());

  const list = await (await fetch('bots/index.json')).json();
  seedBots = await Promise.all(list.map(async (b) => ({
    id: b.file, name: b.name, blurb: b.blurb, source: await (await fetch(`bots/${b.file}`)).text(),
  })));
  for (const bot of seedBots) {
    const option = document.createElement('option');
    option.value = bot.id;
    option.textContent = bot.name;
    option.title = bot.blurb;
    $('template').append(option);
  }
  setSource(store.get('surge-lite.source') ?? seedBots.find((b) => b.id === 'starter.js')?.source ?? '');

  const openedReplay = await readHash();
  const defaultOpponent = seedBots.find((b) => b.id === 'grower.js') || seedBots[0];
  fillOpponents(challenger ? challenger.id : defaultOpponent.id);
  if (!openedReplay) showReplay(await demo);
}

start().catch((e) => status(`Failed to start: ${e.message}`, 'error'));

// Test hook for headless checks.
window.__surge = { viewer, runMatch, get replay() { return currentReplay; } };
