// HULL-1d (REQ-BFG-079; BRIEF-HULL1D 2 (b); REVIEW-HULL1C Q5; cap's ruling 52d14c43f15a9e68): S(d), the sustain day term
// behind HULL_SCALE, the full step: S = M on every day (hullScale.ts sustMulTenths, derived from dayMulTenths). Every heal
// lands x S (Battle.heal), with D's integer rule and the remainder carried on the healed hull; every PLATE gain lands x S
// (Battle.addPlate) up to the pool's own cap, PLATE_CAP x S; a battle reads S once, only on the day's hull (HULL_SCALE on and
// a day); with the switch off, or no day, S = 1 and every heal and plate is exactly its number. Switches only through
// withHullScale.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import type { HeroId } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { dayMulTenths, hullScaleRules, sustDayScale, sustMul, sustMulTenths, sustShown, sustUnit, withHullScale } from "../src/sim/hullScale";

const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });
const battle = (day?: number): Battle => new Battle(silent("bastion", 1), silent("weaver", 101), 7, undefined, day);

describe("HULL-1d: S(d), the sustain day term (S = M)", () => {
  it("S is M on every day, derived (days 1-40); no day or a day below 1 is 1; the read-out helper follows the switch", () => {
    for (let d = 1; d <= 40; d++) expect(sustMulTenths(d)).toBe(dayMulTenths(d));
    expect([sustMulTenths(undefined), sustMulTenths(0), sustMul(1), sustMul(10)]).toEqual([10, 10, 1, 6]);
    expect(sustShown(13, 10)).toBe(13); // the switch off: the number itself
    expect(withHullScale(() => [sustShown(13, 10), sustShown(13, 5), sustShown(13, undefined)])).toEqual([78, 36, 13]);
    expect([sustUnit(240, 60), sustUnit(10, 28), sustUnit(10, 10)]).toEqual([1440, 28, 10]);
    expect(hullScaleRules()).toBe(false);
  });

  it("the integer rule: n x S rounded down, the remainder carried (D's rule, its own counter)", () => {
    const c: { sustRem?: number } = {};
    expect([sustDayScale(7, 14, c), c.sustRem]).toEqual([9, 8]); // 9.8 -> 9, 0.8 carried
    expect(sustDayScale(7, 14, c)).toBe(10); // 9.8 + 0.8 = 10.6 -> 10
    const c2: { sustRem?: number } = {};
    expect([sustDayScale(50, 10, c2), c2.sustRem]).toEqual([50, undefined]); // S = 1: untouched, no counter
  });

  it("a battle's S: only on the day's hull; a heal lands x S with its remainder kept on that hull; off or no day, the heal as written", () => {
    expect(battle(10).sustTenths).toBe(10); // the switch off
    expect(withHullScale(() => battle()).sustTenths).toBe(10); // no day
    for (const day of [1, 2, 5, 10]) {
      const bt = withHullScale(() => battle(day));
      expect(bt.sustTenths).toBe(dayMulTenths(day));
      const s = bt.sides[0];
      s.hull.hp = Math.floor(s.hull.max / 2); // room to heal (a heal never passes max hull; a dead hull heals nothing)
      const t = dayMulTenths(day);
      const a = bt.heal(s, 7, "rune"), b = bt.heal(s, 7, "rune");
      expect(a).toBe(Math.floor((7 * t) / 10));
      expect(a + b).toBe(Math.floor((14 * t) / 10)); // the remainder carried: two heals of 7 land as one of 14
      const off = battle(day), so = off.sides[0];
      so.hull.hp = Math.floor(so.hull.max / 2);
      expect(off.heal(so, 7, "rune")).toBe(7);
    }
  });

  it("PLATE: every gain lands x S, up to the pool's own cap PLATE_CAP x S; off, the cap is PLATE_CAP and the gain as written", () => {
    for (const day of [2, 5, 10]) {
      const bt = withHullScale(() => battle(day));
      const s = bt.sides[0], t = dayMulTenths(day);
      expect(s.plate.cap).toBe(Math.floor((PLATE_CAP * t) / 10));
      expect(bt.addPlate(s, 50)).toBe(Math.floor((50 * t) / 10));
      for (let i = 0; i < 100; i++) bt.addPlate(s, 50);
      expect(s.plate.plate).toBe(s.plate.cap); // full at its own cap
    }
    const off = battle(10), so = off.sides[0];
    expect(so.plate.cap).toBeUndefined();
    expect(off.addPlate(so, 50)).toBe(50);
    for (let i = 0; i < 100; i++) off.addPlate(so, 50);
    expect(so.plate.plate).toBe(PLATE_CAP);
  });
});
