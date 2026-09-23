import { describe, expect, it } from "vitest";
import { Battle, simulate, type Payload } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import { PLATE_CAP, PLATE_PER_SLUG, absorb, newPlateState, plateFor, plateOnLoad } from "../src/sim/races/bastion";
import { raceWarlordBuild, startingRaceBuild } from "../src/sim/races/warlords";
import { buildCost, dummyFoe, expectLegal, expectSaneBattles } from "./races.helpers";

const start = () => startingRaceBuild("bastion", 1);
const slug = (ammo: Payload["ammo"], mult = 1): Payload => ({
  id: 1, ammo, ride: 0, mult, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false,
});

describe("BASTION plating rule", () => {
  it("a bulwark slug plates 2 x its split multiplier; other ammo plates nothing", () => {
    expect(plateFor(slug("bulwark"))).toBe(PLATE_PER_SLUG);
    expect(plateFor(slug("bulwark", 0.6))).toBeCloseTo(PLATE_PER_SLUG * 0.6, 12);
    expect(plateFor(slug("plain"))).toBe(0);
  });

  it("plating respects the cap and absorbs point for point", () => {
    const st = newPlateState();
    for (let i = 0; i < 40; i++) plateOnLoad(st, slug("bulwark"));
    expect(st.plate).toBe(PLATE_CAP);
    expect(absorb(st, 5)).toBe(0);
    expect(st.plate).toBe(PLATE_CAP - 5);
    expect(absorb(st, 100)).toBe(100 - (PLATE_CAP - 5));
    expect(st.plate).toBe(0);
    expect(absorb(st, 3)).toBe(3);
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
      expect(me.hull.max - me.hull.hp).toBeCloseTo(foe.stats.damage - me.race!.plating.absorbed + me.stats.windTaken, 6);
    }
  });
});

describe("BASTION warlords", () => {
  it("are legal and escalate at every round 1-12", () => {
    let prev = -1;
    for (let r = 1; r <= 12; r++) {
      const w = raceWarlordBuild("bastion", r);
      expectLegal(w, r);
      expect(buildCost(w)).toBeGreaterThanOrEqual(prev);
      prev = buildCost(w);
    }
    expect(buildCost(raceWarlordBuild("bastion", 5))).toBe(14);
    expect(buildCost(raceWarlordBuild("bastion", 10))).toBe(33);
    expectLegal(start(), 1);
  });

  it("battles vs Furnace and Weaver (start and warlords, 10 seeds, both sides) end before the cap with no NaN", () => {
    expectSaneBattles(start(), (r) => raceWarlordBuild("bastion", r));
  });
});
