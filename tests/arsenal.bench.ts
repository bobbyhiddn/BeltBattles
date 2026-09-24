// 0.6.1p: the per-module, per-star benches (ARSENAL.md §10 item 1) shared by tests/arsenal.modules.test.ts and
// tests/arsenal.decks.test.ts. Each bench is a fixed deck and seed that reads one module's headline metric
// (catalogue.json "headline") at 1, 2 and 3 stars. Not a test file itself (no .test suffix).
import { Battle, type SimEvent, type SideState } from "../src/sim/battle";
import { AMMO, type TurretDef } from "../src/sim/content";
import { estimateRoute, key, payloadDamage, type Build } from "../src/sim/deck";

export const SEED = 12345;
const K = key;
const starField = (s: number) => (s > 1 ? { stars: s } : {});

/** The Furnace bench: the Kiln at (4,6) on a straight 6-tile route into turret 0 (column 4); gates as [def, x, y, stars]. */
export function bench(gates: [string, number, number, number][] = [], mods: [string, number][] = [], hullBonus = 5000): Build {
  const b: Build = {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
    routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [], beltCap: 30, hullBonus,
  };
  let uid = 10;
  for (const [def, x, y, s] of gates) b.items.push({ uid: uid++, def, x, y, ...starField(s) });
  for (const [def, s] of mods) b.mods.push({ uid: uid++, def, turret: 0, ...starField(s) });
  return b;
}

/** The busy bench: the bench plus a STAMP PRESS at (6,6) on a second route into the same turret (column 5). */
export function busy(mods: [string, number][] = [], hullBonus = 5000, pressStars = 1): Build {
  const b = bench([], mods, hullBonus);
  b.items.push({ uid: 7, def: "press", x: 6, y: 6, ...starField(pressStars) });
  b.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
  return b;
}

/** A press-only Furnace: the Kiln stays off any route, so the turret fires STAMP PRESS slugs only. */
export function pressOnly(stars: number, hullBonus = 5000): Build {
  const b = busy([], hullBonus, stars);
  b.routes.shift();
  return b;
}

/** The target barge: a Weaver with hull + 5000 and no belts, so it never fires (4 machines: the Loom, 3 turrets). */
export const barge = (): Build => ({ hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 5000 });

/** Step a battle until `secs`, handing every tick's events to `on`. */
export function run(b: Build, secs = 30, foe: Build = barge(), seed = SEED, on?: (ev: SimEvent[], bt: Battle) => void): Battle {
  const bt = new Battle(b, foe, seed);
  while (bt.t < secs && !bt.over) {
    bt.step();
    const ev = bt.drainEvents();
    if (on) on(ev, bt);
  }
  return bt;
}

export const est = (b: Build, i = 0) => estimateRoute(b, i);

/** The stall a disrupt event just granted (read right after the step that raised it). */
function stallOf(s: SideState, e: Extract<SimEvent, { type: "disrupt" }>): number {
  if (e.kind === "gate") return s.gates.find((g) => g.uid === e.ref)?.disrupted ?? 0;
  if (e.kind === "factory") return s.factories.find((f) => f.uid === e.ref)?.disrupted ?? 0;
  if (e.kind === "turret") return s.turrets[e.ref]?.disrupted ?? 0;
  return s.routes[e.ref]?.cellDisrupt[e.cell] ?? 0;
}

/** GALVANIC COIL's headline: machine-seconds stalled per shocked machine hit, and the disrupt events per tick. */
export function coilStall(stars: number): { perHit: number; hits: number; granted: number; maxPerTick: number; stalls: number[] } {
  let hits = 0, granted = 0, maxPerTick = 0;
  const stalls = new Set<number>();
  run(bench([["coil", 4, 3, stars]]), 30, barge(), SEED, (ev, bt) => {
    let n = 0;
    for (const e of ev) {
      if (e.type === "impact" && e.side === 1 && e.shock) hits++;
      if (e.type === "disrupt" && e.side === 1) {
        const secs = stallOf(bt.sides[1], e);
        granted += secs;
        stalls.add(secs);
        n++;
      }
    }
    maxPerTick = Math.max(maxPerTick, n);
  });
  return { perHit: granted / hits, hits, granted, maxPerTick, stalls: [...stalls] };
}

/** STAMP PRESS's headline: output dps, the base damage of every slug it stamps in 30 s over 30 s (read off the payloads). */
export function pressDps(stars: number): { dps: number; produced: number; base: number[] } {
  let sum = 0, produced = 0;
  const bases = new Set<number>();
  run(pressOnly(stars), 30, barge(), SEED, (ev, bt) => {
    for (const e of ev) {
      if (e.type !== "produce" || e.side !== 0) continue;
      const r = bt.sides[0].routes.find((q) => q.factory === e.factory)!;
      const p = r.ammo[r.ammo.length - 1].p;
      const base = p.base ?? AMMO[p.ammo].base;
      bases.add(base);
      sum += base;
      produced++;
    }
  });
  return { dps: sum / 30, produced, base: [...bases] };
}

/** The damage a fired projectile had before FINISHER RAM (identity routine): payloadDamage of its payload. */
export function rawDamage(p: { ammo: keyof typeof AMMO; base?: number; ride: number; mult: number; flat: number }): number {
  const a = AMMO[p.ammo];
  return payloadDamage(p.base ?? a.base, a.rideScale, p.ride, p.mult, p.flat);
}

/**
 * Shots and finisher shots of player turret 0 over `secs`, each finisher's bonus (dmg / raw - 1), the windows its
 * shots emptied (a tick that fired and left the stack empty) and `wrong`: ticks whose finisher count isn't exactly
 * 1 for an emptied window and 0 otherwise.
 */
export function finishers(b: Build, secs = 30): { shots: number; fins: number; bonus: number[]; windows: number; wrong: number; damage: number } {
  const seen = new Set<number>();
  let shots = 0, fins = 0, windows = 0, wrong = 0;
  const bonus: number[] = [];
  const bt = run(b, secs, barge(), SEED, (_ev, bt) => {
    let fired = 0, finNow = 0;
    for (const pr of bt.projectiles) {
      if (pr.from !== 0 || pr.turret !== 0 || seen.has(pr.id)) continue;
      seen.add(pr.id);
      shots++;
      fired++;
      if (pr.finisher) { fins++; finNow++; bonus.push(pr.dmg / rawDamage(pr.payload) - 1); }
    }
    if (!fired) return;
    const emptied = bt.sides[0].turrets[0].stack.length === 0;
    if (emptied) windows++;
    if (finNow !== (emptied ? 1 : 0)) wrong++;
  });
  return { shots, fins, bonus, windows, wrong, damage: bt.sides[0].stats.damage };
}

/** Seconds turret `i` of side 0 spends stalled over `secs` against `foe`. */
export function turretStall(b: Build, foe: Build, seed: number, secs = 60, i = 0): number {
  let stalled = 0;
  run(b, secs, foe, seed, (_ev, bt) => {
    if (bt.sides[0].turrets[i].disrupted > 0) stalled += 1 / 60;
  });
  return stalled;
}

/** A TurretDef for tests that need the heavy Furnace turret. */
export type { TurretDef };

// ---------------------------------------------------------------- 0.6.1c: the six wave-1 factories

/** The busy bench's second route: from (6,5), above a factory at (6,6), left to column 5 and up to the heavy turret. */
export const SECOND = [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)];

/**
 * The factory bench (ARSENAL.md §10 item 1, "Factories"): the busy bench with factory `def` at `stars` in the STAMP
 * PRESS's place (uid 7 at (6,6)) on the second intake (column 5). `only` takes the Kiln off its route, so the turret
 * fires the factory's slugs alone. Gates go in as [def, x, y, stars]: column 5 (rows 0-4) is the factory's route.
 * GANTRY PRESS feeds two or three intakes: gantryBench and gantryWeaver.
 */
export function factoryBench(def: string, stars: number, o: { only?: boolean; gates?: [string, number, number, number][]; mods?: [string, number][]; hullBonus?: number } = {}): Build {
  const b = bench(o.gates ?? [], o.mods ?? [], o.hullBonus ?? 5000);
  b.items.push({ uid: 7, def, x: 6, y: 6, ...starField(stars) });
  b.routes.push({ factory: 7, cells: [...SECOND] });
  if (o.only) b.routes.shift();
  return b;
}

/** GANTRY PRESS on the Furnace: the Kiln parked off-route at (0,8), the Gantry (uid 7) at (4,6) feeding both heavy intakes (columns 4 and 5). */
export function gantryBench(stars: number, mods: [string, number][] = [], hullBonus = 5000): Build {
  const b = bench([], mods, hullBonus);
  b.items[0] = { uid: 1, def: "kiln", x: 0, y: 8 };
  b.items.push({ uid: 7, def: "gantry", x: 4, y: 6, ...starField(stars) });
  b.routes = [
    { factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
    { factory: 7, cells: [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
  ];
  return b;
}

/** GANTRY PRESS on a Weaver: the Loom parked off-route at (0,8), the Gantry (uid 7) at (4,6) on the first `n` of columns 4, 1 and 8. */
export function gantryWeaver(stars: number, n = 3, hullBonus = 0): Build {
  const cols = [
    [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)],
    [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)],
    [K(6, 6), K(7, 6), K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)],
  ];
  return {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, { uid: 7, def: "gantry", x: 4, y: 6, ...starField(stars) }],
    routes: cols.slice(0, n).map((cells) => ({ factory: 7, cells })), mods: [], beltCap: 30, hullBonus,
  };
}

export interface Stamps { produced: number; bases: number[]; dps: number; times: number[]; presets: string[]; perRoute: number[] }

/**
 * Factory `uid`'s stamps on side 0 of `b` over `secs` against the barge: the slugs, each distinct base damage, output
 * dps (the sum of bases / secs), each stamp's battle time, each slug's HOT SWAP preset in order and the slugs per route.
 * The slug a produce event stamped is the newest payload at the back of the factory's routes (no SPLITTER here).
 */
export function stamps(b: Build, uid = 7, secs = 30): Stamps {
  let sum = 0, produced = 0;
  const bases = new Set<number>(), times: number[] = [], presets: string[] = [];
  const perRoute = b.routes.map(() => 0);
  run(b, secs, barge(), SEED, (ev, bt) => {
    for (const e of ev) {
      if (e.type !== "produce" || e.side !== 0 || e.factory !== uid) continue;
      let best: { id: number; ri: number; p: (typeof bt.sides)[0]["routes"][0]["ammo"][0]["p"] } | undefined;
      for (const r of bt.sides[0].routes) {
        const back = r.factory === uid ? r.ammo[r.ammo.length - 1] : undefined;
        if (back && (!best || back.p.id > best.id)) best = { id: back.p.id, ri: r.index, p: back.p };
      }
      if (!best) continue;
      const base = best.p.base ?? AMMO[best.p.ammo].base;
      bases.add(base);
      sum += base;
      produced++;
      times.push(bt.t);
      if (best.p.preset) presets.push(best.p.preset);
      perRoute[best.ri]++;
    }
  });
  return { produced, bases: [...bases], dps: sum / secs, times, presets, perRoute };
}

/** The gaps (s) between consecutive stamps shorter than half the cycle: the slugs of one batch leaving the mouth. */
export function batchGaps(s: Stamps, interval: number): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < s.times.length; i++) if (s.times[i] - s.times[i - 1] < interval / 2) gaps.push(s.times[i] - s.times[i - 1]);
  return gaps;
}

/**
 * The output bench: a Weaver with the Loom parked off-route at (0,8) and factory `def` (uid 7) at (4,6) on column 4 into
 * light turret 1, which has EXT. CHAMBER ★3 (load 3, fire 3 at once). Only the belt (AMMO_SPACING: 4.3 slugs/s) limits
 * that chamber, so it never caps a factory; the heavy chamber tops out near 2 slugs/s (window 4 with EXT. CHAMBER ★3,
 * the 4th load waits a full second), below SHOT TOWER ★2/★3.
 */
export function factoryLight(def: string, stars: number): Build {
  return {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, { uid: 7, def, x: 4, y: 6, ...starField(stars) }],
    routes: [{ factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [{ uid: 20, def: "chamber", turret: 1, stars: 3 }], beltCap: 30, hullBonus: 5000,
  };
}

/** A factory's output: the output bench, or GANTRY PRESS on both heavy intakes with EXT. CHAMBER ★3 (1.4 slugs/s at most, never capped). */
export const factoryOut = (def: string, stars: number, secs = 30): Stamps =>
  stamps(def === "gantry" ? gantryBench(stars, [["chamber", 3]]) : factoryLight(def, stars), 7, secs);
