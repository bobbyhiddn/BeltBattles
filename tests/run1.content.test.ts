// RUN-1 T2 (REQ-BFG-059, REQ-BFG-116): CONTENT PAST DAY 10 (D5). A long run has no last day, so each day offers what every
// day offers, with the numbers still growing: the dawn rune, the shop's income and rarity odds, the road's second event bag
// (no last-day dud swap, no NO WARLORD LEFT), the captains (warlordOffers builds any day, the Iron Matriarch holds the Hard
// slot from day 8 until beaten, warlordHull and rampPlates unclamped), the hull and damage curves, the stand-in generator and
// the par and reference builds to day 16 (LONG_RUN_GEN_DAYS), and a written rule for a day past the deepest generated day.
// With the switch OFF the 10-day world is exactly as live: its clamps stay (the first block pins them). The switch is set
// through its setter and put back after each test. BUMP-1D: it ships ON (bb-0.11.0), so each test starts in the 10-day world on purpose
// (the beforeEach below puts the switch off, as it stood when the switch shipped off) and a long half turns it on itself (withLongRun).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BAG_IDS, blockReason, eventFor, eventSequence } from "../src/game/events";
import { WARLORD_EVENT_IDS, type Choice } from "../src/game/eventDefs";
import { forkFor } from "../src/game/road";
import { chooseFoe, ghostOf } from "../src/game/day";
import { newRun, pendingRune } from "../src/game/run";
import { LONG_RUN_DEEPEST_DAY, LONG_RUN_GEN_DAYS, longRunRules, setLongRun, withLongRun } from "../src/sim/longRun";
import { ITEMS, RUN_DAYS, incomeFor, rarityWeights, type HeroId } from "../src/sim/content";
import {
  MATRIARCH_DAY, RIVAL_IDS, deckCost, difficultyOf, honestReference, maxGoldByDay, rampPlates, rivalDays, standInBuild, standInGhost,
  standInGhosts, warlordOffer, warlordOffers,
} from "../src/sim/rivals";
import { warlordHull } from "../src/sim/ai";
import { DAY_MUL_STEP_TENTHS, DMG_MUL_STEP_TENTHS, dayMulTenths, dmgMulTenths, sustMulTenths, withHullScale } from "../src/sim/hullScale";
import { PLATE_STEP, PLAYABLE_HEROES, REF_DAYS, REF_DAYS_LONG, heroRefBuild } from "../src/sim/heroBuilds";
import { refDay, refHullDay } from "../src/sim/races/refBuilds";
import { PLAYER_DAYS, PLAYER_DAYS_LONG, playerBuild, playerRun } from "../src/sim/harness/player";
import { STAND_IN_GEN_DAYS, STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, standInDay, standInPool } from "../src/sim/standInPool";
import { runeOffer, runeGrants } from "../src/sim/runes";
import { CAPTAIN_RUNES, roadAllowance } from "../src/sim/rivalBuilds";
import { boughtCost } from "../src/sim/harness/standins";
import { unfusedPairs } from "../src/net/validate";
import { legalityProblems } from "./rivals.legality";

beforeEach(() => setLongRun(false)); // BUMP-1D: the 10-day world is each test's start (LONG_RUN ships on)
afterEach(() => setLongRun(true)); // the shipped value (BUMP-1D: on; was false)

const upTo = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const PLATE = ITEMS.plating.supply!.hull!;
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");

describe("RUN-1 D5: with the switch off the 10-day world is exactly as live (the clamps stay)", () => {
  it("the table depths: REF_DAYS 10, PLAYER_DAYS 10, STAND_IN_POOL_DAYS 10; one generators' depth, 16, behind all three", () => {
    expect([REF_DAYS, PLAYER_DAYS, STAND_IN_POOL_DAYS]).toEqual([10, 10, 10]);
    expect([REF_DAYS_LONG, PLAYER_DAYS_LONG, STAND_IN_GEN_DAYS, LONG_RUN_GEN_DAYS]).toEqual([16, 16, 16, 16]);
    expect(longRunRules()).toBe(false);
  });

  it("offers, stand-ins, rampPlates and the honest reference clamp at day 10; refDay too", () => {
    for (const seed of [1, 7, 99]) {
      expect(warlordOffer(seed, 99)).toEqual(warlordOffer(seed, 10));
      expect(standInGhost(seed, 99)).toBe(standInGhost(seed, 10));
      expect(warlordOffers(seed)).toHaveLength(RUN_DAYS);
      expect(standInGhosts(seed)).toHaveLength(RUN_DAYS);
    }
    expect([rampPlates(10), rampPlates(11), rampPlates(99)]).toEqual([3, 3, 3]);
    expect(honestReference("furnace", 99)).toEqual(honestReference("furnace", 10));
    expect([refDay(99), refHullDay(99)]).toEqual([10, 10]);
    expect(rivalDays("matriarch")).toEqual([8, 9, 10]);
    for (const h of PLAYABLE_HEROES) {
      expect(heroRefBuild(h, 12)).toEqual(heroRefBuild(h, 10));
      expect(heroRefBuild(h, 99)).toEqual(heroRefBuild(h, 10));
    }
    expect(playerBuild("furnace", 14, 1)).toEqual(playerBuild("furnace", 10, 1)); // playerBuild reads 1-10 off
  });

  it("the event bag keeps its last-day dud swap for the 10-day run, and NO WARLORD LEFT stays on day 10", () => {
    const hot: Choice = { label: "STAKE", cost: [], gain: [{ k: "bounty", n: 10 }] };
    const run = newRun("furnace", 3, "run1-content-off");
    run.day = RUN_DAYS;
    expect(blockReason(run, hot)).toBe("NO WARLORD LEFT");
    for (let seed = 1; seed <= 60; seed++) expect(WARLORD_EVENT_IDS).not.toContain(eventFor(seed, RUN_DAYS));
  });
});

describe("RUN-1 D5: the road past day 10 (events, captains, the Matriarch)", () => {
  it("the second bag: every bag holds every event once and the same event never comes two days running; no dud swap", () => {
    let dudOnTen = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const seq = eventSequence(seed, 40, true);
      expect(seq).toHaveLength(40);
      for (let b = 0; b < 4; b++) expect([...seq.slice(b * BAG_IDS.length, (b + 1) * BAG_IDS.length)].sort(), `seed ${seed} bag ${b}`).toEqual([...BAG_IDS].sort());
      seq.forEach((id, i) => { if (i) expect(id, `seed ${seed} day ${i + 1}`).not.toBe(seq[i - 1]); });
      expect(eventSequence(seed, 12, true), `seed ${seed}: prefix-stable`).toEqual(seq.slice(0, 12));
      for (let d = 1; d <= 40; d++) expect(eventFor(seed, d, true)).toBe(seq[d - 1]);
      if (WARLORD_EVENT_IDS.includes(seq[RUN_DAYS - 1])) dudOnTen++;
    }
    // the 10-day run swaps a HERALD or SAPPERS off day 10; the long run keeps them where the bag drew them (a warlord comes every day)
    expect(dudOnTen).toBeGreaterThan(0);
    for (let seed = 1; seed <= 80; seed++) expect(WARLORD_EVENT_IDS).not.toContain(eventSequence(seed, RUN_DAYS)[RUN_DAYS - 1]);
  });

  it("NO WARLORD LEFT never blocks a long run; its HERALD and SAPPERS are open on any day", () => {
    const bounty: Choice = { label: "STAKE", cost: [], gain: [{ k: "bounty", n: 10 }] };
    const sabotage: Choice = { label: "HIRE", cost: [], gain: [{ k: "sabotage" }] };
    const run = withLongRun(() => newRun("furnace", 3, "run1-content-on"));
    for (const day of [9, 10, 11, 14, 25]) {
      run.day = day;
      expect(blockReason(run, bounty), `day ${day}`).toBeUndefined();
      expect(blockReason(run, sabotage), `day ${day}`).toBeUndefined();
    }
  });

  it("warlordOffers builds any day, prefix-stable: days 1-10 are the 10-day schedule, every slot a captain of that slot", () => {
    withLongRun(() => {
      for (const seed of [1, 7, 42, 1234]) {
        const ten = withLongRun(() => warlordOffers(seed), false);
        const all = warlordOffers(seed, 25);
        expect(all).toHaveLength(25);
        expect(all.slice(0, RUN_DAYS)).toEqual(ten);
        all.forEach((o, i) => {
          expect(difficultyOf(o.easy), `seed ${seed} day ${i + 1}`).toBe("easy");
          expect(difficultyOf(o.medium)).toBe("medium");
          if (i + 1 >= MATRIARCH_DAY) expect(o.hard).toBe("matriarch"); // unbeaten: she holds the Hard slot, however long the run
          else expect(difficultyOf(o.hard)).toBe("hard");
          if (i) {
            expect(o.easy).not.toBe(all[i - 1].easy);
            expect(o.medium).not.toBe(all[i - 1].medium);
          }
        });
        for (const d of upTo(1, 25)) expect(warlordOffer(seed, d), `seed ${seed} day ${d}`).toEqual(all[d - 1]);
      }
      expect(rivalDays("matriarch", 25)).toEqual(upTo(8, 25));
      expect(rivalDays("sootjaw", 25)).toEqual(upTo(1, 25));
    });
  });

  it("beaten on day 9 (or 8, or 12): the Hard slot after it is a regular Hard captain, never that day's stand-in, never yesterday's Hard", () => {
    withLongRun(() => {
      for (const seed of [1, 7, 42, 99, 1234]) {
        for (const beaten of [8, 9, 12]) {
          let yesterday = warlordOffer(seed, beaten, beaten).hard;
          expect(yesterday, `seed ${seed} beaten ${beaten}`).toBe("matriarch"); // the day she is beaten she still stood there
          for (let d = beaten + 1; d <= 22; d++) {
            const o = warlordOffer(seed, d, beaten);
            expect(difficultyOf(o.hard), `seed ${seed} beaten ${beaten} day ${d}`).toBe("hard");
            expect(o.hard).not.toBe(standInGhost(seed, d));
            expect(o.hard).not.toBe(yesterday);
            expect({ easy: o.easy, medium: o.medium }).toEqual({ easy: warlordOffers(seed, 25)[d - 1].easy, medium: warlordOffers(seed, 25)[d - 1].medium });
            yesterday = o.hard;
          }
        }
      }
    });
  });

  it("stand-in ghosts past day 10: days 1-10 as before; none the Matriarch; none stands in on a day it is offered", () => {
    withLongRun(() => {
      for (let seed = 0; seed < 600; seed++) {
        const ten = withLongRun(() => standInGhosts(seed), false);
        const all = standInGhosts(seed, 25);
        const offers = warlordOffers(seed, 25);
        expect(all).toHaveLength(25);
        expect(all.slice(0, RUN_DAYS), `seed ${seed}`).toEqual(ten);
        expect(all).not.toContain("matriarch");
        all.forEach((id, i) => expect(Object.values(offers[i]), `seed ${seed} day ${i + 1}`).not.toContain(id));
        expect(new Set(all.slice(0, 16)).size, `seed ${seed}: the first 16 days use 16 different captains`).toBe(16);
        all.forEach((id, i) => { if (i) expect(id, `seed ${seed} day ${i + 1}: never the same captain two days running`).not.toBe(all[i - 1]); });
        for (const d of [11, 16, 17, 19, 25]) expect(standInGhost(seed, d)).toBe(all[d - 1]);
      }
    });
  });

  it("the fork of a long run on day 12: that day's offers (unclamped), and the long event sequence", () => {
    const run = withLongRun(() => newRun("furnace", 7, "run1-content-fork"));
    run.day = 12;
    withLongRun(() => {
      const f = forkFor(run);
      expect(f.day).toBe(12);
      expect(f.warlords).toEqual(warlordOffer(7, 12));
      expect(f.warlords.hard).toBe("matriarch");
      expect(f.event).toBe(eventFor(7, 12, true));
      expect(f.warlords).not.toEqual(warlordOffer(7, 10)); // day 10's offer, which the 10-day clamp would repeat
    });
  });
});

describe("RUN-1 D5: numbers that keep growing past day 10 (hull, damage, gold, odds)", () => {
  it("warlordHull and rampPlates are unclamped on a long run: +110 a day; plates 3 (day 10), 4 (12), 6 (16), still growing", () => {
    for (const d of upTo(1, 30)) expect(warlordHull(d)).toBe((d - 1) * 110 - 270);
    withLongRun(() => {
      expect([10, 12, 16].map(rampPlates)).toEqual([3, 4, 6]);
      let was = -1;
      for (const d of upTo(1, 30)) {
        const p = rampPlates(d);
        expect(p).toBe(Math.max(0, Math.round(warlordHull(d) / PLATE)));
        expect(p).toBeGreaterThanOrEqual(was);
        was = p;
      }
      expect(rampPlates(30)).toBeGreaterThan(rampPlates(16));
      for (const h of ["furnace", "weaver"] as HeroId[]) expect(honestReference(h, 14).hullBonus).toBe(PLATE * rampPlates(14));
    });
  });

  it("the hull, damage and sustain curves are defined and rising on every day (M to day 18 then +1.2 a day; D follows M)", () => {
    for (const f of [dayMulTenths, dmgMulTenths, sustMulTenths]) {
      let was = 0;
      for (const d of upTo(1, 40)) {
        const v = f(d);
        expect(Number.isInteger(v), `${f.name} day ${d}`).toBe(true);
        expect(v, `${f.name} day ${d}`).toBeGreaterThanOrEqual(was);
        was = v;
      }
    }
    expect(dayMulTenths(10)).toBe(60);
    expect(dayMulTenths(18)).toBe(140);
    for (const d of upTo(19, 30)) expect(dayMulTenths(d) - dayMulTenths(d - 1)).toBe(DAY_MUL_STEP_TENTHS);
    for (const d of upTo(19, 30)) expect(dmgMulTenths(d) - dmgMulTenths(d - 1)).toBe(DMG_MUL_STEP_TENTHS);
    for (const d of upTo(1, 40)) expect(dmgMulTenths(d), `D <= M on day ${d}`).toBeLessThanOrEqual(dayMulTenths(d));
    expect(sustMulTenths(25)).toBe(dayMulTenths(25));
  });

  it("income keeps its flat step past day 10 (HULL_SCALE on: day 10's; off: flat from day 6); maxGoldByDay grows by it", () => {
    for (const on of [true, false]) {
      withHullScale(() => {
        for (const d of upTo(10, 30)) {
          expect(incomeFor(d, true), `day ${d} on=${on}`).toBe(incomeFor(10, true));
          expect(incomeFor(d, false)).toBe(incomeFor(10, false));
        }
        for (const d of upTo(1, 30)) expect(maxGoldByDay(d + 1) - maxGoldByDay(d)).toBe(incomeFor(d, true));
        expect(maxGoldByDay(16)).toBeGreaterThan(maxGoldByDay(10));
      }, on);
    }
    expect(withHullScale(() => incomeFor(12, true), true)).toBe(6 + 10 + 2);
    expect(withHullScale(() => incomeFor(12, true), false)).toBe(6 + 6 + 2);
  });

  it("the rarity odds keep rising past the table by their own step: rare and epic +2 a round, legendary +1.5; common holds 30", () => {
    expect([10, 12, 16].map((r) => rarityWeights(r).legendary)).toEqual([11, 14, 20]); // R1e 1.2
    for (const r of upTo(9, 30)) {
      const w = rarityWeights(r), n = rarityWeights(r + 1);
      expect(w.common).toBe(30);
      expect(n.rare - w.rare).toBe(2);
      expect(n.epic - w.epic).toBe(2);
      expect(n.legendary - w.legendary).toBe(1.5);
      for (const v of Object.values(w)) expect(Number.isFinite(v) && v >= 0).toBe(true);
    }
  });

  it("the dawn rune: every dawn offers a rune to day 25, the offer size and tier odds hold their last row, one is taken a day", () => {
    for (const hero of PLAYABLE_HEROES) {
      const held: string[] = [];
      for (const d of upTo(1, 25)) {
        const o = runeOffer(77, d, hero, held);
        expect(o.ids.length, `${hero} day ${d}`).toBe(d <= 4 ? 3 : 2);
        expect(new Set(o.ids).size).toBe(o.ids.length);
        for (const id of o.ids) expect(held).not.toContain(id);
        expect(runeOffer(77, d, hero, held)).toEqual(o); // deterministic
        held.push(o.ids[0]);
      }
      expect(held).toHaveLength(25);
    }
    // a long run's pending pick on a later dawn: the game's own picker, on the run's seed and day
    const run = withLongRun(() => newRun("furnace", 5, "run1-content-rune"));
    run.day = 13;
    run.runeDay = 13;
    const offer = pendingRune(run);
    expect(offer?.day).toBe(13);
    expect(offer?.ids.length).toBe(2);
  });
});

describe("RUN-1 D5: captains' decks and reference builds past day 10 (a long run)", () => {
  it("a stand-in captain's dusk deck on days 11-16 is honest: legal, whole plating, the ramp continues, affordable", () => {
    withLongRun(() => {
      for (const id of STAND_INS) {
        let hull = -1;
        for (const day of upTo(11, 16)) {
          const b = standInBuild(id, day), why = `${id} day ${day}`;
          expect(legalityProblems(b), why).toEqual([]);
          expect(b.runes, why).toEqual((CAPTAIN_RUNES[id] ?? []).slice(0, day).map((q) => ({ id: q })));
          const g = runeGrants(b.runes, day);
          expect((b.hullBonus - g.hull) % PLATE, why).toBe(0);
          expect(b.hullBonus - g.hull, why).toBeGreaterThanOrEqual(PLATE * rampPlates(day));
          expect(boughtCost(b), why).toBeLessThanOrEqual(maxGoldByDay(day) + g.gold + roadAllowance(day, "dusk"));
          expect(b.hullBonus, why).toBeGreaterThanOrEqual(hull);
          hull = b.hullBonus;
        }
      }
    });
  });

  it("heroRefBuild goes to day 16 and holds after it: legal, priced within maxGoldByDay, the ramp's plates; day 20 = day 16's deck, day 20's hull", () => {
    withLongRun(() => {
      for (const h of PLAYABLE_HEROES) {
        let was = 0;
        for (const day of upTo(1, 16)) {
          const b = heroRefBuild(h, day), why = `${h} day ${day}`;
          expect(unfusedPairs(b), why).toEqual([]);
          expect(legalityProblems(b), why).toEqual([]);
          expect(b.hullBonus, why).toBe(PLATE_STEP * rampPlates(day));
          expect(deckCost(b).total, why).toBeLessThanOrEqual(maxGoldByDay(day));
          expect(b.hullBonus).toBeGreaterThanOrEqual(was);
          was = b.hullBonus;
        }
        const d16 = heroRefBuild(h, 16), d20 = heroRefBuild(h, 20);
        expect({ ...d20, hullBonus: 0 }, h).toEqual({ ...d16, hullBonus: 0 });
        expect(d20.hullBonus, h).toBe(PLATE_STEP * rampPlates(20));
        expect(d20.hullBonus).toBeGreaterThan(d16.hullBonus);
        expect(deckCost(d20).total).toBeLessThanOrEqual(maxGoldByDay(20));
        // days 1-10 are the 10-day reference builds
        for (const day of upTo(1, 10)) expect(heroRefBuild(h, day), `${h} day ${day}`).toEqual(withLongRun(() => heroRefBuild(h, day), false));
      }
    });
  });

  it("the par player's run goes to day 16 on a long run: days 1-10 are the 10-day run, the deck keeps growing, no day over its budget", () => {
    const ten = playerRun("furnace", 10, 3);
    const seq = withLongRun(() => playerRun("furnace", 16, 3));
    expect(seq).toHaveLength(16);
    seq.slice(0, 10).forEach((d, i) => { expect(d.build, `day ${i + 1}`).toEqual(ten[i].build); expect(d.value).toBe(ten[i].value); });
    seq.forEach((d) => expect(d.value, `day ${d.day}`).toBeLessThanOrEqual(d.budget));
    expect(seq[15].value).toBeGreaterThan(seq[9].value);
    expect(withLongRun(() => playerBuild("furnace", 14, 3))).toEqual(seq[13].build);
    expect(withLongRun(() => playerBuild("furnace", 40, 3))).toEqual(seq[15].build); // a later day: day 16's deck
    expect(playerRun("furnace", 12, 3)).toHaveLength(12); // asking past 10 plays on with the switch off too
  }, 120_000);
});

describe("RUN-1 D5: the written rule for a day past the deepest generated day", () => {
  it("standInDay clamps to the deepest day the pool holds: that day's decks; the day's own hull is M(day), taken in battle", () => {
    expect(standInDay(99)).toBe(STAND_IN_POOL_DAYS);
    expect(standInDay(0)).toBe(1);
    for (const hero of STAND_IN_POOL_HEROES) {
      const deep = standInPool(hero, STAND_IN_POOL_DAYS), later = standInPool(hero, 99);
      expect(later.map((e) => e.build)).toEqual(deep.map((e) => e.build));
      expect(later.every((e) => e.day === STAND_IN_POOL_DAYS)).toBe(true);
    }
    // the hull of a day past the table keeps growing by M's own step; the gold and the odds are the day's own
    expect(dayMulTenths(LONG_RUN_GEN_DAYS + 4)).toBeGreaterThan(dayMulTenths(LONG_RUN_GEN_DAYS));
    expect(maxGoldByDay(LONG_RUN_GEN_DAYS + 4)).toBeGreaterThan(maxGoldByDay(LONG_RUN_GEN_DAYS));
    expect(rarityWeights(LONG_RUN_GEN_DAYS + 4).legendary).toBeGreaterThan(rarityWeights(LONG_RUN_GEN_DAYS).legendary);
  });

  it("16 is the deepest day a run reaches without a draw (17 with an early PATCH UP): the generators stop one short of it", () => {
    expect(LONG_RUN_GEN_DAYS).toBe(16);
    expect(LONG_RUN_DEEPEST_DAY).toBe(LONG_RUN_GEN_DAYS + 1);
  });
});

describe("RUN-1 T3b: the client side of D4 and D6 (day.ts)", () => {
  it("a long run's snapshot states its losses (the record check tells a loss from a draw); a 10-day run's snapshot is as before", () => {
    const long = withLongRun(() => newRun("furnace", 21, "run1-ghostof-long"));
    const ten = newRun("furnace", 21, "run1-ghostof-ten");
    for (const r of [long, ten]) { r.day = 12; r.wins = 5; r.losses = 4; }
    const g = ghostOf(long, 1_000, "p-long", null), h = ghostOf(ten, 1_000, "p-ten", null);
    expect(g.losses).toBe(4);
    expect("losses" in h).toBe(false);
    expect(Object.keys(g).filter((k) => k !== "losses")).toEqual(Object.keys(h)); // the same fields otherwise, in the same order
  });

  it("the client's pool pick widens a thin day on a long run (the nearest earlier day), never on a 10-day run, and never to a later day", () => {
    const other = withLongRun(() => newRun("furnace", 22, "run1-pool-other"));
    other.day = 10;
    const pool = [ghostOf(other, 1_000, "p-other", null)];
    const long = withLongRun(() => newRun("furnace", 21, "run1-pick-long"));
    long.day = 12;
    const ten = newRun("furnace", 21, "run1-pick-ten");
    ten.day = 12;
    expect(chooseFoe(long, pool).kind).toBe("ghost");
    expect(chooseFoe(long, pool).build).toEqual(pool[0].build);
    expect(withLongRun(() => chooseFoe(long, pool)).day).toBe(12); // the foe is tonight's, whatever day its ghost was made on
    expect(chooseFoe(ten, pool).kind).toBe("standin");
    long.day = 8; // a ghost of day 10 is a LATER day for a day-8 dusk: never widened to
    expect(chooseFoe(long, pool).kind).toBe("standin");
  });
});
