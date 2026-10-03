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

/**
 * bb-0.8.3 D7: each hero's bots' policy, chosen by M2's measurements (output-belts/measure/d7-*: the four-hero cross
 * table K 24 and the 19 captains' ladder K 12 under each policy): (a) "come" for every hero. Against M0 it keeps the
 * cross table nearest the band (FOUNDRY outside 35-65 on 7 of 20 F/W cells: M0 10, (b) 14, (c) 10; BASTION 1 of 20:
 * M0 3) and the captains' FOUNDRY column near M0's ((b) and (c) let FOUNDRY run away late and BASTION sink); (c) also
 * leaves 16 of 192 FOUNDRY dusk decks with a one-belt CRUCIBLE (no fuse pair). METRONOME and SIPHON follow (no balance
 * work: their heroes aren't playable).
 */
export const BELT_POLICY: Readonly<Record<HeroId, BeltPolicy>> = {
  furnace: "come", weaver: "come", foundry: "come", bastion: "come", metronome: "come", siphon: "come",
};

/** The policy of `hero`'s bots. */
export const beltPolicy = (hero: HeroId): BeltPolicy => BELT_POLICY[hero] ?? "today";

/**
 * bb-0.8.3 (REQ-BFG-043 D7'): how `hero`'s par player buys its two gold upgrades (TURRET SPEED, FACTORY; run.ts
 * buyUpgrade). One rule for every hero:
 *   "value"  the next level of either track is a candidate like any offer, judged by the player's own value logic (the
 *            rating's gain for the gold, player.ts pickOffer): bought when it rates better than the best shop buy, or
 *            than keeping the gold;
 *   "never"  no upgrade (M2''s comparison);
 *   "greedy" the next level, cheaper track first (a tie: FACTORY), whenever affordable, before any shop card (M2').
 */
export type UpgradePolicy = "value" | "never" | "greedy";
export const UPGRADE_POLICY: Readonly<Record<HeroId, UpgradePolicy>> = {
  furnace: "value", weaver: "value", foundry: "value", bastion: "value", metronome: "value", siphon: "value",
};

/** The upgrade policy of `hero`'s bots. */
export const upgradePolicy = (hero: HeroId): UpgradePolicy => UPGRADE_POLICY[hero] ?? "value";

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
