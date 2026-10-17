// Harness v2 fix pass, group 2 (F2, decision D2; REQ-BFG-019): the star-aware stand-in code
// (src/sim/harness/standinCode.ts). v1 codes decode exactly as before, 1-star decks encode exactly
// as before, starred decks round-trip, and the stars-on dry pool writes what it scored.
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import type { Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild, validateUpload } from "../src/net/validate"; // S8c: + validateUpload (the player mode)
import { POOL_RULES, RULES_VERSION } from "../src/sim/content";
import { npcDayRules } from "../src/sim/npcDay"; // S8c: the budget line is left to the player mode only while NPC_DAY is on
import {
  decodeStandIn, decodeStandInRaw, decodeStarred as loadStarred, decodeStarredRaw, encodeStandIn, standInPool, STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES,
} from "../src/sim/standInPool";
import { migrateInlineGates } from "../src/sim/beltside";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_DATA as V11 } from "./fixtures/standInPoolData.v1.1";
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { decodeStarred, encodeStarred } from "../src/sim/harness/standinCode";
import { STANDIN_DEFAULTS, boughtCost, dataModuleText, genStandIns, writtenPicks, writtenProblems } from "../src/sim/harness/standins";
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: a stored deck's runes' dawn gold
import { localRunner } from "../src/sim/harness/tournament";
import { starsOf, valueOf } from "../src/sim/stars";

// beltside-062-on-061 (DESIGN §13 P15): the harness codec (standinCode.ts) is the raw codec, the same as the loader's
// (encodeStarred / decodeStarredRaw, both with BELTSIDE's r<rot> before the stars); the loader's decodeStarred and
// decodeStandIn are load boundaries (D3: migrateInlineGates). v1.1 and pool v2 were generated with gates ON belt tiles,
// so where v2 compared the harness decode with the loader's, the raw layers are compared, and the loader's deck is
// the stored deck after D3. No assertion is dropped.

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
          expect(JSON.stringify(decodeStarred(hero as never, t[3]))).toBe(JSON.stringify(decodeStandInRaw(hero as never, t[3])));
          expect(JSON.stringify(loadStarred(hero as never, t[3]))).toBe(JSON.stringify(decodeStandIn(hero as never, t[3])));
          n++;
        }
      }
    }
    expect(n).toBe(120);
  });

  it("the shipped pool v2 (0.6.1 flip): the game's loader reads every stored code as the harness codec does, and each deck is legal, at most 2 stars, within the day's gold and round-trips byte for byte", () => {
    let n = 0, starred = 0;
    expect(STAND_IN_DATA.rules).toBe(POOL_RULES); // RUNES-1: RULES_VERSION, or the rules it carries the pool from (content.ts)
    for (const hero of STAND_IN_POOL_HEROES) {
      for (let day = 1; day <= STAND_IN_POOL_DAYS; day++) { // BUMP-1D: was day <= 10 (the regenerated pool holds days 1-16)
        const codes = STAND_IN_DATA.pools[hero]![day - 1][1].map((t) => t[3]);
        standInPool(hero, day).forEach((e) => {
          // NUM-1 (cap's oracle bcc36c430b4f3a01) converted the pre-NUM-1 stored codes x10 before matching them. FLIP-X2 step
          // 4.5: the pool is native N1 (BUNDLED_POOL_HULL_SCALE deleted), so the identity (kept by name for the lines below)
          const x10 = (b: Build): Build => b;
          const code = codes.find((c) => JSON.stringify(x10(loadStarred(hero, c))) === JSON.stringify(e.build));
          expect(code, `${hero} d${day}: the loader's deck is one of the stored codes (after D3)`).toBeDefined();
          const raw = decodeStarred(hero, code!); // the harness codec: the deck as written
          expect(JSON.stringify(raw)).toBe(JSON.stringify(decodeStarredRaw(hero, code!))); // = the loader's raw layer
          expect(encodeStarred(raw)).toBe(code); // round-trips byte for byte
          expect(encodeStarred(e.build)).toBe(encodeStarred(x10(loadStarred(hero, code!)))); // NUM-1: the loader's x10
          // S8c (the pools): RULING-S8-R5 section 3 item 1 (T1e's form, RULING-S8-R1 item 3).
          // a48010b: with NPC_DAY on, a road-fed deck spends the road's drops too, by design. The regenerated pool's picks are
          // road-fed (P1 83c039d, NPC_DAY on: each tuple's 7th element is its road log), so a deck may cost more than the shop's
          // gold alone, which the strict mode's budget line doesn't count; its drops count through its road log, in the player
          // mode. So each deck is held to validateBuild's lines minus at most its ONE budget line (matched by its "budget: "
          // prefix, and only while NPC_DAY is on: off, the strict check stays whole), AND to validateUpload in the player mode
          // with its road log (a stand-in carries no run seed). Was: validateBuild(e.build, day).errors toEqual [] (and the
          // cost within the day's gold below, for every deck)
          const strict = validateBuild(e.build, day).errors;
          const budget = npcDayRules() ? strict.filter((x) => x.startsWith("budget: ")) : [];
          expect(budget.length, `${hero} d${day}: at most its one budget line`).toBeLessThanOrEqual(1);
          expect(strict.filter((x) => !budget.includes(x)), `${hero} d${day}: every other strict line`).toEqual([]);
          expect(validateUpload(e.build, day, RULES_VERSION, { ...(e.road ? { road: e.road } : {}) }).errors, `${hero} d${day}: the player mode with its road log`).toEqual([]);
          expect(maxStars(e.build)).toBeLessThanOrEqual(2);
          // the stored cost is the deck as generated; the loaded deck is that minus the rigs D3 dropped (no free cell)
          const dropped = migrateInlineGates(JSON.parse(JSON.stringify(raw)) as Build).stranded;
          // FLIP-X2 (BOTSX-REPORT section 9): a stored deck may hold HULL or BELT runes now, so its cost is the deck as bought
          // (boughtCost: the runes' grants out; was buildCost(...) === e.cost), against the day's gold plus its runes' dawn gold
          expect(boughtCost(x10(raw))).toBe(e.cost);
          expect(boughtCost(e.build) + dropped.reduce((g, p) => g + valueOf(p.def, starsOf(p)), 0)).toBe(e.cost);
          // S8c (T1e's form, as above): within the day's gold (the strict budget's sum on the stored cost), whole unless the
          // deck's one budget line was left to the player mode above (only while NPC_DAY is on). Was: every deck
          if (!budget.length) expect(e.cost, `${hero} d${day}: within the day's gold`).toBeLessThanOrEqual(maxGoldByDay(day) + runeGrants(e.build.runes, day).gold);
          if (maxStars(e.build) > 1) starred++;
          n++;
        });
      }
    }
    expect(n).toBe(192); // BUMP-1D: was 120 (2 heroes x 10 days x 6): the regenerated pool holds days 1-16, 2 x 16 x 6 = 192
    expect(starred).toBeGreaterThan(40); // merged decks are shipped, so a star-blind loader would be caught
  });

  it("stars-on dry pool (tiny): every WRITTEN pick decodes to the scored deck - stored cost == buildCost(decoded), validateBuild ok, no unfused pair; a v1-coded module is caught", async () => {
    const tiny = { ...STANDIN_DEFAULTS, pop: 6, gauntlet: 2, seeds: 1, elites: 2, refSeeds: 2, per: 2, grow: [8], stars: "on" as const };
    const res = await genStandIns(tiny, localRunner);
    const text = dataModuleText(tiny, res.days);
    expect(writtenProblems(tiny, res.days, text)).toEqual([]);
    const picks = writtenPicks(text);
    // BUMP-1D: was 10 * 2 * tiny.per (40): genStandIns' default depth is STAND_IN_POOL_DAYS, now 16 (the regenerated pool's), so the tiny pool
    // builds days 1-16 for both heroes: 16 x 2 x per = 64 picks (and plays 1.6 times the battles: ~200 s here)
    expect(picks).toHaveLength(STAND_IN_POOL_DAYS * 2 * tiny.per);
    expect(picks).toHaveLength(64);
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
  }, 600_000); // AZ-BUMP (the flip, HULL_SCALE): the tiny dry pool still builds all 10 days and plays every battle on its day
  // (genStandIns' jobs carry the day), now on the day's hull (M(d) x the hull, D(d) on the hits: longer fights); a host
  // timeout under the 1.5-CPU quota, not the rule (133 s in the flip's shard run, over the 120 s this test had)
  // BUMP-1D: the tiny dry pool builds all 16 days now (STAND_IN_POOL_DAYS, genStandIns' default depth), 210 s here (run 3, one vitest worker
  // under the shared slots) against the 600 s timeout, which stays
});
