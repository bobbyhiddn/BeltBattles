import { describe, expect, it } from "vitest";
// 0.6.0b: honest.ts is tooling only; rampPlates, maxGoldByDay and deckCost live in src/sim/rivals.ts,
// and the dusk stand-in is standInFoe (the run's rival captain; 0.6.0d: with its stand-in pool deck
// standInPick, no longer standInBuild), not standIn
import { honestStandIn, honestStandInBuild, plateHull, strongHonestBuild } from "../src/game/honest";
import { RIVALS, deckCost, maxGoldByDay, rampPlates, standInGhost } from "../src/sim/rivals";
import { standInPick } from "../src/sim/standInPool";
import { standInFoe } from "../src/game/ghosts";
import { chooseFoe } from "../src/game/day";
import { newRun } from "../src/game/run";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import { HEROES, ITEMS, RUN_DAYS, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { starsOf, valueOf } from "../src/sim/stars";
import { pickLoss } from "./beltside.helpers";

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
  it("plateHull is ARMOR PLATING's +25 hull", () => {
    expect(plateHull).toBe(25);
    expect(ITEMS.plating.supply!.hull).toBe(25);
  });

  it("rampPlates: the warlord hull ramp in whole plating (0 on days 1-4, 1 on 5-6, 2 on 7-9, 3 on 10)", () => {
    expect(DAYS.map(warlordHull)).toEqual([-27, -16, -5, 6, 17, 28, 39, 50, 61, 72]);
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
    // whetstone 3), calibrate 5, beltCap 18 = 1 crate (2), 3 plates (15)
    expect(deckCost({ ...warlordBuild("furnace", 10), hullBonus: 75 })).toEqual({ items: 25, mods: 5, crates: 1, plates: 3, total: 25 + 5 + 2 + 15 });
    expect(deckCost({ ...startingBuild("weaver", 1), hullBonus: 26 }).total).toBe(10); // 26 hull needs 2 plates
    expect(deckCost({ ...startingBuild("weaver", 1), hullBonus: -27 }).total).toBe(0); // negative hull buys nothing
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
  // longer honestStandInBuild of a seeded hero). 0.6.0d: its deck is the stand-in pool's full-purse
  // standInPick(hero, day, seed), no longer the captain's standInBuild(id, day)
  it("standInFoe brings the captain's full-purse standInPick deck and stays deterministic for a seed and day", () => {
    for (const seed of [1, 555, 12345, 644245094]) {
      for (const d of DAYS) {
        const a = standInFoe(seed, d), b = standInFoe(seed, d);
        expect(b).toEqual(a);
        const id = standInGhost(seed, d);
        expect(a.id).toBe(id);
        expect(a.build).toEqual(standInPick(RIVALS[id].hero, d, seed));
        // 0.6.2 BELTSIDE: full purse as generated; as loaded it lacks only what D3 dropped (beltside.helpers)
        expect(deckCost(a.build).total + pickLoss(RIVALS[id].hero, d, seed)).toBeGreaterThanOrEqual(Math.ceil(0.9 * maxGoldByDay(d)));
        expect([a.hero, a.name]).toEqual([RIVALS[id].hero, RIVALS[id].name]);
        const run = newRun("weaver", seed, "me");
        run.day = d;
        const f = chooseFoe(run, []);
        expect(f.kind).toBe("standin");
        expect(f.build).toEqual(a.build);
        expect([f.name, f.rival]).toEqual([a.name, id]);
        expect(deckCost(f.build).total).toBeLessThanOrEqual(maxGoldByDay(d));
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
