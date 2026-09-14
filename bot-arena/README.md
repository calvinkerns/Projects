# Surge

A tiny bot arena that runs entirely in your browser. Write a JavaScript bot, fight the built-in bots, and watch the replay, including exactly what each bot could see through the fog of war.

## Run it

```
npm run serve     # then open http://localhost:8080
```

The site has no build step and no dependencies. It's plain HTML, CSS and ES modules, so it can be hosted anywhere static (GitHub Pages works).

## The game

- 21×21 board. Every tile belongs to you, your opponent, or nobody, and holds some mass.
- Each tick your bot returns up to 5 orders. An order pushes half (or all) the mass on one of your tiles into a neighbour.
- Orders cost energy: +1 per tick, bank up to 20. Spend as you go, or save up for a coordinated strike.
- Combat is subtraction. You capture a tile by bringing strictly more mass than is on it.
- Cores and owned wells grow every tick. Capture the enemy core to win, or hold the most tiles at tick 400.
- You only see tiles next to tiles you own.

## How it works

- **`site/js/engine.js`** is a deterministic, integer-only engine. Maps are 180° rotationally symmetric, and a test plays thousands of mirrored random orders to prove neither side has an edge.
- **`site/js/sandbox.js`** runs each bot in its own Web Worker. The bot's source is injected as text (no `eval`), network and storage APIs are removed, and time and randomness are made deterministic. The page's Content-Security-Policy is inherited by the worker, so even a bot that undoes all of that can't reach other hosts. Infinite loops are killed after 50 ms.
- **`site/js/viewer.js`** is the canvas replay viewer, with spectator and per-player fog views, energy meters, and a timeline marked with well captures and big energy surges.
- **Replays** are just the seed plus every executed order. Replaying re-runs the engine rather than the bots, so a replay is a few kilobytes and fits in a share link.

## Seed bots

`Idler`, `Drunkard`, `Sprawl`, `Starter`, `Prospector`, `Raider`. The top three form a loop: Raider beats Prospector, Prospector beats Starter, and Starter beats Raider.

## Dev tools

```
node tools/test.mjs                                   # engine invariants
node tools/tournament.mjs --seeds 20 site/bots/*.js   # round robin with ratings
node tools/run.mjs site/bots/raider.js site/bots/starter.js 42 --out replay.json
node tools/browser.mjs http://localhost:8080/ --shot .shots/page.png   # headless Chrome check
```
