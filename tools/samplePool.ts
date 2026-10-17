// Deterministic sample ghost pool, the server's seed pool (`seed`, `npm run gen:ghosts`). The stand-in heroes' ghosts
// (STAND_IN_HEROES: FURNACE and WEAVER) are drawn from the bundled stand-in pool (src/sim/standInPool.ts); since 0.8.0 the
// other playable heroes' ghosts come from the par player (raceGhosts, below).
//  - sampleGhosts(): 2 heroes x 2 variants x 10 days = 40 snapshots. Variant 0 is the day's par, variant 1 a seeded
//    pick that is never the same deck as the par. Records (wins, lives) are drawn exactly as before the switch to the
//    stand-in pool: variant 1's rng first replays the retired shopper's draws, so only the decks changed. Since the
//    0.6.0 merge lives count down from START_LIVES (5; RUN_LIVES, 3, is gone): the same draws, lives 1..START_LIVES.
//  - 0.7.0a D5 (REQ-BFG-016): every record label is one a run can carry into that dusk under 0.6.2's run rules
//    (src/net/records.ts). A drawn label no run reaches (three of them: day 3's 0W 3 lives and 1W 4 lives, which the
//    early-loss refund makes impossible) keeps its wins and moves to the nearest reachable lives.
//  - floorGhosts(), 0.7.0a D5: one more ghost per hero and day (variant 2, a third stand-in pool deck, never the par
//    or variant 1's) with the day's floor record, no wins and the fewest lives a run can have (records.ts
//    floorRecord). Under the record rule (D1) the floor ghosts are eligible for every reachable request, so every
//    reachable state at every dusk has at least 2 eligible seed ghosts (uncoveredStates; tests/seed.records.test.ts).
//  - raceGhosts(), 0.8.0 RC (REQ-BFG-016, REQ-BFG-011): the playable heroes with no stand-in decks, FOUNDRY and BASTION
//    (RACE_SEED_HEROES), get as many seed ghosts per hero and day as a stand-in hero: two sample ghosts (variants 0 and
//    1, records drawn as a stand-in hero's variant 0 draws them) and one floor ghost (variant 2, floorRecord). Each deck
//    is the par player's dusk deck of that day (src/sim/harness/player.ts playerBuild, the typical policy: a real run
//    through the game's caravan, buying only what it offers at the offer price) from one of the par field's runs (par.ts
//    parSeeds: seeds 1-12, the field B1 measured FOUNDRY and BASTION against), picked by (hero, variant, day) and stepped
//    to the next field seed while it is the same deck as an earlier variant's that day. They come after the 60 stand-in
//    hero ghosts, so those keep their records, createdAt and order.
//  - generateSamplePool() = all three, 120 snapshots (60 FURNACE and WEAVER, 60 FOUNDRY and BASTION). It fails loudly
//    (throws) if a ghost fails validateBuild (the shop's strict rules) or validateUpload (the player mode, as POST
//    /v1/ghosts checks an upload), if a label is not reachable, or if a reachable state has fewer than 2 eligible ghosts.
//  - AZ-BUMP (REQ-BFG-078, REQ-BFG-077; REVIEW-PARAZ N3, BRIEF-AZBUMP S3), with NPC_DAY on: a seed deck is road-fed (its
//    run fought a warlord each day and may hold the drops), and the player mode counts drops only through a road log
//    (validate.ts roadDropValue). So every seed ghost carries its run's road log as a v3 snapshot's `road`: a stand-in
//    pool deck the log its pool tuple stores (standInPool.ts StandInEntry.road), a race deck its par run's (player.ts
//    playerRoadLog); seedGhost's player-mode check, the seed step (server/seed.ts checkPool) and the client's served-ghost
//    check (ghostClient.ts) pass it as ctx.road, so its drops count exactly as for a player's upload. With NPC_DAY off,
//    no ghost carries one: every snapshot exactly as before. seedGhost's strict check (validateBuild) holds a deck to the
//    shop's gold alone (maxGoldByDay + its runes' gold), which a road-fed deck outgrows by its road gold and drops, so with
//    NPC_DAY on its budget line is left to the player-mode check right after it, which counts both (roadCap and the road
//    log), as the stand-in generator's own check does (standins.ts writtenProblems); every other strict line stands.
//  - LOSS-1 P2 (REQ-BFG-092; REVIEW-LOSS1 Q1, BRIEF-LOSS1-ADD2 B), with NPC_DAY on: every playable hero's floor ghost
//    (variant FLOOR_VARIANT, the day's floor record) carries the casual player's dusk deck of its day (casual.ts casualRun,
//    CASUAL_TUNE), so the record a losing run carries (no wins, the fewest lives) meets decks a casual human can beat. All
//    ten of a hero's floor decks come from ONE casual run (casualFloorRun: the first seed from CASUAL_FLOOR_SEED up whose
//    deck differs from the day's variants 0 and 1 on every day), so every one is reachable in one run; each travels as a
//    v3 snapshot with that run's road log and run seed, as a race deck does, and passes the same checks (seedGhost). The
//    records, playerIds, runIds and createdAt order are as before; a floor ghost's id (ghostId, its content's hash) moves
//    with its deck. With NPC_DAY off, no casual run is played: every snapshot exactly as before.
//  - SOFT-1 (REQ-BFG-092; BRIEF-SOFT1, RULING-SOFT1-R1's C2bw; B/output-soft1/bench/bands-soft1.md), the softer seed pool, a
//    server-only update after 0.9.9: every playable hero's variant 0 and 1 decks are the candidates graded nearest
//    SOFT_TARGET (400 permille) in their own slot, from the par field's 12 decks of the day (a stand-in hero's 6 stand-in
//    pool entries too), shipped as SOFT1_PICKS in the world it was read in (see "SOFT-1" below). The floor ghosts, the
//    records, the ghost count and every check are unchanged; in any other world every snapshot is as before.
//  - RUN-1 T8 (REQ-BFG-059, REQ-BFG-116; RULING-RUN1-R1 R1.1), the long run: the generator makes days 1..poolDepth(): MAX_DAY (10)
//    with the long run off, LONG_RUN_GEN_DAYS (16) under long-run rules (longRun.ts longRunRules(), a test's withLongRun or
//    tools/genGhostPool.ts --long-run). EVERY day loop and index formula reads the depth (sampleGhosts, floorGhosts, raceGhosts,
//    raceDeck, softCandidates, softDeckOf, casualFloorRun, seedSlot's stride, uncoveredStates), so with the switch off the output
//    is byte for byte the committed server/seedPoolData.ts (output-run1/T8-proof.md). Under long-run rules: (1) a drawn record
//    keeps 0..WIN_GOAL-1 wins (a run ghost is a dusk BEFORE its 10th win), reads LAST CHANCE on any day, and is snapped to a record
//    the long model reaches (records.ts longRunRecords: at most MAX_RUN_DRAWS draws, PATCH UP once per event bag); (2) every seed
//    ghost STATES its `losses` (v3; statedLosses: the drawn count when a run with exactly that many reaches the record, else the
//    nearest count that does), as an honest long-run upload does (POST requires it under those rules: records.ts lossesProblem);
//    (3) uncoveredStates runs on the long model to the generator's depth (>= MIN_ELIGIBLE eligible ghosts at every reachable state
//    of days 1-16; days past 16 are D6's widening); (4) the day 11-16 picks of SOFT-1's rule come in as a SCRATCH INPUT through
//    the override BB_SOFT1_PICKS_FILE (softPickRows; tests/run1.seedpool.test.ts runs the rule for days 11-16 in the long-run
//    world and writes the rows), never committed here: SOFT1_PICKS' rows and SOFT1_WORLD do not change in RUN-1 (the release
//    bump re-reads the whole table, days 1-16, in its own world). Without the override a long-run day past SOFT1_PICKS' range
//    takes the decks as before SOFT-1 (sampleEntry: standInDay's clamp, day 10's decks; raceDeck: the par field's run of the day).

import { Rng, hashSeed } from "../src/core/rng";
import { GRID, HEROES, ITEMS, RULES_VERSION, START_LIVES, type HeroId } from "../src/sim/content";
import { startingBuild } from "../src/sim/ai";
import { installedTurrets, occupancy, type Build } from "../src/sim/deck";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { PAR_K, parSeeds } from "../src/sim/harness/par";
import { parRunSeed, playerRoadLog, playerRun, type PlayerDay } from "../src/sim/harness/player";
import { CASUAL_TUNE, casualRun } from "../src/sim/harness/casual"; // LOSS-1 P2: the floor ghosts' decks (NPC_DAY on)
import { npcDayRules, type RoadEntry } from "../src/sim/npcDay"; // AZ-BUMP (N3): the seed ghosts' road logs
import { HEARTS_START, heartsDusk, heartsRules } from "../src/sim/hearts"; // RETUNE-1 (REQ-BFG-096): the hearts labels
import { isShapesPiece } from "../src/sim/shapes"; // SHAPES-1: the retired shopper never draws a shaped rig
import { STAND_IN_HEROES } from "../src/net/fallback";
import { eligible } from "../src/net/matchmaking";
import { floorRecord, isReachable, reachableRecords, type DuskRecord } from "../src/net/records";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { checkSnapshot, encodeSnapshot, ghostId, longRunFor, MAX_DAY, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot"; // RUN-1 T8: + longRunFor (snapshot.ts re-exports the rules gate's)
import { GRADE_MAX } from "../src/net/snapshot"; // RETUNE-1 T5 (REQ-BFG-092): the grade's bound
import { GRADE_K, GRADE_SEEDS, pickRules } from "../src/net/pick"; // RETUNE-1 T5: the switch and the grade's K and seeds
import { parField } from "../src/sim/harness/par"; // RETUNE-1 T5: the grade's par fields
import { playJob, type Job } from "../src/sim/harness/tournament"; // RETUNE-1 T5: a pairing's points
import { STAND_IN_POOL_DAYS, encodeStarred, standInParIndex, standInPickIndex, standInPool, type StandInEntry } from "../src/sim/standInPool"; // RUN-1 T8: + STAND_IN_POOL_DAYS
// HULL-ON (REQ-BFG-092; cap's ruling 9c114aab5ba18dfe): the grade memo's world key reads every switch the grades read. Each
// of these modules is already loaded by the imports above (player.ts, deck.ts, runes.ts), so these lines, last in the
// list, change no module's load order (Q1's lesson, ruling 12a42239093fb6ec)
import { sustainLive, wave3Live } from "../src/sim/content";
import { hullScaleRules } from "../src/sim/hullScale";
import { ladderFixRules } from "../src/sim/ladderFix";
import { guardRules } from "../src/sim/guard";
import { openRunesRules } from "../src/sim/openRunes";
import { freeJoinsRules } from "../src/sim/freeJoins";
import { BOT_RUNES } from "../src/sim/runes";
import { shapesRules } from "../src/sim/shapes"; // MERGE-099F: the grade memo's world reads SHAPES too (already loaded above)
// RUN-1 T8 (REQ-BFG-059, REQ-BFG-116): the generator's depth and the draws' bounds follow the long run (src/sim/longRun.ts, already
// loaded by snapshot.ts above, so this line, last in the list, changes no module's load order)
import { LONG_RUN_GEN_DAYS, WIN_GOAL, longRunRules } from "../src/sim/longRun";
import { readFileSync } from "node:fs"; // RUN-1 T8: the scratch pick rows (BB_SOFT1_PICKS_FILE)

const EPOCH = Date.UTC(2026, 8, 23, 19, 22); // fixed, so the generated file is reproducible
const PLATE = ITEMS.plating.supply!.hull!;
// SHAPES-1 (step 8, the flip; RUN2-SHAPES1 1.7: changed because a shaped piece broke it): the retired variant-1 shopper
// replays its rng draws only, so each sample snapshot keeps its record; it never draws one of the three shaped rigs. With
// SHAPES on at load they would join this list (made once, at load): its draws, and so the records, would move, and with
// SHAPES then set off a drawn NAIL STRIP would be an unknown item. The list is the same with SHAPES on or off.
const GATES = Object.values(ITEMS).filter((d) => d.kind === "gate" && d.merchant && !isShapesPiece(d.id));
const MODS = Object.values(ITEMS).filter((d) => d.kind === "mod" && d.merchant);

/** sampleGhosts' variants per hero and day (0 the par, 1 a seeded pick); floorGhosts adds variant FLOOR_VARIANT. */
export const SAMPLE_VARIANTS = 2;
export const FLOOR_VARIANT = 2;
/** D5: every reachable state at every dusk has at least this many eligible seed ghosts under the record rule (D1). */
export const MIN_ELIGIBLE = 2;

/**
 * RUN-1 T8 (RULING-RUN1-R1 R1.1): the days the generator makes, 1..poolDepth(): MAX_DAY (10) with the long run off (the committed
 * seed pool, byte for byte), LONG_RUN_GEN_DAYS (16) under long-run rules (longRun.ts longRunRules(): the module switch, a test's
 * withLongRun, tools/genGhostPool.ts --long-run). Read at call time, never at load: every day loop and every index formula (the
 * slot stride, the pool order's `first`) takes it, so a pool is internally consistent in whichever world it is made. Days past
 * it are the written rule's (D5/D6: the day-16 plan with the day's own hull, gold and odds; a thin day widens to an earlier one).
 */
export const poolDepth = (): number => (longRunRules() ? LONG_RUN_GEN_DAYS : MAX_DAY);

const sampleSeed =(hero: HeroId, v: number, day: number): number => hashSeed("sample-pool", hero, v, day);

/** The sample deck: variant 0 = the par; variant v >= 1 = standInPick's entry for `seed`, stepped deterministically to the
 *  next entry while it is the same deck as the par (or, from variant 2, as an earlier variant's deck). */
export function sampleDeck(hero: HeroId, day: number, v: number, seed: number): Build {
  return sampleEntry(hero, day, v, seed).build;
}

/** AZ-BUMP (N3): sampleDeck's pool entry, with its run's road log when the pool stores one (StandInEntry.road). */
export function sampleEntry(hero: HeroId, day: number, v: number, seed: number): StandInEntry {
  const pool = standInPool(hero, day), par = standInParIndex(hero, day);
  if (v === 0) return pool[par];
  // star-aware codes: since the 0.6.1 flip two picks may differ only in stars
  const taken = new Set([encodeStarred(pool[par].build)]);
  for (let u = 1; u < v; u++) taken.add(encodeStarred(sampleDeck(hero, day, u, sampleSeed(hero, u, day))));
  let i = standInPickIndex(hero, day, seed);
  for (let step = 0; step < pool.length && taken.has(encodeStarred(pool[i].build)); step++) i = (i + 1) % pool.length;
  return pool[i];
}

/**
 * RUN-1 T8: a stand-in hero's variant `v` (0 or 1) sample deck of `day` with its run's road log: SOFT-1's pick in its world
 * (softPicked), else the stand-in pool's (sampleEntry); and for a day the stand-in pool does not hold (past STAND_IN_POOL_DAYS: 10
 * until the release bump regenerates it to 16) the par field's run of the day (raceDeck, as a race hero's decks): standInDay's clamp
 * serves a FOE on such a day, but a day-10 stand-in deck is no GHOST of day 11 (it holds 10 runes, a day-11 ghost 11: validate.ts
 * runeProblem). Days 1-10: exactly softPicked ?? sampleEntry, as before.
 */
export function sampleDeckOf(hero: HeroId, day: number, v: number, botRunes?: boolean): SoftDeck {
  const picked = softPicked(hero, day, botRunes)?.[v];
  if (picked) return picked;
  if (day > STAND_IN_POOL_DAYS) return raceDeck(hero, day, v, botRunes);
  return sampleEntry(hero, day, v, sampleSeed(hero, v, day));
}

/** AZ-BUMP (N3): the road log a seed ghost carries: its run's, with NPC_DAY on only (off: none, the snapshot as before). */
const roadOf = (road: readonly RoadEntry[] | undefined): RoadEntry[] | undefined => (npcDayRules() && road ? [...road] : undefined);

/** Retired variant-1 shopper (gates, a module, plating on the starting layout). Its deck is no
 *  longer used; it only replays its rng draws so each snapshot keeps its record. */
function shopper(hero: HeroId, day: number, rng: Rng): Build {
  const b = startingBuild(hero, 1);
  const budget = maxGoldByDay(day);
  let uid = 100;
  for (let tries = 0; tries < 40; tries++) {
    const left = budget - buildCost(b).total;
    const roll = rng.next();
    if (roll < 0.15) {
      const free = installedTurrets(b).map((s) => s.slot).filter((t) => !b.mods.some((m) => m.turret === t)); // 0.6.2s
      const d = rng.pick(MODS);
      if (free.length && d.price <= left) b.mods.push({ uid: uid++, def: d.id, turret: rng.pick(free) });
    } else if (roll < 0.3) {
      if (ITEMS.plating.price <= left) b.hullBonus += PLATE;
    } else {
      const occ = occupancy(b);
      const free = b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item < 0);
      const d = rng.pick(GATES.filter((g) => g.rarity !== "legendary" || day >= 4));
      if (free.length && d.price <= left) {
        const k = rng.pick(free);
        b.items.push({ uid: uid++, def: d.id, x: k % GRID, y: Math.floor(k / GRID) });
      }
    }
  }
  return b;
}

/** D5: a drawn label as a run can carry it: unchanged when reachable, else the same wins at the nearest reachable lives
 *  (the higher one on a tie). Every wins count 0..day-1 is reachable with every life kept, so one always exists. */
export function reachableLabel(day: number, wins: number, lives: number): DuskRecord {
  if (isReachable(day, wins, lives)) return { wins, lives };
  let same = reachableRecords(day).filter((r) => r.wins === wins);
  if (!same.length && longRunFor(RULES_VERSION)) {
    // RUN-1 T8: the long model bounds the draws, so on a deep day a wins count can have no record at all (day 16 with 0 wins needs
    // 7 losses): the label keeps the nearest wins count a run does reach (the higher on a tie), then the nearest lives, as above
    const all = reachableRecords(day);
    const near = all.reduce((a, b) => (Math.abs(b.wins - wins) < Math.abs(a.wins - wins) || (Math.abs(b.wins - wins) === Math.abs(a.wins - wins) && b.wins > a.wins) ? b : a), all[0]);
    same = near ? all.filter((r) => r.wins === near.wins) : [];
  }
  if (!same.length) throw new Error(`no reachable record with ${wins} wins at dusk ${day}`);
  return same.reduce((a, b) => (Math.abs(b.lives - lives) < Math.abs(a.lives - lives) || (Math.abs(b.lives - lives) === Math.abs(a.lives - lives) && b.lives > a.lives) ? b : a));
}

/**
 * RETUNE-1 (REQ-BFG-096): a drawn label (`wins`, and `lost` of the other dusks lost) on the run's scale. HEARTS off: the
 * 5-life label as before, START_LIVES - min(START_LIVES - 1, lost), snapped by reachableLabel (the same draws, the same
 * records). HEARTS on: the hearts a run holds after losing the `lost` dusks just before `day` (its wins came first), on the
 * game's own step (hearts.ts heartsDusk: 1/2/3 by day, LAST CHANCE), snapped by reachableLabel to a record the hearts model
 * reaches (records.ts, this build's rules).
 */
export function drawnLabel(day: number, wins: number, lost: number): DuskRecord {
  if (!heartsRules()) return reachableLabel(day, wins, START_LIVES - Math.min(START_LIVES - 1, lost));
  let h = HEARTS_START, lc = false;
  // RUN-1 T8: under a long run's rules LAST CHANCE fires on ANY day (the record model's own step: records.ts longStates); the 10-day
  // rules pass no option, so heartsDusk's default last day (RUN_DAYS) stands, exactly as before
  const step = longRunFor(RULES_VERSION) ? { lastDay: Infinity } : {};
  for (let d = day - lost; d < day; d++) {
    const r = heartsDusk(h, d, "loss", lc, step);
    h = r.hearts;
    lc = lc || r.lastChance;
  }
  return reachableLabel(day, wins, Math.max(1, h));
}

/**
 * RUN-1 T8: the (wins, lost) a seed ghost draws at `day`: wins 0..day-1, and the dusks lost among the others (the same draws as
 * ever for days 1-10). A run ghost is a dusk BEFORE the run's WIN_GOAL-th win (snapshot.ts maxWinsFor), so under a long run's
 * rules the wins stay 0..WIN_GOAL-1 (day 11 on); with the long run off, `day` is at most 10 and the draw is exactly as before.
 */
export function drawRecord(day: number, rng: Rng): { wins: number; lost: number } {
  const wins = rng.int(longRunFor(RULES_VERSION) ? Math.min(day, WIN_GOAL) : day);
  return { wins, lost: rng.int(day - wins) };
}

/**
 * RUN-1 T8 (R1.2): the dusks lost a long-run seed ghost STATES (snapshot.losses, v3), as an honest long-run upload does. `lost`, the
 * count its record was drawn from, when a run with exactly that many losses reaches (day, wins, lives) (records.ts: day - 1 =
 * wins + losses + draws, at most MAX_RUN_DRAWS draws), else the nearest count that does (the larger on a tie). undefined when the
 * 10-day rules apply (the field is reserved there: the ghost is as before) or no count reaches it.
 */
export function statedLosses(day: number, rec: DuskRecord, lost: number): number | undefined {
  if (!longRunFor(RULES_VERSION)) return undefined;
  let best: number | undefined;
  for (let l = 0; l <= day - 1 - rec.wins; l++) {
    if (!isReachable(day, rec.wins, rec.lives, { losses: l })) continue;
    if (best === undefined || Math.abs(l - lost) < Math.abs(best - lost) || (Math.abs(l - lost) === Math.abs(best - lost) && l > best)) best = l;
  }
  return best;
}

/** One seed ghost, checked: the strict shop rules and the player mode (D5), and a reachable label. FLIP-X2 (RUNES-2a
 *  section 3 step 4; BOTSX-REPORT section 9): a deck that holds runes travels as a v3 snapshot (Build.runes is v3 only),
 *  carrying the run seed when the deck's run is known (`seed`: a race ghost's par-field run), so the upload check
 *  re-derives every dawn's offer; a stand-in pool deck stores no run seed, so its ghost carries none (the count rule
 *  still holds it to one rune a dawn). A rune-less deck is v2 exactly as before. AZ-BUMP (REQ-BFG-078; REVIEW-PARAZ N3):
 *  `road`, its run's road log (NPC_DAY on only; see the header), travels in a v3 snapshot's `road` and goes to the
 *  player-mode check as ctx.road, as an upload's does; and the strict check's budget line is left to that check.
 *  RUN-1 T8: `losses` (long-run rules only, statedLosses; v3, after the run seed as an upload writes it): the dusks the ghost's run
 *  lost, so the record check holds it to exactly that count (isReachable's `losses`), as POST holds an honest long-run upload. */
function seedGhost(hero: HeroId, day: number, v: number, build: Build, rec: DuskRecord, at: number, seed?: number, road?: RoadEntry[], losses?: number): GhostSnapshot {
  const runes = (build.runes?.length ?? 0) > 0;
  const snap = checkSnapshot({
    // v2: pool decks carry stars (the 0.6.1 flip) and rigs their `rot` (0.6.2 BELTSIDE, DESIGN-beltside D1)
    // AZ-BUMP (N3): a road log is v3 only (snapshot.ts roadField), written last
    v: runes || road || losses !== undefined ? SNAPSHOT_V3 : SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day, wins: rec.wins, lives: rec.lives, build,
    runId: `sample-run-${hero}-${v}`, playerId: `sample-${hero}-${v}`, createdAt: at,
    ...(runes && seed !== undefined ? { seed } : {}),
    ...(losses !== undefined ? { losses } : {}),
    ...(road ? { road } : {}),
  });
  // AZ-BUMP (N3): with NPC_DAY on, the strict budget line (the shop's gold alone) is left to the player mode below, which
  // counts the road's gold (roadCap) and the road log's drops; off, every strict line exactly as before
  const val = validateBuild(snap.build, day);
  const strict = val.errors.filter((e) => !(npcDayRules() && e.startsWith("budget: ")));
  if (strict.length) throw new Error(`sample ghost ${hero} v${v} day ${day} is invalid: ${strict.join("; ")}`);
  // D5: an honest player could have uploaded it. AZ-BUMP (N3): with its road log, as an upload carries it
  const up = validateUpload(snap.build, day, snap.rules, { seed: snap.seed, ...(snap.road ? { road: snap.road } : {}) });
  if (!up.ok) throw new Error(`sample ghost ${hero} v${v} day ${day} fails validateUpload (player mode): ${up.errors.join("; ")}`);
  // RUN-1 T8: and, when it states them, with exactly its losses (a long run's ghost; the seed step's checkPool holds it the same way)
  if (!isReachable(day, snap.wins, snap.lives, snap.losses !== undefined ? { losses: snap.losses } : {})) {
    throw new Error(`sample ghost ${hero} v${v} day ${day}: ${snap.wins}W ${snap.lives} lives${snap.losses !== undefined ? ` and ${snap.losses} losses` : ""} is not a record a run can carry into that dusk`);
  }
  return snap;
}

/** The 40 sample ghosts: variants 0 and 1 of each hero and day. SOFT-1 (REQ-BFG-092): in the shipped world each deck is
 *  SOFT1_PICKS' (softPicked; a par-field deck carries its run's seed, as a race ghost's); elsewhere as before. The records
 *  are drawn exactly as before. */
export function sampleGhosts(o: { botRunes?: boolean } = {}): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  const depth = poolDepth(); // RUN-1 T8: days 1..depth (10 with the long run off)
  for (const hero of STAND_IN_HEROES) {
    for (let v = 0; v < SAMPLE_VARIANTS; v++) {
      for (let day = 1; day <= depth; day++) {
        const seed = sampleSeed(hero, v, day);
        const rng = new Rng(seed);
        if (v === 1) shopper(hero, day, rng); // replay the retired shopper's draws: records unchanged
        const { wins, lost } = drawRecord(day, rng);
        const rec = drawnLabel(day, wins, lost);
        // AZ-BUMP (N3): the deck and its run's road log; SOFT-1: the shipped world's pick (RUN-1 T8: sampleDeckOf)
        const entry: SoftDeck = sampleDeckOf(hero, day, v, o.botRunes);
        out.push(seedGhost(hero, day, v, entry.build, rec, EPOCH + out.length * 1000, entry.seed !== undefined ? (parRunSeed(hero, entry.seed) >>> 0) || undefined : undefined, roadOf(entry.road), statedLosses(day, rec, lost)));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- SOFT-1 (REQ-BFG-092): the softer seed pool
/**
 * SOFT-1 (REQ-BFG-092; BRIEF-SOFT1, RULING-SOFT1-R1's candidate C2bw; THE table: B/output-soft1/bench/bands-soft1.md): every
 * playable hero's variant 0 and 1 seed decks are softened, so a typical run ends around 6-7 wins again (0.9.9's bands-r8:
 * par 5.10, c5 3.18; this pool at 96 seeds a hero: par 6.69, c5 3.68, c5's runs with no win 3%, with 3 or more 75%).
 * THE RULE (softDecks): for each hero, day and variant 0 or 1, the candidate deck (softCandidates: a stand-in hero's 6
 * stand-in pool entries, then every hero's par field, the 12 runs' dusk decks of the day) whose grade is nearest SOFT_TARGET,
 * graded exactly as the seed step grades it in that variant's slot (gradeOne at seedSlot), so the grade that picks a deck is
 * the grade it ships with; ties go to the lower grade, then the earlier candidate; variant 1 never takes variant 0's deck.
 * The floor ghosts (variant 2), the records, the ghost count (120) and every check the generator runs are unchanged.
 * THE TABLE (SOFT1_PICKS): the rule grades ~57,600 battles (~7 minutes in one process) and about 40 test files call
 * generateSamplePool(), so its 80 picks ship as a table read off the rule's own pool (kit-soft1/s1-picks.ts). The generator
 * reads the table (softPicked) and checks each pick against its deck's code hash, so a moved stand-in pool or par field
 * throws instead of shipping a stale pick: run the rule again (tests/soft1.picks.test.ts with BB_SOFT1_RULE=1 prints the
 * table), then gen:ghosts.
 * THE COMMIT FORM (RULING-SOFT1-R2): this rule, the table below with its stale checks (softStaleCheck, softPicked), and
 * tests/soft1.picks.test.ts (the world-key pin, the table's shape, every pick resolving, and the opt-in rule test).
 * THE WORLD: the table holds the shipped world's picks (SOFT1_WORLD: worldKey() with every switch on, and the bots' runes).
 * In any other world (a test's switch-off world) the decks are as before SOFT-1 (sampleEntry, raceDeck): those pools don't move.
 */
export const SOFT_TARGET = 400;

/** SOFT-1: the world SOFT1_PICKS were read in (worldKey(): the bots' runes, sustain, wave 3, HULL_SCALE, LADDER_FIX, NPC_DAY,
 *  GUARD, OPEN_RUNES, FREE_JOINS, HEARTS, PICK, SHAPES), with the par player's runes on. */
export const SOFT1_WORLD = "111111111111";

/** SOFT-1: the rule's 80 picks in SOFT1_WORLD, per hero, day 1-10: [variant 0, variant 1], each "s<i>" (the i-th entry of
 *  standInPool(hero, day)) or "f<seed>" (the par field's run of that field seed), ":" the hash of its deck's code (softHash).
 *  Read off the rule's pool by kit-soft1/s1-picks.ts (B/output-soft1/pool/C2bw/picks.json). */
export const SOFT1_PICKS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  furnace: [["f12:dbd45ce3", "f2:c0739505"], ["f1:a6ec6b45", "f2:fae160d7"], ["f11:f7db9c56", "f1:1f1273c1"], ["f8:cb1a8605", "f6:cc5fb2bc"], ["s0:467835f4", "f1:84b54dca"], ["f5:c8d0f239", "f1:b2f707ea"], ["f11:d6c4c596", "f5:f2d0d96d"], ["f5:76b63007", "f4:c0b10ab7"], ["f4:45b01e0b", "f5:2cc4e1b2"], ["f2:a0b48cd1", "f4:aa81731d"]],
  weaver: [["f1:798ba01b", "f3:a355ac5c"], ["f2:4e42387c", "f4:c72ae298"], ["f8:75ea2130", "f4:602083c1"], ["f4:469f79ed", "f2:003bfb5b"], ["f10:3caf44f0", "f3:a2983e35"], ["f10:8554750b", "f6:fb807683"], ["f9:cfda00f2", "f1:3b064aca"], ["f2:7919babf", "f9:984ce663"], ["f4:68ba45a0", "f3:5eed7c0d"], ["f4:1fb29b03", "f3:50d00a6f"]],
  foundry: [["f8:129e6069", "f11:1c69eec0"], ["f9:07206be5", "f8:65f3e9c6"], ["f6:528f8e3e", "f10:74a21852"], ["f11:d93852f5", "f10:a1e12507"], ["f4:ff811417", "f6:5b8c181d"], ["f4:97d4eb0c", "f10:5a2e15cf"], ["f10:f6ddb123", "f3:593682a9"], ["f9:0bbb3241", "f11:1877ce24"], ["f3:ca680b4a", "f11:ed1402ef"], ["f10:665bbc19", "f2:599dd867"]],
  bastion: [["f2:0a8e66de", "f6:17826ae2"], ["f12:66cc8dd4", "f3:7732863c"], ["f6:87c505c9", "f5:8d3a7a02"], ["f5:b84ce089", "f7:21ae63d4"], ["f5:30ef1282", "f10:7967cb27"], ["f10:aeffdab7", "f3:36188818"], ["f11:4392ef4c", "f5:27a85e62"], ["f3:6c44a6e9", "f6:2297ce46"], ["f11:88a0e088", "f3:693329dc"], ["f5:5cfdd713", "f9:158a179a"]],
};

/** SOFT-1: a deck code's hash in SOFT1_PICKS (8 hex digits). */
export const softHash = (code: string): string => (hashSeed("soft1-pick", code) >>> 0).toString(16).padStart(8, "0");

/** SOFT-1: is this SOFT1_PICKS' world (and the par player's runes as they were read)? */
export const softWorld = (botRunes?: boolean): boolean => worldKey() === SOFT1_WORLD && (botRunes ?? BOT_RUNES);

/** SOFT-1 (RULING-SOFT1-R2 R2.1): how SOFT1_PICKS is rebuilt; every stale message names it. */
export const SOFT1_REBUILD = "BB_SOFT1_RULE=1 npx vitest run tests/soft1.picks.test.ts (runs the rule, softDecks, and prints its table), paste the printed rows into SOFT1_PICKS and SOFT1_WORLD's worldKey() (tools/samplePool.ts), then npm run gen:ghosts";

/**
 * SOFT-1 (RULING-SOFT1-R2 R2.1 item 3, the softening never vanishes quietly): throws the stale message unless this process
 * is SOFT1_PICKS' world. A switch or rules change that moves the shipped world's worldKey() would otherwise stop the table
 * applying and ship the old, harder picks without a sound: tests/soft1.picks.test.ts calls it in the default suite, and
 * seedPoolModuleText (gen:ghosts' bundled file) calls it, so gen:ghosts refuses to write the seed pool in another world.
 */
export function softStaleCheck(): void {
  if (!softWorld()) {
    throw new Error(`SOFT-1: stale: SOFT1_PICKS was read in world ${SOFT1_WORLD} with the bots' runes on; this process is ${worldKey()} (BOT_RUNES ${BOT_RUNES}), so the softer seed picks would not apply. Re-run the pick tool: ${SOFT1_REBUILD}`);
  }
}

/** SOFT-1: a candidate's key in SOFT1_PICKS ("s<i>" or "f<seed>", ":" softHash of its code). */
export function softPickKey(hero: HeroId, day: number, deck: SoftDeck): string {
  const code = encodeStarred(deck.build);
  const key = deck.seed !== undefined ? `f${deck.seed}` : `s${standInPool(hero, day).findIndex((e) => encodeStarred(e.build) === code)}`;
  return `${key}:${softHash(code)}`;
}

/** SOFT-1: (hero, day)'s variant 0 and 1 decks from SOFT1_PICKS in its world (null in any other world: the decks as before).
 *  Throws if a pick no longer matches its deck's code hash (a stale table). */
export function softPicked(hero: HeroId, day: number, botRunes?: boolean): [SoftDeck, SoftDeck] | null {
  if (!softWorld(botRunes)) return null;
  // RUN-1 T8: a row of the scratch override (BB_SOFT1_PICKS_FILE: the rule read for a long-run day) wins, then SOFT1_PICKS'; a long
  // run's day past both takes the decks as before SOFT-1 (null: sampleEntry / raceDeck), the written fallback (R1.1)
  const row = softPickRow(hero, day);
  if (!row) {
    if (longRunRules() && day > (SOFT1_PICKS[hero]?.length ?? 0)) return null; // past the committed table's own days (10)
    throw new Error(`SOFT-1: SOFT1_PICKS holds no pick for ${hero} day ${day}`);
  }
  return [softDeckOf(hero, day, row[0], botRunes), softDeckOf(hero, day, row[1], botRunes)];
}

/** RUN-1 T8: the environment variable that names the scratch pick rows (see softPickRows). */
export const SOFT1_PICKS_FILE_ENV = "BB_SOFT1_PICKS_FILE";

/** RUN-1 T8: the scratch rows' file: JSON { world: SOFT1_WORLD, picks: { <hero>: { "<day>": [v0, v1], ... } } }, the rule's rows for the
 *  days it was run for in the long-run world, as tests/run1.seedpool.test.ts (BB_SOFT1_LONG_RULE=1) writes them. */
export interface SoftPickRows { world: string; picks: Record<string, Record<string, [string, string]>> }

const ROWS_MEMO = new Map<string, SoftPickRows>();

/**
 * RUN-1 T8 (RULING-RUN1-R1 R1.1): the scratch pick rows named by BB_SOFT1_PICKS_FILE (one path, or several joined by ",": their rows are
 * merged), or null when it is unset. This is the ONLY way rows for days past SOFT1_PICKS' enter the generator, and they are never
 * committed: SOFT1_PICKS' committed rows and SOFT1_WORLD do not change in RUN-1. A file of another world than SOFT1_WORLD is stale and
 * throws with the rebuild command; a row whose deck moved fails softDeckOf's hash check as any pick does.
 */
export function softPickRows(): SoftPickRows | null {
  const spec = process.env[SOFT1_PICKS_FILE_ENV];
  if (!spec) return null;
  let rows = ROWS_MEMO.get(spec);
  if (!rows) {
    rows = { world: SOFT1_WORLD, picks: {} };
    for (const file of spec.split(",").filter(Boolean)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as SoftPickRows;
      if (j.world !== SOFT1_WORLD || typeof j.picks !== "object" || j.picks === null) {
        throw new Error(`SOFT-1: ${SOFT1_PICKS_FILE_ENV} ${file} is not a pick-rows file of world ${SOFT1_WORLD} (world ${String(j.world)}). Re-run the rule for the long run: BB_SOFT1_LONG_RULE=1 BB_SOFT1_LONG_OUT=<file> npx vitest run tests/run1.seedpool.test.ts`);
      }
      for (const [hero, byDay] of Object.entries(j.picks)) rows.picks[hero] = { ...(rows.picks[hero] ?? {}), ...byDay };
    }
    ROWS_MEMO.set(spec, rows);
  }
  return rows;
}

/** RUN-1 T8: (hero, day)'s pick row: the scratch override's when it holds the day, else SOFT1_PICKS' committed row, else undefined. */
function softPickRow(hero: HeroId, day: number): readonly [string, string] | undefined {
  const rows = longRunRules() ? softPickRows() : null; // the long-run world's only: with the switch off the committed table, always
  const scratch = rows?.picks[hero]?.[String(day)];
  return scratch ?? SOFT1_PICKS[hero]?.[day - 1];
}

function softDeckOf(hero: HeroId, day: number, pick: string, botRunes?: boolean): SoftDeck {
  const m = /^([sf])(\d+):([0-9a-f]{8})$/.exec(pick);
  if (!m) throw new Error(`SOFT-1: bad pick "${pick}" for ${hero} day ${day}`);
  let deck: SoftDeck | undefined;
  if (m[1] === "s") {
    const e = standInPool(hero, day)[Number(m[2])];
    // RUN-1 T8: a stand-in deck of day 10 is no ghost of day 11 (standInDay clamps; one rune a dawn, validate.ts runeProblem)
    if (e && e.day !== day) throw new Error(`SOFT-1: the pick ${pick} for ${hero} day ${day} is a stand-in deck of day ${e.day} (the pool holds ${STAND_IN_POOL_DAYS} days): not a ghost of day ${day}. Re-run the rule: ${SOFT1_REBUILD}`);
    deck = e && { build: e.build, ...(e.road ? { road: e.road as RoadEntry[] } : {}) };
  } else {
    const seed = Number(m[2]), d = Math.max(1, Math.min(poolDepth(), Math.floor(day))); // RUN-1 T8: the depth, not MAX_DAY
    const days = playerRun(hero, d, seed, botRunes !== undefined ? { botRunes } : {});
    deck = { build: days[d - 1].build, seed, ...(npcDayRules() ? { road: playerRoadLog(days, d) } : {}) };
  }
  if (!deck || softHash(encodeStarred(deck.build)) !== m[3]) {
    throw new Error(`SOFT-1: stale: the pick ${pick} for ${hero} day ${day} no longer matches its deck (the stand-in pool or the par field moved). Re-run the pick tool: ${SOFT1_REBUILD}`);
  }
  return deck;
}

/** SOFT-1: a seed ghost's slot, its index in generateSamplePool()'s order (the grade's battle seeds read it). */
export function seedSlot(hero: HeroId, v: number, day: number): number {
  const s = STAND_IN_HEROES.indexOf(hero), depth = poolDepth(); // RUN-1 T8: the stride is the pool's depth (10 off, 16 under the long run)
  if (s >= 0) return (s * SAMPLE_VARIANTS + v) * depth + day - 1;
  return STAND_IN_HEROES.length * (SAMPLE_VARIANTS + 1) * depth + (RACE_SEED_HEROES.indexOf(hero) * RACE_VARIANTS + v) * depth + day - 1;
}

/** SOFT-1: a candidate seed deck: its build, its par-field run's field seed (absent for a stand-in pool entry), its road log. */
export interface SoftDeck { build: Build; seed?: number; road?: RoadEntry[] }

/** SOFT-1: (hero, day)'s candidate decks, distinct (encodeStarred), in order: a stand-in hero's stand-in pool entries
 *  (standInPool, by pct), then the par field (parSeeds(PAR_K), the par player's dusk deck of `day` from each run, with its
 *  road log), for every hero. */
export function softCandidates(hero: HeroId, day: number, botRunes?: boolean): SoftDeck[] {
  const out: SoftDeck[] = [];
  const seen = new Set<string>();
  const add = (c: SoftDeck) => { const k = encodeStarred(c.build); if (!seen.has(k)) { seen.add(k); out.push(c); } };
  if (STAND_IN_HEROES.includes(hero)) {
    // RUN-1 T8: only the entries OF the day: standInPool clamps a later day to the deepest day it holds (10), and a day-10 deck is no
    // ghost of day 11 (it holds 10 runes, a day-11 ghost 11). The 10-day world: every entry's day is `day`, exactly as before
    for (const e of standInPool(hero, day)) if (e.day === day) add({ build: e.build, ...(e.road ? { road: e.road as RoadEntry[] } : {}) });
  }
  const d = Math.max(1, Math.min(poolDepth(), Math.floor(day))); // RUN-1 T8: the depth, not MAX_DAY
  for (const seed of parSeeds(PAR_K)) {
    const days = playerRun(hero, d, seed, botRunes !== undefined ? { botRunes } : {});
    add({ build: days[d - 1].build, seed, ...(npcDayRules() ? { road: playerRoadLog(days, d) } : {}) });
  }
  return out;
}

const SOFT_MEMO = new Map<string, [SoftDeck, SoftDeck]>();

/**
 * SOFT-1 THE RULE (REQ-BFG-092): (hero, day)'s variant 0 and 1 decks: for each variant, the candidate (softCandidates) whose
 * grade is nearest SOFT_TARGET, graded exactly as the seed step grades it in that variant's slot (gradeOne at seedSlot: K
 * GRADE_K x GRADE_SEEDS seeds against the four par fields, the slot's battle seeds), so the grade that picks a deck is the
 * grade it ships with. Ties go to the lower grade, then the earlier candidate; variant 1 never takes variant 0's deck.
 * Memoised per process (worldKey() and botRunes). The generator reads its picks from SOFT1_PICKS (softPicked); this is the
 * rule that table comes from (tests/soft1.picks.test.ts, opt-in).
 */
export function softDecks(hero: HeroId, day: number, botRunes?: boolean): [SoftDeck, SoftDeck] {
  const key = `${hero}|${day}|${botRunes}|${worldKey()}${longRunRules() ? "|long" : ""}`; // RUN-1 T8: the long run's rule is its own (off: the key as before)
  const hit = SOFT_MEMO.get(key);
  if (hit) return hit;
  const cands = softCandidates(hero, day, botRunes);
  if (cands.length < SAMPLE_VARIANTS) throw new Error(`SOFT-1: ${hero} day ${day} has ${cands.length} candidate decks`);
  const pick = (v: number, not?: string): SoftDeck => {
    const gi = seedSlot(hero, v, day);
    let best: SoftDeck | undefined, bg = 0;
    for (const c of cands) {
      if (not !== undefined && encodeStarred(c.build) === not) continue;
      const g = gradeOne(c.build, day, gi, GRADE_K, GRADE_SEEDS);
      const dg = Math.abs(g - SOFT_TARGET), db = Math.abs(bg - SOFT_TARGET);
      if (best === undefined || dg < db || (dg === db && g < bg)) { best = c; bg = g; }
    }
    return best!;
  };
  const v0 = pick(0);
  const out: [SoftDeck, SoftDeck] = [v0, pick(1, encodeStarred(v0.build))];
  SOFT_MEMO.set(key, out);
  return out;
}

/** LOSS-1 P2: the casual floor run's first seed (playerRun's field-seed argument; its run seed is parRunSeed(hero, seed)):
 *  outside the par field (parSeeds(PAR_K), 1-12, the race decks' runs) and every bench's seeds (1-96), so no par-field or
 *  bench run meets its own deck. The seed LOSS-1 run 1 measured as --casual-floor (REPORT-LOSS1 section 6). */
export const CASUAL_FLOOR_SEED = 9001;
/** LOSS-1 P2: the seeds casualFloorRun tries (CASUAL_FLOOR_SEED, +1, ...) before it throws. */
export const CASUAL_FLOOR_TRIES = 16;

/** LOSS-1 P2: a hero's casual floor run: its field seed and its days 1..poolDepth() (casual.ts casualRun; RUN-1 T8: was MAX_DAY). */
export interface CasualFloor { seed: number; days: PlayerDay[] }

/**
 * LOSS-1 P2 (REQ-BFG-092; BRIEF-LOSS1-ADD2 B), NPC_DAY on: the one casual run whose dusk deck of day d is `hero`'s floor
 * ghost of day d. The seed rule: the first seed from CASUAL_FLOOR_SEED up (at most CASUAL_FLOOR_TRIES) whose deck on every
 * day 1..poolDepth() (RUN-1 T8; was MAX_DAY) differs (encodeStarred: parts, cells and stars) from every deck in `taken(day)`,
 * that day's variant 0 and 1 decks, so the floor ghost is never the same deck as another seed ghost of its hero and day and
 * all of them come from one run. casualRun is playerRun with the casual knobs, so its runs are cached per process (player.ts CACHE). `botRunes`
 * (absent: runes.ts BOT_RUNES) reaches the casual player as it reaches the race decks' par player. Throws if no seed fits.
 */
export function casualFloorRun(hero: HeroId, taken: (day: number) => ReadonlySet<string>, botRunes?: boolean): CasualFloor {
  const depth = poolDepth(); // RUN-1 T8: every day the pool holds (10 with the long run off)
  for (let seed = CASUAL_FLOOR_SEED; seed < CASUAL_FLOOR_SEED + CASUAL_FLOOR_TRIES; seed++) {
    const days = casualRun(hero, depth, seed, CASUAL_TUNE, botRunes !== undefined ? { botRunes } : {});
    if (days.every((d) => !taken(d.day).has(encodeStarred(d.build)))) return { seed, days };
  }
  throw new Error(`casual floor run ${hero}: no seed in ${CASUAL_FLOOR_SEED}-${CASUAL_FLOOR_SEED + CASUAL_FLOOR_TRIES - 1} gives ${depth} decks that differ from the day's variants 0 and 1`);
}

/** LOSS-1 P2: the floor ghost of `day` from a casual floor run: its deck, its run seed (in the v3 snapshot, as a race
 *  ghost's, so the upload check re-derives every dawn's rune offer) and its road log by that dusk. */
function casualFloorGhost(hero: HeroId, day: number, cf: CasualFloor, at: number): GhostSnapshot {
  const seed = (parRunSeed(hero, cf.seed) >>> 0) || undefined;
  return seedGhost(hero, day, FLOOR_VARIANT, cf.days[day - 1].build, floorRecord(day), at, seed, roadOf(playerRoadLog(cf.days, day)), floorLosses(day));
}

/** RUN-1 T8: the dusks a floor ghost states it lost under long-run rules: the most a run with its record (no wins, the fewest
 *  lives) can have lost (statedLosses prefers day - 1); undefined with the long run off. */
const floorLosses = (day: number): number | undefined => statedLosses(day, floorRecord(day), day - 1);

/** D5: one floor ghost per hero and day (variant FLOOR_VARIANT, its own stand-in pool deck), with floorRecord(day).
 *  `first`: its createdAt index, after the sample ghosts, so their records and ids never move. LOSS-1 P2: with NPC_DAY on,
 *  the deck is the hero's casual floor run's (casualFloorRun, distinct from the day's variants 0 and 1); o.botRunes reaches
 *  that run. Off: exactly as before (no casual run is played). RUN-1 T8: days 1..poolDepth(). */
export function floorGhosts(first = STAND_IN_HEROES.length * SAMPLE_VARIANTS * poolDepth(), o: { botRunes?: boolean } = {}): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  const depth = poolDepth();
  for (const hero of STAND_IN_HEROES) {
    // SOFT-1: the day's variant 0 and 1 decks are sampleGhosts' (SOFT1_PICKS' in its world)
    const cf = npcDayRules()
      ? casualFloorRun(hero, (day) => new Set([0, 1].map((v) => encodeStarred(sampleDeckOf(hero, day, v, o.botRunes).build))), o.botRunes)
      : null;
    for (let day = 1; day <= depth; day++) {
      if (cf) {
        out.push(casualFloorGhost(hero, day, cf, EPOCH + (first + out.length) * 1000));
        continue;
      }
      const entry = sampleEntry(hero, day, FLOOR_VARIANT, sampleSeed(hero, FLOOR_VARIANT, day)); // AZ-BUMP (N3): + its road log
      out.push(seedGhost(hero, day, FLOOR_VARIANT, entry.build, floorRecord(day), EPOCH + (first + out.length) * 1000, undefined, roadOf(entry.road), floorLosses(day)));
    }
  }
  return out;
}

/** 0.8.0 RC: the playable heroes with no stand-in decks (FOUNDRY and BASTION), whose seed ghosts come from the par
 *  player's field (raceGhosts). Every playable hero is in the seed pool: a stand-in hero through the stand-in pool, any
 *  other through this list. */
export const RACE_SEED_HEROES: readonly HeroId[] = PLAYABLE_HEROES.filter((h) => !STAND_IN_HEROES.includes(h));
/** Seed ghosts per race hero and day: as many as a stand-in hero's (SAMPLE_VARIANTS sample ghosts and one floor ghost). */
export const RACE_VARIANTS = SAMPLE_VARIANTS + 1;

/** A race seed deck and the par-field run it comes from. AZ-BUMP (N3): `road`, that run's road log by the deck's dusk
 *  (player.ts playerRoadLog; NPC_DAY on only, absent off). */
export interface RaceDeck { build: Build; seed: number; road?: RoadEntry[] }

/**
 * 0.8.0 RC: the race seed deck of (hero, day, variant v): the par player's dusk deck of `day` (playerBuild, the typical
 * policy) from the par field's run picked by hashSeed("race-seed-pool", hero, v, day) among parSeeds(PAR_K), stepped to
 * the next field seed while it is the same deck (encodeStarred) as a lower variant's deck that day. Throws if the field
 * holds fewer distinct decks than the variants need. RUNES-2a: `botRunes` (absent: runes.ts BOT_RUNES, off) has the par
 * player take a rune at each dawn (player.ts PlayerOpts.botRunes).
 */
export function raceDeck(hero: HeroId, day: number, v: number, botRunes?: boolean): RaceDeck {
  const seeds = parSeeds(PAR_K);
  const taken = new Set<string>();
  for (let u = 0; u < v; u++) taken.add(encodeStarred(raceDeck(hero, day, u, botRunes).build));
  let i = hashSeed("race-seed-pool", hero, v, day) % seeds.length;
  for (let step = 0; step < seeds.length; step++, i = (i + 1) % seeds.length) {
    // AZ-BUMP (N3): the run itself (playerBuild's deck is its dusk of `day`), for its road log
    const d = Math.max(1, Math.min(poolDepth(), Math.floor(day))); // RUN-1 T8: the depth, not MAX_DAY
    const days = playerRun(hero, d, seeds[i], botRunes !== undefined ? { botRunes } : {});
    const build = days[d - 1].build;
    if (!taken.has(encodeStarred(build))) return { build, seed: seeds[i], ...(npcDayRules() ? { road: playerRoadLog(days, d) } : {}) };
  }
  throw new Error(`race seed deck ${hero} day ${day} variant ${v}: the par field holds fewer than ${v + 1} distinct decks`);
}

/** 0.8.0 RC: the race seed ghosts, RACE_VARIANTS per RACE_SEED_HEROES hero and day: variants 0 and 1 carry a drawn record
 *  (the draws of a stand-in hero's variant 0), variant FLOOR_VARIANT the day's floor record. `first`: the createdAt index
 *  of the first one, after the stand-in heroes' sample and floor ghosts. `deckOf`: the deck source (raceDeck; tests pass
 *  their own to show that every deck goes through seedGhost's checks). LOSS-1 P2: with NPC_DAY on, variant FLOOR_VARIANT's
 *  deck is the hero's casual floor run's (casualFloorRun, distinct from the day's variant 0 and 1 decks from `deckOf`), not
 *  deckOf's; o.botRunes reaches that run. Off: exactly as before. RUN-1 T8: days 1..poolDepth(). */
export function raceGhosts(
  first = STAND_IN_HEROES.length * (SAMPLE_VARIANTS + 1) * poolDepth(), deckOf: (hero: HeroId, day: number, v: number) => RaceDeck = raceDeck,
  o: { botRunes?: boolean } = {},
): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  const p2 = npcDayRules(); // LOSS-1 P2
  const depth = poolDepth(); // RUN-1 T8
  for (const hero of RACE_SEED_HEROES) {
    const taken = new Map<number, Set<string>>(); // LOSS-1 P2: each day's variant 0 and 1 decks (encodeStarred)
    let cf: CasualFloor | undefined;
    for (let v = 0; v < RACE_VARIANTS; v++) {
      for (let day = 1; day <= depth; day++) {
        if (p2 && v === FLOOR_VARIANT) {
          // LOSS-1 P2: the casual floor run, played once per hero after every day's variants 0 and 1 are known
          cf ??= casualFloorRun(hero, (d) => taken.get(d) ?? new Set<string>(), o.botRunes);
          out.push(casualFloorGhost(hero, day, cf, EPOCH + (first + out.length) * 1000));
          continue;
        }
        const { build, seed: field, road } = deckOf(hero, day, v); // AZ-BUMP (N3): + its par run's road log
        if (p2) {
          if (!taken.has(day)) taken.set(day, new Set<string>());
          taken.get(day)!.add(encodeStarred(build));
        }
        const seed = (parRunSeed(hero, field) >>> 0) || undefined; // FLIP-X2: that par run's own run seed, in the v3 snapshot
        let rec: DuskRecord;
        let losses: number | undefined; // RUN-1 T8: long-run rules only
        if (v === FLOOR_VARIANT) {
          rec = floorRecord(day);
          losses = floorLosses(day);
        } else {
          const { wins, lost } = drawRecord(day, new Rng(sampleSeed(hero, v, day)));
          rec = drawnLabel(day, wins, lost);
          losses = statedLosses(day, rec, lost);
        }
        out.push(seedGhost(hero, day, v, build, rec, EPOCH + (first + out.length) * 1000, seed, roadOf(road), losses));
      }
    }
  }
  return out;
}

export interface CoverageGap {
  day: number;
  wins: number;
  lives: number;
  eligible: number; // seed ghosts eligible for this request under D1
}

/** D5: every reachable (day, wins, lives) at a dusk with fewer than `min` eligible ghosts in `pool` (matchmaking.ts
 *  eligible: same rules and day, another player, nothing seen yet, no better record). Empty: the pool covers them.
 *  RUN-1 T8: days 1..`depth` (default poolDepth(): 10 off, 16 under long-run rules), and the reachable states are the world's
 *  own: under long-run rules the long record model (records.ts longRunRecords, reachableRecords' first line). Days past the
 *  depth are D6's widening, not the pool's. */
export function uncoveredStates(pool: readonly GhostSnapshot[], min = MIN_ELIGIBLE, depth = poolDepth()): CoverageGap[] {
  const entries = pool.map((s) => ({ id: ghostId(s), snapshot: s }));
  const out: CoverageGap[] = [];
  for (let day = 1; day <= depth; day++) {
    for (const r of reachableRecords(day)) {
      const n = eligible(entries, { rules: RULES_VERSION, day, wins: r.wins, lives: r.lives, playerId: "coverage-check", seen: [] }).length;
      if (n < min) out.push({ day, wins: r.wins, lives: r.lives, eligible: n });
    }
  }
  return out;
}

/** The seed pool: the 40 sample ghosts, the 20 floor ghosts (FURNACE and WEAVER), then the 60 race ghosts (FOUNDRY and
 *  BASTION, 0.8.0 RC). Throws if a reachable state is not covered. RUNES-2a: o.botRunes (absent: runes.ts BOT_RUNES,
 *  off) reaches the race decks' par player (raceDeck); the stand-in heroes' decks come from the bundled stand-in pool.
 *  LOSS-1 P2: with NPC_DAY on, o.botRunes reaches the casual floor runs too (every hero's floor ghost). */
export function generateSamplePool(o: { botRunes?: boolean } = {}): GhostSnapshot[] {
  // SOFT-1: in SOFT1_PICKS' world a race hero's variant 0 and 1 decks are its picks (par-field runs); elsewhere raceDeck's
  const deckOf = (h: HeroId, d: number, v: number): RaceDeck => {
    const c = v < SAMPLE_VARIANTS ? softPicked(h, d, o.botRunes)?.[v] : undefined;
    return c ? { build: c.build, seed: c.seed!, ...(c.road ? { road: c.road } : {}) } : raceDeck(h, d, v, o.botRunes);
  };
  const races = raceGhosts(undefined, deckOf, o);
  const pool = [...sampleGhosts(o), ...floorGhosts(undefined, o), ...races];
  const gaps = uncoveredStates(pool);
  if (gaps.length) {
    throw new Error(`the seed pool leaves ${gaps.length} reachable states with fewer than ${MIN_ELIGIBLE} eligible ghosts: `
      + gaps.slice(0, 8).map((g) => `day ${g.day} ${g.wins}W ${g.lives} lives (${g.eligible})`).join(", "));
  }
  if (!pickRules()) return pool;
  // RETUNE-1 T5 (REQ-BFG-092): with PICK on, every seed ghost carries its grade (v3, written last; ghostId leaves it out)
  const grades = gradeSamplePool(pool);
  return pool.map((s, i) => ({ ...s, v: SNAPSHOT_V3, grade: grades[i] }));
}

/** RETUNE-1 T5's grade heroes: the four par fields, in tools/retune1.ts's order (so the grades are the bench's). */
const GRADE_HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

/**
 * RETUNE-1 T5 (REQ-BFG-092; cap's answer 5): each seed ghost's grade, its vsPar in permille (0..GRADE_MAX): its win rate
 * (a draw half) against the four par fields' first `k` members of its day (harness/par.ts parField), `seeds` seeds from
 * both sides (tournament.ts playJob), seeded as tools/retune1.ts --mode pool's grade was (so the pick ships as measured).
 * In-process: K 6 x 1 seed is 24 pairings x 2 battles a ghost, 5,760 battles for the 120-ghost pool.
 * HULL-ON (REQ-BFG-092; cap's ruling 9c114aab5ba18dfe): memoised per process (GRADE_MEMO below): the same grading, done
 * once; a hit returns a copy.
 */
export function gradeSamplePool(pool: readonly GhostSnapshot[], k: number = GRADE_K, seeds: number = GRADE_SEEDS): number[] {
  const key = gradeMemoKey(pool, k, seeds);
  const hit = GRADE_MEMO.get(key);
  if (hit) return hit.slice();
  const grades = gradePool(pool, k, seeds);
  GRADE_MEMO.set(key, grades.slice());
  return grades;
}

/**
 * HULL-ON (REQ-BFG-092; cap's ruling 9c114aab5ba18dfe): gradeSamplePool's per-process memo. With PICK on (the flip), every
 * generateSamplePool() grades its pool (the seed step's default bundle: seedStore, and 31 test files), ~150 s for the 120
 * ghosts, and the grading was not cached, while the par runs it reads are (player.ts CACHE): seed.test.ts and
 * ghost-admin.test.ts could no longer finish. The grading is deterministic, so it is done once a process for one key. The
 * key, made at call time, holds everything the grades read: k and seeds; the pool's ghost ids IN ORDER (the index seeds
 * the battles; ghostId hashes the snapshot without its grade, so a changed build or day misses); and the world: every
 * switch player.ts's CACHE key reads (the bots' runes, sustain, HULL_SCALE, LADDER_FIX, NPC_DAY, GUARD, OPEN_RUNES,
 * FREE_JOINS), plus wave 3, HEARTS and PICK. A missing part would serve stale grades, an extra one only re-grades. No grade
 * and no pool changes; nothing is written.
 * MERGE-099F (cap's ruling on oracle a9203a0c46474cc4): and SHAPES, last: player.ts's CACHE key reads it ("|sh") since
 * SHAPES-1 and HULL-ON met in c099, so the par fields the grades read move with it. The key only; no grade, no pool.
 */
const GRADE_MEMO = new Map<string, number[]>();

function gradeMemoKey(pool: readonly GhostSnapshot[], k: number, seeds: number): string {
  return `${k}|${seeds}|${worldKey()}${longRunRules() ? "|long" : ""}|${pool.map((s) => ghostId(s)).join(",")}`; // RUN-1 T8: "|long" only under the long run (off: the key as before)
}

/** The grade memo's world (gradeMemoKey's, unchanged): every switch the grades read. SOFT-1 C2: softDecks' memo reads it too. */
function worldKey(): string {
  return [BOT_RUNES, sustainLive(), wave3Live(), hullScaleRules(), ladderFixRules(), npcDayRules(), guardRules(),
    openRunesRules(), freeJoinsRules(), heartsRules(), pickRules(), shapesRules()].map((on) => (on ? "1" : "0")).join("");
}

/** HULL-ON (cap's ruling 9c114aab5ba18dfe): the memo's hook for tests/hullon.grademem.test.ts: its size; clear it first
 *  when `clear` is true. */
export function gradeMemo(clear = false): number {
  if (clear) GRADE_MEMO.clear();
  return GRADE_MEMO.size;
}

/** The grading itself (gradeSamplePool's body before the memo, unchanged; SOFT-1 C2: one ghost's grade is gradeOne). */
function gradePool(pool: readonly GhostSnapshot[], k: number, seeds: number): number[] {
  return pool.map((s, gi) => gradeOne(s.build, s.day, gi, k, seeds));
}

/** SOFT-1 C2: the grade of `build` on `day` in slot `gi` (gradePool's per-ghost body, moved here unchanged). */
export function gradeOne(build: Build, day: number, gi: number, k: number = GRADE_K, seeds: number = GRADE_SEEDS): number {
  let pts = 0, n = 0;
  for (const h of GRADE_HEROES) {
    parField(h, day, k).forEach((b, m) => {
      const job: Job = { a: 0, b: 1, seeds: Array.from({ length: seeds }, (_, x) => hashSeed("rt1-grade", day, gi, h, m, x)), day };
      pts += playJob([build, b], job) / (2 * seeds);
      n++;
    });
  }
  return Math.round((pts / n) * GRADE_MAX);
}

/** One canonical snapshot per line inside a JSON array (diff-friendly). */
export function samplePoolJson(pool: GhostSnapshot[] = generateSamplePool()): string {
  return "[\n" + pool.map((s) => encodeSnapshot(s)).join(",\n") + "\n]\n";
}

/** S8 T1b (REQ-BFG-092; REVIEW-R3 ruling 4): the bundled pool file's path in the repository, as gen:ghosts writes it. */
export const SEED_POOL_MODULE = "server/seedPoolData.ts";

/**
 * S8 T1b (REQ-BFG-092; REVIEW-R3 ruling 4, BRIEF-S8 T1b): the bundled pool file (SEED_POOL_MODULE) as gen:ghosts
 * (tools/genGhostPool.ts) writes it: `pool` (generateSamplePool(): with PICK on, each ghost carries the seed step's grade)
 * as samplePoolJson's lines, one canonical snapshot a line, in a data module the server bundles. The server's seed command
 * (server/seed.ts seedStore, the Fly release_command) loads, checks (checkPool, the seed step) and stores that file with no
 * battles: nothing is graded or played at boot. `"[\n" + SEED_POOL.join(",\n") + "\n]\n"` is samplePoolJson(pool) byte for
 * byte (server/seed.ts bundledSeedPoolJson; tests/s8.seedfile.test.ts pins it equal to generateSamplePool()'s output).
 */
export function seedPoolModuleText(pool: readonly GhostSnapshot[]): string {
  softStaleCheck(); // SOFT-1 (RULING-SOFT1-R2 R2.1 item 3): gen:ghosts writes the bundled seed pool only in SOFT1_PICKS' world
  const graded = pool.filter((s) => typeof s.grade === "number").length;
  return [
    "// GENERATED by `npm run gen:ghosts` (tools/genGhostPool.ts; tools/samplePool.ts seedPoolModuleText). Do not edit: run",
    "// gen:ghosts again whenever the seed pool moves (the stand-in pool, the par field, the rules) and commit this file.",
    "// S8 T1b (REQ-BFG-092; REVIEW-R3 ruling 4): the seed pool's bundled file. The server's seed command (server/seed.ts",
    "// seedStore) loads, checks (checkPool, the seed step) and stores it with no battles; with PICK on every ghost carries the",
    "// seed step's grade (tools/samplePool.ts gradeSamplePool), so nothing is graded at boot. One canonical snapshot a line:",
    "// \"[\\n\" + SEED_POOL.join(\",\\n\") + \"\\n]\\n\" is samplePoolJson(generateSamplePool()) byte for byte (tests/s8.seedfile.test.ts).",
    `// ${pool.length} ghosts, ${graded} with a grade.`,
    `export const SEED_POOL_RULES: string = ${JSON.stringify(RULES_VERSION)};`,
    "export const SEED_POOL: readonly string[] = [",
    ...pool.map((s) => `  ${JSON.stringify(encodeSnapshot(s))},`),
    "];",
    "",
  ].join("\n");
}
