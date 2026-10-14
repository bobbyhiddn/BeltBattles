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
import { setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";
import { setShapes } from "../src/sim/shapes";
import { encodeStarred } from "../src/sim/standInPool";
import { CASUAL_TUNE, casualRun } from "../src/sim/harness/casual";
import { parRunSeed, playerRoadLog } from "../src/sim/harness/player";
import { floorRecord } from "../src/net/records";
import { MAX_DAY, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { checkPool } from "../server/seed";
import { CASUAL_FLOOR_SEED, CASUAL_FLOOR_TRIES, FLOOR_VARIANT, RACE_SEED_HEROES, RACE_VARIANTS, generateSamplePool, raceDeck, raceGhosts } from "../tools/samplePool";
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip): the five switches, through their own with..()
import { withGuard } from "../src/sim/guard";
import { withPick } from "../src/net/pick";
import { withOpenRunes } from "../src/sim/openRunes";
import { withFreeJoins } from "../src/sim/freeJoins";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// SHAPES-1 flip (step 8): SHAPES joins "every switch": off in allOff (283cfaf's world had no shaped piece), on in allOn
// S8 (RULING-S8-R4 item 3; the cause: the pools): allOff keeps SHAPES ON. The one stand-in pool (S8's P1 83c039d) holds
// SHAPES-1's shaped pieces, which a SHAPES-off world can't decode (standInPool.ts: `stand-in code: bad item ...`), so this
// test's off world is the other eight switches off and SHAPES on (was setShapes(false) since SHAPES-1's flip step 8)
const allOff = (): void => { setNpcDay(false); setHullScale(false); setLadderFix(false); setShapes(true); };
const allOn = (): void => { setNpcDay(true); setHullScale(true); setLadderFix(true); setShapes(true); };
afterEach(allOff);

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
const POOL_OFF_SHA256 = "e9accebca818eed8c3455328e1b52731a3cad4b2505272d6a526dd992494afca";
const variantOf = (s: GhostSnapshot) => Number(s.playerId.slice(-1));
const label = (s: GhostSnapshot) => [s.hero, s.day, s.playerId, s.runId, s.createdAt, s.wins, s.lives, s.rules];

let offPool: GhostSnapshot[] | undefined;
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
const poolOff = (): GhostSnapshot[] => {
  allOff();
  offPool ??= withPick(() => raceGhosts(), false); // HULL-ON (PICK; ruling 22e26ded338944ea Q4): reads no grade
  return offPool;
};
/** HULL-ON (the flip, HEARTS, GUARD, PICK, OPEN_RUNES, FREE_JOINS): `fn` with the flip's five switches off too, each put
 *  back after it, even on a throw: the world POOL_OFF_SHA256 was measured in (283cfaf, S7's tip 05021ce: every switch off). */
const flipOff = <T>(fn: () => T): T =>
  withHearts(() => withGuard(() => withPick(() => withOpenRunes(() => withFreeJoins(fn, false), false), false), false), false);

describe("LOSS-1 P2: the seed pool's floor ghosts carry the casual player's decks, behind NPC_DAY", () => {
  it("NPC_DAY off (SHAPES on, the other eight off: RULING-S8-R4): the race heroes' 60; the stand-in pool left out (RULING-S8-R6): every floor deck comes from the par field (no casual run is played), no road log, and raceGhosts() is byte for byte the pinned off pool", () => {
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
    const race = flipOff(() => raceGhosts(undefined, (hero, day, v) => {
      calls.push(`${hero} d${day} v${v}`);
      return raceDeck(hero, day, v);
    }));
    expect(race).toHaveLength(RACE_SEED_HEROES.length * RACE_VARIANTS * MAX_DAY); // 60
    for (const hero of RACE_SEED_HEROES) {
      for (let day = 1; day <= MAX_DAY; day++) expect(calls, `${hero} d${day}: its floor deck from the par field`).toContain(`${hero} d${day} v${FLOOR_VARIANT}`);
    }
    expect(race.filter((s) => s.road !== undefined).map((s) => `${s.hero} d${s.day} ${s.playerId}`), "no ghost carries a road log").toEqual([]);
    // the digest goes last, so kit-s8/p2pin.sh's measure still prints it
    expect(sha(JSON.stringify(race))).toBe(POOL_OFF_SHA256);
  }, 900_000); // 68 s under LOSS-1's 1.5-CPU quota (the whole off pool, before RULING-S8-R6)

  it("NPC_DAY on: every floor ghost is its hero's casual deck of its day from one casual run, with its road log, floorRecord(day) and its old labels; distinct from variants 0 and 1; the pool passes checkPool", () => {
    const labels = poolOff().map(label);
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
  }, 900_000); // 75 s under the quota (68 s off, cached)
});
