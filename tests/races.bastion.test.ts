import { describe, expect, it } from "vitest";
import { Battle, simulate, type Payload } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import { PLATE_CAP, PLATE_PER_SLUG, absorb, newPlateState, plateFor, plateOnLoad } from "../src/sim/races/bastion";
import { raceRefBuild, raceStartBuild } from "../src/sim/races/refBuilds";
import { roundHalfUp } from "../src/sim/pct";
import { buildCost, dummyFoe, expectLegal, expectSaneBattles } from "./races.helpers";

const start = () => raceStartBuild("bastion", 1);
const slug = (ammo: Payload["ammo"], mult = 1): Payload => ({
  id: 1, ammo, ride: 0, mult, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false,
});

describe("BASTION plating rule", () => {
  it("a bulwark slug plates 20 x its split multiplier; other ammo plates nothing", () => {
    expect(plateFor(slug("bulwark"))).toBe(PLATE_PER_SLUG);
    expect(plateFor(slug("bulwark", 0.6))).toBe(roundHalfUp(PLATE_PER_SLUG * 0.6)); // NUM-1: whole: 20 x 0.6 = 12 (was 2 x 0.6 = 1.2)
    expect(plateFor(slug("plain"))).toBe(0);
  });

  it("plating respects the cap and absorbs point for point", () => {
    const st = newPlateState();
    for (let i = 0; i < 40; i++) plateOnLoad(st, slug("bulwark"));
    expect(st.plate).toBe(PLATE_CAP);
    // NUM-1: the hits x10 (were 5, 100, 3) with the plating (PLATE_CAP 24 -> 240), so the big hit still breaks through
    expect(absorb(st, 50)).toBe(0);
    expect(st.plate).toBe(PLATE_CAP - 50);
    expect(absorb(st, 1000)).toBe(1000 - (PLATE_CAP - 50));
    expect(st.plate).toBe(0);
    expect(absorb(st, 30)).toBe(30);
  });

  it("plating applies when a slug reaches the chamber, climbs to the cap and never passes it", () => {
    const b = new Battle(start(), dummyFoe(), 3);
    const ps = b.sides[0].race!.plating;
    let firstLoadPlate = -1;
    let max = 0;
    while (b.t < 40) {
      b.step();
      for (const ev of b.events) if (ev.type === "load" && ev.side === 0 && firstLoadPlate < 0) firstLoadPlate = ps.plate;
      b.events.length = 0;
      max = Math.max(max, ps.plate);
      expect(ps.plate).toBeLessThanOrEqual(PLATE_CAP);
    }
    expect(firstLoadPlate).toBe(PLATE_PER_SLUG);
    expect(max).toBe(PLATE_CAP);
    expect(ps.plate).toBe(PLATE_CAP); // no decay, and the dark wind bypasses plating
    expect(b.sides[0].stats.windTaken).toBeGreaterThan(0);
  });

  it("hull loss = enemy damage - plating absorbed + dark wind", () => {
    for (const seed of [1, 2, 3]) {
      const bt = simulate(start(), startingBuild("furnace", 50), seed);
      const me = bt.sides[0], foe = bt.sides[1];
      expect(me.race!.plating.absorbed).toBeGreaterThan(0);
      // NUM-1: every amount here is whole, so the balance is exact
      expect(me.hull.max - me.hull.hp).toBe(foe.stats.damage - me.race!.plating.absorbed + me.stats.windTaken);
    }
  });
});

describe("BASTION reference builds", () => {
  it("are legal, honestly priced and escalate on every day 1-10", () => {
    let prev = -1;
    for (let d = 1; d <= 10; d++) {
      const w = raceRefBuild("bastion", d);
      expectLegal(w, d);
      expect(buildCost(w)).toBeGreaterThan(prev);
      prev = buildCost(w);
    }
    expect(buildCost(raceRefBuild("bastion", 1))).toBe(6);
    // 0.8.0 B1 M1 (oracle 60ce2081b6171361): the press belt has its own rigs from day 6 (refBuilds.ts STEPS)
    expect(buildCost(raceRefBuild("bastion", 10))).toBe(64); // 49 g of parts + 3 plates (nearest-plate ramp)
    expectLegal(start(), 1);
  });

  it("battles vs Furnace and Weaver (start and days 1/5/10, 10 seeds, both sides) end before the cap with no NaN", () => {
    expectSaneBattles("bastion", ["furnace", "weaver"]);
  });
});
