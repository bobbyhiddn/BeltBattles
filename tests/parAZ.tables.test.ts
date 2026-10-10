// PAR-AZ (REQ-BFG-079; BRIEF-PARAZ 1 (b)): the bots' fight and foe tables, behind HULL_SCALE. deckRating.ts fightTime and
// foeOn read FIGHT_BY_DAY_HS and SUSTAIN_FOE_HS (re-measured with every switch on and the par player's NPC day in) when
// HULL_SCALE is on, and the 0.9.7 tables, FIGHT_BY_DAY and SUSTAIN_FOE, exactly as before when it is off. The switch is
// set through its own setter and put back off after each test.
import { afterEach, describe, expect, it } from "vitest";
import {
  FIGHT_BY_DAY, FIGHT_BY_DAY_HS, RATING_CURVE, SUSTAIN_FOE, SUSTAIN_FOE_HS, fightTime, foeOn, rateDeck, type RateOut,
} from "../src/sim/deckRating";
import { setHullScale } from "../src/sim/hullScale";
import { PLAYER_DAYS, playerBuild, rateOn } from "../src/sim/harness/player";

afterEach(() => setHullScale(false));

const DAYS = Array.from({ length: PLAYER_DAYS }, (_, i) => i + 1);

describe("PAR-AZ: the bots' tables, HULL_SCALE off (the 0.9.7 tables, as before)", () => {
  it("off: fightTime reads FIGHT_BY_DAY and foeOn reads SUSTAIN_FOE, both unchanged, clamped to days 1..10", () => {
    expect(FIGHT_BY_DAY).toEqual([24.4, 19.9, 15.7, 14.2, 12.9, 11.6, 11.1, 10.5, 10.1, 9.5]);
    expect(SUSTAIN_FOE[0]).toEqual({ fight: 29.25, burn: 0.25, hit: 74.5 });
    expect(SUSTAIN_FOE[9]).toEqual({ fight: 13.41, burn: 0.719, hit: 113.1 });
    for (const d of DAYS) {
      expect(fightTime(d), `d${d}`).toBe(FIGHT_BY_DAY[d - 1]);
      expect(foeOn(d), `d${d}`).toBe(SUSTAIN_FOE[d - 1]);
    }
    expect(fightTime(0)).toBe(FIGHT_BY_DAY[0]);
    expect(fightTime(12)).toBe(FIGHT_BY_DAY[9]);
    expect(foeOn(0)).toBe(SUSTAIN_FOE[0]);
    expect(foeOn(12)).toBe(SUSTAIN_FOE[9]);
  });

  it("off: the par player's rating reads the old fight (rateOn = rateDeck over FIGHT_BY_DAY's day)", () => {
    for (const d of [2, 6, 10]) {
      const b = playerBuild("bastion", d, 1);
      expect(rateOn(b, d), `d${d}`).toBe(rateDeck(b, RATING_CURVE, FIGHT_BY_DAY[d - 1], undefined, undefined, d).value);
    }
  });
});

describe("PAR-AZ: the bots' tables, HULL_SCALE on (FIGHT_BY_DAY_HS, SUSTAIN_FOE_HS)", () => {
  it("on: fightTime reads FIGHT_BY_DAY_HS and foeOn reads SUSTAIN_FOE_HS, clamped to days 1..10", () => {
    setHullScale(true);
    expect(FIGHT_BY_DAY_HS.length).toBe(PLAYER_DAYS);
    expect(SUSTAIN_FOE_HS.length).toBe(PLAYER_DAYS);
    for (const d of DAYS) {
      expect(fightTime(d), `d${d}`).toBe(FIGHT_BY_DAY_HS[d - 1]);
      expect(foeOn(d), `d${d}`).toBe(SUSTAIN_FOE_HS[d - 1]);
    }
    expect(fightTime(0)).toBe(FIGHT_BY_DAY_HS[0]);
    expect(fightTime(12)).toBe(FIGHT_BY_DAY_HS[9]);
    expect(foeOn(12)).toBe(SUSTAIN_FOE_HS[9]);
  });

  it("the new tables are in the units rateDeck compares: seconds, a share, a day-1 hit; and they are new numbers", () => {
    for (const d of DAYS) {
      const t = FIGHT_BY_DAY_HS[d - 1], f = SUSTAIN_FOE_HS[d - 1];
      expect(t, `d${d} fight s`).toBeGreaterThan(5);
      expect(t, `d${d} fight s`).toBeLessThan(120);
      expect(f.fight, `d${d} foe fight s`).toBeGreaterThan(5);
      expect(f.fight, `d${d} foe fight s`).toBeLessThan(120);
      expect(f.burn, `d${d} burn share`).toBeGreaterThanOrEqual(0);
      expect(f.burn, `d${d} burn share`).toBeLessThanOrEqual(1);
      // the hit in day-1 units (landed / M(d)): the size of a day-1 hit, not the day's x D(d) landed size (up to 3.1x)
      expect(f.hit, `d${d} hit / M`).toBeGreaterThan(40);
      expect(f.hit, `d${d} hit / M`).toBeLessThan(150);
    }
    expect(FIGHT_BY_DAY_HS).not.toEqual(FIGHT_BY_DAY);
    expect(SUSTAIN_FOE_HS).not.toEqual(SUSTAIN_FOE);
  });

  it("on: the par player's rating reads the new tables (rateOn = rateDeck over FIGHT_BY_DAY_HS's day; the sustain against SUSTAIN_FOE_HS)", () => {
    let moved = 0;
    for (const d of [2, 6, 10]) {
      const b = playerBuild("bastion", d, 1);
      setHullScale(false);
      const off = rateOn(b, d);
      setHullScale(true);
      const on = rateOn(b, d);
      expect(on, `d${d}`).toBe(rateDeck(b, RATING_CURVE, FIGHT_BY_DAY_HS[d - 1], undefined, undefined, d).value);
      const o: RateOut = { stokeKeep: new Map() };
      rateDeck(b, RATING_CURVE, fightTime(d), o, undefined, d);
      const foe = SUSTAIN_FOE_HS[d - 1];
      // the sustain's SHIELD term is the SHIELDs gained over the foe's fight x the foe's day-1 hit
      if (o.sustain && o.sustain.shield > 0) expect(o.sustain.shield / foe.hit, `d${d}`).toBeCloseTo(Math.round(o.sustain.shield / foe.hit), 6);
      if (on !== off) moved++;
    }
    expect(moved, "a rating that moves with the tables").toBeGreaterThan(0);
  });
});
