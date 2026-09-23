// Honest dusk decks (0.6.0a M3b, rulings R1/R2): every dusk opponent is a deck a player could own
// that day. The stand-in keeps today's warlord production build but its hull comes only from whole
// ARMOR PLATING a player could have bought, and the whole deck must fit the gold a player can have
// received by that dusk. Kept apart from ghosts.ts so 0.6.0b can swap in the rival captains'
// standInBuild. The sim (src/sim/*) is not touched: only the deck the stand-in brings changes.

import { HEROES, ITEMS, START_GOLD, incomeFor, type HeroId } from "../sim/content";
import { warlordBuild, warlordHull } from "../sim/ai";
import type { Build } from "../sim/deck";

/** Hull one ARMOR PLATING adds (+25). */
export const plateHull = ITEMS.plating.supply!.hull!;

/** Plates the stand-in carries on `day`: the warlord's hull ramp rounded to whole plating, never negative. */
export function rampPlates(day: number): number {
  return Math.max(0, Math.round(warlordHull(day) / plateHull)) || 0;
}

/** Most gold a player can have received before the dusk of `day` (1-based): start gold + every earlier win's income. */
export function maxGoldByDay(day: number): number {
  let gold = START_GOLD;
  for (let d = 1; d < day; d++) gold += incomeFor(d, true);
  return gold;
}

const price = (id: string): number => (Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id].price : 0);

/** What a deck costs to own; mirrors ref/async-validate buildCost exactly: items + turret mods
 *  + belt crates above the hero's base belt + plating implied by hullBonus. */
export function deckCost(b: Build): number {
  const h = HEROES[b.hero];
  const crate = ITEMS.beltcrate, plate = ITEMS.plating;
  const items = b.items.reduce((s, p) => s + price(p.def), 0);
  const mods = b.mods.reduce((s, m) => s + price(m.def), 0);
  const crates = Math.max(0, Math.ceil((b.beltCap - h.belt) / crate.supply!.belt!));
  const plates = Math.max(0, Math.ceil(b.hullBonus / plate.supply!.hull!));
  return items + mods + crates * crate.price + plates * plate.price;
}

export interface HonestStandIn {
  build: Build;
  plates: number; // plating on the deck (hullBonus = plates x plateHull)
  fromDay: number; // the warlord day whose gates it carries (= day unless even 0 plates did not fit)
}

/** The stand-in deck for `day`, with how it was fitted to the budget (for tests and the report). */
export function honestStandIn(hero: HeroId, day: number): HonestStandIn {
  const budget = maxGoldByDay(day);
  for (let d = day; d >= 1; d--) {
    const build = warlordBuild(hero, d);
    for (let plates = d === day ? rampPlates(day) : 0; plates >= 0; plates--) {
      build.hullBonus = plates * plateHull;
      if (deckCost(build) <= budget) return { build, plates, fromDay: d };
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
 *  the latest warlord build (up to day + reach) that fits the budget, the rest spent on plating.
 *  Tooling only (strong pool ghosts for scripted runs and shots). */
export function strongHonestBuild(hero: HeroId, day: number, reach: number): Build {
  const budget = maxGoldByDay(day);
  for (let d = Math.max(day, day + reach); d >= 1; d--) {
    const build = warlordBuild(hero, d);
    build.hullBonus = 0;
    const left = budget - deckCost(build);
    if (left < 0) continue;
    build.hullBonus = Math.floor(left / ITEMS.plating.price) * plateHull;
    return build;
  }
  return honestStandInBuild(hero, day);
}
