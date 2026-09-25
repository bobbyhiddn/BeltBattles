// races: dispatch from the battle sim into race mechanics. Furnace and Weaver sides get no
// RaceSide (undefined) unless they face a SIPHON (then only its Drag touches them), and every
// hook in battle.ts is guarded on it, so Furnace/Weaver battles run exactly the pre-races code
// path (tests/races.golden.test.ts).

import { FRAY_MAX, HEROES, type AmmoDef } from "../content";
import type { Build } from "../deck";
import type { FactoryState, Payload, Projectile, RouteState, SideState, TurretState } from "../battle";
import { absorb, newPlateState, plateOnLoad, type PlateState } from "./bastion";
import {
  alloyDamage, blankLoaded, crucibleProduce, newFoundryState, tryFuse, type FoundryState, type SimCtx,
} from "./foundry";
import { curveDamage, pendulumShift, speedLocked } from "./metronome";
import {
  DRAG_MULT, applyDrag, echoOf, echoOnLoad, isDragged, newDragState, newEchoState, sumpProduce,
  type DragState, type EchoState,
} from "./siphon";
import { isRaceHero } from "./data";

export type { SimCtx } from "./foundry";
export { isRaceHero, RACE_AMMO, RACE_HEROES, RACE_ITEMS, type RaceHeroId } from "./data";

export interface RaceSide {
  hero: Build["hero"];
  foundry: FoundryState;
  plating: PlateState;
  speedLock: boolean; // METRONOME: every belt at 1x, immune to Drag
  shift: number[]; // METRONOME: pendulum sweet-spot shift per turret (ESCAPEMENT / LONGCASE)
  drag: DragState; // Drag on this side's belts, from an enemy SIPHON
  echo: EchoState; // SIPHON: echo memory
}

function newRaceSide(b: Build): RaceSide {
  return {
    hero: b.hero, foundry: newFoundryState(), plating: newPlateState(), speedLock: speedLocked(b.hero),
    shift: HEROES[b.hero].turrets.map((_, i) => pendulumShift(b, i)),
    drag: newDragState(b.routes), echo: newEchoState(),
  };
}

export function makeRaceSide(b: Build): RaceSide | undefined {
  return isRaceHero(b.hero) ? newRaceSide(b) : undefined;
}

/** Once both sides exist: a Furnace or Weaver side facing a SIPHON gets state for its Drag. */
export function raceLink(sides: readonly SideState[]): void {
  for (const s of sides) {
    const foe = sides[s.side === 0 ? 1 : 0];
    if (!s.race && foe.build.hero === "siphon") s.race = newRaceSide(s.build);
  }
}

/** Production hook. True when the race handled this factory's stamp. */
export function raceProduce(ctx: SimCtx, s: SideState, f: FactoryState, dt: number): boolean {
  return crucibleProduce(ctx, s, f, dt) || sumpProduce(ctx, s, f, dt);
}

/** Intake hook, before the normal load. True when the payload was consumed (fused). */
export function raceIntake(ctx: SimCtx, s: SideState, r: RouteState, tu: TurretState, p: Payload): boolean {
  const alloy = s.race ? tryFuse(ctx, s.race.foundry, r.index, tu, p) : null;
  if (!alloy) return false;
  ctx.events.push({ type: "load", side: s.side, turret: tu.index });
  ctx.events.push({ type: "fuse", side: s.side, turret: tu.index, dmg: alloyDamage(alloy) });
  return true;
}

/** After a normal load into a chamber. */
export function raceLoaded(ctx: SimCtx, s: SideState, r: RouteState, _tu: TurretState, p: Payload): void {
  if (!s.race) return;
  blankLoaded(ctx, s.race.foundry, r.index, p);
  plateOnLoad(s.race.plating, p);
  echoOnLoad(s.race.echo, p);
}

/** Damage that reaches this side's hull after plating. */
export function raceAbsorb(s: SideState, dmg: number): number {
  return s.race ? absorb(s.race.plating, dmg) : dmg;
}

/** Drag factor for a payload in cell `ci`: DRAG_MULT while dragged (that movement isn't ride), else 1. */
export function raceDrag(ctx: SimCtx, s: SideState, route: number, ci: number): number {
  const rs = s.race;
  return rs && !rs.speedLock && isDragged(rs.drag, ctx.t, route, ci) ? DRAG_MULT : 1;
}

/** Belt speed state shown for cell `ci`: 1 on speed-locked belts, else the gate state x Drag. */
export function raceBeltSpeed(ctx: SimCtx, s: SideState, route: number, ci: number, state: number): number {
  if (s.race?.speedLock) return 1;
  return state * raceDrag(ctx, s, route, ci);
}

/** Fired damage of a ride-curve payload (PENDULUM), with the firing turret's sweet-spot shift. */
export function raceCurveDamage(ammo: AmmoDef, s: SideState, tu: TurretState, p: Payload): number {
  const shift = s.race ? s.race.shift[tu.index] ?? 0 : pendulumShift(s.build, tu.index);
  // 0.6.2: HEAT JACKET's downstream ride heat is flat damage on the pendulum curve too (payloadDamage adds it elsewhere)
  return curveDamage(ammo, p.ride, p.mult, p.flat + (p.heatBonus ?? 0), shift);
}

/** After an impact: SIPHON's echo memory, a copied Fray stack, and Drag. */
export function raceImpact(ctx: SimCtx, atk: SideState, def: SideState, pr: Projectile): void {
  const echoFray = !!atk.race && atk.race.echo.fray.has(pr.payload);
  if (def.race && def.build.hero === "siphon") def.race.echo.mem = echoOf(pr.payload, echoFray);
  if (echoFray) def.hull.fray = Math.min(FRAY_MAX, def.hull.fray + 1);
  if (pr.payload.ammo === "leechDrag" && def.race && !def.race.speedLock) applyDrag(ctx, def, def.race.drag, pr.target);
}
