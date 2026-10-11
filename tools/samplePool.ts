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
import { STAND_IN_HEROES } from "../src/net/fallback";
import { eligible } from "../src/net/matchmaking";
import { floorRecord, isReachable, reachableRecords, type DuskRecord } from "../src/net/records";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { checkSnapshot, encodeSnapshot, ghostId, MAX_DAY, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { GRADE_MAX } from "../src/net/snapshot"; // RETUNE-1 T5 (REQ-BFG-092): the grade's bound
import { GRADE_K, GRADE_SEEDS, pickRules } from "../src/net/pick"; // RETUNE-1 T5: the switch and the grade's K and seeds
import { parField } from "../src/sim/harness/par"; // RETUNE-1 T5: the grade's par fields
import { playJob, type Job } from "../src/sim/harness/tournament"; // RETUNE-1 T5: a pairing's points
import { encodeStarred, standInParIndex, standInPickIndex, standInPool, type StandInEntry } from "../src/sim/standInPool";

const EPOCH = Date.UTC(2026, 8, 23, 19, 22); // fixed, so the generated file is reproducible
const PLATE = ITEMS.plating.supply!.hull!;
const GATES = Object.values(ITEMS).filter((d) => d.kind === "gate" && d.merchant);
const MODS = Object.values(ITEMS).filter((d) => d.kind === "mod" && d.merchant);

/** sampleGhosts' variants per hero and day (0 the par, 1 a seeded pick); floorGhosts adds variant FLOOR_VARIANT. */
export const SAMPLE_VARIANTS = 2;
export const FLOOR_VARIANT = 2;
/** D5: every reachable state at every dusk has at least this many eligible seed ghosts under the record rule (D1). */
export const MIN_ELIGIBLE = 2;

const sampleSeed = (hero: HeroId, v: number, day: number): number => hashSeed("sample-pool", hero, v, day);

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
  const same = reachableRecords(day).filter((r) => r.wins === wins);
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
  for (let d = day - lost; d < day; d++) {
    const r = heartsDusk(h, d, "loss", lc);
    h = r.hearts;
    lc = lc || r.lastChance;
  }
  return reachableLabel(day, wins, Math.max(1, h));
}

/** One seed ghost, checked: the strict shop rules and the player mode (D5), and a reachable label. FLIP-X2 (RUNES-2a
 *  section 3 step 4; BOTSX-REPORT section 9): a deck that holds runes travels as a v3 snapshot (Build.runes is v3 only),
 *  carrying the run seed when the deck's run is known (`seed`: a race ghost's par-field run), so the upload check
 *  re-derives every dawn's offer; a stand-in pool deck stores no run seed, so its ghost carries none (the count rule
 *  still holds it to one rune a dawn). A rune-less deck is v2 exactly as before. AZ-BUMP (REQ-BFG-078; REVIEW-PARAZ N3):
 *  `road`, its run's road log (NPC_DAY on only; see the header), travels in a v3 snapshot's `road` and goes to the
 *  player-mode check as ctx.road, as an upload's does; and the strict check's budget line is left to that check. */
function seedGhost(hero: HeroId, day: number, v: number, build: Build, rec: DuskRecord, at: number, seed?: number, road?: RoadEntry[]): GhostSnapshot {
  const runes = (build.runes?.length ?? 0) > 0;
  const snap = checkSnapshot({
    // v2: pool decks carry stars (the 0.6.1 flip) and rigs their `rot` (0.6.2 BELTSIDE, DESIGN-beltside D1)
    // AZ-BUMP (N3): a road log is v3 only (snapshot.ts roadField), written last
    v: runes || road ? SNAPSHOT_V3 : SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day, wins: rec.wins, lives: rec.lives, build,
    runId: `sample-run-${hero}-${v}`, playerId: `sample-${hero}-${v}`, createdAt: at,
    ...(runes && seed !== undefined ? { seed } : {}),
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
  if (!isReachable(day, snap.wins, snap.lives)) throw new Error(`sample ghost ${hero} v${v} day ${day}: ${snap.wins}W ${snap.lives} lives is not a record a run can carry into that dusk`);
  return snap;
}

/** The 40 sample ghosts: variants 0 and 1 of each hero and day. */
export function sampleGhosts(): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  for (const hero of STAND_IN_HEROES) {
    for (let v = 0; v < SAMPLE_VARIANTS; v++) {
      for (let day = 1; day <= MAX_DAY; day++) {
        const seed = sampleSeed(hero, v, day);
        const rng = new Rng(seed);
        if (v === 1) shopper(hero, day, rng); // replay the retired shopper's draws: records unchanged
        const entry = sampleEntry(hero, day, v, seed); // AZ-BUMP (N3): the deck and its run's road log
        const wins = rng.int(day);
        out.push(seedGhost(hero, day, v, entry.build, drawnLabel(day, wins, rng.int(day - wins)), EPOCH + out.length * 1000, undefined, roadOf(entry.road)));
      }
    }
  }
  return out;
}

/** LOSS-1 P2: the casual floor run's first seed (playerRun's field-seed argument; its run seed is parRunSeed(hero, seed)):
 *  outside the par field (parSeeds(PAR_K), 1-12, the race decks' runs) and every bench's seeds (1-96), so no par-field or
 *  bench run meets its own deck. The seed LOSS-1 run 1 measured as --casual-floor (REPORT-LOSS1 section 6). */
export const CASUAL_FLOOR_SEED = 9001;
/** LOSS-1 P2: the seeds casualFloorRun tries (CASUAL_FLOOR_SEED, +1, ...) before it throws. */
export const CASUAL_FLOOR_TRIES = 16;

/** LOSS-1 P2: a hero's casual floor run: its field seed and its days 1..MAX_DAY (casual.ts casualRun). */
export interface CasualFloor { seed: number; days: PlayerDay[] }

/**
 * LOSS-1 P2 (REQ-BFG-092; BRIEF-LOSS1-ADD2 B), NPC_DAY on: the one casual run whose dusk deck of day d is `hero`'s floor
 * ghost of day d. The seed rule: the first seed from CASUAL_FLOOR_SEED up (at most CASUAL_FLOOR_TRIES) whose deck on every
 * day 1..MAX_DAY differs (encodeStarred: parts, cells and stars) from every deck in `taken(day)`, that day's variant 0 and
 * 1 decks, so the floor ghost is never the same deck as another seed ghost of its hero and day and all ten come from one
 * run. casualRun is playerRun with the casual knobs, so its runs are cached per process (player.ts CACHE). `botRunes`
 * (absent: runes.ts BOT_RUNES) reaches the casual player as it reaches the race decks' par player. Throws if no seed fits.
 */
export function casualFloorRun(hero: HeroId, taken: (day: number) => ReadonlySet<string>, botRunes?: boolean): CasualFloor {
  for (let seed = CASUAL_FLOOR_SEED; seed < CASUAL_FLOOR_SEED + CASUAL_FLOOR_TRIES; seed++) {
    const days = casualRun(hero, MAX_DAY, seed, CASUAL_TUNE, botRunes !== undefined ? { botRunes } : {});
    if (days.every((d) => !taken(d.day).has(encodeStarred(d.build)))) return { seed, days };
  }
  throw new Error(`casual floor run ${hero}: no seed in ${CASUAL_FLOOR_SEED}-${CASUAL_FLOOR_SEED + CASUAL_FLOOR_TRIES - 1} gives ${MAX_DAY} decks that differ from the day's variants 0 and 1`);
}

/** LOSS-1 P2: the floor ghost of `day` from a casual floor run: its deck, its run seed (in the v3 snapshot, as a race
 *  ghost's, so the upload check re-derives every dawn's rune offer) and its road log by that dusk. */
function casualFloorGhost(hero: HeroId, day: number, cf: CasualFloor, at: number): GhostSnapshot {
  const seed = (parRunSeed(hero, cf.seed) >>> 0) || undefined;
  return seedGhost(hero, day, FLOOR_VARIANT, cf.days[day - 1].build, floorRecord(day), at, seed, roadOf(playerRoadLog(cf.days, day)));
}

/** D5: one floor ghost per hero and day (variant FLOOR_VARIANT, its own stand-in pool deck), with floorRecord(day).
 *  `first`: its createdAt index, after the sample ghosts, so their records and ids never move. LOSS-1 P2: with NPC_DAY on,
 *  the deck is the hero's casual floor run's (casualFloorRun, distinct from the day's variants 0 and 1); o.botRunes reaches
 *  that run. Off: exactly as before (no casual run is played). */
export function floorGhosts(first = STAND_IN_HEROES.length * SAMPLE_VARIANTS * MAX_DAY, o: { botRunes?: boolean } = {}): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  for (const hero of STAND_IN_HEROES) {
    const cf = npcDayRules()
      ? casualFloorRun(hero, (day) => new Set([0, 1].map((v) => encodeStarred(sampleDeck(hero, day, v, sampleSeed(hero, v, day))))), o.botRunes)
      : null;
    for (let day = 1; day <= MAX_DAY; day++) {
      if (cf) {
        out.push(casualFloorGhost(hero, day, cf, EPOCH + (first + out.length) * 1000));
        continue;
      }
      const entry = sampleEntry(hero, day, FLOOR_VARIANT, sampleSeed(hero, FLOOR_VARIANT, day)); // AZ-BUMP (N3): + its road log
      out.push(seedGhost(hero, day, FLOOR_VARIANT, entry.build, floorRecord(day), EPOCH + (first + out.length) * 1000, undefined, roadOf(entry.road)));
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
    const d = Math.max(1, Math.min(MAX_DAY, Math.floor(day)));
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
 *  deckOf's; o.botRunes reaches that run. Off: exactly as before. */
export function raceGhosts(
  first = STAND_IN_HEROES.length * (SAMPLE_VARIANTS + 1) * MAX_DAY, deckOf: (hero: HeroId, day: number, v: number) => RaceDeck = raceDeck,
  o: { botRunes?: boolean } = {},
): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  const p2 = npcDayRules(); // LOSS-1 P2
  for (const hero of RACE_SEED_HEROES) {
    const taken = new Map<number, Set<string>>(); // LOSS-1 P2: each day's variant 0 and 1 decks (encodeStarred)
    let cf: CasualFloor | undefined;
    for (let v = 0; v < RACE_VARIANTS; v++) {
      for (let day = 1; day <= MAX_DAY; day++) {
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
        if (v === FLOOR_VARIANT) rec = floorRecord(day);
        else {
          const rng = new Rng(sampleSeed(hero, v, day));
          const wins = rng.int(day);
          rec = drawnLabel(day, wins, rng.int(day - wins));
        }
        out.push(seedGhost(hero, day, v, build, rec, EPOCH + (first + out.length) * 1000, seed, roadOf(road)));
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
 *  eligible: same rules and day, another player, nothing seen yet, no better record). Empty: the pool covers them. */
export function uncoveredStates(pool: readonly GhostSnapshot[], min = MIN_ELIGIBLE): CoverageGap[] {
  const entries = pool.map((s) => ({ id: ghostId(s), snapshot: s }));
  const out: CoverageGap[] = [];
  for (let day = 1; day <= MAX_DAY; day++) {
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
  const races = o.botRunes === undefined ? raceGhosts() : raceGhosts(undefined, (h, d, v) => raceDeck(h, d, v, o.botRunes), o);
  const pool = [...sampleGhosts(), ...floorGhosts(undefined, o), ...races];
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
 */
export function gradeSamplePool(pool: readonly GhostSnapshot[], k: number = GRADE_K, seeds: number = GRADE_SEEDS): number[] {
  return pool.map((s, gi) => {
    let pts = 0, n = 0;
    for (const h of GRADE_HEROES) {
      parField(h, s.day, k).forEach((b, m) => {
        const job: Job = { a: 0, b: 1, seeds: Array.from({ length: seeds }, (_, x) => hashSeed("rt1-grade", s.day, gi, h, m, x)), day: s.day };
        pts += playJob([s.build, b], job) / (2 * seeds);
        n++;
      });
    }
    return Math.round((pts / n) * GRADE_MAX);
  });
}

/** One canonical snapshot per line inside a JSON array (diff-friendly). */
export function samplePoolJson(pool: GhostSnapshot[] = generateSamplePool()): string {
  return "[\n" + pool.map((s) => encodeSnapshot(s)).join(",\n") + "\n]\n";
}
