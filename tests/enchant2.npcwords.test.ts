// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T1): THE RIVALS' OWN WORDS (src/sim/npcWords.ts NPC_WORDS, captainWordsOn; the hooks in rivals.ts
// rivalBuild and standInBuild). What this proves:
//   - the table: every rival has its three grants, on the schedule 5 / 8 / 12, hand-picked (a literal each), legal, no GROWING;
//   - every grant names a piece the rival's deck holds on EVERY day it is live (5-16), at every luck and at both moments (the road
//     warlord and the dusk stand-in), one copy a grant;
//   - with ENCHANT off the table is NEVER READ and every deck is byte for byte what it was;
//   - with ENCHANT on, the road warlord and the dusk stand-in carry the same words on the same day, and nothing else about the deck moves;
//   - the toggle that keeps the words out (state B of T5) gives back the ENCHANT-off deck;
//   - every grant is worth something to its rival on the day it goes live (the bots' score, enchantBot.ts wordGain, above 0).
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { installedTurrets, turretList, type Build } from "../src/sim/deck";
import { ENCHANT_IDS, enchantProblem, withEnchant } from "../src/sim/enchant";
import { modelOf, piecesOf, wordGain } from "../src/sim/harness/enchantBot";
import { NPC_WORDS, NPC_WORD_DAYS, captainWordsOn, npcGrantDay, npcWordsRules, withNpcWords, type NpcGrant } from "../src/sim/npcWords";
import { CAPTAIN_RUNES, LUCKS, PLANS, captainRunesOn, planBuild, type RoadMoment } from "../src/sim/rivalBuilds";
import { RIVALS, RIVAL_IDS, luckOf, rivalBuild, rivalDays, rivalLoadout, standInBuild, type RivalId } from "../src/sim/rivals";

const LAST = 16;
const MOMENTS: readonly RoadMoment[] = ["warlord", "dusk"];
const liveOn = (id: RivalId, day: number): NpcGrant[] => NPC_WORDS[id].filter((g) => g.from <= day);

/** The words a deck holds, as sorted keys `def:word[/side]` (rigs and factories on the deck, then the installed turrets). */
function wordsOf(b: Build): string[] {
  const out: string[] = [];
  for (const p of b.items) if (p.ench !== undefined) out.push(`${p.def}:${p.ench}${p.enchDir !== undefined ? `/${p.enchDir}` : ""}`);
  for (const t of installedTurrets(b)) if (t.turret.ench !== undefined) out.push(`${t.turret.def}:${t.turret.ench}`);
  return out.sort();
}
const keyOf = (g: NpcGrant): string => `${g.def}:${g.word}${g.enchDir !== undefined ? `/${g.enchDir}` : ""}`;

/** How many copies of `def` the deck holds (deck rigs and factories, installed turrets). */
function copies(b: Build, def: string): number {
  return b.items.filter((p) => p.def === def).length + installedTurrets(b).filter((t) => t.turret.def === def).length;
}

/** The deck with every word taken off, turrets read through turretList (a build that never wrote `turrets` is the starting layout). */
function stripped(b: Build): unknown {
  const items = b.items.map((p) => {
    const { ench: _e, enchDir: _d, ...rest } = p;
    return rest;
  });
  const turrets = turretList(b).map((t) => {
    const { ench: _e, ...rest } = t;
    return rest;
  });
  const { turrets: _t, items: _i, ...rest } = b;
  return { ...rest, items, turrets };
}

describe("ENCHANT-2 T1: the table", () => {
  it("has a list for every rival and only for rivals, three grants each, on the schedule 5 / 8 / 12", () => {
    expect(NPC_WORD_DAYS).toEqual([5, 8, 12]);
    expect(Object.keys(NPC_WORDS).sort()).toEqual([...RIVAL_IDS].sort());
    for (const id of RIVAL_IDS) {
      expect(NPC_WORDS[id].map((g) => g.from), id).toEqual([5, 8, 12]);
      expect(NPC_WORDS[id], id).toHaveLength(3);
    }
  });

  it("standInOnly rivals (LOCKJAW, THISTLEMAIL) get their grants too", () => {
    const only = RIVAL_IDS.filter((id) => RIVALS[id].standInOnly);
    expect(only.sort()).toEqual(["lockjaw", "thistlemail"]);
    for (const id of only) expect(NPC_WORDS[id]).toHaveLength(3);
  });

  it("every grant is a LEGAL word on its piece: enchantProblem null (so ECHOING never sits on a rig 1c's NOTHING TO DOUBLE refuses), no GROWING, WIDE only with a free side on a rig", () => {
    for (const id of RIVAL_IDS) {
      for (const g of NPC_WORDS[id]) {
        const where = `${id} ${g.def} ${g.word}`;
        expect(ENCHANT_IDS as readonly string[], where).toContain(g.word);
        expect(g.word, where).not.toBe("growing"); // its counter means nothing on a deck rebuilt each day
        expect(ITEMS[g.def], where).toBeDefined();
        expect(enchantProblem(g.def, g.word, g.enchDir !== undefined ? { enchDir: g.enchDir } : undefined), where).toBeNull();
        if (g.word === "wide" && ITEMS[g.def].kind === "gate") expect(g.enchDir, where).toBeDefined(); // a rig's WIDE names its side
        else expect(g.enchDir, where).toBeUndefined(); // enchDir only with WIDE on a rig
      }
    }
  });

  it("a rival's three grants name three different words or three different pieces (no repeated (piece, word))", () => {
    for (const id of RIVAL_IDS) expect(new Set(NPC_WORDS[id].map(keyOf)).size, id).toBe(3);
  });
});

describe("ENCHANT-2 T1: every grant names a piece the deck holds, every day it is live, at every luck and moment", () => {
  it("for every rival x day 5-16 x luck x moment, the deck holds a copy of the def for EACH live grant", () => {
    let cells = 0;
    for (const id of RIVAL_IDS) {
      for (const day of rivalDays(id, LAST).filter((d) => d >= NPC_WORD_DAYS[0])) {
        const live = liveOn(id, day);
        expect(live.length, `${id} d${day}`).toBeGreaterThan(0);
        for (const luck of LUCKS) {
          for (const moment of MOMENTS) {
            const b = planBuild(PLANS[id], day, luck, moment).build;
            for (const def of new Set(live.map((g) => g.def))) {
              const want = live.filter((g) => g.def === def).length;
              expect(copies(b, def), `${id} d${day} ${luck}/${moment} holds ${def} x${want}`).toBeGreaterThanOrEqual(want);
            }
            cells++;
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(1000);
  });

  it("every word on a built rival deck (road warlord and stand-in, every day 5-16) is legal on the piece that carries it: enchantProblem null, WIDE on a free side", () => {
    withEnchant(() => {
      let words = 0;
      for (const id of RIVAL_IDS) {
        for (const day of rivalDays(id, LAST).filter((d) => d >= NPC_WORD_DAYS[0])) {
          for (const b of id === "matriarch" ? [rivalBuild(id, day)] : [rivalBuild(id, day), standInBuild(id, day)]) {
            for (const p of b.items) if (p.ench !== undefined) {
              expect(enchantProblem(p.def, p.ench, p.enchDir !== undefined ? { enchDir: p.enchDir } : undefined), `${id} d${day} ${p.def} ${p.ench}`).toBeNull();
              words++;
            }
            for (const t of installedTurrets(b)) if (t.turret.ench !== undefined) {
              expect(enchantProblem(t.turret.def, t.turret.ench), `${id} d${day} ${t.turret.def} ${t.turret.ench}`).toBeNull();
              words++;
            }
          }
        }
      }
      expect(words).toBeGreaterThan(500);
    });
  });
});

describe("ENCHANT-2 T1: with ENCHANT off the table is never read and every deck is byte for byte what it was", () => {
  it("rivalBuild and standInBuild equal the runes-only deck (JSON) for every rival and every day 1-16, with no word anywhere", () => {
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 52): was a bare body (ENCHANT off by default); the equality with the runes-only deck holds only with the switch off (ON, the decks hold the rivals' words:
    // RULING-BUMP1F-R3.1), so the body runs under withEnchant(fn, false). The ON equality is proven below: the ON deck with its words taken off is this one
    withEnchant(() => {
      for (const id of RIVAL_IDS) {
        for (const day of rivalDays(id, LAST)) {
          const road = JSON.stringify(rivalBuild(id, day));
          expect(road, `${id} d${day}`).toBe(JSON.stringify(captainRunesOn(rivalLoadout(id, day).build, CAPTAIN_RUNES[id], day)));
          expect(road).not.toContain('"ench"');
          if (id === "matriarch") continue; // she never stands in
          expect(JSON.stringify(standInBuild(id, day)), `${id} d${day} stand-in`).not.toContain('"ench"');
        }
      }
    }, false);
  });

  it("captainWordsOn returns the very build it was given, and NPC_WORDS is not read at all", () => {
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 53): was a bare body (ENCHANT off by default; with the switch on captainWordsOn returns a copy holding the words, and npcWordsRules() is true);
    // the whole body runs under withEnchant(fn, false), where the table is never read (the getters below stay installed and removed inside it, as before)
    withEnchant(() => {
      const reads: string[] = [];
      const saved = new Map<string, readonly NpcGrant[]>();
      const table = NPC_WORDS as unknown as Record<string, readonly NpcGrant[]>;
      for (const id of RIVAL_IDS) {
        saved.set(id, table[id]);
        Object.defineProperty(table, id, { configurable: true, enumerable: true, get() { reads.push(id); return saved.get(id); } });
      }
      try {
        for (const id of RIVAL_IDS) for (const day of rivalDays(id, LAST)) {
          const b = rivalLoadout(id, day).build;
          expect(captainWordsOn(b, id, day)).toBe(b);
          rivalBuild(id, day);
          if (id !== "matriarch") standInBuild(id, day);
        }
      } finally {
        for (const id of RIVAL_IDS) Object.defineProperty(table, id, { configurable: true, enumerable: true, writable: true, value: saved.get(id) });
      }
      expect(reads).toEqual([]);
      expect(npcWordsRules()).toBe(false);
    }, false);
  });
});

describe("ENCHANT-2 T1: with ENCHANT on the rivals carry their live words", () => {
  it("rivalBuild and standInBuild hold exactly the grants live that day: none before day 5, one from 5, two from 8, three from 12", () => {
    withEnchant(() => {
      for (const id of RIVAL_IDS) {
        for (const day of rivalDays(id, LAST)) {
          const want = liveOn(id, day).map(keyOf).sort();
          expect(wordsOf(rivalBuild(id, day)), `${id} d${day} warlord`).toEqual(want);
          if (id !== "matriarch") expect(wordsOf(standInBuild(id, day)), `${id} d${day} stand-in`).toEqual(want);
          const n = day >= 12 ? 3 : day >= 8 ? 2 : day >= 5 ? 1 : 0;
          expect(want.length, `${id} d${day} count`).toBe(n);
        }
      }
    });
  });

  it("the road warlord and the dusk stand-in carry the SAME words on the same day (and the stand-in's other numbers are what they were)", () => {
    withEnchant(() => {
      for (const id of RIVAL_IDS.filter((x) => x !== "matriarch")) {
        for (const day of rivalDays(id, LAST).filter((d) => d >= 5)) {
          expect(wordsOf(standInBuild(id, day)), `${id} d${day}`).toEqual(wordsOf(rivalBuild(id, day)));
        }
      }
    });
  });

  it("nothing about a deck moves but its words: the ENCHANT-on deck with the words taken off is the ENCHANT-off deck", () => {
    for (const id of RIVAL_IDS) {
      for (const day of rivalDays(id, LAST).filter((d) => d >= 5)) {
        const off = withEnchant(() => rivalBuild(id, day), false); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2); green for the wrong reason, not a TRIAGE line): was a bare rivalBuild (ENCHANT off by default), which is ON now and made this on-versus-on
        const on = withEnchant(() => rivalBuild(id, day));
        expect(JSON.stringify(stripped(on)), `${id} d${day}`).toBe(JSON.stringify(stripped(off)));
        expect(wordsOf(on).length, `${id} d${day}`).toBeGreaterThan(0);
      }
    }
  });

  it("each call gives a fresh deck: writing a word on one never reaches the plan or the next call", () => {
    withEnchant(() => {
      const a = rivalBuild("nettle", 12), b = rivalBuild("nettle", 12);
      expect(a).toEqual(b);
      expect(a.items).not.toBe(b.items);
      a.items[0].ench = "growing";
      expect(rivalBuild("nettle", 12)).toEqual(b);
    });
  });

  it("the T5 toggle: withNpcWords(false) gives back the ENCHANT-off deck, with ENCHANT on", () => {
    withEnchant(() => {
      expect(npcWordsRules()).toBe(true);
      for (const id of RIVAL_IDS) {
        for (const day of [5, 8, 12, 16].filter((d) => rivalDays(id, LAST).includes(d))) {
          const bare = withNpcWords(() => JSON.stringify(rivalBuild(id, day)), false);
          expect(bare, `${id} d${day}`).not.toContain('"ench"');
          expect(npcWordsRules()).toBe(true); // put back
        }
      }
    });
  });
});

describe("ENCHANT-2 T1: every grant is worth something to its rival the day it goes live (the bots' score above 0)", () => {
  it("wordGain on the warlord deck and on the dusk deck, at the grant's own day", () => {
    withEnchant(() => {
      for (const id of RIVAL_IDS) {
        for (const g of NPC_WORDS[id]) {
          const day = npcGrantDay(id, g);
          for (const [luck, moment] of [[luckOf(id), "warlord"], ["ordinary", "dusk"]] as const) {
            if (moment === "dusk" && id === "matriarch") continue;
            const b = planBuild(PLANS[id], day, luck, moment).build;
            const m = modelOf(b, day);
            const best = Math.max(...piecesOf(b).filter((p) => p.def === g.def).map((p) => wordGain(m, p, g.word, 0, {}).value));
            expect(best, `${id} d${day} ${moment}: ${g.word} on ${g.def}`).toBeGreaterThan(0);
          }
        }
      }
    });
  });
});
