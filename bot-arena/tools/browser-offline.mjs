// End-to-end test in headless Chrome. Serves site/ from disk and /api/* from
// the Worker with an in-memory database.
//   node --no-warnings tools/browser-offline.mjs [--shot .shots/community.png]

import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';
import worker from '../server/worker.js';
import { fakeD1 } from '../server/fake-d1.mjs';
import { MINIFY_OPTIONS, scramble } from '../site/js/community.js';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const ORIGIN = 'http://surge.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const env = { DB: fakeD1(), ALLOWED_ORIGINS: ORIGIN, ADMIN_TOKEN: 'test' };
const args = process.argv.slice(2);
const shot = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;

let failures = 0;
const check = (ok, msg) => { if (ok) console.log(`ok   ${msg}`); else { failures++; console.log(`FAIL ${msg}`); } };
const api = (method, path, body) => worker.fetch(new Request(`https://api.test${path}`, {
  method,
  headers: { Origin: ORIGIN, 'CF-Connecting-IP': '10.0.0.1', 'Content-Type': 'application/json' },
  body: body && JSON.stringify(body),
}), env);

// Captain is already #1 on the scoreboard before the page loads.
const captain = await readFile(join(SITE, 'bots/captain.js'), 'utf8');
await api('POST', '/bots', {
  name: 'Test Captain',
  author: 'tester',
  code: scramble((await minify(captain, MINIFY_OPTIONS)).code),
  placement: { seen: [], rank: 1, challenges: [] },
});

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1400 });
const problems = [];
// Chrome logs every non-2xx response; a 409 from a duplicate-name test is expected.
const expected = (text) => text.includes('favicon') || text.includes('status of 409');
page.on('console', (m) => { if (m.type() === 'error' && !expected(m.text())) problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(e.message));
await page.setRequestInterception(true);
page.on('request', async (req) => {
  const url = new URL(req.url());
  if (url.origin !== ORIGIN) return req.abort();
  if (url.pathname.startsWith('/api/')) {
    const res = await worker.fetch(new Request(`https://api.test${url.pathname.slice(4)}`, {
      method: req.method(),
      headers: { Origin: ORIGIN, 'CF-Connecting-IP': '10.0.0.2', 'Content-Type': 'application/json' },
      body: req.postData(),
    }), env);
    return req.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  }
  if (url.pathname === '/js/config.js') {
    return req.respond({ status: 200, contentType: 'text/javascript', body: `export const COMMUNITY_API = '${ORIGIN}/api';` });
  }
  const file = normalize(join(SITE, url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname));
  try {
    req.respond({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: await readFile(file) });
  } catch {
    req.respond({ status: 404, body: 'not found' });
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const statusText = () => page.evaluate(() => document.getElementById('status').textContent);
// Wait until the status line matches, instead of guessing how long things take.
const waitForStatus = async (pattern, ms = 90000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const text = await statusText();
    if (pattern.test(text)) return text;
    await sleep(250);
  }
  return `(timed out) ${await statusText()}`;
};
// Open the scoreboard the way a visitor would, then read its rows.
const scoreboardRows = async () => {
  await page.evaluate(() => { if (!document.getElementById('scoreboard-dialog').open) document.getElementById('scoreboard-open').click(); });
  await sleep(800);
  return page.evaluate(() => [...document.querySelectorAll('#scoreboard li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()));
};

await page.goto(`${ORIGIN}/`);
await sleep(2500);

// The header has a Scoreboard button, and practice runs are clearly labelled.
const labels = await page.evaluate(() => ({ scoreboard: !document.getElementById('scoreboard-open').hidden && document.getElementById('scoreboard-open').textContent, practice: document.getElementById('tourney').textContent }));
check(labels.scoreboard === 'Scoreboard' && labels.practice === 'Practice vs all', `header shows a Scoreboard button and practice is labelled: ${JSON.stringify(labels)}`);

// The scoreboard and the community opponent show up; the code shows up nowhere.
let rows = await scoreboardRows();
check(rows.length === 1 && rows[0].includes('#1') && rows[0].includes('Test Captain'), `scoreboard lists the #1 bot: ${JSON.stringify(rows)}`);
await page.evaluate(() => document.getElementById('scoreboard-close').click());
const groups = await page.evaluate(() => [...document.querySelectorAll('#opponent optgroup')].map((g) => [g.label, [...g.children].map((o) => o.textContent)]));
check(groups.some(([label, opts]) => label === 'Community bots' && opts.includes('#1 Test Captain (by tester)')), `community bot listed as an opponent with its rank: ${JSON.stringify(groups)}`);
const templates = await page.evaluate(() => [...document.querySelectorAll('#template option')].map((o) => o.value));
check(!templates.some((v) => v.startsWith('community:')), 'community bots are not offered as editor templates');

// The directions dialog opens and has the rules filled in.
const help = await page.evaluate(() => {
  document.getElementById('scoreboard-help').click();
  const dialog = document.getElementById('scoreboard-help-dialog');
  const text = dialog.innerText;
  document.getElementById('scoreboard-help-close').click();
  return { opened: text.length > 0, text };
});
check(help.text.includes('up to 10 games') && help.text.includes('Winning 6 or more') && help.text.includes('21×21'), 'directions explain the rules with the real numbers');

// Submit: minify, test-run, confirm, challenge #1, upload.
await page.evaluate(() => {
  window.confirm = () => true;
  const name = document.getElementById('bot-name');
  name.value = 'Offline Tester';
  name.dispatchEvent(new Event('input'));
  document.getElementById('author').value = 'calvin';
  document.getElementById('submit-bot').click();
});
const sawProgress = await waitForStatus(/Challenging #1 Test Captain/, 30000);
check(sawProgress.startsWith('Challenging #1 Test Captain'), `challenge progress is shown: ${sawProgress}`);
const submitted = await waitForStatus(/entered the scoreboard|didn't make|Couldn't submit/);
check(/entered the scoreboard at #[12]!/.test(submitted), `submission climbed the ladder: ${submitted}`);

const stored = env.DB.raw.prepare("SELECT code, rank, ladder FROM bots WHERE name = 'Offline Tester'").get();
check(Boolean(stored) && stored.code.startsWith('s1:') && !stored.code.includes('function bot'), 'stored code is scrambled, not readable source');
const ladder = JSON.parse(stored?.ladder || '[]');
const challenge = ladder[0];
// A challenge ends at 6 wins or 5 non-wins, so it lasts between 5 and 10 games.
check(ladder.length === 1 && challenge.opponentName === 'Test Captain' && challenge.games.length >= 5 && challenge.games.length <= 10, `played one challenge of 5-10 games against #1: ${challenge && challenge.games.length} games`);
check(challenge.games.some((g) => g.side === 0) && challenge.games.some((g) => g.side === 1), 'sides were swapped between games');

rows = await scoreboardRows();
check(rows.length === 2 && rows.some((r) => r.includes('Offline Tester')), `scoreboard now has both bots: ${JSON.stringify(rows)}`);

// Watch one of its challenge games.
await page.evaluate(() => {
  const row = [...document.querySelectorAll('#scoreboard li')].find((li) => li.innerText.includes('Offline Tester'));
  row.querySelector('button').click();
});
const gameButtons = await page.evaluate(() => [...document.querySelectorAll('#scoreboard-games .challenge-row button')].map((b) => b.textContent));
check(gameButtons.length === challenge.games.length, `a watch button for each game: ${JSON.stringify(gameButtons)}`);
await page.evaluate(() => document.querySelector('#scoreboard-games .challenge-row button').click());
const watching = await waitForStatus(/Watching|Couldn't replay/);
const watchedNames = await page.evaluate(() => window.__surge.replay?.names);
check(!(await page.evaluate(() => document.getElementById('scoreboard-dialog').open)), 'the scoreboard closes so the game can be watched');
check(watching.startsWith('Watching Offline Tester vs Test Captain') && watchedNames.includes('Offline Tester') && watchedNames.includes('Test Captain'), `game replays in the viewer: ${watching}`);
check(!watching.includes('finished differently'), 'the replay finished the same way as the recorded game');
const firstGame = challenge.games[0];
const replayedWinner = await page.evaluate(() => window.__surge.replay.result.winner);
check(replayedWinner === firstGame.winner, `replayed winner matches the record (${replayedWinner} vs ${firstGame.winner})`);

// Duplicate names are caught before any games are played.
await page.evaluate(() => document.getElementById('submit-bot').click());
const again = await waitForStatus(/already in the arena|Couldn't submit/, 10000);
check(again.includes('already in the arena'), `duplicate name caught up front: ${again}`);

// A bot with a syntax error never gets submitted.
await page.evaluate(() => {
  document.getElementById('code').value = 'function bot(game) {\n  return [\n}';
  document.getElementById('bot-name').value = 'Broken Bot';
  document.getElementById('submit-bot').click();
});
const broken = await waitForStatus(/Couldn't submit/, 20000);
check(broken.includes('syntax error on line 3'), `broken bot refused with its line number: ${broken}`);
check(!env.DB.raw.prepare("SELECT 1 FROM bots WHERE name = 'Broken Bot'").get(), 'broken bot not stored');

check(problems.length === 0, `no page errors or CSP violations${problems.length ? `: ${problems.join(' | ')}` : ''}`);
if (shot) {
  await scoreboardRows();
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#scoreboard li')].find((li) => li.innerText.includes('Offline Tester'));
    row.querySelector('button').click();
  });
  await page.screenshot({ path: shot, fullPage: true });
}
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
