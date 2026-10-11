// SCOUT-1 (REQ-BFG-076): VIEW BATTLEFIELD's per-part fight line. The Arena counts, display side, each turret's shots and the
// damage they dealt on landing (game/arena.ts partShots, partDamage) from the events alone. The truth here is the sim's own
// impact calls, watched by a test-only wrapper around Battle's private impact (each call's projectile names its side and
// turret, and pushes exactly one `impact`); the sim itself is untouched. The tallies equal the truth exactly, played or
// skipped, and every side's shots add up to its SHOTS.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Battle, type Projectile, type SimEvent } from "../src/sim/battle";
import { Arena } from "../src/game/arena";
import { standInFoe } from "../src/game/ghosts";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";

type Truth = { dmg: [number[], number[]]; secondary: number };
let truth: Truth | null = null;
const proto = Battle.prototype as unknown as { impact: (pr: Projectile) => void };
const real = proto.impact;

beforeAll(() => {
  proto.impact = function (this: Battle & { events: SimEvent[] }, pr: Projectile): void {
    const at = this.events.length;
    real.call(this, pr);
    if (!truth) return;
    // this call's own impact: the first one it pushed (its splash, arcs and lances push theirs after it)
    const e = this.events.slice(at).find((x) => x.type === "impact");
    if (e && e.type === "impact") truth.dmg[pr.from][pr.turret] = (truth.dmg[pr.from][pr.turret] ?? 0) + e.dmg;
    if (this.events.slice(at).some((x) => x.type === "splash" || x.type === "arc" || x.type === "lance")) truth.secondary++;
  };
});
afterAll(() => {
  proto.impact = real;
});

const sum = (xs: number[]): number => xs.reduce((n, x) => n + (x ?? 0), 0);
const dense = (xs: number[], n: number): number[] => Array.from({ length: n }, (_, i) => xs[i] ?? 0);

function cases(): [string, Build, Build, number][] {
  const out: [string, Build, Build, number][] = [];
  for (const seed of [3, 11, 29]) {
    for (const day of [3, 6, 9, 10]) {
      const a = standInFoe(seed, day), b = standInFoe(seed + 101, day);
      out.push([`stand-ins ${a.name} v ${b.name} day ${day}`, a.build, b.build, seed * 7 + day]);
    }
  }
  for (const h of ["foundry", "bastion", "furnace", "weaver"] as const) out.push([`${h} warlord r4`, startingBuild("furnace", 1), warlordBuild(h, 4), 5]);
  return out;
}

describe("SCOUT-1: the per-part fight tally (display side) equals the sim's own impacts", () => {
  let secondary = 0;
  for (const [name, p, e, seed] of cases()) {
    it(`${name}: played at 1X and 4X, and skipped`, () => {
      for (const mode of ["1x", "4x", "skip"] as const) {
        truth = { dmg: [[], []], secondary: 0 };
        const a = new Arena(p, e, seed, null);
        a.quiet = true;
        if (mode === "skip") {
          for (let i = 0; i < 90; i++) a.update(1 / 60);
          a.finish();
        } else {
          a.speed = mode === "4x" ? 4 : 1;
          for (let f = 0; f < 60 * 400 && !a.b.over; f++) a.update(1 / 60);
        }
        expect(a.b.over).toBe(true);
        for (const s of [0, 1] as const) {
          expect(sum(a.partShots[s])).toBe(a.b.sides[s].stats.shots);
          const n = Math.max(a.partDamage[s].length, truth.dmg[s].length);
          expect(dense(a.partDamage[s], n)).toEqual(dense(truth.dmg[s], n));
          expect(sum(a.partDamage[s])).toBe(sum(truth.dmg[s]));
          expect(sum(a.partDamage[s])).toBeLessThanOrEqual(a.b.sides[s].stats.damage);
        }
        secondary += truth.secondary;
      }
      truth = null;
    });
  }
  it("the cases land splash, arcs or lances (the second-hand impacts are tested)", () => {
    expect(secondary).toBeGreaterThan(0);
  });
});
