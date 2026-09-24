// 0.6.1a: stars in the data model and the sim (stars.ts). Per-star benches (task item 20): for every
// star number the 0.6.1a sim applies, 1 star < 2 < 3 on the module's headline metric, on a fixed deck.
// Values stored in ItemDef.levels[n].pending are not applied yet (REPORT.md "pending perks").
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { ITEMS, sellValue } from "../src/sim/content";
import { estimateRoute, key, type Build } from "../src/sim/deck";
import { effectAt, FUSE_MAX, fusible, outputsAt, pendingAt, perkAt, starsOf, valueOf } from "../src/sim/stars";

const LIVE = ["temper", "whetstone", "grease", "brake", "longhaul", "coil", "splitter", "overdrive", "press", "chamber", "calibrate"];
const K = key;

/** Furnace bench: the Kiln at (4,6) on a straight 6-tile route to column 4; gates by [def, x, y, stars]. */
function bench(gates: [string, number, number, number][], mods: [string, number][] = [], kilnRoute = true): Build {
  const b: Build = {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
    routes: kilnRoute ? [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] : [],
    mods: [], beltCap: 30, hullBonus: 5000,
  };
  let uid = 10;
  for (const [def, x, y, s] of gates) b.items.push({ uid: uid++, def, x, y, ...(s > 1 ? { stars: s } : {}) });
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
    expect(effectAt("temper", 2).gate).toEqual({ burn: 4 });
    expect(effectAt("temper", 3).gate).toEqual({ burn: 7 });
    expect(effectAt("press", 3).factory).toEqual({ ammo: "plain", interval: 1, outputs: 1 });
    expect(effectAt("chamber", 3).mod).toEqual({ perShot: 3 });
    expect(effectAt("splitter", 3).gate).toEqual({ split: { copies: 2, mult: 0.72 } }); // THREE-WAY pending
    expect(ITEMS.temper.gate).toEqual({ burn: 2 }); // the 1-star spec is untouched
    expect(() => effectAt("nope", 2)).toThrow();
  });
  it("every fusible live module carries 2- and 3-star levels; pending values and perks are stored", () => {
    for (const id of LIVE) expect(ITEMS[id].levels?.[2] && ITEMS[id].levels?.[3], id).toBeTruthy();
    expect(pendingAt("longhaul", 2)).toEqual({ priorCap: 6 });
    expect(pendingAt("coil", 3)).toEqual({ shock: 2.8, jump: 1 });
    expect(pendingAt("overdrive", 3)).toEqual({ flat: 3 });
    expect(pendingAt("press", 2)).toEqual({ base: 5 });
    expect(pendingAt("chamber", 2)).toEqual({ window: 1 });
    expect(pendingAt("splitter", 3)).toEqual({ copies: 3, mult: 0.57 });
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
  it("TEMPER burn 2/4/7 (estimate) and damage in 30 s", () => {
    expect(at3((s) => est(bench([["temper", 4, 3, s]])).burn)).toEqual([2, 4, 7]);
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
  it("BRAKE speed 0.5/0.31/0.22: more seconds on the belt", () => {
    expect(up(at3((s) => est(bench([["brake", 4, 4, s]])).time))).toBe(true);
  });
  it("OVERDRIVE speed 3/4/5 (AFTERBURNER's +3 flat is pending)", () => {
    const sp = at3((s) => run(bench([["overdrive", 4, 4, s]]), 5).sides[0].routes[0].speedAt[3]);
    expect(sp).toEqual([3, 4, 5]);
    expect(down(at3((s) => est(bench([["overdrive", 4, 4, s]])).time))).toBe(true);
  });
  it("LONG HAUL +2/+4/+7 per prior gate (priorCap is pending)", () => {
    const d = at3((s) => est(bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, s]])).dmg);
    expect(up(d)).toBe(true);
    expect(d[1] - d[0]).toBeCloseTo(2);
    expect(up(at3((s) => run(bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, s]])).sides[0].stats.damage))).toBe(true);
  });
  it("SPLITTER CLEAN CUT 72% at 2 stars; 3 stars = 2 stars until THREE-WAY lands", () => {
    const tot = at3((s) => { const e = est(bench([["splitter", 4, 3, s]])); return e.copies * e.dmg; });
    expect(tot[0]).toBeLessThan(tot[1]);
    expect(tot[2]).toBe(tot[1]);
    expect(at3((s) => est(bench([["splitter", 4, 3, s]])).copies)).toEqual([2, 2, 2]);
  });
  it("GALVANIC COIL: shock seconds and SPARK JUMP are pending, so 2 and 3 stars fight like 1", () => {
    const d = at3((s) => run(bench([["coil", 4, 3, s]])).sides[0].stats.damage);
    expect(new Set(d).size).toBe(1);
  });
  it("STAMP PRESS interval 1.4/1.1/1.0: slugs stamped in 30 s (the base damage is pending)", () => {
    const made = at3((s) => {
      const b = bench([], [], false);
      b.items.push({ uid: 7, def: "press", x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
      b.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
      return run(b).sides[0].factories.find((f) => f.uid === 7)!.produced;
    });
    expect(up(made)).toBe(true);
  });
  it("EXT. CHAMBER per shot 2/2/3 (WIDE BREECH's window is pending)", () => {
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
