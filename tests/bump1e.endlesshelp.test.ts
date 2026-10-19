// BUMP-1E P6 (RULING-BUMP1E-R3 R3.5, RULING-BUMP1E-R4 R4.5; ENDLESS-1 question 2): the HOW TO PLAY card's one endless sentence. ENDLESS ships ON
// in bb-0.12.0, so the card a player reads before a new run says what a won run can do next. The sentence follows HELP_LONG_2 on line 2
// (title.ts helpLines, under endlessFor of this build's rules); no other line moves, so SHOPCARD-1's lines 3-6 keep their numbers and words.
import { describe, expect, it } from "vitest";
import { computeView, defaultScale } from "../src/core/io";
import { glyphRows, textWidth, wrap } from "../src/render/font";
import { helpCard, titleScale } from "../src/screens/titleLayout";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, ENDLESS_LIVES, endlessRules, withEndless } from "../src/sim/endless";
import { withLongRun } from "../src/sim/longRun";
import { endlessFor } from "../src/net/rulesGate";
import { HELP, HELP_ENDLESS, HELP_LONG_2, helpLine3, helpLines } from "../src/screens/title";

/** The title's view as the game computes it (TitleScreen.pickScale; card5.test.ts's titleView). */
function titleView(cssW: number, cssH: number, dpr: number): { W: number; H: number; k: number } {
  const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const menu = defaultScale(Math.floor(cssW * dpr), Math.floor(cssH * dpr), v.portrait);
  return { W: v.W, H: v.H, k: menu / v.scale };
}
/** run1.screens.test.ts's ten screens (card5's eight, the narrowest phones), the card must fit on each. */
const SCREENS: Readonly<Record<string, [number, number, number]>> = {
  "402x690 @3": [402, 690, 3], "390x844 @3": [390, 844, 3], "390x660 @3": [390, 660, 3], "844x390 @3": [844, 390, 3],
  "360x640 @2": [360, 640, 2], "desk 1440x900 @1": [1440, 900, 1], "desk 1440x900 @2": [1440, 900, 2], "desk 1280x720 @1": [1280, 720, 1],
  "310x640 @3": [310, 640, 3], "320x568 @2": [320, 568, 2],
};

describe("BUMP-1E P6 R3.5: the HOW TO PLAY card's endless sentence", () => {
  it("ENDLESS ships on, and endlessFor holds for this build's rules (the card's condition)", () => {
    expect(ENDLESS).toBe(true);
    expect(endlessRules()).toBe(true);
    expect(endlessFor(RULES_VERSION)).toBe(true);
  });

  it("the sentence is cap's wording (R3.5), from the constants: 3 fresh hearts, the score is the endless wins", () => {
    expect(ENDLESS_LIVES).toBe(3);
    expect(HELP_ENDLESS).toBe("AFTER A WIN YOU CAN PLAY ON IN ENDLESS: 3 FRESH HEARTS, AND YOUR SCORE IS YOUR ENDLESS WINS.");
    expect(HELP_ENDLESS).not.toMatch(/10 DAYS|\bLIVES\b|\bLIFE\b/); // a run is won at 10 wins; hearts, never lives
  });

  it("endless in the game: line 2 is HELP_LONG_2 and then the sentence", () => {
    const lines = helpLines();
    expect(lines.length).toBe(6);
    expect(lines[1]).toBe(`${HELP_LONG_2} ${HELP_ENDLESS}`);
    expect(lines[1].startsWith("2  YOU HAVE 10 HEARTS.")).toBe(true);
    expect(lines[1].endsWith("10-0 IS FLAWLESS. AFTER A WIN YOU CAN PLAY ON IN ENDLESS: 3 FRESH HEARTS, AND YOUR SCORE IS YOUR ENDLESS WINS.")).toBe(true);
  });

  it("endless off (the switch, or rules before ENDLESS_RULES): line 2 is HELP_LONG_2 alone, and no other line differs either way", () => {
    const on = helpLines();
    const off = withEndless(() => helpLines(), false);
    expect(off[1]).toBe(HELP_LONG_2);
    expect(off.filter((_, i) => i !== 1)).toEqual(on.filter((_, i) => i !== 1));
    expect(withEndless(() => endlessFor("bb-0.11.0"), true)).toBe(false); // an older record never reads endless
    expect(endlessRules()).toBe(true); // withEndless put the switch back
  });

  it("SHOPCARD-1's lines are untouched: 3 is the join line (helpLine3), 4 and 5 and 6 are HELP's, with their numbers", () => {
    const lines = helpLines();
    expect(lines[2]).toBe(helpLine3());
    expect(lines.slice(3)).toEqual([HELP[3], HELP[4], HELP[5]]);
    expect(lines[2].startsWith("3  ")).toBe(true);
    expect(lines[3].startsWith("4  ")).toBe(true);
  });

  it("the card with the sentence fits the ten screens, with 20 px clear and no line cut (the 402x690 phone at DPR 3 among them)", () => {
    const lines = helpLines();
    const base = withEndless(() => helpLines(), false);
    for (const [name, [w, h, dpr]] of Object.entries(SCREENS)) {
      const v = titleView(w, h, dpr);
      const c = helpCard(v.W, v.H, v.k, lines);
      const b = helpCard(v.W, v.H, v.k, base);
      expect(c.x >= 0 && c.x + c.w <= v.W && c.y >= 20 && c.y + c.h <= v.H - 20, `${name}: card ${JSON.stringify(c)} on ${v.W}x${v.H}`).toBe(true);
      expect([c.row, c.font, c.w], name).toEqual([b.row, b.font, b.w]); // the pitch, the face and the width as the card without it
      const rows = lines.map((ln) => wrap(ln, c.w - 16, c.font));
      for (const rr of rows) for (const row of rr) {
        expect(textWidth(row, c.font), `${name}: ${row}`).toBeLessThanOrEqual(c.w - 16);
        for (const ch of row) if (ch !== " ") expect(glyphRows(ch, c.font), `${name}: ${JSON.stringify(ch)}`).toBeDefined();
      }
      expect(c.h, name).toBe(20 + rows.flat().length * c.row + lines.length * 3 + 5);
    }
  });

  it("with LONG_RUN off (not shipped) the sentence is not on the card: endless is a won long run's next step", () => {
    const lines = withLongRun(() => helpLines(), false);
    expect(lines.join(" ")).not.toContain("ENDLESS");
  });
});
