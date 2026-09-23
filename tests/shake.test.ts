import { describe, expect, it } from "vitest";
import { Fx } from "../src/render/fx";
import { Arena } from "../src/game/arena";
import { setReducedMotion } from "../src/core/settings";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { KO_TRAUMA, hitKick, hitPunch, hitShake, hitTrauma } from "../src/game/arenaReact";

// 0.4.1: a hit's landing-frame camera offset is deterministic. Whatever the cosmetic RNG
// (Fx.rnd) returns, a 3-damage light bolt shows exactly 1 world px and any heavy shell or
// hit of 6+ damage shows 2+ px on the frame it lands. Big-hit and KO shake are unchanged.

type Prep = (fx: Fx) => void;

/** 16 x 16 stubbed RNG states: Fx.rnd alternates two fixed values u, v in [0, 1). */
const STUBS: Prep[] = [];
for (let a = 0; a < 16; a++) {
  for (let b = 0; b < 16; b++) {
    const u = (a / 15) * 0.9999999, v = (b / 15) * 0.9999999;
    STUBS.push((fx) => {
      let n = 0;
      fx.rnd = () => (n++ % 2 === 0 ? u : v);
    });
  }
}

/** 200 real seeded states: the cosmetic LCG advanced k steps. */
const SEEDED: Prep[] = [];
for (let k = 0; k < 200; k++) SEEDED.push((fx) => { for (let i = 0; i < k; i++) fx.rnd(); });

const STATES = [...STUBS, ...SEEDED]; // 456 cosmetic RNG states
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// fx time step per frame at 1x, 2x and 4x playback (Arena scales fx by min(2, max(1, speed * 0.75)))
const FX_DT = [1, 2, 4].map((s) => Math.min(2, Math.max(1, s * 0.75)) / 60);

/** Camera offset |x| + |y| (world px) on the landing frame of one hit. */
function landing(prep: Prep, dmg: number, heavy: boolean, dir: [number, number], dt: number): number {
  const fx = new Fx();
  prep(fx);
  hitShake(fx, dmg, heavy, dir[0], dir[1]);
  fx.update(dt);
  return Math.abs(fx.shakeX) + Math.abs(fx.shakeY);
}

/** Min and max landing offset over every RNG state, direction and playback speed. */
function range(dmg: number, heavy: boolean): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const prep of STATES) {
    for (const dir of DIRS) {
      for (const dt of FX_DT) {
        const v = landing(prep, dmg, heavy, dir, dt);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  return [lo, hi];
}

describe("hit shake is deterministic on the landing frame", () => {
  it("checks at least 200 cosmetic RNG states", () => {
    expect(STATES.length).toBeGreaterThanOrEqual(200);
  });

  it("a 3-damage light bolt shows exactly 1 px whatever the RNG returns", () => {
    setReducedMotion(false);
    expect(range(3, false)).toEqual([1, 1]);
  });

  it("any hit of 6+ damage shows 2 or more px; heavy shells always beat light bolts", () => {
    setReducedMotion(false);
    const light = range(3, false);
    for (const [dmg, heavy] of [[6, false], [6, true], [7, true], [7, false], [9, true], [4, true], [5, true]] as [number, boolean][]) {
      const [lo] = range(dmg, heavy);
      expect(lo, `dmg ${dmg} heavy ${heavy}`).toBeGreaterThanOrEqual(2);
      expect(lo).toBeGreaterThan(light[1]);
    }
    for (const dmg of [10, 13, 14, 20]) expect(range(dmg, true)[0]).toBeGreaterThanOrEqual(3);
  });

  it("the punch mapping is monotonic and big-hit / KO constants are unchanged", () => {
    expect(hitPunch(3, false)).toBe(1);
    expect(hitPunch(5, false)).toBe(1);
    expect(hitPunch(6, false)).toBe(2);
    expect(hitPunch(4, true)).toBe(2);
    expect(hitPunch(7, true)).toBe(2);
    expect(hitPunch(12, true)).toBe(3);
    // 0.4.0 big-hit and KO shake inputs, kept as they were
    expect(hitTrauma(16)).toBeCloseTo(0.52, 10);
    expect(hitKick(16, true)).toBe(3);
    expect(KO_TRAUMA).toBe(0.95);
  });

  it("reduced motion keeps every landing frame at 0", () => {
    setReducedMotion(true);
    expect(range(3, false)).toEqual([0, 0]);
    expect(range(7, true)).toEqual([0, 0]);
    expect(range(16, true)).toEqual([0, 0]);
    setReducedMotion(false);
  });

  it("in a real battle every landing frame shows at least its punch", () => {
    setReducedMotion(false);
    const a = new Arena(startingBuild("furnace", 1), warlordBuild("weaver", 1), 12345, null);
    a.quiet = true;
    let landings = 0;
    for (let f = 0; f < 60 * 120 && !a.b.over; f++) {
      a.speed = [1, 2, 4][Math.floor(f / 300) % 3];
      const ev = a.update(1 / 60);
      let need = 0;
      for (const e of ev) if (e.type === "impact") need = Math.max(need, hitPunch(Math.max(1, Math.round(e.dmg)), e.heavy));
      if (!need) continue;
      landings++;
      expect(Math.abs(a.fx.shakeX) + Math.abs(a.fx.shakeY)).toBeGreaterThanOrEqual(need);
    }
    expect(landings).toBeGreaterThan(10);
  });
});
