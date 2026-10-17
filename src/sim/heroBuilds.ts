// One entry point for every hero's starting build and reference builds (races ruling 2).
// Furnace and Weaver come from ai.ts: startingBuild, and warlordBuild with its hull bonus
// replaced by the reference plating ramp, PLATE_STEP x rampPlates(day) (the warlord curve
// rounded to the NEAREST plate, never negative, as the dusk stand-in and the rival captains
// do). The four race heroes come from races/refBuilds.ts, on the same ramp. Every caller gets
// a deck of the hero it asked for: ai.ts alone would hand back a Loom deck labelled FOUNDRY.
// 0.6.2 BELTSIDE: both sources place rigs natively beside the belt (and migrate at load, D3, as
// a safety net), so these decks need nothing more here (tests/beltside.presets.test.ts).

import { startingBuild, warlordBuild } from "./ai";
import type { HeroId } from "./content";
import type { Build } from "./deck";
import { isRaceHero } from "./races/data";
import { PLATE_STEP, REF_DAYS, REF_DAYS_LONG, raceRefBuild, raceStartBuild, rampPlates, refDay, refHullDay } from "./races/refBuilds";

export { PLATE_STEP, REF_DAYS, REF_DAYS_LONG, rampPlates };

/** Heroes the game offers today: hero select shows them in this order. 0.8.0 H1 (REQ-BFG-011): FOUNDRY (human) and
 *  BASTION (dwarf) joined FURNACE and WEAVER; METRONOME and SIPHON follow in 0.9.0. What reads this list, and what was
 *  pinned to the 0.7.0 roster instead (the stand-in heroes, the harness's par field, the golden freeze), is in
 *  output-H1/REPORT.md section 1.1. */
export const PLAYABLE_HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

/** The deck `hero` starts a run with. */
export function heroStartBuild(hero: HeroId, uid0 = 1): Build {
  return isRaceHero(hero) ? raceStartBuild(hero, uid0) : startingBuild(hero, uid0);
}

/** Reference build of `hero` for `day` (1-10; other days clamp): a deck a player could own that day. RUN-1 (REQ-BFG-059, D5):
 *  with the long run in the game (longRun.ts), days 1-16 (REF_DAYS_LONG), and a later day is day 16's deck with that day's
 *  hull ramp. */
export function heroRefBuild(hero: HeroId, day: number): Build {
  const d = refDay(day);
  if (isRaceHero(hero)) return raceRefBuild(hero, refHullDay(day)); // RUN-1: past REF_DAYS, the day's own hull
  return { ...warlordBuild(hero, d), hullBonus: PLATE_STEP * rampPlates(refHullDay(day)) };
}
