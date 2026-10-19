// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T2, the server): A WORD MAY ALSO COME FROM A WARLORD'S DROP (src/net/enchantCheck.ts, src/sim/npcWords.ts).
// The pair (def, word[/side]) must be one some rival holds on a day from 5 to the record's day, and such words count against a drop bound of ONE A DAY
// from day 5 (one warlord fight a day: "bound 2 until D1's receipts", PIECES-1 4.7.3, here 1). Forged fixtures, each refused: a dropped word no rival holds;
// a drop word before day 5 (or before the day its rival holds it); one over the bound; a pair no rival holds (the word on another part, WIDE on another side).
// Honest fixtures pass: hand decks, and the par player's own decks (which take drops with their words) through the whole player check.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENCHANT, ENCHANT_IDS, setEnchant, withEnchant } from "../src/sim/enchant";
import { enchantFreeWords, enchantExtraWords, enchantProblems } from "../src/net/enchantCheck";
import { enchanterWords, freeEnchantsByDay, maxEnchantsByDay, possibleWords } from "../src/sim/enchantSources";
import { NPC_WORDS, npcDropPairs, npcDropWords, npcDropsByDay, npcGrantDay } from "../src/sim/npcWords";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";
import { RULES_VERSION } from "../src/sim/content";
import { parRunSeed, playerRoadLog, playerRun } from "../src/sim/harness/player";
import { validateUpload } from "../src/net/validate";
import { RIVAL_IDS } from "../src/sim/rivals";
import { setShrine, withShrine } from "../src/game/shrine";

vi.setConfig({ testTimeout: 240_000 }); // ENCHANT-1's sweeps' rule: these play many seeded par runs; under a loaded host (24 cores shared with other lanes) the 30 s default is a time-only red

afterEach(() => { setEnchant(ENCHANT); setShrine(true); }); // the shipped values (ENCHANT off; the shrine in the bag when it is on)
// state C: the rivals' words and their drops, the ASH SHRINE out of the bag (tests/enchant2.shrine.server.test.ts is state D)
const on = <T>(fn: () => T): T => withEnchant(() => withShrine(fn, false), true);
const off = <T>(fn: () => T): T => withEnchant(fn, false);

/** FURNACE's start deck plus the named pieces (raw: the check reads the word fields, not the layout). */
function deckOf(pieces: { def: string; ench: string; enchDir?: number }[]): Build {
  const b = heroStartBuild("furnace");
  return { ...b, items: [...b.items, ...pieces.map((p, i) => ({ uid: 100 + i, def: p.def, x: i, y: 0, ench: p.ench, ...(p.enchDir !== undefined ? { enchDir: p.enchDir } : {}) }))] };
}

/** The first seed whose ENCHANT-1 sources (the ENCHANTER, the warlord picks) never offer `word` by `day`: only a warlord's drop can have given it. */
function seedWithout(word: string, day: number): number {
  for (let s = 1; s < 20000; s++) if (!possibleWords(s, day).has(word as never)) return s;
  throw new Error(`no seed lacks ${word} by day ${day}`);
}

describe("ENCHANT-2 T2: what the pairs and the bound are", () => {
  it("npcDropPairs(day): nothing before day 5, a rival's first word from day 5, the second from day 8, the third from day 12 (the Matriarch from day 8)", () => {
    /** The first day some rival holds the pair (def, word[/side]): the least npcGrantDay over the table's grants of it. */
    const firstDay = (key: string): number => Math.min(...RIVAL_IDS.flatMap((id) => NPC_WORDS[id].filter((g) => `${g.def}:${g.word}${g.enchDir !== undefined ? `/${g.enchDir}` : ""}` === key).map((g) => npcGrantDay(id, g))));
    expect(npcDropPairs(4).size).toBe(0);
    expect(npcDropWords(4).size).toBe(0);
    expect(firstDay("temper:fiery")).toBe(5); // SOOTJAW, EMBERLYN, BRASSWICK ...
    expect(firstDay("venom:wide/2")).toBe(5); // LONGTOOTH's WIDE on a rig keeps its side
    expect(firstDay("kiln:fiery")).toBe(12); // the Matriarch's third word
    expect(firstDay("kiln:echoing")).toBe(12); // SOOTJAW's third
    expect(firstDay("press:braced")).toBe(8); // the Matriarch's first word is live the day she arrives, 8
    expect(firstDay("whetstone:rising")).toBe(12); // LONGTOOTH's third
    for (const [key, day] of [["temper:fiery", 5], ["venom:wide/2", 5], ["kiln:fiery", 12], ["kiln:echoing", 12], ["press:braced", 8], ["whetstone:rising", 12]] as const) {
      expect(npcDropPairs(day - 1).has(key), `${key} before day ${day}`).toBe(false);
      expect(npcDropPairs(day).has(key), `${key} on day ${day}`).toBe(true);
    }
    for (const id of RIVAL_IDS) for (const g of NPC_WORDS[id]) expect(npcDropPairs(npcGrantDay(id, g)).has(`${g.def}:${g.word}${g.enchDir !== undefined ? `/${g.enchDir}` : ""}`), `${id} ${g.def}`).toBe(true);
    expect(npcDropWords(16).has("growing" as never), "no rival holds GROWING").toBe(false);
    expect([...npcDropWords(16)].sort()).toEqual(["braced", "echoing", "fiery", "rising", "swift", "wide"]); // the table after T5a: no rival holds MASSIVE (KARSK's was cut) or GROWING
  });

  it("the drop bound is one a day from day 5; maxEnchantsByDay and freeEnchantsByDay take it as their extra and keep ENCHANT-1's numbers at 0", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(npcDropsByDay)).toEqual([0, 0, 0, 0, 1, 2, 3, 4, 5, 6]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(enchantExtraWords)).toEqual([0, 0, 0, 0, 1, 2, 3, 4, 5, 6]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => maxEnchantsByDay(d, false))).toEqual([0, 0, 2, 2, 5, 5, 7, 8, 10, 10]); // ENCHANT-1's, unchanged
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => maxEnchantsByDay(d, false, enchantExtraWords(d)))).toEqual([0, 0, 2, 2, 6, 7, 10, 12, 15, 16]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => freeEnchantsByDay(d, false, enchantExtraWords(d)))).toEqual([0, 0, 0, 0, 2, 3, 4, 6, 7, 8]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => enchantFreeWords(d, undefined))).toEqual([0, 0, 0, 0, 2, 3, 4, 6, 7, 8]);
  });
});

describe("ENCHANT-2 T2: forged and honest fixtures (ENCHANT on)", () => {
  it("HONEST: a word only a drop can have given (a rival's pair, day 5 on) passes; the same deck on day 4 is refused", () => {
    const s = seedWithout("fiery", 5);
    const d = deckOf([{ def: "temper", ench: "fiery" }]);
    expect(on(() => enchantProblems(d, 5, { seed: s }))).toEqual([]);
    expect(on(() => enchantProblems(d, 7, { seed: s }))).toEqual([]);
    const early = on(() => enchantProblems(d, 4, { seed: s }));
    expect(early.join(" | ")).toMatch(/holds FIERY, which this run's seed did not offer by day 4/); // a drop word before day 5
  });

  it("FORGED: a dropped word no rival holds (GROWING) is refused on every day", () => {
    for (const day of [5, 8, 10]) {
      const s = seedWithout("growing", day);
      const v = on(() => enchantProblems(deckOf([{ def: "temper", ench: "growing" }]), day, { seed: s }));
      expect(v.join(" | "), `day ${day}`).toMatch(/holds GROWING, which this run's seed did not offer by day/);
    }
  });

  it("FORGED: a word some rival holds, on a part no rival holds it on, is refused (the pair, not only the word)", () => {
    const s = seedWithout("fiery", 8);
    const v = on(() => enchantProblems(deckOf([{ def: "whetstone", ench: "fiery" }]), 8, { seed: s }));
    expect(v.join(" | ")).toMatch(/uid 100 .* holds FIERY, but the seed's offers of it by day 8 are used up by other parts/);
    // and WIDE on a rig on a side no rival's rig has it on
    const w = seedWithout("wide", 5);
    expect(on(() => enchantProblems(deckOf([{ def: "venom", ench: "wide", enchDir: 2 }]), 5, { seed: w })), "LONGTOOTH's side").toEqual([]);
    expect(on(() => enchantProblems(deckOf([{ def: "venom", ench: "wide", enchDir: 0 }]), 5, { seed: w })).join(" | "), "another side").toMatch(/used up by other parts/);
  });

  it("FORGED: a drop word before the day its rival holds it is refused, and passes from that day (KILN with ECHOING: SOOTJAW's third word, day 12; another rival holds ECHOING on a part from an earlier day, so the word is offered but the pair is not yet)", () => {
    const s = seedWithout("echoing", 12);
    const d = deckOf([{ def: "kiln", ench: "echoing" }]);
    expect(on(() => enchantProblems(d, 11, { seed: s })).join(" | ")).toMatch(/holds ECHOING, but the seed's offers of it by day 11 are used up by other parts/);
    expect(on(() => enchantProblems(d, 12, { seed: s }))).toEqual([]);
    // and the word itself before any rival holds it at all (day 4): not offered
    expect(on(() => enchantProblems(d, 4, { seed: seedWithout("echoing", 4) })).join(" | ")).toMatch(/holds ECHOING, which this run's seed did not offer by day 4/);
  });

  it("FORGED: one over the bound: day 5 has one drop, so two parts that only drops can explain are refused; day 6 has two and accepts them", () => {
    const s = seedWithout("fiery", 6);
    const d = deckOf([{ def: "temper", ench: "fiery" }, { def: "doublestamp", ench: "fiery" }]); // both are rival pairs from day 5 (SOOTJAW's TEMPER, GRUBNOSE's DOUBLE STAMP)
    const five = on(() => enchantProblems(d, 5, { seed: s }));
    expect(five.length, five.join(" | ")).toBe(1);
    expect(five[0]).toMatch(/but the seed's offers of it by day 5 are used up by other parts/);
    expect(on(() => enchantProblems(d, 6, { seed: s }))).toEqual([]);
    // and the day's count: 17 enchanted parts on day 10 are over 16 (8 bought + 2 picks + 6 drops), 16 are not
    const many = (n: number): Build => deckOf(Array.from({ length: n }, () => ({ def: "temper", ench: "fiery" })));
    const sNo = seedWithout("fiery", 10);
    const over = on(() => enchantProblems(many(17), 10, { seed: sNo }));
    expect(over[0]).toBe("enchant: 17 enchanted parts, but day 10 allows at most 16");
    expect(on(() => enchantProblems(many(16), 10, { seed: sNo })).some((e) => e.includes("allows at most")), "16 is within the count").toBe(false);
    // without the seed (a served ghost, a stand-in, a pool deck) only the count is checked: it counts the drops too
    expect(on(() => enchantProblems(many(16), 10, {}))).toEqual([]);
    expect(on(() => enchantProblems(many(17), 10, {}))).toEqual(["enchant: 17 enchanted parts, but day 10 allows at most 16"]);
  });

  it("the drop slots are in ADDITION to ENCHANT-1's: a deck holding the ENCHANTER's four words of days 3 and 5 plus a drop's word is honest on day 5; one more word nobody offers is not", () => {
    const s = seedWithout("fiery", 5);
    const bought = [...enchanterWords(s, 3), ...enchanterWords(s, 5)]; // four words, bought at the ENCHANTER
    expect(bought).toHaveLength(4);
    const defs = ["whetstone", "press", "longhaul", "overdrive"];
    const pieces = bought.map((w, i) => ({ def: defs[i], ench: w as string }));
    const honest = deckOf([...pieces, { def: "temper", ench: "fiery" }]);
    expect(on(() => enchantProblems(honest, 5, { seed: s })), "four bought + one dropped").toEqual([]);
    // the same four plus the drop's word plus a WIDE on a rig nobody holds that side of (nothing offers it): refused
    const sNoWide = seedWithout("wide", 5);
    const bought2 = [...enchanterWords(sNoWide, 3), ...enchanterWords(sNoWide, 5)];
    const forged = deckOf([...bought2.map((w, i) => ({ def: defs[i], ench: w as string })), { def: "venom", ench: "wide", enchDir: 0 }]);
    expect(on(() => enchantProblems(forged, 5, { seed: sNoWide })).join(" | ")).toMatch(/used up by other parts/);
  });

  it("ENCHANT off: the check does nothing, so no deck's verdict moves", () => {
    const s = seedWithout("fiery", 5);
    for (const d of [deckOf([]), deckOf([{ def: "temper", ench: "fiery" }]), deckOf([{ def: "temper", ench: "growing" }])]) expect(off(() => enchantProblems(d, 5, { seed: s }))).toEqual([]);
    expect(off(() => enchantProblems(deckOf([{ def: "temper", ench: "fiery" }]), 4, { seed: s }))).toEqual([]);
  });
});

describe("ENCHANT-2 T2: honest par decks, which take drops with their words, pass the player check", () => {
  it("par decks with ENCHANT on (rivals' words and drops): every dusk deck passes validateUpload with the run seed and the road log", () => {
    on(() => {
      let decks = 0, withWords = 0, words = 0, viaDrops = 0;
      for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) {
        for (const seed of [1, 2, 3]) {
          const days = playerRun(hero, 10, seed);
          const runSeed = parRunSeed(hero, seed) >>> 0;
          for (const day of [3, 5, 6, 7, 8, 9, 10]) {
            const d = days[day - 1];
            const road = playerRoadLog(days, day);
            const v = validateUpload(d.build, day, RULES_VERSION, { seed: runSeed, road });
            expect(v.ok, `${hero} seed ${seed} day ${day}: ${v.errors.join("; ")}`).toBe(true);
            decks++;
            const n = [...d.build.items, ...(d.build.turrets ?? [])].filter((p) => p.ench !== undefined).length;
            if (n) withWords++;
            words += n;
            // a word that only a drop can explain (no ENCHANT-1 source offers it by this day)
            const offered = possibleWords(runSeed, day, null);
            for (const p of [...d.build.items, ...(d.build.turrets ?? [])]) if (p.ench !== undefined && !offered.has(p.ench as never)) viaDrops++;
          }
        }
      }
      expect(decks).toBe(84);
      expect(withWords, "decks holding a word").toBeGreaterThan(10);
      expect(words).toBeGreaterThan(20);
      expect(viaDrops, "words only a drop can have given").toBeGreaterThanOrEqual(0);
    });
  });

  it("every enchantment id is a word the pair set can name or not: the set is a subset of the eight", () => {
    for (const w of npcDropWords(16)) expect(ENCHANT_IDS as readonly string[]).toContain(w);
  });
});
