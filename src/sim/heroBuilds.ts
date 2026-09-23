// One entry point for every hero's starting build and reference builds (races ruling 2).
// Furnace and Weaver come from ai.ts (startingBuild, and warlordBuild with its hull bonus
// rounded down to whole plating and never negative); the four race heroes come from
// races/refBuilds.ts. Every caller gets a deck of the hero it asked for: ai.ts alone would
// hand back a Loom deck labelled FOUNDRY.

import { startingBuild, warlordBuild } from "./ai";
import type { HeroId } from "./content";
import type { Build } from "./deck";
import { isRaceHero } from "./races/data";
import { REF_DAYS, raceRefBuild, raceStartBuild, refDay, wholePlating } from "./races/refBuilds";

export { REF_DAYS };

/** Heroes the game offers today. The 0.8.0/0.9.0 integration grows this list. */
export const PLAYABLE_HEROES: readonly HeroId[] = ["furnace", "weaver"];

/** The deck `hero` starts a run with. */
export function heroStartBuild(hero: HeroId, uid0 = 1): Build {
  return isRaceHero(hero) ? raceStartBuild(hero, uid0) : startingBuild(hero, uid0);
}

/** Reference build of `hero` for `day` (1-10; other days clamp): a deck a player could own that day. */
export function heroRefBuild(hero: HeroId, day: number): Build {
  const d = refDay(day);
  if (isRaceHero(hero)) return raceRefBuild(hero, d);
  const b = warlordBuild(hero, d);
  return { ...b, hullBonus: wholePlating(b.hullBonus) };
}
