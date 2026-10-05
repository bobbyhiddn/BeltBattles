// Y2 (release Y; REQ-BFG-070, REQ-BFG-046; REVIEW-STARD ruling R-2): THE STAR SWITCH, content.ts STAR_RULES. It ships off;
// withStarRules turns it on for a scope and puts it back, as withSustain does; ITEMS keeps its keys, order and objects
// whichever way it was turned, and with it off every piece is its base def.
import { describe, expect, it } from "vitest";
import { ITEMS, STAR_ITEMS, STAR_RULES, setStarRules, starRules, withStarRules } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";

describe("Y2: the star switch", () => {
  it("ships off; withStarRules turns it on for the call and back, even when the call throws", () => {
    expect([STAR_RULES, starRules()]).toEqual([false, false]);
    expect(withStarRules(() => starRules())).toBe(true);
    expect(starRules()).toBe(false);
    expect(withStarRules(() => withStarRules(() => starRules(), false))).toBe(false);
    expect(() => withStarRules(() => { throw new Error("boom"); })).toThrow("boom");
    expect(starRules()).toBe(false);
  });

  it("ITEMS keeps its keys, order and enumerability through a flip, and with it off each piece is its base def again", () => {
    const keys = Object.keys(ITEMS), before = keys.map((id) => ITEMS[id]);
    const stars = keys.filter((id) => ITEMS[id].levels).map((id) => [effectAt(id, 2), effectAt(id, 3)]);
    withStarRules(() => {
      expect(Object.keys(ITEMS)).toEqual(keys);
      for (const id of Object.keys(STAR_ITEMS)) expect(ITEMS[id]).toBe(STAR_ITEMS[id]);
    });
    expect(Object.keys(ITEMS)).toEqual(keys);
    keys.forEach((id, i) => expect(ITEMS[id]).toBe(before[i]));
    // effectAt's cache keys by the switch: off, every merged star is the very object it was
    expect(keys.filter((id) => ITEMS[id].levels).map((id) => [effectAt(id, 2), effectAt(id, 3)])).toEqual(stars);
    keys.filter((id) => ITEMS[id].levels).forEach((id, i) => expect(effectAt(id, 3)).toBe(stars[i][1]));
    setStarRules(false);
    expect(starRules()).toBe(false);
  });
});
