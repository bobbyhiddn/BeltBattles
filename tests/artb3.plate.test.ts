// ARTB-CODE-3A (REQ-BFG-126, REQ-BFG-113, REQ-BFG-115), item T (f): the 25% plate rule, measured for MEND PRESS and for every new card.
// The rule (cap's ruling 5 on PRESENT-5, kept by REQ-BFG-126; tests/shopcard1.test.ts and tests/artb1.card.test.ts): the footprint plate over a card picture's top-left corner hides at most 25% of the picture's opaque px
// on every card width the shop uses (the narrow phone card 46 px up to the desk's 70). A card whose piece has no grid (hasGrid false: a rig, a mod or a one-cell piece) carries no plate at all: its share is 0.
// The table is printed (and written to $ARTB_PLATE3_LOG when that is set); every share is measured on the data, never typed. A share over the bar is a STOP AND ASK, not a re-pin.
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { ITEMS } from "../src/sim/content";
import { setArtB } from "../src/render/artB";
import { CARD_H, CARD_TEXT_MIN_W, CARD_W, WIDE_CARD_H, WIDE_CARD_MAX_W } from "../src/screens/build/layout";
import { CARD_ICON, cardZones } from "../src/screens/build/shop";
import { HEAD_BIG, CARGO_FACE, gridCell, hasGrid, shapeGridSize, shapePlateInk } from "../src/ui/shapePic";
import { FACTORY_PIECES, GUNS, NEW_CARD_IDS, NEW_RIGS, SHAPED, expected } from "./artb3.helpers";

type Box = { x: number; y: number; w: number; h: number };
const inBox = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
/** the footprint plate on a card of width `w`, in px from the card's top-left (the box drawCard's drawShapePlate covers): ink round the grid */
const plateOn = (id: string, w: number): Box => { const z = cardZones(w, 42), g = shapeGridSize(id, w >= CARD_TEXT_MIN_W ? undefined : gridCell(id, CARGO_FACE), HEAD_BIG); return { x: z.grid.x, y: z.grid.y, w: g.w + 2, h: g.h + 2 }; };
/** where the plate has ink (x, y: px from the plate box's top-left): the narrow phone card's plate is shaped (PRESENT-6), a wide card's the whole box */
function plateInk(id: string, w: number): (x: number, y: number) => boolean {
  const pl = plateOn(id, w);
  if (w >= CARD_TEXT_MIN_W) return (x, y) => x >= 0 && y >= 0 && x < pl.w && y < pl.h;
  const mask = R(shapePlateInk(id, gridCell(id, CARGO_FACE), HEAD_BIG));
  return (x, y) => mask.at(x, y) !== null;
}

afterEach(() => setArtB(true));

describe("ARTB-CODE-3A T(f): the plate guide for the new cards", () => {
  it("every new card (the 49) and MEND PRESS: a plate hides at most 25% of the picture's opaque px on every width 46..70 (a card with no grid has no plate); the plated ones are the 13 guns and MEND PRESS", () => {
    setArtB(true);
    const ids = [...NEW_CARD_IDS, "mendpress"];
    const cases: [string, number, number][] = [["phone", CARD_W, CARD_H], ["desk", WIDE_CARD_MAX_W, WIDE_CARD_H], ["desk 69", 69, WIDE_CARD_H]];
    for (let w = CARD_W + 1; w < 69; w++) cases.push([`wide ${w}`, w, WIDE_CARD_H]);
    expect(cases.length, "the 25 widths 46..70").toBe(25);
    const rows: string[] = [], plated: string[] = [], worst: Record<string, number> = {};
    for (const id of ids) {
      expect(ITEMS[id], `${id}: a piece`).toBeDefined();
      if (!hasGrid(id)) { rows.push(`${id}: no grid, no plate (0 of ${expected(`card/${id}`).px.filter((p) => p !== null).length} opaque px hidden = 0.0%)`); continue; }
      plated.push(id);
      const pic = expected(FACTORY_PIECES.includes(id) ? id : `card/${id}`).px, opaque = pic.filter((p) => p !== null).length;
      for (const [wn, w, h] of cases) {
        const z = cardZones(w, h), pl = plateOn(id, w), ink = plateInk(id, w);
        let hidden = 0, onBox = 0;
        for (let j = 0; j < CARD_ICON; j++) for (let i = 0; i < CARD_ICON; i++) {
          const inside = inBox(pl, z.icon.x + i, z.icon.y + j) && ink(z.icon.x + i - pl.x, z.icon.y + j - pl.y);
          if (inside) onBox++;
          if (inside && pic[j * CARD_ICON + i] !== null) hidden++;
        }
        const share = hidden / opaque;
        worst[id] = Math.max(worst[id] ?? 0, share);
        rows.push(`${id} ${wn} ${w}x${h}: plate ${pl.w}x${pl.h} at ${pl.x},${pl.y}, ${w >= CARD_TEXT_MIN_W ? "whole box" : "shaped"} (ink on ${onBox} px of the picture's box); hides ${hidden} of ${opaque} opaque px = ${(100 * share).toFixed(1)}%`);
      }
    }
    const log = `ARTB3 PLATECOVER (the new cards: a plate hides at most 25% of its picture's opaque px): ${rows.length} rows, ${plated.length} plated cards\n${rows.join("\n")}\nworst share per plated card: ${Object.entries(worst).map(([id, v]) => `${id} ${(100 * v).toFixed(1)}%`).join(", ")}`;
    console.log(log);
    if (process.env.ARTB_PLATE3_LOG) writeFileSync(process.env.ARTB_PLATE3_LOG, log + "\n");
    // the plated ones: the 13 guns (size-2 turrets, a plain 2x2 grid) and MEND PRESS (a plain 2x2 factory); the 34 rigs, WARD BELL and MENDING LOOM are one cell
    expect(plated.sort(), "the new cards that carry a plate").toEqual([...GUNS, "mendpress"].sort());
    for (const id of NEW_RIGS) expect(hasGrid(id), `${id}: one cell here, no plate`).toBe(false);
    for (const id of ["wardbell", "mendingloom"]) expect(hasGrid(id), `${id}: one cell, no plate`).toBe(false);
    for (const id of SHAPED) expect(hasGrid(id), `${id} (batch 1): plated`).toBe(true);
    for (const id of plated) expect(worst[id], `${id}: the plate hides at most 25% of the picture`).toBeLessThanOrEqual(0.25);
  });
});
