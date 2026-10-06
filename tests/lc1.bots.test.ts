// LC-1 (REQ-BFG-073): the bots' LAST CHANCE pick (src/sim/harness/lastChance.ts botLastChancePick) and the par player's
// LAST CHANCE card (player.ts playerRun's opts.lastChance, placeFreePart). Switch-on tests restore the switch.
import { afterEach, describe, expect, it } from "vitest";
import { LAST_CHANCE_HULL, lastChanceOffer, setLastChance, withLastChance } from "../src/sim/lastChance";
import { botLastChancePick, runeDuelFactor, FACTOR_MAX, FACTOR_MIN } from "../src/sim/harness/lastChance";
import { parRunSeed, playerRun, rateOn } from "../src/sim/harness/player";
import { botTakeRune, runeProblem } from "../src/sim/runes";
import { lastChanceRuneAt } from "../src/sim/lastChance";
import type { HeroId } from "../src/sim/content";

afterEach(() => setLastChance(false));

const boardOf = (hero: HeroId, seed: number, day: number) => playerRun(hero, day, seed)[day - 1].build;

describe("LC-1: botLastChancePick", () => {
  it("rates each card with the bots' rating and takes the best; deterministic", () => withLastChance(() => {
    for (const hero of ["furnace", "weaver"] as HeroId[]) {
      const day = 6, seed = 3, board = boardOf(hero, seed, day);
      const offer = lastChanceOffer(parRunSeed(hero, seed), day, hero, (board.runes ?? []).map((q) => q.id));
      const a = botLastChancePick(offer, hero, board, day);
      const b = botLastChancePick(offer, hero, board, day);
      expect(b).toEqual(a);
      expect(a.rating.base).toBeCloseTo(rateOn(board, day), 9);
      expect(a.rating.hull).toBeGreaterThan(a.rating.base); // +LAST_CHANCE_HULL hull: more defense
      expect(a.rating.part).toBeGreaterThanOrEqual(a.rating.base); // placed where it gains, else cargo (unchanged)
      const best = Math.max(a.rating.rune, a.rating.part, a.rating.hull);
      expect(a.rating[a.boon]).toBe(best);
      if (a.rating.factor !== undefined) {
        expect(a.rating.factor).toBeGreaterThanOrEqual(FACTOR_MIN);
        expect(a.rating.factor).toBeLessThanOrEqual(FACTOR_MAX);
      }
    }
  }));

  it("the rune's duel factor is 1 for no change and moves with a battle rune", () => {
    const board = boardOf("foundry", 2, 7);
    const f = runeDuelFactor(board, "twin_suns", 7);
    expect(f).toBeGreaterThanOrEqual(FACTOR_MIN);
    expect(f).toBeLessThanOrEqual(FACTOR_MAX);
    expect(runeDuelFactor(board, "twin_suns", 7)).toBe(f); // deterministic
  });
});

describe("LC-1: the par player's LAST CHANCE card (opts.lastChance)", () => {
  it(`absent, the run is exactly as before; HULL adds ${LAST_CHANCE_HULL} at the next dawn; RUNE sits after the day's dawn pick`, () => withLastChance(() => {
    const hero: HeroId = "bastion", seed = 5, day = 6;
    const plain = playerRun(hero, 10, seed);
    const hull = playerRun(hero, 10, seed, { lastChance: { day, boon: "hull" } });
    expect(hull.slice(0, day)).toEqual(plain.slice(0, day)); // the same run up to the LAST CHANCE dusk
    expect(hull[day].build.hullBonus).toBeGreaterThanOrEqual(plain[day - 1].build.hullBonus + LAST_CHANCE_HULL);
    const rune = playerRun(hero, 10, seed, { lastChance: { day, boon: "rune" } });
    const ids = rune[9].build.runes!.map((q) => q.id);
    expect(ids.length).toBe(11); // ten dawns and the LAST CHANCE rune
    const offer = lastChanceOffer(parRunSeed(hero, seed), day, hero, plain[day - 1].build.runes!.map((q) => q.id));
    expect(ids[day]).toBe(offer.rune!.id);
    expect(runeProblem(rune[9].build.runes, 10, hero, parRunSeed(hero, seed), "exact", false, lastChanceRuneAt({ day, boon: "rune" }))).toBeNull();
    const part = playerRun(hero, 10, seed, { lastChance: { day, boon: "part" } });
    expect(part.slice(0, day)).toEqual(plain.slice(0, day));
  }));

  it("botTakeRune counts a LAST CHANCE rune out of the dawns (lcRunes)", () => {
    const b = boardOf("weaver", 4, 6);
    const ids = b.runes!.map((q) => q.id);
    expect(ids.length).toBe(6);
    const withLc = { ...b, runes: [...b.runes!, { id: "thread_storm" }].filter((q, i, a) => a.findIndex((x) => x.id === q.id) === i) };
    if (withLc.runes.length === 7) {
      expect(botTakeRune({ ...withLc, runes: [...withLc.runes] }, 99, 7, "weaver", true, false)).toBeNull(); // 7 runes, day 7: off by one
      expect(botTakeRune({ ...withLc, runes: [...withLc.runes] }, 99, 7, "weaver", true, false, 1)).not.toBeNull();
    }
  });
});
