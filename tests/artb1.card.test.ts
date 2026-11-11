// ARTB-CODE-1 (REQ-BFG-126, REQ-BFG-115, REQ-BFG-113), item C: the shop card's native 24x24 picture.
// - the card picture of each slice id (the ten rigs, KILN) equals the data (tools/artb/artb-slice.json) where the zone map puts it;
// - a card outside the slice is identical to the pixel with the switch on and off;
// - each slice card is identical to the base's outside the picture's 24x24 box (and outside the footprint plate, which lies over the picture's corner for a shaped
//   piece and for KILN's plain 2x2 grid), in every state and on every width;
// - the plate guide (cap's ruling 5 on PRESENT-5, kept by REQ-BFG-126): a plate hides at most 25% of its picture's opaque px. The table is printed (and written to
//   $ARTB_PLATE_LOG when that is set: logs/c-platecover.log); the shares are measured on the data, never typed.
// ARTB-CODE-1B (after the merge of PRESENT-6, A2): the narrow phone card's plate is SHAPED (ink only behind the grid's px and 1 px round them: shapePic.ts shapePlateInk), so "under the plate"
//   is "where the plate has ink" (plateInk below); a wide card's plate is the whole box, as it was.
// No pixel, digest or pixel count of a slice sprite is typed here: the expectations are decoded from the JSON.
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { G, R, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

installRaster();

import { ITEMS, buyableModules, type MerchantId } from "../src/sim/content";
import { C } from "../src/render/palette";
import { artBCard, setArtB } from "../src/render/artB";
import { CARD_H, CARD_TEXT_MIN_W, CARD_W, WIDE_CARD_H, WIDE_CARD_MAX_W } from "../src/screens/build/layout";
import { CARD_ICON, cardZones, drawCard, iconX2, type CardState } from "../src/screens/build/shop";
import { HEAD_BIG, CARGO_FACE, gridCell, hasGrid, shapeGridSize, shapePlateInk } from "../src/ui/shapePic";
import type { ShopBadge } from "../src/game/run";

type Box = { x: number; y: number; w: number; h: number };
const data = JSON.parse(readFileSync("tools/artb/artb-slice.json", "utf8")) as { // (the repo root's path, where vitest runs; the repo's node shims declare no node:url)
  legend: Record<string, string>;
  sprites: Record<string, { w: number; h: number; rows: string[] }>;
};
const pal = C as Record<string, string>;
const RIGS = ["embertrough", "nailstrip", "grease", "ballast", "rasp", "bellows", "sparkgap", "staticbrush", "barbed", "venom"];
// ARTB-CODE-2A (batch 2), old -> new: SLICE was the ten rigs and KILN (11 ids); the start factories LOOM, CRUCIBLE and WARDWORKS answer as card pictures the same way (their bare 24x24 sprite): 14 ids
const FACTORIES = ["kiln", "loom", "crucible", "wardworks"];
const SLICE = [...RIGS, ...FACTORIES];
/** the data's card picture of a slice id as w*h hexes (null = clear): card/<id> for a rig, the bare sprite for a start factory */
function picture(id: string): (string | null)[] {
  const s = data.sprites[FACTORIES.includes(id) ? id : `card/${id}`];
  const out: (string | null)[] = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const ch = s.rows[y][x]; out.push(ch === "." ? null : pal[data.legend[ch]]); }
  return out;
}

const WIDTHS: [string, number, number][] = [["phone", CARD_W, CARD_H], ["desk", WIDE_CARD_MAX_W, WIDE_CARD_H], ["desk 69", 69, WIDE_CARD_H]];
const BASE: CardState = { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0 };
const STATES: [string, Partial<CardState>][] = [
  ["affordable", {}], ["too dear", { affordable: false }],
  ["merge ★2", { badge: { kind: "merge", toStars: 2 } as ShopBadge }], ["merge ★3", { badge: { kind: "merge", toStars: 3 } as ShopBadge }],
  ["max", { badge: { kind: "max" } as ShopBadge }], ["owned", { badge: { kind: "wait" } as ShopBadge }],
  ["sale", { sale: true }], ["sold", { sold: true }], ["selected", { selected: true }], ["hover", { hover: true }],
];
const OX = 4, OY = 4;
const merchantOf = (id: string): MerchantId => ITEMS[id].merchant ?? "ironmonger";
const lift = (s: Partial<CardState>): number => (s.selected ? 2 : s.hover ? 1 : 0);
const inBox = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
function draw(id: string, w: number, h: number, s: Partial<CardState>): RasterCanvas {
  const c = fresh(w + 2 * OX, h + 2 * OY + 2);
  drawCard(G(c), { x: OX, y: OY, w, h }, ITEMS[id], ITEMS[id].price, merchantOf(id), { ...BASE, ...s }, 0);
  return c;
}
/** The footprint plate on a card of width `w`, in px from the card's top-left (the box drawCard's drawShapePlate covers): ink round the grid. */
const plateOn = (id: string, w: number): Box => { const z = cardZones(w, 42), g = shapeGridSize(id, w >= CARD_TEXT_MIN_W ? undefined : gridCell(id, CARGO_FACE), HEAD_BIG); return { x: z.grid.x, y: z.grid.y, w: g.w + 2, h: g.h + 2 }; };
/** ARTB-CODE-1B (REQ-BFG-126), after the merge of PRESENT-6 (A2, REQ-BFG-115): where the plate has ink (x, y: px from the plate box's top-left). The narrow phone card's plate is SHAPED
 *  (shapePic.ts shapePlateInk: ink only behind the grid's own px and 1 px round them, drawShapePlate's `trim`, shop.ts passes r.w < CARD_TEXT_MIN_W); a wide card's (69 px and up) is the whole box as it was. */
function plateInk(id: string, w: number): (x: number, y: number) => boolean {
  const pl = plateOn(id, w);
  if (w >= CARD_TEXT_MIN_W) return (x, y) => x >= 0 && y >= 0 && x < pl.w && y < pl.h;
  const mask = R(shapePlateInk(id, gridCell(id, CARGO_FACE), HEAD_BIG));
  return (x, y) => mask.at(x, y) !== null;
}

afterEach(() => setArtB(true));

describe("ARTB-CODE-1 C: the shop card's picture", () => {
  it("the card picture of each slice id is the data's card/<id> (KILN: kiln), 24x24, where the zone map puts it: iconX2 and the drawn card, on every width", () => {
    setArtB(true);
    expect(CARD_ICON).toBe(24);
    for (const id of SLICE) {
      const pic = picture(id), ic = R(iconX2(id));
      expect([ic.width, ic.height], `${id}: iconX2 is 24x24`).toEqual([CARD_ICON, CARD_ICON]);
      expect(ic.px, `${id}: iconX2 is the data`).toEqual(pic);
      for (const [wn, w, h] of WIDTHS) {
        const c = draw(id, w, h, {}), z = cardZones(w, h, ITEMS[id].price), plate = hasGrid(id) ? plateOn(id, w) : null, ink = hasGrid(id) ? plateInk(id, w) : null;
        let seen = 0;
        for (let j = 0; j < CARD_ICON; j++) for (let i = 0; i < CARD_ICON; i++) {
          // the plate lies over the picture's corner: skip the px it has ink on (ARTB-CODE-1B: the narrow card's plate is shaped, so its box's empty corners show the picture)
          if (plate && ink && inBox(plate, z.icon.x + i, z.icon.y + j) && ink(z.icon.x + i - plate.x, z.icon.y + j - plate.y)) continue;
          expect(c.at(OX + z.icon.x + i, OY + z.icon.y + j), `${id} ${wn}: card px ${i},${j}`).toBe(pic[j * CARD_ICON + i] ?? C.slate0); // clear px show the card's face
          seen++;
        }
        expect(seen, `${id} ${wn}`).toBeGreaterThan(CARD_ICON * CARD_ICON - 200);
      }
    }
  });

  it("a card outside the slice is identical to the pixel with the switch on and off (every other buyable piece, three widths, four states)", () => {
    let n = 0;
    for (const d of buyableModules()) {
      if (SLICE.includes(d.id)) continue;
      for (const [, w, h] of WIDTHS) for (const [, s] of [STATES[0], STATES[2], STATES[6], STATES[7]]) {
        setArtB(true);
        const on = draw(d.id, w, h, s).px.slice();
        setArtB(false);
        const off = draw(d.id, w, h, s).px.slice();
        expect(on, `${d.id} ${w}x${h}`).toEqual(off);
        n++;
      }
    }
    expect(n).toBeGreaterThan(300);
  });

  it("each slice card is identical to the base's outside the picture's 24x24 box (and outside the plate): ten states, three widths", () => {
    for (const id of SLICE) for (const [wn, w, h] of WIDTHS) for (const [sn, s] of STATES) {
      setArtB(true);
      const on = draw(id, w, h, s);
      setArtB(false);
      const off = draw(id, w, h, s);
      const z = cardZones(w, h, ITEMS[id].price), dy = -lift(s);
      const pic: Box = { x: OX + z.icon.x, y: OY + dy + z.icon.y, w: CARD_ICON, h: CARD_ICON };
      const pl = hasGrid(id) ? plateOn(id, w) : null, ink = hasGrid(id) ? plateInk(id, w) : null;
      const plate: Box | null = pl ? { x: OX + pl.x, y: OY + dy + pl.y, w: pl.w, h: pl.h } : null;
      let changed = 0;
      for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
        if (on.at(x, y) === off.at(x, y)) continue;
        changed++;
        expect(inBox(pic, x, y), `${id} ${wn} ${sn}: a px that differs at ${x},${y} lies in the picture's box`).toBe(true);
        // ARTB-CODE-1B: under the plate = where the plate has ink (the narrow card's plate is PRESENT-6's shaped one; a wide card's the whole box)
        expect(plate !== null && ink !== null && inBox(plate, x, y) && ink(x - plate.x, y - plate.y), `${id} ${wn} ${sn}: a px that differs at ${x},${y} lies under the plate`).toBe(false);
      }
      expect(changed, `${id} ${wn} ${sn}: the picture changed something`).toBeGreaterThan(0);
    }
  });

  it("the plate guide: a footprint plate hides at most 25% of its slice picture's opaque px on every width the shop uses (the table is the log)", () => {
    setArtB(true);
    const rows: string[] = [];
    const worst: Record<string, number> = {};
    const cases: [string, number, number][] = [...WIDTHS.map(([wn, w, h]) => [wn, w, h] as [string, number, number])];
    for (let w = CARD_W + 1; w < 69; w++) cases.push([`wide ${w}`, w, WIDE_CARD_H]); // a landscape row's card can sit between the phone's and the desk's width
    for (const id of SLICE) {
      if (!hasGrid(id)) continue;
      const pic = picture(id), opaque = pic.filter((p) => p !== null).length;
      for (const [wn, w, h] of cases) {
        const z = cardZones(w, h), pl = plateOn(id, w), ink = plateInk(id, w);
        let hidden = 0, onBox = 0;
        for (let j = 0; j < CARD_ICON; j++) for (let i = 0; i < CARD_ICON; i++) {
          // ARTB-CODE-1B (PRESENT-6 A2): a px is under the plate where the plate has ink (the narrow card's plate is shaped)
          const inside = inBox(pl, z.icon.x + i, z.icon.y + j) && ink(z.icon.x + i - pl.x, z.icon.y + j - pl.y);
          if (inside) onBox++;
          if (inside && pic[j * CARD_ICON + i] !== null) hidden++;
        }
        const share = hidden / opaque;
        worst[id] = Math.max(worst[id] ?? 0, share);
        rows.push(`${id} ${wn} ${w}x${h}: plate ${pl.w}x${pl.h} at ${pl.x},${pl.y}, ${w >= CARD_TEXT_MIN_W ? "whole box" : "shaped"} (ink on ${onBox} px of the picture's box ${z.icon.x},${z.icon.y} ${CARD_ICON}x${CARD_ICON}); hides ${hidden} of ${opaque} opaque px = ${((100 * share).toFixed(1))}%`);
      }
    }
    const log = `ARTB1 PLATECOVER (a plate hides at most 25% of its picture's opaque px): ${rows.length} rows\n${rows.join("\n")}\nworst share per piece: ${Object.entries(worst).map(([id, v]) => `${id} ${(100 * v).toFixed(1)}%`).join(", ")}`;
    console.log(log);
    if (process.env.ARTB_PLATE_LOG) writeFileSync(process.env.ARTB_PLATE_LOG, log + "\n");
    // ARTB-CODE-2A (batch 2), old -> new: ["embertrough", "kiln", "nailstrip"] -> + the start factories LOOM, CRUCIBLE and WARDWORKS (plain 2x2 grids, hasGrid, as KILN's: they carry the footprint plate too);
    // the old three's shares did not move (3 of 341, 8 of 337, 8 of 403 opaque px on the 46x42 card: the table above)
    expect(Object.keys(worst).sort(), "the plated slice pieces: the two shaped rigs and the four factories' plain 2x2").toEqual(["crucible", "embertrough", "kiln", "loom", "nailstrip", "wardworks"]);
    for (const id of Object.keys(worst)) expect(worst[id], `${id}: the plate hides at most 25% of the picture`).toBeLessThanOrEqual(0.25);
  });

  it("artBCard answers for the slice's ids only (the cards of every other piece are the icon doubled)", () => {
    setArtB(true);
    for (const id of Object.keys(ITEMS)) expect(artBCard(id) !== null, id).toBe(SLICE.includes(id));
  });
});
