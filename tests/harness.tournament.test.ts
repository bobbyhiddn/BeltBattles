import { describe, expect, it } from "vitest";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { ITEMS } from "../src/sim/content"; // BUMP-1D: the shaped-rig bound test below
import { rigArrowCells, rigArrows } from "../src/sim/deck"; // BUMP-1D: SHAPES-1's per-cell arrows (the hits bound)
import { HARNESS_HEROES, heroRefBuild, heroStartBuild } from "../src/sim/harness/heroes";
import { balanceMarkdown } from "../src/sim/harness/report";
import { rigValues } from "../src/sim/harness/rigs"; // BUMP-1D: the shaped-rig bound test below
import { bandFlag, wilson } from "../src/sim/harness/stats";
import { DEFAULT_OPTS, playJob, runTournament, type Runner, type TourneyOpts } from "../src/sim/harness/tournament";
import { cpuMsSince, HARNESS_CPU_BUDGET_MS, HARNESS_HANG_TIMEOUT_MS } from "./harnessTiming";

// Balance harness tournament: a tiny end-to-end run, determinism, and the statistics.

// All six heroes on day 1 (short battles); the determinism check uses three heroes on day 3.
const TINY: TourneyOpts = { ...DEFAULT_OPTS, days: [1], pop: 4, gauntlet: 2, seeds: 1, elites: 2, calibrationDays: [1] };

describe("harness tournament", () => {
  it("a tiny end-to-end run stays within its CPU work budget and returns a well-formed matrix", async () => {
    const cpu0 = process.cpuUsage();
    const res = await runTournament(TINY);
    expect(cpuMsSince(cpu0)).toBeLessThan(HARNESS_CPU_BUDGET_MS);
    expect(res.days.map((d) => d.day)).toEqual([1]);
    for (const d of res.days) {
      expect(d.budget).toBe(maxGoldByDay(d.day));
      for (const a of HARNESS_HEROES) {
        expect(d.elites[a]).toHaveLength(2);
        expect(d.popScores[a]).toHaveLength(4);
        for (const e of d.elites[a]) expect(validateBuild(e.build, d.day).errors).toEqual([]);
        for (const b of HARNESS_HEROES) {
          if (a === b) continue;
          for (const t of [d.pop, d.elite]) {
            const r = t[`${a}|${b}`], s = t[`${b}|${a}`];
            expect(r.n).toBeGreaterThan(0);
            expect(r.n % 2).toBe(0); // both sides of every seed
            expect(r.lo).toBeLessThanOrEqual(r.p);
            expect(r.hi).toBeGreaterThanOrEqual(r.p);
            expect(r.n).toBe(s.n);
            expect(r.p + s.p).toBeCloseTo(1, 9);
          }
        }
      }
      // pop matrix: A-pop x B-gauntlet + B-pop x A-gauntlet - overlap, x2 battles per pairing
      expect(d.pop["furnace|weaver"].n).toBe((4 * 2 + 4 * 2 - 2 * 2) * 2);
      expect(d.elite["furnace|weaver"].n).toBe(2 * 2 * 2);
      for (const a of HARNESS_HEROES) {
        // mirror: the 2 builds outside the gauntlet x the hero's 2 gauntlet builds x 2 battles
        expect(d.pop[`${a}|${a}`].n).toBe(2 * 2 * 2);
        expect(d.elite[`${a}|${a}`]).toBeUndefined();
        expect(d.spend[a].min).toBeLessThanOrEqual(d.spend[a].median);
        expect(d.spend[a].max).toBeLessThanOrEqual(d.budget);
      }
    }
    const cal = res.days[0].calibration!.furnace;
    expect(cal.of).toBe(5);
    expect(cal.cost).toBe(buildCost(heroRefBuild("furnace", 1)).total);
    expect(cal.popCost).toEqual(res.days[0].spend.furnace);
    // 0.6.2 BELTSIDE H1: every population rig is counted with its landed arrows (one per arrow at most)
    const rigs = Object.values(res.days[0].rigs);
    expect(rigs.reduce((n, v) => n + v.n, 0)).toBeGreaterThan(0);
    for (const v of rigs) {
      expect(v.hits, v.def).toBeGreaterThanOrEqual(v.n); // no idle rig in a harness build
      // BUMP-1D: was `v.hits <= v.n * v.arrows` (one per arrow at most). SHAPES-1's rule (deck.ts rigArrowCells / rigHits, live
      // since 0.9.9): each arrow shines from EVERY outside edge of a shaped rig's cells that faces its way, so a 2-cell NAIL
      // STRIP with one arrow, lying along two belt tiles, lands 2 hits (this tiny run's population holds one: n 1, arrows 1,
      // hits 2); the bound is the shape's most hits (rigArrowCells at rot 0: faces.ts shapeMaxHits; NAIL STRIP and EMBER
      // TROUGH 2, SPIKE RAIL 6). For a one-cell rig that is its arrow count, exactly the old bound.
      expect(v.hits, v.def).toBeLessThanOrEqual(v.n * rigArrowCells(v.def, 0, 0, 0).length);
    }
    const md = balanceMarkdown(res, { runtimeMs: 1, workers: 1, command: "test", perDayMs: {} });
    expect(md).toContain("## Day 1");
    expect(md).toContain("Calibration");
    expect(md).toContain("## Mirror cells");
    expect(md).toContain("## Lever traits");
    expect(md).toContain("## Rig arrows (H1: value per arrow that hits)");
  }, HARNESS_HANG_TIMEOUT_MS);

  // BUMP-1D: the bound above is the shape's, so the shaped rigs must reach it: rigValues counts one hit per arrow per outside
  // edge (SHAPES-1 R2), not one per arrow. FURNACE's start deck has its belt up the column x 4 (y 5 to 0; the KILN at (4, 6)): a NAIL
  // STRIP (I2, one arrow) turned to rot 1 at (3, 2) stands on (3, 2) and (3, 3) with its arrow to the east, so it lands 2 hits with 1 arrow
  it("rigValues counts a shaped rig's hits per outside edge: a NAIL STRIP along a belt lands 2 hits with one arrow, the shape's most", () => {
    const along = heroStartBuild("furnace", 1);
    along.items.push({ uid: 90, def: "nailstrip", x: 3, y: 2, rot: 1 });
    const v = rigValues([along]).nailstrip;
    expect(ITEMS.nailstrip.foot).toBe("I2");
    expect(rigArrows("nailstrip")).toHaveLength(1);
    expect([v.n, v.arrows, v.hits]).toEqual([1, 1, 2]);
    expect(rigArrowCells("nailstrip", 0, 0, 0)).toHaveLength(2); // the shape's most hits (faces.ts shapeMaxHits)
    expect(v.hits).toBeGreaterThan(v.n * v.arrows); // what the old per-arrow bound refused
    expect(v.hits).toBeLessThanOrEqual(v.n * rigArrowCells("nailstrip", 0, 0, 0).length);
    // a one-cell rig keeps the old bound: its arrows are its most hits
    const plain = heroStartBuild("furnace", 1);
    plain.items.push({ uid: 91, def: "whetstone", x: 3, y: 3, rot: 1 }); // its one arrow to the east, onto the belt tile (4, 3)
    const w = rigValues([plain]).whetstone;
    expect([w.n, w.arrows, w.hits]).toEqual([1, 1, 1]);
    expect(rigArrowCells("whetstone", 0, 0, 0)).toHaveLength(w.arrows);
    expect(w.hits).toBeLessThanOrEqual(w.n * w.arrows);
  });

  it("results do not depend on the order jobs are played in (any worker split)", async () => {
    const cpu0 = process.cpuUsage();
    const o: TourneyOpts = { ...TINY, heroes: ["weaver", "bastion"], pop: 3, gauntlet: 2 };
    const backwards: Runner = async (field, jobs) => {
      const out = new Array<number>(jobs.length);
      for (let i = jobs.length - 1; i >= 0; i--) out[i] = playJob(field, jobs[i]);
      return out;
    };
    expect(JSON.stringify(await runTournament(o, backwards))).toBe(JSON.stringify(await runTournament(o)));
    expect(cpuMsSince(cpu0)).toBeLessThan(HARNESS_CPU_BUDGET_MS);
  }, HARNESS_HANG_TIMEOUT_MS);

  it("the same seed gives identical tournament results", async () => {
    const cpu0 = process.cpuUsage();
    const o: TourneyOpts = { ...TINY, heroes: ["furnace", "metronome", "siphon"], days: [3], pop: 4, gauntlet: 2 };
    const a = await runTournament(o);
    const b = await runTournament(o);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = await runTournament({ ...o, seed: 2 });
    expect(JSON.stringify(c.days[0].elites)).not.toBe(JSON.stringify(a.days[0].elites));
    expect(cpuMsSince(cpu0)).toBeLessThan(HARNESS_CPU_BUDGET_MS);
  }, HARNESS_HANG_TIMEOUT_MS);

  it("Wilson intervals and band flags", () => {
    const r = wilson(50, 100);
    expect(r.p).toBe(0.5);
    expect(r.lo).toBeCloseTo(0.4038, 3);
    expect(r.hi).toBeCloseTo(0.5962, 3);
    expect(wilson(0, 10).lo).toBe(0);
    expect(wilson(10, 10).hi).toBeCloseTo(1, 9);
    expect(bandFlag(wilson(500, 1000))).toBe("ok");
    expect(bandFlag(wilson(60, 100))).toBe("edge");
    expect(bandFlag(wilson(90, 100))).toBe("out");
  });
});
