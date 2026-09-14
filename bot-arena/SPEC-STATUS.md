# Bot Arena — spec status (session 1)

Website where people write a small JS bot in-page; bots fight a deterministic 2D
game; ladder + replays. Novel bit: matches run in *visitors'* browsers, sandboxed.

Three drafting agents specced game / sandbox / backend independently, then a
critic adjudicated. Below is what survived. Full drafts were lost with the
scratchpad; the decisions are here.

## THE GAME — "Surge"

21x21 grid, every tile has owner + integer mass. Orders push mass to an adjacent
tile (`half` = mass>>1, `all` = everything). Combat is subtraction. Win by taking
the enemy Core or most tiles at tick 400.

Central mechanic: **orders cost energy** — +1/tick, cap 20, max 5 spent per tick.
Trickle steady expansion, or bank silently and unleash a wave. Enemy energy is
hidden, so inferring "they've been quiet 14 ticks, something's coming" is the
skill ceiling — and it's a deterministic accumulator, not a coin flip.

Simultaneous turns. 180-degree rotationally symmetric maps (exact material
fairness, no mirror-match degeneracy, no need to swap colors).

## DO THIS FIRST — the game may be broken

The critic's most important finding. Over 400 ticks you get ~400 orders total,
but mass compounds enormously (core income 400, territory pulses, wells). **Mass
massively outruns your ability to move it.** The per-tick cap of 5 also flattens
the burst the whole design is built around: banking 20 gives four ticks of 5,
not a wave. Predicted outcome — Turtlefist (bank + alpha-strike) dominates and
the ladder collapses to one strategy.

Also unspecified: the cost per order. A core constant nobody pinned down.

Testable in a weekend with a headless runner. **Do it before building anything
else** — if it's true, the fix is a game-rule change (order cost scaling with
mass moved, mass decay, or a per-order mass cap) and every other component is
scaffolding around a broken game.

Second test, ten lines: run each seed bot against a copy of itself across 200
seeds. P0 win rate must be 50% +/- noise. Catches index-order bias in
simultaneous resolution, which is the most likely silent bug in the engine.

## ENGINE — reversed from the sandbox spec

The sandbox agent recommended QuickJS-in-WASM. **The critic reversed it.** Use
native V8 with acorn AST gas injection instead:

- QuickJS is 20-50x slower, and the "V8 never warms up" argument is false — the
  bot function is called 400x/match in a persistent isolate, so it warms up fine.
- The QuickJS heap boundary costs ~1s/match in marshalling alone (1,323 typed
  array elements copied per tick, per bot).
- Honest yield is 2-8 matches per visit, not the 25 the backend spec budgeted.
- Engine parity: if the browser runs QuickJS, the Actions oracle must too, which
  pushes the nightly job to 5-12 hours and past the 6-hour limit.

Gas, not wall-clock timeouts — a wall-clock timeout leaks the visitor's CPU
class to the bot, which is the exact fingerprinting channel we're defending
against. Wall-clock stays only as a liveness backstop, and when it fires it
**discards the match rather than deciding it.**

Security still comes from the sandbox agent's best finding: blob worker inside a
null-origin `srcdoc` iframe with meta CSP `connect-src 'none'`. CSP is inherited
by nested workers, so realm escape restores deleted globals but *cannot* restore
network access — and the two project-ending threats (visitor-as-proxy,
visitor's-cookies-attack-your-API) are both network threats.

Week-one spike: verify blob-worker-in-opaque-origin-iframe works in Safari.
Historically inconsistent there.

## SUBMISSION IS A PULL REQUEST

Single highest-leverage cut. Bots live in a public repo; "Submit" opens a
prefilled PR; the in-page editor stays as the playground. This deletes OAuth,
moderation tooling, rate limits, content-addressed dedup, same-author pair
exclusion, and the Actions-ToS question all at once — the bots literally become
the repo's software and the nightly tournament is its test suite. Reads better
on a portfolio too.

## RANKING — one system, not two

Delete Glicko-2. Keep only the nightly Bradley-Terry MAP fit, gauge-fixed on the
anchor bots (BT is identified only up to an additive constant — nobody said
this), run in Actions, output committed as static JSON. Deletes the phi^2
sampler, RD tuning, placement mode, and the binary search in one stroke.

Note: "binary search places a bot in ~6 games" is false. A game is a Bernoulli
sample, not a deterministic comparator — it's 15-30 games. Reframe placement as
bucketing.

Five anchors, one set (the game spec and backend spec invented this twice):
Drunkard 1000 / Sprawl 1300 / Prospector 1500 / Turtlefist 1700 / Oracle 1900.
Keep Idler as a unit test, never an anchor — it loses 100% to everything, which
is infinite rating separation and informationally worthless. Set the pinned
values from a real round-robin, don't assert them a priori.

## REPLAYS — keep transcripts

The sandbox spec wanted seed+botIDs only (covert channel concern). The critic
sided with the game spec: the channel only exists if the sandbox already failed,
and a failed sandbox has `fetch`, which is far higher bandwidth. Transcripts are
~1-2KB compressed, fit in D1, survive a bot being hidden, and make replay
loading instant instead of 1-15s of re-execution.

Two conditions: fixed-width canonical encoding (the real covert channel is the
*encoding* — padding, field order — not the moves), and **the fold must validate
legality, not just apply** — a fabricated transcript replays perfectly otherwise.

## BACKEND — much smaller than specced

One Worker + D1. No Durable Object, no HMAC leases, no 25-job batching. That
protocol optimizes a scale you will not reach. Deferred until traffic exists.

Oracle = nightly Actions job: full round-robin over the top 20 (190 pairs x 10
seeds, ~15 min on a 4-core runner) plus a 5% audit of crowd results. Published
ladder is oracle-only. This was the backend agent's best idea and it's near-free.

Keep from the cost analysis: D1 bills rows *scanned*, not returned, so an
unindexed leaderboard query is the first wall — 5,000 bots x 2,000 views/day =
10M rows read against a 5M/day limit at trivial traffic.

## THE PREMISE — change the claim, keep the architecture

The uncomfortable finding. A portfolio site sees 5-50 visitors/day steady state.
At 2-8 matches per visit that's ~80 matches/day from the entire crowd. One
Actions job produces ~216,000 matches in a 6-hour window. **The crowd
contributes roughly 0.04% of the compute.**

So do NOT pitch this as "near-zero cost because strangers pay for compute." That
claim is false by three orders of magnitude and a sharp reader will do this
arithmetic in an interview.

Pitch instead: **"matches are computed in visitors' browsers, verified nightly by
a trusted oracle in CI."** True, still architecturally interesting, honest about
the trust model, and more impressive because it shows you solved verification
rather than hand-waving it.

The two things the crowd genuinely provides that Actions cannot: **latency**
(someone who just submitted wants placement now, not at 3am) and **spectacle**
("your browser is playing this match right now" is what people screenshot).
Real division of labor: crowd = low-latency triage, Actions = authoritative
ladder.

Bootstrap is NOT fatal — run the round-robin in Actions before launch and the
site opens with a populated ladder and zero visitors. The scarce resource is
**bots, not compute**.

## SCOPE

Maximalist sum of all three specs: 450-700 hours = 12-18 months part-time, with
the realistic failure mode being abandonment at month five with a half-built
scheduler and no playable game.

MVP target: **100-150 hours, ~10-12 weeks.**

- Weeks 1-3: engine + headless runner, then two full weeks doing nothing but
  playing bots and fixing the balance problem above.
- Keep: sandbox (blob worker + CSP + AST gas), replay viewer with all three fog
  modes (~8h, renders a mask over visibility the engine already computes — this
  is the thing that sells the project, do not cut it), the in-page editor and
  local test loop (30-50h, UNSPECCED BY ANYONE, mandatory — without it nobody
  can write a bot), disclosure UI (~8h, ethical core, non-negotiable).
- Cut forever: Merkle proof-of-execution — but **write it up on the site**. The
  analysis (elegant, and fatally flawed because advancing one turn requires
  executing the player's arbitrary JS) impresses a reader more than a built
  feature would. Four hours to write, eighty to build.

## OPEN ITEMS

- Order cost per order — never specified, and the balance math depends on it.
- Draw handling — unspecified everywhere. Symmetric maps + deterministic play
  means near-mirror bots draw constantly. Plain BT needs a Davidson-style tie
  extension.
- Async bots — what if `bot(state)` returns a Promise? Specify synchronous only.
- Determinism guard gaps: `new Date()`, `Intl.DateTimeFormat().resolvedOptions()`
  (leaks timezone), `Math.sin/cos/pow` (implementation-defined across engines).
- ReDoS and unbounded builtins (`Array(1e9).fill()`, `"x".repeat(1e9)`) bypass
  statement-counting gas.
- Typed-array views: if the bot retains a reference across ticks and you reuse
  the buffer, it sees current state including fogged tiles. Fresh alloc per tick.
- `new Function` (game spec) is blocked by the CSP (sandbox spec). Fix: inject
  bot source as text into the worker's own script body, no dynamic eval.
- Unverified claim: "Cloudflare began enforcing D1 row limits 1 Sep 2026" is
  past the drafting agent's cutoff. Check before relying on it.
