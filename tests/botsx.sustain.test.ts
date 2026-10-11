// BOTS-X (REQ-BFG-069, REQ-BFG-024, REQ-BFG-033): the sustain switch finished (the one day-3 hold for every sustain offer,
// content.ts SUSTAIN_FIRST_DAY), SUS-C's bots (SUSTAIN-1 4.8 rules 2-6: deckRating.ts's effective hull against the pinned
// expected foe, player.ts sustainRule and its placement) and captains (rivalBuilds.ts RivalPlan.sustain: THANE KARSK's WARD
// BELL). Everything here runs with the switch on (withSustain) unless a case says "off"; with it off every pool, offer and
// deck must stay as it was, which the pinned pool tests prove (harness.player, standin.caravan, standInPool*, rc.seedpool,
// net-pool, runes.bots, runes.snapshot, runes.system, captains.*, rivals*, wares, shop*, runes.parity, sustain.parity) and the
// "off" cases below check directly. tests/botsx.runes.test.ts holds step 4 (the bots' rune code).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { ITEMS, RUN_DAYS, SUSTAIN_FIRST_DAY, SUSTAIN_IDS, isSustain, withSustain, type HeroId } from "../src/sim/content";
import { cloneBuild, installTurret, installedTurrets, occupancy, turretList, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { starsOf } from "../src/sim/stars";
import { validateBuild } from "../src/net/validate";
import { newRun, reroll } from "../src/game/run";
import { finishDay } from "../src/game/day";
import { unlockDay } from "../src/game/wares";
import { firstOfferDay } from "../src/sim/harness/synergy";
import { randomBuild } from "../src/sim/harness/gen";
import { Rng } from "../src/core/rng";
import { RATING_CURVE, SUSTAIN_FOE, SUSTAIN_FOE_HS, fightTime, foeOn, rateDeck, sustainKeyword, type RateOut } from "../src/sim/deckRating";
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): SUSTAIN_FOE, the switch-off table, with HULL_SCALE off
import { boughtCost } from "../src/sim/harness/standins"; // AZ-BUMP (the flip): a deck with runes valued as bought
import {
  HERO_SUSTAIN, SHIELD_MAX, SUSTAIN_LEAN, SUSTAIN_MAX, busiestRoute, playerBuild, playerRun, quietTurret, secondSource, sustainPieces,
  sustainRule, type PlayerOffer,
} from "../src/sim/harness/player";
import { RIVAL_IDS, maxGoldByDay, rivalBuild, rivalLoadout, standInBuild } from "../src/sim/rivals";
import { LUCKS, PLANS, roadAllowance } from "../src/sim/rivalBuilds"; // AZ-BUMP: the road allowance
import { RUNE_LIST, isSustainRune, runeGrants, runeOffer, runeProblem } from "../src/sim/runes";
import type { SideStats } from "../src/sim/battle";

const HEROES4: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const SIDE0: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const offeredDefs = (run: ReturnType<typeof newRun>): string[] => run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def));

describe("BOTS-X step 1: the one day-3 hold for every sustain offer (the switch on)", () => {
  it("SUSTAIN_FIRST_DAY is 3; the wares unlock WARD BELL, MEND PRESS and MENDING LOOM on day 3 (rare and epic alike); the swaps' firstOfferDay too", () => {
    expect(SUSTAIN_FIRST_DAY).toBe(3);
    expect(SUSTAIN_IDS).toEqual(["wardbell", "mendpress", "mendingloom"]);
    for (const id of SUSTAIN_IDS) {
      expect(unlockDay(id, undefined), id).toBe(3);
      expect(unlockDay(id, 6), id).toBe(6); // a late restock day still wins
      expect(withSustain(() => firstOfferDay(ITEMS[id])), id).toBe(3);
    }
    expect(unlockDay("riveter", undefined)).toBe(1); // RIVETER stays as today
  });

  it("the shop: no caravan on days 1-2 offers a sustain piece (rerolls included), from day 3 they are offered; no run's wares unlock one earlier", () => {
    withSustain(() => {
      let early = 0, late = 0, wares = 0;
      for (const hero of HEROES4) for (let seed = 1; seed <= 30; seed++) {
        const run = newRun(hero, hashSeed("botsx-hold", hero, seed), `botsx-${hero}-${seed}`);
        for (const [id, d] of Object.entries(run.wares ?? {})) if (isSustain(id)) { wares++; expect(d, `${hero} ${seed} ${id}`).toBeGreaterThanOrEqual(3); }
        for (let day = 1; day <= 5; day++) {
          if (day > 1) finishDay(run, 0, 20, { ...SIDE0 }, { ...SIDE0 });
          for (let r = 0; r < 3; r++) {
            const n = offeredDefs(run).filter(isSustain).length;
            if (day < SUSTAIN_FIRST_DAY) early += n; else late += n;
            run.gold = Math.max(run.gold, 2);
            if (!reroll(run)) break;
          }
        }
      }
      expect(wares).toBeGreaterThan(0);
      expect(early).toBe(0);
      expect(late).toBeGreaterThan(0);
    });
  });

  it("off: no wares, offer or random deck holds a sustain piece (the random builder never buys one, on or off)", () => {
    // FLIP-X2 (REQ-BFG-069): the switch is on by default, so off is withSustain(fn, false) (was the default)
    withSustain(() => {
      for (const hero of HEROES4) for (let seed = 1; seed <= 10; seed++) {
        const run = newRun(hero, hashSeed("botsx-hold", hero, seed), `botsx-${hero}-${seed}`);
        expect(Object.keys(run.wares ?? {}).filter(isSustain)).toEqual([]);
        expect(offeredDefs(run).filter(isSustain)).toEqual([]);
      }
    }, false);
    withSustain(() => {
      for (const hero of HEROES4) for (let day = 3; day <= 10; day += 3) for (let seed = 1; seed <= 4; seed++) {
        const b = randomBuild(hero, day, new Rng(hashSeed("botsx-random", hero, day, seed)), "on", 3, "on", "on");
        expect([...b.items, ...b.mods].filter((p) => isSustain(p.def)).map((p) => p.def), `${hero} d${day} s${seed}`).toEqual([]);
      }
    });
  });

  it("the runes: the day 1-2 offers with the switch on are exactly the switch-off offers and hold no sustain rune; from day 3 the 8 are offered", () => {
    let later = 0;
    for (const hero of HEROES4) for (let seed = 1; seed <= 150; seed++) {
      const held: string[] = [];
      for (let day = 1; day <= RUN_DAYS; day++) {
        const on = withSustain(() => runeOffer(seed * 7919, day, hero, held));
        if (day < SUSTAIN_FIRST_DAY) {
          expect(on, `${hero} ${seed} d${day}`).toEqual(runeOffer(seed * 7919, day, hero, held));
          expect(on.ids.filter(isSustainRune), `${hero} ${seed} d${day}`).toEqual([]);
        } else later += on.ids.filter(isSustainRune).length;
        held.push(on.ids[seed % on.ids.length]);
      }
    }
    expect(later).toBeGreaterThan(0);
  });

  it("runeProblem: with no seed a sustain rune taken at dawn 1 or 2 is refused, at dawn 3 it passes; with the seed the offer check refuses it", () => {
    withSustain(() => {
      expect(runeProblem([{ id: "tick_guard" }], 1, "bastion")).toMatch(/runes\[0\]: TICK GUARD is not offered before the dawn of day 3/);
      expect(runeProblem([{ id: "iron_skin" }, { id: "green_thread" }], 2, "weaver")).toMatch(/runes\[1\]: GREEN THREAD is not offered before the dawn of day 3/);
      expect(runeProblem([{ id: "iron_skin" }, { id: "war_edge" }, { id: "green_thread" }], 3, "weaver")).toBeNull();
      // the seed: no dawn 1 or 2 offers one (the offers are the switch-off offers), so the offer check refuses it
      for (const seed of [1, 4242, 90210]) {
        expect(runeProblem([{ id: "tick_guard" }], 1, "bastion", seed)).toMatch(/TICK GUARD was not offered at the dawn of day 1/);
        const d1 = runeOffer(seed, 1, "weaver", []).ids[0];
        expect(runeProblem([{ id: d1 }, { id: "green_thread" }], 2, "weaver", seed)).toMatch(/GREEN THREAD was not offered at the dawn of day 2/);
      }
    });
    // off: the switch's own refusal comes first, as before (FLIP-X2: off is withSustain(fn, false), the switch being on by
    // default; the default gives the day-3 hold's refusal above)
    expect(withSustain(() => runeProblem([{ id: "tick_guard" }], 1, "bastion"), false)).toMatch(/TICK GUARD is not in the game while sustain is off/);
    expect(runeProblem([{ id: "tick_guard" }], 1, "bastion")).toMatch(/runes\[0\]: TICK GUARD is not offered before the dawn of day 3/);
    expect(RUNE_LIST.some((d) => isSustainRune(d.id))).toBe(false);
  });
});

describe("BOTS-X step 2: the bots' sustain value (deckRating.ts, SUSTAIN-1 4.8 rule 2)", () => {
  it("the value table is the bench's: tools/sustainFoe.ts on bx with the switch on, its command, seeds and date named beside it", () => {
    expect(SUSTAIN_FOE.length).toBe(10);
    // FLIP-X2 step 3c (d3981f8; REVIEW-TUNEX's re-run after the rune lines): the table is tools/sustainFoe.ts re-run on
    // flipx2 8d714af with both switches on, the same command and shards (was bx e1e1004's: day 1 29.34 / 0.208 / 65.5, day 5
    // 20.79 / 0.415 / 80.7, day 10 17.91 / 0.527 / 95.5); bx's run stays named beside it as the table's first build
    expect(SUSTAIN_FOE[0]).toEqual({ fight: 29.25, burn: 0.25, hit: 74.5 });
    expect(SUSTAIN_FOE[4]).toEqual({ fight: 18.56, burn: 0.49, hit: 88.0 });
    expect(SUSTAIN_FOE[9]).toEqual({ fight: 13.41, burn: 0.719, hit: 113.1 });
    // AZ-BUMP (the flip, HULL_SCALE): foeOn reads PAR-AZ's all-on table, SUSTAIN_FOE_HS (day 1 29.25 / 0.25 / 74.5 -> 29.68 /
    // 0.25 / 70.5), the fights on the day's hull; SUSTAIN_FOE above is the switch-off table, read with HULL_SCALE off
    expect(foeOn(0)).toBe(SUSTAIN_FOE_HS[0]);
    expect(foeOn(0)).toEqual({ fight: 29.68, burn: 0.25, hit: 70.5 });
    expect(foeOn(14)).toBe(SUSTAIN_FOE_HS[9]);
    withHullScale(() => {
      expect(foeOn(0)).toBe(SUSTAIN_FOE[0]);
      expect(foeOn(14)).toBe(SUSTAIN_FOE[9]);
    }, false);
    const src = readFileSync(new URL("../src/sim/deckRating.ts", import.meta.url), "utf8");
    for (const s of ["tools/sustainFoe.ts", "bx e1e1004", 'hashSeed("botsx-foe"', "2026-10-05 06:14:33Z", "--k 6 --seeds 4", "nice -n 19"]) expect(src, s).toContain(s);
    // FLIP-X2: and the re-run that wrote today's table, its branch, commit and times
    for (const s of ["flipx2 8d714af", "2026-10-05 08:48:43-08:49:28Z", "W/output-flipx2/bench/foe-*.json"]) expect(src, s).toContain(s);
    const tool = readFileSync(new URL("../tools/sustainFoe.ts", import.meta.url), "utf8");
    expect(tool).toContain('hashSeed("botsx-foe", day, heroes[x], heroes[y], i, j, s)');
    expect(tool).toContain("setSustain(true)");
  });

  it("the keywords: WARD BELL SHIELD, RIVETER and MEND PRESS HEAL, MENDING LOOM REGEN, nothing else", () => {
    expect(["wardbell", "riveter", "mendpress", "mendingloom"].map(sustainKeyword)).toEqual(["SHIELD", "HEAL", "HEAL", "REGEN"]);
    const others = Object.keys(ITEMS).filter((id) => sustainKeyword(id) && !["wardbell", "riveter", "mendpress", "mendingloom"].includes(id));
    expect(others).toEqual([]);
  });

  it("effective hull: SHIELD = the SHIELDs over the foe's fight x its mean hit; REGEN and HEAL = min(25 s, the fight) x (1 - burn / 2); off or without a day the rating is as before", () => {
    const base = playerBuild("bastion", 5, 1);
    const t = installedTurrets(base)[0].slot;
    const withGear = (def: string, stars = 1): Build => ({ ...cloneBuild(base), mods: [...base.mods, { uid: 9999, def, turret: t, ...(stars > 1 ? { stars } : {}) }] });
    const read = (b: Build, day: number): RateOut => { const o: RateOut = { stokeKeep: new Map() }; rateDeck(b, RATING_CURVE, fightTime(day), o, undefined, day); return o; };
    withSustain(() => {
      const f5 = foeOn(5);
      expect(read(withGear("wardbell"), 5).sustain!.shield).toBeCloseTo(Math.floor(f5.fight / 8) * f5.hit, 9); // 2 x 80.7
      expect(read(withGear("wardbell", 3), 5).sustain!.shield).toBeCloseTo(Math.floor(f5.fight / 4) * f5.hit, 9); // 5 x 80.7
      expect(read(withGear("mendingloom"), 5).sustain!.regen).toBeCloseTo(10 * f5.fight * (1 - f5.burn / 2), 9);
      const f1 = foeOn(1); // day 1's fight is longer than the wind's 25 s: REGEN counts 25 s
      expect(read(withGear("mendingloom", 2), 1).sustain!.regen).toBeCloseTo(15 * 25 * (1 - f1.burn / 2), 9);
      // the defense gains exactly the total; WARD BELL and MENDING LOOM take no NOMINAL credit (the offense is the deck's)
      const r0 = rateDeck(base, RATING_CURVE, fightTime(5), undefined, undefined, 5), r1 = rateDeck(withGear("wardbell"), RATING_CURVE, fightTime(5), undefined, undefined, 5);
      expect(r1.offense).toBeCloseTo(r0.offense, 9);
      expect(r1.defense - r0.defense).toBeCloseTo(read(withGear("wardbell"), 5).sustain!.total, 9);
      // without a day: the rating as before, NOMINAL credit and all
      expect(rateDeck(withGear("wardbell"), RATING_CURVE, fightTime(5)).offense).toBeGreaterThan(r0.offense);
    });
    // off: the day changes nothing (every par rating, so every par run, as before). FLIP-X2 (REQ-BFG-069): the switch is on
    // by default, so off is withSustain(fn, false) (was the default)
    withSustain(() => {
      for (const b of [base, withGear("wardbell"), withGear("mendingloom"), playerBuild("foundry", 7, 2), playerBuild("furnace", 9, 3)]) {
        expect(rateDeck(b, RATING_CURVE, fightTime(5), undefined, undefined, 5)).toEqual(rateDeck(b, RATING_CURVE, fightTime(5)));
        const o: RateOut = { stokeKeep: new Map() };
        rateDeck(b, RATING_CURVE, fightTime(5), o, undefined, 5);
        expect(o.sustain).toBeUndefined();
      }
    }, false);
    // AZ-BUMP (the flip): 600 s, 30 s hit in run 5's group check under the 1.5-CPU quota (the GATE RULE), not the rule
  }, 600_000);
});

describe("BOTS-X step 2: the bots' rules (player.ts, SUSTAIN-1 4.8 rules 2-6; the switch on)", () => {
  const cand = (def: string, rel: number, price: number, extra: Record<string, unknown> = {}) =>
    ({ wagon: 0, slot: 0, def, price, kind: ITEMS[def].kind === "gate" ? "rig" : ITEMS[def].kind === "mod" ? "gear" : ITEMS[def].kind, merge: false, rel, ...extra });
  /** A free cell (no item, no belt), from the bottom row up: a hand-placed part there cuts no turret line. */
  const freeCell = (b: Build): { x: number; y: number } => {
    const occ = occupancy(b);
    for (let k = 99; k >= 0; k--) if (occ[k].item < 0 && occ[k].route < 0) return { x: k % 10, y: Math.floor(k / 10) };
    throw new Error("no free cell");
  };
  const ready = (hero: HeroId): Build => { const b = cloneBuild(heroStartBuild(hero)); b.items.push({ uid: 500, def: "temper", ...freeCell(b) }); return b; };
  type C = ReturnType<typeof cand> & { banned?: boolean };
  const rule = (b: Build, cs: C[]): C[] => { sustainRule(b, cs as never); return cs; };

  it("the caps and the lean: at most 2 sustain pieces and 1 SHIELD source; x1.5 on the hero's own keyword", () => {
    expect([SUSTAIN_MAX, SHIELD_MAX, SUSTAIN_LEAN]).toEqual([2, 1, 1.5]);
    expect(HERO_SUSTAIN).toEqual({ bastion: "SHIELD", foundry: "HEAL", weaver: "REGEN" });
    // BASTION: a WARD BELL at 0.06 for 5 gold leans to 0.09 (0.018 a gold) and beats a rig at 0.08 (0.016 a gold)
    const [bell, rig] = rule(ready("bastion"), [cand("wardbell", 0.06, 5), cand("whetstone", 0.08, 5)]);
    expect(bell.rel).toBeCloseTo(0.09, 12);
    expect([bell.banned, rig.banned]).toEqual([undefined, undefined]);
    // WEAVER: no lean on SHIELD (0.012 a gold < 0.016): not the best value, banned; its own REGEN leans
    const [bellW, , loom] = rule(ready("weaver"), [cand("wardbell", 0.06, 5), cand("whetstone", 0.08, 5), cand("mendingloom", 0.06, 5)]);
    expect([bellW.rel, bellW.banned, loom.rel, loom.banned]).toEqual([0.06, true, 0.06 * 1.5, undefined]);
    // the caps: holding two sustain pieces, a new one is banned and a merge is not; holding a WARD BELL, a second is banned
    const two = ready("foundry");
    two.mods.push({ uid: 600, def: "mendingloom", turret: 0 });
    two.items.push({ uid: 601, def: "riveter", ...freeCell(two) });
    expect(secondSource(two)).toBe(true);
    expect(sustainPieces(two).map((p) => p.kw)).toEqual(["HEAL", "REGEN"]);
    const [n, m] = rule(two, [cand("wardbell", 0.5, 5), cand("riveter", 0.5, 5, { merge: true })]);
    expect([n.banned, m.banned]).toEqual([true, undefined]);
    const bellHeld = ready("bastion");
    bellHeld.mods.push({ uid: 600, def: "wardbell", turret: 0 });
    const [second, loomB] = rule(bellHeld, [cand("wardbell", 0.5, 5), cand("mendingloom", 0.5, 5)]);
    expect([second.banned, loomB.banned]).toEqual([true, undefined]);
  });

  it("the second damage source first; the best value per gold of the offer row (the packs and upgrades sit outside it); ties by item id", () => {
    for (const hero of HEROES4) expect(secondSource(heroStartBuild(hero)), hero).toBe(false); // a turret line, no rig yet
    expect(secondSource(ready("furnace"))).toBe(true);
    for (const hero of HEROES4) expect(secondSource(ready(hero)), hero).toBe(true);
    const start = cloneBuild(heroStartBuild("weaver"));
    start.items.push({ uid: 501, def: "riveter", ...freeCell(start) }); // RIVETER is no damage source
    expect(secondSource(start)).toBe(false);
    expect(rule(heroStartBuild("weaver"), [cand("mendingloom", 0.9, 5)])[0].banned).toBe(true);
    // an ARMOR PACK (wagon -2) and a gold upgrade (wagon -1) are outside the row
    const [loom] = rule(ready("weaver"), [cand("mendingloom", 0.06, 5), { ...cand("plating", 0.5, 5), wagon: -2, kind: "plating" }, { ...cand("press", 0.9, 10), wagon: -1, kind: "upgrade", def: "upgrade:turret" }]);
    expect(loom.banned).toBeUndefined();
    // ties: the lower item id wins (MENDING LOOM < WHETSTONE; WARD BELL > TEMPER)
    const [l2] = rule(ready("furnace"), [cand("mendingloom", 0.05, 5), cand("whetstone", 0.05, 5)]);
    const [b2] = rule(ready("furnace"), [cand("wardbell", 0.05, 5), cand("temper", 0.05, 5)]);
    expect([l2.banned, b2.banned]).toEqual([undefined, true]);
  });

  it("par runs: the caps hold every day, no sustain piece before day 3, each pick after the second damage source and as the row's best value per gold; one seed builds one deck", () => {
    withSustain(() => {
      let picks = 0, held = 0;
      const perGold = (o: PlayerOffer) => o.rel / Math.max(1, o.price);
      const rolled = (o: PlayerOffer) => o.kind !== "plating" && o.kind !== "crate" && o.kind !== "upgrade";
      for (const hero of HEROES4) for (let seed = 1; seed <= 8; seed++) {
        const days = playerRun(hero, 10, seed, {
          onDecide: (run, cands, pick) => {
            if (!pick || !sustainKeyword(pick)) return;
            picks++;
            const c = cands.find((x) => x.def === pick)!;
            expect(run.day, `${hero} ${seed} ${pick}`).toBeGreaterThanOrEqual(SUSTAIN_FIRST_DAY);
            expect(secondSource(run.build), `${hero} ${seed} d${run.day} ${pick}`).toBe(true);
            // against every other rolled offer the deck may take (another sustain piece may be capped: sustainRule's open set)
            for (const o of cands.filter((x) => rolled(x) && x.def !== pick && !sustainKeyword(x.def))) {
              expect(perGold(c) > perGold(o) || (perGold(c) === perGold(o) && pick < o.def), `${hero} ${seed} d${run.day}: ${pick} vs ${o.def}`).toBe(true);
            }
          },
        });
        for (const d of days) {
          const p = sustainPieces(d.build);
          held += p.length;
          expect(p.length, `${hero} ${seed} d${d.day}`).toBeLessThanOrEqual(SUSTAIN_MAX);
          expect(p.filter((x) => x.kw === "SHIELD").length, `${hero} ${seed} d${d.day}`).toBeLessThanOrEqual(SHIELD_MAX);
          if (d.day < SUSTAIN_FIRST_DAY) expect(p.filter((x) => isSustain(x.def)), `${hero} ${seed} d${d.day}`).toEqual([]);
          // AZ-BUMP (the flip, NPC_DAY): the par player fights the Medium warlord every day, so its deck holds the road's gold and
          // drops, which the strict (shop-only) validator doesn't budget (furnace 1 d2: 21 g of 17): every other check as before,
          // and the deck as bought within the day's par budget (PlayerDay.budget: maxGoldByDay + the runes' gold + the road's)
          expect(validateBuild(d.build, d.day).errors.filter((e) => !e.startsWith("budget:")), `${hero} ${seed} d${d.day}`).toEqual([]);
          expect(boughtCost(d.build), `${hero} ${seed} d${d.day}`).toBeLessThanOrEqual(d.budget);
        }
        // one seed builds one deck: the traced run above, the cached run and a second call are the same decks
        const again = playerRun(hero, 10, seed).map((d) => d.build);
        expect(again, `${hero} ${seed}`).toEqual(days.map((d) => d.build));
        expect(playerRun(hero, 10, seed).map((d) => d.build)).toEqual(again);
      }
      expect(picks).toBeGreaterThan(0);
      expect(held).toBeGreaterThan(0);
    });
  }, 600_000); // AZ-BUMP (the flip): 600 s, 120 s hit in run 5's group check under the 1.5-CPU quota (the GATE RULE; the
  // par runs fight a warlord every day), not the rule. FLIP-X2: heavier with the switches on (every par dawn takes a rune too): the whole-suite runs read 16.7 s at
  // step 1b, 21.9 s at step 2, 25.4 s at 3c; 26 s at host load 4 and 42-47 s at 11-15 here, against the global 30 s
  // (vite.config.ts). Its own limit, as 0.8.8 (bccf33f) gave two heavy tests: no assertion, input or check changed

  it("placement: RIVETER's belt is the one with the most payloads a second; WARD BELL and MENDING LOOM take an unfed turret first, else the least-damage one", () => {
    withSustain(() => {
      for (const [hero, day, seed] of [["foundry", 6, 1], ["weaver", 8, 2], ["furnace", 9, 3]] as [HeroId, number, number][]) {
        const b = playerBuild(hero, day, seed), o: RateOut = { stokeKeep: new Map(), arrival: new Map(), turretDmg: new Map() };
        rateDeck(b, RATING_CURVE, fightTime(day), o, undefined, day);
        const most = Math.max(...o.arrival!.values());
        const busy = busiestRoute(b, day)!;
        expect(o.arrival!.get(busy), `${hero} d${day}`).toBe(most);
        expect([...o.arrival!].filter(([, a]) => a === most).every(([ri]) => ri >= busy)).toBe(true); // ties: the lower index
        const slots = installedTurrets(b).map((v) => v.slot);
        const q = quietTurret(b, day, slots)!;
        expect(o.turretDmg!.get(q) ?? 0, `${hero} d${day}`).toBe(Math.min(...slots.map((s) => o.turretDmg!.get(s) ?? 0)));
      }
      // an unfed turret in the extra slot is the quiet one
      const f = cloneBuild(heroStartBuild("furnace"));
      expect(installTurret(f, { uid: 9600, def: "scrapcannon" }, 1).ok).toBe(true);
      expect(quietTurret(f, 5, [0, 1])).toBe(1);
      expect(quietTurret(f, 5, [0])).toBe(0);
      // in par runs: every WARD BELL and MENDING LOOM sits in a gear slot the turret has; every MEND PRESS belt ends on an intake
      for (const hero of HEROES4) for (let seed = 1; seed <= 6; seed++) {
        const b = playerBuild(hero, 10, seed);
        for (const m of b.mods.filter((x) => x.def === "wardbell" || x.def === "mendingloom")) expect(installedTurrets(b).some((v) => v.slot === m.turret)).toBe(true);
        for (const p of b.items.filter((x) => x.def === "mendpress")) expect(b.routes.filter((r) => r.factory === p.uid).every((r) => r.join === undefined)).toBe(true);
      }
    });
  }, 120_000); // AZ-BUMP (the flip): its par runs (three dusk decks and 4 heroes x 6 seeds to day 10; 38.4 s when the test
  // above left them uncached, 5 ms cached), longer with the NPC day; a host timeout under the 1.5-CPU quota, not the rule

  it("off: the par runs hold no sustain piece and the cache keeps the two worlds apart", () => {
    // FLIP-X2 (REQ-BFG-069): the switch is on by default, so off is withSustain(fn, false) and the default run is the on run
    // (was off the default and on withSustain)
    const off = withSustain(() => playerRun("bastion", 10, 1), false);
    const on = playerRun("bastion", 10, 1);
    expect(off.flatMap((d) => sustainPieces(d.build)).filter((p) => isSustain(p.def))).toEqual([]);
    expect(withSustain(() => playerRun("bastion", 10, 1), false)).toEqual(off); // the switch-off run, not the cached switch-on one
    expect(playerRun("bastion", 10, 1)).toEqual(on); // the switch-on run, not the cached switch-off one
    expect(withSustain(() => playerRun("bastion", 10, 1))).toEqual(on);
  });
});

describe("BOTS-X step 3: the captains (rivalBuilds.ts RivalPlan.sustain; SUSTAIN-1 4.8 rule 7)", () => {
  it("THANE KARSK adds a WARD BELL on day 5: his RAMPART at 2 stars holds it beside the SPALL CATCHER; every deck legal, his synergy parts kept", () => {
    expect(PLANS.karsk.sustain?.length).toBe(2);
    withSustain(() => {
      for (let d = 1; d <= RUN_DAYS; d++) {
        for (const b of [standInBuild("karsk", d), rivalBuild("karsk", d)]) {
          const bells = b.mods.filter((m) => m.def === "wardbell");
          expect(bells.length, `karsk d${d}`).toBe(d >= 5 ? 1 : 0);
          if (d >= 5) {
            expect(bells[0].turret).toBe(0);
            expect(starsOf(turretList(b).find((t) => t.slot === 0)!)).toBe(2);
            expect(b.mods.filter((m) => m.turret === 0 && ITEMS[m.def].kind === "mod").map((m) => m.def).sort()).toEqual(["spallcatcher", "wardbell"]);
          }
        }
        // AZ-BUMP (the flip, NPC_DAY): his dusk deck may also hold REFIT-AZ's road additions, which the strict validator's
        // budget (maxGoldByDay + the runes' dawn gold) doesn't hold (karsk d2: 22 g of 17): every other check as before, and the
        // deck as bought within the day's gold + its runes' dawn gold + the dusk deck's road allowance, as captains.luck's R1
        const s = standInBuild("karsk", d);
        expect(validateBuild(s, d).errors.filter((e) => !e.startsWith("budget:")), `karsk d${d}`).toEqual([]);
        expect(boughtCost(s), `karsk d${d}`).toBeLessThanOrEqual(maxGoldByDay(d) + runeGrants(s.runes, d).gold + roadAllowance(d, "dusk"));
      }
      for (const def of PLANS.karsk.synergy!.filter((x) => x !== "shieldwall")) expect(standInBuild("karsk", 9).items.some((p) => p.def === def) || standInBuild("karsk", 9).mods.some((m) => m.def === def), def).toBe(true);
    });
    // off: no WARD BELL on any day, and the plan's own upgrades never name it. FLIP-X2 (REQ-BFG-069): the switch is on by
    // default, so off is withSustain(fn, false) (was the default); the default holds the bell from day 5, as checked above
    withSustain(() => {
      for (let d = 1; d <= RUN_DAYS; d++) expect(rivalBuild("karsk", d).mods.some((m) => m.def === "wardbell"), `karsk d${d}`).toBe(false);
    }, false);
    for (let d = 1; d <= RUN_DAYS; d++) expect(rivalBuild("karsk", d).mods.some((m) => m.def === "wardbell"), `karsk d${d}`).toBe(d >= 5);
    expect(PLANS.karsk.upgrades.some((u) => u.mod?.[0] === "wardbell")).toBe(false);
  });

  it("MOTH QUEEN and LONGTOOTH keep their RIVETER (HEAL, 6 / 13 / 21); no new captain; every other captain's deck is the same with the switch on", () => {
    expect([ITEMS.riveter.gate!.heal, ITEMS.riveter.levels![2]!.gate!.heal, ITEMS.riveter.levels![3]!.gate!.heal]).toEqual([6, 13, 21]);
    expect(RIVAL_IDS.length).toBe(19);
    expect(Object.keys(PLANS).filter((id) => PLANS[id as keyof typeof PLANS].sustain)).toEqual(["karsk"]);
    for (const id of ["mothqueen", "longtooth"] as const) {
      const ups = PLANS[id].upgrades.filter((u) => u.gate?.[0] === "riveter");
      expect(ups.length, id).toBe(1);
      expect(rivalLoadout(id, 10, "good").build.items.some((p) => p.def === "riveter"), id).toBe(true);
    }
    for (const id of RIVAL_IDS.filter((x) => x !== "karsk")) for (const luck of LUCKS) for (let d = 1; d <= RUN_DAYS; d++) {
      expect(withSustain(() => rivalLoadout(id, d, luck)), `${id} ${luck} d${d}`).toEqual(rivalLoadout(id, d, luck));
    }
  });
});
