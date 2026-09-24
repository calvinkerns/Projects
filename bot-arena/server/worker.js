// Surge community API: stores submitted bots and the top-10 scoreboard.
// Bots arrive minified/scrambled, and challenge results are checked before ranking.

const MAX_CODE_CHARS = 40000;
const MAX_LADDER_CHARS = 30000;
const MAX_LISTED = 100;
const PER_HOUR = 5;
const PER_DAY = 20;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,23}$/;

// Scoreboard rules, matching site/js/ladder.js.
const TOP = 10;
const GAMES = 10;
const WINS_NEEDED = 6;

// Close any gaps or ties in the ranks (newest first on a tie), so they run 1..n.
const RENUMBER = `UPDATE bots SET rank = (
    SELECT position FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY rank, created_at DESC) AS position FROM bots WHERE rank IS NOT NULL
    ) AS ordered WHERE ordered.id = bots.id
  ) WHERE rank IS NOT NULL`;

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

function parseLadder(text) {
  try {
    const value = JSON.parse(text || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function listBots(env, cors) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, author, code, created_at, rank, ladder FROM bots ORDER BY created_at DESC LIMIT ?'
  ).bind(MAX_LISTED).all();
  const bots = results.map((r) => ({
    id: r.id,
    name: r.name,
    author: r.author,
    code: r.code,
    createdAt: r.created_at,
    rank: r.rank ?? null,
    ladder: parseLadder(r.ladder),
  }));
  return json(bots, 200, cors);
}

async function submitBot(request, env, cors) {
  if (!cors['Access-Control-Allow-Origin']) return json({ error: 'submissions must come from the Surge site' }, 403, cors);
  const text = await request.text();
  if (text.length > MAX_CODE_CHARS + MAX_LADDER_CHARS + 2000) return json({ error: 'that bot is too big' }, 413, cors);
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
  if (!code.startsWith('s1:')) return json({ error: 'invalid bot code' }, 400, cors);
  if (code.length > MAX_CODE_CHARS) return json({ error: 'that bot is too big' }, 413, cors);

  // Rate limit by a salted hash of the address, so no raw IPs are stored.
  const now = Date.now();
  const ipHash = await sha256(`${env.IP_SALT || 'surge'}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  const recent = await env.DB.prepare(
    'SELECT SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS hour, COUNT(*) AS day FROM bots WHERE ip_hash = ? AND created_at > ?'
  ).bind(now - 3600000, ipHash, now - 86400000).first();
  if ((recent?.hour || 0) >= PER_HOUR || (recent?.day || 0) >= PER_DAY) {
    return json({ error: 'too many submissions from you recently; try again later' }, 429, cors);
  }

  // Scoreboard: the browser played the challenges; check the story adds up.
  let rank = null;
  let ladder = [];
  if (body.placement !== undefined) {
    const { results: rows } = await env.DB.prepare('SELECT id FROM bots WHERE rank IS NOT NULL ORDER BY rank').all();
    const ranked = rows.map((r) => r.id);
    const placement = body.placement;
    if (!placement || !Array.isArray(placement.seen) || placement.seen.join('|') !== ranked.join('|')) {
      return json({ error: 'the scoreboard changed while your bot was playing, so submit it again', code: 'ladder_changed' }, 409, cors);
    }
    const problem = checkPlacement(placement, ranked);
    if (problem) return json({ error: problem }, 400, cors);
    rank = placement.rank;
    ladder = placement.challenges.map((c) => ({
      opponentId: c.opponentId,
      opponentName: c.opponentName,
      wins: c.wins,
      losses: c.losses,
      draws: c.draws,
      games: c.games.map(({ seed, side, winner, reason, tick }) => ({ seed, side, winner, reason, tick })),
    }));
    if (JSON.stringify(ladder).length > MAX_LADDER_CHARS) return json({ error: 'scoreboard results are too big' }, 413, cors);
  }

  // Make room at its spot, add it, then tidy the ranks and cut the board to the top 10.
  const id = crypto.randomUUID();
  const statements = [];
  if (rank !== null) statements.push(env.DB.prepare('UPDATE bots SET rank = rank + 1 WHERE rank >= ?').bind(rank));
  statements.push(
    env.DB.prepare('INSERT INTO bots (id, name, author, code, created_at, ip_hash, rank, ladder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, author, code, now, ipHash, rank, JSON.stringify(ladder))
  );
  statements.push(env.DB.prepare(RENUMBER));
  statements.push(env.DB.prepare('UPDATE bots SET rank = NULL WHERE rank > ?').bind(TOP));
  try {
    await env.DB.batch(statements);
  } catch (e) {
    if (String(e?.message).includes('UNIQUE')) return json({ error: `a bot called "${name}" already exists` }, 409, cors);
    throw e;
  }
  const saved = await env.DB.prepare('SELECT rank FROM bots WHERE id = ?').bind(id).first();
  return json({ id, name, author, createdAt: now, rank: saved?.rank ?? null }, 201, cors);
}

const validGame = (g) =>
  Boolean(g) &&
  Number.isInteger(g.seed) && g.seed >= 0 && g.seed <= 0xffffffff &&
  (g.side === 0 || g.side === 1) &&
  (g.winner === -1 || g.winner === 0 || g.winner === 1) &&
  typeof g.reason === 'string' && g.reason.length <= 120 &&
  Number.isInteger(g.tick) && g.tick >= 0;

// The bot challenged #1, #2, ... in order and stopped at the first one it beat.
// Returns a problem description, or null if the results are consistent.
function checkPlacement({ rank, challenges }, ranked) {
  if (!Array.isArray(challenges)) return 'missing scoreboard results';
  const validRank = rank === null
    ? ranked.length >= TOP
    : Number.isInteger(rank) && rank >= 1 && rank <= Math.min(ranked.length + 1, TOP);
  if (!validRank) return 'invalid scoreboard spot';

  // Beating nobody means an open spot at the bottom, or no spot on a full board.
  const beatNobody = rank === null || rank === ranked.length + 1;
  if (challenges.length !== (beatNobody ? ranked.length : rank)) return "scoreboard results don't match the spot";

  for (const [i, c] of challenges.entries()) {
    if (!c || c.opponentId !== ranked[i] || typeof c.opponentName !== 'string' || c.opponentName.length > 24) {
      return 'invalid scoreboard results';
    }
    if (!Array.isArray(c.games) || c.games.length === 0 || c.games.length > GAMES || !c.games.every(validGame)) {
      return 'invalid game results';
    }
    const wins = c.games.filter((g) => g.winner === g.side).length;
    const draws = c.games.filter((g) => g.winner === -1).length;
    const losses = c.games.length - wins - draws;
    if (c.wins !== wins || c.losses !== losses || c.draws !== draws) return "game results don't add up";
    const decided = wins >= WINS_NEEDED || losses + draws > GAMES - WINS_NEEDED;
    if (!decided && c.games.length < GAMES) return 'a challenge stopped before it was decided';
    const beatIt = wins >= WINS_NEEDED;
    if (beatIt !== (!beatNobody && i === rank - 1)) return "game results don't match the spot";
  }
  return null;
}

async function deleteBot(id, request, env, cors) {
  if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: 'not allowed' }, 403, cors);
  }
  await env.DB.batch([env.DB.prepare('DELETE FROM bots WHERE id = ?').bind(id), env.DB.prepare(RENUMBER)]);
  return json({ deleted: id }, 200, cors);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
