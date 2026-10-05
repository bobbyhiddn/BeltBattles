import { describe, expect, it } from "vitest";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { STAND_IN_POOL_HEROES, standInPick } from "../src/sim/standInPool";
import { STAND_IN_HEROES, fallbackGhost, offlineGhost, rivalHero } from "../src/net/fallback";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { generateSamplePool } from "../tools/samplePool";
import { boughtCost } from "../src/sim/harness/standins";
import { runeGrants } from "../src/sim/runes";
import { pickLoss } from "./beltside.helpers";
import { POOL_LEGACY, pickEntry } from "./standInPool.helpers";

// The offline fallback draws its stand-ins from the bundled stand-in pool (full purse up to pool v2.1; since step 5
// caravan-bound, each pick having spent at least 90% of the day's gold).

describe("fallback stand-ins", () => {
  it("every stand-in hero has stand-in decks (standInPick throws for a hero outside the pool)", () => {
    // 0.8.0 H1: pinned to the pool's heroes, FURNACE and WEAVER, as PLAYABLE_HEROES grew to four (FOUNDRY, BASTION)
    expect(STAND_IN_HEROES).toEqual(["furnace", "weaver"]);
    expect(STAND_IN_HEROES).toEqual(STAND_IN_POOL_HEROES);
    expect(PLAYABLE_HEROES.filter((h) => !STAND_IN_HEROES.includes(h))).toEqual(["foundry", "bastion"]);
    for (const h of STAND_IN_HEROES) expect(STAND_IN_POOL_HEROES, `${h} stands in but has no stand-in decks`).toContain(h);
  });

  it("0.8.0 H1: FURNACE and WEAVER requesters keep their stand-in hero; FOUNDRY and BASTION get FURNACE or WEAVER by the seed, one hero-blind rule", () => {
    for (let seed = 0; seed < 400; seed++) {
      expect(rivalHero("furnace", seed)).toBe("weaver");
      expect(rivalHero("weaver", seed)).toBe("furnace");
      expect(rivalHero("foundry", seed), `seed ${seed}`).toBe(STAND_IN_HEROES[seed % 2]);
      expect(rivalHero("bastion", seed), `seed ${seed}`).toBe(rivalHero("foundry", seed));
    }
  });

  it("every fallback ghost for days 1-10 passes validateBuild, for every requesting hero", () => {
    for (const hero of Object.keys(HEROES) as HeroId[]) {
      for (let day = 1; day <= 10; day++) {
        for (const seed of [0, 1, 7, 99, 4242]) {
          const g = fallbackGhost({ rules: RULES_VERSION, day, wins: 0, lives: 3, playerId: "me", seen: [], hero, seed });
          expect(g.id).toBe(`offline-${g.snapshot.hero}-d${day}`);
          expect(validateBuild(g.snapshot.build, day).errors, `${hero} d${day} seed ${seed}`).toEqual([]);
          expect(g.snapshot.build.hero).toBe(g.snapshot.hero);
          expect(HEROES[g.snapshot.hero].faction).not.toBe(HEROES[hero].faction);
          expect(g.snapshot.build).toEqual(standInPick(rivalHero(hero, seed), day, seed));
          // 0.6.2 BELTSIDE: as generated; as loaded the deck lacks only what D3 dropped (beltside.helpers). Step 5 M5
          // (decision D2): the floor applies to the pool entry's gold spent; the deck's value (buildCost) as generated is
          // its stored cost, at most maxGoldByDay
          // FLIP-X2: the stand-in pool regenerated at 94e0cbf (every deck holds its day's runes) and stores the deck as
          // bought (standins.ts boughtCost: a HULL or BELT rune's grant is not plating or crates); BUNDLED_POOL_HULL_SCALE
          // is gone (9006765), so the deck reads as stored. The value is boughtCost (was buildCost(build).total, which
          // charged a rune's HULL / BELT: 20 -> 16 on the first deck that holds one)
          const e = pickEntry(g.snapshot.hero, day, seed), value = boughtCost(g.snapshot.build) + pickLoss(g.snapshot.hero, day, seed);
          expect(e.spent, `${hero} d${day} seed ${seed}`).toBeGreaterThanOrEqual(Math.ceil(0.9 * maxGoldByDay(day)));
          // FLIP-X2: the budget is the day's gold plus the runes' dawn gold (runeGrants(runes, day).gold), as validate.ts
          // budgets a deck (was maxGoldByDay(day) alone: an entry that spent its rune gold read spent 53 against 50)
          const budget = maxGoldByDay(day) + runeGrants(g.snapshot.build.runes, day).gold;
          expect(e.spent).toBeLessThanOrEqual(budget);
          expect(value).toBe(e.cost);
          expect(value).toBeLessThanOrEqual(budget); // FLIP-X2: maxGoldByDay(day) -> the budget above
          if (POOL_LEGACY) expect(value).toBeGreaterThanOrEqual(Math.ceil(0.9 * maxGoldByDay(day))); // pool v2.1: the deck itself
        }
      }
    }
  });

  it("offlineGhost spends the full purse from day 1 (8 of 8 gold)", () => {
    for (const hero of ["furnace", "weaver"] as const) expect(buildCost(offlineGhost(hero, 1, 3).snapshot.build).total).toBe(8);
  });

  it("the two sample-pool variants differ for every hero and day", () => {
    const pool = generateSamplePool();
    for (const hero of STAND_IN_HEROES) {
      for (let day = 1; day <= 10; day++) {
        const [v0, v1] = [0, 1].map((v) => pool.find((s) => s.hero === hero && s.day === day && s.playerId === `sample-${hero}-${v}`)!);
        expect(JSON.stringify(v1.build), `${hero} d${day}`).not.toBe(JSON.stringify(v0.build));
      }
    }
  });
});
