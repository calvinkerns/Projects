# ML workbench

Tools for making better bots and better default settings by having bots play
lots of games. Everything runs locally in Node on all CPU cores. The live
site does not use any of it.

`ml/private/` (your own bots, fetched community bots) and `ml/data/` (game
records) are git-ignored, so hidden bot code never ends up in the repo.

| Step | Command | What it does |
|---|---|---|
| 1 | `npm run ml:fetch` | Downloads the scoreboard bots into `ml/private/community/` to use as opponents. |
| 2 | `npm run ml:selfplay -- --games 500 --sizes 15,21,31 --ticks 400,800` | Plays random pairings and appends every game to `ml/data/games.jsonl` (seed + moves, so any tick can be rebuilt). |
| 3 | `npm run ml:features -- --every 10` | Turns games into `ml/data/features.csv`: one row per sampled tick with position stats and the final result as the label. |
| 4 | `npm run ml:tune -- ml/private/apex.js --gens 20` | Evolves the numbers on a bot's `const P = {...}` line against the opponent pool. Saves the best to `apex.tuned.json` after each generation (resumes from it). |
| 5 | `npm run ml:settings -- --seeds 10` | Round robin at each arena size × tick limit. Ranks settings by fairness (side bias), how much skill decides games, draws, timeouts and match length. |

## What's next

- **Win predictor:** train a model on `features.csv` (logistic regression or a
  small network; Python/scikit-learn works fine) to predict who wins from a
  position. A bot can then pick the move whose resulting position scores best.
  To use a trained model inside a bot, export its weights as a plain JS array,
  since bots can't import anything.
- **Richer inputs:** `featuresFor()` in `features.mjs` is hand-made stats.
  For a convolutional model, export the full owner/mass grids instead.
- **Tuning is noisy:** keep a mutant only after it wins again on fresh seeds.
  To be confident about a 5% improvement you need hundreds of games.
