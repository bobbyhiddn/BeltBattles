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
