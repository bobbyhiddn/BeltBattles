// LC-1 (REQ-BFG-073): the LAST CHANCE screen's pure parts (src/screens/lastChancePicker.ts): the layout fits a phone in
// portrait and landscape, the words follow docs/TEXT-STYLE.md (capitals, no retired word), the summary's mark and the dusk
// card's line. The pixels are in L/output-lc1/shots (scripts/shot.mjs).
import { describe, expect, it } from "vitest";
import { textWidth } from "../src/render/font";
import { LAST_CHANCE_HULL, lastChanceOffer } from "../src/sim/lastChance";
import { ITEMS } from "../src/sim/content";
import { RUNES } from "../src/sim/runes";
import { LC_HULL_SUB, LC_LINE, LC_STOP, LC_TAKE, LC_TITLE, hullName, lastChanceTag, lcHint, lcLayout, lcPartSub, lcToast } from "../src/screens/lastChancePicker";
import { lastChanceCardLine } from "../src/game/day";

describe("LC-1: the LAST CHANCE screen", () => {
  it("three cards at their tallest fit a 390x844 phone (292x633 logical) and its landscape (844x390), below the title", () => {
    // the tallest card: the head, three lines, four detail lines and the take bar
    const tall = 31 + 3 * 9 + 1 + 4 * 7 + 13 + 4;
    for (const [W, H] of [[292, 633], [844, 390]]) {
      const L = lcLayout(W, H, [tall, 44, 44]);
      expect(L.bottom).toBeLessThanOrEqual(H);
      expect(L.cards[0].y).toBeGreaterThanOrEqual(L.top + 33);
      for (const c of L.cards) expect([c.x >= 0, c.x + c.w <= W, c.w <= 300]).toEqual([true, true, true]);
      // each ⓘ box sits inside its card's top-right corner
      L.infos.forEach((r, i) => expect(r.x + r.w <= L.cards[i].x + L.cards[i].w && r.y >= L.cards[i].y).toBe(true));
    }
  });

  it("its words: capitals, no retired word (TEXT-STYLE 13.6), the HULL card names its amount with the HULL icon", () => {
    const words = [LC_TITLE, LC_LINE, LC_TAKE, LC_HULL_SUB, LC_STOP, lcHint(6), hullName(LAST_CHANCE_HULL), lcPartSub("epic")];
    for (const w of words) {
      expect(w).toBe(w.toUpperCase());
      expect(w).not.toMatch(/HARASSMENT|ONLINE|POISON|LOAD TIME/);
    }
    expect([LC_TITLE, LC_LINE, lcHint(6), lcPartSub("epic")]).toEqual(["LAST CHANCE", "+1 LIFE. PICK ONE. FREE.", "DUSK OF DAY 6 · TAP TO READ", "EPIC PART · TO CARGO · FREE"]);
    expect(hullName(1000)).toMatch(/^\+1000 .$/); // "+1000" and the HULL glyph
  });

  it("the summary row's mark names the card taken; the STOP cell fits the column's widest label", () => {
    expect(lastChanceTag({ boon: "rune", id: "twin_suns" })).toBe(RUNES.twin_suns.name);
    expect(lastChanceTag({ boon: "part", id: "siege" in ITEMS ? "siege" : "salvo" })).toBe(ITEMS["siege" in ITEMS ? "siege" : "salvo"].name);
    expect(lastChanceTag({ boon: "hull" })).toBe(hullName(LAST_CHANCE_HULL));
    expect(lastChanceTag({})).toBe("PICK");
    expect(textWidth(LC_STOP, "3")).toBeLessThanOrEqual(textWidth("SMUGGLER", "3"));
  });

  it("the toast after a pick and the dusk card's line", () => {
    const o = lastChanceOffer(5, 6, "weaver", []);
    expect(lcToast("rune", o)).toBe(`RUNE TAKEN: ${RUNES[o.rune!.id].name}`);
    expect(lcToast("part", o)).toBe(`TO CARGO: ${ITEMS[o.part!].name}`);
    expect(lcToast("hull", o)).toBe(`MAX HULL ${hullName(LAST_CHANCE_HULL)}`);
    expect(lastChanceCardLine({ lastChance: { lives: 1 } })).toBe("LAST CHANCE: +1 LIFE");
    expect(lastChanceCardLine({})).toBeNull();
  });
});
