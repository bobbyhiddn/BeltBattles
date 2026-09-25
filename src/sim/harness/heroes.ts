// Balance harness: the one local adapter between the harness and per-hero content.
// Races part 2 gives every hero a starting deck and an honest reference deck (heroBuilds.ts:
// nearest-plate plating, within maxGoldByDay), so this file only re-exports them, fixes the
// harness hero list and the shared salvage catalogue.

import { HEROES, buyableModules, type HeroId, type ItemDef } from "../content";
import { PLATE_STEP, heroRefBuild, heroStartBuild, rampPlates } from "../heroBuilds";

export { PLATE_STEP, heroRefBuild, heroStartBuild, rampPlates };

/**
 * Every hero the sim can build, in report order. Deliberately not PLAYABLE_HEROES (the heroes
 * the game offers today): balance has to be measured before a hero ships.
 */
export const HARNESS_HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];

export const heroName = (h: HeroId): string => HEROES[h].name;

/** Harness stock uses the same buyable catalogue as the game, regardless of hero. */
export function shopItems(_hero: HeroId, kind: "gate" | "mod" | "core"): ItemDef[] {
  return buyableModules().filter((d) => d.kind === kind);
}

/** Every merchant-sold factory, with no hero exclusions. */
export function shopFactories(_hero: HeroId): ItemDef[] {
  return buyableModules().filter((d) => d.kind === "factory");
}
