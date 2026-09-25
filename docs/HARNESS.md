# Balance harness (v2)

The balance harness (`src/sim/harness/`, CLIs `tools/balance.ts` and `tools/genStandInPool.ts`) builds populations
of random legal, honestly priced decks per hero and day, plays them against each other headless, and reports
win rates, the star bench and the stand-in pool. This page covers how to run it and what harness v2 part 2
(0.6.1b turret cores, 0.6.1p star perks) and part 3 (0.6.1c, the six wave-1 factories) added.

## Commands

    npm run balance   -- [--days 1,3,5,7,10] [--pop 40] [--gauntlet 20] [--elites 8] [--seeds 2] [--seed 1]
                         [--stars on|off] [--cores on|off] [--factories on|off] [--workers N] [--out dir]
    npm run balance   -- --compare a/balance-v2.json b/balance-v2.json
    npm run balance   -- --before-after before1.json[,before2.json..] after1.json[,after2.json..] [--out-md file]
    npm run standins  -- [--stars on|off] [--cores on|off] [--factories on|off] [--workers N] [--out dir]
                         [--check | --versus | --dry] [--dump pop.json]

- `balance` writes `<out>/balance-v2.md` and `<out>/balance-v2.json`. Results are keyed by job, so the output is
  the same for any `--workers` value. One day per command is fine (`--days 5`); the days tables of separate
  runs can be read side by side.
- `--compare` runs nothing: it compares the `days` tables of two balance JSON files (`days identical: true|false`)
  and exits 1 if they differ.
- `--before-after` runs nothing: it prints (or writes with `--out-md`) the six perk modules' star rows of the first
  run(s) beside the second's, matched by day, def and star (see BEFORE/AFTER below).
- `standins`: since the 0.6.1 flip (below), `--stars on` (the default) writes `src/sim/standInPoolData.ts`, the
  shipped pool v2, and `--check` regenerates in memory and exits 1 if the result differs from the committed
  module. `--dry` (part 3 on the release; stars on, not with `--check`) is the stars-on dry run on the live code:
  it writes `standInPoolData.v2-dry-candidate.ts`, `standin-pool.md` and `versus.json` under `--out`, never src,
  and its versus tables play the new picks against the shipped pool. `--stars off` (harness v1 exactly) writes
  under `--out` only. Before the flip, `--stars off` wrote the shipped v1.1 pool and `--stars on` was a dry run.
  For `--check` with factories, see "The stand-in check on the release" below.

## Stars, cores and factories

- `--stars on` (the CLI default) runs every gain through the game's merge rules (src/game/fuse.ts gainModule via
  src/sim/harness/merge.ts). `--stars off` reproduces harness v1 exactly, RNG draw for RNG draw.
- `--cores on|off` defaults to the `--stars` value. Cores need stars on: `--stars off --cores on` is rejected
  ("--cores on needs --stars on"). `--stars on --cores off` is part 1 exactly (the core lever's weight is drawn
  last and only when cores are on, so every other draw is unchanged). The library defaults (`DEFAULT_OPTS`,
  `STANDIN_DEFAULTS`, and `randomBuild`/`fullPurseBuild` without the argument) leave cores off; only the CLIs
  turn them on by default.
- `--factories on|off` (part 3) works the same way: it defaults to the `--stars` value, `--stars off --factories on`
  is rejected ("--factories on needs --stars on"), and the library defaults leave factories off (the `factories`
  argument comes last in `shopBuild`, `randomBuild`, `topUp` and `fullPurseBuild`). With factories off every RNG
  draw and every build is part 2's (pinned below); a factories-off day's JSON has no new key.

### Factories (part 3, 0.6.1c)

With factories on (stars on), the shopper buys every factory the hero can buy, not only the STAMP PRESS:

- **The shop**: `shopFactories(hero)` = kind "factory", a merchant, price > 0, not in the hero's shopExclude. At
  4ecf202 that is STAMP PRESS and the six (DOUBLE STAMP, SHOT TOWER, HOT SWAP, SLAG POT, ASSEMBLY LINE, GANTRY
  PRESS), the same for every hero. KILN, LOOM and the race factories (no merchant, price 0) are never bought.
- **The draw** (`factoryToBuy`): the affordable ones (within the stand-in cap) with the day's rarity weights
  (content.ts `rarityWeights`), a rarity's weight shared by its defs, as the gate lever draws a gate. On day 1 that
  is about 61% ASSEMBLY LINE (common), 10% STAMP PRESS (epic) and 5.7% each rare one; on day 10 about 29%, 27% and
  8.8%.
- **The "press" lever** keeps its id (reports and personalities still say `press`), but with factories on it buys
  the drawn factory; it applies when the cheapest buyable factory is affordable and a connector is free. The
  **"drop"** lever (WEAVER, SIPHON: REMOVE BELT on a signature route to free a connector) buys the drawn factory for
  the freed connector the same way.
- **Placement** follows the game: a free 2x2 spot off the forward row and a route into a free connector (the
  route's crates within the day's gold). A factory feeds at most `outputsAt(def, stars)` routes (validateBuild's
  rule). A **GANTRY PRESS** draws a route into every free connector it can reach, up to its outputs (at least one):
  three random draws, then the shortest belt around the other belts (path.ts `shortestTiles`) into each free
  connector. When a merge raises its outputs (2 stars: 3 outputs), the same lever tries the new route
  (`Shopper.thirdArm` counts those routes).
- **Merging**: a copy of a placed factory at the same star merges into it (gainInto), in every lever: the twin keeps
  its spot and routes. With factories on the **"merge"** lever may also buy a factory copy, but only when the game's
  preview says it merges at once into a placed twin, so it needs no new footprint or route.
- **SLAG POT**: slag rides at a fixed speed (`AMMO.slag.fixedSpeed`; Battle.transport and deck.ts estimateRoute ignore
  speed gates for it), so the shopper never puts a speed gate on a slag route: `Shopper.cellsFor` leaves slag cells
  out for a speed gate that doesn't merge at once (the gate lever, the merge lever, topUp's 3 g gate), and a speed
  gate a drop carries onto a slag line is left behind. Counted in `Shopper.slag`: `skipped` (not bought) and
  `steered` (bought onto another belt). The ammo kind is read from the def's own spec (no star level changes it;
  tested), because the harness reads no star value itself.
  Tests: tests/harness.factories.test.ts covers cellsFor, the gate lever and the merge lever; tests/harness.slag.test.ts
  covers the drop lever (a unit case, and the pinned WEAVER d3 #73, whose drop reaches the filter) and topUp's 3 g gate.
- **ASSEMBLY LINE, HOT SWAP, DOUBLE STAMP, SHOT TOWER and HOT START** need no harness logic: the sim applies them
  (commissioning, the preset cycle, batches and the pending mouth, the overclock).
- **Stand-ins**: the 2-star cap covers factories (the draw and the merge lever ask `canGain` for every copy), and the
  generator's checks and the written-module guard see factories (items are modules).
- **Connectors**: FURNACE, BASTION and METRONOME have one connector free beside their signature route, FOUNDRY two,
  WEAVER and SIPHON none until a drop frees one. So in the field a GANTRY feeds one route, or two on FOUNDRY; a third
  route needs three free connectors, which no hero's deck has (the unit tests build one on a WEAVER without LOOM
  belts).

The stars-on invariant after every lever (tests/harness.factories.test.ts, via the LeverTrace) adds: no factory feeds
more routes than `outputsAt(its stars)`, and no speed gate sits on a slag route.

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

Part 3 sections (factories on only; a factories-off day carries none of them):

- **Factories as benched defs**: a factory is a fusible def, so every placed 1-star factory in an elite or par deck
  (STAMP PRESS and the six) is raised in place to 2 and 3 stars like any module: same spot and routes, paired seeds.
- **FACTORY table** (`DayResult.factory`, `factoryRows`): per factory and day, from the bench's 2- and 3-star rows
  (the same paired decks): decks, mean paired delta 1->2 [95% t] (worse), 1->3, STEP 2->3 [95% t] (worse), WORSE
  and STEP WORSE by the D1 rule with their decks; split by hero, and for GANTRY PRESS by the routes its benched copy
  feeds (1, 2 or 3; see Connectors above).
- **PRESS-SLOT** (`DayResult.pressSlot`, report only): the arsenal's par/furnace/6 (`heroRefBuild("furnace", 6)`, the
  golden-060 fixture's deck, as tests/arsenal.decks.test.ts parSwap uses it) and every elite or par deck of the day
  holding a STAMP PRESS, with the Press swapped in place (`pressSwap`: same uid, cell and route) for each factory at
  1, 2 and 3 stars, against the whole gauntlet. Every variant of a deck plays each gauntlet member on the same seeds
  (`focusSeeds`, key `bb-bench-pressslot`). The worker mode `stats` (`jobStats`) returns points (playJob's exactly),
  damage dealt and jams per job, so the table shows the paired win-rate steps 1->2 and 2->3, damage per fight and
  jams per fight. The arsenal's own rows (par/furnace/6 vs par/weaver/6, seeds 1-5, damage, wins, jams) lead it.
- **Factory usage** (`DayResult.factoryUse`): per hero and day, decks holding each factory (population and elites),
  copies at 1/2/3 stars, GANTRY copies by routes fed, speed gates kept off slag routes (skipped/steered), speed gates
  found on a slag route (0 by the rule), and routes a merge's new output added.

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

- Part 3 on the 0.6.1 release (689c2e8): the bullets above are history. Pool v2 shipped at the flip (70c01c7),
  generated by the f40a6d3 harness (stars on, cores on) before `--factories` existed, that is with factories off.
  (At 4ecf202, part 3 found the arsenal's own v1 regeneration byte-identical to c432bee's, 25,698 bytes; the flip
  records the same size at 0.6.1g.)

### The stand-in check on the release (decision, harness v2 part 3 on 0.6.1)

- With stars on, `standins` defaults to `--factories on`, but the shipped pool v2 was generated with factories
  off. So `npm run standins -- --check --factories off` must print IDENTICAL: that is the test that the
  factories-off harness still generates the shipped pool. A plain `npm run standins -- --check` (factories on)
  prints DIFFERS until job E ships a factory-aware pool. Nothing regenerates `src/sim/standInPoolData.ts` in
  this pass.
- The module header prints `--factories on` for a factories-on pool and nothing with factories off, so a
  factories-off regeneration reproduces the shipped header (which predates the flag) byte for byte, and a
  factories-on pool's header names the flag whatever the default is (tests/harness.factories.test.ts).
- A factory-aware candidate for job E: `npm run standins -- --dry --out <dir>` (factories on by default) writes
  the candidate module, standin-pool.md and versus.json under `<dir>` and never touches src. Its picks may hold
  the six factories (at most 2 stars, like every stand-in module).
- Since pool v2.1 (below) the shipped pool is factory-aware: a plain `npm run standins -- --check` prints
  IDENTICAL, and `--check --factories off` prints DIFFERS.

### Pool v2.1 (0.6.2: the D4 native re-bake; decision of the stand-in pool owner)

- Generated on arsenal-062-combined 65a36b7 (wave-2 catalogue, E1/E2 par and captains, race par fusion, the shared
  salvage pool) with the default options, stars, cores and factories on: `npm run standins -- --workers 22`, 299,200
  battles. The header reads `--par-floor 50 --factories on`, and `npm run standins -- --check` prints IDENTICAL.
- Native on BELTSIDE: no deck has a rig on a belt tile, so the loader's D3 step changes nothing (pool v2 on the same
  head: 94 decks migrated, 230 rigs moved, 63 dropped). POOL_NATIVE is therefore true and the pool tests' strict
  branches apply: a par's stored vsPar is its 10-seed re-simulation, or, when the robust re-play took it, a whole
  number of hundredths from a borderline sample (tests/standInPool.gen.test.ts).
- The picks use all 58 buyable modules (23 rigs, 13 factories, 13 cores, 9 mods); 82 of 120 hold a bought factory;
  190 two-star copies and no 3-star; spend 90-100% of maxGoldByDay (mean 98%).
- The genre band (targets.json filler-vs-par: stand-ins beat the day's par deck 50-60%) is NOT met: 0 of 20
  hero-days. The picks beat the FURNACE par deck 92% of the time and the WEAVER par deck almost always; against the
  average-deck field (the day's full-purse gauntlet) they win 59%. The cause is the par decks: heroRefBuild spends
  0-51% of maxGoldByDay (nothing on day 1, 45-47 of 119 g on day 10), while a stand-in must spend at least 90%.
- So no par ceiling went into the generator. The builds that lose to the WEAVER par deck have a median strength
  percentile of 3-28, so a pool that met the band would be bottom-quartile filler, the failure the target exists to
  prevent. The band needs a par deck that spends like a player (the balance pass); regenerate and re-check then.

## Regression pins

- Stars off (v1 exact at c432bee and at 4ecf202: the arsenal's own v1 harness gives the same two numbers):
  randomBuild 3255984614, fullPurseBuild 3150828827; the default stars-off balance run's days table equals the
  arsenal's own v1 harness run (449,072 battles).
- Stars on + cores off (part 1 exactly): randomBuild 3068763238, fullPurseBuild 1965100384.
- Stars on + cores on + factories off (part 2 exactly, computed at the rebased tip before any factory change; all six
  heroes, seeds `fac-off-pin` / `fp-fac-off-pin`): randomBuild 349059202, fullPurseBuild 46712332.
- On the 0.6.1 release (689c2e8, FUSE_LIVE true) all three pairs pass unchanged: part 3 re-pins nothing there.

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
