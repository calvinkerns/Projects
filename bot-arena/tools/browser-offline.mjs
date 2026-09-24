// End-to-end check of the site in headless Chrome, without running a web
// server: page requests are answered straight from site/ on disk, and /api/*
// from the real Worker code backed by an in-memory database.
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

// One bot already in the arena before the page loads.
const captain = await readFile(join(SITE, 'bots/captain.js'), 'utf8');
await api('POST', '/bots', { name: 'Test Captain', author: 'tester', code: scramble((await minify(captain, MINIFY_OPTIONS)).code) });

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const problems = [];
// Chrome logs every non-2xx response; the 409 from the duplicate-name test is expected.
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
await page.goto(`${ORIGIN}/`);
await sleep(2500);

// The community bot shows up as an opponent, and nowhere its code could be read.
const groups = await page.evaluate(() => [...document.querySelectorAll('#opponent optgroup')].map((g) => [g.label, [...g.children].map((o) => o.textContent)]));
check(groups.some(([label, opts]) => label === 'Community bots' && opts.includes('Test Captain (by tester)')), `community bot listed as an opponent: ${JSON.stringify(groups)}`);
const templates = await page.evaluate(() => [...document.querySelectorAll('#template option')].map((o) => o.value));
check(!templates.some((v) => v.startsWith('community:')), 'community bots are not offered as editor templates');
check(await page.evaluate(() => !document.getElementById('submit-bot').hidden && !document.getElementById('author').closest('label').hidden), 'submit button and author field are shown');

// Fight it: the scrambled, minified code has to run in the sandbox.
await page.evaluate(() => {
  const select = document.getElementById('opponent');
  select.value = [...select.options].find((o) => o.textContent.startsWith('Test Captain')).value;
  document.getElementById('size').value = '15';
  document.getElementById('ticks').value = '400';
  document.getElementById('fight').click();
});
await sleep(4000);
const fought = await page.evaluate(() => ({ status: document.getElementById('status').textContent, names: window.__surge.replay?.names }));
check(/^You (win|lose|forfeit)|^Draw/.test(fought.status) && fought.names?.[1] === 'Test Captain', `a match against the community bot finished: ${JSON.stringify(fought)}`);

// Submit: minify, test-run, confirm, upload.
await page.evaluate(() => {
  window.confirm = () => true;
  const name = document.getElementById('bot-name');
  name.value = 'Offline Tester';
  name.dispatchEvent(new Event('input'));
  document.getElementById('author').value = 'calvin';
  document.getElementById('submit-bot').click();
});
await sleep(5000);
const submitted = await page.evaluate(() => document.getElementById('status').textContent);
check(submitted.includes('is in the arena'), `submission succeeded: ${submitted}`);
const stored = env.DB.raw.prepare("SELECT code FROM bots WHERE name = 'Offline Tester'").get();
check(Boolean(stored), 'submission saved in the database');
check(stored && stored.code.startsWith('s1:') && !stored.code.includes('Starter bot') && !stored.code.includes('function bot'), 'what was stored is scrambled, not readable source');
const selected = await page.evaluate(() => document.getElementById('opponent').selectedOptions[0]?.textContent);
check(selected === 'Offline Tester (by calvin)', `new bot is selected as the opponent: ${selected}`);

// Submitting the same name again is refused by the server, and the page says so.
await page.evaluate(() => document.getElementById('submit-bot').click());
await sleep(5000);
const again = await page.evaluate(() => document.getElementById('status').textContent);
check(again.includes('already exists'), `duplicate name reported: ${again}`);

// A bot that crashes never gets submitted.
await page.evaluate(() => {
  document.getElementById('code').value = 'function bot(game) {\n  return [\n}';
  document.getElementById('bot-name').value = 'Broken Bot';
  document.getElementById('submit-bot').click();
});
await sleep(4000);
const broken = await page.evaluate(() => document.getElementById('status').textContent);
check(broken.includes('syntax error on line 3'), `broken bot refused with its line number: ${broken}`);
check(!env.DB.raw.prepare("SELECT 1 FROM bots WHERE name = 'Broken Bot'").get(), 'broken bot not stored');

check(problems.length === 0, `no page errors or CSP violations${problems.length ? `: ${problems.join(' | ')}` : ''}`);
if (shot) await page.screenshot({ path: shot });
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
