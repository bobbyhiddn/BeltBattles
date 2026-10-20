import { describe, expect, it } from "vitest";
import { warlordBuild, warlordHull } from "../src/sim/ai";
import { routeInfo, type Build } from "../src/sim/deck";
import { HEROES, ITEMS, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import {
  RIVALS, RIVAL_IDS, RUN_DAYS, deckCost, honestReference, luckOf, maxGoldByDay, rampPlates, rivalBuild, rivalLoadout,
  standInBuild, standInGhosts,
} from "../src/sim/rivals";
import { legalityProblems } from "./rivals.legality";
import { CAPTAIN_RUNES, roadAllowance } from "../src/sim/rivalBuilds"; // FLIP-X2: the stand-in holds the captain's runes; AZ-BUMP: the road allowance
import { boughtCost } from "../src/sim/harness/standins"; // FLIP-X2: a captain deck valued as bought
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: the runes' grants and dawn gold
import { withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): the plan identities with NPC_DAY off
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): 0.9.7's gold table with HULL_SCALE off
import { withNpcWords } from "../src/sim/npcWords"; // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2): the plan identities read the decks without the rivals' own words

// Rulings R1 and R2 (Part 4): every dusk opponent is an honest deck a player could own. The async
// validator (src/net, not in this series) is mirrored here: whole +250 plating (NUM-1: x10, was +25), whole +4 belt crates,
// every belt reaching a turret, and cost <= maxGoldByDay(day). The Prime re-runs the real validator.

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");
/** NUM-1 (REQ-BFG-047): one ARMOR PLATING's hull, read from the data (250; was the literal 25); pinned below. */
const PLATE = ITEMS.plating.supply!.hull!;

/** The validator's budget, written out independently: START_GOLD + incomeFor(d, true) for d < day. */
function validatorBudget(day: number): number {
  let g = START_GOLD;
  for (let d = 1; d < day; d++) g += incomeFor(d, true);
  return g;
}

describe("honest-deck helpers mirror the async validator", () => {
  it("maxGoldByDay is START_GOLD plus every winning day's income before the fight", () => {
    // AZ-BUMP (the flip, HULL_SCALE): [.., 91, 105, 119] -> [.., 92, 108, 125], the winning income 6 + min(day, 10) + 2 (was
    // min(day, 6)); with the switch off, 0.9.7's table
    expect(DAYS.map(maxGoldByDay)).toEqual([8, 17, 27, 38, 50, 63, 77, 92, 108, 125]);
    expect(withHullScale(() => DAYS.map(maxGoldByDay), false)).toEqual([8, 17, 27, 38, 50, 63, 77, 91, 105, 119]);
    for (const d of DAYS) expect(maxGoldByDay(d)).toBe(validatorBudget(d));
  });

  it("rampPlates converts the warlord hull ramp to whole plates: 0 (days 1-4), 1, 1, 2, 2, 2, 3", () => {
    expect(DAYS.map(rampPlates)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 2, 3]);
    for (const d of DAYS) expect(rampPlates(d)).toBe(Math.max(0, Math.round(warlordHull(d) / PLATE))); // NUM-1: / 250 (was / 25)
  });

  it("deckCost is the validator's buildCost: items, mods, crates above the hero's belt, plating", () => {
    const b: Build = {
      hero: "furnace",
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 },
        { uid: 3, def: "temper", x: 4, y: 3 }, { uid: 4, def: "splitter", x: 4, y: 2 },
      ],
      routes: [], mods: [{ uid: 5, def: "calibrate", turret: 0 }], beltCap: 14 + 8, hullBonus: 500, // NUM-1: x10 (was 50): 2 plates
    };
    expect(deckCost(b)).toEqual({ items: 0 + 8 + 3 + 7, mods: 5, crates: 2, plates: 2, total: 18 + 5 + 2 * 2 + 2 * 5 });
    // ceil on partial supplies, never below 0, and unknown ids cost 0, exactly as buildCost does
    expect(deckCost({ ...b, beltCap: 15, hullBonus: 60 })).toMatchObject({ crates: 1, plates: 1 }); // NUM-1: x10 (was 6)
    expect(deckCost({ ...b, beltCap: 10, hullBonus: -270 })).toMatchObject({ crates: 0, plates: 0, total: 23 }); // NUM-1: x10 (was -27)
    expect(deckCost({ ...b, items: [...b.items, { uid: 9, def: "nonsense", x: 0, y: 0 }] }).items).toBe(18);
    expect(deckCost({ ...b, hero: "weaver", beltCap: 24 }).crates).toBe(0);
    expect([ITEMS.beltcrate.price, ITEMS.plating.price, ITEMS.beltcrate.supply!.belt, ITEMS.plating.supply!.hull]).toEqual([2, 5, 4, 250]); // NUM-1: plate hull x10 (was 25); PLATE above
  });
});

describe("stand-in decks are honest (R1, R2)", () => {
  for (const id of STAND_INS) {
    it(`${id}: legal, whole plating and crates, every belt reaches a turret, affordable on days 1-10`, () => {
      for (const day of DAYS) {
        const b = standInBuild(id, day);
        const w = rivalBuild(id, day);
        // 0.6.2 TUNE-C (REQ-BFG-033): the stand-in is the plan at ORDINARY luck; the warlord deck at its slot's luck
        const l = rivalLoadout(id, day, "ordinary"), lw = rivalLoadout(id, day);
        const why = `${id} day ${day}`;
        expect(legalityProblems(b), why).toEqual([]);
        // FLIP-X2 (REVIEW-BOTSX section 5): the stand-in holds the captain's runes (CAPTAIN_RUNES up to its day, the HULL and
        // BELT runes' grants on the build), so each check below reads the deck as bought (the runes' grants out) and the
        // rune list on its own: exactly the first `day` of the captain's list (was the deck as it was, rune-less)
        const g = runeGrants(b.runes, day);
        expect(b.runes, why).toEqual((CAPTAIN_RUNES[id] ?? []).slice(0, day).map((q) => ({ id: q })));
        const hull = b.hullBonus - g.hull, belt = b.beltCap - g.belt;
        expect(hull, why).toBeGreaterThanOrEqual(0);
        expect(hull % PLATE, why).toBe(0); // NUM-1: whole 250-hull plates (was % 25)
        expect((belt - HEROES[b.hero].belt) % 4, why).toBe(0);
        b.routes.forEach((_, i) => expect(routeInfo(b, i).connected, `${why} route ${i}`).toBe(true));
        // AZ-BUMP (the flip, NPC_DAY): + the dusk deck's road allowance (REFIT-AZ's road additions; roadAllowance, 0 off), as
        // captains.luck's R1
        expect(boughtCost(b), why).toBeLessThanOrEqual(maxGoldByDay(day) + g.gold + roadAllowance(day, "dusk"));
        // AZ-BUMP (the flip, NPC_DAY): the plan identities below (the hull and the value are the plan's; one plan, two decks)
        // mean the plan without REFIT-AZ's road additions (with the NPC day on, the dusk deck holds its dusk ones and the plan
        // loadouts their road deck's), so they read the decks with NPC_DAY off; refitaz.road checks the on decks
        // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2): + the rivals' own words off (withNpcWords false; was no wrapper): from day 5 the stand-in and the road deck
        // carry the captain's words (npcWords.ts captainWordsOn, ENCHANT on) and the plan loadout `l` carries none, so the plan identities compare the decks without the word
        // (the rival's words on the same day are enchant2.npcwords's: its test proves the stand-in and the warlord hold the same ones)
        withNpcDay(() => withNpcWords(() => {
          const b = standInBuild(id, day), w = rivalBuild(id, day), l = rivalLoadout(id, day, "ordinary");
          const g = runeGrants(b.runes, day), hull = b.hullBonus - g.hull, belt = b.beltCap - g.belt;
          expect(hull, why).toBe(PLATE * (l.plating + rampPlates(day))); // NUM-1: 250 x (was 25 x)
          expect(boughtCost(b), why).toBe(l.value + 5 * rampPlates(day));
          // one plan, two decks: only the hull differs from the plan at ordinary luck, which is the warlord deck of an
          // Easy or Medium captain; a Hard warlord adds what good luck brings (and brings sooner)
          const { runes: _runes, ...plain } = b;
          expect({ ...plain, hullBonus: 0, beltCap: belt }, why).toEqual({ ...l.build, hullBonus: 0 });
          if (luckOf(id) === "ordinary") expect({ ...b, hullBonus: 0 }, why).toEqual({ ...w, hullBonus: 0 });
        }, false), false);
        // 0.8.9 (CATCHUP-089 fallback 2): the road deck may carry free PvE plates (good luck only, so a Hard captain's);
        // the stand-in's ordinary plan never owns one, and its hull above is the paid plating alone
        expect(l.pvePlates, why).toBe(0);
        // FLIP-X2: the road deck holds the same runes, their hull on top (runeGrants)
        expect(w.hullBonus, why).toBe(warlordHull(day) + PLATE * (lw.plating + lw.pvePlates) + runeGrants(w.runes, day).hull); // NUM-1: 250 x (was 25 x)
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
        expect(r.hullBonus).toBe(PLATE * rampPlates(day)); // NUM-1: 250 x (was 25 x)
        expect({ ...r, hullBonus: 0 }).toEqual({ ...w, hullBonus: 0 });
        expect(legalityProblems(r), `${hero} day ${day}`).toEqual([]);
        expect(deckCost(r).total, `${hero} day ${day}`).toBeLessThanOrEqual(maxGoldByDay(day));
      }
    }
  });
});
