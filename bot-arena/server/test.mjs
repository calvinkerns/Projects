// Tests for the community API. Run with: node --no-warnings server/test.mjs

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { fakeD1 } from './fake-d1.mjs';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log(`FAIL: ${msg}`); } };

const SITE = 'https://calvinkerns.github.io';
const makeEnv = () => ({ DB: fakeD1(), ALLOWED_ORIGINS: `${SITE},http://localhost:8080`, ADMIN_TOKEN: 'secret-token' });
let env = makeEnv();
const call = (method, path, { body, origin = SITE, ip = '1.2.3.4', auth } = {}) => {
  const headers = { Origin: origin, 'CF-Connecting-IP': ip };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = auth;
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return worker.fetch(new Request(`https://api.test${path}`, { method, headers, body: payload }), env);
};
const bot = (name, extra = {}) => ({ name, author: 'tester', code: 's1:QUJD', ...extra });

// ---------------------------------------------------------------- basics

let res = await call('GET', '/bots');
check(res.status === 200 && (await res.json()).length === 0, 'empty list');
check(res.headers.get('Access-Control-Allow-Origin') === SITE, 'CORS allows the site');
res = await call('GET', '/bots', { origin: 'https://evil.example' });
check(!res.headers.get('Access-Control-Allow-Origin'), 'CORS refuses other sites');

res = await call('OPTIONS', '/bots');
check(res.status === 204 && res.headers.get('Access-Control-Allow-Methods') === 'GET, POST', 'preflight');

res = await call('POST', '/bots', { body: bot('Rocket') });
const rocket = await res.json();
check(res.status === 201 && typeof rocket.id === 'string' && rocket.rank === null, `submit without scoreboard results is unranked, got ${res.status}`);
let list = await (await call('GET', '/bots')).json();
check(list.length === 1 && list[0].name === 'Rocket' && list[0].code === 's1:QUJD' && list[0].rank === null, 'listed after submit');
check(Array.isArray(list[0].ladder) && list[0].ladder.length === 0, 'ladder is an empty list');
check(!('ip_hash' in list[0]) && !('ipHash' in list[0]), 'IP hash never leaves the server');

res = await call('POST', '/bots', { body: bot('rocket') });
check(res.status === 409, `duplicate name rejected, got ${res.status}`);

for (const [label, body, want] of [
  ['bad name', bot('<script>'), 400],
  ['empty name', bot(''), 400],
  ['long name', bot('x'.repeat(25)), 400],
  ['bad author', bot('Fine', { author: '<b>' }), 400],
  ['unscrambled code', bot('Fine', { code: 'function bot(){}' }), 400],
  ['huge code', bot('Fine', { code: `s1:${'A'.repeat(50000)}` }), 413],
  ['not json', 'nope', 400],
]) {
  res = await call('POST', '/bots', { body, ip: '9.9.9.9' });
  check(res.status === want, `${label}: expected ${want}, got ${res.status}`);
}

res = await call('POST', '/bots', { body: bot('Sneaky'), origin: 'https://evil.example' });
check(res.status === 403, `other origin refused, got ${res.status}`);

for (let i = 0; i < 4; i++) {
  res = await call('POST', '/bots', { body: bot(`Burst ${i}`) });
  check(res.status === 201, `submission ${i + 2} of 5 allowed, got ${res.status}`);
}
res = await call('POST', '/bots', { body: bot('Burst 5') });
check(res.status === 429, `sixth submission in an hour limited, got ${res.status}`);
res = await call('POST', '/bots', { body: bot('Other Person'), ip: '5.6.7.8' });
check(res.status === 201, 'a different address is not limited');

res = await call('DELETE', `/bots/${rocket.id}`);
check(res.status === 403, 'delete without token refused');
res = await call('DELETE', `/bots/${rocket.id}`, { auth: 'Bearer wrong' });
check(res.status === 403, 'delete with wrong token refused');
res = await call('DELETE', `/bots/${rocket.id}`, { auth: 'Bearer secret-token' });
check(res.status === 200, 'delete with token allowed');
list = await (await call('GET', '/bots')).json();
check(!list.some((b) => b.id === rocket.id), 'deleted bot is gone');

res = await call('GET', '/nope');
check(res.status === 404, 'unknown path is 404');

// ---------------------------------------------------------------- scoreboard

env = makeEnv();
let address = 0;
const submit = (name, placement) =>
  call('POST', '/bots', { body: bot(name, { placement }), ip: `10.0.${Math.floor(address / 200)}.${address++ % 200}` });
const board = async () => (await (await call('GET', '/bots')).json()).filter((b) => b.rank).sort((a, b) => a.rank - b.rank);
const names = async () => (await board()).map((b) => b.name).join(' ');
const seen = async () => (await board()).map((b) => b.id);
const game = (side, winner) => ({ seed: 7, side, winner, reason: 'core captured', tick: 99 });
// Won 6-0, and lost 1-5 with a draw, both stopping as soon as the result was certain.
const beat = (b) => ({ opponentId: b.id, opponentName: b.name, wins: 6, losses: 0, draws: 0, games: [0, 1, 0, 1, 0, 1].map((s) => game(s, s)) });
const lostTo = (b) => ({ opponentId: b.id, opponentName: b.name, wins: 1, losses: 4, draws: 1, games: [game(0, 0), game(1, 0), game(0, 1), game(1, 0), game(0, 1), game(1, -1)] });

res = await submit('Alpha', { seen: [], rank: 1, challenges: [] });
check(res.status === 201 && (await res.json()).rank === 1, 'first bot takes #1 on an empty board');

let top = await board();
res = await submit('Bravo', { seen: await seen(), rank: 1, challenges: [beat(top[0])] });
check(res.status === 201 && (await res.json()).rank === 1, 'beating #1 takes #1');
check((await names()) === 'Bravo Alpha', `everyone below moves down: ${await names()}`);

top = await board();
res = await submit('Charlie', { seen: await seen(), rank: 2, challenges: [lostTo(top[0]), beat(top[1])] });
check(res.status === 201, `losing to #1 then beating #2 is allowed, got ${res.status}`);
check((await names()) === 'Bravo Charlie Alpha', `takes #2: ${await names()}`);

res = await submit('Delta', { seen: top.map((b) => b.id), rank: 1, challenges: [beat(top[0])] });
check(res.status === 409 && (await res.json()).code === 'ladder_changed', 'results against an out-of-date board are refused');

top = await board();
res = await submit('Liar', { seen: await seen(), rank: 1, challenges: [lostTo(top[0])] });
check(res.status === 400, 'claiming #1 after losing to #1 is refused');
const fakeWin = { ...beat(top[0]), games: lostTo(top[0]).games };
res = await submit('Liar Two', { seen: await seen(), rank: 1, challenges: [fakeWin] });
check(res.status === 400, "a win count that doesn't match the games is refused");
const quitter = { ...lostTo(top[0]), losses: 2, draws: 0, games: [game(0, 0), game(1, 0), game(0, 1)] };
res = await submit('Quitter', { seen: await seen(), rank: 2, challenges: [quitter, beat(top[1])] });
check(res.status === 400, 'a challenge that stopped before it was decided is refused');
res = await submit('Skipper', { seen: await seen(), rank: 3, challenges: [beat(top[2])] });
check(res.status === 400, 'skipping bots higher up is refused');

top = await board();
res = await submit('Echo', { seen: await seen(), rank: 4, challenges: top.map(lostTo) });
check(res.status === 201 && (await res.json()).rank === 4, 'beating nobody takes the open spot at the bottom');

// Fill the board to 10, each new bot losing to everyone.
for (const n of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']) {
  top = await board();
  res = await submit(n, { seen: await seen(), rank: top.length + 1, challenges: top.map(lostTo) });
  check(res.status === 201, `${n} joins the bottom, got ${res.status}`);
}
top = await board();
check(top.length === 10 && top[9].name === 'F6', `board is full: ${await names()}`);

res = await submit('Late', { seen: await seen(), rank: 11, challenges: top.map(lostTo) });
check(res.status === 400, 'there is no #11');
res = await submit('Nobody', { seen: await seen(), rank: null, challenges: top.map(lostTo) });
check(res.status === 201 && (await res.json()).rank === null, 'beating nobody on a full board means no spot');

top = await board();
res = await submit('Champ', { seen: await seen(), rank: 1, challenges: [beat(top[0])] });
check(res.status === 201, 'beating #1 on a full board works');
top = await board();
check(top.length === 10 && top[0].name === 'Champ' && top[1].name === 'Bravo', `new #1 at the top: ${await names()}`);
check(!top.some((b) => b.name === 'F6'), 'the old #10 drops off the board');
check(top.map((b) => b.rank).join() === '1,2,3,4,5,6,7,8,9,10', 'ranks are 1 through 10 with no gaps');

const charlie = top.find((b) => b.name === 'Charlie');
check(charlie.ladder.length === 2 && charlie.ladder[1].opponentName === 'Alpha' && charlie.ladder[1].games.length === 6, 'challenge games are listed with the bot');

res = await call('DELETE', `/bots/${top[0].id}`, { auth: 'Bearer secret-token' });
top = await board();
check(res.status === 200 && top[0].name === 'Bravo' && top.map((b) => b.rank).join() === '1,2,3,4,5,6,7,8,9', 'deleting a ranked bot closes the gap');

// ---------------------------------------------------------------- upgrading an existing database

{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE bots (id TEXT PRIMARY KEY, name TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', code TEXT NOT NULL, created_at INTEGER NOT NULL, ip_hash TEXT NOT NULL);
           CREATE UNIQUE INDEX bots_name ON bots (name COLLATE NOCASE);`);
  db.prepare("INSERT INTO bots VALUES ('old', 'Sentinel', 'Calvv', 's1:QQ==', 1, 'h')").run();
  db.prepare("INSERT INTO bots VALUES ('newer', 'Later', '', 's1:QQ==', 2, 'h')").run();
  db.exec(readFileSync(new URL('./migrations/0002_scoreboard.sql', import.meta.url), 'utf8'));
  const rows = db.prepare('SELECT id, rank, ladder FROM bots ORDER BY created_at').all();
  check(rows[0].rank === 1 && rows[0].ladder === '[]', 'upgrade puts the oldest bot at #1');
  check(rows[1].rank === null && rows[1].ladder === '[]', 'upgrade leaves the other bots unranked');
}

console.log(failures ? `\n${failures} failure(s)` : 'all server tests passed');
process.exit(failures ? 1 : 0);
