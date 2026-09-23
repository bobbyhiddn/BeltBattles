import { describe, expect, it } from "vitest";
import { warlordBuild, warlordHull } from "../src/sim/ai";
import { routeInfo, type Build } from "../src/sim/deck";
import { HEROES, ITEMS, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import {
  RIVALS, RIVAL_IDS, RUN_DAYS, deckCost, honestReference, maxGoldByDay, rampPlates, rivalBuild, rivalLoadout,
  standInBuild, standInGhosts,
} from "../src/sim/rivals";
import { legalityProblems } from "./rivals.legality";

// Rulings R1 and R2 (Part 4): every dusk opponent is an honest deck a player could own. The async
// validator (src/net, not in this series) is mirrored here: whole +25 plating, whole +4 belt crates,
// every belt reaching a turret, and cost <= maxGoldByDay(day). The Prime re-runs the real validator.

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");

/** The validator's budget, written out independently: START_GOLD + incomeFor(d, true) for d < day. */
function validatorBudget(day: number): number {
  let g = START_GOLD;
  for (let d = 1; d < day; d++) g += incomeFor(d, true);
  return g;
}

describe("honest-deck helpers mirror the async validator", () => {
  it("maxGoldByDay is START_GOLD plus every winning day's income before the fight", () => {
    expect(DAYS.map(maxGoldByDay)).toEqual([8, 17, 27, 38, 50, 63, 77, 91, 105, 119]);
    for (const d of DAYS) expect(maxGoldByDay(d)).toBe(validatorBudget(d));
  });

  it("rampPlates converts the warlord hull ramp to whole plates: 0 (days 1-4), 1, 1, 2, 2, 2, 3", () => {
    expect(DAYS.map(rampPlates)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 2, 3]);
    for (const d of DAYS) expect(rampPlates(d)).toBe(Math.max(0, Math.round(warlordHull(d) / 25)));
  });

  it("deckCost is the validator's buildCost: items, mods, crates above the hero's belt, plating", () => {
    const b: Build = {
      hero: "furnace",
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 },
        { uid: 3, def: "temper", x: 4, y: 3 }, { uid: 4, def: "splitter", x: 4, y: 2 },
      ],
      routes: [], mods: [{ uid: 5, def: "calibrate", turret: 0 }], beltCap: 14 + 8, hullBonus: 50,
    };
    expect(deckCost(b)).toEqual({ items: 0 + 8 + 3 + 7, mods: 5, crates: 2, plates: 2, total: 18 + 5 + 2 * 2 + 2 * 5 });
    // ceil on partial supplies, never below 0, and unknown ids cost 0, exactly as buildCost does
    expect(deckCost({ ...b, beltCap: 15, hullBonus: 6 })).toMatchObject({ crates: 1, plates: 1 });
    expect(deckCost({ ...b, beltCap: 10, hullBonus: -27 })).toMatchObject({ crates: 0, plates: 0, total: 23 });
    expect(deckCost({ ...b, items: [...b.items, { uid: 9, def: "nonsense", x: 0, y: 0 }] }).items).toBe(18);
    expect(deckCost({ ...b, hero: "weaver", beltCap: 24 }).crates).toBe(0);
    expect([ITEMS.beltcrate.price, ITEMS.plating.price, ITEMS.beltcrate.supply!.belt, ITEMS.plating.supply!.hull]).toEqual([2, 5, 4, 25]);
  });
});

describe("stand-in decks are honest (R1, R2)", () => {
  for (const id of STAND_INS) {
    it(`${id}: legal, whole plating and crates, every belt reaches a turret, affordable on days 1-10`, () => {
      for (const day of DAYS) {
        const b = standInBuild(id, day);
        const w = rivalBuild(id, day);
        const l = rivalLoadout(id, day);
        const why = `${id} day ${day}`;
        expect(legalityProblems(b), why).toEqual([]);
        expect(b.hullBonus, why).toBeGreaterThanOrEqual(0);
        expect(b.hullBonus % 25, why).toBe(0);
        expect(b.hullBonus, why).toBe(25 * (l.plating + rampPlates(day)));
        expect((b.beltCap - HEROES[b.hero].belt) % 4, why).toBe(0);
        b.routes.forEach((_, i) => expect(routeInfo(b, i).connected, `${why} route ${i}`).toBe(true));
        expect(deckCost(b).total, why).toBeLessThanOrEqual(maxGoldByDay(day));
        expect(deckCost(b).total, why).toBe(l.value + 5 * rampPlates(day));
        // one plan, two decks: only the hull differs from the warlord deck
        expect({ ...b, hullBonus: 0 }, why).toEqual({ ...w, hullBonus: 0 });
        expect(w.hullBonus, why).toBe(warlordHull(day) + 25 * l.plating);
      }
    });
  }

  it("the Matriarch never stands in, so her deck alone may exceed the budget", () => {
    for (let seed = 0; seed < 200; seed++) expect(standInGhosts(seed)).not.toContain("matriarch");
    expect(RIVALS.matriarch.rank).toBe("boss");
  });

  it("honestReference: the day's warlord with its ramp as whole plates; legal and affordable", () => {
    for (const hero of ["furnace", "weaver"] as HeroId[]) {
      for (const day of DAYS) {
        const r = honestReference(hero, day);
        const w = warlordBuild(hero, day);
        expect(r.hullBonus).toBe(25 * rampPlates(day));
        expect({ ...r, hullBonus: 0 }).toEqual({ ...w, hullBonus: 0 });
        expect(legalityProblems(r), `${hero} day ${day}`).toEqual([]);
        expect(deckCost(r).total, `${hero} day ${day}`).toBeLessThanOrEqual(maxGoldByDay(day));
      }
    }
  });
});
