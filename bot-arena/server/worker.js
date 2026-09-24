// Surge community API: stores bots people submit and lists them for everyone.
//
// Bots arrive already minified and scrambled by the submitter's browser, so
// this never handles readable source. Anyone can submit within the rate
// limits; the owner can delete a bot with the admin token.

const MAX_CODE_CHARS = 40000;
const MAX_LISTED = 100;
const PER_HOUR = 5;
const PER_DAY = 20;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,23}$/;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const { pathname } = new URL(request.url);
      if (pathname === '/bots' && request.method === 'GET') return await listBots(env, cors);
      if (pathname === '/bots' && request.method === 'POST') return await submitBot(request, env, cors);
      const one = pathname.match(/^\/bots\/([\w-]+)$/);
      if (one && request.method === 'DELETE') return await deleteBot(one[1], request, env, cors);
      return json({ error: 'not found' }, 404, cors);
    } catch {
      return json({ error: 'server error' }, 500, cors);
    }
  },
};

// Only the Surge site itself may call this from a browser.
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function listBots(env, cors) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, author, code, created_at FROM bots ORDER BY created_at DESC LIMIT ?'
  ).bind(MAX_LISTED).all();
  const bots = results.map((r) => ({ id: r.id, name: r.name, author: r.author, code: r.code, createdAt: r.created_at }));
  return json(bots, 200, cors);
}

async function submitBot(request, env, cors) {
  if (!cors['Access-Control-Allow-Origin']) return json({ error: 'submissions must come from the Surge site' }, 403, cors);
  const text = await request.text();
  if (text.length > MAX_CODE_CHARS + 1000) return json({ error: 'that bot is too big' }, 413, cors);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid request' }, 400, cors);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const code = typeof body.code === 'string' ? body.code : '';
  if (!NAME.test(name)) return json({ error: 'bot names are 1-24 letters, numbers, spaces, dots, dashes or underscores' }, 400, cors);
  if (author && !NAME.test(author)) return json({ error: 'your name can use letters, numbers, spaces, dots, dashes or underscores' }, 400, cors);
  if (!code.startsWith('s1:') || code.length > MAX_CODE_CHARS) return json({ error: 'invalid bot code' }, 400, cors);

  // Rate limit by a salted hash of the address, so no raw IPs are stored.
  const now = Date.now();
  const ipHash = await sha256(`${env.IP_SALT || 'surge'}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  const recent = await env.DB.prepare(
    'SELECT SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS hour, COUNT(*) AS day FROM bots WHERE ip_hash = ? AND created_at > ?'
  ).bind(now - 3600000, ipHash, now - 86400000).first();
  if ((recent?.hour || 0) >= PER_HOUR || (recent?.day || 0) >= PER_DAY) {
    return json({ error: 'too many submissions from you recently; try again later' }, 429, cors);
  }

  const id = crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO bots (id, name, author, code, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, name, author, code, now, ipHash).run();
  } catch (e) {
    if (String(e?.message).includes('UNIQUE')) return json({ error: `a bot called "${name}" already exists` }, 409, cors);
    throw e;
  }
  return json({ id, name, author, createdAt: now }, 201, cors);
}

async function deleteBot(id, request, env, cors) {
  if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: 'not allowed' }, 403, cors);
  }
  await env.DB.prepare('DELETE FROM bots WHERE id = ?').bind(id).run();
  return json({ deleted: id }, 200, cors);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
