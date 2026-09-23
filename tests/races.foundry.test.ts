import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { key as K, routeInfo, type Build } from "../src/sim/deck";
import { FUSE_MULT, SYNC_WINDOW, inSync } from "../src/sim/races/foundry";
import { raceWarlordBuild, startingRaceBuild } from "../src/sim/races/warlords";
import { buildCost, dummyFoe, expectLegal, expectSaneBattles, shots } from "./races.helpers";

const start = () => startingRaceBuild("foundry", 1);
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

  it("mirrored routes into one gun fuse every pour: alloy slugs of 1.5 x (3 + 3)", () => {
    const b = new Battle(start(), dummyFoe(), 7);
    const fired = shots(b, 20);
    expect(b.sides[0].race!.foundry.fusions).toBeGreaterThanOrEqual(8);
    expect(fired.length).toBeGreaterThanOrEqual(8);
    for (const s of fired) {
      expect(s.ammo).toBe("alloy");
      expect(s.dmg).toBeCloseTo(FUSE_MULT * 6, 9);
    }
  });

  it("a flat bonus on one blank carries into the fusion: 1.5 x (5 + 3) = 12", () => {
    const b0 = start();
    b0.items.push({ uid: 2, def: "whetstone", x: 2, y: 3 });
    const fired = shots(new Battle(b0, dummyFoe(), 7), 20).filter((s) => s.ammo === "alloy");
    expect(fired.length).toBeGreaterThan(3);
    expect(fired[fired.length - 1].dmg).toBeCloseTo(12, 9);
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
      expect(s.dmg).toBe(3);
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

describe("FOUNDRY warlords", () => {
  it("are legal and escalate at every round 1-12", () => {
    let prev = -1;
    for (let r = 1; r <= 12; r++) {
      const w = raceWarlordBuild("foundry", r);
      expectLegal(w, r);
      expect(buildCost(w)).toBeGreaterThanOrEqual(prev);
      prev = buildCost(w);
    }
    expect(buildCost(raceWarlordBuild("foundry", 5))).toBe(14);
    expect(buildCost(raceWarlordBuild("foundry", 10))).toBe(33);
    expectLegal(start(), 1);
  });

  it("battles vs Furnace and Weaver (start and warlords, 10 seeds, both sides) end before the cap with no NaN", () => {
    expectSaneBattles(start(), (r) => raceWarlordBuild("foundry", r));
  });
});
