# Balance harness (v2)

The balance harness (`src/sim/harness/`, CLIs `tools/balance.ts` and `tools/genStandInPool.ts`) builds populations
of random legal, honestly priced decks per hero and day, plays them against each other headless, and reports
win rates, the star bench and the stand-in pool. This page covers how to run it and what harness v2 part 2
(0.6.1b turret cores, 0.6.1p star perks) added.

## Commands

    npm run balance   -- [--days 1,3,5,7,10] [--pop 40] [--gauntlet 20] [--elites 8] [--seeds 2] [--seed 1]
                         [--stars on|off] [--cores on|off] [--workers N] [--out dir]
    npm run balance   -- --compare a/balance-v2.json b/balance-v2.json
    npm run balance   -- --before-after before1.json[,before2.json..] after1.json[,after2.json..] [--out-md file]
    npm run standins  -- [--stars on|off] [--cores on|off] [--workers N] [--out dir] [--check | --versus] [--dump pop.json]

- `balance` writes `<out>/balance-v2.md` and `<out>/balance-v2.json`. Results are keyed by job, so the output is
  the same for any `--workers` value. One day per command is fine (`--days 5`); the days tables of separate
  runs can be read side by side.
- `--compare` runs nothing: it compares the `days` tables of two balance JSON files (`days identical: true|false`)
  and exits 1 if they differ.
- `--before-after` runs nothing: it prints (or writes with `--out-md`) the six perk modules' star rows of the first
  run(s) beside the second's, matched by day, def and star (see BEFORE/AFTER below).
- `standins` with `--stars off` is harness v1 exactly and regenerates `src/sim/standInPoolData.ts` (the shipped
  pool); `--check` regenerates in memory and exits 1 if the result differs from the committed module. With
  `--stars on` it is a dry run: it writes `standInPoolData.v2-dry-candidate.ts`, `standin-pool.md` and
  `versus.json` under `--out` and never touches `src/sim/standInPoolData.ts`.

## Stars and cores

- `--stars on` (the CLI default) runs every gain through the game's merge rules (src/game/fuse.ts gainModule via
  src/sim/harness/merge.ts). `--stars off` reproduces harness v1 exactly, RNG draw for RNG draw.
- `--cores on|off` defaults to the `--stars` value. Cores need stars on: `--stars off --cores on` is rejected
  ("--cores on needs --stars on"). `--stars on --cores off` is part 1 exactly (the core lever's weight is drawn
  last and only when cores are on, so every other draw is unchanged). The library defaults (`DEFAULT_OPTS`,
  `STANDIN_DEFAULTS`, and `randomBuild`/`fullPurseBuild` without the argument) leave cores off; only the CLIs
  turn them on by default.

### The core lever

With cores on, the shopper has a tenth lever, `core` (last in `LEVERS`). It buys a turret core the hero's caravan
sells (drawn with the day's rarity weights, like the gate lever) and fits it the way the game does
(run.ts buyOffer, fuse.ts gainModule):

1. a copy of a core already FITTED merges into it (the fitted twin keeps its socket);
2. else an empty socket, preferring a gun some belt feeds;
3. else a DIFFERENT core on a full socket is swapped: the old core goes to cargo with its stars
   (fuse.ts freeSocket). A core is never swapped out for its own copy.

A turret has one core socket and one gear hardpoint (deck.ts coreFor/gearFor), so a fitted core leaves room for
one mod. An empty socket runs the hero's signature core, which is never an item and never bought. The merge lever
may grow a fitted core (an empty socket for a copy that doesn't merge, never a swap). The stand-in 2-star cap covers
cores too.

### The cargo

The cargo (`Shopper.cargo`) holds cores swapped off a full socket. It doesn't fight (a Build has no cargo), but its
gold was spent and a later copy can still merge with it (placed beats cargo). The day's gold pays for the deck AND
the cargo:

- `Shopper.left()` = the day's gold - the deck's value - the cargo's value. Every lever checks its price against
  `left()`, and the two after-the-fact checks (levers.ts pressLine for the press and drop levers, shopper.ts
  moveRoute for the route and sync levers) keep a change only while `left() >= 0`. (Fix pass: those two used to
  compare the deck alone with the gold, so a drop could end with deck + cargo over it; see
  tests/harness.budget*.test.ts.)
- `topUp` receives the cargo, so its plating, gate and crates are paid from the same `left()`.
- `fullPurseBuild` reports `cargoGold` (only when > 0). `cost` is the deck's `buildCost`, and cost + cargoGold never
  exceeds the day's gold. The stand-in spend floor (90% of the day's gold) applies to the deck (`cost`): a
  stand-in's strength is its deck.
- The stand-in generator and its written-module guard check the stored deck + the candidate's cargoGold against
  `maxGoldByDay`.
- With cores off the cargo is always empty, so all of this is exactly part 1 (and v1 with stars off).

The report's "Turret cores (0.6.1b)" section counts, per hero and day, builds with a core, cores per build, the
star split, the defs, and `ram@gatling` (FINISHER RAM gear under a GATLING SPOOL core: the game allows the pair,
the ram does nothing there).

## The star bench (stars on)

Every elite and par deck's fusible modules held at 1 star are raised in place to 2 and 3 stars (same cell or turret,
budget ignored) and replayed against the day's gauntlet on the same seeds and sides as the 1-star deck (paired). A
variant the game can't build (an unfused pair) is skipped and counted. The deck is the unit: its paired delta is the
mean over its gauntlet jobs of (win rate at the star - at 1 star).

Flags per def and star:

- **WORSE**: at least 3 decks, a mean paired delta below 0, and the 95% t-interval over decks entirely below 0.
- **NO EFFECT**: every battle of every deck ends exactly as at 1 star (winner, both hulls, duration).
- **SAME AS ★2** (3-star rows): every battle ends exactly as at 2 stars.
- **STEP WORSE** (part 2, 3-star rows): the WORSE rule applied to the STEP (below).

Part 2 sections:

- **STEP column** (3-star rows): for each deck whose 2-star variant was also played, its paired 3-star minus 2-star
  delta on the same seeds; the table shows mean [95% t] (worse/decks). "STEP WORSE rows" lists every deck of a
  STEP WORSE row with its step, as "WORSE rows" does for WORSE.
- **KNOWN_FALLS rows**: the two modules tests/arsenal.decks.test.ts lists in KNOWN_FALLS (SPLITTER ★2->★3, BRAKE
  SHOE ★1->★2->★3; `KNOWN_FALLS_DEFS`). Per day and step: decks, mean [95% t], worse/decks, the FURNACE par deck as
  the clean case (it holds no unfused pair on any day), a split by hero and every deck's delta. SPLITTER 2->3 and
  BRAKE 2->3 come from the 3-star rows' STEP decks; BRAKE 1->2 and 1->3 from the 2- and 3-star rows.
- **PAR~** (report only, in no row or flag): a par deck that holds an unfused pair can't be a bench base, so a merged
  copy of it (fuse.ts fuseAll through the harness adapter) is benched for the KNOWN_FALLS defs only, at 1, 2 and 3
  stars in place (a merged copy may start at 2 stars). Shown as the "PAR~" part of each KNOWN_FALLS line.
- **HOPPER x SPLITTER** (optional, report only): every bench deck holding a 1-star SPLITTER on a route into a turret,
  benched at splitter 1/2/3 stars as it is and with HOPPER ★3 as that turret's gear (replacing its gear, budget
  ignored), same seeds. The table gives the mean paired steps 1->2, 2->3 and 1->3 with and without the hopper
  (worse/decks). The perk names come from the game's own stars.ts perkAt; the harness reads no star value.
- **BEFORE/AFTER** (`--before-after`): the six perk modules (longhaul, coil, splitter, overdrive, press, chamber;
  pending at bf779de, live at c432bee) with each run's decks | mean paired delta [95% t] | flags per day and star,
  plus the after run's perk name and STEP. A row missing on one side reads "—".

The KNOWN_FALLS retune (BRAKE SHOE, SPLITTER) is arsenal work; the harness only measures it.

## The stand-in pool (decision of the stand-in pool owner, harness v2 part 2)

- Pool v1.1 drifts at c432bee: the v1 shopper now buys the wave-1 mods (HOPPER, MANTLET, FINISHER RAM), so
  `npm run standins -- --stars off --check` prints DIFFERS there (a regeneration is 25,698 bytes against the
  committed 25,602). The owner accepts the drift until the flip: pool v1.1 stays the shipped pool, and nothing
  regenerates `src/sim/standInPoolData.ts` now.
- From c432bee on, the v1-exact test for stand-ins is: the tip's `standins --stars off` regeneration is
  byte-identical to c432bee's own v1 regeneration (confirmed by verify11 and the part-2 runs: 25,698 bytes,
  identical). `--check` against the committed module is not the test until the flip regenerates the pool.
- The stars-on pool v2 is a dry run (above) until the flip; its picks hold no module above 2 stars
  (ARSENAL.md §9.2: the Matriarch alone may carry a 3★).

## Regression pins

- Stars off (v1 exact at c432bee): randomBuild 3255984614, fullPurseBuild 3150828827; the default stars-off balance
  run's days table equals c432bee's own v1 harness run (449,072 battles).
- Stars on + cores off (part 1 exactly): randomBuild 3068763238, fullPurseBuild 1965100384.

## The 0.6.1 flip (FUSE_LIVE = true, RULES_VERSION bb-0.6.1)

- validateBuild rejects an unmerged same-star pair (`item: UNFUSED PAIR: ...`). The game validates foreign
  decks only (ghosts, stand-ins, uploads). Stars-off harness builds (the v1 harness never merges), the par
  decks and the captains (pairs until job E merges them) still hold pairs: tests check them against every
  other rule (tests/harnessLegacy.ts `exceptPairs`), and the star bench records `valid: false` for them.
- The shipped stand-in pool is pool v2: stars on, cores on, no module above 2 stars, star-aware codes (`*2`,
  `*3`) that src/sim/standInPool.ts reads with `decodeStarred`. `npm run standins -- --stars on --cores on`
  writes src/sim/standInPoolData.ts and `<out>/standin-pool.md`; add `--check` to compare a regeneration
  with the committed module.
- `--stars off` (the v1 harness, which never merges) is an audit run only: it writes
  `<out>/standInPoolData.stars-off.ts`, never src, and `--stars off --check` is refused. It matched v1.1 byte
  for byte at c432bee; sim changes since then move its scores (25,698 B at 0.6.1g, before and after the
  flip alike, against v1.1's 25,602 B). The v1.1 data module lives on as
  tests/fixtures/standInPoolData.v1.1.ts for the codec tests.
- Stand-in and sample-pool snapshots travel as SNAPSHOT_VERSION (2): a v1 snapshot may not carry stars.
- Pool v2 at the flip (seed 1, pop 64, band 40-60, per 6, par floor 50; harness f40a6d3 on 0.6.1g):
  120 picks, none short, spend 91-100% of the budget, 0 modules above 2 stars. It does NOT meet the genre
  study's filler-vs-par band (stand-ins beat par 50-60%): picks beat par 79-100% on average per hero and
  day, and 100% on day 1, the same as v1.1. The par decks are rebuilt under merging in job E; the band fit
  (a par ceiling in the generator) and the early-loss refund belong to that balance patch.
