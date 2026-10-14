// HULL-ON run 6, H4's captain pass (REQ-BFG-092; cap's ruling b1053c5415e8c7dc = RULING-HULLON-R12 section 3 item 4,
// RULING-HULLON-R13 ed10dd26da1a89fb): the captains' plan numbers behind FREE_JOINS (src/sim/freeJoins.ts FREE_JOINS_PLANS, swapped into
// rivalBuilds.ts PLANS on guard.ts's hand-over form): on -> the table's, off -> each plan's own, withFreeJoins leaves the
// state it found, and the decks move by exactly those counts. No other plan number moves.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { FREE_JOINS, FREE_JOINS_PLANS, freeJoinsRules, setFreeJoins, withFreeJoins } from "../src/sim/freeJoins";
import { PLANS, planBuild } from "../src/sim/rivalBuilds";
import { rivalBuild, standInBuild } from "../src/sim/rivals";

afterEach(() => setFreeJoins(FREE_JOINS)); // the shipped value

const pack = ITEMS.plating.supply!.hull!;
/** Every plan number but the listed ones, as text (the listed paths blanked). */
const rest = (): string => {
  const c = JSON.parse(JSON.stringify(PLANS)) as Record<string, unknown>;
  for (const path of Object.keys(FREE_JOINS_PLANS)) {
    const keys = path.split("."), last = keys.pop()!;
    const at = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, c);
    delete at[last];
  }
  return JSON.stringify(c);
};

describe("HULL-ON: the captains' plan numbers behind FREE_JOINS (H4's captain pass)", () => {
  it("the table: KARSK's day-3 plate, day-9 road plates and two dusk packs; THISTLEMAIL's day-8 and day-10 packs", () => {
    expect(FREE_JOINS).toBe(true);
    expect(freeJoinsRules()).toBe(true);
    expect(FREE_JOINS_PLANS).toEqual({
      "karsk.pve.3": 1, "karsk.pveRoad.9": 1, "karsk.road.6.plating": 1, "karsk.road.10.plating": 0,
      "thistlemail.upgrades.12.plating": 1, "thistlemail.upgrades.14.plating": 1,
    });
    // the entries the paths name (so a re-ordered plan can't move the table onto another entry)
    expect(PLANS.karsk.road![6]).toMatchObject({ at: 8, dusk: true });
    expect(PLANS.karsk.road![10]).toMatchObject({ at: 9, dusk: true });
    expect(PLANS.thistlemail.upgrades[12]).toMatchObject({ at: 8 });
    expect(PLANS.thistlemail.upgrades[14]).toMatchObject({ at: 10 });
  });

  it("on (shipped): the table's numbers; off: each plan's own (bb-0.10.0's base); every other plan number unchanged", () => {
    const on = rest();
    expect([PLANS.karsk.pve![3], PLANS.karsk.pveRoad![9], PLANS.karsk.road![6].plating, PLANS.karsk.road![10].plating]).toEqual([1, 1, 1, 0]);
    expect([PLANS.thistlemail.upgrades[12].plating, PLANS.thistlemail.upgrades[14].plating]).toEqual([1, 1]);
    setFreeJoins(false);
    expect(3 in PLANS.karsk.pve!).toBe(false);
    expect([PLANS.karsk.pveRoad![9], PLANS.karsk.road![6].plating, PLANS.karsk.road![10].plating]).toEqual([2, 2, 1]);
    expect([PLANS.thistlemail.upgrades[12].plating, PLANS.thistlemail.upgrades[14].plating]).toEqual([3, 2]);
    expect(rest()).toBe(on);
    setFreeJoins(false); // the state it has: no change
    expect(PLANS.karsk.pveRoad![9]).toBe(2);
    setFreeJoins(true);
    expect(rest()).toBe(on);
    expect(PLANS.karsk.pve![3]).toBe(1);
  });

  it("withFreeJoins leaves the state it found, even when its function throws", () => {
    expect(withFreeJoins(() => PLANS.thistlemail.upgrades[12].plating, false)).toBe(3);
    expect(PLANS.thistlemail.upgrades[12].plating).toBe(1);
    expect(() => withFreeJoins(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(PLANS.karsk.pve![3]).toBe(1);
  });

  it("the decks move by exactly those counts (the road deck's PvE plates, the dusk deck's packs)", () => {
    const hull = (f: () => { hullBonus: number }) => [f().hullBonus, withFreeJoins(() => f().hullBonus, false)];
    const [k3on, k3off] = hull(() => rivalBuild("karsk", 3));
    expect(k3on - k3off).toBe(pack); // the day-3 plate
    const [k9on, k9off] = hull(() => rivalBuild("karsk", 9));
    expect(k9off - k9on).toBe(pack); // one road plate fewer on day 9
    const [s9on, s9off] = hull(() => standInBuild("karsk", 9));
    expect(s9off - s9on).toBe(2 * pack); // the day-8 pack and the day-9 pack
    const [t8on, t8off] = hull(() => standInBuild("thistlemail", 8));
    expect(t8off - t8on).toBe(2 * pack);
    const [t10on, t10off] = hull(() => standInBuild("thistlemail", 10));
    expect(t10off - t10on).toBe(3 * pack);
    // the warlord decks of days the table doesn't name are as before
    for (const d of [1, 2, 4, 5, 6, 7, 8, 10]) {
      const [on, off] = hull(() => rivalBuild("karsk", d));
      expect(on, `karsk day ${d}`).toBe(off);
    }
    expect(planBuild(PLANS.karsk, 9, "good").pvePlates).toBe(withFreeJoins(() => planBuild(PLANS.karsk, 9, "good").pvePlates, false) - 1);
  });
});
