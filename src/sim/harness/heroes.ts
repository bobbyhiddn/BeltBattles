// Balance harness: the one local adapter between the harness and per-hero content.
// Races part 2 gives every hero a starting deck and an honest reference deck (heroBuilds.ts:
// nearest-plate plating, within maxGoldByDay), so this file only re-exports them, fixes the
// harness hero list and applies each hero's shop rules (HERO_RULES.shopExclude).

import { HEROES, ITEMS, type HeroId, type ItemDef } from "../content";
import { PLATE_STEP, heroRefBuild, heroStartBuild, rampPlates } from "../heroBuilds";
import { heroRules } from "../races/data";

export { PLATE_STEP, heroRefBuild, heroStartBuild, rampPlates };

/**
 * Every hero the sim can build, in report order. Deliberately not PLAYABLE_HEROES (the heroes
 * the game offers today): balance has to be measured before a hero ships.
 */
export const HARNESS_HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];

export const heroName = (h: HeroId): string => HEROES[h].name;

/**
 * Item ids the caravan never offers `hero`: its HERO_RULES.shopExclude (Metronome: Grease,
 * Brake, Overdrive; speed states don't move its belts) plus every item no merchant sells
 * (ESCAPEMENT and LONGCASE have no merchant until the 0.9.0 caravan).
 */
export function shopExcluded(hero: HeroId): Set<string> {
  const out = new Set(heroRules(hero).shopExclude);
  for (const d of Object.values(ITEMS)) if (d.kind !== "factory" && !d.merchant) out.add(d.id);
  return out;
}

/** What `hero` can buy of one kind ("gate", "mod" or, 0.6.1b, "core"): merchant-sold and not excluded.
 *  Signature cores are never ITEMS entries (content.ts SIGNATURE_CORES), so they are never offered. The
 *  stars-off shopper never asks for "core", so what it buys is unchanged. */
export function shopItems(hero: HeroId, kind: "gate" | "mod" | "core"): ItemDef[] {
  const ex = shopExcluded(hero);
  return Object.values(ITEMS).filter((d) => d.kind === kind && !!d.merchant && !ex.has(d.id));
}
