// LC-1 (REQ-BFG-073): every model of lives follows LAST CHANCE. Z-BUMP (the flip): LAST CHANCE is the game's rule, its
// switch deleted; what the switch off was keeps its point another way: records.ts reads a record under rules before
// LAST_CHANCE_RULES (OLD_RULES, bb-0.9.1) without LAST CHANCE (the model before the flip), and the run code without it is
// a run whose LAST CHANCE is already spent (spent(), below: finishDay never fires it).
//  - src/net/records.ts reachableRecords, checked against the run code (newRun, startDusk, finishDay) over every
//    win/loss/draw pattern of days 1-9 (no road stop: PATCH UP is the DOCK's, modelled apart and unchanged);
//  - tools/scorecard/survival.ts: the smallest model (modelCompletes) against the run code on every loss pattern, and the
//    audit reads the rule off the run code;
//  - src/tooling.ts makeGhost's lives; server/seed.ts checkPool takes a LAST CHANCE ghost's record and card.
// Then (read only, nothing written): how the seed pool's labels move at the flip (tools/samplePool.ts).
// HULL-ON (the flip, HEARTS): this build's rules read a record on the hearts model (records.ts heartsRecords) and newRun
// starts a 10-hearts run, so the shipped halves are re-pinned to the hearts steps; every 5-lives half (the run code under
// OLD_RULES, survival.ts's model, makeGhost's 5-lives labels, the pool before the flip) runs with HEARTS off, its world.
// LOOK (cap): survival.ts's model does not follow HEARTS (lifeAudit throws with it on), as in scorecard.survival.
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { heartsRules, setHearts, withHearts } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): the 5-lives halves
import type { SideStats } from "../src/sim/battle";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";
import { LAST_CHANCE_LIVES } from "../src/sim/lastChance";
import { newRun, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { floorRecord, isReachable, reachableRecords } from "../src/net/records";
import type { GhostSnapshot } from "../src/net/snapshot";
import { lifeAudit, modelCompletes, runPattern, type LifeRules } from "../tools/scorecard/survival";
import { makeGhost } from "../src/tooling";
import { uncoveredStates } from "../tools/samplePool";

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** Z-BUMP (the flip): a rules version before LAST_CHANCE_RULES (it stays older after the bump): records.ts reads a record
 *  under it without LAST CHANCE, the model the switch off was. */
const OLD_RULES = "bb-0.9.1";

/** Z-BUMP (the flip): `run` with its LAST CHANCE already spent (a taken card on record before its first dusk), so finishDay
 *  never fires it (lastChanceFires' `used`): the run code without LAST CHANCE, as the switch off ran it. */
function spent(run: Run): Run {
  run.lastChance = { day: 1, boon: "hull" };
  return run;
}

/** Every (wins, lives) the run code carries into dusk `day` over all results of the dusks before it (no road stop).
 *  Z-BUMP: `withoutLc`, a run whose LAST CHANCE is spent (the run code the switch off ran). */
function runCodeRecords(day: number, withoutLc = false): string[] {
  const seen = new Set<string>();
  const n = 3 ** (day - 1);
  for (let m = 0; m < n; m++) {
    const run = newRun("furnace", 99, "lc1-models");
    if (withoutLc) spent(run);
    let k = m;
    for (let d = 1; d < day && !run.over; d++) {
      const r = k % 3;
      k = Math.floor(k / 3);
      startDusk(run, []);
      finishDay(run, r === 0 ? 0 : r === 1 ? 1 : -1, 20, { ...Z }, { ...Z });
    }
    if (!run.over) seen.add(`${run.wins}|${run.lives}`);
  }
  return [...seen].sort();
}

/** The model's records at dusk `day` (no road stop); Z-BUMP: `rules`, the record's rules (absent: this build's). */
const modelRecords = (day: number, rules?: string): string[] => reachableRecords(day, { patchUp: false, ...(rules ? { rules } : {}) }).map((r) => `${r.wins}|${r.lives}`).sort();

// Z-BUMP (the flip): was "records.ts follows LAST CHANCE (switch on) and is today's (off)"
describe(`LC-1: records.ts follows LAST CHANCE, and reads a record under older rules (${OLD_RULES}) as before`, () => {
  // Z-BUMP: was "..., off and on"; on is the game's run code now, off the model under OLD_RULES against a spent run
  it(`reachableRecords equals the run code's records at every dusk 1-9; under ${OLD_RULES}, those of a run whose LAST CHANCE is spent`, () => {
    for (let day = 1; day <= 9; day++) expect(modelRecords(day), `day ${day}`).toEqual(runCodeRecords(day));
    // HULL-ON (the flip, HEARTS): OLD_RULES' run code is a 5-lives run, made with HEARTS off (a run made under the flip
    // starts with 10 hearts and keeps that scale: "bb-0.9.1 day 1: ['0|5'] vs ['0|10']")
    for (let day = 1; day <= 9; day++) expect(modelRecords(day, OLD_RULES), `${OLD_RULES} day ${day}`).toEqual(withHearts(() => runCodeRecords(day, true), false));
    // AZ-BUMP (the 1.5-CPU quota, the GATE RULE; no switch): 600 s (was 120 s), a host timeout, not the rule. 46 s in S1's
    // whole suite (every switch off, before the quota), 66 s in AZ-BUMP run 4's switch-on shard, 183 s and 191 s alone in
    // run 6 (the quota's cgroup saturated by other jobs). No switch makes it slower: run 7's probe timed this run code with
    // each switch off in turn, interleaved, and every median sat within noise of all on (6.28-6.53 s for days 1-8)
  }, 600_000);

  // Z-BUMP: was "on: ...; off: as before"; floorRecord reads this build's rules, and the floor before the flip is
  // records.ts's under OLD_RULES (the fewest lives with no wins, as floorRecord takes it)
  it(`no 1-life record before dusk 7; the floor rises to 2 lives on days 6 (no 1 yet); under ${OLD_RULES}: as before`, () => {
    const floorOf = (day: number, rules?: string): number => Math.min(...reachableRecords(day, rules ? { rules } : {}).filter((r) => r.wins === 0).map((r) => r.lives));
    const days = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
    const on = days.map((d) => floorRecord(d));
    expect(on.map((r) => r.lives)).toEqual(days.map((d) => floorOf(d))); // floorOf is floorRecord's floor
    expect(days.map((d) => floorOf(d, OLD_RULES))).toEqual([5, 4, 4, 3, 2, 1, 1, 1, 1, 1]);
    // HULL-ON (the flip, HEARTS): [5, 4, 4, 3, 2, 2, 1, 1, 1, 1] -> the hearts steps: 10 at dusk 1, a loss costs 1 on days
    // 1-3 and 2 on days 4-6, and day 6's loss (3 - 2 = 1) fires LAST CHANCE: 1 from dusk 7, none before (3 at dusk 6).
    // With HEARTS off, the 5-lives floor as before
    expect(on.map((r) => r.lives)).toEqual([10, 9, 8, 7, 5, 3, 1, 1, 1, 1]);
    expect(withHearts(() => days.map((d) => floorRecord(d).lives), false)).toEqual([5, 4, 4, 3, 2, 2, 1, 1, 1, 1]);
    expect(isReachable(6, 0, 1)).toBe(false);
    expect(isReachable(7, 0, 1)).toBe(true);
  });
});

/** Z-BUMP (the flip): runPattern's loop (tools/scorecard/survival.ts: startDusk, then finishDay with the scripted result,
 *  every non-loss a win, no road) on a run whose LAST CHANCE is spent: does loss pattern `mask` complete the run? */
function spentCompletes(mask: number): boolean {
  const run = spent(newRun("furnace", 4242, "sc-surv-4242"));
  for (let day = 1; day <= RUN_DAYS && !run.over; day++) {
    startDusk(run, []);
    finishDay(run, (mask >> (day - 1)) & 1 ? 1 : 0, 20, { ...Z }, { ...Z });
  }
  return run.over === "complete";
}

describe("LC-1: survival.ts's exact model follows LAST CHANCE", () => {
  // Z-BUMP (the flip): was "..., switch on and off; ..."; on is the game's run code now; off is the model without
  // lastChance (LifeRules' absent: the model before the flip) against a run whose LAST CHANCE is spent; the audit reads
  // LAST_CHANCE_LIVES off the run code (its off reading, undefined, is gone with the switch)
  it("modelCompletes agrees with the run code on every loss pattern; without lastChance, with a run whose LAST CHANCE is spent; the audit reads the rule", () => withHearts(() => {
    // HULL-ON (the flip, HEARTS): the model (LifeRules) is the 5-lives model, and with HEARTS on lifeAudit throws ("the
    // model doesn't cover these rules"), so the body runs with HEARTS off: 5-lives runs, the world the model covers. LOOK
    const a = lifeAudit("furnace", 4242);
    expect(a.rules.lastChance).toBe(LAST_CHANCE_LIVES);
    const r: LifeRules = a.rules;
    const { lastChance: _lc, ...before } = r;
    for (let mask = 0; mask < 2 ** RUN_DAYS; mask++) {
      const lost = Array.from({ length: RUN_DAYS }, (_, d) => ((mask >> d) & 1) === 1);
      expect(modelCompletes(r, lost), `${mask}`).toBe(runPattern("furnace", 4242, mask).complete);
      expect(modelCompletes(before, lost), `without lastChance ${mask}`).toBe(spentCompletes(mask));
    }
  }, false), 120_000);
});

describe("LC-1: tooling.ts and server/seed.ts", () => {
  // Z-BUMP (the flip): was "makeGhost's lives: off START_LIVES - losses (at least 1); on, ..."; the off reading
  // ([5, 2, 1, 1]) is deleted: makeGhost stamps this build's rules, with no older-rules path
  it("makeGhost's lives: a ghost that fell to 1 life had one back", () => {
    // HULL-ON (the flip, HEARTS): [5, 2, 2, 1] -> [10, 7, 5, 3]: with HEARTS on makeGhost labels its losses on hearts
    // (heartsAfterLosses: 1 a loss on days 1-3, 2 on days 4-6; none of these reaches LAST CHANCE, the 6th loss would).
    // With HEARTS off, the 5-lives labels as before: 4 losses leave 1 life, and LAST CHANCE gives one back (2)
    expect([0, 3, 4, 5].map((losses) => makeGhost({ day: 8, losses }).lives)).toEqual([10, 7, 5, 3]);
    expect(withHearts(() => [0, 3, 4, 5].map((losses) => makeGhost({ day: 8, losses }).lives), false)).toEqual([5, 2, 2, 1]);
    expect(START_LIVES).toBe(5);
  });
});

/** Z-BUMP (the flip): the seed pool as the generator made it before the flip. tools/samplePool.ts labels its ghosts by
 *  records.ts, which models LAST CHANCE now, so generateSamplePool() at the flip already carries the moved labels (gen:ghosts
 *  writes them at the one regeneration). Before the flip records.ts modelled none, which is records.ts under OLD_RULES now:
 *  the generator is imported fresh with reachableRecords, isReachable and floorRecord read under OLD_RULES (floorRecord as
 *  records.ts takes it: the fewest lives with no wins). Read only; nothing is written. */
async function preFlipPool(): Promise<GhostSnapshot[]> {
  vi.resetModules();
  vi.doMock("../src/net/records", async (importOriginal) => {
    const real = await importOriginal<typeof import("../src/net/records")>();
    const reachableRecords: typeof real.reachableRecords = (day, o = {}) => real.reachableRecords(day, { rules: OLD_RULES, ...o });
    const isReachable: typeof real.isReachable = (day, wins, lives, o = {}) => real.isReachable(day, wins, lives, { rules: OLD_RULES, ...o });
    const floorRecord: typeof real.floorRecord = (day) => reachableRecords(day).filter((r) => r.wins === 0).reduce((a, b) => (b.lives < a.lives ? b : a));
    return { ...real, reachableRecords, isReachable, floorRecord };
  });
  try {
    // HULL-ON (the flip, HEARTS): the fresh graph's hearts.ts starts with the flip's HEARTS on, and the generator's labels
    // read it (samplePool.ts drawnLabel), so it follows this file's switch (off in the test below: a 5-lives pool)
    (await import("../src/sim/hearts")).setHearts(heartsRules());
    // HULL-ON (the flip, PICK; cap's ruling 22e26ded338944ea Q4): the pool build runs with PICK off, through the fresh
    // graph's own pick.ts (samplePool.ts imports it, so the graph's load order is unchanged). The test reads no grade, and
    // no value a grade moves (labels, records and coverage: samplePool.ts adds the grade last, after the labels and the
    // coverage check), so the fresh graph's full grading goes (its memo is that graph's own, empty). Proved once: the
    // test's values are identical with this wrapper and without it (output-hullon/logs/r4-lc1-without, r4-lc1-with)
    const { generateSamplePool } = await import("../tools/samplePool");
    const { withPick } = await import("../src/net/pick");
    return withPick(() => generateSamplePool(), false);
  } finally {
    vi.doUnmock("../src/net/records");
    vi.resetModules();
  }
}

describe("LC-1: the seed pool at the flip (read only; nothing is regenerated)", () => {
  // Z-BUMP (the flip): the pool is the one before the flip (preFlipPool; was generateSamplePool() with the switch off), its
  // labels and gaps are read under this build's rules (was withLastChance), and its "off" reading under OLD_RULES
  it("counts the sample pool's labels a run under LAST CHANCE can't carry, and the coverage gaps it would leave", async () => {
    // HULL-ON (the flip, HEARTS): the pool before the flip is a 5-lives pool and the count is LAST CHANCE's on 5 lives, so
    // the test runs with HEARTS off, here and in preFlipPool's fresh graph (with it on, the 5-lives labels were read on
    // the hearts model: 74 "moved", not 6)
    setHearts(false);
    onTestFinished(() => setHearts(true)); // the shipped value (HULL-ON's flip)
    const pool = await preFlipPool(); // the 120 seed ghosts before the flip
    const moved = pool.filter((g) => !isReachable(g.day, g.wins, g.lives));
    const gaps = uncoveredStates(pool);
    const byDay = (xs: readonly { day: number }[]) => Array.from({ length: RUN_DAYS }, (_, i) => xs.filter((x) => x.day === i + 1).length);
    const byHero = (xs: readonly { hero: string }[]) => [...new Set(pool.map((g) => g.hero))].map((h) => `${h} ${xs.filter((x) => x.hero === h).length}`);
    console.log(`LC1-POOL ${pool.length} seed ghosts; unreachable with LAST CHANCE on: ${moved.length} (by day ${byDay(moved).join(",")}; ${byHero(moved).join(", ")}); ` +
      `coverage gaps on: ${gaps.length} (by day ${byDay(gaps).join(",")}): ${gaps.slice(0, 12).map((g) => `d${g.day} ${g.wins}W ${g.lives}L (${g.eligible})`).join(", ")}`);
    expect(pool.length).toBe(120);
    console.log(`LC1-MOVED ${moved.map((g) => `${g.hero} d${g.day} ${g.wins}W ${g.lives}L`).join(", ")}`);
    expect(moved.length).toBe(6);
    expect(moved.every((g) => g.lives === 1)).toBe(true); // only 1-life labels: the loss that left 1 life fired it
    expect(gaps).toEqual([]);
    expect(pool.filter((g) => !isReachable(g.day, g.wins, g.lives, { rules: OLD_RULES }))).toEqual([]);
    // HULL-ON (the flip, PICK; cap's ruling 22e26ded338944ea Q4): the limit is 66cc267's 300 s again (run 2 raised it to
    // 600 s while preFlipPool's fresh graph graded the pool: 251 s alone, 144.1 s pinned). With the pool build's PICK off
    // the test took 25.3 s alone (pinned), and 2x that fits under 300 s
  }, 300_000);
});
