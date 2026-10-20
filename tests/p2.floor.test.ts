// LOSS-1 P2 (REQ-BFG-092; REVIEW-LOSS1 Q1, BRIEF-LOSS1-ADD2 B): the seed pool's floor ghosts carry the casual player's
// decks, behind NPC_DAY (tools/samplePool.ts casualFloorRun). With NPC_DAY off, generateSamplePool() is byte for byte
// 283cfaf's (the sha256 of its JSON, measured at 283cfaf and at P2's tip in the same host minute: LOSS-1
// output-loss1/p2/p2hash-*.txt). With the hull release's switches on (NPC_DAY, HULL_SCALE and LADDER_FIX), every floor
// ghost (variant 2) is its hero's casual deck (casual.ts casualRun, CASUAL_TUNE) of its day from ONE casual run per hero,
// travels as v3 with that run's road log and run seed, keeps floorRecord(day), its playerId, runId and createdAt, differs
// from the day's variants 0 and 1, and the pool passes the seed step (server/seed.ts checkPool); two calls give equal
// output. The switches are set through their own setters and all put back off after each test.
// S8 (RULING-S8-R6): the NPC_DAY-off half is the race heroes' 60 (raceGhosts), the stand-in pool left out (see
// POOL_OFF_SHA256's comment).
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { setHullScale } from "../src/sim/hullScale";
import { ladderFixRules, setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";
import { setShapes } from "../src/sim/shapes";
import { encodeStarred } from "../src/sim/standInPool";
import { CASUAL_TUNE, casualRun } from "../src/sim/harness/casual";
import { parRunSeed, playerRoadLog } from "../src/sim/harness/player";
import { floorRecord } from "../src/net/records";
import { MAX_DAY, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { checkPool } from "../server/seed";
import {
  CASUAL_FLOOR_SEED, CASUAL_FLOOR_TRIES, FLOOR_PICKS, FLOOR_VARIANT, RACE_SEED_HEROES, RACE_VARIANTS, SAMPLE_VARIANTS, floorHash,
  raceDeck, softPicked, type RaceDeck, // BUMP-1D: + FLOOR_PICKS, floorHash and the shipped pool's parts
} from "../tools/samplePool";
import { floorGhosts, generateSamplePool, raceGhosts, sampleGhosts, softDeckOf } from "./helpers/poolCache"; // CACHE-1: the cached twins, and the generator's own deckOf (the copy below was this function)
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content"; // BUMP-1D: ITEMS (bb0100 puts its key order back); BUMP-1E: RULES_VERSION (the string the old pools' digests put back)
import { SCALE_RIGS, scaleRules, setScaleRigs, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling rules ship on (the bb-0.10.0 and bb-0.11.0 worlds are read with them off)
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip): the five switches, through their own with..()
import { LONG_RUN_GEN_DAYS, withLongRun } from "../src/sim/longRun"; // BUMP-1D: LONG_RUN, PLAIN_RIGS and SHAPES2 ship on; the bb-0.10.0 world is read with them off
import { withPlainRigs } from "../src/sim/plainRigs";
import { withShapes2 } from "../src/sim/shapes2";
import { withGuard } from "../src/sim/guard";
import { withPick } from "../src/net/pick";
import { withOpenRunes } from "../src/sim/openRunes";
import { withFreeJoins } from "../src/sim/freeJoins";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// SHAPES-1 flip (step 8): SHAPES joins "every switch": off in allOff (283cfaf's world had no shaped piece), on in allOn
// S8 (RULING-S8-R4 item 3; the cause: the pools): allOff keeps SHAPES ON. The one stand-in pool (S8's P1 83c039d) holds
// SHAPES-1's shaped pieces, which a SHAPES-off world can't decode (standInPool.ts: `stand-in code: bad item ...`), so this
// test's off world is the other eight switches off and SHAPES on (was setShapes(false) since SHAPES-1's flip step 8)
// BUMP-1E (the scaling rules ship on: SCALE_RIGS, bb-0.12.0): ladderFix.ts swaps ITEMS.quench to its fixed or base def WHATEVER the scaling switch says (it knows nothing of scale.ts), so a
// LADDER_FIX flip with the scaling rules on leaves the old QUENCH TANK where KINDLING stands (measured: setLadderFix(false) then (true) with the switch on: ITEMS.quench is QUENCH TANK
// ★1 40 a BURN, scaleRules() true, until the scaling switch is flipped off and on again), and every deck the par player builds after it, the SOFT-1 and FLOOR picks' included, reads that
// half-world ('SOFT-1: stale: the pick f2:891a3488 for furnace day 7 no longer matches its deck'). So a flip of the switches below is made with the scaling switch OFF, and the scaling
// switch comes back last, writing KINDLING (the seven ids are the last keys in ITEMS, the same rule as the ITEMS key-order hazard)
const scalingLast = (flip: () => void): void => {
  const was = scaleRules();
  setScaleRigs(false);
  try { flip(); } finally { setScaleRigs(was); }
};
const allOff = (): void => scalingLast(() => { setNpcDay(false); setHullScale(false); setLadderFix(false); setShapes(true); });
const allOn = (): void => scalingLast(() => { setNpcDay(true); setHullScale(true); setLadderFix(true); setShapes(true); });
afterEach(allOff);
/** BUMP-1E: `fn` in the world before the scaling rules (bb-0.11.0's and bb-0.10.0's catalogue: none of the seven, the five reworks as they were): the scaling switch OFF, the OUTERMOST call of any nest
 *  (off first, back last), SYNCHRONOUS only. scale.ts's swap off writes QUENCH TANK as it held it when it first swapped, the ladder-FIXED def (★1 40 a BURN), so with LADDER_FIX off (the off worlds of
 *  this file) the BASE def (★1 30) is written back by flipping the ladder switch to the other state and back, inside the call. Measured: without it the NPC_DAY-off pool of the shipped long run
 *  (below) reads b3b7d344b87c..., with it 3a5f3e16491c... = BUMP-1D's pin exactly: QUENCH TANK's ★1 reaches the par player's decks */
const scalingOff = <T>(fn: () => T): T => withScaleRigs(() => {
  const lf = ladderFixRules();
  setLadderFix(!lf);
  setLadderFix(lf);
  return fn();
}, false);

/** sha256 of JSON.stringify(generateSamplePool()) with every switch off at 283cfaf, the hull release's work tip before P2
 *  (LOSS-1 run 2, 05:17-05:20Z 2026-10-11: the same at 283cfaf and at P2's tip). The stand-in pool's regeneration (AZ-BUMP
 *  S8) moves it, as it moves rc.seedpool's digests. */
// AZ-BUMP S7L (BRIEF-AZBUMP-S8L step 3; the cause: AZ-BUMP's bump, 00af45d): every seed ghost carries rules: RULES_VERSION
// (samplePool.ts), now bb-0.10.0, so the off pool's JSON moved with the rules string alone: with bb-0.9.7 put back in its
// 120 "rules" fields it is 9599ba92e8f46913... exactly, 283cfaf's (kit-azbump probes/zz-p2off). Re-pinned to H_off,
// the off pool at S7's tip 05021ce and at the merge (p2hash.sh); was 9599ba92e8f46913...
// S8 (RULING-S8-R4 items 3-4; the cause: "the pools: the one stand-in pool holds SHAPES-1's shaped pieces, which a SHAPES-off
// world can't decode; the kit's simfp leaves the pool out where SHAPES is off, and p2.floor's off world keeps SHAPES on;
// RULING-S8-R4"): now the sha256 of generateSamplePool()'s JSON with SHAPES on and the other eight switches off (flipOff's five
// too), measured at the tip it landed on (S8 run 2b, on 92f1948's tree: P1 83c039d's stand-in pool); was 3057141f793eb6c0...
// (every switch off, SHAPES too, on the bb-0.9.7 stand-in pool). 283cfaf's digest above stays as history.
// S8 (RULING-S8-R6 items 2, 3 and 6; the cause: "the pools: the one stand-in pool is road-fed (generated with NPC_DAY on, as
// shipped), so an NPC_DAY-off world can't build a seed ghost from it; p2.floor's NPC_DAY-off half is the race heroes' 60
// (raceGhosts), the stand-in pool left out; RULING-S8-R6"): R4's SHAPES-on generateSamplePool() digest was never measured
// (its sampleGhosts throw seedGhost's strict budget line on a road-fed pick: "sample ghost furnace v0 day 1 is invalid:
// budget: ..."). Now the sha256 of JSON.stringify of raceGhosts()'s output in that world (the race heroes' 60, FOUNDRY and
// BASTION, the par field's decks; the stand-in pool left out), measured at the tip it landed on (S8 run 3,
// kit-s8/p2pin.sh); was 3057141f793eb6c0... (120 ghosts). 283cfaf's digest above stays as history too.
// BUMP-1D (the bump to bb-0.11.0: LONG_RUN, PLAIN_RIGS and SHAPES2 ship on, the catalogue grew by twelve pieces, every ghost says rules bb-0.11.0): the
// digest above is the bb-0.10.0 world's, so it is read there (the 10-day run, PLAIN_RIGS and SHAPES2 off, the rules string put back to bb-0.10.0 as AZ-BUMP
// S7L did for bb-0.9.7) under the name POOL_OFF_SHA256_BB0100; the shipped world's NPC_DAY-off pool (the long run, days 1-16, 96 race ghosts) has its own,
// POOL_OFF_SHA256, measured at the tip it landed on (BUMP-1D run 3; the stand-in pool and the picks are not in it: it is raceGhosts() alone)
// BUMP-1E (the bump to bb-0.12.0: the scaling rules ship on, the seven scaling rigs and the five reworks, every ghost says rules bb-0.12.0): the shipped world's digest above moved, so the old one is
// read where it was measured, in the bb-0.11.0 world (the scaling rules off, the rules string put back to bb-0.11.0) under the name POOL_OFF_SHA256_BB0110, and holds exactly there (the test
// after the shipped one: it is the proof that the scaling world and the rules string alone moved it); the shipped bb-0.12.0 world's NPC_DAY-off pool has its own, POOL_OFF_SHA256 below,
// measured at the tip it landed on (BUMP-1E run 5; raceGhosts() alone: the stand-in pool and the picks are not in it)
const POOL_OFF_SHA256_BB0100 = "e9accebca818eed8c3455328e1b52731a3cad4b2505272d6a526dd992494afca";
const POOL_OFF_SHA256_BB0110 = "3a5f3e16491c3e79079b7e71e59883c3747a595e0341bd40642b710125ec40e6"; // BUMP-1E: BUMP-1D's POOL_OFF_SHA256, read in the bb-0.11.0 world
const POOL_OFF_SHA256 = "2bc4a2fdd1b148a9cab75e606934f42e4a1d958c35d8f1c86bbdbb9143cf560a"; // BUMP-1E: was 3a5f3e16491c3e79079b7e71e59883c3747a595e0341bd40642b710125ec40e6 (the bb-0.11.0 world)
/** BUMP-1D: `fn` in the bb-0.10.0 world: the 10-day run, without PLAIN_RIGS and SHAPES2 (each put back after it, even on a throw). */
// Turning PLAIN_RIGS and SHAPES2 off and on again re-inserts their twelve pieces at the end of ITEMS (plainRigs.ts setPlainRigs, shapes2.ts setShapes2), in the
// other order when SHAPES2 comes back first, and the shop's picks walk the catalogue in key order: a pool built after the toggle differs from one built before it
// in the same process (found by this file: the shipped-world digest and the CHOSEN floor test's SOFT-1 picks went stale after the bb-0.10.0 test). So the
// catalogue's key order is put back exactly as it was.
// BUMP-1E (the scaling rules ship on): the bb-0.10.0 world has none of the seven scaling rigs and none of the five reworks, so the scaling switch is the OUTERMOST call of the nest
// (off first, back last: the seven are the last keys in ITEMS, and its swap back writes KINDLING over any ladder flip's QUENCH TANK: see scalingLast)
const bb0100 = <T>(fn: () => T): T => {
  const items = ITEMS as Record<string, (typeof ITEMS)[string]>;
  const order = Object.keys(items);
  try {
    return scalingOff(() => withLongRun(() => withPlainRigs(() => withShapes2(fn, false), false), false));
  } finally {
    const all = { ...items };
    for (const id of order) { delete items[id]; items[id] = all[id]; }
  }
};
const variantOf = (s: GhostSnapshot) => Number(s.playerId.slice(-1));
const label = (s: GhostSnapshot) => [s.hero, s.day, s.playerId, s.runId, s.createdAt, s.wins, s.lives, s.rules];

const offPools: { ten?: GhostSnapshot[]; long?: GhostSnapshot[] } = {};
/** HULL-ON (the flip, PICK; cap's ruling 22e26ded338944ea Q4): the second test's pool builds run with PICK off (withPick(..,
 *  false)): that test reads no grade, and no value a grade moves (the labels, records, decks, road logs, seeds and
 *  checkPool's count; samplePool.ts adds the grade last, after the labels and the coverage check, and the floor ghosts are
 *  v3 either way). So it no longer pays two full gradings (one per NPC_DAY world; the per-process memo keys the world).
 *  Proved once: the test passes with this wrapper and without it (output-hullon/logs/r4-p2*; run 2's qrun last-p2.floor) */
const ungradedPool = (): GhostSnapshot[] => withPick(() => generateSamplePool(), false);
/** S8 (RULING-S8-R6 item 4; the cause: the pools, as POOL_OFF_SHA256's comment says): the off labels' world is as before (the
 *  shipped world with NPC_DAY, HULL_SCALE and LADDER_FIX off, SHAPES on, PICK off), but its pool is the NPC_DAY-off half
 *  alone: raceGhosts() (the race heroes' 60), the stand-in pool left out (was ungradedPool(), the whole seed pool, which
 *  that world can't build from the road-fed stand-in pool). Cached as before. */
// BUMP-1D: per world (`long`: the shipped long run, days 1-16, 96 race ghosts; else the 10-day run, days 1-10, 60), cached as before
const poolOff = (long: boolean): GhostSnapshot[] => {
  allOff();
  const key = long ? "long" : "ten";
  offPools[key] ??= withLongRun(() => withPick(() => raceGhosts(), false), long); // HULL-ON (PICK; ruling 22e26ded338944ea Q4): reads no grade
  return offPools[key]!;
};
/** HULL-ON (the flip, HEARTS, GUARD, PICK, OPEN_RUNES, FREE_JOINS): `fn` with the flip's five switches off too, each put
 *  back after it, even on a throw: the world POOL_OFF_SHA256 was measured in (283cfaf, S7's tip 05021ce: every switch off). */
const flipOff = <T>(fn: () => T): T =>
  withHearts(() => withGuard(() => withPick(() => withOpenRunes(() => withFreeJoins(fn, false), false), false), false), false);

describe("LOSS-1 P2: the seed pool's floor ghosts carry the casual player's decks, behind NPC_DAY", () => {
  it("NPC_DAY off (SHAPES on, the other eight off: RULING-S8-R4), the bb-0.10.0 world (LONG_RUN, PLAIN_RIGS and SHAPES2 off): the race heroes' 60; the stand-in pool left out (RULING-S8-R6): every floor deck comes from the par field (no casual run is played), no road log, and raceGhosts() is byte for byte the pinned off pool", () => {
    // BUMP-1D: this is the test as it was at bb-0.10.0, run in that world (bb0100: the 10-day run, without PLAIN_RIGS and SHAPES2); the only change is
    // the rules string: every ghost says bb-0.11.0 now, and the pin is bb-0.10.0's, so the digest is taken with the string put back (AZ-BUMP S7L's way).
    // The shipped world's twin is the next test.
    // HULL-ON (the flip, HEARTS, GUARD, PICK, OPEN_RUNES, FREE_JOINS): the digest's pool is every switch off, the flip's
    // five too (was poolOff(), which keeps them on as shipped: PICK writes each ghost's grade in v3, HEARTS labels the
    // records in hearts, and GUARD, OPEN_RUNES and FREE_JOINS move the par player's decks, the race ghosts' source). The
    // second test's off labels stay poolOff()'s: the shipped world with NPC_DAY off
    // S8 (RULING-S8-R6 items 2-3; the cause: the pools, as POOL_OFF_SHA256's comment says): this test proves NPC_DAY itself,
    // so its NPC_DAY-off half leaves the stand-in pool out (RULING-S8-R4 item 5's second way). That half is raceGhosts():
    // FOUNDRY and BASTION, the par field's decks, built in this world; its default `first` (60) keeps their createdAt and ids
    // as in the full pool. The direct check goes through raceGhosts' own deckOf seam: a deckOf that records each call and
    // returns raceDeck's. Every (race hero, day 1-10, FLOOR_VARIANT) must be among the calls, so every floor deck came from
    // the par field and no casual run was played (with NPC_DAY on, the casual branch never calls deckOf for FLOOR_VARIANT).
    allOff();
    const calls: string[] = [];
    const race = bb0100(() => flipOff(() => raceGhosts(undefined, (hero, day, v) => {
      calls.push(`${hero} d${day} v${v}`);
      return raceDeck(hero, day, v);
    })));
    expect(race).toHaveLength(RACE_SEED_HEROES.length * RACE_VARIANTS * MAX_DAY); // 60
    for (const hero of RACE_SEED_HEROES) {
      for (let day = 1; day <= MAX_DAY; day++) expect(calls, `${hero} d${day}: its floor deck from the par field`).toContain(`${hero} d${day} v${FLOOR_VARIANT}`);
    }
    expect(race.filter((s) => s.road !== undefined).map((s) => `${s.hero} d${s.day} ${s.playerId}`), "no ghost carries a road log").toEqual([]);
    // the digest goes last, so kit-s8/p2pin.sh's measure still prints it
    // BUMP-1E: every ghost says this build's rules now (bb-0.12.0; was bb-0.11.0): put back to bb-0.10.0 the same way (was replaceAll('"rules":"bb-0.11.0"', ...))
    expect(sha(JSON.stringify(race).replaceAll(`"rules":"${RULES_VERSION}"`, '"rules":"bb-0.10.0"'))).toBe(POOL_OFF_SHA256_BB0100);
  }, 900_000); // 68 s under LOSS-1's 1.5-CPU quota (the whole off pool, before RULING-S8-R6)

  it("NPC_DAY off in the shipped world (LONG_RUN, PLAIN_RIGS and SHAPES2 on; HULL_SCALE and LADDER_FIX off too): the race heroes' 96 over days 1-16, every floor deck from the par field, no road log, each stating its losses, and raceGhosts() is byte for byte the pinned off pool", () => {
    // BUMP-1D: the shipped world's NPC_DAY-off half: raceGhosts() with NPC_DAY, HULL_SCALE and LADDER_FIX off (SHAPES on) and the other switches as shipped
    // (HEARTS, GUARD, PICK, OPEN_RUNES and FREE_JOINS on: poolOff(true)'s world), 2 race heroes x 3 variants x 16 days
    allOff();
    const calls: string[] = [];
    const race = raceGhosts(undefined, (hero, day, v) => {
      calls.push(`${hero} d${day} v${v}`);
      return raceDeck(hero, day, v);
    });
    expect(race).toHaveLength(RACE_SEED_HEROES.length * RACE_VARIANTS * LONG_RUN_GEN_DAYS); // 96
    for (const hero of RACE_SEED_HEROES) {
      for (let day = 1; day <= LONG_RUN_GEN_DAYS; day++) expect(calls, `${hero} d${day}: its floor deck from the par field`).toContain(`${hero} d${day} v${FLOOR_VARIANT}`);
    }
    expect(race.filter((s) => s.road !== undefined).map((s) => `${s.hero} d${s.day} ${s.playerId}`), "no ghost carries a road log").toEqual([]);
    expect(race.filter((s) => s.losses === undefined).map((s) => `${s.hero} d${s.day} ${s.playerId}`), "every ghost states its losses").toEqual([]);
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the shipped world has the scaling rules on (was false: the bb-0.11.0 world)
    expect(scaleRules()).toBe(true);
    // BUMP-1E: the shipped world's pool: the seven scaling rigs are in the catalogue the par player draws its shop from, the five reworks are reworked (KINDLING over QUENCH TANK) and every ghost
    // says bb-0.12.0 (the regenerated catalogue draw; was 3a5f3e16...)
    expect(sha(JSON.stringify(race))).toBe(POOL_OFF_SHA256);
  }, 900_000);

  it("the same NPC_DAY-off pool in the bb-0.11.0 world (the scaling rules off, the rules string put back to bb-0.11.0): byte for byte the pin it was at bb-0.11.0", () => {
    // BUMP-1E: the proof for the test above. Only the world moved its digest: with the scaling switch off (SYNCHRONOUS call; it comes back on after) and each ghost's rules string put back,
    // raceGhosts() of the shipped long run (LONG_RUN, PLAIN_RIGS and SHAPES2 on; NPC_DAY, HULL_SCALE and LADDER_FIX off) is BUMP-1D's pin exactly
    allOff();
    const race = scalingOff(() => raceGhosts());
    expect(race).toHaveLength(RACE_SEED_HEROES.length * RACE_VARIANTS * LONG_RUN_GEN_DAYS); // 96
    expect(sha(JSON.stringify(race).replaceAll(`"rules":"${RULES_VERSION}"`, '"rules":"bb-0.11.0"'))).toBe(POOL_OFF_SHA256_BB0110);
    expect(scaleRules()).toBe(true); // and the switch is back
  }, 900_000);

  it("NPC_DAY on, the bb-0.10.0 10-day pool (LONG_RUN off): every floor ghost is its hero's casual deck of its day from one casual run (the first qualifying seed), with its road log, floorRecord(day) and its old labels; distinct from variants 0 and 1; the pool passes checkPool", () => withLongRun(() => {
    // BUMP-1D: the test as it was, in the 10-day world explicitly (withLongRun(fn, false)): 120 ghosts over days 1-10, the first qualifying seed from CASUAL_FLOOR_SEED.
    // The shipped long world's floor ghosts are the CHOSEN casual runs (FLOOR_PICKS): the next test
    const labels = poolOff(false).map(label);
    allOn();
    const pool = ungradedPool(); // HULL-ON (PICK; ruling 22e26ded338944ea Q4): reads no grade
    expect(pool).toHaveLength(120);
    // records, playerIds, runIds, createdAt and their order exactly as with the switch off. S8 (RULING-S8-R6 item 4; the
    // cause: the pools, as POOL_OFF_SHA256's comment says): for the race ghosts (RACE_SEED_HEROES, in order), against the
    // NPC_DAY-off half (poolOff(): raceGhosts() alone); the stand-in heroes' 60 drop out of the label comparison (was the
    // whole pool's 120 labels). Every on-world check below stays as it was.
    expect(pool.filter((s) => RACE_SEED_HEROES.includes(s.hero)).map(label)).toEqual(labels);
    const floor = pool.filter((s) => variantOf(s) === FLOOR_VARIANT);
    expect(floor).toHaveLength(PLAYABLE_HEROES.length * MAX_DAY);
    for (const hero of PLAYABLE_HEROES) {
      const mine = floor.filter((s) => s.hero === hero);
      expect(mine.map((s) => s.day), hero).toEqual(Array.from({ length: MAX_DAY }, (_, i) => i + 1));
      // ONE casual run per hero: one run seed on all ten, the first seed from CASUAL_FLOOR_SEED up that fits (the seed rule)
      expect(new Set(mine.map((s) => s.seed)).size, hero).toBe(1);
      let k = 0;
      while (k < CASUAL_FLOOR_TRIES && (parRunSeed(hero, CASUAL_FLOOR_SEED + k) >>> 0) !== mine[0].seed) k++;
      expect(k, `${hero}: its run seed is a casual floor seed`).toBeLessThan(CASUAL_FLOOR_TRIES);
      const others = (day: number) => new Set(pool.filter((s) => s.hero === hero && s.day === day && variantOf(s) !== FLOOR_VARIANT).map((s) => encodeStarred(s.build)));
      for (let j = 0; j < k; j++) {
        const lower = casualRun(hero, MAX_DAY, CASUAL_FLOOR_SEED + j, CASUAL_TUNE);
        expect(lower.some((d) => others(d.day).has(encodeStarred(d.build))), `${hero}: seed ${CASUAL_FLOOR_SEED + j} skipped for a repeat`).toBe(true);
      }
      const days = casualRun(hero, MAX_DAY, CASUAL_FLOOR_SEED + k, CASUAL_TUNE);
      for (const s of mine) {
        const at = `${hero} d${s.day}`;
        expect(s.build, at).toEqual(days[s.day - 1].build);
        expect([s.v, s.road], at).toEqual([SNAPSHOT_V3, playerRoadLog(days, s.day)]);
        expect(s.road?.length, at).toBe(s.day);
        expect({ wins: s.wins, lives: s.lives }, at).toEqual(floorRecord(s.day));
        expect(others(s.day).size, at).toBe(2);
        expect(others(s.day).has(encodeStarred(s.build)), `${at}: the same deck as variant 0 or 1`).toBe(false);
      }
    }
    // the seed step's checks (strict decode, rules, validateUpload in the player mode with ctx.road, reachable record, no
    // duplicate), and the same output from a second call
    expect(checkPool(pool)).toHaveLength(120);
    expect(JSON.stringify(ungradedPool())).toBe(JSON.stringify(pool)); // HULL-ON (PICK; ruling 22e26ded338944ea Q4)
  }, false), 900_000); // 75 s under the quota (68 s off, cached)

  it("NPC_DAY on, the shipped long run: every floor ghost is its hero's CHOSEN casual run's deck of its day (FLOOR_PICKS), days 1-16, with its road log, floorRecord(day), its stated losses and its old labels; distinct from variants 0 and 1; the pool passes checkPool", () => {
    // BUMP-1D (RULING-BUMP-R2 R2.1; tools/samplePool.ts FLOOR_PICKS): in the long run's shipped world the floor run is not the first qualifying seed but the
    // pick (the weakest qualifying casual run: furnace 9005, weaver 9013, foundry 9003, bastion 9004), read by floorPicked with its run hash
    const labels = poolOff(true).map(label);
    allOn();
    // the shipped pool without its grades: sampleGhosts, floorGhosts and raceGhosts over generateSamplePool's own deckOf (SOFT1_PICKS' variant 0 and 1 decks), PICK on
    // (generateSamplePool with PICK off is not the shipped world: worldKey() leaves SOFT1_WORLD, so neither the soft picks nor FLOOR_PICKS would apply)
    // CACHE-1: softDeckOf is tests/helpers/poolCache.ts's now (this very function, marked pure so raceGhosts(undefined, softDeckOf) is cached and shared)
    const build = (): GhostSnapshot[] => [...sampleGhosts(), ...floorGhosts(), ...raceGhosts(undefined, softDeckOf)];
    const pool = build();
    expect(pool).toHaveLength(192); // 4 heroes x 16 days x 3 variants
    expect(pool.filter((s) => RACE_SEED_HEROES.includes(s.hero)).map(label)).toEqual(labels); // records, ids, createdAt and order as with NPC_DAY off
    const floor = pool.filter((s) => variantOf(s) === FLOOR_VARIANT);
    expect(floor).toHaveLength(PLAYABLE_HEROES.length * LONG_RUN_GEN_DAYS);
    for (const hero of PLAYABLE_HEROES) {
      const mine = floor.filter((s) => s.hero === hero);
      expect(mine.map((s) => s.day), hero).toEqual(Array.from({ length: LONG_RUN_GEN_DAYS }, (_, i) => i + 1));
      // ONE casual run per hero: one run seed on all sixteen, the hero's FLOOR_PICKS seed (not the first qualifying one), held to the pick's run hash
      expect(new Set(mine.map((s) => s.seed)).size, hero).toBe(1);
      const [pickSeed, pickHash] = FLOOR_PICKS[hero].split(":");
      expect(Number(pickSeed), `${hero}: a chosen run, not the first seed`).toBeGreaterThan(CASUAL_FLOOR_SEED);
      expect(mine[0].seed, `${hero}: its run seed is the pick's`).toBe(parRunSeed(hero, Number(pickSeed)) >>> 0);
      const days = casualRun(hero, LONG_RUN_GEN_DAYS, Number(pickSeed), CASUAL_TUNE);
      expect(floorHash(days), `${hero}: the pick's run hash`).toBe(pickHash);
      const others = (day: number) => new Set(pool.filter((s) => s.hero === hero && s.day === day && variantOf(s) !== FLOOR_VARIANT).map((s) => encodeStarred(s.build)));
      for (const s of mine) {
        const at = `${hero} d${s.day}`;
        expect(s.build, at).toEqual(days[s.day - 1].build);
        expect([s.v, s.road], at).toEqual([SNAPSHOT_V3, playerRoadLog(days, s.day)]);
        expect(s.road?.length, at).toBe(s.day);
        expect({ wins: s.wins, lives: s.lives }, at).toEqual(floorRecord(s.day));
        expect(s.losses, `${at}: the floor ghost states its losses`).toBeDefined();
        expect(others(s.day).size, at).toBe(2);
        expect(others(s.day).has(encodeStarred(s.build)), `${at}: the same deck as variant 0 or 1`).toBe(false);
      }
    }
    // the seed step's checks (strict decode, rules, validateUpload in the player mode with ctx.road, the record with its stated losses, no duplicate), and the
    // same output from a second call
    expect(checkPool(pool)).toHaveLength(192);
    expect(JSON.stringify(build())).toBe(JSON.stringify(pool));
  }, 900_000);
});
