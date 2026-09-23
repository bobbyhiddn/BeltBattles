# BeltBattles: full-game design (0.6.0 to 1.0)

Written against 0.4.1 (rules `bb-0.4.0`) while 0.5.0 (cruiser spacing, road events) is in
flight. **The plan of record is the Prime's roadmap, ROADMAP.md (revised 2026-09-23)**, built on
the operator's Game Specification v0.2. Where this file and the roadmap disagree, the roadmap
wins. Every pass keeps the rule the game already lives by: the battle sim is fixed-step, seeded
and deterministic, and every enemy is a real production build under player rules.
Lines marked **DECIDED** record the Prime's decisions.

## 0.6.0 The 10-day run and the warlord roster

**The run** (ROADMAP §1, spec §18). A run lasts 10 days, and each day has three stops:
1. **Dawn: the caravan**, as today.
2. **The road stop**: a road event (0.5.0), or a PvE warlord at Easy, Medium or Hard (spec §19).
3. **Dusk: the ghost**, another player's saved build from the same day of their run.

- You start with **5 lives**. A ghost loss costs one; lose the last and the dark wind catches you.
- A warlord fight **never costs a life**. A loss only forfeits its reward.
- Surviving day 10's dusk completes the run. It is scored by wins, so 10-0 is a flawless run.
- Day 1's dusk is a real day-1 ghost. **There is no softened first fight anywhere**: every
  captain's day-1 deck is its real plan.
- Retired with the old plan: the three-act ladder, its banners, the boss finale and its retries,
  and the round-1 opener layouts.

**The captains' two jobs** (ROADMAP §2). The 13 rival captains in `src/sim/rivals.ts` and
`src/sim/rivalBuilds.ts` are the **warlord roster** met at the road stop, and the **stand-in
ghosts** used at dusk whenever no player build exists for that day (offline, or before the
ghost pool fills up).

| Captain | Faction | Tier | Difficulty | Trick | Portrait |
|---|---|---|---|---|---|
| NETTLE | Weaver / elf | 1 | Easy | SHORT STITCH | crown of bent sewing needles |
| GRUBNOSE | Furnace / orc | 1 | Easy | PRESS GANG | nose ring shaped like a press die |
| RATCHET | Furnace / orc | 1 (was 2) | Easy | OVERCLOCK | goggles with a spinning gear monocle |
| MOTH QUEEN | Weaver / elf | 1, elite | Hard | FRAY STORM | moth-wing mantle, frayed glowing edges; amber elite corners |
| SOOTJAW | Furnace / orc | 2 (was 1) | Medium | SLOW COOKER | soot-black jaw on a glowing cinder pipe |
| SPARKFANG | Furnace / orc | 2 | Medium | SHOCK TROOPER | copper fang arcing a blue spark |
| LACEWING | Weaver / elf | 2 | Medium | SPLITTER SWARM | lace veil splitting into twin tails |
| EMBERLYN | Weaver / elf | 2 | Medium | EMBER WEAVE | braids tipped with smouldering embers |
| OLD BULWARK | Furnace / orc | 2, elite | Hard | IRONCLAD | riveted iron plate over one eye; amber elite corners |
| SILKSHADE | Weaver / elf | 3 | Hard | STATIC WEB | hooded face behind a crackling web |
| LONGTOOTH | Furnace / orc | 3 | Hard | GATE CHAIN | one long tusk hung with gate tags |
| HIGHSPIRE | Weaver / elf | 3 | Hard | TRIPLE THREAT | tall spire helm flying three pennants |
| IRON MATRIARCH | Furnace / orc | 3, boss | Hard, days 8-10 only | GRAND FOUNDRY | crown of kiln chimneys venting fire; plum boss frame |

`difficultyOf(id)`: tier 1 is Easy and tier 2 is Medium; tier 3, the two elites and the Iron
Matriarch are Hard. The rank only drives the portrait frame now. Portraits are 24x24 from
`portraitImage(id)` in `src/render/portraits.ts`, on an orc or elf base. Part 4 moved SOOTJAW up
to Medium (its 13-tile cooker out-hits every Easy deck from day 1) and RATCHET down to Easy (a
bare kiln until day 5), so the per-day ladder holds with 3 Easy, 4 Medium and 5 Hard captains.

**Every captain is a real production build: one plan, two decks** (R1, R2 below). The plan is legal
on every day 1-10 under the build screen's own checks and never shrinks from one day to the next. A
stamp press is bought only together with a gate for its belt.
- **Warlord deck** `rivalBuild(id, day)`: the plan plus the PvE hull ramp `warlordHull(day)` (-27 on
  day 1 up to +72 on day 10). Warlords never cost a life, so this deck may exceed a player's budget
  and its hull need not be whole plating.
- **Stand-in deck** `standInBuild(id, day)`: the same plan with `hullBonus = 25 x (plan plates +
  rampPlates(day))`, paid for. The game fights every stand-in with this deck, never `rivalBuild`.

**The road stop's warlords.** `warlordOffer(runSeed, day)` returns `{ easy, medium, hard }`.
- It draws from its own `hashSeed(runSeed, "warlords", slot, cycle)` stream, so shop rolls and battle seeds never move.
- Each slot deals its pool in shuffled cycles (3 Easy, 4 Medium, 5 Hard captains), so every captain in a pool is offered once before any is offered twice.
- No captain is offered on two consecutive days, in any slot. The one exception is the Iron Matriarch: she is the Hard warlord on days 8, 9 and 10 until beaten (R3), and never earlier.
- `warlordOffer(runSeed, day, matriarchBeatenOn?)` applies R3; `warlordOffers(runSeed)` is the unbeaten schedule.

**Stand-in ghosts.** `standInGhosts(runSeed)` gives one captain per day (`standInGhost(runSeed, day)`):
- It is a seeded order of the 12 captains other than the Matriarch, from its own `hashSeed(runSeed, "standin")` stream.
- No captain stands in twice in a run, and none stands in on a day it is offered as a warlord (it waits for the next free day).
- Either faction may stand in, so mirror matches happen.
- The game fights a stand-in with `standInBuild(id, day)`: an honest deck a player could own that day (R1).

**Rulings (DECIDED, Part 4).**
- **R1 Honest ghosts.** Every dusk opponent, stand-ins included, is an honest deck: its hull is a
  whole, non-negative number of +25 plates; its cost by the async validator's `buildCost` (items,
  mods, belt crates above the hero's base belt, plating; mirrored by `deckCost`) is at most
  `maxGoldByDay(day)` = START_GOLD + incomeFor(d, true) for every d < day (8, 17, 27 ... 119); every
  belt reaches a turret. Road warlords are PvE, keep `warlordHull(day)` and may exceed the budget.
- **R2 Honest hull.** `rampPlates(day) = max(0, round(warlordHull(day) / 25))`: 0 on days 1-4, 1 on
  5-6, 2 on 7-9, 3 on 10. Stand-ins buy these plates on top of their plan's. The ladder's par player
  gets the same conversion: `honestReference(hero, day)` is `warlordBuild(hero, day)` with 25 x
  `rampPlates(day)` hull.
- **R3 The Matriarch rule.** She holds the Hard slot on days 8-10 until the player beats her, the one
  exception to the no-consecutive-days rule. From the next day the Hard slot shows a regular Hard
  captain, never that day's stand-in, so her legendary reward can be won once per run. Stand-ins
  never change. She never stands in, so her deck alone may exceed the budget (+2 plates on day 8).
- **R4 Difficulty.** The base run is the real game: 5 lives, honest ghosts. HEAT levels only go up
  from it (Progression below); nothing goes below the base, and ghosts always run as submitted.

**Difficulty ladder** (`tests/rivals.difficulty.test.ts`). For each day, every captain the player
can meet is fought as a warlord (`rivalBuild`) by the par player, `honestReference` of the other
faction, over 20 seeds (side 0). The margin is the par player's hull left minus the captain's, so a
lower margin is a harder captain. The test prints the ladder and the stand-in pool, and asserts on
every day 1-10:
- by mean margin Easy > Medium > Hard, each gap at least 0.05, and every Easy captain above every Hard one;
- the Easy mean margin is above 0 (a par deck beats Easy on average) and the Hard mean is below 0;
- on days 8-10, the Iron Matriarch has the lowest margin of all;
- the 12 stand-in decks' (`standInBuild`) mean margin is between -0.25 and +0.25;
- against an Easy or Medium captain on days 1-3, the pacing-test decks' battles average 20-45 s.

**Road-stop and dusk panels** (`drawFoe` / `drawIdle` in `src/screens/build/inspector.ts`):
- The road stop shows three cards: portrait, name, an EASY / MEDIUM / HARD tag, `trick`, `blurb` and the reward.
- The name is red for regulars, with an **ELITE** (amber) or **BOSS** (plum4) tag to match the portrait frame.
- The dusk panel shows the ghost's hero, day and record. A stand-in shows its captain's name and portrait with a STAND-IN tag.
- In portrait layout a card keeps 2 rows: name + tag, then trick. The blurb moves to tap-to-inspect.

**Summary screen.** Every fight in order: day, stop (warlord or ghost), opponent, result and
time, plus lives left and `WINS n/10`. A completed run shows its day-10 ghost last.

**Decisions.**
- (1)(2) **Retired:** boss draws and the boss gate went with the acts.
- (3) **DECIDED:** a warlord win pays supplies and a chance at a part from the warlord's own build
  (ROADMAP §1). Starting values: Easy +2 gold, Medium +4 gold, Hard +3 gold plus a pick of 1 of 2
  rare parts, and the Iron Matriarch a legendary part. The 0.6.0 integration may tune them.
- (4) **DECIDED:** mirror matches stay, for warlords and stand-in ghosts alike.
- (5) **DECIDED:** SCOUT (1 gold) reveals tonight's dusk ghost's deck. SABOTAGE (4 gold: the
  warlord fights with its day - 1 deck) and the herald's ELITE BOUNTY (stake 3 gold, 10 back on a
  win) act only on warlord fights, because ghosts always run exactly as submitted.
- (6) **DECIDED:** the daily-seed share code is superseded by async play (0.7.0).
- (7) **DECIDED:** a store or itch.io wrapper is the operator's call at release.

## Later passes (candidate material)

ROADMAP §5 sets the release train: 0.7.0 async play, 0.8.0 humans and dwarves, 0.9.0 beastfolk
and Siphon, 0.10.0 the full spec arsenal and the dark-wind map, 0.11.0 balance, progression and
sound, then 1.0. The notes below predate that train. They are kept as candidate material for
those passes, not as a schedule.

### Arsenal (0.10.0)

**Star merging.** Dropping a duplicate part onto its twin on the deck (or in cargo) merges them into
★2. Two ★2 parts merge into ★3, so ★3 takes 4 copies. With 5 offers a day and a pool of ~32, 4
copies are reachable in a 10-day run and 9 are not. A merged part keeps one tile, sells for half of
everything paid into it, and shows ★ pips on its rarity strip.

| Part | ★1 | ★2 | ★3 |
|---|---|---|---|
| Temper | 2 burn | 3 burn | 5 burn |
| Whetstone | +2 flat | +3 flat | +5 flat |
| Grease Works / Overdrive | 1.6x / 3x | 1.9x / 3.5x | 2.2x / 4x |
| Brake Shoe | 0.5x | 0.4x | 0.33x |
| Long Haul | +2 per prior gate | +3 | +4 |
| Galvanic Coil | 1.6 s stall | 2.2 s | 2.8 s, also stalls on hull hits |
| Splitter | 2 copies at 60% | 2 at 70% | 3 at 50% |
| Calibration | fires 25% faster | 35% | 45% |
| Stamp Press | 1.4 s stamp | 1.2 s | 1.0 s |

Supplies never merge. Warlords may field ★2 parts from day 7, and ★3 parts only as the Iron Matriarch.

**Parts pool, 14 to 32.** Every part carries 1-2 synergy tags: BURN, SHOCK, FRAY, SPEED, HAUL, SPLIT,
ARMOR. A tag bonus lights up at 3 and 5 parts of one tag (e.g. BURN 3: burn ticks +25%). ROADMAP §5
names the spec arsenal (Venom Drip, Overclocker, Tollbooth and the rest); the parts below are
candidates to fill the tags around it.

| New part | Kind | Tags | Effect (★1) | Price |
|---|---|---|---|---|
| BELLOWS | gate | BURN | +1 burn per 2 s the payload has ridden | 5 |
| QUENCH TANK | gate | BURN, HAUL | turns the payload's burn into +3 flat per stack | 5 |
| SPARK PLUG | gate | SHOCK | shock + 1 flat; shocked targets take +20% for 2 s | 5 |
| RELAY COIL | gate | SHOCK | the next gate on the route triggers twice | 7 |
| BARBED SPOOL | gate | FRAY | payload applies +1 extra Fray stack | 5 |
| TENSIONER | gate | SPEED | 1.3x speed, never slower than 1x after it | 3 |
| COUNTERWEIGHT | gate | HAUL | +1 flat per belt tile already ridden (max +8) | 5 |
| SORTING ARM | gate | SPLIT | splits only every 2nd payload, copies at 100% | 7 |
| FLUX KETTLE | gate | BURN, SPLIT | 2 copies at 50%, each with +1 burn | 7 |
| RIFLING | mod | HAUL | shots on this turret +15% damage | 5 |
| HOPPER | mod | SPEED | loading window +1 slot | 5 |
| MANTLET | mod | ARMOR | this turret cannot be stalled | 5 |
| SPARE KILN / SPARE LOOM | factory | hero | a second signature factory, legendary | 12 |
| BOILER PLATE | supply | ARMOR | +15 hull, and burn on you ticks 20% slower | 4 |
| REPAIR KIT | supply | ARMOR | +40 hull for the next battle only | 3 |
| TOOL CRATE | supply | - | +1 cargo slot | 3 |
| LODESTONE | gate | SHOCK, HAUL | +1 flat per shocked hit this battle (max +6) | 7 |
| GILT SEAL | mod | - | turret fires 2 per shot while Fray on the foe is 10+ | 7 |

**New heroes.** ROADMAP §4 sets them: Foundry (human), Bastion (dwarf), Metronome (beastfolk) and
Siphon, with the details in RACES.md. The earlier ANVIL and VOLTA sketches are retired. Each new
hero brings warlords of its own at Easy, Medium and Hard, built like today's captains.

### Progression (0.11.0)

- **Unlocks.** Furnace and Weaver start open. ROADMAP §4's default unlocks Siphon with the first completed run. Parts unlock in 3 batches of 6, one per completed run with a different hero.
- **Difficulty (R4, DECIDED).** The base run is the real game: 5 lives and honest ghosts. There is no
  softer tier: nothing goes below the base. Completing a run unlocks optional HEAT levels above it,
  each opened by completing a run at the one below:
  - HEAT 1: warlords +1 plate. HEAT 2: warlords +2 plates.
  - HEAT 3: as HEAT 2, and income is -1 per day. HEAT 4: as HEAT 3, with 4 lives.
  - Ghosts, stand-ins included, always run exactly as submitted at every HEAT level.
- **Run history.** The last 20 runs go to `beltbattles.history.v1` (about 2 KB each): hero, HEAT, seed, result, every warlord and ghost fought, the final deck, battle times and gold spent. Tapping a run shows its summary screen.
- **Tutorial.** On first launch only (skippable), a build-screen walkthrough with no battle: draw a belt to the turret, drop the free temper on it. Day 1's dusk is still a real ghost.

### Balance and sound (0.11.0)

- **Headless balance harness.** `npm run balance` runs a vitest file behind `BB_BALANCE=1`, like `tests/balance.test.ts`.
  - A reference strategy plays full 10-day runs for 200 seeds per hero. It buys the highest `estimateRoute` gain it can place, rerolls when nothing fits, and uses the cheapest belt fix.
  - It writes JSON and a text table: completion rate, wins per run, per-day battle length, the day each run ended, the gold curve, and each warlord's and stand-in's win rate against it.
- **Targets** (asserted in the harness, not in `npm test`):
  - A solid player survives all 10 days about half the time (ROADMAP §1).
  - Days 1-3 average 20-45 s at 1x, and no battle exceeds 75 s before day 10.
  - The reference strategy's warlord win rate falls from Easy to Medium to Hard on every day.
- **Music.** Four loops from the existing WebAudio synth: caravan (96 bpm, 64 bars), battle for days 1-5 (112 bpm), days 6-10 (120 bpm, minor) and the Iron Matriarch (126 bpm, adds the kiln-roar drone). Each loop is 60-90 s, crossfades over 0.5 s and ducks under KO stingers.
- **By-ear SFX pass.** Loudness-match every event against `fire` (heavy) = 0 dB. A split has its own chirp; burn ticks are quieter than hits (-9 dB); shock gets a crackle tail; the dawn and dusk banners get a gong. A 6-voice cap per event type stops 4x playback from mashing.

## 1.0 release

- **Performance on a mid-range phone** (Pixel 6a / iPhone 11 class):
  - 60 fps in the caravan and at 1x battle; at 4x playback the sim takes 4 ms or less per frame.
  - No frame over 33 ms in a scripted 10-day playthrough (`scripts/playthrough.mjs`).
  - The JS heap stays flat across 5 runs.
- **Single-file build.** `scripts/singlefile.mjs` produces one HTML file of at most 1.5 MB with no network requests. It loads offline from `file://` with the bundled ghost pool and stand-in captains, and saves survive a version bump through a `version` migration.
- **Release gate.** All tests are green, the balance harness is within targets and `RULES_VERSION` is bumped. The operator plays one full run per hero on a phone and approves. A store or itch.io wrapper is the operator's call (decision 7).
