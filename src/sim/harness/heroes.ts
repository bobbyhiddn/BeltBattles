// Balance harness: the one local adapter between the harness and per-hero content.
// ai.ts knows Furnace and Weaver; races/warlords.ts knows FOUNDRY and BASTION. Races part 2
// adds a hero-generic heroStartBuild / heroRefBuild and PLAYABLE_HEROES; integration swaps
// the three exports below for those (and METRONOME / SIPHON then join automatically).

import { startingBuild, warlordBuild } from "../ai";
import { HEROES, ITEMS, type HeroId } from "../content";
import type { Build } from "../deck";
import { raceWarlordBuild, startingRaceBuild } from "../races/warlords";
import { buildCost, maxGoldByDay } from "../../net/validate";

/** Heroes the sim can build today, in report order. Part 2: PLAYABLE_HEROES. */
export const HARNESS_HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

const isRace = (h: HeroId): h is "foundry" | "bastion" => h === "foundry" || h === "bastion";

/** The hero's starting deck (signature factory wired to a live gun). Part 2: heroStartBuild. */
export function heroStartBuild(hero: HeroId, uid0: number): Build {
  if (isRace(hero)) return startingRaceBuild(hero, uid0);
  if (hero !== "furnace" && hero !== "weaver") throw new Error(`harness: no starting build for ${hero}`);
  return startingBuild(hero, uid0);
}

/** The hand-made reference (warlord) deck for a day, as authored. Part 2: heroRefBuild. */
export function heroWarlordBuild(hero: HeroId, day: number): Build {
  if (isRace(hero)) return raceWarlordBuild(hero, day);
  if (hero !== "furnace" && hero !== "weaver") throw new Error(`harness: no reference build for ${hero}`);
  return warlordBuild(hero, day);
}

/**
 * The reference deck at an honest price, for calibration against random builds of the same
 * day: the warlord's machinery unchanged, its hull offset (warlordHull, negative on early
 * days) replaced by whole plating that fits the day's gold (tools/samplePool.ts, variant 0).
 */
export function heroRefBuild(hero: HeroId, day: number): Build {
  const b = heroWarlordBuild(hero, day);
  const plate = ITEMS.plating.supply!.hull!;
  b.hullBonus = Math.max(0, Math.round(b.hullBonus / plate)) * plate;
  while (b.hullBonus > 0 && buildCost(b).total > maxGoldByDay(day)) b.hullBonus -= plate;
  return b;
}

export const heroName = (h: HeroId): string => HEROES[h].name;
