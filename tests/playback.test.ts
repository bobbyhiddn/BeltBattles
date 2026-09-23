import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { Arena } from "../src/game/arena";
import { SPEEDS, SPEED_LABELS } from "../src/screens/battleHud";

// REQ-BFG-014: pause and 0.5x / 1x / 2x / 4x playback change presentation speed only.

function play(seed: number, speedAt: (f: number) => number, pausedAt: (f: number) => boolean): Arena {
  const a = new Arena(startingBuild("furnace", 1), warlordBuild("weaver", 3), seed, null);
  a.quiet = true;
  for (let f = 0; f < 60 * 900 && !a.b.over; f++) {
    a.speed = speedAt(f);
    a.paused = pausedAt(f);
    a.update(1 / 60);
  }
  return a;
}

describe("playback speed and pause never change the outcome", () => {
  it("the bar offers 0.5X 1X 2X 4X in that order", () => {
    expect(SPEEDS).toEqual([0.5, 1, 2, 4]);
    expect(SPEED_LABELS).toEqual(["0.5X", "1X", "2X", "4X"]);
  });

  for (const seed of [7, 99]) {
    it(`seed ${seed}: 0.5x, pauses and mixed speeds end exactly like simulate()`, () => {
      const ref = simulate(startingBuild("furnace", 1), warlordBuild("weaver", 3), seed);
      const runs = [
        play(seed, () => 0.5, () => false),
        play(seed, () => 1, (f) => f % 200 < 70),
        play(seed, (f) => SPEEDS[Math.floor(f / 150) % 4], (f) => f % 333 < 40),
      ];
      for (const a of runs) {
        expect(a.b.over).toBe(true);
        expect(a.b.ticks).toBe(ref.ticks);
        expect(a.b.winner).toBe(ref.winner);
        expect(a.b.sides[0].hull.hp).toBe(ref.sides[0].hull.hp);
        expect(a.b.sides[1].hull.hp).toBe(ref.sides[1].hull.hp);
      }
    });
  }

  it("pause holds the sim still; 0.5x runs it at half speed", () => {
    const a = new Arena(startingBuild("furnace", 1), warlordBuild("weaver", 1), 5, null);
    a.quiet = true;
    a.paused = true;
    for (let i = 0; i < 120; i++) a.update(1 / 60);
    expect(a.b.t).toBe(0);
    a.paused = false;
    a.speed = 0.5;
    for (let i = 0; i < 120; i++) a.update(1 / 60);
    expect(a.b.t).toBeGreaterThan(0.9);
    expect(a.b.t).toBeLessThan(1.1);
  });
});
