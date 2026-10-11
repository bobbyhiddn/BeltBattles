// MERGE-099D (BRIEF-MERGE-099D rule 1c: c099's content inside CARD-2's and CARD-3's layout): the follow-ups git merged
// clean but the two sides never met before. c099's HULL-1a draws a rune card's effect lines on the run's day (with
// HULL_SCALE on a rune's DMG, SHIELD, HEAL and max-HULL amounts are the day's numbers: runeText.ts amountOn), so CARD-2's
// word targets (runeWordTargets) and its definition's region (runeWordBoxOn, through EXPLAIN-1's runeNoteY) read the same
// day's lines; and the desk shop tooltip's plain rig (CARD-2's K6) reads the run's day, as MERGE-099C 6ed6e27 made its
// panel read it. Presentation only: no rule or number changes.
import { describe, expect, it } from "vitest";
import { RUNES } from "../src/sim/runes";
import { withHullScale } from "../src/sim/hullScale";
import { textWidth } from "../src/render/font";
import { lineText } from "../src/ui/richText";
import { runeCardTextW, runeNoteY, runeTextLines, runeWordBoxOn, runeWordTargets } from "../src/ui/runeBar";
import { KEYWORD_WORD, runeKeywords } from "../src/ui/runeText";
import { plainRigStats } from "../src/ui/faces";
import { statRow } from "../src/ui/icons";
import { offerTooltip } from "../src/screens/build/shop";

const CARD = { x: 40, y: 60, w: 233, h: 120 }; // the op view's picker card (its text 223 px wide)
const DAYS = [1, 2, 4, 6, 8, 10];

/** Where drawRuneCard draws each keyword word of `id`'s card on `day` (its lines from y + 31, 9 apart, x + 5). */
function drawnWords(id: string, day: number): string[] {
  const def = RUNES[id], out: string[] = [];
  runeTextLines(def, runeCardTextW(CARD.w), day).forEach((l, li) => {
    const text = lineText(l), y = CARD.y + 31 + li * 9;
    for (const k of runeKeywords(def)) {
      const w = KEYWORD_WORD[k];
      for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + 1)) out.push(`${w}@${CARD.x + 5 + (i > 0 ? textWidth(text.slice(0, i), "5") + 1 : 0)},${y}`);
    }
  });
  return out;
}

describe("MERGE-099D follow-up: CARD-2's rune word targets on the card's day (HULL-1a)", () => {
  it("every target's glyph sits on a word the card draws on that day, and the definition's room starts where the card's does", () => {
    let moved = 0, checked = 0;
    withHullScale(() => {
      for (const id of Object.keys(RUNES)) {
        const def = RUNES[id];
        if (!runeKeywords(def).length) continue;
        for (const day of DAYS) {
          const drawn = drawnWords(id, day);
          const ts = runeWordTargets(CARD, def, [], day);
          for (const t of ts) expect(drawn, `${id} day ${day}: ${t.word}`).toContain(`${t.word}@${t.glyph.x},${t.glyph.y}`);
          checked += ts.length;
          // day 1's targets (the call without a day, as the screens made it before this follow-up)
          const day1 = runeWordTargets(CARD, def, []).map((t) => `${t.word}@${t.glyph.x},${t.glyph.y}`);
          if (day1.some((s) => !drawn.includes(s))) moved++;
          expect(runeNoteY(CARD, def, day), `${id} day ${day}`).toBe(CARD.y + 31 + runeTextLines(def, runeCardTextW(CARD.w), day).length * 9);
          const w = KEYWORD_WORD[runeKeywords(def)[0]];
          const box = runeWordBoxOn(CARD, def, w, day);
          expect(box, `${id} day ${day}`).not.toBeNull();
          expect(box!.y + box!.h, `${id} day ${day}: the box ends at its room's foot`).toBeGreaterThanOrEqual(runeNoteY(CARD, def, day) - 1);
        }
      }
    }, true);
    console.log(`MERGE-099D rune word targets: ${checked} targets checked on days ${DAYS.join(", ")}; ${moved} (rune, day) cards whose day-1 targets miss the drawn words`);
    expect(checked).toBeGreaterThan(0);
    expect(moved).toBeGreaterThan(0); // HULL_SCALE moves words on some cards: the day is needed
  });
});

describe("MERGE-099D follow-up: the desk shop tooltip's plain rig on the run's day", () => {
  it("WHETSTONE's stat row is its panel's on the day (x D(d) with HULL_SCALE on); TEMPER and BARBED SPOOL are counts", () => {
    withHullScale(() => {
      for (const day of [1, 5, 10]) {
        for (const id of ["whetstone", "temper", "barbed"]) expect(offerTooltip(id, { day }), `${id} day ${day}`).toBe(statRow(plainRigStats(id, 1, day)!));
      }
      expect(offerTooltip("whetstone", { day: 10 })).not.toBe(offerTooltip("whetstone", { day: 1 }));
      expect(offerTooltip("temper", { day: 10 })).toBe(offerTooltip("temper", { day: 1 }));
    }, true);
    // the switch off: day 1's number on every day, as before
    withHullScale(() => expect(offerTooltip("whetstone", { day: 10 })).toBe(offerTooltip("whetstone", { day: 1 })), false);
  });
});
