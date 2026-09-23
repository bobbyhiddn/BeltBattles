import { describe, expect, it } from "vitest";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import { HEROES, type HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES, REF_DAYS, heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { isRaceHero } from "../src/sim/races/data";
import { buildCost, expectLegal, maxGoldByDay } from "./races.helpers";

// races rulings 2 and 3: one entry point for every hero, and every reference build is a deck a
// player could own that day (whole plating, cost within maxGoldByDay, validate.ts rules).

const ALL = Object.keys(HEROES) as HeroId[];
const DAYS = Array.from({ length: REF_DAYS }, (_, i) => i + 1);

describe("heroBuilds: one entry point for all six heroes", () => {
  it("covers six heroes; the game offers Furnace and Weaver today", () => {
    expect(ALL.sort()).toEqual(["bastion", "foundry", "furnace", "metronome", "siphon", "weaver"]);
    expect([...PLAYABLE_HEROES]).toEqual(["furnace", "weaver"]);
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

  it("Furnace and Weaver delegate to ai.ts, with the hull bonus in whole plating and never negative", () => {
    for (const h of ["furnace", "weaver"] as const) {
      expect(heroStartBuild(h, 7)).toEqual(startingBuild(h, 7));
      for (const d of DAYS) {
        const w = warlordBuild(h, d);
        const b = heroRefBuild(h, d);
        expect({ ...b, hullBonus: 0 }).toEqual({ ...w, hullBonus: 0 });
        expect(b.hullBonus).toBe(Math.max(0, Math.floor(warlordHull(d) / 25) * 25));
      }
    }
    expect(heroRefBuild("furnace", 1).hullBonus).toBe(0); // was -27
    expect(heroRefBuild("weaver", 10).hullBonus).toBe(50); // was 72
  });

  it("days outside 1-10 clamp to the nearest reference day", () => {
    expect(heroRefBuild("siphon", 0)).toEqual(heroRefBuild("siphon", 1));
    expect(heroRefBuild("foundry", 12)).toEqual(heroRefBuild("foundry", 10));
    expect(heroRefBuild("weaver", 11)).toEqual(heroRefBuild("weaver", 10));
  });
});

describe("heroBuilds: honest budget (ruling 3)", () => {
  it("the day budget matches ref/async validate.ts: 8, 17, 27 ... 119", () => {
    expect(DAYS.map(maxGoldByDay)).toEqual([8, 17, 27, 38, 50, 63, 77, 91, 105, 119]);
  });

  it("all 60 reference builds are legal decks a player could own that day", () => {
    let n = 0;
    for (const h of ALL) {
      for (const d of DAYS) {
        const b = heroRefBuild(h, d);
        expectLegal(b, d);
        expect(b.hullBonus % 25).toBe(0);
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
