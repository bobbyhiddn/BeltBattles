import { describe, expect, it } from "vitest";
// 0.6.0b: honest.ts is tooling only; rampPlates, maxGoldByDay and deckCost live in src/sim/rivals.ts,
// and the dusk stand-in is standInFoe (the run's rival captain; 0.6.2 TUNE-C: with its named build
// standInBuild, as before 0.6.0d; from 0.6.0d the stand-in pool's standInPick), not standIn
import { honestStandIn, honestStandInBuild, plateHull, strongHonestBuild } from "../src/game/honest";
import { RIVALS, deckCost, maxGoldByDay, rampPlates, standInBuild, standInGhost } from "../src/sim/rivals";
import { standInFoe } from "../src/game/ghosts";
import { chooseFoe } from "../src/game/day";
import { newRun } from "../src/game/run";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import { HEROES, ITEMS, RUN_DAYS, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { starsOf, valueOf } from "../src/sim/stars";
import { boughtCost } from "../src/sim/harness/standins"; // FLIP-X2: a deck with runes valued as bought (the runes' HULL and BELT out)
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: the runes' dawn gold in the day's budget

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const BOTH: HeroId[] = ["furnace", "weaver"];

// ref/async-validate.ts.txt buildCost (lines 45-53), transcribed as the oracle for deckCost
function refBuildCost(b: Build): number {
  const h = HEROES[b.hero];
  const crate = ITEMS.beltcrate, plate = ITEMS.plating;
  const items = b.items.reduce((s, p) => s + valueOf(p.def, starsOf(p)), 0);
  const mods = b.mods.reduce((s, m) => s + valueOf(m.def, starsOf(m)), 0);
  const crates = Math.max(0, Math.ceil((b.beltCap - h.belt) / crate.supply!.belt!));
  const plates = Math.max(0, Math.ceil(b.hullBonus / plate.supply!.hull!));
  return items + mods + crates * crate.price + plates * plate.price;
}

// 0.6.0b: the honest helpers are tooling decks now (makeGhost, pinClassicFoe), not the dusk stand-in
describe("honest deck helpers (M3b; tooling since 0.6.0b) and the dusk stand-in", () => {
  it("plateHull is ARMOR PLATING's +250 hull", () => { // NUM-1 (REQ-BFG-047): x10 (was +25)
    expect(plateHull).toBe(250); // NUM-1: x10 (was 25)
    expect(ITEMS.plating.supply!.hull).toBe(250); // NUM-1: x10 (was 25)
  });

  it("rampPlates: the warlord hull ramp in whole plating (0 on days 1-4, 1 on 5-6, 2 on 7-9, 3 on 10)", () => {
    // NUM-1: warlordHull(d) = (d - 1) x 110 - 270, x10 (was [-27, -16, -5, 6, 17, 28, 39, 50, 61, 72])
    expect(DAYS.map(warlordHull)).toEqual([-270, -160, -50, 60, 170, 280, 390, 500, 610, 720]);
    expect(DAYS.map(rampPlates)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 2, 3]);
    for (const d of DAYS) expect(Object.is(rampPlates(d), -0)).toBe(false);
  });

  it("maxGoldByDay: START_GOLD + every earlier day's winning income", () => {
    expect(DAYS.map(maxGoldByDay)).toEqual([8, 17, 27, 38, 50, 63, 77, 91, 105, 119]);
    expect(maxGoldByDay(1)).toBe(START_GOLD);
    for (const d of DAYS.slice(1)) expect(maxGoldByDay(d) - maxGoldByDay(d - 1)).toBe(incomeFor(d - 1, true));
  });

  it("deckCost mirrors buildCost: items + mods + crates above the base belt + plating", () => {
    const decks: Build[] = [startingBuild("furnace", 1), startingBuild("weaver", 1)];
    for (const h of BOTH) for (const d of DAYS) decks.push(warlordBuild(h, d), honestStandInBuild(h, d), strongHonestBuild(h, d, 6));
    // 0.6.0b: deckCost returns the BuildCost breakdown { items, mods, crates, plates, total }
    for (const b of decks) expect(deckCost(b).total).toBe(refBuildCost(b));
    // hand-checked: furnace cooker (kiln 0, temper 3, brake 3, longhaul 5, press 8, grease 3,
    // whetstone 3), calibrate 5, beltCap 18 = 1 crate (2), 3 plates (15). NUM-1 (REQ-BFG-047): the hulls below x10
    expect(deckCost({ ...warlordBuild("furnace", 10), hullBonus: 750 })).toEqual({ items: 25, mods: 5, crates: 1, plates: 3, total: 25 + 5 + 2 + 15 }); // was 75
    expect(deckCost({ ...startingBuild("weaver", 1), hullBonus: 260 }).total).toBe(10); // 260 hull needs 2 plates (was 26)
    expect(deckCost({ ...startingBuild("weaver", 1), hullBonus: -270 }).total).toBe(0); // negative hull buys nothing (was -27)
  });

  it("for both heroes on days 1-10: whole non-negative plating, within the day's gold, day 1 has none", () => {
    for (const h of BOTH) {
      for (const d of DAYS) {
        const s = honestStandIn(h, d);
        const b = honestStandInBuild(h, d);
        expect(b).toEqual(s.build);
        expect(b.hero).toBe(h);
        expect(b.hullBonus).toBeGreaterThanOrEqual(0);
        expect(b.hullBonus % plateHull).toBe(0);
        expect(b.hullBonus).toBe(s.plates * plateHull);
        expect(deckCost(b).total).toBeLessThanOrEqual(maxGoldByDay(d)); // 0.6.0b: deckCost(b).total
        // today's content fits without dropping anything: today's gates, rampPlates(day) plating
        expect(s.fromDay).toBe(d);
        expect(s.plates).toBe(rampPlates(d));
        expect({ ...b, hullBonus: 0 }).toEqual({ ...warlordBuild(h, d), hullBonus: 0 });
      }
      expect(honestStandInBuild(h, 1).hullBonus).toBe(0);
    }
  });

  // 0.6.0b: the stand-in is standInFoe, the run's captain standInGhost(seed, day) and its name (no
  // longer honestStandInBuild of a seeded hero). 0.6.2 TUNE-C: its deck is the captain's named build,
  // standInBuild(id, day) (from 0.6.0d until TUNE-C the stand-in pool's full-purse standInPick)
  it("standInFoe brings the captain's named standInBuild deck and stays deterministic for a seed and day", () => {
    for (const seed of [1, 555, 12345, 644245094]) {
      for (const d of DAYS) {
        const a = standInFoe(seed, d), b = standInFoe(seed, d);
        expect(b).toEqual(a);
        const id = standInGhost(seed, d);
        expect(a.id).toBe(id);
        expect(a.build).toEqual(standInBuild(id, d));
        expect([a.hero, a.name]).toEqual([RIVALS[id].hero, RIVALS[id].name]);
        const run = newRun("weaver", seed, "me");
        run.day = d;
        const f = chooseFoe(run, []);
        expect(f.kind).toBe("standin");
        expect(f.build).toEqual(a.build);
        expect([f.name, f.rival]).toEqual([a.name, id]);
        // FLIP-X2 (REVIEW-BOTSX section 5): standInBuild holds the captain's CAPTAIN_RUNES prefix (its HULL and BELT on the
        // deck), so the deck is valued as bought (boughtCost: the runes' grants out, as validate.ts) against the day's gold
        // plus its runes' dawn gold (was deckCost(f.build).total <= maxGoldByDay(d): 18 <= 17)
        expect(boughtCost(f.build), `${id} d${d}`).toBeLessThanOrEqual(maxGoldByDay(d) + runeGrants(f.build.runes, d).gold);
      }
    }
  });

  it("strong tooling ghosts are honest too: whole plating and within the day's gold", () => {
    for (const h of BOTH) {
      for (const d of DAYS) {
        for (const reach of [0, 2, 6]) {
          const b = strongHonestBuild(h, d, reach);
          expect(b.hullBonus % plateHull).toBe(0);
          expect(b.hullBonus).toBeGreaterThanOrEqual(0);
          // 0.6.0b: deckCost(b).total (deckCost returns the cost breakdown)
          expect(deckCost(b).total).toBeLessThanOrEqual(maxGoldByDay(d));
          expect(maxGoldByDay(d) - deckCost(b).total).toBeLessThan(ITEMS.plating.price); // the rest went on plating
        }
      }
    }
  });
});
