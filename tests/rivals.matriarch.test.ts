import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES, MATRIARCH_DAY, RUN_DAYS, difficultyOf, standInGhost, standInGhosts, warlordOffer, warlordOffers,
  warlordPool, type RivalId,
} from "../src/sim/rivals";

// Ruling R3 (Part 4): the Iron Matriarch holds the Hard slot on days 8-10 until the player beats
// her; from the next day the Hard slot shows a regular Hard captain, so her legendary reward can
// be won only once per run. Stand-ins never change.

const SEEDS = Array.from({ length: 200 }, (_, i) => (i === 0 ? 0 : (i * 2654435761) >>> 0));
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const HARD = new Set<RivalId>(warlordPool("hard"));

describe("the Matriarch rule (R3), 200 seeds", () => {
  for (const beaten of [8, 9]) {
    it(`beaten on day ${beaten}: a regular Hard captain after, no repeats, never the day's stand-in, deterministic`, () => {
      for (const seed of SEEDS) {
        const run = DAYS.map((day) => warlordOffer(seed, day, beaten));
        expect(DAYS.map((day) => warlordOffer(seed, day, beaten)), `seed ${seed}`).toEqual(run);
        const unbeaten = warlordOffers(seed);
        const standIns = standInGhosts(seed);
        DAYS.forEach((day) => {
          const o = run[day - 1], why = `seed ${seed} day ${day}`;
          expect(o.easy, why).toBe(unbeaten[day - 1].easy);
          expect(o.medium, why).toBe(unbeaten[day - 1].medium);
          for (const slot of DIFFICULTIES) expect(difficultyOf(o[slot]), why).toBe(slot);
          if (day <= beaten) {
            expect(o, why).toEqual(unbeaten[day - 1]);
          } else {
            expect(Object.values(o), why).not.toContain("matriarch");
            expect(HARD.has(o.hard), why).toBe(true);
            expect(o.hard, why).not.toBe(standInGhost(seed, day));
          }
          expect(Object.values(o), `${why} stand-in`).not.toContain(standIns[day - 1]);
          if (day > 1) {
            const yesterday = new Set(Object.values(run[day - 2]));
            for (const id of Object.values(o)) {
              if (id === "matriarch") continue; // her own days 8-10 before she is beaten
              expect(yesterday.has(id), `${why}: ${id} offered two days running`).toBe(false);
            }
          }
        });
      }
    });
  }

  it("unbeaten (omitted, or beaten on day 10): she holds the Hard slot on days 8-10, as warlordOffers says", () => {
    for (const seed of SEEDS) {
      const unbeaten = warlordOffers(seed);
      for (const day of DAYS) {
        const o = warlordOffer(seed, day);
        expect(o).toEqual(unbeaten[day - 1]);
        expect(warlordOffer(seed, day, 10)).toEqual(o);
        expect(warlordOffer(seed, day, 5)).toEqual(o); // she cannot be beaten before she is met
        expect(o.hard === "matriarch", `seed ${seed} day ${day}`).toBe(day >= MATRIARCH_DAY);
      }
    }
  });

  it("stand-ins do not depend on the Matriarch fight", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const before = standInGhosts(seed);
      for (const beaten of [8, 9]) DAYS.forEach((day) => warlordOffer(seed, day, beaten));
      expect(standInGhosts(seed)).toEqual(before);
      DAYS.forEach((day) => expect(standInGhost(seed, day)).toBe(before[day - 1]));
    }
  });

  it("the replacement varies across runs (every Hard captain fills in somewhere)", () => {
    const seen = new Set<RivalId>();
    for (const seed of SEEDS) for (const day of [9, 10]) seen.add(warlordOffer(seed, day, 8).hard);
    expect(seen).toEqual(HARD);
  });
});
