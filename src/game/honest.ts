// Honest warlord-gate decks for TOOLING only (0.6.0a M3b, rulings R1/R2): the shots and scripted
// runs seed their pool ghosts with these (makeGhost, pinClassicFoe). The game's dusk stand-ins are
// the rival captains' standInBuild (ghosts.ts standInFoe, 0.6.0b). rampPlates, maxGoldByDay and
// deckCost have one definition each, in src/sim/rivals.ts; this file imports them.

import { ITEMS, type HeroId } from "../sim/content";
import { warlordBuild } from "../sim/ai";
import type { Build } from "../sim/deck";
import { deckCost, maxGoldByDay, rampPlates } from "../sim/rivals";

/** Hull one ARMOR PLATING adds (+25). */
export const plateHull = ITEMS.plating.supply!.hull!;

export interface HonestStandIn {
  build: Build;
  plates: number; // plating on the deck (hullBonus = plates x plateHull)
  fromDay: number; // the warlord day whose gates it carries (= day unless even 0 plates did not fit)
}

/** An honest warlord-gate deck for `day`, with how it was fitted to the budget. */
export function honestStandIn(hero: HeroId, day: number): HonestStandIn {
  const budget = maxGoldByDay(day);
  for (let d = day; d >= 1; d--) {
    const build = warlordBuild(hero, d);
    for (let plates = d === day ? rampPlates(day) : 0; plates >= 0; plates--) {
      build.hullBonus = plates * plateHull;
      if (deckCost(build).total <= budget) return { build, plates, fromDay: d };
    }
  }
  const build = warlordBuild(hero, 1); // unreachable while day 1's warlord deck fits START_GOLD
  build.hullBonus = 0;
  return { build, plates: 0, fromDay: 1 };
}

/** Today's warlord build with honest hull: rampPlates(day) plating, dropped until the deck fits
 *  maxGoldByDay(day); with no plating left to drop, the latest earlier day's warlord deck that fits. */
export function honestStandInBuild(hero: HeroId, day: number): Build {
  return honestStandIn(hero, day).build;
}

/** The best deck a player could own on `day` from warlord gates reaching `reach` days ahead:
 *  the latest warlord build (up to day + reach) that fits the budget, the rest spent on plating. */
export function strongHonestBuild(hero: HeroId, day: number, reach: number): Build {
  const budget = maxGoldByDay(day);
  for (let d = Math.max(day, day + reach); d >= 1; d--) {
    const build = warlordBuild(hero, d);
    build.hullBonus = 0;
    const left = budget - deckCost(build).total;
    if (left < 0) continue;
    build.hullBonus = Math.floor(left / ITEMS.plating.price) * plateHull;
    return build;
  }
  return honestStandInBuild(hero, day);
}
