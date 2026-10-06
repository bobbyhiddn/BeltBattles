// Y-INT (release Y; BRIEF-YINT scope 6, REVIEW-Y2's trap): the module-level caches at the Y-INT tip, read with the star
// switch on, off, then on again in one process (vitest runs a file's tests in one module graph, as a tool does).
// The three caches whose result reads a switch-gated rule carry the switch in their key or in their key's object, and
// their own Y tests read them on/off/on: stars.ts effectAt (`def*s*Y`, y2.switch), overclock.ts overclocked (a WeakMap
// on the effect, which is its own object with the switch on: y6.venom) and harness/player.ts playerRun (`|star`,
// 1f8e129). Every other cache reads nothing a switch-gated rule moves; this file pins that for the ones that read the
// item catalogue or the glossary: a cached read with the switch off equals a fresh one with it on, and back.
// - net/roadCap.ts's six memos read the catalogue's prices, rarities, merchants and kinds (and the road's events and the
//   captains' decks): no STAR_DIFF row moves any of those.
// - deck.ts startViews and startHeroes hold the starting turrets' slot views and HeroDefs.
// - glossary.ts GLOSSARY (built once, at load, with the switch off) and its FORMS: with the switch on the rows differ
//   only by STAR_RETIRED's, which glossaryEntry and glossaryRows drop then (Y2's design).
// Y7b2 (the flip): the switch is gone, so the on/off/on reads left with it (the catalogue check and the road memo's);
// what stays reads the one rule set: a cached starting layout is a fresh one, and the glossary holds no retired row.
import { describe, expect, it } from "vitest";
import { HEROES, type HeroId } from "../src/sim/content";
import { hero, startingTurrets, turretSlots, type Build } from "../src/sim/deck";
import { GLOSSARY, glossaryEntry, glossaryRows } from "../src/ui/glossary";

const HEROS = Object.keys(HEROES) as HeroId[];
const bare = (h: HeroId): Build => ({ hero: h, items: [], routes: [], mods: [], beltCap: 24, hullBonus: 0 });
/** The rows the star switch retired (glossary.ts STAR_RETIRED until the flip, Y7b2, which deleted them from the table). */
const RETIRED = ["HARASSMENT", "ONLINE", "POISON"];

describe("Y-INT cache audit: the caches that read the catalogue or the glossary need no switch in their key", () => {
  it("deck.ts startViews and startHeroes: a cached starting layout equals a fresh one", () => {
    // turretSlots / hero with the build's own `turrets` bypass the caches (a fresh resolveSlots)
    const fresh = (h: HeroId) => [turretSlots({ hero: h, turrets: startingTurrets(h) }), hero({ ...bare(h), turrets: startingTurrets(h) })];
    const cached = (h: HeroId) => [turretSlots({ hero: h }), hero(bare(h))];
    for (const h of HEROS) {
      expect(cached(h), h).toEqual(fresh(h));
    }
  });

  it("glossary.ts GLOSSARY (built once): glossaryRows() is its rows, none of RETIRED's, and glossaryEntry finds none of them", () => {
    const keep = GLOSSARY.filter((r) => !RETIRED.includes(r.word));
    expect(glossaryRows()).toEqual(keep);
    for (const w of RETIRED) {
      expect(glossaryEntry(w), w).toBeUndefined();
    }
  });
});
