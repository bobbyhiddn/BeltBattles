// POLISH-1 (REQ-BFG-085, REQ-BFG-052, REQ-BFG-057; BRIEF-POLISH1 P4; BUMP-1F's review F3): HOW TO PLAY names POISON, gates and the ENCHANTER's words.
//  - item 6, the keyword line, gains POISON in the others' form (its icon and its word, one clause) while the switch that turns POISON on is on (the scaling switch);
//  - item 4 gains ONE plain sentence on what a gate does (with GATES) and what the ENCHANTER sells (with ENCHANT);
//  - with the three off the card is HELP exactly as before; the card fits its views (on screen, 20 px clear, no line cut).
import { afterEach, describe, expect, it } from "vitest";
import { computeView, defaultScale } from "../src/core/io";
import { ICON, glyphRows, textWidth, wrap } from "../src/render/font";
import { HELP, HELP_KEYWORDS, HELP_POISON, helpKeywords, helpLine4, helpLines } from "../src/screens/title";
import { helpCard, titleScale } from "../src/screens/titleLayout";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { withGates } from "../src/sim/gates";
import { withScaleRigs } from "../src/sim/scale";
import { cardBefore } from "./polish1.help.helpers";

afterEach(() => setEnchant(ENCHANT));

const GATE = "A GATE SITS ON THE BELT AND CHANGES EACH SLUG THAT RIDES THROUGH IT";
const WORD = "THE ENCHANTER SELLS A WORD THAT GIVES ONE OF YOUR PARTS AN EXTRA EFFECT";

describe("POLISH-1 P4: each part of the new text follows its own switch", () => {
  it("all three off: the card is HELP, item for item, as before", () => {
    const lines = cardBefore(() => helpLines());
    expect(lines[3]).toBe(HELP[3]);
    expect(lines[5]).toBe(HELP_KEYWORDS);
    expect(helpLine4(false, false)).toBe(HELP[3]);
    expect(helpKeywords(false)).toBe(HELP_KEYWORDS);
    expect(HELP_KEYWORDS.includes("POISON")).toBe(false);
    expect(HELP[3].includes("GATE") || HELP[3].includes("ENCHANTER")).toBe(false);
  });

  it("GATES gives the gate part, ENCHANT the words part, both one sentence; POISON follows the scaling switch alone", () => {
    for (const gates of [false, true]) for (const words of [false, true]) for (const scale of [false, true]) {
      const lines = withGates(() => withEnchant(() => withScaleRigs(() => helpLines(), scale), words), gates);
      const four = lines[3];
      expect(four.startsWith(HELP[3]), `gates ${gates} words ${words}`).toBe(true);
      const add = four.slice(HELP[3].length);
      expect(add, `gates ${gates} words ${words}`).toBe(gates && words ? ` ${GATE}, AND ${WORD}.` : gates ? ` ${GATE}.` : words ? ` ${WORD}.` : "");
      expect((add.match(/\./g) ?? []).length, "one sentence").toBe(add ? 1 : 0);
      expect(lines[5], `scale ${scale}`).toBe(scale ? helpKeywords(true) : HELP_KEYWORDS);
      expect(lines.length).toBe(6);
      expect(lines.filter((_, i) => i !== 3 && i !== 5).join("\n"), "the other items do not move").toBe(cardBefore(() => helpLines()).filter((_, i) => i !== 3 && i !== 5).join("\n"));
    }
  });
});

describe("POLISH-1 P4: the shipped card (everything on)", () => {
  it("item 6 has POISON after BURN, its icon and its word, and the others are as they were", () => {
    const k = helpKeywords(true);
    expect(k).toBe(`6  ${ICON.BURN}BURN: HULL DAMAGE OVER TIME. ${ICON.POISON}POISON: HULL DAMAGE EVERY SECOND UNTIL THE FIGHT ENDS. ${HELP_KEYWORDS.slice(HELP_KEYWORDS.indexOf(ICON.STUN))}`);
    expect(HELP_POISON).toBe("{*POISON}: HULL DAMAGE EVERY SECOND UNTIL THE FIGHT ENDS.");
    expect(helpLines()[5]).toBe(k);
    expect(k.replace(`${ICON.POISON}POISON: HULL DAMAGE EVERY SECOND UNTIL THE FIGHT ENDS. `, "")).toBe(HELP_KEYWORDS);
  });

  it("item 4 ends with the one sentence: a gate on the belt, the ENCHANTER's word", () => {
    expect(helpLines()[3]).toBe(`${HELP[3]} ${GATE}, AND ${WORD}.`);
    expect(helpLines()[3]).toMatch(/^4 {2}STAND RIGS BESIDE THE BELT/);
  });
});

/** The card's views (tests/card5.test.ts SCREENS, and the desk and a big phone): css w x h @ dpr. */
const SCREENS: [number, number, number][] = [[402, 690, 3], [390, 844, 3], [390, 660, 3], [844, 390, 3], [360, 640, 2], [1440, 900, 1], [1440, 900, 2], [1280, 720, 1], [1280, 800, 1], [412, 915, 3]];
function titleView(cssW: number, cssH: number, dpr: number): { W: number; H: number; k: number } {
  const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const menu = defaultScale(Math.floor(cssW * dpr), Math.floor(cssH * dpr), v.portrait);
  return { W: v.W, H: v.H, k: menu / v.scale };
}

describe("POLISH-1 P4: the card with the new text fits its ten views", () => {
  it("on screen and 20 px clear, no line cut, every glyph in its face, the item gap and row pitch as before", () => {
    const out: string[] = [];
    for (const [w, h, dpr] of SCREENS) {
      const v = titleView(w, h, dpr), lines = helpLines(), before = cardBefore(() => helpLines());
      const c = helpCard(v.W, v.H, v.k, lines), b = helpCard(v.W, v.H, v.k, before);
      expect(c.x >= 0 && c.x + c.w <= v.W && c.y >= 20 && c.y + c.h <= v.H - 20, `${w}x${h}@${dpr}: card ${JSON.stringify(c)} on ${v.W}x${v.H}`).toBe(true);
      expect([c.row, c.font, c.w], `${w}x${h}@${dpr}`).toEqual([b.row, b.font, b.w]);
      const rows = lines.map((ln) => wrap(ln, c.w - 16, c.font));
      for (const rr of rows) for (const row of rr) {
        expect(textWidth(row, c.font), `${w}x${h}@${dpr}: ${row}`).toBeLessThanOrEqual(c.w - 16);
        for (const ch of row) if (ch !== " ") expect(glyphRows(ch, c.font), `${w}x${h}@${dpr}: ${JSON.stringify(ch)}`).toBeDefined();
      }
      expect(c.h).toBe(20 + rows.flat().length * c.row + lines.length * 3 + 5);
      out.push(`${w}x${h}@${dpr} (${v.W}x${v.H}): card ${b.h} -> ${c.h} px (y ${c.y}..${c.y + c.h} of ${v.H}); rows ${before.map((l) => wrap(l, c.w - 16, c.font).length).join(",")} -> ${rows.map((x) => x.length).join(",")}`);
    }
    console.log(`POLISH-1 P4 the card, before -> after:\n${out.join("\n")}`);
  });
});
