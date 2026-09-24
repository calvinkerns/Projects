# Surge

A tiny bot arena that runs entirely in your browser. Write a JavaScript bot, fight the built-in bots on an arena from 15×15 to 31×31 with a tick limit you choose, and watch the replay.

## Run it

```
npm run serve     # then open http://localhost:8080
```

The site has no build step and no dependencies. It's plain HTML, CSS and ES modules, so any static host works (GitHub Pages included).

## The rules

1. Every tick, your bot makes one move: it sends all but 1 of the mass on one of your tiles to a neighbouring tile.
2. Moving onto a tile that isn't yours starts a fight. The bigger number wins and keeps the difference.
3. Your core grows by 1 every tick. Your other tiles grow by 1 every 10 ticks.
4. Take the enemy core to win. If nobody does before the tick limit, whoever owns the most tiles wins.

## A bot

```js
function bot(game) {
  // Take my biggest stack and march it at the enemy core.
  const biggest = game.myTiles.sort((a, b) => b.mass - a.mass)[0];
  return biggest.moveTo(biggest.stepToward(game.enemyCore));
}
```

Tiles come with helpers: `neighbors`, `moveTo`, `stepToward`, `distanceTo` and `closest`. The full reference is under "How to play" on the site.

## How it works

- **`site/js/engine.js`** is a deterministic, integer-only engine. Maps are 180° rotationally symmetric, and a test plays mirrored random moves to prove neither side has an edge.
- **`site/js/botapi.js`** turns the engine's plain board data into the friendly tile objects bots use.
- **`site/js/sandbox.js`** runs each bot in its own Web Worker. The bot's source is injected as text (no `eval`), network and storage APIs are removed, and the page's Content-Security-Policy is inherited by the worker, so even a bot that undoes all of that can't reach other hosts. Infinite loops are killed after 50 ms.
- **`site/js/viewer.js`** is the canvas replay viewer.
- **Replays** are just the seed plus every move. Replaying re-runs the engine rather than the bots, so a replay is a few kilobytes and fits in a share link.

## Community bots

Visitors can press **Submit to the arena** to share a bot with everyone. The site itself is static files, so submissions are stored by a small Cloudflare Worker (`server/`) with a D1 database, both on Cloudflare's free tier.

A submitted bot is minified in the submitter's browser (comments stripped, variables renamed) and scrambled before upload, so its code never appears on the page. It isn't encrypted: someone determined could recover the minified code from DevTools.

Until the API is deployed and `site/js/config.js` points at it, the community features stay hidden.

### The scoreboard

The site shows the top 10 community bots. When a bot is submitted, the submitter's browser has it challenge #1: up to 10 games on a 21×21 arena with an 800-tick limit, swapping sides each game. Winning 6 takes that spot and everyone below moves down one; otherwise it challenges #2, then #3, and so on. A challenge stops as soon as its result is certain. A bot that beats nobody takes the next open spot, or no spot on a full board.

Only each game's seed and result are stored. Games are deterministic, so "watch" re-plays them on the spot from both bots' code. The server checks that submitted results are consistent with the current board, but since the games run in the submitter's browser, a determined cheater could fake a placement; delete it if that happens.

### Deploying the API (once)

You need a free Cloudflare account. From `bot-arena/server`:

```
npx wrangler login                       # opens your browser to sign in
npx wrangler d1 create surge             # copy the database_id it prints into wrangler.toml
npx wrangler d1 execute surge --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN      # any long random string; lets you delete bots
npx wrangler secret put IP_SALT          # optional: any random string, hides IPs better
npx wrangler deploy                      # prints https://surge-api.<you>.workers.dev
```

Then from `bot-arena`, point the site at it and push:

```
node tools/set-api.mjs https://surge-api.<you>.workers.dev
```

### Upgrading an existing deployment

If the API was deployed before the scoreboard existed, add the scoreboard columns first, then deploy the new Worker. From `bot-arena/server`:

```
npx wrangler d1 execute surge --remote --file=migrations/0002_scoreboard.sql
npx wrangler deploy
```

The oldest existing bot starts at #1.

### Moderating

```
curl https://surge-api.<you>.workers.dev/bots                     # list bots and their ids
curl -X DELETE https://surge-api.<you>.workers.dev/bots/<id> \\
  -H "Authorization: Bearer <your ADMIN_TOKEN>"                   # delete one
```

One address can submit 5 bots an hour and 20 a day. Names must be unique, and a bot must pass a quick test match before it's uploaded.

## Publishing changes

After changing anything in `site/`, run `npm run stamp` before pushing. It gives every file the page loads a version in its address, so browsers never mix old cached files with new ones after an update. `npm test` fails if you forget.

## Dev tools

```
npm test                                                          # engine, API, and minify tests
npm run test:browser                                              # full site flow in headless Chrome, no server needed
node tools/tournament.mjs --seeds 20 --size 15 site/bots/*.js     # round robin with ratings
node tools/run.mjs site/bots/captain.js site/bots/rusher.js 42 --size 11 --out replay.json
node tools/browser.mjs http://localhost:8080/ --shot .shots/page.png   # headless Chrome check
```
