// PRESENT-1 S3 (REQ-BFG-081; REVIEW-SC0912B item 3, REVIEW-SC0912 "For later", LIVE-PACKETS-0912 section 1 item 5 b): a heart means the
// run's hearts, never hull. SC-0912b's rule (src/ui/families.ts:78-80): hull is said in words (HULL, MAX HULL), never with the {HULL}
// heart (font.ts ICON.HULL, "♥"), because readers take that heart for the run's hearts (READ-9). Each place that still drew the heart
// for hull at 0.9.14 says HULL now: LAST CHANCE's HULL card (its name, its YOUR HULL line, its details, its head box, the summary's
// mark and the toast), the ARMOR PACK's slot in the shop (the "+700 ♥" hull pack) and its face (panel and desk tooltip). IRON SKIN and
// SPARE HULL already drew the word (runeText.ts spansOf: {HULL} -> KEYWORD_WORD.HULL): pinned here so it stays so.
import { describe, expect, it } from "vitest";
import { ICON, textWidth } from "../src/render/font";
import { lineWidth, type RichLine } from "../src/ui/richText";
import { LAST_CHANCE_HULL, lastChanceOffer } from "../src/sim/lastChance";
import { withHullScale } from "../src/sim/hullScale";
import { LC_HULL_ICON, hullInfo, hullLines, hullName, lastChanceTag, lcHullName, lcToast } from "../src/screens/lastChancePicker";
import { packAmount, packShortAmount } from "../src/screens/build/shop";
import { packTip } from "../src/screens/build/chrome";
import { faceLines } from "../src/ui/faces";
import { runeLine } from "../src/ui/runeText";
import { RUNES } from "../src/sim/runes";
import { newRun } from "../src/game/run";

const HEART = ICON.HULL; // "♥"
const flat = (items: RichLine[][]): string => items.map((it) => it.map((l) => l.map((s) => s.t).join("")).join(" ")).join(" | ");
const rows = (items: RichLine[][], font: "5" | "3"): string => items.flat().map((l) => lineWidth(l, font)).join("+");

describe("PRESENT-1 S3: hull in words, never the heart", () => {
  it("LAST CHANCE's HULL card: its name, the summary's mark, the toast, its line, its details and its head box say HULL", () => withHullScale(() => {
    expect(hullName(LAST_CHANCE_HULL)).toBe("+500 HULL"); // was "+500 ♥"
    expect(lastChanceTag({ boon: "hull" })).toBe("+500 HULL"); // the summary row's mark (was "+500 ♥")
    const o = lastChanceOffer(5, 6, "weaver", []);
    expect(lcToast("hull", o)).toBe("MAX HULL +500"); // was "MAX HULL +500 ♥"
    expect(lcHullName(o)).toBe("+500 HULL");
    expect(flat(hullLines(2100, 500, 223))).toBe("YOUR HULL: 2100 TO 2600."); // was "YOUR ♥: 2100 TO 2600."
    expect(flat(hullInfo(223))).toBe("MAX HULL FOR THE REST OF THE RUN. EVERY FIGHT STARTS FULL."); // was "MAX ♥ FOR ..."
    expect(LC_HULL_ICON).toBe("HULL"); // the head box's word (was the heart at twice its size)
    expect(textWidth(LC_HULL_ICON, "3")).toBeLessThanOrEqual(20 - 2); // inside the box's 20 px inside, its 1 px outline too
    for (const s of [hullName(LAST_CHANCE_HULL), lastChanceTag({ boon: "hull" }), lcToast("hull", o), flat(hullLines(2100, 500, 223)), flat(hullInfo(223)), LC_HULL_ICON]) expect(s).not.toContain(HEART);
    // the fit (logged for the report): the card's text width on the 402x690 @3 phone (233 px card: 223) and on 360x640 @3 (208: 198)
    const log: string[] = [];
    for (const tw of [223, 198]) log.push(`tw ${tw}: line ${hullLines(5880, 1400, tw).flat().length} row(s) ${rows(hullLines(5880, 1400, tw), "5")} px; details ${hullInfo(tw).flat().length} row(s) ${rows(hullInfo(tw), "3")} px`);
    console.log(`PRESENT1-HEARTS-LC\n${log.join("\n")}`);
    for (const tw of [223, 198]) {
      for (const l of hullLines(5880, 1400, tw).flat()) expect(lineWidth(l, "5")).toBeLessThanOrEqual(tw);
      for (const l of hullInfo(tw).flat()) expect(lineWidth(l, "3")).toBeLessThanOrEqual(tw);
      expect(hullLines(5880, 1400, tw).flat().length).toBe(1); // one row, as before
    }
  }, false));

  it("the ARMOR PACK: its slot (tall face: +250 over HULL; short face: the words where they fit, else +250) and its face say HULL", () => withHullScale(() => {
    expect(packAmount("armor")).toBe("+250 HULL"); // was "+250 ♥"
    expect(packAmount("belt")).toBe("+4 BELT");
    // the short face (a desk's slot, 30-34 px wide): "+250 HULL" is 34 px of the 3x5 face, past the 28-32 px it has. At the tip (the fix round,
    // tests/present1.words2.test.ts) it keeps the word without the plus where that fits (30 px: a 32-34 px slot), else the number alone
    // (was: the number alone in every one of these slots)
    expect(textWidth("+250 HULL", "3")).toBe(34);
    for (const w of [30, 31]) expect(packShortAmount(packAmount("armor"), w)).toBe("+250");
    for (const w of [32, 33, 34]) expect(packShortAmount(packAmount("armor"), w)).toBe("250 HULL");
    for (const w of [30, 31, 32, 33, 34]) expect(packShortAmount(packAmount("belt"), w)).toBe("+4 BELT");
    expect(packShortAmount(packAmount("armor"), 36)).toBe("+250 HULL");
    const plating = faceLines("plating", 1)!.rules[0].text;
    expect(plating).toBe("+250 HULL FOR THE RUN."); // was "+250 ♥ FOR THE RUN." (the panel and the desk tooltip)
    const run = newRun("furnace", 5, "present1");
    expect(packTip("plating", run)).toBe("+250 HULL FOR THE RUN.");
    for (const s of [packAmount("armor"), plating, packTip("plating", run)]) expect(s).not.toContain(HEART);
  }, false));

  it("IRON SKIN and SPARE HULL already say MAX HULL in words (no heart drawn)", () => {
    expect(runeLine(RUNES.iron_skin)).toBe("+150 MAX HULL, ALL RUN.");
    expect(runeLine(RUNES.spare_hull)).toBe("+300 MAX HULL, ALL RUN.");
    for (const r of [RUNES.iron_skin, RUNES.spare_hull, RUNES.scrap_halo, RUNES.bulkheads]) expect(runeLine(r)).not.toContain(HEART);
  });
});
