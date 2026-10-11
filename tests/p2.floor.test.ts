// LOSS-1 P2 (REQ-BFG-092; REVIEW-LOSS1 Q1, BRIEF-LOSS1-ADD2 B): the seed pool's floor ghosts carry the casual player's
// decks, behind NPC_DAY (tools/samplePool.ts casualFloorRun). With NPC_DAY off, generateSamplePool() is byte for byte
// 283cfaf's (the sha256 of its JSON, measured at 283cfaf and at P2's tip in the same host minute: LOSS-1
// output-loss1/p2/p2hash-*.txt). With the hull release's switches on (NPC_DAY, HULL_SCALE and LADDER_FIX), every floor
// ghost (variant 2) is its hero's casual deck (casual.ts casualRun, CASUAL_TUNE) of its day from ONE casual run per hero,
// travels as v3 with that run's road log and run seed, keeps floorRecord(day), its playerId, runId and createdAt, differs
// from the day's variants 0 and 1, and the pool passes the seed step (server/seed.ts checkPool); two calls give equal
// output. The switches are set through their own setters and all put back off after each test.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";
import { encodeStarred } from "../src/sim/standInPool";
import { CASUAL_TUNE, casualRun } from "../src/sim/harness/casual";
import { parRunSeed, playerRoadLog } from "../src/sim/harness/player";
import { floorRecord } from "../src/net/records";
import { MAX_DAY, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { checkPool } from "../server/seed";
import { CASUAL_FLOOR_SEED, CASUAL_FLOOR_TRIES, FLOOR_VARIANT, generateSamplePool } from "../tools/samplePool";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const allOff = (): void => { setNpcDay(false); setHullScale(false); setLadderFix(false); };
const allOn = (): void => { setNpcDay(true); setHullScale(true); setLadderFix(true); };
afterEach(allOff);

/** sha256 of JSON.stringify(generateSamplePool()) with every switch off at 283cfaf, the hull release's work tip before P2
 *  (LOSS-1 run 2, 05:17-05:20Z 2026-10-11: the same at 283cfaf and at P2's tip). The stand-in pool's regeneration (AZ-BUMP
 *  S8) moves it, as it moves rc.seedpool's digests. */
const POOL_OFF_SHA256 = "9599ba92e8f469132b8a61cb0bd697cee2849ad62908369791758f470c96d20c";
const variantOf = (s: GhostSnapshot) => Number(s.playerId.slice(-1));
const label = (s: GhostSnapshot) => [s.hero, s.day, s.playerId, s.runId, s.createdAt, s.wins, s.lives, s.rules];

let offPool: GhostSnapshot[] | undefined;
const poolOff = (): GhostSnapshot[] => {
  allOff();
  offPool ??= generateSamplePool();
  return offPool;
};

describe("LOSS-1 P2: the seed pool's floor ghosts carry the casual player's decks, behind NPC_DAY", () => {
  it("NPC_DAY off: generateSamplePool() is byte for byte 283cfaf's (no casual run is played)", () => {
    expect(sha(JSON.stringify(poolOff()))).toBe(POOL_OFF_SHA256);
  }, 900_000); // 68 s under LOSS-1's 1.5-CPU quota

  it("NPC_DAY on: every floor ghost is its hero's casual deck of its day from one casual run, with its road log, floorRecord(day) and its old labels; distinct from variants 0 and 1; the pool passes checkPool", () => {
    const labels = poolOff().map(label);
    allOn();
    const pool = generateSamplePool();
    expect(pool).toHaveLength(120);
    // records, playerIds, runIds, createdAt and their order exactly as with the switch off
    expect(pool.map(label)).toEqual(labels);
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
    expect(JSON.stringify(generateSamplePool())).toBe(JSON.stringify(pool));
  }, 900_000); // 75 s under the quota (68 s off, cached)
});
