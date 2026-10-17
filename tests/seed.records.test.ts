// 0.7.0a D5 (REQ-BFG-016): the seed ghosts.
//  - Every seed ghost (bb-0.6.2 in 0.7.0, bb-0.8.0 from the 0.8.0 RC, bb-0.8.3 since BELTS) passes validateUpload in the
//    player (honest) mode; the seed fails loudly if one doesn't.
//  - Every record label (wins, lives) is one a run can carry into that dusk under 0.6.2's run rules (src/net/records.ts,
//    checked here against the run code itself: newRun, startDusk, finishDay and the DOCK's PATCH UP).
//  - For every day 1-10 and every reachable (wins, lives) at that dusk, at least 4 seed ghosts are eligible under the
//    record rule (D1): the generator's floor is 2 (MIN_ELIGIBLE), and since the 0.8.0 RC the race heroes' floor ghosts
//    make it 4 (oracle 96e0ebe434a93f2b; it was 2). The seed pool keeps its turret and join decks.
//  - Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule (a loss to 1 life before day 10 gives one back, once
//    a run), so the records follow it: 172 reachable states over dusks 1-10 (was 178). The six it takes away are 1-life
//    records it lifts to 2; a record under rules before LAST_CHANCE_RULES is still read by the model before the flip.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION, START_LIVES, type HeroId } from "../src/sim/content"; // SOFT-1: + HeroId
import type { SideStats } from "../src/sim/battle";
import { newRun, type Run } from "../src/game/run";
import { finishDay, startDusk, REFUND_DAY, REFUND_LIVES } from "../src/game/day";
import { pickRoad } from "../src/game/road";
import { choicesFor, eventFor, pickChoice } from "../src/game/events";
import { floorRecord, isReachable, PATCH_UP_LIVES, reachableRecords } from "../src/net/records";
import { eligible, noBetterRecord } from "../src/net/matchmaking";
import { validateBuild, validateUpload } from "../src/net/validate";
import { npcDayRules } from "../src/sim/npcDay"; // S8c: the budget line is left to the player mode only while NPC_DAY is on
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { encodeStarred } from "../src/sim/standInPool";
import { checkPool, SeedError, seedStore } from "../server/seed";
import type { GhostServer } from "../server/app";
import {
  floorGhosts, generateSamplePool, MIN_ELIGIBLE, raceDeck, raceGhosts, reachableLabel, SAMPLE_VARIANTS, sampleGhosts, softPicked, uncoveredStates,
  type RaceDeck,
} from "../tools/samplePool"; // SOFT-1 (REQ-BFG-092): + raceDeck, SAMPLE_VARIANTS, softPicked, RaceDeck (the race part's decks)
import { lifeAudit } from "../tools/scorecard/survival";
import { storeBackends } from "./netStores";
import { LAST_CHANCE_AT, LAST_CHANCE_LIVES } from "../src/sim/lastChance"; // Z-BUMP (REQ-BFG-073): the flip
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): the 5-lives model's checks run with it off
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: LONG_RUN ships on; the 10-day / 5-lives world is read with it off

const POOL = generateSamplePool();
const SAMPLE = sampleGhosts();
const FLOOR = floorGhosts();
// SOFT-1: the seed pool softened (REQ-BFG-092; tools/samplePool.ts SOFT1_PICKS): in the shipped world generateSamplePool takes
// each race hero's variant 0 and 1 decks from SOFT1_PICKS (softPicked: par-field runs, each with its run's field seed and road
// log) and variant 2 (the floor ghost) as before, so the race part is raceGhosts over those decks, as the generator's own
// deckOf gives them (was raceGhosts(), raceDeck's decks: the pool's 40 race variant 0 and 1 decks differed)
const softDeckOf = (h: HeroId, d: number, v: number): RaceDeck => {
  const c = v < SAMPLE_VARIANTS ? softPicked(h, d)?.[v] : undefined;
  return c ? { build: c.build, seed: c.seed!, ...(c.road ? { road: c.road } : {}) } : raceDeck(h, d, v);
};
const RACE = raceGhosts(undefined, softDeckOf); // 0.8.0 RC: FOUNDRY and BASTION's 60 (tests/rc.seedpool.test.ts)
const NOSTATS = {} as SideStats; // finishDay only stores the dusk's stats

/** Every (wins, lives) the run code carries into each dusk 1..maxDay over every win / loss / draw history; on `dockDay`
 *  (a run seed whose DOCK comes that day) the player also buys PATCH UP on the road when the run code allows it. */
function runCodeRecords(seed: number, maxDay: number, dockDay = 0): Set<string>[] {
  const out = Array.from({ length: maxDay + 1 }, () => new Set<string>());
  const explore = (run: Run): void => {
    if (run.over || run.day > maxDay) return;
    const variants = [run];
    if (run.day === dockDay) {
      expect(eventFor(run.seed, run.day)).toBe("dock");
      const patched = structuredClone(run);
      pickRoad(patched, "event");
      const i = choicesFor(patched).findIndex((c) => c.gain.some((d) => d.k === "lives") && !c.blocked);
      if (i >= 0 && pickChoice(patched, i).ok) variants.push(patched);
    }
    for (const v of variants) {
      out[v.day].add(`${v.wins}|${v.lives}`);
      if (v.day === maxDay) continue;
      for (const result of [0, 1, -1] as const) {
        const next = structuredClone(v);
        startDusk(next, []);
        finishDay(next, result, 20, NOSTATS, NOSTATS);
        explore(next);
      }
    }
  };
  explore(newRun("furnace", seed, `d5-records-${seed}-${dockDay}`));
  return out;
}

const keys = (day: number, opts = {}) => new Set(reachableRecords(day, opts).map((r) => `${r.wins}|${r.lives}`));

/** The first run seed whose DOCK comes on `day`. */
function dockSeed(day: number): number {
  for (let s = 1; s < 200_000; s++) if (eventFor(s, day) === "dock") return s;
  throw new Error(`no run seed with the DOCK on day ${day}`);
}

describe("D5: the records a run can carry into a dusk (src/net/records.ts) are the run code's", () => {
  // Z-BUMP: the flip (title was "... PATCH UP +1 and nothing else"; the audit now reads LAST CHANCE off the run code too)
  it("the lives rules the model encodes are the game's: 5 lives, a loss costs 1, the refund at dawn 3, PATCH UP +1, LAST CHANCE +1 at 1 life and nothing else", () => withHearts(() => {
    // HULL-ON (the flip, HEARTS; cap's ruling 6f4568477e66a600 item 4, run 3 under 22e26ded338944ea): lifeAudit's model
    // (tools/scorecard/survival.ts) is the 5-lives model, and with HEARTS on it throws "the model doesn't cover these
    // rules" (a loud stop, as it must in the shipped world). So the audit runs in that model's world, HEARTS off: 5-lives
    // runs. The shipped hearts world is checked against the run code by h2.playthrough's 324-record model and
    // retune1.models' 10-day model
    const a = lifeAudit("furnace", 7); // S1's audit stops on any rule the model doesn't cover
    expect(a.rules).toEqual({ startLives: START_LIVES, days: 10, lossLives: 1, refundDay: REFUND_DAY, refundLives: REFUND_LIVES, dockLives: PATCH_UP_LIVES, lastChance: LAST_CHANCE_LIVES }); // Z-BUMP: the flip (was without lastChance)
    expect([START_LIVES, REFUND_DAY, REFUND_LIVES, PATCH_UP_LIVES, LAST_CHANCE_AT, LAST_CHANCE_LIVES]).toEqual([5, 3, 1, 1, 1, 1]); // Z-BUMP: + LAST_CHANCE_AT, LAST_CHANCE_LIVES
    expect(a.dock).toBe("dock");
  }, false));

  it("without the DOCK: every win / loss / draw history through the run code (days 1-10) gives exactly the model's records", () => withLongRun(() => {
    // BUMP-1D: the 10-day world, explicitly (withLongRun(fn, false)): a run made with the long run off plays 10 days, and its model has no draw bound
    const run = runCodeRecords(1, 10);
    for (let day = 1; day <= 10; day++) expect(run[day], `day ${day}`).toEqual(keys(day, { patchUp: false }));
    expect(run[10].size).toBe(reachableRecords(10, { patchUp: false }).length);
  }, false), 120_000);

  it("the long run (shipped): the run code's records equal the model's through dusk 9, and at dusk 10 the model leaves out the one record only nine draws reach (MAX_RUN_DRAWS 8)", () => {
    // BUMP-1D: the shipped world's twin of the test above: a long run's upload may carry at most MAX_RUN_DRAWS (8) draws (longRun.ts: data safety, D4), so
    // the all-draws record of dusk 10 (nine drawn dusks: 0 wins, 10 hearts) is the run code's alone; dusks 1-9 hold at most 8 draws and agree exactly
    const run = runCodeRecords(1, 10);
    for (let day = 1; day <= 9; day++) expect(run[day], `day ${day}`).toEqual(keys(day, { patchUp: false }));
    const model = keys(10, { patchUp: false });
    expect([...model].filter((k) => !run[10].has(k)), "no model record the run code cannot reach").toEqual([]);
    expect([...run[10]].filter((k) => !model.has(k)), "the run code's records past the model's draw bound").toEqual(["0|10"]);
  }, 120_000);

  it("with the DOCK on day 2, 3, 5 or 8: the run code (PATCH UP bought or not) gives exactly the model's records", () => {
    for (const dock of [2, 3, 5, 8]) {
      const run = runCodeRecords(dockSeed(dock), 8, dock);
      for (let day = 1; day <= 8; day++) expect(run[day], `dock ${dock} day ${day}`).toEqual(keys(day, { dockDay: dock }));
    }
  }, 120_000);

  it("any DOCK day: the union of those; the floor (no wins, fewest lives) per dusk 1-10", () => {
    for (let day = 1; day <= 10; day++) {
      const union = new Set([...keys(day, { patchUp: false }), ...Array.from({ length: 9 }, (_, k) => [...keys(day, { dockDay: k + 2 })]).flat()]);
      expect(keys(day), `day ${day}`).toEqual(union);
    }
    // HULL-ON (the flip, HEARTS): this build's rules read a record on the hearts model (records.ts heartsRecords, the
    // game's heartsDusk step), so the shipped floor is the hearts steps: 10 at dusk 1, a loss costs 1 on days 1-3 and 2 on
    // days 4-6, and day 6's loss (3 - 2 = 1) fires LAST CHANCE: 1 from dusk 7 (as lc1.models); 324 records over dusks 1-10
    // (h2.records; was 172). Every 5-lives value pinned below (the floor, the counts, LAST CHANCE's six, the refund) is
    // the 5-lives model's, still the model for records under rules before hearts, so it is read with HEARTS off, the
    // union of the DOCK days too
    expect(Array.from({ length: 10 }, (_, i) => floorRecord(i + 1).lives)).toEqual([10, 9, 8, 7, 5, 3, 1, 1, 1, 1]);
    // BUMP-1D: the shipped world's model is the long run's (records.ts longRunRecords: HEART_COSTS [1, 2, 2], draws bounded by MAX_RUN_DRAWS): 307 records over
    // dusks 1-10 (was the 10-day hearts model's 324); the 5-lives values below are the 10-day world's, read there (withLongRun(fn, false))
    expect(Array.from({ length: 10 }, (_, i) => reachableRecords(i + 1).length).reduce((a, b) => a + b, 0)).toBe(307);
    withLongRun(() => withHearts(() => {
    for (let day = 1; day <= 10; day++) {
      const union = new Set([...keys(day, { patchUp: false }), ...Array.from({ length: 9 }, (_, k) => [...keys(day, { dockDay: k + 2 })]).flat()]);
      expect(keys(day), `5 lives: day ${day}`).toEqual(union);
    }
    expect(Array.from({ length: 10 }, (_, i) => floorRecord(i + 1).lives)).toEqual([5, 4, 4, 3, 2, 2, 1, 1, 1, 1]); // Z-BUMP: the flip (was [5, 4, 4, 3, 2, 1, 1, 1, 1, 1])
    expect(Array.from({ length: 10 }, (_, i) => reachableRecords(i + 1).length)).toEqual([1, 3, 4, 8, 13, 18, 23, 29, 34, 39]); // Z-BUMP: the flip (was [.., 19, 25, 30, 35, 40], 178)
    // Z-BUMP (the flip): LAST CHANCE takes away exactly six records, each at 1 life, and adds none; a record under rules
    // before LAST_CHANCE_RULES is read by the model before the flip, the floor and the counts above as they were
    const old = (day: number) => reachableRecords(day, { rules: "bb-0.9.1" });
    const gone = Array.from({ length: 10 }, (_, i) => old(i + 1).filter((r) => !isReachable(i + 1, r.wins, r.lives)).map((r) => `d${i + 1} ${r.wins}W ${r.lives}`)).flat();
    expect(gone).toEqual(["d6 0W 1", "d7 1W 1", "d7 2W 1", "d8 3W 1", "d9 4W 1", "d10 5W 1"]);
    for (let day = 1; day <= 10; day++) for (const r of reachableRecords(day)) expect(isReachable(day, r.wins, r.lives, { rules: "bb-0.9.1" }), `day ${day} ${r.wins}W ${r.lives}`).toBe(true);
    expect(Array.from({ length: 10 }, (_, i) => Math.min(...old(i + 1).filter((r) => r.wins === 0).map((r) => r.lives)))).toEqual([5, 4, 4, 3, 2, 1, 1, 1, 1, 1]);
    expect(Array.from({ length: 10 }, (_, i) => old(i + 1).length)).toEqual([1, 3, 4, 8, 13, 19, 25, 30, 35, 40]);
    // the refund makes these impossible: a loss on day 1 or 2 is always handed back at dawn 3
    expect(isReachable(3, 1, 4)).toBe(false);
    expect(isReachable(3, 0, 3)).toBe(false);
    expect(isReachable(3, 0, 4)).toBe(true);
    }, false), false); // HULL-ON (the flip, HEARTS): the 5-lives model's values, read with HEARTS off (above); BUMP-1D: and the 10-day world
  });
});

describe("D5: the seed pool (tools/samplePool.ts generateSamplePool)", () => {
  // 0.8.0 RC (oracle 96e0ebe434a93f2b): FOUNDRY and BASTION's 60 race ghosts follow (the pool was [...SAMPLE, ...FLOOR], 60)
  // BUMP-1D: LONG_RUN ships on, so the pool is the long world's: days 1-16, 4 heroes x 16 days x 3 variants = 192 ghosts: the 64 sample ghosts (2 heroes x
  // 2 variants x 16), the 32 floor ghosts (2 x 16; FLOOR_PICKS' casual runs) and the 96 race ghosts (2 heroes x 3 variants x 16); each states its losses
  it("is the 64 sample ghosts, the 32 floor ghosts and the 96 race ghosts, each passing validateUpload in the player mode (and the shop's strict rules)", () => {
    // HULL-ON (the flip, PICK): every seed ghost carries the seed step's grade (generateSamplePool writes it last), which
    // the three parts' own generators don't write, so the pool compares without it
    expect(POOL.every((s) => typeof s.grade === "number")).toBe(true);
    expect(POOL.map(({ grade: _grade, ...s }) => s)).toEqual([...SAMPLE, ...FLOOR, ...RACE]);
    expect([SAMPLE.length, FLOOR.length, RACE.length]).toEqual([64, 32, 96]); // BUMP-1D: was [40, 20] (and 60 race ghosts)
    for (const s of POOL) {
      expect(s.rules).toBe(RULES_VERSION);
      // S8c (RULING-S8-R5 section 3 item 1 (T1e's form, RULING-S8-R1 item 3); cause a48010b: with NPC_DAY on, a road-fed deck
      // spends the road's drops too, by design): the seed ghosts are drawn from the stand-in pool regenerated once with every
      // switch on (P1 83c039d), so a seed ghost is road-fed (its run fought a warlord each day) and its deck may hold the road's
      // gold and drops. Its drops count through its road log, in the player mode; the strict mode's budget line (the shop's gold
      // alone) counts neither. So each ghost is held, as seedGhost holds it, to validateUpload in the player mode with its road
      // log and run seed (seedGhost's check; checkPool's since T1d; was validateUpload(s.build, s.day, s.rules) with no road
      // log: sample-weaver-0 d1 "budget: build costs 14 gold (items 8, mods 0, 0 crates, 0 plating, turrets 6) but a player's
      // day 1 allows at most 13 (maxGoldByDay 8 + roadCap 5)") AND to validateBuild's lines minus at most its ONE budget line
      // (matched by its "budget: " prefix, and only while NPC_DAY is on: off, the strict check stays whole; was
      // validateBuild(s.build, s.day).ok toBe(true) whole).
      const up = validateUpload(s.build, s.day, s.rules, { ...(s.seed !== undefined ? { seed: s.seed } : {}), ...(s.road ? { road: s.road } : {}) });
      expect(up, `${s.playerId} d${s.day}: the player mode with its road log and run seed`).toEqual({ ok: true, errors: [] });
      const strict = validateBuild(s.build, s.day).errors;
      const budget = npcDayRules() ? strict.filter((e) => e.startsWith("budget: ")) : [];
      expect(budget.length, `${s.playerId} d${s.day}: at most its one budget line`).toBeLessThanOrEqual(1);
      expect(strict.filter((e) => !budget.includes(e)), `${s.playerId} d${s.day}: every other strict line`).toEqual([]);
    }
    expect(checkPool(POOL)).toHaveLength(192); // BUMP-1D: was 120 (0.8.0 RC: was 60)
  });

  it("every label is reachable; the three drawn labels the refund rules out keep their wins at the nearest reachable lives", () => {
    for (const s of POOL) expect(isReachable(s.day, s.wins, s.lives), `${s.playerId} d${s.day} ${s.wins}W ${s.lives}`).toBe(true);
    // BUMP-1D: and with the losses each ghost states (a long run's record check holds it to exactly that count)
    for (const s of POOL) expect(isReachable(s.day, s.wins, s.lives, { losses: s.losses }), `${s.playerId} d${s.day} ${s.wins}W ${s.lives} losses ${s.losses}`).toBe(true);
    for (const f of FLOOR) expect({ wins: f.wins, lives: f.lives }).toEqual(floorRecord(f.day));
    // HULL-ON (the flip, HEARTS): the refund exists only on the 5-lives model (the hearts rule has none), and the labels
    // below are the 5-lives draws, so these lines run with HEARTS off, the sample ghosts drawn there too (sampleGhosts();
    // with HEARTS on the labels are drawn on hearts and day 3's nearest reachable lives are 8 and up). Every label of the
    // shipped pool is reachable on hearts (above)
    // BUMP-1D: the 5-lives labels are the 10-day world's (LONG_RUN off), read there explicitly (the shipped long run's model has no 5-lives scale)
    withLongRun(() => withHearts(() => {
    // the draws before D5 (tools/samplePool.ts, unchanged): day 3's furnace v0 drew 0W 3 lives, weaver v0 and v1 1W 4 lives
    expect(reachableLabel(3, 0, 3)).toEqual({ wins: 0, lives: 4 });
    expect(reachableLabel(3, 1, 4)).toEqual({ wins: 1, lives: 5 });
    const d3 = sampleGhosts().filter((s) => s.day === 3).map((s) => `${s.playerId} ${s.wins}W ${s.lives}`);
    expect(d3).toEqual(["sample-furnace-0 0W 4", "sample-furnace-1 2W 5", "sample-weaver-0 1W 5", "sample-weaver-1 1W 5"]);
    }, false), false);
  });

  it("covers every reachable state of every dusk 1-16 with at least 4 eligible seed ghosts under the record rule (D1; the generator's floor is 2)", () => {
    // BUMP-1D: dusks 1-16 (was 1-10), the long run's record model: 823 reachable states (was the hearts model's 324), fewest eligible ghosts 4 (as before)
    expect(MIN_ELIGIBLE).toBe(2);
    const entries = POOL.map((s) => ({ id: ghostId(s), snapshot: s }));
    let states = 0, least = Infinity;
    for (let day = 1; day <= 16; day++) {
      for (const r of reachableRecords(day)) {
        states++;
        const ok = eligible(entries, { rules: RULES_VERSION, day, wins: r.wins, lives: r.lives, playerId: "new-player", seen: [] });
        for (const e of ok) expect(noBetterRecord(e.snapshot, r)).toBe(true);
        expect(ok.length, `day ${day} ${r.wins}W ${r.lives} lives`).toBeGreaterThanOrEqual(2);
        least = Math.min(least, ok.length);
      }
    }
    expect(states).toBe(823); // BUMP-1D: the long run's 823 over dusks 1-16 (the lead's BB_SEEDPOOL_SCRATCH count; was 324 over dusks 1-10). HULL-ON (the flip, HEARTS): the hearts model's 324 (h2.records; was 172). Z-BUMP: the flip (was 178: LAST CHANCE takes away six 1-life records, above)
    expect(least).toBe(4); // 0.8.0 RC: the race floor ghosts are eligible everywhere too (was 2)
    expect(uncoveredStates(POOL)).toEqual([]);
    // without the floor ghosts the sample ghosts leave states uncovered (why the floor ghosts exist)
    expect(uncoveredStates(SAMPLE).length).toBeGreaterThan(0);
  });

  // 0.8.0 I1 M3 (oracle 64485b535a06683c): the regrown stand-in pool moves these on purpose (were 14 and 28, 10 and 13)
  // 0.8.0 B1 M2 (oracle efb5c4ff84fe4c6d): the stand-in pool regenerated after the hero numbers (were 9 and 26, 9 and 12)
  // BELTS run 5 (REQ-BFG-043/044): the stand-in pool regenerated under bb-0.8.3 with the gold upgrades (44ee031)
  // (were 8 and 29, 7 and 12)
  // bb-0.8.6 (PACKS M4): the stand-in pool regenerated with the packs (23bb3d2) (were 11 and 24, 4 and 16)
  // FLIP-X2: the stand-in pool regenerated at 94e0cbf (every deck holding its day's runes; BUNDLED_POOL_HULL_SCALE gone at
  // 9006765), so the sample and floor decks drawn from it moved (were 9 and 24, 4 and 10)
  // REDO-X step 2 (4.1): the stand-in pool regenerated once more on FIX-ABE's offers (09ce97c; the pools changed, the
  // regeneration), so the sample and floor decks drawn from it moved (were 5 and 21, 5 and 13)
  // Y7b2 (the pools): the stand-in pool regenerated once on bb-0.9.3 (4d772e4), so the sample and floor decks drawn from it
  // moved; title "the sample ghosts' 4 and 25, plus the floor ghosts' 4 and 16" -> 6 and 26, 3 and 15
  // Z-BUMP (the pools): the stand-in pool regenerated once under bb-0.9.7 (2c4ba76), so the sample and floor decks drawn
  // from it moved; title "the sample ghosts' 6 and 26, plus the floor ghosts' 3 and 15" -> 9 and 23, 2 and 14
  // S8c (the pools): the stand-in pool regenerated once with every switch on as shipped (P1 83c039d, NPC_DAY on: road-fed decks),
  // so the sample and floor decks drawn from it moved; title "the sample ghosts' 9 and 23, plus the floor ghosts' 2 and 14" ->
  // 23 and 27, 2 and 10
  // SOFT-1: the seed pool softened (REQ-BFG-092; tools/samplePool.ts SOFT1_PICKS): the sample decks are the softer picks, 39 of
  // 40 par-field runs' dusk decks; the floor ghosts' decks are unchanged; title "the sample ghosts' 23 and 27, plus the floor
  // ghosts' 2 and 10" -> 22 and 23, 2 and 10
  // BUMP-1D (the seed pool regenerated, 5e93e1e: days 1-16, SOFT_TARGET 250's picks, the floor ghosts FLOOR_PICKS' casual runs): title "the sample
  // ghosts' 22 and 23, plus the floor ghosts' 2 and 10" -> 35 and 47, 27 and 29 (64 sample ghosts and 32 floor ghosts now; counted off the committed file)
  it("keeps its turret and join decks: the sample ghosts' 35 and 47, plus the floor ghosts' 27 and 29 (each a deck of its own)", () => {
    const carry = (ps: readonly GhostSnapshot[]) => [ps.filter((s) => (s.build.turrets ?? []).length > 0).length, ps.filter((s) => s.build.routes.some((r) => r.join !== undefined)).length];
    // BAL-2 (c5e4780, the pools changed): [3, 24] -> [4, 25]
    // Y7b2 (the pools): was [4, 25] (4d772e4, the pool regenerated on bb-0.9.3)
    // Z-BUMP (the pools): was [6, 26] (2c4ba76, the stand-in pool regenerated once under bb-0.9.7)
    // S8c (the pools): was [9, 23] (P1 83c039d, the stand-in pool regenerated once with every switch on, NPC_DAY on)
    // SOFT-1 (the seed pool softened, REQ-BFG-092): was [23, 27] (S8c's sample decks)
    // BUMP-1D (the seed pool regenerated, 5e93e1e): was [22, 23] (SOFT-1's picks over days 1-10)
    expect(carry(SAMPLE)).toEqual([35, 47]); // FLIP-X2: [9, 24] -> [5, 21]; REDO-X (09ce97c, the pools changed): [5, 21] -> [3, 24]
    // BAL-2 (c5e4780, the pools changed): [2, 14] -> [4, 16]
    // Y7b2 (the pools): was [4, 16] (4d772e4, the pool regenerated on bb-0.9.3)
    // Z-BUMP (the pools): was [3, 15] (2c4ba76, the stand-in pool regenerated once under bb-0.9.7)
    // S8c (the pools): was [2, 14] (P1 83c039d, the stand-in pool regenerated once with every switch on, NPC_DAY on)
    // BUMP-1D (the seed pool regenerated, 5e93e1e: the floor ghosts are FLOOR_PICKS' casual runs over days 1-16): was [2, 10]
    expect(carry(FLOOR)).toEqual([27, 29]); // FLIP-X2: [4, 10] -> [5, 13]; REDO-X (09ce97c, the pools changed): [5, 13] -> [2, 14]
    for (const f of FLOOR) {
      const same = SAMPLE.filter((s) => s.day === f.day && s.hero === f.hero).map((s) => encodeStarred(s.build));
      expect(same).toHaveLength(2);
      expect(same).not.toContain(encodeStarred(f.build));
    }
  });

  it("fails loudly: the seed's check refuses a ghost validateUpload refuses, and one whose record no run reaches", () => {
    const rich = { ...POOL[0], build: { ...POOL[0].build, hullBonus: POOL[0].build.hullBonus + 500 } };
    expect(validateUpload(rich.build, rich.day).ok).toBe(false);
    expect(() => checkPool([...POOL, rich])).toThrow(SeedError);
    expect(() => checkPool([rich])).toThrow(/entry 0 \(furnace day 1\): validateUpload: budget/);
    // BUMP-1D: a long-run ghost states its losses, and a day-3 dusk with 1 win leaves at most 1 loss (0..1): the stated 1 keeps the snapshot valid
    // (the sample ghost's own count was for its drawn record), so the refusal is the record's (was without `losses`)
    const unreachable = { ...SAMPLE.find((s) => s.day === 3)!, wins: 1, lives: 4, losses: 1 };
    expect(() => checkPool([unreachable])).toThrow(/record 1W 4 lives: no run carries it into dusk 3/);
  });
});

describe.each(storeBackends())("D5 end to end on the $name store: a new player gets a seed ghost at every reachable state", (backend) => {
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ rateLimit: { windowMs: 60_000, max: 100_000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    expect((await seedStore(app.store)).entries).toBe(192); // BUMP-1D: was 120 (0.8.0 RC: was 60)
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  it("every day 1-16, every reachable record, runs 0: 200 with a seed ghost of no better record", async () => {
    // BUMP-1D: days 1-16 (was 1-10)
    const ids = new Set(POOL.map(ghostId));
    let n = 0;
    for (let day = 1; day <= 16; day++) {
      for (const r of reachableRecords(day)) {
        const res = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=${day}&wins=${r.wins}&lives=${r.lives}&player=new-player&seen=&runs=0`);
        expect(res.status, `day ${day} ${r.wins}W ${r.lives}`).toBe(200);
        const body = (await res.json()) as { id: string; snapshot: GhostSnapshot };
        expect(ids.has(body.id)).toBe(true);
        expect(noBetterRecord(body.snapshot, r)).toBe(true);
        n++;
      }
    }
    expect(n).toBe(823); // BUMP-1D: the long run's 823 reachable records over dusks 1-16 (was 324 over dusks 1-10). HULL-ON (the flip, HEARTS): the hearts model's 324 reachable records (was 172). Z-BUMP: the flip (was 178)
  });
});
