import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { key as K, routeInfo, type Build } from "../src/sim/deck";
import { FUSE_MULT, SYNC_WINDOW, inSync } from "../src/sim/races/foundry";
import { raceRefBuild, raceStartBuild } from "../src/sim/races/refBuilds";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { buildCost, dummyFoe, expectLegal, expectSaneBattles, shots } from "./races.helpers";

const start = () => raceStartBuild("foundry", 1);
const withRouteB = (cells: number[]): Build => {
  const b = start();
  b.routes[1] = { factory: 1, cells };
  return b;
};

describe("FOUNDRY sync rule", () => {
  it("fuses only across different connectors within 0.25 s", () => {
    expect(SYNC_WINDOW).toBe(0.25);
    expect(inSync(0, false)).toBe(true);
    expect(inSync(0.249, false)).toBe(true);
    expect(inSync(15 / 60, false)).toBe(true);
    expect(inSync(0.26, false)).toBe(false);
    expect(inSync(0, true)).toBe(false); // same route/connector never fuses
  });

  it("mirrored routes into one gun fuse every pour: alloy slugs of 1.15 x (3.5 + 3.5)", () => {
    const b = new Battle(start(), dummyFoe(), 7);
    const fired = shots(b, 20);
    expect(b.sides[0].race!.foundry.fusions).toBeGreaterThanOrEqual(8);
    expect(fired.length).toBeGreaterThanOrEqual(8);
    for (const s of fired) {
      expect(s.ammo).toBe("alloy");
      expect(s.dmg).toBeCloseTo(FUSE_MULT * 7, 9);
    }
  });

  it("a flat bonus on one blank carries into the fusion: 1.15 x (5.5 + 3.5) = 10.35", () => {
    const b0 = start();
    b0.items.push({ uid: 2, def: "whetstone", x: 1, y: 3, rot: 1 }); // 0.6.2 BELTSIDE: west of (2,3) on route 0, facing it
    const fired = shots(new Battle(b0, dummyFoe(), 7), 20).filter((s) => s.ammo === "alloy");
    expect(fired.length).toBeGreaterThan(3);
    expect(fired[fired.length - 1].dmg).toBeCloseTo(10.35, 9);
  });

  it("a route 2 tiles longer (0.8 s late) never fuses, and every unmatched blank still fires", () => {
    const b0 = withRouteB([K(3, 5), K(4, 5), K(4, 4), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(3, 0)]);
    expect(routeInfo(b0, 1).connected).toBe(true);
    const bt = new Battle(b0, dummyFoe(), 7);
    const fired = shots(bt, 30);
    expect(bt.sides[0].race!.foundry.fusions).toBe(0);
    expect(fired.length).toBeGreaterThanOrEqual(20);
    for (const s of fired) {
      expect(s.ammo).toBe("blank");
      expect(s.dmg).toBe(3.5);
    }
  });

  it("blanks reaching different guns never fuse; both guns fire", () => {
    const cells = [K(4, 6), K(5, 6), K(6, 6), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)];
    const b0 = withRouteB(cells);
    expect(routeInfo(b0, 1).turret).toBe(1);
    const bt = new Battle(b0, dummyFoe(), 7);
    shots(bt, 30);
    expect(bt.sides[0].race!.foundry.fusions).toBe(0);
    const ids = new Set<number>();
    const b2 = new Battle(b0, dummyFoe(), 7);
    while (b2.t < 30) {
      b2.step();
      for (const ev of b2.events) if (ev.type === "fire" && ev.side === 0) ids.add(ev.turret);
      b2.events.length = 0;
    }
    expect([...ids].sort()).toEqual([0, 1]);
  });
});

describe("FOUNDRY fuse event (ruling 10)", () => {
  it("every fusion emits one fuse event with the gun and the alloy slug's damage", () => {
    const b = new Battle(start(), dummyFoe(), 7);
    const fuses: { turret: number; dmg: number }[] = [];
    while (b.t < 20) {
      b.step();
      for (const ev of b.events) if (ev.type === "fuse" && ev.side === 0) fuses.push({ turret: ev.turret, dmg: ev.dmg });
      b.events.length = 0;
    }
    expect(fuses.length).toBe(b.sides[0].race!.foundry.fusions);
    expect(fuses.length).toBeGreaterThanOrEqual(8);
    for (const f of fuses) expect(f).toEqual({ turret: 0, dmg: FUSE_MULT * 7 });
  });

  it("Furnace and Weaver battles never emit one", () => {
    for (const [a, b] of [["furnace", "weaver"], ["weaver", "furnace"], ["furnace", "furnace"], ["weaver", "weaver"]] as const) {
      for (const d of [1, 5, 10]) {
        const bt = new Battle(heroRefBuild(a, d), heroRefBuild(b, d), d * 97);
        let fuse = 0;
        while (!bt.over) {
          bt.step();
          for (const ev of bt.events) if (ev.type === "fuse") fuse++;
          bt.events.length = 0;
        }
        expect(fuse).toBe(0);
      }
    }
  });
});

describe("FOUNDRY reference builds", () => {
  it("are legal, honestly priced and escalate on every day 1-10", () => {
    let prev = -1;
    for (let d = 1; d <= 10; d++) {
      const w = raceRefBuild("foundry", d);
      expectLegal(w, d);
      expect(buildCost(w)).toBeGreaterThan(prev);
      prev = buildCost(w);
    }
    // 0.8.0 B1 M1 (oracle 60ce2081b6171361): the mirrored rigs are other parts on the second belt (refBuilds.ts STEPS)
    expect(buildCost(raceRefBuild("foundry", 1))).toBe(7);
    expect(buildCost(raceRefBuild("foundry", 10))).toBe(62); // 47 g of parts + 3 plates (nearest-plate ramp)
    expectLegal(start(), 1);
  });

  it("battles vs Furnace and Weaver (start and days 1/5/10, 10 seeds, both sides) end before the cap with no NaN", () => {
    expectSaneBattles("foundry", ["furnace", "weaver"]);
  });
});
