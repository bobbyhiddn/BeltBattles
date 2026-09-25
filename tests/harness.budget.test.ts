// Harness v2 part 2 fix pass (REQ-BFG-005, REQ-BFG-019): the day's gold pays for the deck AND the cargo. Two
// after-the-fact budget checks compared the deck alone with the budget (levers.ts pressLine, used by the press
// and drop levers; shopper.ts moveRoute, used by the route and sync levers), so with stars on + cores on a
// drop could leave deck + cargo above the day's gold (verify11: 1 build in 7,200). Both now use Shopper.left(),
// which subtracts the cargo. With cores off the cargo is always empty, so both checks are unchanged there.
// The lever-by-lever scan is tests/harness.budget.scan.test.ts (its own file, so the two scans run in parallel).
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { buildCost, maxGoldByDay } from "../src/net/validate";
import { FUSE_MAX } from "../src/sim/stars";
import { fullPurseBuild, shopBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroStartBuild } from "../src/sim/harness/heroes";
import { cargoValue } from "../src/sim/harness/merge";
import { Shopper } from "../src/sim/harness/shopper";
import { encodeStarred } from "../src/sim/harness/standinCode";
import { STANDIN_DEFAULTS, dataModuleText, writtenProblems, type HeroDay } from "../src/sim/harness/standins";

/** Gold the shopper has spent: the deck's value plus the cargo's (cores swapped off a full socket). */
const spent = (s: Shopper): number => buildCost(s.b).total + cargoValue(s.cargo);
const SCAN_SEEDS = Number(process.env.BUDGET_SCAN_SEEDS ?? 60);

describe("harness budget (fix pass): deck + cargo within the day's gold", () => {
  it("regression (verify11): siphon day 7, seed v11-on #6, stars on + cores on stays within the day's gold after every lever (4dce097: a drop took deck 49 + cargo 10 to deck 69 + cargo 10 = 79 > 77)", () => {
    const over: string[] = [];
    let cargoAtDrop = 0;
    const r = shopBuild("siphon", 7, new Rng(hashSeed("v11-on", "siphon", 7, 6)), "on", FUSE_MAX, "on", (s, l, ok) => {
      if (l === "drop" && s.cargo.length) cargoAtDrop++;
      if (spent(s) > maxGoldByDay(7)) over.push(`after ${l} (${ok}): deck ${buildCost(s.b).total} + cargo ${cargoValue(s.cargo)} > ${maxGoldByDay(7)}`);
    });
    expect(over).toEqual([]);
    expect(buildCost(r.build).total + cargoValue(r.cargo)).toBeLessThanOrEqual(maxGoldByDay(7));
    // the premise still holds: cores sit in cargo and the drop lever is tried with that cargo on board
    expect(cargoValue(r.cargo)).toBeGreaterThan(0);
    expect(cargoAtDrop).toBeGreaterThan(0);
  });

  it(`scan, stars on + cores on: fullPurseBuild outputs (all six heroes, days 1-10, ${SCAN_SEEDS} seeds) keep cost + cargoGold within the day's gold`, () => {
    const over: string[] = [];
    let purses = 0, purseCargo = 0;
    for (const hero of HARNESS_HEROES) {
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < SCAN_SEEDS; i++) {
          const f = fullPurseBuild(hero, day, hashSeed("budget-fp", hero, day, i), undefined, 60, "on", FUSE_MAX, "on");
          purses++;
          if (f.cargoGold) purseCargo++;
          expect(f.cost).toBe(buildCost(f.build).total);
          expect(f.cargoGold === undefined || f.cargoGold > 0).toBe(true);
          if (f.cost + (f.cargoGold ?? 0) > maxGoldByDay(day)) over.push(`fullPurseBuild ${hero} d${day} #${i}: cost ${f.cost} + cargoGold ${f.cargoGold} > ${maxGoldByDay(day)}`);
        }
      }
    }
    expect(over).toEqual([]);
    expect(purses).toBe(HARNESS_HEROES.length * 10 * SCAN_SEEDS);
    expect(purseCargo).toBeGreaterThan(purses / 20); // the scan really covers full-purse builds holding cargo
  }, 600_000);

  it("moveRoute (route and sync levers) keeps a move only while deck + cargo fit the budget: the same move goes through without the cargo and is undone with it", () => {
    for (const hero of HARNESS_HEROES) {
      const run = (withCargo: boolean) => {
        const b = heroStartBuild(hero, 1);
        const s = new Shopper(b, buildCost(b).total + 1, 5, new Rng(hashSeed("budget-move", hero)), "on", FUSE_MAX, "on");
        if (withCargo) s.cargo = [{ uid: 900, def: "rotary" }]; // a swapped-out core: its gold is spent, so left() < 0
        const before = JSON.stringify(b);
        const ok = s.moveRoute(0);
        return { ok, moved: JSON.stringify(b) !== before, left: s.left() };
      };
      const free = run(false), held = run(true);
      expect(free.ok, `${hero}: without cargo the reroute goes through`).toBe(true);
      expect(free.left).toBeGreaterThanOrEqual(0);
      expect(held, `${hero}: with the cargo's gold spent the reroute is undone`).toMatchObject({ ok: false, moved: false });
    }
  });

  it("the written-module guard counts a stand-in's cargo against the day's gold (the generator's check uses the same sum)", () => {
    const o = { ...STANDIN_DEFAULTS, stars: "on" as const, cores: "on" as const };
    const b = heroStartBuild("furnace", 1);
    const cost = buildCost(b).total, gold = maxGoldByDay(1);
    const pick = (cargoGold?: number) => ({ idx: 0, build: b, code: encodeStarred(b), cost, tries: 1, floorMet: true, score: 0.5, pct: 50, vsRef: {}, vsPar: 1, ...(cargoGold ? { cargoGold } : {}) });
    const hd = (cargoGold?: number) => ({ hero: "furnace", day: 1, budget: gold, floor: 0, pop: [], picks: [pick(cargoGold)], par: 0, window: [40, 60], relax: "none", widened: false, short: false, elites: [], parVsRef: {}, parVsElites: 0, robustRemoved: 0, robustReplayed: 0, capAffected: 0, capWould3: 0 }) as unknown as HeroDay;
    const over = (cargoGold?: number) => writtenProblems(o, [hd(cargoGold)], dataModuleText(o, [hd(cargoGold)])).filter((p) => p.includes("maxGoldByDay"));
    expect(cost).toBeLessThan(gold);
    expect(over()).toEqual([]);
    expect(over(gold - cost)).toEqual([]); // deck + cargo exactly the day's gold
    expect(over(gold - cost + 1)).toEqual([`stand-in furnace d1 #0: stored deck + cargo ${gold - cost + 1} g costs more than maxGoldByDay`]);
  });
});
