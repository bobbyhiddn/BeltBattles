import { describe, expect, it } from "vitest";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import { HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { hitsOfRig, type Build } from "../src/sim/deck";
import { buildCost as serverCost, unfusedPairs, validateBuild } from "../src/net/validate";
import { starsOf } from "../src/sim/stars";
import { PLATE_STEP, PLAYABLE_HEROES, REF_DAYS, heroRefBuild, heroStartBuild, rampPlates } from "../src/sim/heroBuilds";
import { isRaceHero } from "../src/sim/races/data";
import { REF_DAYS_LONG, refDepth, refHull } from "../src/sim/races/refBuilds"; // BUMP-1D (LONG_RUN ships on): the long run's reference depth
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: and the 10-day run's
import { buildCost, expectLegal, maxGoldByDay } from "./races.helpers";
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip, HULL_SCALE): 0.9.7's gold beside the shipped

// races rulings 2 and 3 (amended by Step A): one entry point for every hero, and every reference
// build is a deck a player could own that day (whole plating on the nearest-plate ramp, cost
// within maxGoldByDay, validate.ts rules).

const ALL = Object.keys(HEROES) as HeroId[];
const DAYS = Array.from({ length: REF_DAYS }, (_, i) => i + 1);

describe("heroBuilds: one entry point for all six heroes", () => {
  it("covers six heroes; the game offers Furnace, Weaver, Foundry and Bastion (0.8.0 H1)", () => {
    expect(ALL.sort()).toEqual(["bastion", "foundry", "furnace", "metronome", "siphon", "weaver"]);
    expect([...PLAYABLE_HEROES]).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    expect(REF_DAYS).toBe(10);
  });

  it("returns a deck of the requested hero, with its own signature factory, for every hero and day 1-10", () => {
    for (const h of ALL) {
      const start = heroStartBuild(h);
      expect(start.hero).toBe(h);
      expect(start.items.filter((p) => p.def === HEROES[h].factory)).toHaveLength(1);
      for (const d of DAYS) {
        const b = heroRefBuild(h, d);
        expect(b.hero, `${h} day ${d}`).toBe(h);
        expect(b.items.filter((p) => p.def === HEROES[h].factory), `${h} day ${d}`).toHaveLength(1);
      }
    }
  });

  it("the plating ramp rounds the warlord curve to the NEAREST plate, never negative (Step A)", () => {
    expect(PLATE_STEP).toBe(ITEMS.plating.supply!.hull!);
    expect(PLATE_STEP).toBe(250); // NUM-1: x10 (was 25), ARMOR PLATING's hull
    expect(DAYS.map(rampPlates)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 2, 3]);
    for (const d of DAYS) expect(rampPlates(d)).toBe(Math.max(0, Math.round(warlordHull(d) / PLATE_STEP)));
    expect(DAYS.map(refHull)).toEqual([0, 0, 0, 0, 250, 250, 500, 500, 500, 750]); // NUM-1: x10 (was 0 ... 25, 25, 50, 50, 50, 75)
  });

  it("Furnace and Weaver delegate to ai.ts: warlordBuild with hullBonus = step x rampPlates(day)", () => {
    for (const h of ["furnace", "weaver"] as const) {
      expect(heroStartBuild(h, 7)).toEqual(startingBuild(h, 7));
      for (const d of DAYS) {
        const w = warlordBuild(h, d);
        const b = heroRefBuild(h, d);
        expect(b.hullBonus, `${h} day ${d}`).toBe(PLATE_STEP * rampPlates(d));
        // every other field (hero, items, routes, mods, beltCap) is warlordBuild's, unchanged
        expect({ ...b, hullBonus: w.hullBonus }, `${h} day ${d}`).toEqual(w);
        expect(Object.keys(b).sort()).toEqual(Object.keys(w).sort());
      }
    }
    expect(heroRefBuild("furnace", 1).hullBonus).toBe(0); // warlord -270 (NUM-1: x10, was -27)
    expect(heroRefBuild("furnace", 5).hullBonus).toBe(250); // warlord 170 (NUM-1: x10, was 25 / warlord 17)
    expect(heroRefBuild("weaver", 10).hullBonus).toBe(750); // warlord 720 (NUM-1: x10, was 75 / warlord 72)
  });

  it("the race heroes ride the same ramp: hullBonus = step x rampPlates(day)", () => {
    for (const h of ALL.filter(isRaceHero)) {
      for (const d of DAYS) expect(heroRefBuild(h, d).hullBonus, `${h} day ${d}`).toBe(PLATE_STEP * rampPlates(d));
      expect(heroStartBuild(h).hullBonus).toBe(0);
    }
  });

  it("days outside 1-10 clamp to the nearest reference day", () => {
    // BUMP-1D (LONG_RUN ships on): the clamp at day 10 is the 10-day run's reference depth (refBuilds.ts refDepth: REF_DAYS with
    // the switch off); with the switch as shipped the references go to day 16 (the next test), so this reads it off
    withLongRun(() => {
      expect(refDepth()).toBe(REF_DAYS);
      expect(heroRefBuild("siphon", 0)).toEqual(heroRefBuild("siphon", 1));
      expect(heroRefBuild("foundry", 12)).toEqual(heroRefBuild("foundry", 10));
      expect(heroRefBuild("weaver", 11)).toEqual(heroRefBuild("weaver", 10));
    }, false);
  });

  it("a long run's reference builds go to day 16 (REF_DAYS_LONG): day 0 clamps to day 1, days 11-16 are the day-10 layout with the day's own hull, a later day is day 16's with its own hull", () => {
    // BUMP-1D (LONG_RUN ships on; refBuilds.ts refDepth, refHullDay): was the clamp at day 10 (the test above, now read with the switch off)
    expect(refDepth()).toBe(REF_DAYS_LONG);
    expect(REF_DAYS_LONG).toBe(16);
    expect(heroRefBuild("siphon", 0)).toEqual(heroRefBuild("siphon", 1));
    const bare = (b: Build): Build => ({ ...b, hullBonus: 0 });
    for (const h of ALL) {
      for (const d of [11, 12, 16, 17, 20]) {
        expect(bare(heroRefBuild(h, d)), `${h} day ${d}: the day-10 layout`).toEqual(bare(heroRefBuild(h, 10)));
        expect(heroRefBuild(h, d).hullBonus, `${h} day ${d}: the day's own hull`).toBe(PLATE_STEP * rampPlates(d));
      }
      expect(heroRefBuild(h, 12).hullBonus, h).toBeGreaterThan(heroRefBuild(h, 10).hullBonus); // the day-12 hull is not day 10's
    }
  });
});

describe("heroBuilds: honest budget (ruling 3)", () => {
  it("the day budget matches ref/async validate.ts: 8, 17, 27 ... 119", () => {
    // AZ-BUMP (the flip, HULL_SCALE): 91 105 119 -> 92 108 125 on days 8-10: HULL_SCALE's gold (hullScale.ts incomeOn,
    // 6 + min(day, 10) + 2 on a win, through content.ts incomeFor). Off, 0.9.7's 8, 17, 27 ... 119
    expect(DAYS.map(maxGoldByDay)).toEqual([8, 17, 27, 38, 50, 63, 77, 92, 108, 125]);
    expect(withHullScale(() => DAYS.map(maxGoldByDay), false)).toEqual([8, 17, 27, 38, 50, 63, 77, 91, 105, 119]);
  });

  it("all 60 reference builds are legal decks a player could own that day", () => {
    let n = 0;
    for (const h of ALL) {
      for (const d of DAYS) {
        const b = heroRefBuild(h, d);
        expectLegal(b, d);
        expect(b.hullBonus % 250).toBe(0); // NUM-1: whole plates of 250 (x10, was % 25)
        expect(b.hullBonus).toBeGreaterThanOrEqual(0);
        expect(buildCost(b)).toBeLessThanOrEqual(maxGoldByDay(d));
        n++;
      }
      expectLegal(heroStartBuild(h), 1);
    }
    expect(n).toBe(60);
  });

  it("reference builds never get cheaper; race heroes add something every day", () => {
    for (const h of ALL) {
      const costs = DAYS.map((d) => buildCost(heroRefBuild(h, d)));
      for (let i = 1; i < costs.length; i++) {
        if (isRaceHero(h)) expect(costs[i], `${h} day ${i + 1}`).toBeGreaterThan(costs[i - 1]);
        else expect(costs[i], `${h} day ${i + 1}`).toBeGreaterThanOrEqual(costs[i - 1]);
      }
    }
  });

  it("day 1 is a real fight: race heroes spend the start purse, nobody carries a handicap", () => {
    for (const h of ALL) {
      const b = heroRefBuild(h, 1);
      expect(b.hullBonus).toBe(0);
      if (isRaceHero(h)) expect(buildCost(b)).toBeGreaterThanOrEqual(6);
    }
  });
});


describe("race reference builds under live merging", () => {
  it("all four race decks are pair free, affordable and valid on every day", () => {
    for (const h of ["foundry", "bastion", "metronome", "siphon"] as const) {
      for (const d of DAYS) {
        const b = heroRefBuild(h, d);
        const tag = `${h} day ${d}`;
        expect(unfusedPairs(b), tag).toEqual([]);
        expect(validateBuild(b, d), tag).toMatchObject({ ok: true, errors: [] });
        expect(buildCost(b), tag).toBe(serverCost(b).total);
        expect(serverCost(b).total, tag).toBeLessThanOrEqual(maxGoldByDay(d));
      }
    }
  });

  it("copies merge at purchase time and the first placed rig keeps its cell, turn and hit", () => {
    // 0.8.0 B1 M1 (oracle 60ce2081b6171361): the reference decks keep their mirrored rigs (another part on the second
    // belt), so a copy merges only where STEPS buys it as a written ★2: FOUNDRY's and SIPHON's day-10 WHETSTONE
    const milestones = [
      ["foundry", 1, "whetstone", [1]], ["foundry", 1, "counterweight", [1]], ["foundry", 2, "temper", [1]],
      ["foundry", 5, "quench", [1]], ["foundry", 9, "whetstone", [1]], ["foundry", 10, "whetstone", [2]],
      ["foundry", 10, "calibrate", []],
      ["bastion", 6, "whetstone", [1]], ["bastion", 6, "counterweight", [1]], ["bastion", 7, "venom", [1]],
      ["bastion", 9, "grease", [1]], ["bastion", 10, "longhaul", [1]],
      ["metronome", 6, "whetstone", [1]], ["metronome", 7, "temper", [1]],
      ["metronome", 9, "longhaul", [1]], ["metronome", 10, "whetstone", [1]],
      ["siphon", 1, "whetstone", [1]], ["siphon", 1, "counterweight", [1]], ["siphon", 6, "temper", [1]],
      ["siphon", 7, "calibrate", []], ["siphon", 8, "longhaul", [1]],
      ["siphon", 9, "whetstone", [1]], ["siphon", 10, "whetstone", [2]],
    ] as const;
    for (const [hero, day, def, want] of milestones) {
      const b = heroRefBuild(hero, day);
      const levels = [...b.items, ...b.mods].filter((p) => p.def === def).map(starsOf).sort();
      expect(levels, `${hero} day ${day} ${def}`).toEqual(want);
    }
    for (const hero of ["foundry", "bastion", "metronome", "siphon"] as const) {
      const first = heroRefBuild(hero, 1).items.find((p) => p.def === "whetstone")!;
      const later = heroRefBuild(hero, 10);
      const survivor = later.items.find((p) => p.uid === first.uid)!;
      expect(survivor, `${hero} whetstone survivor`).toMatchObject({ x: first.x, y: first.y, rot: first.rot });
      expect(hitsOfRig(later, survivor.uid).length, `${hero} whetstone hit`).toBe(1);
    }
  });
});
