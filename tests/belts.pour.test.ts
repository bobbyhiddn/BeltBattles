// bb-0.8.3 (REQ-BFG-042, job BELTS D3-D4): a belt adds reach, not firepower. A factory deals its slugs one belt at a time
// (Battle.stamp, round-robin), so more belts spread the same slugs over more guns; a pour factory pours its pour size at
// a time (TWIN MOULD 2 / 2 / 3, the CRUCIBLE 2, a ★3 MIMIC FORGE on FOUNDRY 2), the same as 0.8.0 onto no more belts than
// that, and onto more takes that many of them in turn (rule R, races/foundry.ts pourAll). A ★1-2 MIMIC on FOUNDRY stamps
// one blank a cycle in turn (no pour) and never fuses with itself. The forecast (battle.ts loadsPerStamp, the STOKER cap's
// loads per stamp), the rating (deckRating.ts beltShare) and the build screen's estimate (deck.ts loadEvery) agree with
// the sim.
import { describe, expect, it } from "vitest";
import { ITEMS, TICK, type HeroId } from "../src/sim/content";
import { loadEvery, routeInfo, type Build } from "../src/sim/deck";
import { effectAt, isSignatureFactory, outputsAt, pourAt, starField } from "../src/sim/stars";
import { loadsPerStamp } from "../src/sim/battle";
import { beltShare } from "../src/sim/deckRating";
import { K, tally, wideDeck } from "./belts.helpers";

const SECS = 30;
const ROUND_ROBIN = Object.values(ITEMS).filter((d) => d.kind === "factory" && !isSignatureFactory(d.id) && !d.factory!.pour).map((d) => d.id);
/** bb-0.8.3 (D2): the signature factories that feed their belts in turn, each on its own hero (the CRUCIBLE pours). */
const SIG_ROUND_ROBIN = [["furnace", "kiln"], ["weaver", "loom"], ["bastion", "wardworks"], ["metronome", "clockworks"], ["siphon", "sump"]] as const;

/** FOUNDRY at (4,6): factory `def` (uid 7, at `stars`) with `belts` of these, the CRUCIBLE parked at (0,8) unless it is
 *  `def`. A1 into column 2 and A2 into column 3 (gun 0, both 9 tiles: their blanks of one pour arrive together), B into
 *  column 6 (gun 1, 7 tiles). LONG15 / LONG13: into column 3 with 15 / 13 tiles, a delay line 6 / 4 tiles longer than
 *  A1 (2.4 / 1.6 s of ride: a ★1 / ★2 MIMIC's next blank on A1 reaches gun 0 0.16 / 0 s after this one). */
const A1 = [K(3, 7), K(2, 7), K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0)];
const A2 = [K(3, 6), K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(3, 0)];
const B = [K(6, 6), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)];
const LONG15 = [K(3, 6), K(3, 5), K(4, 5), K(5, 5), K(6, 5), K(7, 5), K(7, 4), K(7, 3), K(6, 3), K(5, 3), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(3, 0)];
const LONG13 = [K(3, 6), K(3, 5), K(4, 5), K(5, 5), K(6, 5), K(6, 4), K(6, 3), K(5, 3), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(3, 0)];
function foundry(def: string, stars: number, belts: number[][]): Build {
  return {
    hero: "foundry",
    items: [...(def === "crucible" ? [] : [{ uid: 1, def: "crucible", x: 0, y: 8 }]), { uid: 7, def, x: 4, y: 6, ...starField(stars) }],
    routes: belts.map((cells) => ({ factory: 7, cells: [...cells] })), mods: [], beltCap: 60, hullBonus: 5000,
  };
}

describe("D4: round-robin factories: the same deck at 1, 2, 3 and 4 belts stamps the same slugs", () => {
  it("every factory that doesn't pour, at ★3 (4 belt slots; GANTRY PRESS, the LOOM 5): bought ones on the WEAVER, signatures on their hero", () => {
    expect(ROUND_ROBIN).toHaveLength(14);
    const report: string[] = [];
    const cases: (readonly [HeroId, string])[] = [...ROUND_ROBIN.map((def) => ["weaver", def] as const), ...SIG_ROUND_ROBIN];
    for (const [hero, def] of cases) {
      const spec = effectAt(def, 3).factory!, batch = spec.batch ?? 1;
      const slots = outputsAt(def, 3), one = tally(wideDeck(hero, def, 3, 1, 5000), 7, SECS);
      let reached = 0;
      for (let n = 1; n <= slots; n++) {
        const b = wideDeck(hero, def, 3, n, 5000), t = n === 1 ? one : tally(b, 7, SECS);
        // METRONOME's and SIPHON's starting layouts connect 2 of these belts: their factories are read at those
        if (!b.routes.every((_, ri) => routeInfo(b, ri).connected)) break;
        reached = n;
        // one stamp a cycle (a batch: its slugs), wherever its belts go: never more than one slug a tick, never more than
        // one cycle's slugs a cycle (its first at 0.35 s), and the same slugs at every belt count but for stall relief: a
        // belt that backs up stalls the cycle (a DOUBLE STAMP's batch into one gun), and another belt takes those slugs
        // the battle's own cycle (a MIMIC FORGE: the hero factory's interval x its intervalMul, Battle.factoryDef)
        const cycle = t.bt.sides[0].factories.find((x) => x.uid === 7)!.def.factory!.interval;
        const cycles = Math.floor((SECS - 0.35) / cycle) + 1;
        // (a batch's last waiting slug and the next cycle's first may leave on one tick, onto two belts)
        expect(t.maxPerTick, def).toBeLessThanOrEqual(batch > 1 ? 2 : 1);
        expect(t.produced, `${def}: ${n} belts`).toBeGreaterThanOrEqual(one.produced - batch);
        expect(t.produced, `${def}: ${n} belts (1 belt stalled ${one.stalled.toFixed(2)} s)`).toBeLessThanOrEqual(cycles * batch);
        if (one.stalled === 0) expect(t.produced, `${def}: ${n} belts`).toBe(one.produced);
        // dealt in turn: every belt within a batch of the others (DOUBLE STAMP, SHOT TOWER: their batch leaves one by one)
        expect(Math.max(...t.perRoute) - Math.min(...t.perRoute), `${def}: ${n} belts ${t.perRoute}`).toBeLessThanOrEqual(batch);
        report.push(`${def} ${n}: ${t.produced}${t.stalled ? ` (${t.stalled.toFixed(1)} s stalled)` : ""}`);
      }
      expect(reached, `${def} on ${hero}: belts into its guns`).toBeGreaterThanOrEqual(def === "clockworks" || def === "sump" ? 2 : slots);
    }
    console.log(`round-robin at 1-4 belts (${SECS} s): ${report.join("; ")}`);
  });
});

describe("D4: pour factories pour their pour size; past it, rule R takes the belts in turn", () => {
  it("TWIN MOULD: pour 2 / 2 / 3; with more belts than its pour it keeps 0.8.0's slugs a cast, each belt pour / belts of the casts", () => {
    expect([1, 2, 3].map((s) => pourAt("twinmould", s))).toEqual([2, 2, 3]);
    for (const [s, at, more] of [[2, 2, 3], [3, 3, 4]] as const) {
      const today = tally(wideDeck("weaver", "twinmould", s, at, 5000), 7, SECS);
      const wide = tally(wideDeck("weaver", "twinmould", s, more, 5000), 7, SECS);
      expect([today.stalled, wide.stalled], `★${s}`).toEqual([0, 0]);
      expect(wide.casts, `★${s}`).toBe(today.casts); // the same cycle
      expect(wide.produced, `★${s}: ${more} belts`).toBe(today.produced); // 0.8.0's slugs (its pour at `at` belts)
      expect(today.produced, `★${s}`).toBe(at * today.casts); // onto no more belts than its pour: one each, as 0.8.0
      expect(wide.maxPerTick, `★${s}`).toBe(at);
      for (const c of wide.perRoute) expect(Math.abs(c - (wide.casts * at) / more), `★${s}: ${wide.perRoute}`).toBeLessThanOrEqual(1);
    }
    // ★1: its 2 slots are its pour: 2 belts get a slug each a cast, as 0.8.0 (1 belt: 1 a cast)
    const one = tally(wideDeck("weaver", "twinmould", 1, 1, 5000), 7, SECS), two = tally(wideDeck("weaver", "twinmould", 1, 2, 5000), 7, SECS);
    expect([one.produced, two.produced]).toEqual([one.casts, 2 * two.casts]);
  });

  it("the CRUCIBLE with 3 belts pours 2 a cast, taking its belts in turn, and still fuses a pair in one chamber", () => {
    expect(pourAt("crucible", 1, "blank")).toBe(2);
    const two = tally(foundry("crucible", 1, [A1, A2]), 7, SECS), three = tally(foundry("crucible", 1, [A1, A2, B]), 7, SECS);
    expect([two.stalled, three.stalled]).toEqual([0, 0]);
    expect(three.casts).toBe(two.casts);
    expect([two.produced, three.produced]).toEqual([2 * two.casts, 2 * three.casts]); // 2 blanks a cast, at 2 belts and 3
    expect(three.maxPerTick).toBe(2);
    // at 2 belts every pour fuses at gun 0; at 3, the pours that take A1 and A2 together (one in three) still do
    expect(two.fusions).toBeGreaterThanOrEqual(two.casts - 2);
    expect(three.fusions).toBeGreaterThan(0);
    expect(Math.abs(three.fusions - three.casts / 3)).toBeLessThanOrEqual(2);
    for (const c of three.perRoute) expect(Math.abs(c - (2 * three.casts) / 3)).toBeLessThanOrEqual(1);
    console.log(`CRUCIBLE: 2 belts ${two.casts} pours, ${two.fusions} fusions; 3 belts (2 into gun 0, 1 into gun 1) ${three.casts} pours, ${three.fusions} fusions`);
  });

  it("MIMIC FORGE on FOUNDRY: below ★3 one blank a cycle in turn (0.8.0's rate at 1 belt) and never fused with its own; ★3 pours 2", () => {
    for (const s of [1, 2]) {
      expect(pourAt("mimic", s, "blank"), `★${s}`).toBe(0);
      const one = tally(foundry("mimic", s, [A1]), 7, SECS), two = tally(foundry("mimic", s, [A1, A2]), 7, SECS);
      expect([one.stalled, two.stalled]).toEqual([0, 0]);
      expect(two.produced, `★${s}`).toBe(one.produced); // 0.8.0 had one output: the same blanks
      expect([two.maxPerTick, two.fusions], `★${s}`).toEqual([1, 0]);
      // a delay line: its blanks on the longer belt meet the next ones on the shorter at gun 0 within the sync window,
      // yet they never fuse (a blank stamped alone never fuses with its own factory's; races/foundry.ts tryFuse)
      const delay = tally(foundry("mimic", s, [s === 1 ? LONG15 : LONG13, A1]), 7, SECS);
      expect([delay.produced > 6, delay.fusions], `★${s} delay line`).toEqual([true, 0]);
    }
    // ★3 TWIN SIGNET on FOUNDRY: a pour of 2 blanks (2 belts: one each, fused at gun 0); on another hero it stamps in turn
    expect([pourAt("mimic", 3, "blank"), pourAt("mimic", 3, "cinder"), pourAt("mimic", 3, "thread")]).toEqual([2, 0, 0]);
    const t3 = tally(foundry("mimic", 3, [A1, A2]), 7, SECS);
    expect([t3.maxPerTick, t3.produced]).toEqual([2, 2 * t3.casts]);
    expect(t3.fusions).toBeGreaterThanOrEqual(t3.casts - 4); // every pour fuses (the last few still on their belts)
    const t4 = tally(foundry("mimic", 3, [A1, A2, B]), 7, SECS);
    expect([t4.casts, t4.produced]).toEqual([t3.casts, 2 * t3.casts]); // rule R: 2 a cast over 3 belts
    const w3 = tally(wideDeck("weaver", "mimic", 3, 4, 5000), 7, SECS);
    expect(w3.maxPerTick).toBe(1); // on the WEAVER a ★3 MIMIC feeds its 4 belts in turn
  });
});

describe("D4: the forecast, the rating and the build screen's estimate agree with the sim", () => {
  /** Each case: a deck, the factory's battle spec (after Battle.factoryDef), its belts and their guns; the sim's tally. */
  const cases = (): { id: string; b: Build }[] => [
    ...[1, 2, 3, 4].map((n) => ({ id: `press ★3 ${n}`, b: wideDeck("weaver", "press", 3, n, 5000) })),
    ...[1, 2, 3, 4].map((n) => ({ id: `hotswap ★3 ${n}`, b: wideDeck("weaver", "hotswap", 3, n, 5000) })),
    ...[1, 2].map((n) => ({ id: `twinmould ★1 ${n}`, b: wideDeck("weaver", "twinmould", 1, n, 5000) })),
    ...[2, 3].map((n) => ({ id: `twinmould ★2 ${n}`, b: wideDeck("weaver", "twinmould", 2, n, 5000) })),
    ...[3, 4].map((n) => ({ id: `twinmould ★3 ${n}`, b: wideDeck("weaver", "twinmould", 3, n, 5000) })),
    { id: "crucible 2", b: foundry("crucible", 1, [A1, A2]) }, { id: "crucible 3", b: foundry("crucible", 1, [A1, A2, B]) },
    { id: "mimic ★1 2 (FOUNDRY)", b: foundry("mimic", 1, [A1, A2]) }, { id: "mimic ★3 2 (FOUNDRY)", b: foundry("mimic", 3, [A1, A2]) },
    { id: "mimic ★3 3 (FOUNDRY)", b: foundry("mimic", 3, [A1, A2, B]) },
  ];

  it("loadsPerStamp (the STOKER cap's forecast): the loads one cast sends into each gun, a fused pair once", () => {
    for (const { id, b } of cases()) {
      const t = tally(b, 7, SECS);
      const f = t.bt.sides[0].factories.find((x) => x.uid === 7)!;
      const guns = new Map<number, number[]>();
      b.routes.forEach((_, ri) => { const g = routeInfo(b, ri).turret; guns.set(g, [...(guns.get(g) ?? []), ri]); });
      for (const [g, belts] of guns) {
        const forecast = loadsPerStamp(f.def.factory!, b.routes.length, belts.length) * t.casts;
        // what the casts sent down the belts into that gun, a fused pair counted once (each fusion takes one blank)
        const sent = belts.reduce((s, ri) => s + t.perRoute[ri], 0) - (t.fused.get(g) ?? 0);
        expect(Math.abs(sent - forecast), `${id}: gun ${g} sent ${sent}, forecast ${forecast.toFixed(1)}`).toBeLessThanOrEqual(f.def.factory!.ammo === "blank" ? 3 : 1.01);
      }
    }
  });

  it("beltShare (the rating) and loadEvery (the build screen): each belt's slugs a cast and its seconds between loads", () => {
    for (const { id, b } of cases()) {
      const t = tally(b, 7, SECS);
      const f = b.items.find((p) => p.uid === 7)!, spec = effectAt(f.def, f.stars ?? 1).factory!;
      const fs = t.bt.sides[0].factories.find((x) => x.uid === 7)!.def.factory!;
      const n = b.routes.length, batch = fs.batch ?? 1;
      b.routes.forEach((_, ri) => {
        // the build screen: its seconds between loads on each belt, as slugs over the casts (to within one slug)
        const every = loadEvery(b, ri), fromEvery = (t.casts * fs.interval * batch) / (every * batch);
        expect(Math.abs(t.perRoute[ri] - fromEvery), `${id}: belt ${ri}: ${t.perRoute[ri]} slugs, loadEvery ${every} says ${fromEvery.toFixed(1)}`).toBeLessThanOrEqual(1.01);
        // the rating: a TWIN MOULD's and every stamping factory's share is the sim's; the CRUCIBLE's (and a ★3 MIMIC's on
        // FOUNDRY, rated by its own spec) is 0.8.0's one load a cycle over its belts: a fused pair once
        if (fs.ammo !== "blank") {
          expect(Math.abs(t.perRoute[ri] - t.casts * beltShare(spec, n) * batch), `${id}: belt ${ri}: ${t.perRoute[ri]}, rated ${beltShare(spec, n)} a cast`).toBeLessThanOrEqual(1.01);
        } else expect(beltShare(spec, n) * n, id).toBeCloseTo(1, 9);
      });
    }
    expect(TICK).toBeCloseTo(1 / 60, 9);
  });
});
