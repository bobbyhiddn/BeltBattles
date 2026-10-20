// ENCHANT-2 (REQ-BFG-085, REQ-BFG-087, REQ-BFG-089; BRIEF-ENCHANT2 T3): a word's rows behind a tap on the road event screen. The shrine's cards print the word's name in its
// colour; a `?` on each card opens the word's own card (its ON A ... rows, as the ENCHANTER's offer card shows them) over the panel. Here: the button's geometry and its
// finger-sized hit rect, the rows for all eight words, and that the open card fits the event panel on the narrowest phone and desk layouts with nothing drawn outside it.
import { describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";

installRaster();

const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; font: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, font: opts?.font ?? "5" });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { ENCHANT_DEFS, ENCHANT_IDS } from "../src/sim/enchant";
import { drawInfoButton, drawWordInfo, infoButton, wordInfoRows } from "../src/screens/event/wordInfo";
import { eventLayout } from "../src/screens/event/layout";
import { TAP_CSS } from "../src/ui/tap";
import { C } from "../src/render/palette";
import { textWidth } from "../src/render/font";

describe("the `?` button of a card that offers a word", () => {
  const cards = [{ x: 3, y: 4, w: 138, h: 50 }, { x: 3, y: 4, w: 182, h: 42 }];
  it("is drawn inside the card, in the corner the shrine's cards leave free; its hit rect is a finger wide on a phone, never past the card", () => {
    for (const card of cards) {
      for (const k of [0, 1, 1.5, 2, 2.2, 3]) {
        const { btn, hit } = infoButton(card, k);
        expect(btn.x >= card.x && btn.y >= card.y && btn.x + btn.w <= card.x + card.w && btn.y + btn.h <= card.y + card.h).toBe(true);
        expect(hit.x >= card.x && hit.y >= card.y && hit.x + hit.w <= card.x + card.w && hit.y + hit.h <= card.y + card.h).toBe(true);
        expect(hit.x <= btn.x && hit.y <= btn.y && hit.x + hit.w >= btn.x + btn.w && hit.y + hit.h >= btn.y + btn.h).toBe(true); // it holds the button
        if (k > 0) expect(Math.min(hit.h, card.h) * k, `k ${k} card ${card.w}x${card.h}`).toBeGreaterThanOrEqual(Math.min(TAP_CSS, card.h * k));
        if (k > 0 && k * card.h >= TAP_CSS) expect(hit.h * k).toBeGreaterThanOrEqual(TAP_CSS);
      }
    }
  });
  it("draws on the card without painting outside it", () => {
    const c = fresh(200, 60);
    drawInfoButton(G(c), infoButton(cards[1]).btn, ENCHANT_DEFS.fiery.color, false);
    drawInfoButton(G(c), infoButton(cards[1]).btn, ENCHANT_DEFS.fiery.color, true);
    expect(c.oob).toBe(0);
  });
});

describe("the word's own card", () => {
  it("has the name in its colour and a row for each kind the word goes on: three for most, one for MASSIVE (a turret's) and SWIFT (a factory's)", () => {
    for (const id of ENCHANT_IDS) {
      const r = wordInfoRows(id, 170)!;
      expect(r.title).toBe(ENCHANT_DEFS[id].name);
      expect(r.colour).toBe(ENCHANT_DEFS[id].color);
      expect(r.rows.length).toBe(ENCHANT_DEFS[id].kinds.length);
      expect(r.rows.every((l) => l.length >= 1 && l.length <= 3), id).toBe(true);
    }
    expect(wordInfoRows("massive", 170)!.rows[0][0]).toMatch(/^ONLY ON A TURRET:/);
    expect(wordInfoRows("swift", 170)!.rows[0][0]).toMatch(/^ONLY ON A FACTORY:/);
    expect(wordInfoRows("fiery", 170)!.rows.map((l) => l[0].split(":")[0])).toEqual(["ON A RIG", "ON A FACTORY", "ON A TURRET"]);
    expect(wordInfoRows("zzz", 170)).toBeNull(); // a forged id
  });

  it("fits the event panel on the narrowest phone and desk layouts, every word: its rows end above the closing line, its text inside the panel, nothing painted outside it", () => {
    const panels = [eventLayout(190, 330, true, 3).panel, eventLayout(440, 250, false, 3).panel];
    for (const p of panels) {
      const r = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 4 };
      for (const id of ENCHANT_IDS) {
        rec.text.length = 0;
        const c = fresh(r.x + r.w + 4, r.y + r.h + 4);
        drawWordInfo(G(c), r, id);
        expect(c.oob, `${id} ${r.w}x${r.h}`).toBe(0);
        const rows = rec.text.filter((t) => t.font === "3" && t.s !== "TAP TO CLOSE");
        const tip = rec.text.find((t) => t.s === "TAP TO CLOSE")!;
        expect(rows.length).toBeGreaterThan(0);
        for (const t of rows) {
          expect(t.x + textWidth(t.s, "3"), `${id}: "${t.s}" inside the panel`).toBeLessThanOrEqual(r.x + r.w - 2);
          expect(t.y + 5, `${id}: "${t.s}" above the closing line`).toBeLessThanOrEqual(tip.y);
        }
        // the name is drawn in the word's colour
        let n = 0;
        for (let y = r.y + 4; y < r.y + 16; y++) for (let x = r.x; x < r.x + r.w; x++) if (c.at(x, y) === ENCHANT_DEFS[id].color) n++;
        expect(n, `${id}: its name in its colour`).toBeGreaterThan(8);
        expect(c.at(r.x + 3, r.y + r.h - 3)).toBe(C.slate0);
      }
    }
  });
});
