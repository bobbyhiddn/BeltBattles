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
import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, STAR_ITEMS, withStarRules, type HeroId } from "../src/sim/content";
import { hero, startingTurrets, turretSlots, type Build } from "../src/sim/deck";
import { discountGain, resetRoadCapMemo, roadOptions, warlordPays } from "../src/net/roadCap";
import { GLOSSARY, STAR_RETIRED, glossaryEntry, glossaryRows } from "../src/ui/glossary";

const on = <T>(fn: () => T): T => withStarRules(fn);
const HEROS = Object.keys(HEROES) as HeroId[];
const bare = (h: HeroId): Build => ({ hero: h, items: [], routes: [], mods: [], beltCap: 24, hullBonus: 0 });

describe("Y-INT cache audit: the caches that read the catalogue or the glossary need no switch in their key", () => {
  it("no switch-on def moves a catalogue field a cache reads (name, kind, price, rarity, merchant, size, tags, desc)", () => {
    const cat = (id: string) => { const d = ITEMS[id]; return [d.name, d.kind, d.price, d.rarity, d.merchant, d.size, d.tags, d.desc]; };
    const ids = Object.keys(STAR_ITEMS);
    expect(ids.length).toBe(30); // STAR_DIFF's Y2-Y6 rows at the Y-INT tip (the other Y pieces change only the sim's reading). Y7b1 (Y7A-R3d: IRON WALL's row deleted): was 31; (Y7A-R3c: ANVIL's row deleted): was 32
    for (const id of ids) expect(on(() => cat(id)), id).toEqual(cat(id));
  });

  it("net/roadCap.ts: warlordPays, discountGain and roadOptions read off, on (fresh), then off again (cached) are equal", () => {
    const read = () => ({ hard6: warlordPays("hard", 6), easy3: warlordPays("easy", 3), dg: discountGain(2, 40), opts: [...roadOptions().entries()].map(([k, v]) => [k, v.length]) });
    resetRoadCapMemo();
    const off1 = read(); // cached now, with the switch off
    const onCached = on(read); // handed back from the memo
    resetRoadCapMemo();
    const onFresh = on(read); // computed with the switch on
    const offAgain = read(); // the switch-on result, cached, read off
    expect(onCached).toEqual(off1);
    expect(onFresh).toEqual(off1);
    expect(offAgain).toEqual(off1);
    resetRoadCapMemo();
  });

  it("deck.ts startViews and startHeroes: a cached starting layout equals a fresh one with the switch on, off and on", () => {
    // turretSlots / hero with the build's own `turrets` bypass the caches (a fresh resolveSlots)
    const fresh = (h: HeroId) => [turretSlots({ hero: h, turrets: startingTurrets(h) }), hero({ ...bare(h), turrets: startingTurrets(h) })];
    const cached = (h: HeroId) => [turretSlots({ hero: h }), hero(bare(h))];
    for (const h of HEROS) {
      const off1 = cached(h);
      expect(on(() => cached(h)), `${h} on`).toEqual(on(() => fresh(h)));
      expect(cached(h), `${h} off`).toEqual(fresh(h));
      expect(on(() => cached(h)), `${h} on again`).toEqual(off1);
    }
  });

  it("glossary.ts GLOSSARY (built once, off): with the switch on the rows differ only by STAR_RETIRED's, which glossaryEntry skips then", () => {
    const keep = GLOSSARY.filter((r) => !STAR_RETIRED.includes(r.word));
    expect(on(() => glossaryRows())).toEqual(keep);
    expect(glossaryRows()).toEqual(GLOSSARY);
    expect(on(() => glossaryRows())).toEqual(keep);
    for (const w of STAR_RETIRED) {
      expect(on(() => glossaryEntry(w)), `${w} on`).toBeUndefined();
      expect(glossaryEntry(w)?.word, `${w} off`).toBe(w);
    }
  });
});
