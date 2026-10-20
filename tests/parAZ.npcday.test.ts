// PAR-AZ (REQ-BFG-078, REQ-BFG-077; BRIEF-PARAZ 1 (a); cap's ruling Q5 on REVIEW-HULL1D): the par player's NPC day, behind
// NPC_DAY. After each dawn's shop the par player fights the day's MEDIUM warlord as the game plays it (road.ts pickRoad /
// warlordFight, the battle on warlordSeed and the run's day, finishWarlord): a win pays rewardGold and the seeded drop,
// which the bots place as a free part (placeFreePart: a merge, a spot, the REFIT swap, else cargo); a loss pays nothing and
// costs no life; no events. With the switch off nothing runs: no road, the day's gold and the cache key as before.
// The switches are set through their own setters and all put back after each test (on: the shipped value, AZ-BUMP's flip).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HeroId } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): the par run starts with 10 hearts
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
import { boughtCost, maxStarsOf } from "../src/sim/harness/standins";
import { FUSE_MAX } from "../src/sim/stars";
import type { Run } from "../src/game/run";
import { setShrine } from "../src/game/shrine"; // BUMP-1F (ENCHANT-2 T3): the road-event bag without the ASH SHRINE for the gold identities

// BUMP-1F (ENCHANT-2 T3, RULING-BUMP1F-R3.1): the road-event bag is read WITHOUT the ASH SHRINE in this file (setShrine false, the state-B precedent of tests/enchant1.bots; the afterEach puts it back): the shrine's
// cargo card gives a cargo part away (the par bot's card 1, shrineBot.ts), whose value no PlayerDay field names, so every identity below breaks after it by that value (furnace s1 d9: 150 of 153); was no switch
beforeEach(() => setShrine(false));
afterEach(() => {
  // the shipped value (AZ-BUMP's flip); a test that needs a switch off sets it off itself
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
  setShrine(true); // BUMP-1F: the shipped value (ENCHANT-2)
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
    setNpcDay(false); // AZ-BUMP (the flip, NPC_DAY): it ships on, so the off test sets it off itself (the afterEach puts it back)
    for (const hero of ["furnace", "bastion"] as const) for (const seed of [1, 2]) {
      const { days, run } = traced(hero, PLAYER_DAYS, seed);
      expect(run.warlords, `${hero} s${seed}`).toEqual([]);
      for (const d of days) {
        const at = `${hero} s${seed} d${d.day}`;
        for (const k of ["road", "roadGold", "roadDrops", "cargo"]) expect(k in d, `${at} ${k}`).toBe(false);
        expect(d.budget, at).toBe(maxGoldByDay(d.day) + runeGrants(d.build.runes, d.day).gold);
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + (d.wordGold ?? 0), at).toBe(d.budget); // BUMP-1F (ENCHANT on by default, RULING-BUMP1F-R5 R5.2 (2); ENCHANT-1 E6.4): + the ENCHANTER's gold (PlayerDay.wordGold); was without it (furnace s1 d3: 23 of 27)
      }
      // the traced run and the cached one are the same run
      expect(JSON.stringify(playerRun(hero, PLAYER_DAYS, seed)), `${hero} s${seed}`).toBe(JSON.stringify(days));
    }
  });

  it("the cache key keeps NPC_DAY apart: a run made with it on is never reused off (off, on, off again: the first and last equal)", () => {
    setNpcDay(false); // AZ-BUMP (the flip, NPC_DAY): the first run is the off one, so the test sets the switch off itself
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
      // HULL-ON (the flip, HEARTS): START_LIVES (5) -> HEARTS_START (10): the par run is a hearts run (newRun with HEARTS on),
      // and a road (warlord) fight never costs hearts, so it ends where it started
      expect(run.lives, `${hero} s${seed}: a warlord loss costs no life`).toBe(HEARTS_START);
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
        // BUMP-1F (ENCHANT on by default, RULING-BUMP1F-R5 R5.2 (2); ENCHANT-1 E6.4): + the gold spent at the ENCHANTER (PlayerDay.wordGold); was boughtCost + rerollGold + gold + soldLoss + cargo (furnace s1 d3: 34 of 42)
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + (d.wordGold ?? 0) + d.cargo!, at).toBe(d.budget);
      }
    }
    expect(wins, "wins in the sample").toBeGreaterThan(0);
    expect(losses, "losses in the sample").toBeGreaterThan(0);
    expect(placed, "drops placed in the sample").toBeGreaterThan(0);
    expect(drops, "drops").toBe(placed + cargo);
    // AZ-BUMP (the flip): 600 s, 30 s hit in run 5's group check under the 1.5-CPU quota (the GATE RULE), not the rule
  }, 600_000);

  it("NPC_DAY alone runs the same road stop (Medium, the reward, the drop) and the gold adds up", () => {
    setNpcDay(true);
    setHullScale(false); // AZ-BUMP (the flip): HULL_SCALE and LADDER_FIX ship on, so "NPC_DAY alone" sets them off itself
    setLadderFix(false);
    for (const hero of ["foundry", "weaver"] as const) {
      const days = playerRun(hero, PLAYER_DAYS, 5);
      for (const d of days) {
        const at = `${hero} d${d.day}`, r = d.road!;
        expect(difficultyOf(r.id), at).toBe("medium");
        expect(r.gold, at).toBe(r.outcome === "win" ? rewardGold("medium", d.day) : 0);
        // BUMP-1F (ENCHANT on by default, RULING-BUMP1F-R5 R5.2 (2); ENCHANT-1 E6.4): + the gold spent at the ENCHANTER (PlayerDay.wordGold); was boughtCost + rerollGold + gold + soldLoss + cargo (furnace s1 d3: 34 of 42)
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + (d.wordGold ?? 0) + d.cargo!, at).toBe(d.budget);
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
        // BUMP-1F (ENCHANT on by default, RULING-BUMP1F-R5 R5.2 (2)): caravan.ts books cargoGold as the RESIDUAL (spent + drops - value - rerolls - sale losses: spent gold in neither the deck, the rerolls nor
        // the sale losses), so the gold spent at the ENCHANTER (PlayerDay.wordGold) lands in it beside the cargo's worth; was toBe(d.cargo) (on furnace d3: 4 of 0)
        expect(c.meta.cargoGold, at).toBe(d.cargo! + (d.wordGold ?? 0)); // the cargo's worth and the ENCHANTER's gold
        expect(boughtCost(c.build) + c.meta.cargoGold, at).toBeLessThanOrEqual(maxGoldByDay(day) + grant + c.meta.road!);
        if (boughtCost(c.build) + c.meta.cargoGold > maxGoldByDay(day) + grant) over++;
      }
    }
    // without the road's term the old check would refuse decks the road paid for
    expect(over, "decks over the day's gold alone").toBeGreaterThan(0);
  });

  it("a capped run (a stand-in candidate: maxStars 2) declines a drop that would merge above its cap; its decks stop at 2 stars and the gold adds up", () => {
    allOn();
    let declines = 0;
    for (const hero of ["furnace", "weaver"] as const) for (let seed = 1; seed <= 16; seed++) {
      const days = playerRun(hero, PLAYER_DAYS, seed, { policy: "typical", maxStars: 2 });
      for (const d of days) {
        const at = `${hero} s${seed} d${d.day}`, r = d.road!;
        expect(maxStarsOf(d.build), at).toBeLessThanOrEqual(2);
        // BUMP-1F (ENCHANT on by default, RULING-BUMP1F-R5 R5.2 (2); ENCHANT-1 E6.4): + the gold spent at the ENCHANTER (PlayerDay.wordGold); was boughtCost + rerollGold + gold + soldLoss + cargo (furnace s1 d3: 34 of 42)
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + (d.wordGold ?? 0) + d.cargo!, at).toBe(d.budget);
        if (r.declined) {
          declines++;
          expect(r.outcome, at).toBe("win");
          expect(r.gold, at).toBe(rewardGold("medium", d.day)); // the win's gold is paid
          expect(r.drop, at).toBeNull();
          expect(r.declined, at).toBe(rollDrop(parRunSeed(hero, seed), d.day, "medium", warlordDeck(r.id, d.day)));
        }
      }
    }
    expect(declines, "declined drops in the sample").toBeGreaterThan(0);
    // the par player (no cap) never declines
    for (const d of playerRun("furnace", PLAYER_DAYS, 1)) expect(d.road!.declined, `par d${d.day}`).toBeUndefined();
  }, 600_000); // AZ-BUMP (the flip): 600 s, 90 s hit in run 5's group check under the 1.5-CPU quota (the GATE RULE). AZ-BUMP (REVIEW-AZPREP N1; a load timeout, not the rule): 21 s alone, but 30.7 s and 32.6 s in loaded
  // whole-suite gates (AZ-PREP's 7a30f36, REFIT-AZ's a3ae8c3), over vitest's 30 s default
});
