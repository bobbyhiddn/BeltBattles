import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { Arena } from "../src/game/arena";
import { setReducedMotion } from "../src/core/settings";
import type { HeroId } from "../src/sim/content";

// Juice must never change a battle: playback through the Arena (muzzle flashes, shake,
// hit-stop, KO slow-mo, speed changes) ends exactly like the headless simulation.

function playback(p: ReturnType<typeof startingBuild>, e: ReturnType<typeof startingBuild>, seed: number, speeds: number[]): Arena {
  const a = new Arena(p, e, seed, null);
  a.quiet = true;
  let frame = 0;
  while (!a.b.over && frame < 60 * 400) {
    a.speed = speeds[Math.floor(frame / 240) % speeds.length];
    a.update(1 / 60);
    frame++;
  }
  // let the KO sequence play out as well
  for (let i = 0; i < 240; i++) a.update(1 / 60, false);
  return a;
}

const CASES: [HeroId, HeroId, number, number][] = [
  ["furnace", "weaver", 1, 99],
  ["furnace", "weaver", 3, 7],
  ["weaver", "furnace", 1, 99],
  ["weaver", "furnace", 5, 42],
];

describe("effects do not change results", () => {
  for (const [me, foe, round, seed] of CASES) {
    it(`${me} vs ${foe} r${round} seed ${seed}: arena playback == simulate()`, () => {
      const p = startingBuild(me, 1), e = warlordBuild(foe, round);
      const ref = simulate(p, e, seed);
      for (const speeds of [[1], [1, 2, 4], [4]]) {
        const a = playback(p, e, seed, speeds);
        expect(a.b.over).toBe(true);
        expect(a.b.ticks).toBe(ref.ticks);
        expect(a.b.winner).toBe(ref.winner);
        expect(a.b.sides[0].hull.hp).toBe(ref.sides[0].hull.hp);
        expect(a.b.sides[1].hull.hp).toBe(ref.sides[1].hull.hp);
        expect(a.b.sides[0].stats.shots).toBe(ref.sides[0].stats.shots);
        expect(a.b.sides[1].stats.damage).toBe(ref.sides[1].stats.damage);
      }
    });
  }

  it("reduced motion zeroes the camera shake but keeps particles", () => {
    const p = startingBuild("furnace", 1), e = warlordBuild("weaver", 1);
    for (const rm of [false, true]) {
      setReducedMotion(rm);
      const a = new Arena(p, e, 99, null);
      let peak = 0, parts = 0;
      for (let i = 0; i < 60 * 12; i++) {
        a.update(1 / 60);
        peak = Math.max(peak, Math.abs(a.fx.shakeX) + Math.abs(a.fx.shakeY));
        parts = Math.max(parts, a.fx.parts.n);
      }
      if (rm) expect(peak).toBe(0);
      else expect(peak).toBeGreaterThan(0);
      expect(parts).toBeGreaterThan(10);
    }
    setReducedMotion(false);
  });

  it("big hits trigger a 2-4 frame hit-stop", () => {
    // a long braked cooking route makes 14+ damage slugs
    const cooker = {
      hero: "furnace" as const,
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 },
        { uid: 2, def: "temper", x: 2, y: 4 },
        { uid: 3, def: "brake", x: 3, y: 2 },
        { uid: 4, def: "longhaul", x: 4, y: 1 },
      ],
      routes: [{ factory: 1, cells: [54, 53, 52, 42, 32, 22, 23, 24, 14, 4] }],
      mods: [], beltCap: 18, hullBonus: 0,
    };
    const a = new Arena(cooker, warlordBuild("weaver", 1), 7, null);
    let frozen = -1;
    for (let i = 0; i < 60 * 90 && !a.b.over && frozen < 0; i++) {
      const ev = a.update(1 / 60);
      if (ev.some((e) => e.type === "impact" && e.big)) frozen = a.fx.hitstop;
    }
    expect(frozen).toBeGreaterThanOrEqual(2);
    expect(frozen).toBeLessThanOrEqual(4);
    // frozen frames hold the simulation still
    const t0 = a.b.t;
    a.update(1 / 60);
    expect(a.b.t).toBe(t0);
  });
});
