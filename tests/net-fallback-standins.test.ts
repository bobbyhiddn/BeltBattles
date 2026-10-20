import { describe, expect, it } from "vitest";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, standInPick } from "../src/sim/standInPool"; // BUMP-1D: + STAND_IN_POOL_DAYS
import { STAND_IN_HEROES, fallbackGhost, offlineGhost, rivalHero } from "../src/net/fallback";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate"; // S8c: + validateUpload (the player mode)
import { npcDayRules, roadDropValue } from "../src/sim/npcDay"; // S8c: the budget line is left to the player mode only while NPC_DAY is on
import { generateSamplePool } from "./helpers/poolCache";
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

  // BUMP-1D: title "days 1-10" -> "days 1-16" and the loop to every day the pool holds (STAND_IN_POOL_DAYS): the pool was regenerated for
  // days 1-16 (8fc5e24) and a long run asks the fallback for a day-11..16 stand-in too
  it("every fallback ghost for days 1-16 passes validateBuild, for every requesting hero", () => {
    for (const hero of Object.keys(HEROES) as HeroId[]) {
      for (let day = 1; day <= STAND_IN_POOL_DAYS; day++) {
        for (const seed of [0, 1, 7, 99, 4242]) {
          const g = fallbackGhost({ rules: RULES_VERSION, day, wins: 0, lives: 3, playerId: "me", seen: [], hero, seed });
          expect(g.id).toBe(`offline-${g.snapshot.hero}-d${day}`);
          // S8c (the pools): RULING-S8-R5 section 3 item 1 (T1e's form, RULING-S8-R1 item 3).
          // a48010b: with NPC_DAY on, a road-fed deck spends the road's drops too, by design. The regenerated pool's picks are
          // road-fed (P1 83c039d, NPC_DAY on: each tuple's 7th element is its road log), so a ghost may cost more than the
          // shop's gold alone, which the strict mode's budget line doesn't count; its drops count through its road log (its
          // pool entry's), in the player mode. So each ghost is held to validateBuild's lines minus at most its ONE budget line
          // (matched by its "budget: " prefix, and only while NPC_DAY is on: off, the strict check stays whole), AND to
          // validateUpload in the player mode with its road log (and its run seed where it carries one; a stand-in carries
          // none). Was: validateBuild(g.snapshot.build, day).errors toEqual [] (and the two "within the budget" lines below,
          // for every ghost)
          const strict = validateBuild(g.snapshot.build, day).errors;
          const budgetLine = npcDayRules() ? strict.filter((x) => x.startsWith("budget: ")) : [];
          expect(budgetLine.length, `${hero} d${day} seed ${seed}: at most its one budget line`).toBeLessThanOrEqual(1);
          expect(strict.filter((x) => !budgetLine.includes(x)), `${hero} d${day} seed ${seed}: every other strict line`).toEqual([]);
          const road = pickEntry(g.snapshot.hero, day, seed).road, s = g.snapshot;
          expect(validateUpload(s.build, day, s.rules, { ...(s.seed !== undefined ? { seed: s.seed } : {}), ...(road ? { road } : {}) }).errors, `${hero} d${day} seed ${seed}: the player mode with its road log`).toEqual([]);
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
          // S8c (T1e's form, as above): the gold spent and the value within the budget, whole unless the ghost's one budget
          // line was left to the player mode above (only while NPC_DAY is on). Was: for every ghost
          if (!budgetLine.length) expect(e.spent, `${hero} d${day} seed ${seed}: spent within the budget`).toBeLessThanOrEqual(budget);
          expect(value).toBe(e.cost);
          if (!budgetLine.length) expect(value, `${hero} d${day} seed ${seed}: value within the budget`).toBeLessThanOrEqual(budget); // FLIP-X2: maxGoldByDay(day) -> the budget above
          if (POOL_LEGACY) expect(value).toBeGreaterThanOrEqual(Math.ceil(0.9 * maxGoldByDay(day))); // pool v2.1: the deck itself
        }
      }
    }
  });

  it("offlineGhost spends the full purse from day 1 (8 of 8 gold)", () => {
    // REDO-X step 2 (4.1; the pools changed, the regeneration): WEAVER's seed-3 offline ghost is now a FURNACE day-1 pick
    // holding TAR BARREL (+8 belt), so the deck is valued as bought (boughtCost: the rune's BELT is not crates), as this
    // file's other checks since FLIP-X2: 8 of 8 gold (was buildCost(...).total: 12 with the rune's belt charged as crates)
    // S8c (the pools): RULING-S8-R5 section 3 item 1 (T1e's form, RULING-S8-R1 item 3).
    // a48010b: with NPC_DAY on, a road-fed deck spends the road's drops too, by design. The regenerated pool's day-1 picks
    // are road-fed (P1 83c039d, NPC_DAY on), so the deck as bought is the full purse (8 of 8 gold, the shop's) plus its road
    // drops at their value (roadDropValue of its pool entry's road log), which only the player mode counts: the deck is held
    // to validateBuild's lines minus at most its ONE budget line (only while NPC_DAY is on) AND to validateUpload in the
    // player mode with its road log. Was: boughtCost(...) toBe 8 for both (the deck the shop's gold alone)
    const days1 = (["furnace", "weaver"] as const).map((hero) => {
      const g = offlineGhost(hero, 1, 3), road = pickEntry(g.snapshot.hero, 1, 3).road;
      const strict = validateBuild(g.snapshot.build, 1).errors;
      const budgetLine = npcDayRules() ? strict.filter((x) => x.startsWith("budget: ")) : [];
      expect(budgetLine.length, `${hero}: at most its one budget line`).toBeLessThanOrEqual(1);
      expect(strict.filter((x) => !budgetLine.includes(x)), `${hero}: every other strict line`).toEqual([]);
      expect(validateUpload(g.snapshot.build, 1, g.snapshot.rules, { ...(road ? { road } : {}) }).errors, `${hero}: the player mode with its road log`).toEqual([]);
      return [boughtCost(g.snapshot.build), npcDayRules() ? roadDropValue(road) : 0];
    });
    // BUMP-1E: the stand-in pool regenerated under bb-0.12.0 (R1: every switch on, the seven scaling rigs in the shop; src/sim/standInPoolData.ts). Day 1, seed 3: a FURNACE
    // requester's stand-in is still the WEAVER pick (loom, embertrough, sparkgap, plateroller: 11 as bought, its road's plateroller drop worth 3), and a WEAVER requester's is
    // now the FURNACE pick of kiln, whetstone and temper (8 as bought, a road with no drop), where it held a deck of 11 with 3 of drops. The shop's part is the full
    // purse, 8 of 8, in both (11 - 3, 8 - 0: the loop below); the strict and player-mode checks above pass for both
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2): the stand-in pool regenerated under bb-0.13.0, src/sim/standInPoolData.ts, GATES and ENCHANT shipped on in the shop and on the road): day 1, seed 3: both requesters' stand-ins now hold
    // 14 as bought with 6 of road drops (measured by this test; 14 - 6 = 8: the shop's part is still the full purse, the loop below); was [[11, 3], [8, 0]]
    expect(days1).toEqual([[14, 6], [14, 6]]); // BUMP-1F: was [[11, 3], [8, 0]]. BUMP-1E: was [[11, 3], [11, 3]]. S8c (the pools): the deck as bought, its drops: was 8 (and no drops) for both
    for (const [value, drops] of days1) expect(value - drops, "the shop's part, the full purse").toBe(8);
  });

  it("the two sample-pool variants differ for every hero and day", () => {
    const pool = generateSamplePool();
    for (const hero of STAND_IN_HEROES) {
      for (let day = 1; day <= 10; day++) {
        const [v0, v1] = [0, 1].map((v) => pool.find((s) => s.hero === hero && s.day === day && s.playerId === `sample-${hero}-${v}`)!);
        expect(JSON.stringify(v1.build), `${hero} d${day}`).not.toBe(JSON.stringify(v0.build));
      }
    }
  }, 600_000); // AZ-BUMP (JOINS-1 question 5; a host timeout, not the rule): generateSamplePool builds the whole seed pool
  // (the race heroes' par runs, every ghost through seedGhost's checks): 11.4 s in AZ-BUMP S1's whole suite, but 231-288 s
  // under the 1.5-CPU quota on the host (231 s alone at 283cfaf), over vitest's 30 s default
});
