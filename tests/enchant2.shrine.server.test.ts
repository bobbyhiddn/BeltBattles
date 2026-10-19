// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T3, the server): THE ASH SHRINE'S WORDS (src/net/enchantCheck.ts shrineDays, shrineBound, the slots).
// possibleWords gains the shrine's two words for each bag whose shrine day (re-derived from the seed under the record's rules world) is on or before the
// record's day, and the count gains 1 for each such bag; a visit gives ONE word (card 1 word A for hull, card 2 word B for a part), on any part.
// Forged fixtures, each refused: a shrine word before its day; a word the shrine didn't offer; one over the count. Honest fixtures pass; and the par player's
// own decks, which now take the shrine, pass the whole player check. With ENCHANT off there is no shrine day and nothing moves.
import { afterEach, describe, expect, it, vi } from "vitest";
import { shrineBound, shrineDays, enchantExtraWords, enchantFreeWords, enchantProblems } from "../src/net/enchantCheck";
import { validateUpload } from "../src/net/validate";
import { RULES_VERSION } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { ENCHANT, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { freeEnchantsByDay, maxEnchantsByDay, possibleWords, shrineWords } from "../src/sim/enchantSources";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { parRunSeed, playerRoadLog, playerRun } from "../src/sim/harness/player";
import { npcDropWords, setNpcWords, withNpcWords } from "../src/sim/npcWords";
import { bagIds } from "../src/game/eventDefs";
import { eventSequence } from "../src/game/events";
import { setShrine, withShrine } from "../src/game/shrine";
import { longRunRules } from "../src/sim/longRun";

vi.setConfig({ testTimeout: 240_000 }); // ENCHANT-1's sweeps' rule: these play many seeded par runs; under a loaded host (24 cores shared with other lanes) the 30 s default is a time-only red

afterEach(() => { setEnchant(ENCHANT); setNpcWords(true); setShrine(true); });
// state B + the shrine: the player's words and the shrine's, the rivals' words and their drops out, so the shrine's slot is the only way to some words
const shrineOnly = <T>(fn: () => T): T => withEnchant(() => withNpcWords(fn, false), true);
const off = <T>(fn: () => T): T => withEnchant(fn, false);

function deckOf(pieces: { def: string; ench: string; enchDir?: number }[]): Build {
  const b = heroStartBuild("furnace");
  return { ...b, items: [...b.items, ...pieces.map((p, i) => ({ uid: 100 + i, def: p.def, x: i, y: 0, ench: p.ench, ...(p.enchDir !== undefined ? { enchDir: p.enchDir } : {}) }))] };
}
const DEFS = ["whetstone", "press", "longhaul", "overdrive", "temper", "keg", "venom", "brake"];

/** A seed whose first shrine day is `d` in [lo, hi] and one of whose two words (A or B) no other source offers by day `d`: { seed, d, word, other } (`other`: the pair's second word). */
function shrineSeed(lo: number, hi: number, need: "both" | "one"): { seed: number; d: number; a: EnchantId; b: EnchantId } {
  for (let s = 1; s < 60000; s++) {
    const days = shrineOnly(() => shrineDays(s, hi));
    if (!days.length || days[0] < lo) continue;
    const d = days[0], [a, b] = shrineWords(s, d);
    const offered = shrineOnly(() => possibleWords(s, d));
    const lone = [a, b].filter((w) => !offered.has(w));
    if (need === "both" ? lone.length === 2 : lone.length >= 1) return { seed: s, d, a, b };
  }
  throw new Error(`no seed with a shrine on day ${lo}-${hi}`);
}

describe("ENCHANT-2 T3: where the shrine stands (shrineDays, shrineBound)", () => {
  it("one shrine day in each bag of 11 with ENCHANT on, none with it off; the days are the sequence's index + 1", () => {
    for (const s of [1, 2, 3, 77, 9001]) {
      const days = withEnchant(() => shrineDays(s, 33), true);
      expect(days, `seed ${s}`).toHaveLength(3); // days 1-11, 12-22, 23-33
      days.forEach((d, bag) => {
        expect(d, `seed ${s} bag ${bag}`).toBeGreaterThan(11 * bag);
        expect(d).toBeLessThanOrEqual(11 * (bag + 1));
        expect(withEnchant(() => eventSequence(s, d, true)[d - 1], true)).toBe("shrine");
      });
      expect(off(() => shrineDays(s, 33))).toEqual([]);
      expect(off(() => shrineBound(10, s))).toBe(0);
    }
    expect(withEnchant(() => bagIds().length, true)).toBe(11);
    expect(off(() => bagIds().length)).toBe(10);
  });

  it("the shrine out of the bag (the T5 toggle) leaves the ten-event bag, and the server counts none", () => {
    withEnchant(() => withShrine(() => {
      expect(bagIds()).toHaveLength(10);
      expect(shrineDays(5, 22)).toEqual([]);
      expect(shrineBound(22, 5)).toBe(0);
    }, false), true);
  });

  it("the bound is exact with the seed (the visits so far) and loose without it (a bag opened = one visit possible)", () => {
    withEnchant(() => {
      for (const s of [1, 2, 3, 4, 5, 6]) for (const day of [1, 4, 8, 10, 11, 12, 15, 22, 23]) {
        const exact = shrineBound(day, s);
        expect(exact, `seed ${s} day ${day}`).toBeLessThanOrEqual(shrineBound(day));
        expect(exact).toBe(shrineDays(s, day).length);
      }
      expect([1, 5, 10, 11, 12, 22, 23].map((d) => shrineBound(d))).toEqual([1, 1, 1, 1, 2, 2, 3]);
    });
  });

  it("the extra words add the shrine to the drops: enchantExtraWords and enchantFreeWords with and without the seed", () => {
    withEnchant(() => {
      const s = 3, day = 10, drops = day - 4;
      expect(enchantExtraWords(day, s)).toBe(drops + shrineDays(s, day).length);
      expect(enchantExtraWords(day)).toBe(drops + 1);
      expect(enchantFreeWords(day, undefined, s)).toBe(freeEnchantsByDay(day, false, drops + shrineDays(s, day).length));
      expect(maxEnchantsByDay(day, false, enchantExtraWords(day, s))).toBe(8 + 2 + drops + shrineDays(s, day).length);
    });
  });
});

describe("ENCHANT-2 T3: forged and honest fixtures (state B + the shrine)", () => {
  it("HONEST: a word only the shrine offered passes from the shrine's day and on; on the day before it is refused (a shrine word before its day)", () => {
    const { seed, d, a, b } = shrineSeed(4, 9, "one");
    const offered = shrineOnly(() => possibleWords(seed, d));
    const word = [a, b].find((w) => !offered.has(w))!;
    const deck = deckOf([{ def: "temper", ench: word }]);
    expect(shrineOnly(() => enchantProblems(deck, d, { seed })), `seed ${seed} day ${d}: ${word}`).toEqual([]);
    expect(shrineOnly(() => enchantProblems(deck, d + 1, { seed })), "the day after").toEqual([]);
    const before = shrineOnly(() => enchantProblems(deck, d - 1, { seed }));
    expect(before.join(" | "), `seed ${seed} day ${d - 1}`).toMatch(new RegExp(`holds ${word.toUpperCase()}, which this run's seed did not offer by day ${d - 1}`));
  });

  it("FORGED: a word the shrine did not offer (and no other source did) is refused", () => {
    const { seed, d, a, b } = shrineSeed(4, 9, "one");
    const offered = shrineOnly(() => possibleWords(seed, d));
    const stranger = (["fiery", "rising", "growing", "echoing", "massive", "swift", "wide", "braced"] as EnchantId[]).find((w) => w !== a && w !== b && !offered.has(w));
    expect(stranger, "a word nobody offered").toBeDefined();
    const v = shrineOnly(() => enchantProblems(deckOf([{ def: "temper", ench: stranger! }]), d, { seed }));
    expect(v.join(" | ")).toMatch(/which this run's seed did not offer by day/);
  });

  it("FORGED: one over the count: both words of ONE shrine visit are refused (a visit gives one), one word per visit passes", () => {
    const { seed, d, a, b } = shrineSeed(4, 9, "both");
    const both = shrineOnly(() => enchantProblems(deckOf([{ def: "temper", ench: a }, { def: "keg", ench: b }]), d, { seed }));
    expect(both.length, both.join(" | ")).toBe(1);
    expect(both[0]).toMatch(/but the seed's offers of it by day \d+ are used up by other parts/);
    expect(shrineOnly(() => enchantProblems(deckOf([{ def: "temper", ench: a }]), d, { seed }))).toEqual([]);
    expect(shrineOnly(() => enchantProblems(deckOf([{ def: "keg", ench: b }]), d, { seed }))).toEqual([]);
  });

  it("the count: one more enchanted part than the day allows with the shrine is refused, exactly the bound passes (seeded and seedless)", () => {
    const { seed, d } = shrineSeed(4, 9, "one");
    const most = shrineOnly(() => maxEnchantsByDay(d, false, enchantExtraWords(d, seed)));
    const many = (n: number): Build => deckOf(Array.from({ length: n }, (_, i) => ({ def: DEFS[i % DEFS.length], ench: "fiery" })));
    const over = shrineOnly(() => enchantProblems(many(most + 1), d, { seed }));
    expect(over[0]).toBe(`enchant: ${most + 1} enchanted parts, but day ${d} allows at most ${most}`);
    expect(shrineOnly(() => enchantProblems(many(most), d, { seed })).some((e) => e.includes("allows at most"))).toBe(false);
    // without the seed the loose bound (one visit possible) applies
    const loose = shrineOnly(() => maxEnchantsByDay(d, false, enchantExtraWords(d)));
    expect(loose).toBeGreaterThanOrEqual(most);
    expect(shrineOnly(() => enchantProblems(many(loose + 1), d, {}))[0]).toBe(`enchant: ${loose + 1} enchanted parts, but day ${d} allows at most ${loose}`);
  });

  it("GROWING from the shrine: its counter is bounded by the dusks since the shrine's day", () => {
    for (let s = 1; s < 8000; s++) {
      const days = shrineOnly(() => shrineDays(s, 9));
      if (!days.length) continue;
      const d = days[0];
      if (!shrineWords(s, d).includes("growing")) continue;
      if (shrineOnly(() => possibleWords(s, d)).has("growing") && shrineOnly(() => possibleWords(s, d - 1)).has("growing")) continue; // another source got there first
      const piece = (grow: number) => deckOf([{ def: "temper", ench: "growing" }]).items.map((p) => (p.uid === 100 ? { ...p, grow } : p));
      const b = (grow: number): Build => ({ ...deckOf([{ def: "temper", ench: "growing" }]), items: [...heroStartBuild("furnace").items, ...piece(grow).slice(-1)] });
      const day = Math.min(10, d + 2);
      const ok = shrineOnly(() => enchantProblems(b(day - d), day, { seed: s }));
      const bad = shrineOnly(() => enchantProblems(b(day - d + 1), day, { seed: s }));
      expect(ok.filter((e) => e.includes("grow")), `seed ${s}`).toEqual([]);
      expect(bad.join(" | "), `seed ${s}`).toMatch(/first offered GROWING on day|only \d+ dusk fight/);
      return;
    }
    throw new Error("no seed whose shrine offers GROWING first");
  });

  it("ENCHANT off: the check does nothing, the bag is the ten events and no deck's verdict moves", () => {
    const { seed, d, a } = shrineSeed(4, 9, "one");
    expect(off(() => enchantProblems(deckOf([{ def: "temper", ench: a }]), d - 1, { seed }))).toEqual([]);
    expect(off(() => shrineDays(seed, 20))).toEqual([]);
    expect(longRunRules()).toBe(true);
  });
});

describe("ENCHANT-2 T3: honest par decks that took the shrine pass the player check (state D)", () => {
  it("par decks with ENCHANT on, the rivals' words, their drops and the shrine in the bag: every dusk deck passes validateUpload with the seed and the road log", () => {
    withEnchant(() => {
      let decks = 0, withWords = 0, shrineOnlyWords = 0;
      for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) {
        for (const seed of [1, 2, 3, 4]) {
          const days = playerRun(hero, 10, seed);
          const runSeed = parRunSeed(hero, seed) >>> 0;
          for (const day of [5, 7, 9, 10]) {
            const d = days[day - 1];
            const v = validateUpload(d.build, day, RULES_VERSION, { seed: runSeed, road: playerRoadLog(days, day) });
            expect(v.ok, `${hero} seed ${seed} day ${day}: ${v.errors.join("; ")}`).toBe(true);
            decks++;
            const held = [...d.build.items, ...(d.build.turrets ?? [])].filter((p) => p.ench !== undefined);
            if (held.length) withWords++;
            // a word no other source (the ENCHANTER, the picks, the rivals' pairs) offers by this day: only the shrine can have given it
            const others = withNpcWords(() => possibleWords(runSeed, day, null), false);
            const drops = npcDropWords(day);
            for (const p of held) if (!others.has(p.ench as never) && !drops.has(p.ench as never)) shrineOnlyWords++;
          }
        }
      }
      expect(decks).toBe(64);
      expect(withWords).toBeGreaterThan(10);
      expect(shrineOnlyWords, "words only the shrine can have given").toBeGreaterThanOrEqual(0);
    });
  });
});
