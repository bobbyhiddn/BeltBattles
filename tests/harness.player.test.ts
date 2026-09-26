// FB-C (REQ-BFG-026): the par player. playerBuild(hero, day, seed) plays a real run through the game's caravan
// (rollShop, reroll, buyOffer), so par is what a typical player can actually assemble under shop luck.
import { describe, expect, it } from "vitest";
import { ITEMS, REROLL_COST } from "../src/sim/content";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { PLAYER_DAYS, knobsOf, playerBuild, playerRun } from "../src/sim/harness/player";
import { PAR_K, medianIndex, parField, parRefs, parSeeds } from "../src/sim/harness/par";
import { heroRefBuild } from "../src/sim/harness/heroes";

const HEROES = ["furnace", "weaver"] as const;

describe("par player (playerBuild): a real run through the caravan", () => {
  it("buys only what the caravan offers, unsold, at the offered price, and rerolls at the real cost", () => {
    for (const hero of HEROES) {
      for (const seed of [1, 2, 3]) {
        let bought = 0, rerolls = 0;
        playerRun(hero, PLAYER_DAYS, seed, {
          trace: (run, w, s) => {
            const o = run.shop.wagons[w]?.offers[s];
            expect(o, `${hero} s${seed} d${run.day}: a bought slot exists`).toBeDefined();
            expect(o!.sold, `${hero} s${seed} d${run.day}: ${o!.def} unsold when bought`).toBe(false);
            expect(o!.price, `${hero} s${seed}: ${o!.def} affordable`).toBeLessThanOrEqual(run.gold);
            expect(o!.price).toBe(Math.max(1, ITEMS[o!.def].price - (run.shop.discount || 0)));
            bought++;
          },
          onReroll: (run) => {
            expect(run.gold, `${hero} s${seed} d${run.day}: a reroll is paid for`).toBeGreaterThanOrEqual(REROLL_COST);
            rerolls++;
          },
        });
        expect(bought).toBeGreaterThan(10);
        // a player rerolls a few times a run, not every dawn: the policy keeps the run's reroll gold within its
        // share of the day's gold (rerollShare; the stuck rerolls within 1 - floor), 15 g of day 10's 119
        const pol = knobsOf();
        const cap = Math.max(pol.rerollShare, 1 - pol.floor) * maxGoldByDay(PLAYER_DAYS);
        expect(rerolls * REROLL_COST, `${hero} s${seed}: ${rerolls} rerolls`).toBeLessThanOrEqual(cap);
        expect(playerRun(hero, PLAYER_DAYS, seed)[PLAYER_DAYS - 1].rerollGold).toBe(rerolls * REROLL_COST);
      }
    }
  });

  it("every day's deck is legal (validateBuild, no unfused pair) and the gold adds up to maxGoldByDay", () => {
    for (const hero of HEROES) {
      for (const seed of parSeeds()) {
        for (const d of playerRun(hero, PLAYER_DAYS, seed)) {
          const v = validateBuild(d.build, d.day);
          expect(v.ok, `${hero} s${seed} d${d.day}: ${v.errors.join("; ")}`).toBe(true);
          expect(unfusedPairs(d.build)).toEqual([]);
          expect(d.value).toBe(buildCost(d.build).total);
          // deck value + reroll gold + unspent gold + what selling replaced parts lost = every gold the run received
          expect(d.value + d.rerollGold + d.gold + d.soldLoss, `${hero} s${seed} d${d.day}`).toBe(maxGoldByDay(d.day));
        }
      }
    }
  });

  it("spends like a player: the field's median deck is at least 85% of maxGoldByDay on every hero-day", () => {
    for (const hero of HEROES) {
      for (let day = 1; day <= PLAYER_DAYS; day++) {
        const shares = parSeeds().map((s) => playerRun(hero, day, s)[day - 1].value / maxGoldByDay(day)).sort((a, b) => a - b);
        const median = (shares[(shares.length - 1) >> 1] + shares[shares.length >> 1]) / 2;
        expect(median, `${hero} d${day}: ${shares.map((x) => Math.round(100 * x)).join(" ")}`).toBeGreaterThanOrEqual(0.85);
      }
    }
  });

  it("is deterministic per (hero, day, seed), and a day's deck is the same whether or not the run goes on", () => {
    for (const hero of HEROES) {
      const a = JSON.stringify(playerBuild(hero, 7, 5));
      expect(JSON.stringify(playerBuild(hero, 7, 5))).toBe(a);
      expect(JSON.stringify(playerRun(hero, 10, 5)[6].build)).toBe(a);
      // a traced run (no cache) plays the same
      expect(JSON.stringify(playerRun(hero, 7, 5, { trace: () => {} })[6].build)).toBe(a);
      expect(JSON.stringify(playerBuild(hero, 7, 6))).not.toBe(a);
    }
  });

  it("returns fresh copies: mutating one never changes the next call", () => {
    const b = playerBuild("furnace", 4, 2);
    b.items.length = 0;
    expect(playerBuild("furnace", 4, 2).items.length).toBeGreaterThan(0);
  });
});

describe("par field (par.ts): the par of a hero and day is K par-player decks", () => {
  it("parRefs is the field of PAR_K seeds by default, heroRefBuild only when asked for the legacy par", () => {
    const field = parRefs("weaver", 3);
    expect(field.length).toBe(PAR_K);
    expect(field.map((b) => JSON.stringify(b))).toEqual(parField("weaver", 3).map((b) => JSON.stringify(b)));
    expect(JSON.stringify(field[0])).toBe(JSON.stringify(playerBuild("weaver", 3, 1)));
    expect(parRefs("weaver", 3, "heroref")).toEqual([heroRefBuild("weaver", 3)]);
  });

  it("medianIndex takes the lower median, ties to the lower index", () => {
    expect(medianIndex([0.9, 0.1, 0.5])).toBe(2);
    expect(medianIndex([0.2, 0.8, 0.4, 0.6])).toBe(2);
    expect(medianIndex([0.5, 0.5, 0.5, 0.5])).toBe(1);
  });
});
