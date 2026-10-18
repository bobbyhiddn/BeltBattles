// ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 3.3): THE GOD STAND-IN, the last foe of an endless dusk. At launch nobody has endless
// ghosts, so every endless foe is this one until players upload; afterwards it is the foe wherever no endless ghost is near.
// PvE only: it is never uploaded and never validated as a player deck (a stand-in's deck is checked as the stand-in pool checks
// every deck, by the generator and tests/standInPool.gen.test.ts); an endless request never serves it from the store.
//
// WHAT IT IS, for an endless dusk on day d with `w` endless wins in hand: the stand-in pool's STRONGEST deck at standInDay(d)
// (the pool holds days 1-16; a later day takes day 16's, standInPool.ts STAND_IN_GEN_DAYS), fought on day d's own hull and gold
// (the battle takes d: hullScale.ts M(d) scales both hulls, and the damage and sustain day terms follow; the deck's gold is the
// pool's, which the day's maxGoldByDay only ever exceeds), plus ENDLESS_GOD_HULL_STEP of hull for each endless win (the ONE
// tunable number, endless.ts; bench-tuned).
//
// "STRONGEST", deterministic and from committed data only (no battle is played at run time): across every hero of the pool, the
// entry with the highest `vsPar` (the stored lowest mean win rate against the day's par field of each pool hero, standInPool.ts
// StandInEntry.vsPar: the generator's own strength grade for a deck against the day's average player), then the higher `pct`
// (strength percentile inside its population), then the hero's place in the pool, then the entry's place in the pool's pct
// order. tests/endless1.god.test.ts pins the rule and reads the day-by-day picks.

import type { HeroId } from "./content";
import type { Build } from "./deck";
import { ENDLESS_GOD_HULL_STEP } from "./endless";
import { STAND_IN_POOL_HEROES, standInDay, standInPool, type StandInEntry } from "./standInPool";

/** The name an endless dusk's stand-in carries (the NEXT BATTLE card, the enemy plate, the replay's foe line). */
export const GOD_NAME = "THE GOD";

interface Pick { hero: HeroId; at: number }
const picks = new Map<number, Pick>();

/** Where the GOD's deck sits on pool day `d` (1..STAND_IN_POOL_DAYS): the hero and the entry's place in standInPool(hero, d)
 *  (pct order). The choice reads the stored grades only; the deck is decoded fresh by every caller. */
function pickOn(d: number): Pick {
  const hit = picks.get(d);
  if (hit) return hit;
  let best: Pick | null = null, bestEntry: StandInEntry | null = null;
  for (const hero of STAND_IN_POOL_HEROES) {
    const list = standInPool(hero, d);
    for (let at = 0; at < list.length; at++) {
      const e = list[at];
      if (!bestEntry || e.vsPar > bestEntry.vsPar || (e.vsPar === bestEntry.vsPar && e.pct > bestEntry.pct)) {
        best = { hero, at };
        bestEntry = e;
      }
    }
  }
  if (!best) throw new Error(`godStandIn: the stand-in pool holds no deck on day ${d}`);
  picks.set(d, best);
  return best;
}

/** The GOD's pool entry on day `day` (a fresh copy; `entry.day` is the pool day it came from: standInDay(day)). */
export function godEntry(day: number): StandInEntry {
  const d = standInDay(day);
  const p = pickOn(d);
  return standInPool(p.hero, d)[p.at];
}

/** The GOD's deck for an endless dusk on day `day` when the player has `endlessWins` endless wins: the pool's strongest deck of
 *  standInDay(day), its hull raised by ENDLESS_GOD_HULL_STEP per endless win. A fresh build. */
export function godBuild(day: number, endlessWins: number, step: number = ENDLESS_GOD_HULL_STEP): Build {
  const b = godEntry(day).build;
  return { ...b, hullBonus: b.hullBonus + step * Math.max(0, Math.floor(endlessWins)) };
}

/** The GOD as a dusk foe (the fields day.ts chooseFoe stores in run.dusk). */
export function godFoe(day: number, endlessWins: number, step: number = ENDLESS_GOD_HULL_STEP): { name: string; hero: HeroId; build: Build } {
  const b = godBuild(day, endlessWins, step);
  return { name: GOD_NAME, hero: b.hero, build: b };
}
