// HULL-1c (REQ-BFG-079; cap's decision b6be918372b006f3): D(d), the damage day term behind HULL_SCALE, and the economy's
// gold (+1 a day to day 10). The table and cap's rules for it (D(1) = 1; D never falls; D <= M; M / D never falls from day 3
// to day 10; past day 10 M / D holds day 10's value); the one integer rule with its carried remainder; a battle's D (only
// on the day's hull); a BURN tick lands x D; and the switch off: D = 1 and 0.9.7's income. Switches only through
// withHullScale.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { BURN_DPS, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";
import {
  DAY_MUL_TENTHS, DMG_MUL_STEP_TENTHS, DMG_MUL_TENTHS, DMG_MUL_TENTHS_LATE, dayMulTenths, dmgDayScale, dmgMul, dmgMulTenths,
  withHullScale,
} from "../src/sim/hullScale";
import { maxGoldByDay } from "../src/net/validate";
import { maxGoldByDay as simMaxGold } from "../src/sim/rivals";

const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });

describe("HULL-1c: D(d), the damage day term", () => {
  it("the table follows cap's rules: D(1) = 1, never falls, D <= M, M / D never falls on days 3-10", () => {
    const D = Array.from({ length: 30 }, (_, i) => dmgMulTenths(i + 1)), M = Array.from({ length: 30 }, (_, i) => dayMulTenths(i + 1));
    expect(D[0]).toBe(10);
    expect(D.slice(0, 10)).toEqual([...DMG_MUL_TENTHS]);
    for (let d = 1; d < 30; d++) expect(D[d]).toBeGreaterThanOrEqual(D[d - 1]);
    for (let d = 0; d < 30; d++) expect(D[d]).toBeLessThanOrEqual(M[d]);
    for (let d = 3; d < 10; d++) expect(M[d] / D[d]).toBeGreaterThanOrEqual(M[d - 1] / D[d - 1]);
    expect(D.every((t) => Number.isInteger(t))).toBe(true);
    expect([dmgMul(1), dmgMul(undefined), dmgMul(0)]).toEqual([1, 1, 1]);
  });

  it("past day 10, M / D holds day 10's: D = M x D(10) / M(10) to the nearest tenth (days 11-18), then a per-day step", () => {
    const k = DMG_MUL_TENTHS[9] / DAY_MUL_TENTHS[9];
    expect(DMG_MUL_TENTHS_LATE).toEqual(DAY_MUL_TENTHS.slice(10).map((m) => Math.round(m * k)));
    expect(DMG_MUL_STEP_TENTHS).toBe(Math.round(12 * k));
    expect(dmgMulTenths(19)).toBe(DMG_MUL_TENTHS_LATE[7] + DMG_MUL_STEP_TENTHS);
    for (let d = 11; d <= 30; d++) expect(Math.abs(dayMulTenths(d) / dmgMulTenths(d) - DAY_MUL_TENTHS[9] / DMG_MUL_TENTHS[9])).toBeLessThan(0.1);
  });

  it("the integer rule: n x D, rounded down, the remainder carried on the struck carrier (small hits keep D)", () => {
    const c: { dmgRem?: number } = {};
    // D 1.1 on ten hits of 1: 1.1 each, so 11 in all, never 10
    expect(Array.from({ length: 10 }, () => dmgDayScale(1, 11, c)).reduce((a, b) => a + b, 0)).toBe(11);
    const c2: { dmgRem?: number } = {};
    expect([dmgDayScale(7, 31, c2), c2.dmgRem]).toEqual([21, 7]); // 21.7 -> 21, 0.7 carried
    expect(dmgDayScale(7, 31, c2)).toBe(22); // 21.7 + 0.7 = 22.4 -> 22
    const c3: { dmgRem?: number } = {};
    expect([dmgDayScale(50, 10, c3), c3.dmgRem]).toEqual([50, undefined]); // D = 1: untouched, no counter
    expect(dmgDayScale(0, 31, c3)).toBe(0);
  });

  it("a battle's D: only on the day's hull (HULL_SCALE on and a day); a BURN tick lands x D, the carry kept per hull", () => {
    // AZ-BUMP (the flip, HULL_SCALE): the switch-off battle, off through the setter (the switch ships on)
    expect(withHullScale(() => new Battle(silent("furnace", 1), silent("weaver", 101), 7, undefined, 10), false).dmgTenths).toBe(10);
    expect(withHullScale(() => new Battle(silent("furnace", 1), silent("weaver", 101), 7)).dmgTenths).toBe(10);
    for (const day of [1, 2, 7, 10]) {
      const bt = withHullScale(() => new Battle(silent("furnace", 1), silent("weaver", 101), 7, undefined, day));
      expect(bt.dmgTenths).toBe(dmgMulTenths(day));
      const s = bt.sides[1], hp0 = s.hull.hp;
      s.hull.burns.push({ dps: 1, t: 3 }); // one stack for 3 s: BURN_DPS a second, x D
      while (bt.t < 3.5) { bt.step(); bt.events.length = 0; }
      expect(hp0 - s.hull.hp).toBe(Math.floor((3 * BURN_DPS * dmgMulTenths(day)) / 10));
    }
  });
});

describe("HULL-1c: gold per day keeps growing to day 10 (with the switch on)", () => {
  it("6 + min(day, 10) + the win's 2, days 11+ at day 10's; every maxGoldByDay reads it; off: 0.9.7's", () => {
    withHullScale(() => {
      expect(Array.from({ length: 12 }, (_, i) => incomeFor(i + 1, true))).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 18, 18]);
      expect(incomeFor(7, false)).toBe(13);
      expect(Array.from({ length: 10 }, (_, i) => maxGoldByDay(i + 1))).toEqual([8, 17, 27, 38, 50, 63, 77, 92, 108, 125]);
      for (let d = 1; d <= 10; d++) expect(simMaxGold(d)).toBe(maxGoldByDay(d));
    });
    expect(START_GOLD).toBe(8);
    // AZ-BUMP (the flip, HULL_SCALE): off through the setter (the switch ships on): 0.9.7's income and purse
    expect(withHullScale(() => Array.from({ length: 10 }, (_, i) => incomeFor(i + 1, true)), false)).toEqual([9, 10, 11, 12, 13, 14, 14, 14, 14, 14]);
    expect(withHullScale(() => Array.from({ length: 10 }, (_, i) => maxGoldByDay(i + 1)), false)).toEqual([8, 17, 27, 38, 50, 63, 77, 91, 105, 119]);
  });
});
