// 0.6.2 final candidate, CAND-A (ref/BRIEF-final-062-cand.md §1): FB-B's module rules on the 0.6.2 mechanics head.
// FB-B (QUENCH TANK, SURGE VALVE, MANTLET, HOPPER; design oracle 16085a6430e4cc6a) was built and tested on 3fbd553,
// before turret slots (0.6.2s, REQ-BFG-031) and belt joins (0.6.2j, REQ-BFG-027). These tests pin where they meet:
// 1. MANTLET ★2 FULL PLATE's shield (the belt tile feeding its turret) with a turret in the extra slot, through turret
//    swaps, and with a joining belt (a joining belt feeds no intake itself: its last tile is not shielded).
//    NUM-3 (R1's STUN fold): the perk is FULL GUARD (was FULL PLATE), and MANTLET ignores every STUN source from ★1
//    (STUN_CAUSES: the six below and LIMPET's stall); the shield checks run every one.
// 2. HOPPER's store on a turret with two or more gear slots (never two HOPPERs on one turret), and on a GATLING, whose
//    clash line names HOPPER's seconds wherever the HOPPER sits.
// 3. QUENCH and SURGE on a joined payload: it takes the join tile's hits and every hit after it, and rides the main
//    belt's pulse state from the join on (J4), paid once per pulse by a valve that works both belts.
// Y7b2 (the flip; release Y): MANTLET guards 1 / 2 / 3 tiles from ★1 and its tiles' rigs no longer share it (DESIGN-Y row
// 14); HOPPER holds +1 / +2 / +3 loads with no store, no +0.5 s and no no-jam (row 33), so it names no GATLING clash;
// QUENCH has no floor and no stack cap (row 23); SURGE VALVE pays every slug on its belts each period and the walk counts
// flat x the seconds ridden there / the period (row 28). The rig, store and no-jam checks are deleted (switch-off only).
import { describe, expect, it } from "vitest";
import { Battle, turretAt, type SideState, type Target } from "../src/sim/battle";
import { rotFacing } from "../src/sim/beltside";
import { GUARD_SKIRT, HEROES, ITEMS, STUN_CAUSES, WINDOW_TIME, type HarassCause } from "../src/sim/content";
import {
  canFitGear, cloneBuild, deadEndsAt, gearOn, installTurret, key as K, moveTurret, rigHits, rotField, routeInfo, walkRoute,
  type Build, type Placed,
} from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling rules ship on (QUENCH TANK is KINDLING); the 0.9.11 conversion is read with it off
import { validateBuild } from "../src/net/validate";
import { gatlingClash } from "../src/screens/build/inspector";
import { barge, busy, run, SEED } from "./arsenal.bench";

const STARS = [1, 2, 3] as const;
// NUM-3 (R1's STUN fold): every STUN source (was SIX: shock, static, arc, drag, freeze, sabot; LIMPET's stall joins them)
const STUN: readonly HarassCause[] = STUN_CAUSES;
const CAP = HEROES.furnace.belt + 2 * ITEMS.beltcrate.supply!.belt!; // two belt crates
const st = (s: number) => (s > 1 ? { stars: s } : {});
const rig = (uid: number, def: string, x: number, y: number, facing: 0 | 1 | 2 | 3, stars = 1): Placed =>
  ({ uid, def, x, y, ...rotField(def, rotFacing(def, facing)), ...st(stars) });

type Sim = { disrupt(s: SideState, t: Target, secs: number, cause: HarassCause): boolean };
const sim = (bt: Battle) => bt as unknown as Sim;
const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => {
  const t = s.targets.find((x) => x.kind === kind && x.ref === ref && x.cell === cell);
  if (!t) throw new Error(`no target ${kind}:${ref}:${cell}`);
  return t;
};
/** Each route's shielded tiles (GUARD_SKIRT) as 0/1, from a fresh battle. */
const shield = (b: Build): number[][] => new Battle(b, barge(), SEED).sides[0].routes.map((r) => r.guard.map((g) => (g & GUARD_SKIRT ? 1 : 0)));
/** Does a 2 s stall of `cause` land on route ri's tile ti (a fresh battle each time)? */
const stalls = (b: Build, ri: number, ti: number, cause: HarassCause): boolean => {
  const bt = new Battle(b, barge(), SEED), me = bt.sides[0];
  return sim(bt).disrupt(me, target(me, "belt", ri, ti), 2, cause);
};
const rigStalls = (b: Build, uid: number, cause: HarassCause): boolean => {
  const bt = new Battle(b, barge(), SEED), me = bt.sides[0];
  return sim(bt).disrupt(me, target(me, "gate", uid), 2, cause);
};
const ones = (n: number, last: number) => Array.from({ length: n }, (_, i) => (i >= n - last ? 1 : 0));

// FURNACE: the KILN's belt M up column 4 into slot 0 (the starting SCRAP CANNON); a STAMP PRESS (uid 2, at 6,6) whose
// belt P runs up column 8 into the EXTRA slot (slot 1, columns 8-9), where a bought CARRONADE (uid 500) sits.
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const P = [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)];
function twoGuns(mantlet: { slot: number; stars: number }[] = [], extra: Placed[] = []): Build {
  const b: Build = {
    hero: "furnace", beltCap: CAP, hullBonus: 0, mods: [],
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }, ...extra],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...P] }],
  };
  expect(installTurret(b, { uid: 500, def: "carronade" }, 1).ok).toBe(true);
  mantlet.forEach((m, i) => b.mods.push({ uid: 80 + i, def: "mantlet", turret: m.slot, ...st(m.stars) }));
  return b;
}
// As joins.turrets.test.ts: the KILN's belt M into slot 0, and a STAMP PRESS (uid 2, at 0,6) whose belt R joins M at
// (4,4), M's tile 1. R ends on row 4, so only the join brings its payloads to a turret.
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
function chain(extra: Placed[] = [], mods: Build["mods"] = []): Build {
  return {
    hero: "furnace", beltCap: CAP, hullBonus: 0, mods,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, ...extra],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...R], join: K(4, 4) }],
  };
}

describe("1. MANTLET ★2 FULL GUARD (NUM-3: was FULL PLATE) on the mechanics head: each turret shields the belt tile feeding it", () => {
  // Y7b2 (the flip): was "... shields only its own turret's intake tile (and the rigs working it)"
  it("(a) a turret in the extra slot: each MANTLET shields only its own turret's last tiles", () => {
    // WHETSTONE uid 20 at (7,0) works P's intake tile (8,0); TEMPER uid 21 at (3,0) works M's intake tile (4,0)
    const rigs = [rig(20, "whetstone", 7, 0, 1), rig(21, "temper", 3, 0, 1)];
    // two MANTLET ★2 copies would be an UNFUSED PAIR (validateBuild), so "both" is ★2 on slot 0 and ★3 on slot 1
    // Y7b2 (the flip): ★2 shields 2 tiles (was 1): ones(6, 1) -> ones(6, 2), ones(7, 1) -> ones(7, 2)
    for (const [ms, want] of [
      [[], [ones(6, 0), ones(7, 0)]],
      [[{ slot: 0, stars: 2 }], [ones(6, 2), ones(7, 0)]],
      [[{ slot: 1, stars: 2 }], [ones(6, 0), ones(7, 2)]],
      [[{ slot: 0, stars: 2 }, { slot: 1, stars: 3 }], [ones(6, 2), ones(7, 3)]],
    ] as [{ slot: number; stars: number }[], number[][]][]) {
      const b = twoGuns(ms, rigs), on = (slot: number) => ms.some((m) => m.slot === slot), id = JSON.stringify(ms);
      expect(validateBuild(b, 10).errors, id).toEqual([]);
      expect(routeInfo(b, 1).turret).toBe(1);
      expect(shield(b), id).toEqual(want);
      for (const cause of STUN) { // NUM-3: was SIX (LIMPET's stall added)
        expect(stalls(b, 0, 5, cause), `${id} ${cause}: M's intake tile`).toBe(!on(0));
        expect(stalls(b, 1, 6, cause), `${id} ${cause}: P's intake tile`).toBe(!on(1));
        // Y7b2 (the flip): P's tile 5 is shielded from ★2 (was only by ★3 on slot 1)
        expect(stalls(b, 1, 5, cause), `${id} ${cause}: P's tile 5`).toBe(!on(1));
        expect(stalls(b, 1, 3, cause), `${id} ${cause}: P's tile 3`).toBe(true);
        // Y7b2 (the flip): the two rig checks (the rig on M's / P's intake tile shielded with its tile) are deleted: the
        // rigs no longer share the guard (switch-off only)
      }
    }
    // ★3 BULWARK SKIRT on the extra slot's turret: P's last 3 tiles, and still nothing of M
    expect(shield(twoGuns([{ slot: 1, stars: 3 }]))).toEqual([ones(6, 0), ones(7, 3)]);
  });

  it("(b) turret swaps: the shield stays with the slot's gear; gear a smaller turret can't hold comes off, shield and all", () => {
    const b = twoGuns([{ slot: 1, stars: 2 }]);
    // move / swap: the SCRAP CANNON and the CARRONADE trade slots; the MANTLET stays on slot 1 and guards P's tile
    expect(moveTurret(b, 0, 1).ok).toBe(true);
    expect([b.turrets!.map((t) => `${t.slot}:${t.def}`), gearOn(b, 1).map((m) => m.def)]).toEqual([["0:carronade", "1:scrapcannon"], ["mantlet"]]);
    expect(shield(b)).toEqual([ones(6, 0), ones(7, 2)]); // Y7b2 (the flip): ★2's 2 tiles (was ones(7, 1)), here and below
    // a bought BOMBARD (rare: 2 gear slots) replaces slot 1's turret: the old one goes back, the MANTLET stays
    const inst = installTurret(b, { uid: 600, def: "bombard" }, 1);
    expect([inst.ok, inst.turrets.map((t) => t.def), inst.mods]).toEqual([true, ["scrapcannon"], []]);
    expect(shield(b)).toEqual([ones(6, 0), ones(7, 2)]);
    // the BOMBARD's second gear slot takes a HOPPER placed after the MANTLET; a 1-gear-slot SWIVEL GUN swapped in keeps
    // the first placed (the MANTLET) and hands the HOPPER back ...
    b.mods.push({ uid: 90, def: "hopper", turret: 1 });
    const keep = cloneBuild(b);
    const sw = installTurret(keep, { uid: 700, def: "swivel" }, 1);
    expect([sw.turrets.map((t) => t.def), sw.mods.map((m) => m.def), gearOn(keep, 1).map((m) => m.def)]).toEqual([["bombard"], ["hopper"], ["mantlet"]]);
    expect(shield(keep)).toEqual([ones(6, 0), ones(7, 2)]);
    // ... and when the MANTLET was placed last it comes off: no shield, the stall lands
    const late = cloneBuild(b);
    late.mods = [...late.mods.filter((m) => m.def !== "mantlet"), ...late.mods.filter((m) => m.def === "mantlet")];
    const off = installTurret(late, { uid: 700, def: "swivel" }, 1);
    expect(off.mods.map((m) => m.def)).toEqual(["mantlet"]);
    expect(shield(late)).toEqual([ones(6, 0), ones(7, 0)]);
    expect(stalls(late, 1, 6, "freeze")).toBe(true);
  });

  it("(b) a swap to an inner-intake turret: the belt it leaves a dead end loses its shield; the fed belt keeps it", () => {
    // the busy bench: the KILN's belt (column 4) and the STAMP PRESS's (column 5) both feed slot 0, MANTLET ★2 on it
    const b = busy([["mantlet", 2]]);
    expect(shield(b)).toEqual([ones(6, 2), ones(7, 2)]); // Y7b2 (the flip): ★2's 2 tiles (was ones(6, 1), ones(7, 1))
    // a HAIL GUN (epic light, "inner": column 4 only) in slot 0: the press belt is a dead end, so nothing shields it
    expect(installTurret(b, { uid: 600, def: "hailgun" }, 0).ok).toBe(true);
    expect(deadEndsAt(b, 0)).toEqual([1]);
    expect(gearOn(b, 0).map((m) => m.def)).toEqual(["mantlet"]);
    expect(shield(b)).toEqual([ones(6, 2), ones(7, 0)]); // Y7b2 (the flip): was ones(6, 1)
    expect(stalls(b, 0, 5, "sabot")).toBe(false);
    expect(stalls(b, 1, 6, "sabot")).toBe(true);
  });

  it("(c) a joining belt feeds no intake itself: the main belt's intake tile is shielded, the joining belt's last tile is not", () => {
    // TEMPER uid 30 at (3,3) works R's last tile (3,4); WHETSTONE uid 31 at (3,0) works M's intake tile (4,0)
    const rigs = [rig(30, "temper", 3, 3, 2), rig(31, "whetstone", 3, 0, 1)];
    for (const s of [2, 3]) {
      const b = chain(rigs, [{ uid: 80, def: "mantlet", turret: 0, stars: s }]);
      expect(validateBuild(b, 10).errors).toEqual([]);
      expect(routeInfo(b, 1).join?.route).toBe(0);
      expect(shield(b), `★${s}`).toEqual([ones(6, s), ones(4, 0)]); // Y7b2 (the flip): ★2's 2 tiles (was ones(6, s === 2 ? 1 : 3))
      for (const cause of STUN) { // NUM-3: was SIX (LIMPET's stall added)
        expect(stalls(b, 0, 5, cause), `★${s} ${cause}: M's intake tile`).toBe(false);
        expect(stalls(b, 1, 3, cause), `★${s} ${cause}: R's last tile`).toBe(true);
        // Y7b2 (the flip): "the rig on M's intake tile" (shielded with its tile) is deleted: the rigs no longer share the
        // guard (switch-off only)
        expect(rigStalls(b, 30, cause), `★${s} ${cause}: the rig on R's last tile`).toBe(true);
      }
    }
    // the same in the extra slot (joins.turrets' deck): P into the extra slot's CARRONADE, a SLAG POT's belt J joins P
    // at (8,4); a MANTLET ★2 on slot 1 shields P's intake tile, not J's last tile
    const J = [K(9, 7), K(9, 6), K(9, 5), K(9, 4)];
    const x = twoGuns([{ slot: 1, stars: 2 }], [{ uid: 3, def: "slagpot", x: 8, y: 8 }]);
    x.routes.push({ factory: 3, cells: [...J], join: K(8, 4) });
    expect(validateBuild(x, 10).errors).toEqual([]);
    expect(shield(x)).toEqual([ones(6, 0), ones(7, 2), ones(4, 0)]); // Y7b2 (the flip): was ones(7, 1)
  });
});

/** Turret 0's shots, jams and damage in `secs`. Y7b2 (the flip): no store to count (switch-off only). */
function gun(b: Build, secs = 60) {
  let shots = 0;
  const bt = new Battle(b, barge(), SEED);
  while (bt.t < secs && !bt.over) {
    bt.step();
    for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0 && e.turret === 0) shots++;
  }
  return { shots, jams: bt.sides[0].stats.jams, damage: +bt.sides[0].stats.damage.toFixed(6) };
}

describe("2. HOPPER on the mechanics head: more gear slots, and the GATLING", () => {
  /** The busy bench with a BOMBARD (rare: 2 gear slots) in slot 0 and `gear` in that hardpoint order. */
  const bombard = (gear: [string, number][]): Build => {
    const b = busy();
    expect(installTurret(b, { uid: 600, def: "bombard" }, 0).ok).toBe(true);
    gear.forEach(([def, s], i) => b.mods.push({ uid: 70 + i, def, turret: 0, ...st(s) }));
    return b;
  };

  // Y7b2 (the flip): was "in either hardpoint beside a CALIBRATION, the same store, window and battle; ★2/★3 store 1/2,
  // ★3 never jams"
  it("in either hardpoint beside a CALIBRATION, the same window and battle; each star fires at least as often", () => {
    const rows = STARS.map((s) => {
      const a = bombard([["calibrate", 1], ["hopper", s]]), z = bombard([["hopper", s], ["calibrate", 1]]);
      const [ta, tz] = [a, z].map((b) => new Battle(b, barge(), SEED).sides[0].turrets[0]);
      // Y7b2 (the flip): was [window 5, WINDOW_TIME + 0.5, storeMax s - 1, noJam s === 3, 0.75]: the window is 4 + s and the
      // load time the base's; the storeMax and noJam columns are deleted (switch-off only)
      const pick = (t: typeof ta) => [t.window, t.windowTime, +t.interval.toFixed(6)];
      expect(pick(ta), `★${s}`).toEqual([4 + s, WINDOW_TIME, 0.75]); // BOMBARD 4 + 1 / 2 / 3 slots; 1.0 s x 0.75
      expect(pick(tz), `★${s}: hardpoint order`).toEqual(pick(ta));
      const [ga, gz] = [gun(a), gun(z)];
      expect(gz, `★${s}: the same battle in either order`).toEqual(ga);
      return ga;
    });
    // measured (60 s, two belts into one BOMBARD): ★1 57 shots, 17 jams; ★2 59, 15 (1 stored at most); ★3 74, 0
    // Y7b2 (the flip), measured (windows 5 / 6 / 7, no store): ★1 57 shots, 17 jams; ★2 57, 17; ★3 58, 15. The store
    // asserts (storeMost [0, 1, 2], ★2 stored > 0) and ★3's 0 jams (BOTTOMLESS) are deleted (switch-off only)
    expect(rows[1].shots).toBeGreaterThanOrEqual(rows[0].shots);
    expect(rows[1].jams).toBeLessThanOrEqual(rows[0].jams);
    expect(rows[2].shots).toBeGreaterThan(rows[1].shots);
  });

  it("two HOPPERs never sit on one turret, however many gear slots it has: the build screen and validateBuild refuse", () => {
    const b = bombard([["hopper", 2]]);
    expect(canFitGear(b, 0, "calibrate")).toEqual({ ok: true });
    expect(canFitGear(b, 0, "hopper")).toEqual({ ok: false, reason: "THIS TURRET ALREADY HAS ONE" });
    b.mods.push({ uid: 71, def: "hopper", turret: 0 });
    const v = validateBuild(b, 10);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("hardpoint: turret 0 carries two HOPPER");
  });

  // Y7b2 (the flip): was "... a HOPPER placed last takes its store with it" (storeMax 0 / 1); no HOPPER has a store, so
  // the turret's window shows which gear stayed: the SWIVEL GUN's 3, or 3 + 2 with the HOPPER ★2
  it("a swap onto a turret with fewer gear slots hands back the gear placed last: a HOPPER placed last takes its slots with it", () => {
    for (const [order, back, window] of [
      [[["calibrate", 1], ["hopper", 2]], "hopper", 3],
      [[["hopper", 2], ["calibrate", 1]], "calibrate", 5],
    ] as [[string, number][], string, number][]) {
      const b = bombard(order);
      const res = installTurret(b, { uid: 700, def: "swivel" }, 0); // a common: 1 gear slot
      expect(res.mods.map((m) => m.def)).toEqual([back]);
      expect(new Battle(b, barge(), SEED).sides[0].turrets[0].window).toBe(window); // Y7b2 (the flip): was storeMax 0 / 1
    }
  });

  // Y7b2 (the flip): "on a GATLING: the store takes loads while the barrel cools (★2/★3 no jams); HOPPER's +0.5 s does
  // nothing there" is deleted: no store, no no-jam, no +0.5 s (switch-off only; measured: 62 shots, 17 jams, 3150 damage
  // at every star, as with no HOPPER)

  it("the GATLING clash lines read every gear slot (they read only the first before CAND-A)", () => {
    // 0.6.2rel (REQ-BFG-032): whole sentences from the glossary (gatlingClashText); a HOPPER ★2/★3's store still works
    // Y7b2 (the flip): a HOPPER has no load time of its own and no store, so it names no clash (was "GATLING SPOOL: THE
    // HOPPER'S LONGER LOAD TIME DOES NOTHING HERE[, BUT ITS STORE STILL WORKS].", [hopStore], [ram, hopStore], [hop]); the
    // second hardpoint's clash is a FINISHER RAM's (was the HOPPER ★2's)
    const ram = "GATLING SPOOL: NO FULL CHAMBER, SO THE FINISHER RAM DOES NOTHING.";
    const b = bombard([["calibrate", 1], ["ram", 1]]);
    expect(gatlingClash(b, 0, "gatling")).toEqual([ram]); // the RAM in the second hardpoint
    expect(gatlingClash(bombard([["ram", 1], ["hopper", 3]]), 0, "gatling")).toEqual([ram]);
    expect(gatlingClash(bombard([["hopper", 1]]), 0, "gatling")).toEqual([]);
    expect(gatlingClash(b, 0, "identity")).toEqual([]);
    expect(gatlingClash(bombard([["calibrate", 1]]), 0, "gatling")).toEqual([]);
  });
});

/** Each payload as turret 0 loads it, by factory, loaded at or after `from` s: its flat and Burn. */
function loaded(b: Build, secs = 30, from = 5): Map<number, { flat: number; burn: number }[]> {
  const out = new Map<number, { flat: number; burn: number }[]>();
  const seen = new Set<number>();
  const bt = new Battle(b, barge(), SEED);
  while (bt.t < secs && !bt.over) {
    bt.step();
    bt.drainEvents();
    for (const p of turretAt(bt.sides[0], 0)?.stack ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (bt.t < from) continue;
      out.set(p.factory, [...(out.get(p.factory) ?? []), { flat: +p.flat.toFixed(6), burn: p.burn }]);
    }
  }
  return out;
}

describe("3. QUENCH and SURGE on a joined payload: the join tile's hits and every hit after it", () => {
  // a TEMPER ★3 (4 Burn) at (1,5) works R's tile 1, so the PRESS's payloads join M carrying 4 Burn; QUENCH / SURGE
  // stand east of M, facing west: at (5,5) on M's tile 0 (before the join tile), (5,4) its tile 1 (the join tile) or
  // (5,2) its tile 3 (after it). The KILN's own payloads pass all three.
  const SPOT: Record<string, [number, number]> = { before: [5, 5], join: [5, 4], after: [5, 2] };
  const temper = () => rig(10, "temper", 1, 5, 1, 3);

  // Y7b2 (the flip): was "... (+flat, then up to its stacks of Burn), never before"
  it("QUENCH: a joined payload takes it from the join tile on (+flat, then each of its Burn), never before", () => {
    // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where QUENCH TANK is KINDLING (SCALE_DEFS.quench: +3 / +5 / +8 DMG for each
    // BURN on the foe at the hit, no BURN spent, no `quench` field; tests/scale2c.sim pins the new effect). This test is the 0.9.11 QUENCH
    // TANK's conversion (gate.quench: every BURN riding the slug is spent for flat damage, from the join tile on), so it reads that world
    // with the switch off (withScaleRigs(fn, false), synchronously: each Battle is made inside); no number moved
    expect(SCALE_RIGS).toBe(true);
    expect(effectAt("quench", 1).gate?.quench).toBeUndefined(); // BUMP-1E: shipped, no conversion field (it is a reads line)
    withScaleRigs(() => {
      for (const s of STARS) {
        const q = effectAt("quench", s).gate!.quench!;
        // Y7b2 (the flip): every Burn is spent, no stack cap (was Math.min(burn, q.stacks)); q.flat is 0 (no floor)
        const burn = effectAt("temper", 3).gate!.burn!, spent = burn; // TEMPER ★3's Burn, all of it
        for (const [where, [x, y]] of Object.entries(SPOT)) {
          const b = chain([temper(), rig(11, "quench", x, y, 3, s)]);
          const got = loaded(b);
          const press = got.get(2)!, kiln = got.get(1)!;
          expect(press.length, `★${s} ${where}`).toBeGreaterThan(5);
          const want = where === "before" ? { flat: 0, burn } : { flat: q.flat + spent * q.perBurn, burn: burn - spent };
          for (const p of press) expect(p, `★${s} ${where}: a joined payload`).toEqual(want);
          for (const p of kiln) expect(p, `★${s} ${where}: the main belt's own`).toEqual({ flat: q.flat, burn: 0 });
          // the joining belt's walk (the inspector's readout, the par player's rating) says the same
          const est = walkRoute(b, 1).estimate;
          expect(est.burn, `★${s} ${where}: walk Burn`).toBe(want.burn);
        }
      }
    }, false);
  });

  it("SURGE: a joined payload rides the main belt's pulse from the join on (J4), a valve before the join tile included", () => {
    for (const s of STARS) {
      const flat = effectAt("surge", s).gate!.pulse!.flat;
      for (const [where, [x, y]] of Object.entries(SPOT)) {
        const b = chain([rig(11, "surge", x, y, 3, s)]);
        const press = loaded(b).get(2)!;
        // paid a whole number of pulses, and some joined payloads ride at least one
        for (const p of press) expect(Number.isInteger(p.flat / flat), `★${s} ${where}: ${p.flat}`).toBe(true);
        expect(press.some((p) => p.flat > 0), `★${s} ${where}`).toBe(true);
        // the walk counts one pulse of the valve, as it does on the main belt's own walk
        // Y7b2 (the flip): the walk counts flat x the seconds the joined slug rides M (2.2 s) / the period, wherever the
        // valve stands on M: 7.33 / 14.67 / 33 bonus, so the whole estimate gains 7 / 15 / 33 (was flat: one pulse)
        expect(walkRoute(b, 1).estimate.dmg - walkRoute(chain(), 1).estimate.dmg, `★${s} ${where}: walk`).toBeCloseTo([7, 15, 33][s - 1], 9);
      }
    }
  });

  it("a SURGE at a two-belt spot (arrows on the joining belt and on the main belt) pays a joined payload once per pulse", () => {
    // at (3,5) facing east its two arrows (II) land on M's tile 0 and R's tile 1
    for (const s of STARS) {
      const b = chain([rig(11, "surge", 3, 5, 1, s)]);
      const hits = rigHits(b);
      expect([hits[0][0].map((h) => h.uid), hits[1][1].map((h) => h.uid)]).toEqual([[11], [11]]);
      const p = effectAt("surge", s).gate!.pulse!;
      const bt = new Battle(b, barge(), SEED), me = bt.sides[0];
      const last = new Map<number, number>(), paid = new Map<number, number[]>();
      // NUM-3 (step 3, Battle.pulsePhase): was the pulse bucket Math.floor(bt.t / p.period) on the float clock; now the same
      // bucket on the integer tick count, Math.floor(bt.ticks / ticks a period), the cycle the sim pays by (pulse `cycle`
      // starts on the first tick >= cycle x period). EQUIVALENT check: bt.t is 2.9999999 on tick 180, so the float bucket
      // put the first tick of pulse 1 in pulse 0 and read a pay per pulse as two pays in one.
      const perTicks = p.period * 60; // 60 ticks a second: 180 / 180 / 120 for the whole-second periods 3 / 3 / 2 s
      let joined = 0;
      while (bt.t < 30 && !bt.over) {
        bt.step();
        bt.drainEvents();
        for (const r of me.routes) for (const a of r.ammo) {
          const was = last.get(a.p.id) ?? 0;
          if (a.p.flat > was + 1e-9) paid.set(a.p.id, [...(paid.get(a.p.id) ?? []), Math.floor((bt.ticks + 1e-9) / perTicks)]);
          last.set(a.p.id, a.p.flat);
          if (r.index === 0 && a.p.factory === 2) joined++;
        }
      }
      expect(joined).toBeGreaterThan(0);
      for (const [id, cycles] of paid) expect(new Set(cycles).size, `★${s} payload ${id}: one pay per pulse`).toBe(cycles.length);
      // the joining belt's walk counts the valve once (it counted it twice, on R and again at the join, before CAND-A)
      // Y7b2 (the flip): the walk counts flat x the 3.8 s the slug rides R and M, the valve's two belts / the period:
      // 12.67 / 25.33 / 57 bonus, so the whole estimate gains 13 / 25 / 57 (was p.flat: one pulse)
      expect(walkRoute(b, 1).estimate.dmg - walkRoute(chain(), 1).estimate.dmg, `★${s}`).toBeCloseTo([13, 25, 57][s - 1], 9);
    }
  });
});
