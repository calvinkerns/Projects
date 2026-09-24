// Tests for the community API. Run with: node --no-warnings server/test.mjs

import worker from './worker.js';
import { fakeD1 } from './fake-d1.mjs';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log(`FAIL: ${msg}`); } };

const SITE = 'https://calvinkerns.github.io';
const env = { DB: fakeD1(), ALLOWED_ORIGINS: `${SITE},http://localhost:8080`, ADMIN_TOKEN: 'secret-token' };
const call = (method, path, { body, origin = SITE, ip = '1.2.3.4', auth } = {}) => {
  const headers = { Origin: origin, 'CF-Connecting-IP': ip };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = auth;
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return worker.fetch(new Request(`https://api.test${path}`, { method, headers, body: payload }), env);
};
const bot = (name, extra = {}) => ({ name, author: 'tester', code: 's1:QUJD', ...extra });

// Listing starts empty and allows the site's origin.
let res = await call('GET', '/bots');
check(res.status === 200 && (await res.json()).length === 0, 'empty list');
check(res.headers.get('Access-Control-Allow-Origin') === SITE, 'CORS allows the site');
res = await call('GET', '/bots', { origin: 'https://evil.example' });
check(!res.headers.get('Access-Control-Allow-Origin'), 'CORS refuses other sites');

// Preflight.
res = await call('OPTIONS', '/bots');
check(res.status === 204 && res.headers.get('Access-Control-Allow-Methods') === 'GET, POST', 'preflight');

// A good submission is stored and listed, without the IP hash.
res = await call('POST', '/bots', { body: bot('Rocket') });
const saved = await res.json();
check(res.status === 201 && typeof saved.id === 'string', `submit returns 201 and an id, got ${res.status}`);
res = await call('GET', '/bots');
let list = await res.json();
check(list.length === 1 && list[0].name === 'Rocket' && list[0].author === 'tester' && list[0].code === 's1:QUJD', 'listed after submit');
check(!('ip_hash' in list[0]) && !('ipHash' in list[0]), 'IP hash never leaves the server');

// Names are unique regardless of case.
res = await call('POST', '/bots', { body: bot('rocket') });
check(res.status === 409, `duplicate name rejected, got ${res.status}`);

// Validation.
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

// Submissions from other sites are refused.
res = await call('POST', '/bots', { body: bot('Sneaky'), origin: 'https://evil.example' });
check(res.status === 403, `other origin refused, got ${res.status}`);

// Rate limit: five an hour per address (Rocket already counts as one).
for (let i = 0; i < 4; i++) {
  res = await call('POST', '/bots', { body: bot(`Burst ${i}`) });
  check(res.status === 201, `submission ${i + 2} of 5 allowed, got ${res.status}`);
}
res = await call('POST', '/bots', { body: bot('Burst 5') });
check(res.status === 429, `sixth submission in an hour limited, got ${res.status}`);
res = await call('POST', '/bots', { body: bot('Other Person'), ip: '5.6.7.8' });
check(res.status === 201, 'a different address is not limited');

// Deleting needs the admin token.
res = await call('DELETE', `/bots/${saved.id}`);
check(res.status === 403, 'delete without token refused');
res = await call('DELETE', `/bots/${saved.id}`, { auth: 'Bearer wrong' });
check(res.status === 403, 'delete with wrong token refused');
res = await call('DELETE', `/bots/${saved.id}`, { auth: 'Bearer secret-token' });
check(res.status === 200, 'delete with token allowed');
list = await (await call('GET', '/bots')).json();
check(!list.some((b) => b.id === saved.id), 'deleted bot is gone');

res = await call('GET', '/nope');
check(res.status === 404, 'unknown path is 404');

console.log(failures ? `\n${failures} failure(s)` : 'all server tests passed');
process.exit(failures ? 1 : 0);
