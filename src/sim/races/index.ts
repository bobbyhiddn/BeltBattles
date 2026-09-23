// races: dispatch from the battle sim into race mechanics. Furnace and Weaver sides get no
// RaceSide (undefined), and every hook in battle.ts is guarded on it, so their battles run
// exactly the pre-races code path (tests/races.golden.test.ts).

import type { HeroId } from "../content";
import type { FactoryState, Payload, RouteState, SideState, TurretState } from "../battle";
import { absorb, newPlateState, plateOnLoad, type PlateState } from "./bastion";
import {
  blankLoaded, crucibleProduce, newFoundryState, tryFuse, type FoundryState, type SimCtx,
} from "./foundry";

export type { SimCtx } from "./foundry";
export { isRaceHero, RACE_AMMO, RACE_HEROES, RACE_ITEMS, type RaceHeroId } from "./data";

export interface RaceSide {
  hero: HeroId;
  foundry: FoundryState;
  plating: PlateState;
}

export function makeRaceSide(hero: HeroId): RaceSide | undefined {
  if (hero !== "foundry" && hero !== "bastion") return undefined;
  return { hero, foundry: newFoundryState(), plating: newPlateState() };
}

/** Production hook. True when the race handled this factory's stamp. */
export function raceProduce(ctx: SimCtx, s: SideState, f: FactoryState, dt: number): boolean {
  return crucibleProduce(ctx, s, f, dt);
}

/** Intake hook, before the normal load. True when the payload was consumed (fused). */
export function raceIntake(ctx: SimCtx, s: SideState, r: RouteState, tu: TurretState, p: Payload): boolean {
  if (!s.race || !tryFuse(ctx, s.race.foundry, r.index, tu, p)) return false;
  ctx.events.push({ type: "load", side: s.side, turret: tu.index });
  return true;
}

/** After a normal load into a chamber. */
export function raceLoaded(ctx: SimCtx, s: SideState, r: RouteState, _tu: TurretState, p: Payload): void {
  if (!s.race) return;
  blankLoaded(ctx, s.race.foundry, r.index, p);
  plateOnLoad(s.race.plating, p);
}

/** Damage that reaches this side's hull after plating. */
export function raceAbsorb(s: SideState, dmg: number): number {
  return s.race ? absorb(s.race.plating, dmg) : dmg;
}
