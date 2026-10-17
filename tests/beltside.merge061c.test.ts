// beltside-062c (ref/BRIEF-beltside-merge-061c.md, "New tests"): how 0.6.1c's factories and road items meet rigs
// (ref/DESIGN-beltside.md §12, P7-P10; P11 is in tests/inspectorLines.test.ts), and MERGE-061's day-1 shop probe.
// Every expected number is written out from the catalogue (content.ts), never recomputed with the code under test.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Battle } from "../src/sim/battle";
import { AMMO, BELT_SPEED, ITEMS, RULES_VERSION, TICK, withWave3 } from "../src/sim/content"; // Y7b2 (the flip): GUARD_FREEZE, GUARD_SLOW dropped with P8's guard flags
import { withSustain } from "../src/sim/content"; // FLIP-X2: the 062b history check runs with the sustain pieces out
import { DORMANT_ITEMS } from "../src/sim/races/data"; // FLIP-X2: ... and with SIFTER not dormant (in062b below)
import { hitsOfRig, key as K, payloadDamage, rigHits, rotField, walkRoute, type Build, type Placed } from "../src/sim/deck";
import { migrateInlineGates, rotFacing } from "../src/sim/beltside";
import { effectAt } from "../src/sim/stars";
import { beltKind, hitLabel } from "../src/screens/build/inspector";
import { routeProblems } from "../src/game/routeCheck";
import { beltsideRun } from "../src/game/save";
import { EVENTS, salvagePool, smugglerPool, type EventId } from "../src/game/eventDefs";
import { choicesFor, makeEvent } from "../src/game/events";
import { newRun } from "../src/game/run";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { decodeSnapshot, encodeSnapshot } from "../src/net/snapshot";
import { validateBuild } from "../src/net/validate";
import type { GhostSnapshot } from "../src/game/ghostSnapshot";
import { barge, factoryBench, gantryWeaver, SEED } from "./arsenal.bench";
import { roadDraws, type RoadDraws } from "./beltside.roadDraws";
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): P8's walk with the switch off
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: the 062b history check runs with shapes off (in062b)
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: and with the six more shaped rigs off (in062b)
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: and with the six plain stat rigs off (in062b)

const J = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const st = (s: number) => (s > 1 ? { stars: s } : {});
/** A rig at (x, y) whose FIRST arrow points in absolute direction `dir` (0 up, 1 east, 2 down, 3 west). */
const rig = (uid: number, def: string, x: number, y: number, dir: 0 | 1 | 2 | 3, stars = 1): Placed =>
  ({ uid, def, x, y, ...rotField(def, rotFacing(def, dir)), ...st(stars) });

// ---------------------------------------------------------------- P7: ASSEMBLY LINE and rigs

/**
 * The Kiln's belt up column 4, and factory `f` at (6,6) with its belt up column 6 (then (5,1), (5,0): the heavy
 * turret's second intake). A LONG HAUL (II, rot 0) at (5,3) works both belts, one arrow each: west on the Kiln's (4,3)
 * (tile 2), east on the factory's (6,3) (tile 2). A WHETSTONE works the Kiln's (4,4) only, another the factory's (6,4)
 * only (both tile 1, the LONG HAUL's one prior hit), and a TEMPER at (0,9) is IDLE (its arrow points at empty deck).
 */
function p7(f: string, stars: number): Build {
  return {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 5000,
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: f, x: 6, y: 6, ...st(stars) },
      { uid: 10, def: "longhaul", x: 5, y: 3 }, rig(11, "whetstone", 3, 4, 1), rig(12, "whetstone", 7, 4, 3), rig(13, "temper", 0, 9, 0),
    ],
    routes: [
      { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)] },
    ],
  };
}
const commission = (b: Build) => new Battle(b, barge(), SEED).sides[0].gates.map((g) => [g.uid, +g.commissionAt.toFixed(9), g.hotUntil]);

describe("P7: ASSEMBLY LINE and rigs", () => {
  // Y7b2 (the flip): Y3's ASSEMBLY LINE: its own belt's rigs take the same factor as every rig (they were online at 0 s, so
  // one arrow there brought a rig online at 0 s) and ★3 HOT START is gone (no hotUntil: was 4 on the LONG HAUL and the
  // Assembly's WHETSTONE). Was "one arrow on an Assembly Line's belt brings the rig online at 0 s; a Kiln-only rig at its
  // scaled time; an IDLE rig never"
  it("every rig on an Assembly Line's deck comes online at its scaled time, on its belt too; an IDLE rig never", () => {
    const b = p7("assembly", 1);
    expect(routeProblems(b)).toEqual([]);
    expect(hitsOfRig(b, 10).map((h) => [h.route, h.cell])).toEqual([[0, K(4, 3)], [1, K(6, 3)]]);
    expect([11, 12, 13].map((u) => hitsOfRig(b, u).map((h) => h.cell))).toEqual([[K(4, 4)], [K(6, 4)], []]);
    // no Assembly Line (a STAMP PRESS in its place): BELTSIDE's per-route rule, the earliest route wins. The LONG HAUL
    // is the second rig on both belts (1.2 + 0.6 s), each WHETSTONE the first on its belt (1.2 s)
    expect(commission(p7("press", 1))).toEqual([[10, 1.8, undefined], [11, 1.2, undefined], [12, 1.2, undefined], [13, Infinity, undefined]]);
    // ASSEMBLY LINE x0.5 / x0.25 / x0 (catalogue): the LONG HAUL is online at 0 s (one arrow on its belt; the Kiln's
    // belt alone would give it 1.8 x f), the Kiln-only WHETSTONE at 1.2 x f; ★3 HOT START (4 s) on the whole rig
    // Y7b2 (the flip): the LONG HAUL (second rig on both belts) at 1.8 x f and each WHETSTONE (first on its belt) at 1.2 x f;
    // no hotUntil. Were [[10, 0, undefined], [11, 0.6, undefined], [12, 0, undefined], ...], [[10, 0, undefined], [11, 0.3,
    // undefined], [12, 0, undefined], ...] and [[10, 0, 4], [11, 0, undefined], [12, 0, 4], ...]
    expect(commission(p7("assembly", 1))).toEqual([[10, 0.9, undefined], [11, 0.6, undefined], [12, 0.6, undefined], [13, Infinity, undefined]]);
    expect(commission(p7("assembly", 2))).toEqual([[10, 0.45, undefined], [11, 0.3, undefined], [12, 0.3, undefined], [13, Infinity, undefined]]);
    expect(commission(p7("assembly", 3))).toEqual([[10, 0, undefined], [11, 0, undefined], [12, 0, undefined], [13, Infinity, undefined]]);
    // in the battle: the time of each rig's "commission" event; the IDLE rig never has one
    // Y7b2 (the flip): `haul` is the LONG HAUL's time, 1.8 x f (was 0)
    for (const [s, whet, haul] of [[1, 0.6, 0.9], [2, 0.3, 0.45], [3, 0, 0]] as const) {
      const bt = new Battle(p7("assembly", s), barge(), SEED);
      const on = new Map<number, number>();
      while (bt.t < 20 && !bt.over) {
        bt.step();
        for (const e of bt.drainEvents()) if (e.type === "commission" && e.side === 0) on.set(e.gate, bt.t);
      }
      // Y7b2 (the flip): each on the tick of its scaled time (the first tick at ★3); both were toBeCloseTo(TICK, 9)
      expect(on.get(10), `${s}`).toBeCloseTo(Math.max(haul, TICK), 9);
      expect(on.get(12), `${s}`).toBeCloseTo(Math.max(whet, TICK), 9);
      const late = on.get(11)! - Math.max(whet, TICK);
      expect(late >= -1e-9 && late < TICK + 1e-9, `${s}: ${on.get(11)}`).toBe(true);
      expect(on.has(13), `${s}`).toBe(false);
      expect(bt.sides[0].gates.find((g) => g.uid === 13)!.online).toBe(false);
    }
  });

  // Y7b2 (the flip): the test "★3 HOT START overclocks both arrows of the rig (on either belt) for the first 4 s, then not;
  // never at ★1/★2" is deleted: ★3 HOT START is gone (Y3)
});

// ---------------------------------------------------------------- P8: SLAG rides at its fixed speed

/** SLAG POT (★pot) alone on the factory bench's second intake (the Kiln off its route; tiles 0-6: (6,5), (5,5) .. (5,0)),
 *  rig `speed` (★stars) at (4,3) working tile 3 (5,3) from the west (an X works only that tile too: the Kiln's column
 *  is empty deck), and a TEMPER at (6,2) working tile 4 (5,2) from the east. */
function slag(speed: string | null, stars = 1, pot = "slagpot"): Build {
  const b = factoryBench(pot, 1, { only: true });
  if (speed) b.items.push(rig(20, speed, 4, 3, 1, stars));
  b.items.push(rig(21, "temper", 6, 2, 3));
  return b;
}
const SPEEDS: [string, number][] = [1, 2, 3].flatMap((s) => [["brake", s], ["grease", s], ["overdrive", s]] as [string, number][]);
/** The flat part of a speed rig's effect, from the catalogue: OVERDRIVE ★3 AFTERBURNER +30; beltside-062-on-061 (DESIGN §13
 *  P13): 0.6.1f's BRAKE ★2 HOT SHOE +20 and ★3 RED-HOT SHOE +50, mixed effects like AFTERBURNER. The rest have none. */
// 0.8.0 B1 M2 (oracle 1cd5224fab866da2 (A)): REDLINE (OVERDRIVE ★2) adds +10, which slag keeps as it keeps AFTERBURNER's +30
// NUM-1 (REQ-BFG-047): the damage family x10 (was 1, 3, 2, 5)
// Y7b2 (the flip): no speed rig has a flat part now (OVERDRIVE ★2/★3's REDLINE and AFTERBURNER flats are gone, Y2, and BRAKE
// ★2/★3's HOT SHOE and RED-HOT SHOE flats, Y3): was { "overdrive 2": 10, "overdrive 3": 30, "brake 2": 20, "brake 3": 50 }
const FLAT: Record<string, number> = {};
const flatOf = (def: string, s: number): number => FLAT[`${def} ${s}`] ?? 0;

describe("P8: SLAG rides at its fixed 0.75x", () => {
  it("the decks: the speed rig works tile 3 only, the TEMPER tile 4 only", () => {
    for (const [def] of SPEEDS.slice(0, 3)) {
      const b = slag(def);
      expect(routeProblems(b)).toEqual([]);
      expect([hitsOfRig(b, 20).map((h) => h.tile), hitsOfRig(b, 21).map((h) => h.tile)], def).toEqual([[3], [4]]);
    }
    expect(AMMO.slag.fixedSpeed).toBe(0.75);
  });

  it("in the battle a BRAKE, GREASE or OVERDRIVE rig leaves slag at 0.75x (the tile's speed state still changes), every other part applies", () => {
    const probe = (b: Build) => {
      const bt = new Battle(b, barge(), SEED);
      const r = bt.sides[0].routes[0];
      const last = new Map<number, number>(), v = new Set<number>(), flat = new Set<number>(), burn = new Set<number>();
      let processed = 0, produced = -1, loaded = -1;
      while (bt.t < 20 && !bt.over) {
        bt.step();
        for (const e of bt.drainEvents()) {
          if (e.side !== 0) continue;
          if (e.type === "process" && e.gate === 20) processed++;
          if (e.type === "produce" && produced < 0) produced = bt.t;
          if (e.type === "load" && loaded < 0) loaded = bt.t;
        }
        for (const a of r.ammo) {
          const prev = last.get(a.p.id);
          if (prev !== undefined && !a.blocked && a.s > prev) v.add(+((a.s - prev) / TICK).toFixed(6));
          last.set(a.p.id, a.s);
          if (a.processed >= 4) {
            flat.add(a.p.flat);
            burn.add(a.p.burn);
          }
        }
      }
      return { v: [...v], flat: [...flat], burn: [...burn], processed, travel: loaded - produced, speedAt: r.speedAt[3], guard: r.guard };
    };
    const none = probe(slag(null));
    expect(none.v).toEqual([BELT_SPEED * 0.75]);
    for (const [def, s] of SPEEDS) {
      const o = probe(slag(def, s));
      const e = effectAt(def, s).gate!;
      expect(o.v, `${def} ★${s}: slag's speed on every tile`).toEqual([BELT_SPEED * 0.75]);
      expect(o.speedAt, `${def} ★${s}: the tile's state (for other payloads)`).toBe(e.speed);
      expect(o.travel, `${def} ★${s}: stamp to chamber`).toBeCloseTo(none.travel, 9);
      expect(o.processed, `${def} ★${s}: the rig still processes slag`).toBeGreaterThan(0);
      expect(o.burn, `${def} ★${s}: the TEMPER's Burn`).toEqual([effectAt("temper", 1).gate!.burn]);
      // beltside-062-on-061 (P13): BRAKE ★2/★3's flat applies to slag too (P8: only the speed part does nothing)
      // Y7b2 (the flip): no speed rig has a flat part (FLAT is empty), so 0 for each (the message named AFTERBURNER +30, HOT
      // SHOE +20, RED-HOT SHOE +50)
      expect(o.flat, `${def} ★${s}: no flat part`).toEqual([flatOf(def, s)]);
      // Y7b2 (the flip): no guard flags (was REDLINE's GUARD_SLOW and AFTERBURNER's GUARD_SLOW | GUARD_FREEZE from tile 3 on)
      expect(o.guard, `${def} ★${s}: no guard flags`).toEqual([0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it("in the walk slag keeps 0.75x under every speed rig: no row claims a speed change, the hit reads NO EFFECT ON SLAG, the TEMPER burns", () => {
    const none = walkRoute(slag(null), 0);
    expect([none.fixed, none.speedEnd, none.estimate.burn]).toEqual([0.75, 0.75, effectAt("temper", 1).gate!.burn]);
    for (const [def, s] of SPEEDS) {
      const w = walkRoute(slag(def, s), 0);
      const e = effectAt(def, s).gate!;
      expect(w.estimate.time, `${def} ★${s}`).toBeCloseTo(none.estimate.time, 12);
      expect([w.fixed, w.speedEnd, w.locked]).toEqual([0.75, 0.75, false]);
      expect(w.timeline.map((row) => [row.tile, row.speed])).toEqual([[3, 0.75], [4, 0.75]]);
      const h = w.timeline[0].hits.find((x) => x.uid === 20)!;
      expect([h.speed, h.won], `${def} ★${s}`).toEqual([e.speed, false]);
      // the inspector's belt timeline (inspector.ts: hitLabel(h, beltKind(w))). 0.6.2t (0b.4): on SLAG a speed hit
      // changes nothing and pays no locked bonus, so it reads NO EFFECT ON SLAG (it read "(LOCKED)"); an OVERDRIVE ★3
      // still adds its AFTERBURNER flat, and a BRAKE ★2/★3 its heat (P13), so those read their damage
      const flat = flatOf(def, s);
      expect(beltKind(w)).toBe("slag");
      expect(hitLabel(h, beltKind(w))).toBe(flat ? `${ITEMS[def].name} +${flat} DAMAGE, NO SPEED CHANGE ON SLAG` : `${ITEMS[def].name}: NO EFFECT ON SLAG`);
      expect(w.estimate.burn).toBe(effectAt("temper", 1).gate!.burn);
      expect(w.estimate.dmg).toBe(none.estimate.dmg + flat); // NUM-1: whole numbers, so exact (was toBeCloseTo(.., 9))
    }
    // the control (0.6.1c's own): a STAMP PRESS slug on the same belt does feel the rigs, and its speed hit wins its tile
    const press = (def: string | null) => walkRoute(slag(def, 1, "press"), 0);
    expect(press("brake").estimate.time).toBeGreaterThan(press(null).estimate.time);
    expect(press("grease").estimate.time).toBeLessThan(press(null).estimate.time);
    expect([press("brake").timeline[0].hits[0].won, press("brake").fixed, press("brake").speedEnd]).toEqual([true, undefined, 0.5]);
    // AZ-BUMP (the flip, LADDER_FIX): P13, the walk rides tick by tick, so stamp to chamber is whole ticks and slag's 0.75x
    // holds within a tick: slag 239 ticks (3.983 s), the press slug 179 (2.983 s; / 0.75 = 238.7 ticks); was exactly the
    // press slug's / 0.75 (the half cells' seconds), as it still is with LADDER_FIX off
    expect([none.estimate.time, press(null).estimate.time]).toEqual([239 * TICK, 179 * TICK]);
    expect(Math.abs(none.estimate.time - press(null).estimate.time / 0.75)).toBeLessThan(TICK);
    withLadderFix(() => expect(walkRoute(slag(null), 0).estimate.time).toBeCloseTo(press(null).estimate.time / 0.75, 9), false);
  });

  it("as in 0.6.1c, slag ignores the METRONOME speed lock and SIPHON's Drag, which hold other payloads (the silent check)", () => {
    /** Each route's per-tick speeds of unblocked payloads over `secs`, calling `each` before every tick. */
    const speeds = (bt: Battle, secs: number, each?: () => void): number[][] => {
      const last = new Map<number, number>();
      const out = bt.sides[0].routes.map(() => new Set<number>());
      while (bt.t < secs && !bt.over) {
        each?.();
        bt.step();
        bt.drainEvents();
        bt.sides[0].routes.forEach((r, i) => {
          for (const a of r.ammo) {
            const prev = last.get(a.p.id);
            if (prev !== undefined && !a.blocked && a.s > prev) out[i].add(+((a.s - prev) / TICK).toFixed(6));
            last.set(a.p.id, a.s);
          }
        });
      }
      return out.map((s) => [...s]);
    };
    // METRONOME: its Clockworks' belt is locked at 1x; a SLAG POT beside it, under a GREASE rig, still rides at 0.75x
    const metro: Build = {
      hero: "metronome", mods: [], beltCap: 30, hullBonus: 5000,
      items: [{ uid: 1, def: "clockworks", x: 4, y: 6 }, { uid: 7, def: "slagpot", x: 6, y: 6 }, rig(20, "grease", 6, 3, 3)],
      routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }, { factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }],
    };
    expect(hitsOfRig(metro, 20).map((h) => [h.route, h.tile])).toEqual([[1, 3]]);
    expect(speeds(new Battle(metro, barge(), SEED), 15)).toEqual([[BELT_SPEED], [BELT_SPEED * 0.75]]);
    // SIPHON's Drag (x0.25) held on every tile of both belts: the Kiln's cinder crawls, the slag doesn't. The foe is a
    // Siphon whose belts stop short of its guns (tests/races.siphon.test.ts's silentSiphon): only this test drags
    const siphon = heroStartBuild("siphon", 1);
    for (const r of siphon.routes) r.cells.pop();
    const bt = new Battle(factoryBench("slagpot", 1), siphon, SEED);
    const s0 = bt.sides[0];
    expect(s0.race, "side 0 faces SIPHON: it has Drag state").toBeTruthy();
    const drag = () => s0.routes.forEach((r, i) => r.cells.forEach((_, ci) => { s0.race!.drag.until[i][ci] = bt.t + 1; }));
    expect(speeds(bt, 15, drag)).toEqual([[BELT_SPEED * 0.25], [BELT_SPEED * 0.75]]);
  });

  it("the walk and the battle agree for slag, the batch factories and HOT SWAP (a WHETSTONE on tile 3)", () => {
    for (const f of ["slagpot", "doublestamp", "shottower", "hotswap"]) {
      const b = factoryBench(f, 1, { only: true });
      b.items.push(rig(20, "whetstone", 4, 3, 1));
      const w = walkRoute(b, 0).estimate;
      const bt = new Battle(b, barge(), SEED);
      const f0 = bt.sides[0].factories.find((x) => x.uid === 7)!;
      f0.timer = 1e9; // held until the WHETSTONE is online, then the stamps run
      while (!bt.sides[0].gates.every((g) => g.online)) bt.step();
      f0.timer = 0;
      const born = new Map<number, number>();
      const loads: { p: (typeof bt.sides)[0]["routes"][0]["ammo"][0]["p"]; t: number }[] = [];
      // NUM-2 (REQ-BFG-047): the stamp timer carries its remainder, so HOT SWAP ★1's cycle is exactly 1.5 s (90 ticks; the
      // old reset made it 91) and its spark reaches the chamber on the very tick the ember's window (WINDOW_TIME 1.5 s)
      // closes: it joins that window and fires at once (LIFO), never resting in the stack at a tick's end. So a slug also
      // counts as it leaves the belt's end into the chamber (was: only as seen in the stack after a tick)
      while (bt.t < 30 && loads.length < 2) {
        const front = bt.sides[0].routes[0].ammo[0]?.p; // NUM-2: the slug at the belt's end before the tick
        bt.step();
        bt.drainEvents();
        for (const a of bt.sides[0].routes[0].ammo) if (!born.has(a.p.id)) born.set(a.p.id, bt.t);
        if (front && !bt.sides[0].routes[0].ammo.some((a) => a.p.id === front.id) && !loads.some((l) => l.p.id === front.id)) loads.push({ p: front, t: bt.t }); // NUM-2
        for (const p of bt.sides[0].turrets[0].stack) if (!loads.some((l) => l.p.id === p.id)) loads.push({ p, t: bt.t });
      }
      const first = loads[0];
      const ad = AMMO[first.p.ammo];
      expect(first.t - born.get(first.p.id)!, `${f}: stamp to chamber`).toBeCloseTo(w.time, 1);
      expect(payloadDamage(first.p.base ?? ad.base, ad.rideScale, first.p.ride, first.p.mult, first.p.flat), `${f}: damage`).toBeCloseTo(w.dmg, 1);
      // HOT SWAP: the walk shows the ember's Burn and the spark's Shock; the first two slugs carry one each
      expect([w.burn, w.shock], f).toEqual(f === "hotswap" ? [2, true] : [0, false]);
      if (f === "hotswap") expect(loads.map((l) => [l.p.preset, l.p.burn, l.p.shock])).toEqual([["ember", 2, false], ["spark", 0, true]]);
    }
  });
});

// ---------------------------------------------------------------- P9: GANTRY PRESS and rigs

/** gantryWeaver(★2, 3 belts): the Loom off-route at (0,8), GANTRY PRESS at (4,6) on A (up column 4), B (west, up column 1)
 *  and C (east, up column 8). An L COIL at (3,5), rot 1, works A's tile 0 (4,5) and B's tile 0 (3,6); a WHETSTONE works
 *  A (4,3), a TEMPER B (1,4) and a BRAKE C (8,3). The three belts take 6 + 9 + 9 = 24 tiles, the Weaver's own belt, so
 *  beltCap is 24 (the bench's 30 is no whole number of +4 crates over 24, which validateBuild rightly refuses). */
function p9(): Build {
  const b = gantryWeaver(2, 3);
  b.beltCap = 24;
  b.items.push(rig(20, "coil", 3, 5, 1), rig(21, "whetstone", 3, 3, 1), rig(22, "temper", 0, 4, 1), rig(23, "brake", 7, 3, 1));
  return b;
}

describe("P9: GANTRY PRESS with rigs on its belts", () => {
  it("a ★2 GANTRY with rigs on all three belts, one rig hitting two, passes routeProblems, beltsideRun and the snapshot validator", () => {
    const b = p9();
    expect(routeProblems(b)).toEqual([]);
    expect(hitsOfRig(b, 20).map((h) => [h.route, h.cell])).toEqual([[0, K(4, 5)], [1, K(3, 6)]]);
    expect([21, 22, 23].map((u) => hitsOfRig(b, u).map((h) => [h.route, h.cell]))).toEqual([[[0, K(4, 3)]], [[1, K(1, 4)]], [[2, K(8, 3)]]]);
    expect(rigHits(b).map((r) => r.flat().length)).toEqual([2, 2, 1]);
    // beltsideRun (every save load): a native GANTRY deck is left exactly as it is, load after load
    const run = { build: J(b), inventory: [] as unknown[], gold: 10 };
    for (let i = 0; i < 2; i++) {
      expect(beltsideRun(run)).toEqual({ moved: 0, cargoed: 0, refunded: 0, dropped: 0 });
      expect(run.build).toEqual(b);
    }
    // an old save with the same four as inline gates: D3 moves each beside its tile, with no GANTRY special case, and
    // lands exactly the native deck above (the COIL's first arrow on its old tile, its second on B); idempotent
    const inline = gantryWeaver(2, 3);
    inline.beltCap = 24;
    inline.items.push({ uid: 20, def: "coil", x: 4, y: 5 }, { uid: 21, def: "whetstone", x: 4, y: 3 }, { uid: 22, def: "temper", x: 1, y: 4 }, { uid: 23, def: "brake", x: 8, y: 3 });
    const old = { build: J(inline), inventory: [] as unknown[], gold: 10 };
    expect(beltsideRun(old)).toEqual({ moved: 4, cargoed: 0, refunded: 0, dropped: 0 });
    expect(old.build).toEqual(b);
    expect(beltsideRun(old)).toEqual({ moved: 0, cargoed: 0, refunded: 0, dropped: 0 });
    expect(migrateInlineGates(J(b))).toEqual({ moved: [], stranded: [] });
    // the ghost snapshot round trip (v2 carries rot) and the server's validator, with no special case
    const snap: GhostSnapshot = { v: 2, rules: RULES_VERSION, hero: "weaver", day: 10, wins: 6, lives: 3, build: J(b), runId: "r1", playerId: "p1", createdAt: 0 };
    const back = decodeSnapshot(encodeSnapshot(snap));
    expect(back.build).toEqual(b);
    const v = validateBuild(back.build, 10);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    // at 1 star the third belt is legal too, rigs or not (bb-0.8.3, REQ-BFG-042 D3: GANTRY PRESS 3 / 4 / 5; 0.6.1c's
    // outputs were 2 / 3 / 3, and the third belt was illegal at 1 star)
    const one = J(b);
    delete one.items.find((p) => p.uid === 7)!.stars;
    expect(routeProblems(one).map((p) => p.route)).toEqual([]);
    expect(validateBuild(one, 10).ok).toBe(true);
  });
});

// ---------------------------------------------------------------- P10: road items draw rigs by their tags

const ROAD_DRAWS_062B = new URL("./fixtures/beltside-062c/roadDraws-062b.json", import.meta.url);
/**
 * 0.8.0 T1 (VERIFIED-I1 call 3; I1 REPORT section 6 and open item 3): BB_WRITE_ROAD_DRAWS used to rewrite
 * roadDraws-062b.json with today's draws. That file is a one-time capture: arsenal-062b's draws (0.6.2b's catalogue,
 * wave 3 off, old saves), the history the check below compares today's draws against. Today's draws differ from it in
 * exactly the 24 TRADER entries the check pins as changed since arsenal-062b, so a rewritten file erases that history
 * and the check fails ("expected [] to deeply equal ['trader|many|1', ...]"); dae2177 did the same. So the switch
 * refuses: it writes nothing and says why. The live draws keep their own fixture and switch (roadDraws-080.json,
 * BB_WRITE_ROAD_DRAWS_080, the next test).
 */
export const REFUSE_062B = "roadDraws-062b.json is arsenal-062b's one-time capture of the road draws, the history this check compares against; "
  + "rewriting it with today's draws would erase the 24 TRADER changes it pins, so it is never rewritten. "
  + "The live draws are written by BB_WRITE_ROAD_DRAWS_080=1 (roadDraws-080.json).";
/** With BB_WRITE_ROAD_DRAWS set: write nothing, say why (`say`), and return true. */
function refuse062b(say: (msg: string) => void = console.warn): boolean {
  if (!process.env.BB_WRITE_ROAD_DRAWS) return false;
  say(`BB_WRITE_ROAD_DRAWS: not written. ${REFUSE_062B}`);
  return true;
}

/**
 * FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): run `fn` in the catalogue arsenal-062b's capture pinned, for one call: wave 3
 * off (as I1 M3 did), the sustain pieces off (withSustain(fn, false)) and SIFTER not dormant (out of DORMANT_ITEMS for the
 * call, put back after it, also on a throw). Release X's SIFTER dormancy empties it from SALVAGE and the wreck's draws, and
 * the sustain switch adds 3 parts to the trader's swaps; neither is the 0.6.1c -> 0.6.2b history this check pins.
 */
// SHAPES-1 flip: and with shapes off (withShapes(fn, false)): the three shaped rigs are no part of 0.6.2b's catalogue (EMBER
// TROUGH would join the SMUGGLER's BURN pool and both commons SALVAGE's, and the draws would move)
// BUMP-1D (PLAIN_RIGS and SHAPES2 ship on): and with both off (withPlainRigs, withShapes2 false): the six plain stat rigs and the six
// more shaped rigs are no part of 0.6.2b's catalogue either (the commons among them would join SALVAGE's and the SMUGGLER's pools:
// 96 of the 108 draws moved with them on, where the capture pins 24, the trader's)
function in062b<T>(fn: () => T): T {
  const dormant = DORMANT_ITEMS as Set<string>, was = [...dormant];
  dormant.delete("sifter");
  try {
    return withPlainRigs(() => withShapes2(() => withShapes(() => withSustain(() => withWave3(fn, false), false), false), false), false);
  } finally {
    dormant.clear();
    for (const id of was) dormant.add(id);
  }
}

describe("P10: expanded road rig draws and shared timing gear", () => {
  // 0.8.0 I1 M3 (the brief's M2 list: "the beltside.merge061c road pools"; VERIFIED-D1 Q8): this history check (0.6.1c
  // -> 0.6.2b: timing gear joined the trader's swaps) runs in the world the 062b fixture pinned, wave 3 off for one call
  // and old saves (no per-run draw), so every assertion keeps its meaning; the live draws are pinned in the next test
  // FLIP-X2: and with the sustain pieces off and SIFTER not dormant for the call (in062b; was withWave3(fn, false) alone:
  // with release X's catalogue 57 draws differed from the capture where 24 are pinned)
  it("keeps wreck and smuggler draws stable while timing gear enters trader swaps (0.6.2's catalogue, old saves)", () => in062b(() => {
    const archive = JSON.parse(readFileSync(new URL("./fixtures/beltside-062c/roadDraws-061c.json", import.meta.url), "utf8")) as RoadDraws & { source: string };
    expect(archive.source).toBe("4ecf202");
    const now = roadDraws(true);
    const path = ROAD_DRAWS_062B;
    refuse062b(); // 0.8.0 T1: BB_WRITE_ROAD_DRAWS no longer rewrites this one-time capture (why: at refuse062b)
    const baseline = JSON.parse(readFileSync(path, "utf8")) as RoadDraws & { source: string };
    expect(baseline.source).toBe("arsenal-062b");
    expect(Object.keys(now.choices)).toHaveLength(108); // 3 events x 3 sets held x 12 seeds, 10 days each
    const changed = Object.keys(now.choices).filter((k) => now.choices[k] !== baseline.choices[k]);
    expect(changed.sort()).toEqual(Object.keys(now.choices).filter((k) => /^trader\|(some|many)\|/.test(k)).sort());
    for (const k of Object.keys(now.choices).filter((k) => !changed.includes(k))) expect(now.choices[k], k).toBe(baseline.choices[k]);
    expect(now.choices["trader|many|1"]).toContain("SWAP:longcase<grease");
    expect(Object.values(now.choices).some((choice) => choice.includes("SWAP:escapement<temper"))).toBe(true);
    expect(now.salvage).toEqual(baseline.salvage);
    expect(now.smuggler).toBe(baseline.smuggler);
    expect(Object.keys(now.swap).sort()).toEqual(Object.keys(baseline.swap).sort());
    expect(now.swap).not.toEqual(baseline.swap); // two sold rare mods expand eligible swap tiers
    // the rigs join the pools by their tags and kind, with no code change (DESIGN §12 P10)
    expect(salvagePool()).toEqual(["temper", "whetstone", "grease", "brake", "tollbooth", "sifter"]);
    expect([smugglerPool("BURN"), smugglerPool("SHOCK")]).toEqual([
      ["temper", "bellows", "quench"], ["coil", "staticbrush", "lodestone"],
    ]);
    for (const d of Object.values(ITEMS).filter((x) => x.kind === "gate")) expect(d.tags?.length, d.id).toBeGreaterThan(0);
  }));

  // 0.8.0 T1 (VERIFIED-I1 call 3): the 062b write switch refuses and says why; the capture's bytes stay as committed
  it("BB_WRITE_ROAD_DRAWS never rewrites the 062b capture: it writes nothing and says why", () => {
    const before = readFileSync(ROAD_DRAWS_062B);
    const said: string[] = [];
    vi.stubEnv("BB_WRITE_ROAD_DRAWS", "1");
    try {
      expect(refuse062b((m) => said.push(m))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("one-time capture");
    expect(said[0]).toContain("BB_WRITE_ROAD_DRAWS_080");
    expect(readFileSync(ROAD_DRAWS_062B).equals(before)).toBe(true);
    if (!process.env.BB_WRITE_ROAD_DRAWS) expect(refuse062b(() => { throw new Error("said something with the switch off"); })).toBe(false);
  });

  // 0.8.0 I1 M3: the live road draws (wave 3 in the pools, the per-run draw in every run), regenerated once with
  // BB_WRITE_ROAD_DRAWS_080=1 npx vitest run tests/beltside.merge061c.test.ts (its own switch; BB_WRITE_ROAD_DRAWS no
  // longer writes 062b, arsenal-062b's snapshot that the history check above compares against: 0.8.0 T1)
  it("0.8.0: the live road draws (wave 3's commons in SALVAGE, the per-run draw) are the regenerated fixture's", () => {
    const live = roadDraws();
    const path = new URL("./fixtures/beltside-062c/roadDraws-080.json", import.meta.url);
    if (process.env.BB_WRITE_ROAD_DRAWS_080) writeFileSync(path, JSON.stringify({ source: "v080-wave3", ...live }, null, 2) + "\n");
    const fixture = JSON.parse(readFileSync(path, "utf8")) as RoadDraws & { source: string };
    expect(fixture.source).toBe("v080-wave3");
    expect(live).toEqual({ choices: fixture.choices, salvage: fixture.salvage, smuggler: fixture.smuggler, swap: fixture.swap });
    expect(Object.keys(live.choices)).toHaveLength(108);
    // the pools: wave 3's three common rigs join SALVAGE; the SMUGGLER keeps the same six (keyed by effect)
    // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant, so SALVAGE never draws it (was [..., "tollbooth", "sifter", ...]);
    // the live fixture above was regenerated with BB_WRITE_ROAD_DRAWS_080=1 on flipx2 (release X's catalogue)
    // SHAPES-1 flip: + NAIL STRIP and EMBER TROUGH (common rigs) in SALVAGE, + EMBER TROUGH (it burns) in the SMUGGLER's BURN
    // pool, after the older ones (was [..., "pincer"] and ["temper", "bellows", "quench"]). The fixture above was written
    // with shapes off (with shapes off the live draws equal it: 0 of 108 choices differ; on, 95 differ): it waits for its
    // regeneration (BB_WRITE_ROAD_DRAWS_080=1), not done in the flip
    // S8 (BRIEF-S8 lane 2, REVIEW-SHAPES1 section 5): regenerated with BB_WRITE_ROAD_DRAWS_080=1 and every switch on as shipped
    // (bb-0.10.0, the nine on) at 01b0a57: 95 of 108 choices moved (wreck 35, smuggler 36, trader 24), the 3 salvage rows, the
    // smuggler row and 20 of 79 swaps; cause SHAPES-1's flip cd59be0 (NAIL STRIP and EMBER TROUGH in the pools)
    // BUMP-1D (PLAIN_RIGS and SHAPES2 ship on): regenerated with BB_WRITE_ROAD_DRAWS_080=1 and every switch on as shipped (bb-0.11.0,
    // the eleven on): 96 of 108 choices moved (wreck 36, smuggler 36, trader 24), the 3 salvage rows, the smuggler row, and the swaps
    // (91 goods now, was 79: the twelve new rigs are goods too); cause the twelve new rigs in the pools: the commons in SALVAGE after
    // the older ones (SHAPES2's ELBOW GUARD, SAW BAR and SPARK COMB, then PLAIN_RIGS' RASP, SPARK GAP, SCALE GUARD and BALLAST) and
    // the one whose effect burns in the SMUGGLER's BURN pool (RASP's BURN; SPARK GAP's STUN is no SHOCK pool member: it stays the same three)
    expect(salvagePool()).toEqual([
      "temper", "whetstone", "grease", "brake", "tollbooth", "plateroller", "twingauge", "pincer", "nailstrip", "embertrough",
      "elbowguard", "sawbar", "sparkcomb", "rasp", "sparkgap", "scaleguard", "ballast",
    ]);
    expect([smugglerPool("BURN"), smugglerPool("SHOCK")]).toEqual([
      ["temper", "bellows", "quench", "embertrough", "rasp"], ["coil", "staticbrush", "lodestone"],
    ]);
    // the per-run draw moved the event draws themselves (the run's wares), not only the pools
    expect(roadDraws(true).choices).not.toEqual(live.choices);
  });

  it("the cards say RIG: the wreck and the smuggler name rigs, and nothing on the three events says GATE", () => {
    expect(EVENTS.wreck.text[1]).toBe("ONE OF ITS RIGS STILL HUMS.");
    expect(EVENTS.smuggler.text[0]).toBe("A SMUGGLER SELLS HOT RIGS FROM");
    for (const id of ["wreck", "smuggler", "trader"] as EventId[]) {
      expect(EVENTS[id].text.join(" "), id).not.toMatch(/GATE/);
      for (const seed of [1, 8, 10, 12345]) for (const day of [2, 5, 9]) {
        const run = newRun("furnace", seed);
        run.day = day;
        run.inventory = [{ uid: 900, def: "temper" }, { uid: 901, def: "coil", stars: 2 }];
        run.event = makeEvent(seed, day, id);
        run.stage = "event";
        for (const c of choicesFor(run)) expect([c.label, c.note ?? "", c.blocked ?? ""].join(" "), `${id} ${seed} ${day}`).not.toMatch(/GATE/);
      }
    }
  });
});

// ---------------------------------------------------------------- MERGE-061's day-1 shop probe

describe("MERGE-061's day-1 shop probe (seed 12345), after 0.6.1c M0", () => {
  it("no wagon offers one part twice (0.6.1r's Quartermaster offered HOPPER three times)", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      const run = newRun(hero, 12345);
      expect(run.shop.wagons.length, hero).toBeGreaterThan(0);
      if (process.env.BB_TABLES) console.log(`DAY1 ${hero} 12345 | ${run.shop.wagons.map((w) => `${w.merchant}: ${w.offers.map((o) => o.def).join(", ")}`).join(" | ")}`);
      for (const w of run.shop.wagons) expect(new Set(w.offers.map((o) => o.def)).size, `${hero} ${w.merchant}`).toBe(w.offers.length);
    }
  });
});
