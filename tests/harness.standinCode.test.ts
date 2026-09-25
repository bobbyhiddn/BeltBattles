// Harness v2 fix pass, group 2 (F2, decision D2; REQ-BFG-019): the star-aware stand-in code
// (src/sim/harness/standinCode.ts). v1 codes decode exactly as before, 1-star decks encode exactly
// as before, starred decks round-trip, and the stars-on dry pool writes what it scored.
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import type { Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { RULES_VERSION } from "../src/sim/content";
import { decodeStandIn, encodeStandIn, standInPool, STAND_IN_POOL_HEROES } from "../src/sim/standInPool";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_DATA as V11 } from "./fixtures/standInPoolData.v1.1";
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { decodeStarred, encodeStarred } from "../src/sim/harness/standinCode";
import { STANDIN_DEFAULTS, dataModuleText, genStandIns, writtenPicks, writtenProblems } from "../src/sim/harness/standins";
import { localRunner } from "../src/sim/harness/tournament";
import { starsOf } from "../src/sim/stars";

const shape = (b: Build) => ({
  items: b.items.map((p) => [p.def, starsOf(p), p.x, p.y].join()).sort(),
  mods: b.mods.map((m) => [m.def, starsOf(m), m.turret].join()).sort(),
  routes: b.routes.map((r) => r.cells.join()), beltCap: b.beltCap, hullBonus: b.hullBonus,
});
const maxStars = (b: Build) => Math.max(1, ...[...b.items, ...b.mods].map((p) => starsOf(p)));

describe("star-aware stand-in code (F2)", () => {
  it("starred decks: decode(encode(b)) deep-equals the normalized deck, keeps every module's stars and spot, and is canonical", () => {
    let starred = 0;
    for (const hero of HARNESS_HEROES) {
      for (const day of [5, 7, 10]) {
        for (let i = 0; i < 6; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("code-rt", hero, day, i)), "on");
          if (maxStars(b) > 1) starred++;
          const code = encodeStarred(b);
          const n = decodeStarred(hero, code);
          expect(decodeStarred(hero, encodeStarred(n))).toEqual(n);
          expect(encodeStarred(n)).toBe(code);
          expect(shape(n)).toEqual(shape(b));
          expect(buildCost(n)).toEqual(buildCost(b));
          expect(unfusedPairs(n)).toEqual([]);
          expect(validateBuild(n, day).errors).toEqual([]);
        }
      }
    }
    expect(starred).toBeGreaterThan(20);
    // the suffix itself: *2 / *3 on item and module words, none at 1 star
    const b = decodeStarred("furnace", "14 0/kiln64 temper44*2 grease34/1:544434241404/calibrate0*3");
    expect(b.items.map((p) => p.stars)).toEqual([undefined, 2, undefined]);
    expect(b.mods).toEqual([{ uid: 4, def: "calibrate", turret: 0, stars: 3 }]);
    expect(encodeStarred(b)).toBe("14 0/kiln64 temper44*2 grease34/1:544434241404/calibrate0*3");
  }, 60_000);

  it("1-star decks encode byte-identical to encodeStandIn (every v1.1 deck and stars-off random builds of every hero)", () => {
    let n = 0;
    // the v1.1 decks (fixture: the shipped pool is v2 since the 0.6.1 flip)
    for (const [hero, days] of Object.entries(V11.pools)) for (const d of days!) for (const t of d[1]) { const b = decodeStandIn(hero as never, t[3]); expect(encodeStarred(b)).toBe(encodeStandIn(b)); n++; }
    for (const hero of HARNESS_HEROES) for (const day of [1, 4, 7, 10]) for (let i = 0; i < 4; i++) {
      const b = randomBuild(hero, day, new Rng(hashSeed("code-v1", hero, day, i)), "off");
      expect(encodeStarred(b)).toBe(encodeStandIn(b));
      n++;
    }
    expect(n).toBe(120 + 96);
  });

  it("every v1.1 code decodes exactly as decodeStandIn decodes it (same objects, same key order)", () => {
    let n = 0;
    for (const [hero, days] of Object.entries(V11.pools)) {
      for (const d of days!) {
        for (const t of d[1]) {
          expect(JSON.stringify(decodeStarred(hero as never, t[3]))).toBe(JSON.stringify(decodeStandIn(hero as never, t[3])));
          n++;
        }
      }
    }
    expect(n).toBe(120);
  });

  it("the shipped pool v2 (0.6.1 flip): the game's loader reads every stored code as the harness codec does, and each deck is legal, at most 2 stars, within the day's gold and round-trips byte for byte", () => {
    let n = 0, starred = 0;
    expect(STAND_IN_DATA.rules).toBe(RULES_VERSION);
    for (const hero of STAND_IN_POOL_HEROES) {
      for (let day = 1; day <= 10; day++) {
        const codes = STAND_IN_DATA.pools[hero]![day - 1][1].map((t) => t[3]);
        standInPool(hero, day).forEach((e) => {
          const code = codes.find((c) => JSON.stringify(decodeStarred(hero, c)) === JSON.stringify(e.build));
          expect(code, `${hero} d${day}: the loader's deck is one of the stored codes`).toBeDefined();
          expect(encodeStarred(e.build)).toBe(code);
          expect(validateBuild(e.build, day).errors, `${hero} d${day}`).toEqual([]);
          expect(maxStars(e.build)).toBeLessThanOrEqual(2);
          expect(buildCost(e.build).total).toBe(e.cost);
          expect(e.cost).toBeLessThanOrEqual(maxGoldByDay(day));
          if (maxStars(e.build) > 1) starred++;
          n++;
        });
      }
    }
    expect(n).toBe(120);
    expect(starred).toBeGreaterThan(40); // merged decks are shipped, so a star-blind loader would be caught
  });

  it("stars-on dry pool (tiny): every WRITTEN pick decodes to the scored deck - stored cost == buildCost(decoded), validateBuild ok, no unfused pair; a v1-coded module is caught", async () => {
    const tiny = { ...STANDIN_DEFAULTS, pop: 6, gauntlet: 2, seeds: 1, elites: 2, refSeeds: 2, per: 2, grow: [8], stars: "on" as const };
    const res = await genStandIns(tiny, localRunner);
    const text = dataModuleText(tiny, res.days);
    expect(writtenProblems(tiny, res.days, text)).toEqual([]);
    const picks = writtenPicks(text);
    expect(picks).toHaveLength(10 * 2 * tiny.per);
    let starred = 0;
    for (const w of picks) {
      const back = decodeStarred(w.hero, w.code);
      expect(buildCost(back).total, `${w.hero} d${w.day} #${w.i}`).toBe(w.cost);
      expect(validateBuild(back, w.day).errors, `${w.hero} d${w.day} #${w.i}`).toEqual([]);
      expect(unfusedPairs(back), `${w.hero} d${w.day} #${w.i}`).toEqual([]);
      if (maxStars(back) > 1) starred++;
    }
    expect(starred).toBeGreaterThan(0); // merged picks exist, so a star-blind code would be caught
    // the mutation "store encodeStandIn codes again": the guard reports the lost stars
    const v1 = res.days.map((hd) => ({ ...hd, picks: hd.picks.map((p) => ({ ...p, code: encodeStandIn(p.build) })) }));
    expect(writtenProblems(tiny, res.days, dataModuleText(tiny, v1)).length).toBeGreaterThan(0);
    expect(text).toContain("star-aware (src/sim/harness/standinCode.ts");
  }, 120_000);
});
