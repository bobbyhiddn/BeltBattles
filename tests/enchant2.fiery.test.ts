// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T4c, ENCHANT-1c's QUESTION 3): FIERY'S CARD SAYS WHAT ITS PANEL SAYS. Until now the word's own card read `ON A RIG: ITS HIT:
// [BURN]+1.` (and LAST CHANCE's detail `ENCHANTED: FIERY. ITS HIT: [BURN]+1.`) while the panel of a FIERY part reads `ADDS +1 [BURN] TO EACH HIT, ON TOP OF ITS OWN STATS.`
// (ENCHANT-1c's words-only fix). Now the card and the detail take the part's words, `ADDS +1 [BURN] TO EACH HIT.` (`TO ITS SLUGS.` on a factory, `TO EACH SHOT.` on a
// turret) and leave out `, ON TOP OF ITS OWN STATS`: a card shows no part's stats. Words only: the sim is untouched (src/sim/enchant.ts enchantLine's text). The fit on
// both views: the text sheet's --enchant section lists every card row with its rows on the phone and desk (0 overflows), tests/enchant1.faces.test.ts fits each word
// card whole in the APPLY panel, and the last test here keeps LAST CHANCE's detail no taller than the tallest it already had.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { lcWordItem } from "../src/screens/lastChancePicker";
import { ITEMS } from "../src/sim/content";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, ENCHANT_NUM, enchantKindOf, enchantProblem, setEnchant, withEnchant, type EnchantKind } from "../src/sim/enchant";
import { pieceLine, wordFace, wordLine } from "../src/ui/enchantFaces";
import { icons } from "../src/render/font";
import { banned } from "./textRules";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const KINDS: EnchantKind[] = ["rig", "factory", "turret"];
const PIECE: Record<EnchantKind, string> = { rig: "whetstone", factory: "press", turret: "scrapcannon" };
const TO: Record<EnchantKind, string> = { rig: "TO EACH HIT", factory: "TO ITS SLUGS", turret: "TO EACH SHOT" };

describe("ENCHANT-2 T4c: FIERY's card and LAST CHANCE's detail take the part's words", () => {
  it("the word card's three rows read `ADDS +1 {BURN} TO EACH HIT.` / `TO ITS SLUGS.` / `TO EACH SHOT.`, and say nothing of the part's own stats", () => {
    expect(wordFace("fiery").lines.map((l) => `${l.label}: ${l.text}`)).toEqual([
      "ON A RIG: ADDS +1 {BURN} TO EACH HIT.", "ON A FACTORY: ADDS +1 {BURN} TO ITS SLUGS.", "ON A TURRET: ADDS +1 {BURN} TO EACH SHOT.",
    ]);
    for (const l of wordFace("fiery").lines) {
      expect(l.text, l.kind).not.toMatch(/OWN|STATS|ON TOP/);
      expect(l.text, l.kind).not.toMatch(/ITS HIT:|ITS SLUGS:|ITS SHOTS:|\{BURN\}\+/); // the old form
      expect(l.text, l.kind).not.toMatch(/[[\]]/); // the panels' markup, not the brief's brackets
    }
  });

  it("at every star the card's line is the panel's line without `, ON TOP OF ITS OWN STATS` (the same words, the same number: ENCHANT_NUM.burn x the stars), and in the house words", () => {
    for (const kind of KINDS) for (const stars of [1, 2, 3]) {
      const n = ENCHANT_NUM.burn * stars, card = wordLine("fiery", kind, stars)!, piece = pieceLine("fiery", kind, stars)!;
      expect(card, `${kind} ★${stars}`).toBe(`ADDS +${n} {BURN} ${TO[kind]}.`);
      expect(piece, `${kind} ★${stars}`).toBe(`ADDS +${n} {BURN} ${TO[kind]}, ON TOP OF ITS OWN STATS.`);
      expect(piece, `${kind} ★${stars}: the piece's line is the card's plus the clause`).toBe(card.replace(/\.$/, ", ON TOP OF ITS OWN STATS."));
      expect(banned(card), `${kind} ★${stars}`).toEqual([]);
      expect(banned(piece), `${kind} ★${stars}`).toEqual([]);
    }
  });

  it("a bench change to ENCHANT_NUM.burn moves the card's number (the line is built from the table)", () => {
    const was = ENCHANT_NUM.burn;
    try {
      ENCHANT_NUM.burn = 2;
      expect(wordLine("fiery", "rig", 1)).toBe("ADDS +2 {BURN} TO EACH HIT.");
      expect(wordLine("fiery", "turret", 3)).toBe("ADDS +6 {BURN} TO EACH SHOT.");
      expect(pieceLine("fiery", "factory", 2)).toBe("ADDS +4 {BURN} TO ITS SLUGS, ON TOP OF ITS OWN STATS.");
    } finally {
      ENCHANT_NUM.burn = was;
    }
    expect(ENCHANT_NUM.burn).toBe(was);
  });

  it("LAST CHANCE's detail for a FIERY part reads `ENCHANTED: FIERY. ADDS +n {BURN} ...` on a rig, a factory and a turret at every star: the word in its colour first, the card's words after it", () => {
    withEnchant(() => {
      for (const kind of KINDS) for (const stars of [1, 2, 3]) {
        for (const tw of [120, 200, 290]) {
          const item = lcWordItem(PIECE[kind], "fiery", tw, stars)!;
          expect(item, `${kind} ★${stars} @${tw}`).not.toBeNull();
          const flat = item.flat();
          expect(flat[0].t).toBe("ENCHANTED: ");
          expect(flat[1]).toEqual({ t: "FIERY", c: ENCHANT_DEFS.fiery.color });
          const text = item.map((l) => l.map((s) => s.t).join("")).join(" ");
          expect(text, `${kind} ★${stars} @${tw}`).toBe(icons(`ENCHANTED: FIERY. ADDS +${ENCHANT_NUM.burn * stars} {BURN} ${TO[kind]}.`));
          expect(text, `${kind} ★${stars} @${tw}: no part's stats on a card`).not.toMatch(/OWN STATS|ITS HIT:/);
        }
      }
    });
  });

  it("LAST CHANCE's detail for FIERY takes no more rows than the tallest detail a word already had, at every width the card is drawn at (so no card layout moves)", () => {
    withEnchant(() => {
      for (const tw of [100, 120, 160, 200, 250, 290]) for (const kind of KINDS) for (const stars of [1, 3]) {
        const rows = (id: (typeof ENCHANT_IDS)[number]): number => lcWordItem(PIECE[kind], id, tw, stars)?.length ?? 0;
        const others = ENCHANT_IDS.filter((id) => id !== "fiery" && enchantProblem(ITEMS[PIECE[kind]], id) === null && enchantKindOf(ITEMS[PIECE[kind]]) === kind);
        const most = Math.max(...others.map(rows));
        expect(rows("fiery"), `${kind} ★${stars} @${tw}: FIERY ${rows("fiery")} rows, the tallest other ${most}`).toBeLessThanOrEqual(most);
      }
    });
  });
});
