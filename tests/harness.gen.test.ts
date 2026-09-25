import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { HEROES } from "../src/sim/content";
import { routeInfo } from "../src/sim/deck";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroRefBuild, heroStartBuild, shopExcluded } from "../src/sim/harness/heroes";
import { exceptPairs } from "./harnessLegacy";

// Balance harness generator: legal, honestly priced, reproducible random builds.

describe("harness generator", () => {
  it("covers all six heroes, in report order", () => {
    expect(HARNESS_HEROES).toEqual(["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"]);
  });

  it("15 random builds per hero and day 1-10 all pass validateBuild within budget", () => {
    const levers = { gates: 0, mods: 0, plating: 0, crates: 0, presses: 0, rerouted: 0 };
    for (const hero of HARNESS_HEROES) {
      const start = heroStartBuild(hero, 1);
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < 15; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("gen-test", hero, day, i)));
          const v = validateBuild(b, day);
          expect(exceptPairs(v.errors), `${hero} d${day} #${i}`).toEqual([]); // stars off: the v1 harness never merges
          expect(b.hero).toBe(hero);
          expect(buildCost(b).total).toBeLessThanOrEqual(maxGoldByDay(day));
          b.routes.forEach((_, ri) => expect(routeInfo(b, ri).connected).toBe(true));
          levers.gates += b.items.filter((p) => p.def !== HEROES[hero].factory && p.def !== "press").length;
          levers.mods += b.mods.length;
          levers.plating += b.hullBonus > 0 ? 1 : 0;
          levers.crates += b.beltCap > HEROES[hero].belt ? 1 : 0;
          levers.presses += b.items.some((p) => p.def === "press") ? 1 : 0;
          levers.rerouted += JSON.stringify(b.routes.slice(0, start.routes.length).map((r) => r.cells)) !== JSON.stringify(start.routes.map((r) => r.cells)) ? 1 : 0;
        }
      }
    }
    // every lever is actually exercised somewhere in the 900 builds
    for (const [k, n] of Object.entries(levers)) expect(n, k).toBeGreaterThan(20);
  }, 60_000);

  it("honours shop exclusions: Metronome buys no speed gates; nobody buys ESCAPEMENT or LONGCASE", () => {
    expect([...shopExcluded("metronome")].sort()).toEqual(["brake", "escapement", "grease", "longcase", "overdrive"]);
    expect([...shopExcluded("furnace")].sort()).toEqual(["escapement", "longcase"]);
    for (const hero of HARNESS_HEROES) {
      const banned = shopExcluded(hero);
      for (const day of [4, 7, 10]) {
        for (let i = 0; i < 12; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("exclude", hero, day, i)));
          for (const p of [...b.items, ...b.mods]) expect(banned.has(p.def), `${hero} d${day} #${i} ${p.def}`).toBe(false);
        }
      }
    }
  }, 30_000);

  it("spends the day's gold: what is left over buys nothing useful", () => {
    for (const hero of HARNESS_HEROES) {
      for (const day of [1, 5, 10]) {
        for (let i = 0; i < 6; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("spend", hero, day, i)));
          expect(maxGoldByDay(day) - buildCost(b).total).toBeLessThan(5); // plating costs 5
        }
      }
    }
  }, 60_000);

  it("the same seed gives the identical build; different seeds differ", () => {
    for (const hero of HARNESS_HEROES) {
      const a = randomBuild(hero, 6, new Rng(1234));
      const b = randomBuild(hero, 6, new Rng(1234));
      const c = randomBuild(hero, 6, new Rng(4321));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    }
  });

  it("the reference builds (heroRefBuild) are legal and within budget on days 1-10", () => {
    for (const hero of HARNESS_HEROES) {
      for (let day = 1; day <= 10; day++) {
        const b = heroRefBuild(hero, day);
        expect(b.hero).toBe(hero);
        expect(exceptPairs(validateBuild(b, day).errors), `${hero} d${day}`).toEqual([]); // par decks hold pairs until job E
      }
    }
  });
});
