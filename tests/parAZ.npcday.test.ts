// PAR-AZ (REQ-BFG-078, REQ-BFG-077; BRIEF-PARAZ 1 (a); cap's ruling Q5 on REVIEW-HULL1D): the par player's NPC day, behind
// NPC_DAY. After each dawn's shop the par player fights the day's MEDIUM warlord as the game plays it (road.ts pickRoad /
// warlordFight, the battle on warlordSeed and the run's day, finishWarlord): a win pays rewardGold and the seeded drop,
// which the bots place as a free part (placeFreePart: a merge, a spot, the REFIT swap, else cargo); a loss pays nothing and
// costs no life; no events. With the switch off nothing runs: no road, the day's gold and the cache key as before.
// The switches are set through their own setters and all put back off after each test.
import { afterEach, describe, expect, it } from "vitest";
import { START_LIVES, type HeroId } from "../src/sim/content";
import { turretList } from "../src/sim/deck";
import { maxGoldByDay } from "../src/net/validate";
import { runeGrants } from "../src/sim/runes";
import { valueOf } from "../src/sim/stars";
import { difficultyOf, warlordOffer } from "../src/sim/rivals";
import { rewardGold, warlordDeck } from "../src/game/road";
import { rollDrop, setNpcDay } from "../src/sim/npcDay";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { PAR_ROAD_TIER, PLAYER_DAYS, parRunSeed, playerRun, type PlayerDay } from "../src/sim/harness/player";
import { caravanDeck } from "../src/sim/harness/caravan";
import { boughtCost } from "../src/sim/harness/standins";
import { FUSE_MAX } from "../src/sim/stars";
import type { Run } from "../src/game/run";

afterEach(() => {
  setNpcDay(false);
  setHullScale(false);
  setLadderFix(false);
});

const HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const allOn = (): void => { setNpcDay(true); setHullScale(true); setLadderFix(true); };

/** A fresh (uncached) run, the run object kept: onDecide makes the run traced (no cache) and hands over the run. */
function traced(hero: HeroId, days: number, seed: number): { days: PlayerDay[]; run: Run } {
  let run: Run | undefined;
  const out = playerRun(hero, days, seed, { onDecide: (r) => { run = r; } });
  return { days: out, run: run! };
}

/** Does the dusk deck hold a copy of `def` (deck items, gear and cores, installed turrets)? */
const holds = (d: PlayerDay, def: string): boolean =>
  d.build.items.some((p) => p.def === def) || d.build.mods.some((m) => m.def === def) || turretList(d.build).some((t) => t.def === def);

describe("PAR-AZ: the par player's NPC day, NPC_DAY off (nothing runs)", () => {
  it("off: no road stop, no road log, and the day's gold as before (boughtCost + rerolls + purse + sold loss = maxGoldByDay + the runes' gold)", () => {
    for (const hero of ["furnace", "bastion"] as const) for (const seed of [1, 2]) {
      const { days, run } = traced(hero, PLAYER_DAYS, seed);
      expect(run.warlords, `${hero} s${seed}`).toEqual([]);
      for (const d of days) {
        const at = `${hero} s${seed} d${d.day}`;
        for (const k of ["road", "roadGold", "roadDrops", "cargo"]) expect(k in d, `${at} ${k}`).toBe(false);
        expect(d.budget, at).toBe(maxGoldByDay(d.day) + runeGrants(d.build.runes, d.day).gold);
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss, at).toBe(d.budget);
      }
      // the traced run and the cached one are the same run
      expect(JSON.stringify(playerRun(hero, PLAYER_DAYS, seed)), `${hero} s${seed}`).toBe(JSON.stringify(days));
    }
  });

  it("the cache key keeps NPC_DAY apart: a run made with it on is never reused off (off, on, off again: the first and last equal)", () => {
    const off1 = JSON.stringify(playerRun("weaver", PLAYER_DAYS, 3));
    setNpcDay(true);
    const on = JSON.stringify(playerRun("weaver", PLAYER_DAYS, 3));
    setNpcDay(false);
    const off2 = JSON.stringify(playerRun("weaver", PLAYER_DAYS, 3));
    expect(on).not.toBe(off1);
    expect(off2).toBe(off1);
    expect(off1.includes("\"road\"")).toBe(false);
  });
});

describe("PAR-AZ: the par player's NPC day, every switch on (the benches' setting)", () => {
  it("every day: the fork's Medium warlord, the game's road log entry, a win's rewardGold and seeded drop, nothing on a loss, no life lost", () => {
    allOn();
    let wins = 0, losses = 0, drops = 0, placed = 0, cargo = 0;
    for (const hero of HEROES) for (const seed of [1, 2]) {
      const { days, run } = traced(hero, PLAYER_DAYS, seed);
      const runSeed = parRunSeed(hero, seed);
      expect(run.lives, `${hero} s${seed}: a warlord loss costs no life`).toBe(START_LIVES);
      expect(run.warlords.length, `${hero} s${seed}: one road log entry a day`).toBe(PLAYER_DAYS);
      let gold = 0, dropValue = 0;
      for (const d of days) {
        const at = `${hero} s${seed} d${d.day}`, r = d.road!;
        expect(r, at).toBeDefined();
        // the Medium warlord of the day's fork, never Easy, Hard or the Matriarch
        expect(r.id, at).toBe(warlordOffer(runSeed, d.day).medium);
        expect(difficultyOf(r.id), at).toBe(PAR_ROAD_TIER);
        // the game's road log entry, as finishWarlord writes it
        const log = run.warlords[d.day - 1];
        expect({ day: log.day, tier: log.tier, id: log.id, outcome: log.outcome, gold: log.gold, part: log.part }, at)
          .toEqual({ day: d.day, tier: "medium", id: r.id, outcome: r.outcome, gold: r.gold, part: r.drop });
        expect(r.time, at).toBeGreaterThan(0);
        if (r.outcome === "win") {
          wins++;
          expect(r.gold, at).toBe(rewardGold("medium", d.day));
          expect(r.drop, at).toBe(rollDrop(runSeed, d.day, "medium", warlordDeck(r.id, d.day))); // the seeded roll (★1)
        } else {
          losses++;
          expect(r.gold, at).toBe(0);
          expect(r.drop, at).toBeNull();
          expect(r.placed, at).toBe(false);
        }
        gold += r.gold;
        if (r.drop) {
          drops++;
          dropValue += valueOf(r.drop, 1);
          if (r.placed) { placed++; expect(holds(d, r.drop), `${at}: placed ${r.drop}`).toBe(true); }
          else { cargo++; expect(d.cargo!, `${at}: ${r.drop} in cargo`).toBeGreaterThanOrEqual(valueOf(r.drop, 1)); }
        }
        // the road's gold and drops by this dusk, and the day's gold adds up with them
        expect(d.roadGold, at).toBe(gold);
        expect(d.roadDrops, at).toBe(dropValue);
        expect(d.budget, at).toBe(maxGoldByDay(d.day) + runeGrants(d.build.runes, d.day).gold + gold + dropValue);
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + d.cargo!, at).toBe(d.budget);
      }
    }
    expect(wins, "wins in the sample").toBeGreaterThan(0);
    expect(losses, "losses in the sample").toBeGreaterThan(0);
    expect(placed, "drops placed in the sample").toBeGreaterThan(0);
    expect(drops, "drops").toBe(placed + cargo);
  });

  it("NPC_DAY alone runs the same road stop (Medium, the reward, the drop) and the gold adds up", () => {
    setNpcDay(true);
    for (const hero of ["foundry", "weaver"] as const) {
      const days = playerRun(hero, PLAYER_DAYS, 5);
      for (const d of days) {
        const at = `${hero} d${d.day}`, r = d.road!;
        expect(difficultyOf(r.id), at).toBe("medium");
        expect(r.gold, at).toBe(r.outcome === "win" ? rewardGold("medium", d.day) : 0);
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + d.cargo!, at).toBe(d.budget);
      }
    }
  });

  it("deterministic: two calls give the same run, and days 1..d of a longer run are exactly the run to day d", () => {
    allOn();
    for (const hero of ["furnace", "bastion"] as const) {
      const cached = playerRun(hero, PLAYER_DAYS, 7);
      const fresh = traced(hero, PLAYER_DAYS, 7).days;
      expect(JSON.stringify(fresh), hero).toBe(JSON.stringify(cached));
      expect(JSON.stringify(playerRun(hero, PLAYER_DAYS, 7)), hero).toBe(JSON.stringify(cached));
      for (const d of [1, 4, 8]) expect(JSON.stringify(traced(hero, d, 7).days), `${hero} to d${d}`).toBe(JSON.stringify(cached.slice(0, d)));
    }
  });

  it("the stand-in generator's budget counts the road's gold and drops (caravan.ts meta.road), as validate.ts does; off, as before", () => {
    let over = 0;
    for (const on of [false, true]) {
      setNpcDay(on); setHullScale(on); setLadderFix(on);
      for (const hero of ["furnace", "weaver"] as const) for (const day of [3, 6, 10]) {
        const c = caravanDeck(hero, day, 11, "typical", FUSE_MAX), d = playerRun(hero, PLAYER_DAYS, 11, { policy: "typical", maxStars: FUSE_MAX })[day - 1];
        const at = `${on ? "on" : "off"} ${hero} d${day}`, grant = runeGrants(c.build.runes, day).gold;
        if (!on) {
          expect("road" in c.meta, at).toBe(false);
          expect(c.meta.spent, at).toBe(maxGoldByDay(day) + grant - d.gold);
          expect(boughtCost(c.build) + c.meta.cargoGold, at).toBeLessThanOrEqual(maxGoldByDay(day) + grant);
          continue;
        }
        expect(c.meta.road, at).toBe(d.roadGold! + d.roadDrops!);
        expect(c.meta.spent, at).toBe(maxGoldByDay(day) + grant + d.roadGold! - d.gold); // the road's gold is spent gold
        expect(c.meta.cargoGold, at).toBe(d.cargo); // the cargo's worth, as before
        expect(boughtCost(c.build) + c.meta.cargoGold, at).toBeLessThanOrEqual(maxGoldByDay(day) + grant + c.meta.road!);
        if (boughtCost(c.build) + c.meta.cargoGold > maxGoldByDay(day) + grant) over++;
      }
    }
    // without the road's term the old check would refuse decks the road paid for
    expect(over, "decks over the day's gold alone").toBeGreaterThan(0);
  });
});
