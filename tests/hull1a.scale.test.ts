// HULL-1a (REQ-BFG-079): the day's hull, behind HULL_SCALE (off). M(d) in whole tenths and its rounding; the day on Battle
// (both sides at M(d) x (base + hullBonus)); BULKHEADS and SCRAP HALO under M; the dark wind as a share of each hull's own
// max (backlog #368's equal-wind test's switch-on twin: equal SHARES, so the amounts differ when the max hulls differ);
// replay records (a record without a day plays at M = 1); and the switch-off proofs (no day, or the switch off: 0.9.7's
// battle, record and wind). The switch is turned on only through withHullScale.
import { describe, expect, it } from "vitest";
import { Battle, simulate, type SimEvent } from "../src/sim/battle";
import { HEROES, WIND_START, type HeroId } from "../src/sim/content";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";
import { mergedPieces, RUNES } from "../src/sim/runes";
import { refHull } from "../src/sim/races/refBuilds";
import { battleRecordFor, checkRecord, replay, replayBattle } from "../src/net/replay";
import {
  DAY_MUL_TENTHS, HULL_SCALE, WIND_SHARE_EVERY, WIND_SHARE_START_BP, WIND_SHARE_STEP_BP, dayMul, dayMulTenths, hullAt,
  hullScaleRules, scaleTenths, windShareBp, windShareDamage, withHullScale,
} from "../src/sim/hullScale";

/** A hero's starting deck with its belts cut: nothing fires, so only the wind moves a hull (tests/wind.both.test.ts). */
const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });
/** A battle's whole outcome, for the switch-off proofs. */
const sig = (b: Battle) => ({
  winner: b.winner, ticks: b.ticks, t: b.t, hp: b.sides.map((s) => s.hull.hp), max: b.sides.map((s) => s.hull.max),
  stats: b.sides.map((s) => ({ ...s.stats })), record: JSON.stringify(b.record),
});

describe("HULL-1a: the switch", () => {
  // AZ-BUMP (the flip, HULL_SCALE): false -> true, the hull release ships the day's hull (was "HULL_SCALE is off in
  // bb-0.9.7"). The put-back is checked from both sides: off for one call from the shipped on, and (the bb-0.9.7 form) on
  // for one call from off, set through the setter
  it("HULL_SCALE ships on (AZ-BUMP's flip); withHullScale sets it for one call and puts it back, even on a throw", () => {
    expect(HULL_SCALE).toBe(true);
    expect(hullScaleRules()).toBe(true);
    expect(withHullScale(() => hullScaleRules(), false)).toBe(false);
    expect(() => withHullScale(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(hullScaleRules()).toBe(true);
    expect(withHullScale(() => withHullScale(() => hullScaleRules(), false))).toBe(false);
    withHullScale(() => {
      expect(withHullScale(() => hullScaleRules())).toBe(true);
      expect(() => withHullScale(() => { throw new Error("x"); })).toThrow("x");
      expect(hullScaleRules()).toBe(false);
    }, false);
  });
});

describe("HULL-1a: M(d), in whole tenths", () => {
  it("the table: days 1-10, days 11-18, and +1.2 a day from day 19", () => {
    expect(Array.from({ length: 10 }, (_, i) => dayMulTenths(i + 1))).toEqual([10, 14, 18, 22, 28, 34, 40, 46, 52, 60]);
    expect(Array.from({ length: 8 }, (_, i) => dayMulTenths(i + 11))).toEqual([68, 76, 84, 92, 104, 116, 128, 140]);
    expect([19, 20, 30].map(dayMulTenths)).toEqual([152, 164, 284]);
    expect(DAY_MUL_TENTHS.every((t) => Number.isInteger(t))).toBe(true);
    expect([dayMul(1), dayMul(2), dayMul(10), dayMul(18)]).toEqual([1, 1.4, 6, 14]);
  });

  it("day 0, a day below 1, no day, NaN: M = 1; a day that isn't whole counts as its whole part", () => {
    for (const d of [0, -3, 0.5, undefined, Number.NaN, Number.POSITIVE_INFINITY]) expect(dayMulTenths(d)).toBe(10);
    expect(dayMulTenths(2.7)).toBe(14);
  });

  it("the day's hull rounds M x n to the nearest whole 10, halves up, for every hero at a few hullBonus values", () => {
    withHullScale(() => {
      for (const hero of PLAYABLE_HEROES) {
        for (const bonus of [0, 250, 500, 750, 1250, -270, 125, 15]) {
          for (let d = 1; d <= 20; d++) {
            const n = HEROES[hero].hull + bonus, exact = (dayMulTenths(d) * n) / 10, got = hullAt(n, d);
            expect(got % 10).toBe(0);
            expect(Math.abs(got - exact)).toBeLessThanOrEqual(5);
            if (Number.isInteger(exact) && exact % 10 === 5) expect(got).toBe(exact + 5); // halves up
          }
        }
      }
      expect(hullAt(2250, 10)).toBe(13500); // FOUNDRY, the biggest hero, on day 10
      expect(hullAt(1715, 2)).toBe(2400); // 2401 -> 2400
      expect(hullAt(1725, 2)).toBe(2420); // 2415 -> 2420 (half up)
      expect(hullAt(2100 + 750, 10)).toBe(17100); // FURNACE with the par player's day-10 plating
    });
    expect(scaleTenths(1725, 14)).toBe(2420);
  });

  it("the switch off, or no day: n itself, untouched (no rounding)", () => {
    expect(withHullScale(() => hullAt(1715, 10), false)).toBe(1715); // AZ-BUMP (the flip, HULL_SCALE): off through the setter (it ships on)
    expect(withHullScale(() => hullAt(1715, undefined))).toBe(1715);
  });
});

describe("HULL-1a: the day on Battle", () => {
  const a: Build = { ...heroStartBuild("furnace", 1), hullBonus: 750 };
  const b: Build = { ...heroStartBuild("weaver", 101), hullBonus: 250 };

  it("switch on, day 10: both sides start at M(10) x (base + hullBonus), rounded to a whole 10; the record keeps the day", () => {
    const bt = withHullScale(() => new Battle(a, b, 7, undefined, 10));
    expect(bt.scaled).toBe(true);
    expect(bt.mulTenths).toBe(60);
    // HULL-ON (bb-0.10.0, FREE_JOINS; FREE_JOINS_HULL, cap's ruling 84ad10254e1855c8 = RULING-HULLON-R9, R10 (a)): WEAVER's
    // base is 1500 with free joins on (was (1700 + 250) * 6)
    expect(bt.sides.map((s) => s.hull.max)).toEqual([(2100 + 750) * 6, (1500 + 250) * 6]);
    expect(bt.sides.map((s) => s.hull.hp)).toEqual(bt.sides.map((s) => s.hull.max));
    expect(bt.record.day).toBe(10);
    // every bb-0.9.7 hero, days 1-10, with no hullBonus and with the par player's plating (refBuilds.ts refHull)
    for (const hero of PLAYABLE_HEROES) {
      for (let d = 1; d <= 10; d++) {
        for (const bonus of [0, refHull(d)]) {
          const x: Build = { ...heroStartBuild(hero, 1), hullBonus: bonus };
          const t = withHullScale(() => new Battle(x, x, 1, undefined, d));
          expect(t.sides[0].hull.max).toBe(scaleTenths(HEROES[hero].hull + bonus, dayMulTenths(d)));
          expect(t.sides[1].hull.max).toBe(t.sides[0].hull.max);
        }
      }
    }
  });

  it("the switch off, or no day: a battle and its record play exactly as before (M = 1, no day in the record)", () => withHullScale(() => {
    // AZ-BUMP (the flip, HULL_SCALE): the switch ships on, so the test sets it off for itself (plain is the switch-off
    // battle again, so the switch-on, no-day line still compares against the off world)
    for (const [x, y, seed] of [[a, b, 7], [b, a, 99], [heroStartBuild("foundry", 1), heroStartBuild("bastion", 101), 3]] as [Build, Build, number][]) {
      const plain = simulate(x, y, seed);
      const offDay = simulate(x, y, seed, undefined, undefined, 10); // the switch off, a day given
      const onNoDay = withHullScale(() => simulate(x, y, seed)); // the switch on, no day
      expect(plain.scaled).toBe(false);
      expect(sig(offDay)).toEqual(sig(plain));
      expect(sig(onNoDay)).toEqual(sig(plain));
      expect("day" in plain.record).toBe(false);
      expect(plain.sides.map((s) => s.hull.max)).toEqual([HEROES[x.hero].hull + x.hullBonus, HEROES[y.hero].hull + y.hullBonus]);
    }
  }, false));

  it("a replay: an old record (no day) plays as before with the switch on; a record on the day's hull keeps its day and replays exactly", () => withHullScale(() => {
    // AZ-BUMP (the flip, HULL_SCALE): the switch ships on, so the test sets it off for itself (its off record and replays)
    const rec = battleRecordFor(a, b, 7, undefined, 10); // the switch off: no day kept
    expect("day" in rec).toBe(false);
    const before = replay(rec);
    expect(withHullScale(() => replay(rec))).toEqual(before);
    const r10 = withHullScale(() => battleRecordFor(a, b, 7, undefined, 10));
    expect(r10.day).toBe(10);
    const live = withHullScale(() => simulate(a, b, 7, undefined, undefined, 10));
    expect(withHullScale(() => replay(r10))).toEqual({ winner: live.winner, ticks: live.ticks, hulls: [live.sides[0].hull.hp, live.sides[1].hull.hp] });
    expect(withHullScale(() => replayBattle(r10)).sides[0].hull.max).toBe(live.sides[0].hull.max);
    expect(live.record.day).toBe(10);
    // the switch off: the record's day is passed over (M = 1), as any unknown key was; on, a bad day is refused
    expect(replay(r10)).toEqual(before);
    expect(() => checkRecord({ ...r10, day: "x" } as never)).not.toThrow();
    expect(() => withHullScale(() => checkRecord({ ...r10, day: 0 }))).toThrow(/day/);
    expect(() => withHullScale(() => checkRecord({ ...r10, day: 2.5 }))).toThrow(/day/);
  }, false));
});

describe("HULL-1a: BULKHEADS and SCRAP HALO under M", () => {
  const base = heroStartBuild("furnace", 1);
  const maxOf = (x: Build, day?: number) => new Battle(x, base, 1, undefined, day).sides[0].hull.max;

  it("BULKHEADS: each turret's HULL x M(d), rounded to a whole 10; the switch off: 0.9.7's flat amount", () => {
    const n = RUNES.bulkheads.amount.n;
    const withRune: Build = { ...base, runes: [{ id: "bulkheads" }] };
    const turrets = new Battle(base, base, 1).sides[0].turrets.length;
    expect(turrets).toBeGreaterThan(0);
    expect(withHullScale(() => maxOf(withRune, 5) - maxOf(base, 5), false)).toBe(n * turrets); // off (AZ-BUMP, the flip: HULL_SCALE off through the setter)
    for (const d of [1, 2, 5, 10]) {
      const gain = withHullScale(() => maxOf(withRune, d) - maxOf(base, d));
      expect(gain).toBe(scaleTenths(n, dayMulTenths(d)) * turrets);
    }
    expect(withHullScale(() => maxOf(withRune, 10) - maxOf(base, 10))).toBe(n * 6 * turrets);
  });

  it("SCRAP HALO: each merged piece's HULL x M(d), rounded to a whole 10 (60 x 1.4 = 84 -> 80 on day 2)", () => {
    const n = RUNES.scrap_halo.amount.n;
    const merged: Build = { ...base, items: base.items.map((p, i) => (i < 2 ? { ...p, stars: 2 } : p)), runes: [{ id: "scrap_halo" }] };
    const plain: Build = { ...merged, runes: [] };
    const pieces = mergedPieces(merged);
    expect(pieces).toBeGreaterThanOrEqual(1);
    expect(withHullScale(() => maxOf(merged, 2) - maxOf(plain, 2), false)).toBe(n * pieces); // off (AZ-BUMP, the flip: HULL_SCALE off through the setter)
    expect(withHullScale(() => maxOf(merged, 2) - maxOf(plain, 2))).toBe(80 * pieces);
    expect(withHullScale(() => maxOf(merged, 10) - maxOf(plain, 10))).toBe(n * 6 * pieces);
    expect(withHullScale(() => maxOf(merged) - maxOf(plain))).toBe(n * pieces); // no day: M = 1
  });
});

describe("HULL-1a: the dark wind as a share of each hull's own max", () => {
  // HULL-1c (REQ-BFG-079; BRIEF-HULL1C 2 (c)), re-pinned in place: HULL-1c tuned the wind's three constants to 0.1% a
  // second from 25 s, +0.6% every 5 s (were 50 / 50 / 5 bp: 0.5%, +0.5%); the title keeps HULL-1a's name
  it("windShareBp: 0 before WIND_START; 0.5% a second from 25 s, +0.5% every 5 s (named constants)", () => {
    expect([WIND_SHARE_START_BP, WIND_SHARE_STEP_BP, WIND_SHARE_EVERY]).toEqual([10, 60, 5]);
    expect(windShareBp(-0.01)).toBe(0);
    expect([0, 4.99, 5, 9.99, 10, 45].map(windShareBp)).toEqual([10, 10, 70, 70, 130, 550]);
    // a whole second at 0.5% of 12,600 is 63; halves up in integer arithmetic (0.5% of 12,700 = 63.5 -> 64)
    expect(windShareDamage(50 * 60, 12600, 60)).toBe(63);
    expect(windShareDamage(50 * 60, 12700, 60)).toBe(64);
  });

  it("switch on, day 10: nothing before 25 s; then once a second each hull loses the same share of its own max, the step every 5 s, straight to hp (PLATE and SHIELD don't absorb it)", () => {
    const bt = withHullScale(() => new Battle(silent("furnace", 1), silent("weaver", 101), 7, undefined, 10));
    const [p, e] = bt.sides;
    // HULL-ON (bb-0.10.0, FREE_JOINS; FREE_JOINS_HULL, cap's ruling 84ad10254e1855c8 = RULING-HULLON-R9, R10 (a)): WEAVER's
    // day-10 hull is 6 x 1500 = 9000 with free joins on (was 6 x 1700 = 10200, and [13, 10] / 255 below)
    expect([p.hull.max, e.hull.max]).toEqual([12600, 9000]);
    bt.addPlate(p, 100);
    bt.addPlate(e, 100);
    bt.gainShield(p, 1);
    bt.gainShield(e, 1);
    const plate = [p.plate.plate, e.plate.plate], shield = [p.shield, e.shield];
    bt.events.length = 0;
    const beats: { t: number; dmgs: [number, number] }[] = [];
    while (!bt.over && bt.t < WIND_START + 20.5) {
      const hp = [p.hull.hp, e.hull.hp];
      bt.step();
      for (const ev of bt.events as SimEvent[]) {
        if (ev.type !== "wind") continue;
        expect(bt.t).toBeGreaterThanOrEqual(WIND_START); // nothing before 25 s
        expect(ev.dmgs).toBeDefined();
        expect([hp[0] - p.hull.hp, hp[1] - e.hull.hp]).toEqual(ev.dmgs); // each hull its own amount, straight to hp
        expect(ev.dmg).toBe(ev.dmgs![0]);
        beats.push({ t: bt.t, dmgs: ev.dmgs! });
      }
      if (bt.t < WIND_START) expect([p.hull.hp, e.hull.hp]).toEqual([12600, 9000]);
      bt.events.length = 0;
    }
    expect(beats.length).toBe(20);
    // the share: 0.1% for the first five beats, 0.7% for the next five, then 1.3%, then 1.9% (the step every 5 s)
    // HULL-1c re-pinned in place (the tuned constants, BRIEF-HULL1C 2 (c)); was 0.5 / 1 / 1.5 / 2% and [63, 51]
    beats.forEach((x, k) => {
      const bp = WIND_SHARE_START_BP + WIND_SHARE_STEP_BP * Math.floor(k / 5);
      expect(x.dmgs).toEqual([Math.round((bp * 12600) / 10000), Math.round((bp * 9000) / 10000)]);
    });
    expect(beats.slice(0, 2).map((x) => x.dmgs)).toEqual([[13, 9], [13, 9]]);
    // the amounts differ (the max hulls differ); each side's windTaken is the sum of its own, and its whole hp loss
    expect(p.stats.windTaken).toBe(beats.reduce((s, x) => s + x.dmgs[0], 0));
    expect(e.stats.windTaken).toBe(beats.reduce((s, x) => s + x.dmgs[1], 0));
    expect(p.stats.windTaken).not.toBe(e.stats.windTaken);
    // equal shares: windTaken / max is the same on both hulls (20% after 20 s: 5 x (0.1 + 0.7 + 1.3 + 1.9)%; HULL-1c, was
    // 25%: 5 x (0.5 + 1 + 1.5 + 2)%)
    expect(p.stats.windTaken / p.hull.max).toBeCloseTo(0.2, 9);
    expect(e.stats.windTaken / e.hull.max).toBeCloseTo(0.2, 9);
    expect(p.hull.max - p.hull.hp).toBe(p.stats.windTaken);
    expect(e.hull.max - e.hull.hp).toBe(e.stats.windTaken);
    expect([p.plate.plate, e.plate.plate]).toEqual(plate);
    expect([p.shield, e.shield]).toEqual(shield);
    // the HUD's WIND n/S: side 0's share a second of its own max
    expect(bt.windDps()).toBe(Math.round((250 * 12600) / 10000));
    expect(bt.windDps(1)).toBe(Math.round((250 * 9000) / 10000));
  });

  it("the switch off, or no day: 0.9.7's flat wind, the same amount on both hulls (#368's test holds)", () => {
    // AZ-BUMP (the flip, HULL_SCALE): the day-10 battle is the switch-off one, set off through the setter (it ships on)
    for (const make of [() => withHullScale(() => new Battle(silent("furnace", 1), silent("weaver", 101), 7, undefined, 10), false), () => withHullScale(() => new Battle(silent("furnace", 1), silent("weaver", 101), 7))]) {
      const bt = make();
      while (!bt.over && bt.t < WIND_START + 6) {
        bt.step();
        for (const ev of bt.events) if (ev.type === "wind") expect(ev.dmgs).toBeUndefined();
        bt.events.length = 0;
      }
      expect(bt.sides[0].stats.windTaken).toBe(bt.sides[1].stats.windTaken);
      expect(bt.sides[0].stats.windTaken).toBeGreaterThan(0);
      expect(bt.windDps()).toBe(20);
    }
  });

  it("the wind alone empties a full day-10 hull within the 120-s hard stop (a silent mirror ends before BATTLE_CAP)", () => {
    const x = silent("furnace", 1);
    const bt = withHullScale(() => simulate(x, { ...x }, 7, undefined, undefined, 10));
    expect(bt.over).toBe(true);
    expect(bt.t).toBeLessThan(70);
    expect(bt.t).toBeGreaterThan(65);
  });
});
