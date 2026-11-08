// PRESENT-2 W (b) (REQ-BFG-081; PRESENT-1 Question 5, the lead's YES; cap's ruling 7d5006c5f3ca852f), the desk's hover tooltip: a mouse meets a module's family head under its kind with no note ever
// opened, so the tooltip's family line says what the names are, as the panel's head does: `FORGE FAMILY` (one family), `FAMILIES: FORGE, TEMPO` (more). Before, the line was the plain names
// (`FORGE`, `FORGE, TEMPO`) and PRESENT-1's desk readers asked what it was. The line is at the tooltip's y + 21, the box as wide as its widest line (so the words lose nothing), the ability lines
// 7 + G px under it as before (tests/families.test.ts pins the geometry and the colours).
import { describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";

/** Every drawText call: the words of the tooltip, by row. */
const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; color: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, color });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { ITEMS, buyableModules } from "../src/sim/content";
import { FAMILY, famHeadText, famHeadSpans, familiesOf } from "../src/ui/families";
import { CARD_H, CARD_W } from "../src/screens/build/layout";
import { drawTooltip } from "../src/screens/build/shop";
import { textWidth } from "../src/render/font";
import { lineWidth } from "../src/ui/richText";

installRaster();

describe("PRESENT-2 W (b): the desk's hover tooltip says what the family names are", () => {
  it("every module with families: the line at y + 21 reads `NAME FAMILY` or `FAMILIES: A, B`, the names in their family colours, the rest in the separator's", () => {
    let n = 0, one = 0, more = 0;
    for (const d of buyableModules()) {
      const tags = familiesOf(d.id);
      if (!tags.length) continue;
      const r = { x: 40, y: 2, w: CARD_W, h: CARD_H }, y = r.y + r.h + 4 + 21;
      const c = fresh(300, 140);
      rec.text.length = 0;
      drawTooltip(G(c), r, ITEMS[d.id], 300, "A SENTENCE.");
      const row = rec.text.filter((q) => q.y === y).sort((a, b) => a.x - b.x);
      expect(row.map((q) => q.s).join(""), `${d.id}: the family line`).toBe(famHeadText(tags));
      // each name in its family's colour (the spans' own: famHeadSpans)
      for (const t of tags) {
        const name = FAMILY[t].word, q = row.find((s) => s.s === name);
        expect(q?.color, `${d.id}: ${name}'s colour`).toBe(FAMILY[t].colour);
      }
      // the words are the head's words: one family `X FAMILY`, more `FAMILIES: ...`
      expect(famHeadText(tags).endsWith(" FAMILY"), `${d.id}: one family says FAMILY`).toBe(tags.length === 1);
      expect(famHeadText(tags).startsWith("FAMILIES: "), `${d.id}: more say FAMILIES:`).toBe(tags.length > 1);
      if (tags.length === 1) one++; else more++;
      n++;
    }
    expect(n).toBeGreaterThan(40);
    expect(one).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(0);
  });

  it("the box holds the line whole (it is as wide as its widest line plus 10 px): no module's family line is cut, and a module with no family draws no line", () => {
    for (const d of buyableModules()) {
      const tags = familiesOf(d.id), r = { x: 40, y: 2, w: CARD_W, h: CARD_H };
      const c = fresh(300, 140);
      rec.text.length = 0;
      drawTooltip(G(c), r, ITEMS[d.id], 300, "A SENTENCE.");
      const y = r.y + r.h + 4;
      const rowY = rec.text.filter((q) => q.y === y + 21);
      if (!tags.length) { expect(rowY, `${d.id}: no family line`).toEqual([]); continue; }
      const first = Math.min(...rowY.map((q) => q.x));
      const wLine = lineWidth(famHeadSpans(tags), "3");
      expect(wLine, `${d.id}: the line's width`).toBe(textWidth(famHeadText(tags), "3"));
      // the box's left edge is 5 px left of the text, its right edge 5 px right of the widest line: the family line fits inside (every pixel of the box is drawn on a 300 px canvas)
      expect(first + wLine + 5, `${d.id}: the line ends inside the box (the canvas is 300 px)`).toBeLessThanOrEqual(300);
    }
  });
});
