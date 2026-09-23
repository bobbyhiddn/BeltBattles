import { describe, expect, it } from "vitest";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { STAND_IN_POOL_HEROES, standInPick } from "../src/sim/standInPool";
import { STAND_IN_HEROES, fallbackGhost, offlineGhost, rivalHero } from "../src/net/fallback";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { generateSamplePool } from "../tools/samplePool";

// The offline fallback draws its stand-ins from the bundled full-purse stand-in pool.

describe("fallback stand-ins", () => {
  it("every playable hero has stand-in decks (standInPick throws for a hero outside the pool)", () => {
    expect(STAND_IN_HEROES).toEqual(PLAYABLE_HEROES);
    for (const h of PLAYABLE_HEROES) expect(STAND_IN_POOL_HEROES, `${h} is playable but has no stand-in decks`).toContain(h);
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
          expect(buildCost(g.snapshot.build).total).toBeGreaterThanOrEqual(Math.ceil(0.9 * maxGoldByDay(day)));
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
