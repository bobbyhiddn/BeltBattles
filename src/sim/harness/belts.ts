// Balance harness: how many belts the bots lay from a factory (bb-0.8.3, REQ-BFG-042 D7). The game's rule is stars.ts
// outputsAt (a bought factory 2 / 3 / 4 belt slots by its stars, GANTRY PRESS one more, a hero's signature factory its
// fixed count); the bots may use fewer. Three policies, chosen per hero (BELT_POLICY):
//   "come"  (a) the bots as they come: a factory's belts up to its slots, into any free intake in reach (levers.ts
//               moreRoutes, the par player's new-factory lines; the par player's dawn edit adds a belt to any factory with
//               a free slot when that rates better);
//   "today" (b) the bots capped at 0.8.1's counts (bb-0.8.0's outputs: TODAY), so their decks are 0.8.1's;
//   "reach" (c) as "come", but a factory's next belt only into an installed turret it doesn't feed yet (new reach). A
//               second belt into a gun the factory already feeds relieves no stall there (the gun is what backs up).
// This file reads no star value itself (tests/harness.mods.test.ts): TODAY is 0.8.1's counts as data, and the slots come
// from the game's own outputsAt.

import type { HeroId } from "../content";
import { connectorClaims, hero, installedTurrets, routeInfo, routesOf, turretForColumn, type Build } from "../deck";
import { outputsAt } from "../stars";
import { freeConnectors } from "./path";

export type BeltPolicy = "come" | "today" | "reach";

/** 0.8.1's belt counts (bb-0.8.0's FactorySpec.outputs at ★1 / ★2 / ★3) where they weren't 1: the "today" cap. */
export const TODAY_OUTPUTS: Readonly<Record<string, readonly [number, number, number]>> = {
  kiln: [1, 1, 1], loom: [3, 3, 3], crucible: [2, 2, 2], wardworks: [1, 1, 1], clockworks: [1, 1, 1], sump: [2, 2, 2],
  gantry: [2, 3, 3], twinmould: [2, 2, 3], mimic: [1, 1, 2],
};

/** bb-0.8.3 D7: each hero's bots' policy (M2 measures the three; until then every hero's bots keep 0.8.1's counts). */
export const BELT_POLICY: Readonly<Record<HeroId, BeltPolicy>> = {
  furnace: "today", weaver: "today", foundry: "today", bastion: "today", metronome: "today", siphon: "today",
};

/**
 * bb-0.8.3 (REQ-BFG-042 D7, D9): does `hero`'s par player buy its own signature factory's copy when its caravan offers
 * one (judged by its value logic, as any part that merges: a copy that merges, or a copy placed with its belts beside
 * a ★2)? M2 measures it on against off; until then off, and the bots ignore the card (player.ts candidates).
 */
export const SIG_BUY: Readonly<Record<HeroId, boolean>> = {
  furnace: false, weaver: false, foundry: false, bastion: false, metronome: false, siphon: false,
};

/** Does `hero`'s par player buy its own signature copy (SIG_BUY)? */
export const sigBuys = (hero: HeroId): boolean => SIG_BUY[hero] ?? false;

/** The policy of `hero`'s bots. */
export const beltPolicy = (hero: HeroId): BeltPolicy => BELT_POLICY[hero] ?? "today";

/** 0.8.1's count for a factory at `stars` (1 for every factory TODAY_OUTPUTS doesn't list). */
export function todayOutputs(def: string, stars: number): number {
  const s = Math.max(1, Math.min(3, Math.floor(stars || 1)));
  return TODAY_OUTPUTS[def]?.[s - 1] ?? 1;
}

/** The belts `hero`'s bots may lay from a factory at `stars`: its slots (outputsAt), or 0.8.1's count under "today". */
export function botSlots(def: string, stars: number, heroId: HeroId, policy: BeltPolicy = beltPolicy(heroId)): number {
  const slots = outputsAt(def, stars);
  return policy === "today" ? Math.min(slots, todayOutputs(def, stars)) : slots;
}

/** The installed turret slots factory `uid`'s connected belts feed (a joining belt: its chain's turret). */
export function fedBy(b: Build, uid: number): Set<number> {
  const claims = connectorClaims(b), out = new Set<number>();
  for (const ri of routesOf(b, uid)) {
    const info = routeInfo(b, ri, claims);
    if (info.connected && info.turret >= 0) out.add(info.turret);
  }
  return out;
}

/** "reach" (c): the free intake columns (path.ts freeConnectors) of installed turrets factory `uid` doesn't feed yet. */
export function reachCols(b: Build, uid: number): number[] {
  const fed = fedBy(b, uid), h = hero(b), live = new Set(installedTurrets(b).map((v) => v.slot));
  return freeConnectors(b).filter((c) => { const t = turretForColumn(h, c); return t >= 0 && live.has(t) && !fed.has(t); });
}
