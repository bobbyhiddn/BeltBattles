// 0.6.1a: stars in the data model and the sim (stars.ts). Per-star benches (task item 20): for every
// star number the 0.6.1a sim applies, 1 star < 2 < 3 on the module's headline metric, on a fixed deck.
// 0.6.1p applied 0.6.1a's pending perks; their per-star benches are in tests/arsenal.modules.test.ts.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { ITEMS, sellValue } from "../src/sim/content";
import { estimateRoute, key, rotField, type Build } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { effectAt, FUSE_MAX, fusible, outputsAt, pendingAt, perkAt, starsOf, valueOf } from "../src/sim/stars";

const LIVE = ["temper", "whetstone", "grease", "brake", "longhaul", "coil", "splitter", "overdrive", "press", "chamber", "calibrate"];
const K = key;

/** Furnace bench: the Kiln at (4,6) on a straight 6-tile route to column 4; rigs by [def, x, y, stars]:
 *  0.6.2 BELTSIDE, each rig stands west of belt tile (x, y) and faces it (its first arrow points east). */
function bench(gates: [string, number, number, number][], mods: [string, number][] = [], kilnRoute = true): Build {
  const b: Build = {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
    routes: kilnRoute ? [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] : [],
    mods: [], beltCap: 30, hullBonus: 5000,
  };
  let uid = 10;
  for (const [def, x, y, s] of gates) b.items.push({ uid: uid++, def, x: x - 1, y, ...rotField(def, rotFacing(def, 1)), ...(s > 1 ? { stars: s } : {}) });
  for (const [def, s] of mods) b.mods.push({ uid: uid++, def, turret: 0, ...(s > 1 ? { stars: s } : {}) });
  return b;
}
/** A target barge: Weaver hull + 5000, no belts, so it never fires. */
const barge = (): Build => ({ hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 5000 });
function run(b: Build, secs = 30): Battle {
  const bt = new Battle(b, barge(), 12345);
  while (bt.t < secs && !bt.over) bt.step();
  return bt;
}
const est = (b: Build) => estimateRoute(b, 0);
const at3 = <T>(f: (s: number) => T): T[] => [1, 2, 3].map(f);
const up = (xs: number[]) => xs[0] < xs[1] && xs[1] < xs[2];
const down = (xs: number[]) => xs[0] > xs[1] && xs[1] > xs[2];

describe("stars.ts", () => {
  it("FUSE_MAX, starsOf and fusible", () => {
    expect(FUSE_MAX).toBe(3);
    expect([starsOf({}), starsOf({ stars: 2 }), starsOf({ stars: 3 }), starsOf(undefined)]).toEqual([1, 2, 3, 1]);
    for (const id of LIVE) expect(fusible(id), id).toBe(true);
    for (const id of ["beltcrate", "plating", "kiln", "loom", "crucible", "wardworks", "clockworks", "sump", "nope"]) expect(fusible(id), id).toBe(false);
  });
  it("effectAt: 1 star is ITEMS[def] itself; levels merge over the spec; unknown ids throw", () => {
    for (const id of Object.keys(ITEMS)) expect(effectAt(id, 1)).toBe(ITEMS[id]);
    expect(effectAt("temper", 2).gate).toEqual({ burn: 2 });
    expect(effectAt("temper", 3).gate).toEqual({ burn: 4 });
    // 0.6.1p: the pending perks are applied, so the dies and WIDE BREECH merge in; 0.6.1f: PERFECT CUT replaced THREE-WAY
    expect(effectAt("press", 3).factory).toEqual({ ammo: "plain", interval: 1, outputs: 1, base: 7.5 });
    expect(effectAt("chamber", 3).mod).toEqual({ perShot: 3, window: 1 });
    expect(effectAt("splitter", 3).gate).toEqual({ split: { copies: 2, mult: 0.85 } });
    expect([2, 3].map((s) => effectAt("brake", s).gate)).toEqual([{ speed: 0.5, flat: 2, lockedFlat: 4 }, { speed: 0.5, flat: 5, lockedFlat: 7 }]);
    expect(ITEMS.temper.gate).toEqual({ burn: 1 }); // the 1-star spec is untouched
    expect(() => effectAt("nope", 2)).toThrow();
  });
  it("every fusible live module carries 2- and 3-star levels; nothing is pending any more (0.6.1p); perks are stored", () => {
    for (const id of LIVE) expect(ITEMS[id].levels?.[2] && ITEMS[id].levels?.[3], id).toBeTruthy();
    for (const id of LIVE) for (const s of [1, 2, 3]) expect(pendingAt(id, s), `${id} ${s}`).toEqual({});
    expect([perkAt("temper", 3), perkAt("overdrive", 2), perkAt("coil", 1)]).toEqual([undefined, "REDLINE", undefined]);
  });
  it("valueOf = price x 2^(stars-1); sellValue = max(1, floor(valueOf / 2)); outputsAt", () => {
    expect(at3((s) => valueOf("temper", s))).toEqual([3, 6, 12]);
    expect(at3((s) => valueOf("overdrive", s))).toEqual([10, 20, 40]);
    expect(valueOf("temper")).toBe(3);
    expect(valueOf("nope", 2)).toBe(0);
    for (const id of LIVE) for (const s of [1, 2, 3]) expect(sellValue(id, s)).toBe(Math.max(1, Math.floor(valueOf(id, s) / 2)));
    expect(sellValue(ITEMS.temper)).toBe(1);
    expect(at3((s) => sellValue("temper", s))).toEqual([1, 3, 6]);
    expect([outputsAt("loom", 1), outputsAt("press", 3), outputsAt("temper", 2)]).toEqual([3, 1, 0]);
  });
});

describe("per-star benches: 1 star < 2 < 3 where 0.6.1a applies the number", () => {
  it("TEMPER burn 1/2/4 (estimate) and damage in 30 s", () => {
    expect(at3((s) => est(bench([["temper", 4, 3, s]])).burn)).toEqual(at3((s) => effectAt("temper", s).gate!.burn));
    expect(up(at3((s) => run(bench([["temper", 4, 3, s]])).sides[0].stats.damage))).toBe(true);
  });
  it("WHETSTONE flat +2/+4/+7 (estimate) and damage in 30 s", () => {
    const d = at3((s) => est(bench([["whetstone", 4, 3, s]])).dmg);
    expect(d[1] - d[0]).toBeCloseTo(2);
    expect(d[2] - d[0]).toBeCloseTo(5);
    expect(up(at3((s) => run(bench([["whetstone", 4, 3, s]])).sides[0].stats.damage))).toBe(true);
  });
  it("GREASE speed 1.6/2.3/3.1: downstream belt speed and a shorter trip", () => {
    const sp = at3((s) => { const bt = run(bench([["grease", 4, 4, s]]), 5); return bt.sides[0].routes[0].speedAt[3]; });
    expect(sp).toEqual([1.6, 2.3, 3.1]);
    expect(down(at3((s) => est(bench([["grease", 4, 4, s]])).time))).toBe(true);
  });
  // 0.6.1f: the deeper slow (0.31/0.22) starved the turret; the merge now pays in friction heat, not belt time
  it("BRAKE speed 0.5 at every star (the same seconds on the belt); HOT SHOE +2 and RED-HOT SHOE +5 flat; damage in 30 s", () => {
    const t = at3((s) => est(bench([["brake", 4, 4, s]])).time);
    expect([t[1], t[2]]).toEqual([t[0], t[0]]);
    expect(t[0]).toBeGreaterThan(est(bench([])).time); // still a slow
    const d = at3((s) => est(bench([["brake", 4, 4, s]])).dmg);
    expect(d[1] - d[0]).toBeCloseTo(2);
    expect(d[2] - d[0]).toBeCloseTo(5);
    expect(up(at3((s) => run(bench([["brake", 4, 4, s]])).sides[0].stats.damage))).toBe(true);
  });
  it("OVERDRIVE speed 3/4/5 (AFTERBURNER's +3 flat: arsenal.modules.test.ts)", () => {
    const sp = at3((s) => run(bench([["overdrive", 4, 4, s]]), 5).sides[0].routes[0].speedAt[3]);
    expect(sp).toEqual([3, 4, 5]);
    expect(down(at3((s) => est(bench([["overdrive", 4, 4, s]])).time))).toBe(true);
  });
  it("LONG HAUL +1/+2/+3.5 per prior gate (priorCap: arsenal.modules.test.ts)", () => {
    const d = at3((s) => est(bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, s]])).dmg);
    expect(up(d)).toBe(true);
    expect(d[1] - d[0]).toBeCloseTo(effectAt("longhaul", 2).gate!.perPriorGate! - effectAt("longhaul", 1).gate!.perPriorGate!);
    expect(up(at3((s) => run(bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, s]])).sides[0].stats.damage))).toBe(true);
  });
  it("SPLITTER CLEAN CUT 72% at 2 stars; PERFECT CUT 85% at 3 stars, still 2 copies (0.6.1f: no third copy to jam)", () => {
    const tot = at3((s) => { const e = est(bench([["splitter", 4, 3, s]])); return e.copies * e.dmg; });
    expect(up(tot)).toBe(true);
    expect(at3((s) => est(bench([["splitter", 4, 3, s]])).copies)).toEqual([2, 2, 2]);
  });
  // 0.6.1p: the stall seconds and SPARK JUMP are applied; this barge never fires, so a stall can't change the
  // damage it takes (the stall benches are in tests/arsenal.modules.test.ts)
  it("GALVANIC COIL on the barge: 2 and 3 stars deal the same damage as 1", () => {
    const d = at3((s) => run(bench([["coil", 4, 3, s]])).sides[0].stats.damage);
    expect(new Set(d).size).toBe(1);
  });
  it("STAMP PRESS interval 1.4/1.1/1.0: slugs stamped in 30 s (the dies: arsenal.modules.test.ts)", () => {
    const made = at3((s) => {
      const b = bench([], [], false);
      b.items.push({ uid: 7, def: "press", x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
      b.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
      return run(b).sides[0].factories.find((f) => f.uid === 7)!.produced;
    });
    expect(up(made)).toBe(true);
  });
  it("EXT. CHAMBER per shot 2/2/3 (WIDE BREECH's window: arsenal.modules.test.ts)", () => {
    const per = at3((s) => new Battle(bench([], [["chamber", s]]), barge(), 1).sides[0].turrets[0].perShot);
    expect(per).toEqual([2, 2, 3]);
  });
  it("CALIBRATION fire interval x0.75/x0.58/x0.46", () => {
    const iv = at3((s) => new Battle(bench([], [["calibrate", s]]), barge(), 1).sides[0].turrets[0].interval);
    expect(iv.map((v) => +v.toFixed(4))).toEqual([0.75, 0.58, 0.46]);
  });
  it("no stars draw from the battle RNG: a 1-star deck with the field absent fights like 0.6.0", () => {
    const a = run(bench([["temper", 4, 3, 1]]));
    const b = run(JSON.parse(JSON.stringify(bench([["temper", 4, 3, 1]]))) as Build);
    expect(a.sides[0].stats.damage).toBe(b.sides[0].stats.damage);
    expect(bench([["temper", 4, 3, 1]]).items[1]).not.toHaveProperty("stars");
  });
});
