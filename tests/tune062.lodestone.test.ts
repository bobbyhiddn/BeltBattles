// 0.6.2 TUNE-M T2 (ref/BRIEF-final-062-tune.md; the Prime's decision, as QUENCH TANK's oracle 16085a6430e4cc6a):
// LODESTONE gets a floor. Every payload it hits gains +1/+2/+3 at ★1/★2/★3, below WHETSTONE's 2/4/7, and its per-stalled
// bonus (+1/+2.2/+3.5 per enemy machine disrupted, frozen or wrecked, max 6/13/21) comes on top. Was the per-stalled bonus
// alone: a deck with no stall source got nothing from it at any star (NO EFFECT on FB-A and RB; CAND-A ablation -5.4).
import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { walkRoute, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { rivalBuild } from "../src/sim/rivals";
import { overclocked } from "../src/sim/overclock";
import { effectAt } from "../src/sim/stars";
import { flavour } from "../src/screens/build/flavour";
import { hitLabel, levelLine, starEffectLine } from "../src/screens/build/inspector";
import { wrap } from "../src/render/font";
import { barge, bench, est, run } from "./arsenal.bench";

const STARS = [1, 2, 3];
const FLOOR = [1, 2, 3], EACH = [1, 2.2, 3.5], MAX = [6, 13, 21], WHET = [2, 4, 7];

const payload = (flat = 0): Payload => ({ id: 91, ammo: "plain", ride: 0, mult: 1, flat, burn: 0, shock: false, prior: 0, factory: 1, copy: false });

/** One arrow of a LODESTONE at `stars` (the bench's tile 2) applied to a copy of `p`, with `stalled` of the barge's
 *  machines (the Loom and its three turrets) stalled, exactly as the battle applies it. */
function lodestoned(stars: number, stalled: number, p = payload()): Payload {
  const bt = new Battle(bench([["lodestone", 4, 3, stars]]), barge(), 7);
  const s = bt.sides[0], foe = bt.sides[1];
  s.gates[0].online = true;
  const machines = [...foe.factories, ...foe.turrets];
  expect(machines.length).toBeGreaterThanOrEqual(stalled);
  machines.slice(0, stalled).forEach((m, i) => { if (i % 2) m.frozen = 2; else m.disrupted = 2; });
  const a: BeltAmmo = { p: { ...p }, s: 30, processed: 2, blocked: false };
  (bt as unknown as { applyHit: (s: unknown, a: BeltAmmo, h: unknown) => BeltAmmo[] }).applyHit(s, a, s.routes[0].gateAt[2][0]);
  return a.p;
}

/** A fight's outcome: winner, time and both hulls. */
function outcome(a: Build, b: Build, seed: number): string {
  const bt = new Battle(JSON.parse(JSON.stringify(a)) as Build, JSON.parse(JSON.stringify(b)) as Build, seed);
  while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.drainEvents(); }
  return JSON.stringify([bt.winner, bt.t, bt.sides[0].hull.hp, bt.sides[1].hull.hp]);
}

describe("TUNE-M T2: LODESTONE's floor", () => {
  it("the rule at 1/2/3 stars: +1/+2/+3 flat, and the per-stalled bonus as before", () => {
    expect(STARS.map((s) => effectAt("lodestone", s).gate)).toEqual(STARS.map((s, i) => ({ flat: FLOOR[i], perStalled: { each: EACH[i], max: MAX[i] } })));
    expect(ITEMS.lodestone.price).toBe(5);
    expect(ITEMS.lodestone.rarity).toBe("rare");
  });

  it("with no stalled machine it adds its floor, less per arrow than WHETSTONE at the same star (estimate and battle)", () => {
    const bare = est(bench()).dmg;
    for (const [i, s] of STARS.entries()) {
      expect(lodestoned(s, 0).flat, `★${s}`).toBe(FLOOR[i]);
      const l = est(bench([["lodestone", 4, 3, s]])).dmg - bare, w = est(bench([["whetstone", 4, 3, s]])).dmg - bare;
      expect(l, `★${s} estimate`).toBeCloseTo(FLOOR[i], 9);
      expect(l, `★${s}: LODESTONE < WHETSTONE`).toBeLessThan(w);
      expect(FLOOR[i]).toBeLessThan(WHET[i]);
      // the bench has no stall source: every payload past the rig carries exactly the floor
      const flats = (id: string) => [...new Set(run(bench([[id, 4, 3, s]]), 8).sides[0].routes[0].ammo.filter((a) => a.processed >= 2).map((a) => a.p.flat))];
      expect(flats("lodestone"), `★${s}`).toEqual([FLOOR[i]]);
      const fired = (b: Build) => run(b, 20).sides[0].stats.payloadSum;
      expect(fired(bench([["lodestone", 4, 3, s]])), `★${s}`).toBeGreaterThan(fired(bench()));
      expect(fired(bench([["lodestone", 4, 3, s]])), `★${s}`).toBeLessThan(fired(bench([["whetstone", 4, 3, s]])));
    }
  });

  it("with stalled machines it adds the floor plus the per-stalled bonus, up to its max", () => {
    for (const [i, s] of STARS.entries()) {
      expect(lodestoned(s, 1).flat, `★${s}, 1 stalled`).toBeCloseTo(FLOOR[i] + EACH[i], 9);
      for (const n of [2, 3, 4]) expect(lodestoned(s, n).flat, `★${s}, ${n} stalled`).toBeCloseTo(FLOOR[i] + Math.min(MAX[i], n * EACH[i]), 9);
      // on top of what the payload already carries
      expect(lodestoned(s, 1, payload(5)).flat).toBeCloseTo(5 + FLOOR[i] + EACH[i], 9);
    }
  });

  it("★2 and ★3 each change battles of a deck with no stall source (★1 -> ★2 -> ★3, day-2 and day-3 foes)", () => {
    const deck = (s: number): Build => bench([["lodestone", 4, 3, s]], [], 0);
    const foes = [heroStartBuild("weaver", 1), rivalBuild("nettle", 2), rivalBuild("sootjaw", 3), rivalBuild("lacewing", 3)];
    const results = STARS.map((s) => foes.flatMap((f) => [1, 2, 3, 4].map((seed) => outcome(deck(s), f, seed))));
    const changed = (a: string[], b: string[]) => a.filter((x, k) => x !== b[k]).length;
    expect(changed(results[0], results[1]), "★1 -> ★2").toBeGreaterThan(0);
    expect(changed(results[1], results[2]), "★2 -> ★3").toBeGreaterThan(0);
    // and the deck has no stall source: its payloads never carry more than the floor past the rig
    for (const [i, s] of STARS.entries()) {
      const bt = run(deck(s), 12, rivalBuild("sootjaw", 3), 2);
      for (const a of bt.sides[0].routes[0].ammo.filter((x) => x.processed >= 2)) expect(a.p.flat).toBe(FLOOR[i]);
    }
  });

  it("an overclocked LODESTONE doubles its floor and its per-stalled pay", () => {
    expect(overclocked({ flat: 1, perStalled: { each: 1, max: 6 } })).toEqual({ flat: 2, perStalled: { each: 2, max: 6 } });
  });

  it("player text: the description, each star's flavour and level line, and the belt's timeline state the floor", () => {
    expect(ITEMS.lodestone.desc).toEqual(["+1 DAMAGE ALWAYS,", "+1 PER ENEMY", "MACHINE STALLED."]);
    expect(STARS.map((s) => flavour("lodestone", s).join(" / "))).toEqual([
      "+1 DAMAGE ALWAYS, / +1 PER ENEMY / MACHINE STALLED.", "+2 DAMAGE ALWAYS, / +2.2 PER ENEMY / MACHINE STALLED.", "+3 DAMAGE ALWAYS, / +3.5 PER ENEMY / MACHINE STALLED.",
    ]);
    expect(STARS.map((s) => starEffectLine("lodestone", s))).toEqual(["+1 DMG · +1/STALLED · MAX 6", "+2 DMG · +2.2/STALLED · MAX 13", "+3 DMG · +3.5/STALLED · MAX 21"]);
    expect(levelLine("lodestone", 3)).toBe("★3: +3 DMG · +3.5/STALLED · MAX 21");
    for (const s of STARS) expect(wrap(starEffectLine("lodestone", s), 151, "3").length, `★${s} on a phone`).toBe(1);
    const hit = walkRoute(bench([["lodestone", 4, 3, 2]]), 0).timeline.flatMap((row) => row.hits).find((h) => h.def === "lodestone")!;
    expect(hit.flat).toBe(2);
    expect(hitLabel(hit, false)).toContain("+2");
  });
});
