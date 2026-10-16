// SHOPCARD-1 (REQ-BFG-115, REQ-BFG-113; BRIEF-SHOPCARD1 section 3, S2): every shop card is its piece's icon at x2 and its price, with
// only wordless marks; a shaped piece's card (and every other card of one) shows the shape grid; the words moved to the tap
// panel and the desk's hover tooltip.
// - the face (F): every buyable piece, phone (46x42) and desk (70x46, 69x46), in every state (affordable, too dear, merge ★2,
//   merge ★3, max, owned, sale, sold, selected, hover): the icon at x2 where cardZones puts it, and no text but the price's
//   digits (drawText's log); the marks clear of the price, the picture's centre and each other; no px outside the card;
// - the grid (G1, G3): every shaped piece's card at GRID_CELL, its tiles and arrowheads where gridGeom says, at most 25% of the
//   icon's opaque px under its plate; G1 on synthetic footprints (I2, I3 both ways, L, T, 2x2, 2x3, a plus; arrows on every
//   side) at 4 and 5 px a cell, in tests only (no piece is added);
// - the words (F5): the desk hover tooltip carries every line the panel's face draws (offerFace = explainPanel(offerPanel)'s
//   face), the same strings, at ★1 on days 1, 5 and 10; a click still selects the card (the panel opens).
import { describe, expect, it, vi } from "vitest";
import { G, R, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

/** Every drawText call: the card's words (there must be none but the price's digits). */
const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; font: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, font: opts?.font ?? "5" });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { ITEMS, buyableModules, type MerchantId } from "../src/sim/content";
import { newRun, type ShopBadge } from "../src/game/run";
import { C } from "../src/render/palette";
import { itemIcon } from "../src/render/sprites";
import { footOffsets } from "../src/sim/foot";
import { CARD_H, CARD_W, WIDE_CARD_H, WIDE_CARD_MAX_W } from "../src/screens/build/layout";
import {
  CARD_ICON, MERGE_H, MERGE_W, OWNED_MARK_H, OWNED_MARK_W, SALE_H, SALE_W, cardPriceBox, cardPriceX, cardZones, drawCard, drawTooltip,
  iconX2, offerFace, ownedMarkAt, tooltipLines, type CardState,
} from "../src/screens/build/shop";
import { shapedPiece } from "../src/screens/build/shapeEdit";
import { explainPanel, offerPanel, textOpts } from "../src/screens/build/inspector";
import { GRID_CELL, HEAD_LEN, drawGrid, drawShapePlate, gridGeom, gridSpecOf, shapeGridSize, type GridSpec } from "../src/ui/shapePic";
import { lineText } from "../src/ui/richText";

installRaster();

type Box = { x: number; y: number; w: number; h: number };
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
/** `a` and `b` have at least one clear px between them. */
const clear = (a: Box, b: Box): boolean => a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;
const shaped = (): string[] => buyableModules().filter((d) => shapedPiece(d.id)).map((d) => d.id);
/** The grid's plate on a card (`o`: the zone map's grid corner): its ink box, 1 px round the grid. */
const plateAt = (id: string, o: { x: number; y: number }, cell = GRID_CELL): Box => { const z = shapeGridSize(id, cell); return { x: o.x, y: o.y, w: z.w + 2, h: z.h + 2 }; };

function draw(id: string, w: number, h: number, s: Partial<CardState>, price = ITEMS[id].price): RasterCanvas {
  const c = fresh(w + 2 * OX, h + 2 * OY + 2);
  rec.text.length = 0;
  drawCard(G(c), { x: OX, y: OY, w, h }, ITEMS[id], price, merchantOf(id), { ...BASE, ...s }, 0);
  return c;
}

describe("SHOPCARD-1 (REQ-BFG-115): every shop card is its icon at x2 and its price", () => {
  it("every buyable piece, both widths, every state: the icon at x2 where the zone map puts it, and no text but the price's digits", () => {
    let cards = 0;
    for (const d of buyableModules()) for (const [wn, w, h] of WIDTHS) for (const [sn, s] of STATES) {
      const c = draw(d.id, w, h, s), what = `${d.id} ${wn} ${sn}`;
      // F3: the only text a shop card draws is the price's digits (none on a sold card)
      expect(rec.text.map((t) => t.s), what).toEqual(s.sold ? [] : [String(d.price)]);
      // F2: the icon doubled, pixel for pixel, outside the plates the grid and the marks draw on
      const z = cardZones(w, h), ic = R(itemIcon(d.id)), dy = -lift(s);
      const plates: Box[] = [
        ...(shapedPiece(d.id) ? [plateAt(d.id, z.grid)] : []), z.merge, z.sale,
      ];
      let seen = 0;
      for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) {
        const col = ic.at(i, j);
        if (col === null) continue;
        for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const cx = z.icon.x + 2 * i + a, cy = z.icon.y + 2 * j + b;
          if (plates.some((p) => inBox(p, cx, cy))) continue;
          expect(c.at(OX + cx, OY + dy + cy), `${what}: icon px ${i},${j}`).toBe(col);
          seen++;
        }
      }
      expect(seen, what).toBeGreaterThan(60);
      cards++;
    }
    expect(cards).toBe(buyableModules().length * WIDTHS.length * STATES.length);
    expect(R(iconX2("whetstone")).width).toBe(CARD_ICON);
  });

  it("nothing is drawn outside the card's own rect (the lift's shadow and the hover, selected and shake frames aside): no card rect moved", () => {
    expect([CARD_W, CARD_H, WIDE_CARD_MAX_W, WIDE_CARD_H]).toEqual([46, 42, 70, 46]);
    for (const id of ["whetstone", "nailstrip", "spikerail", "gantry", "assembly", "flak", "calibrate"]) for (const [wn, w, h] of WIDTHS) for (const [sn, s] of STATES) {
      if (s.selected || s.hover) continue;
      const c = draw(id, w, h, s);
      let outside = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.at(x, y) !== null && !inBox({ x: OX, y: OY, w, h }, x, y)) outside++;
      expect(outside, `${id} ${wn} ${sn}`).toBe(0);
    }
  });

  it("the zone map: one picture place for a width; every mark clear of the price, the picture's centre and each other, at every price", () => {
    for (const [wn, w, h] of WIDTHS) {
      const z = cardZones(w, h), icon = z.icon;
      // the picture area is under the stripe and the bevel (rows 0-4) and over the price row (its outline from h - 13)
      expect([z.pic.y, z.pic.y + z.pic.h]).toEqual([5, h - 13]);
      expect(icon.w).toBe(CARD_ICON);
      expect(icon.x).toBe(Math.floor((w - CARD_ICON) / 2));
      expect(icon.y).toBeGreaterThanOrEqual(5);
      expect(icon.y + icon.h).toBeLessThanOrEqual(h - 13);
      const centre: Box = { x: icon.x + 8, y: icon.y + 8, w: 8, h: 8 }; // the picture's centre: the icon's middle 8x8
      const owned: Box = { ...ownedMarkAt(h), w: OWNED_MARK_W, h: OWNED_MARK_H };
      expect(inBox(z.merge, owned.x, owned.y) && inBox(z.merge, owned.x + owned.w - 1, owned.y + owned.h - 1), `${wn}: the owned marker lies in the merge plate`).toBe(true);
      for (let price = 1; price <= 11; price++) { // the dearest piece costs 11 (two digits)
        const pb = cardPriceBox(w, h, price);
        expect(pb.x, `${wn} price ${price}: the coin's x is cardPriceX's`).toBe(cardPriceX(0, w, price, false, false));
        for (const [n, m] of [["merge", z.merge], ["owned", owned], ["sale", z.sale]] as [string, Box][]) {
          expect(clear(m, pb), `${wn} price ${price}: ${n} mark clear of the price`).toBe(true);
          expect(clear(m, centre), `${wn}: ${n} mark clear of the picture's centre`).toBe(true);
          expect(clear(m, z.gem), `${wn}: ${n} mark clear of the gem`).toBe(true);
        }
        expect(clear(z.merge, z.sale), `${wn}: merge clear of sale`).toBe(true);
        expect(clear(z.gem, pb), `${wn}: gem clear of the price`).toBe(true);
        // the picture is over the price row: its box ends before the price's outline begins
        expect(icon.y + icon.h, `${wn}: icon over the price`).toBeLessThanOrEqual(pb.y);
      }
      // every shaped piece's plate (and every synthetic footprint's, below) clears the gem, the marks and the picture's centre
      for (const id of shaped()) {
        const pl = plateAt(id, z.grid);
        for (const [n, m] of [["gem", z.gem], ["merge", z.merge], ["sale", z.sale], ["owned", owned], ["centre", centre], ["price", cardPriceBox(w, h, 11)]] as [string, Box][]) {
          expect(clear(pl, m), `${wn} ${id}: the grid's plate clear of the ${n}`).toBe(true);
        }
      }
    }
  });

  it("the marks: a merge mark (an up arrow over ★n's pips, amber, ★3 flashing gold), the owned marker for a copy that won't merge and for MAX, the sale mark in the other corner; a sold card shows none and no price", () => {
    for (const [wn, w, h] of WIDTHS) {
      const z = cardZones(w, h);
      const px = (c: RasterCanvas, p: { x: number; y: number }, dx: number, dy: number) => c.at(OX + p.x + dx, OY + p.y + dy);
      for (const stars of [2, 3]) for (const t of [0, 0.3]) {
        const c = fresh(w + 8, h + 8);
        drawCard(G(c), { x: OX, y: OY, w, h }, ITEMS.whetstone, 3, "alchemist", { ...BASE, badge: { kind: "merge", toStars: stars } as ShopBadge }, t);
        const col = stars >= 3 && Math.floor(t * 4) % 2 ? C.yellow : C.amber;
        let on = 0;
        for (let y = 0; y < MERGE_H; y++) for (let x = 0; x < MERGE_W; x++) { const p = px(c, z.merge, x, y); if (p === col) on++; else expect([C.ink, col], `${wn} ★${stars} t ${t}: ${x},${y}`).toContain(p); }
        expect(on, `${wn} ★${stars}: the arrow's 1+3+5+1 px and ${stars} pips of 2`).toBe(10 + 2 * stars);
        expect(px(c, z.merge, 4, 1), "the arrow's tip").toBe(col);
        expect(px(c, z.merge, 4, 0), "ink over the tip").toBe(C.ink);
      }
      for (const kind of ["wait", "max"] as const) {
        const c = fresh(w + 8, h + 8);
        drawCard(G(c), { x: OX, y: OY, w, h }, ITEMS.whetstone, 3, "alchemist", { ...BASE, badge: { kind } as ShopBadge }, 0);
        const o = ownedMarkAt(h);
        expect([px(c, o, 0, 0), px(c, o, 1, 2), px(c, o, 2, 3), px(c, o, 4, 6)], `${wn} ${kind}`).toEqual([C.ink, C.slate3, C.slate4, C.ink]);
      }
      const c = fresh(w + 8, h + 8);
      drawCard(G(c), { x: OX, y: OY, w, h }, ITEMS.whetstone, 3, "alchemist", { ...BASE, sale: true }, 0);
      expect([px(c, z.sale, 3, 1), px(c, z.sale, 1, 2), px(c, z.sale, 3, 4), px(c, z.sale, 3, 0)], `${wn} sale`).toEqual([C.lime, C.lime, C.lime, C.ink]);
      // a merge mark takes the sale's place in the badge's corner only; with both, the merge mark shows and the sale mark does not
      const both = fresh(w + 8, h + 8);
      drawCard(G(both), { x: OX, y: OY, w, h }, ITEMS.whetstone, 3, "alchemist", { ...BASE, sale: true, badge: { kind: "merge", toStars: 2 } as ShopBadge }, 0);
      expect(px(both, z.sale, 3, 1), `${wn}: no sale mark with a merge mark`).not.toBe(C.lime);
      // sold: no mark, no price, the icon dim (alpha), nothing at the price's place
      const sold = draw("whetstone", w, h, { sold: true, sale: true, badge: { kind: "merge", toStars: 2 } as ShopBadge });
      for (const m of [z.merge, z.sale]) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) expect(px(sold, m, x, y), `${wn} sold`).not.toBe(C.ink);
    }
  });
});

describe("SHOPCARD-1 (REQ-BFG-113): the shape grid on the card of every shaped piece", () => {
  it("the five shaped pieces: the grid on its ink plate in the picture area's top-left corner, at GRID_CELL, its tiles and arrowheads where gridGeom puts them; at most 25% of the icon's opaque px hidden", () => {
    const ids = shaped();
    expect(ids.sort()).toEqual(["assembly", "embertrough", "gantry", "nailstrip", "spikerail"]);
    expect(GRID_CELL).toBeGreaterThanOrEqual(4);
    const rows: string[] = [];
    for (const id of ids) for (const [wn, w, h] of WIDTHS) {
      const c = draw(id, w, h, {}), z = cardZones(w, h), d = ITEMS[id], rig = d.kind === "gate";
      const spec = gridSpecOf(id), geom = gridGeom(spec, GRID_CELL), sz = shapeGridSize(id, GRID_CELL);
      expect([geom.w, geom.h], id).toEqual([sz.w, sz.h]);
      expect(spec.cells, `${id}: the footprint at rot 0`).toEqual(footOffsets(d, 0));
      // the plate: ink round the grid's box
      const gx = OX + z.grid.x + 1, gy = OY + z.grid.y + 1;
      for (let x = -1; x <= geom.w; x++) for (const y of [-1, geom.h]) expect(c.at(gx + x, gy + y), `${id} ${wn}: plate`).toBe(C.ink);
      // the tiles: the kind's fill (wood for a rig, steel for a factory) in the middle of each, a seam between two cells
      const fill = rig ? C.wood2 : C.steel2, seam = rig ? C.wood0 : C.steel0;
      for (const t of geom.tiles) expect(c.at(gx + t.x + 1, gy + t.y + 1), `${id} ${wn}: tile`).toBe(fill);
      if (spec.cells.length > 1) {
        // a seam between two neighbouring cells (across, or down for a rail along y)
        const k = spec.cells.findIndex(([x, y]) => spec.cells.some(([u, v]) => (u === x + 1 && v === y) || (u === x && v === y + 1)));
        expect(k, `${id}: two cells beside each other`).toBeGreaterThanOrEqual(0);
        const [cx, cy] = spec.cells[k], t = geom.tiles[k], across = spec.cells.some(([u, v]) => u === cx + 1 && v === cy);
        expect(c.at(gx + t.x + (across ? GRID_CELL - 1 : 1), gy + t.y + (across ? 1 : GRID_CELL - 1)), `${id} ${wn}: a seam between two cells`).toBe(seam);
      }
      // the arrowheads: lime, HEAD_LEN (3) px long, one per arrow, none on a factory
      expect(geom.heads.length, id).toBe(rig ? spec.arrows.length : 0);
      if (rig) expect(spec.arrows.length, `${id}: a rig's arrows`).toBe(id === "spikerail" ? 6 : 2);
      for (const hd of geom.heads) {
        let lime = 0;
        for (let y = 0; y < hd.h; y++) for (let x = 0; x < hd.w; x++) if (c.at(gx + hd.x + x, gy + hd.y + y) === C.lime) lime++;
        expect(lime, `${id} ${wn}: an arrowhead of ${HEAD_LEN} rows (1 + 3 + 3 px)`).toBe(7);
        expect(hd.dir === 0 || hd.dir === 2 ? hd.h : hd.w, `${id}: the head is ${HEAD_LEN} long`).toBe(HEAD_LEN);
      }
      // G3: the share of the icon's opaque px the plate hides
      const ic = R(itemIcon(id)), plate = plateAt(id, z.grid);
      let opaque = 0, hidden = 0;
      for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) {
        if (ic.at(i, j) === null) continue;
        for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { opaque++; if (inBox(plate, z.icon.x + 2 * i + a, z.icon.y + 2 * j + b)) hidden++; }
      }
      expect(hidden / opaque, `${id} ${wn}: the plate hides at most 25% of the icon`).toBeLessThanOrEqual(0.25);
      rows.push(`${id} ${wn} ${w}x${h}: grid ${sz.w}x${sz.h} (plate ${plate.w}x${plate.h} at ${plate.x},${plate.y}), icon ${z.icon.x},${z.icon.y} ${CARD_ICON}x${CARD_ICON}, hides ${hidden}/${opaque} = ${((100 * hidden) / opaque).toFixed(1)}%`);
    }
    console.log(`SHOPCARD1 shaped pieces' cards, ${rows.length}:\n${rows.join("\n")}`);
  });

  it("a card of a piece that is not shaped draws no grid, plate or arrowhead", () => {
    for (const id of ["whetstone", "kiln", "flak", "calibrate", "press"]) for (const [wn, w, h] of WIDTHS) {
      expect(shapedPiece(id), id).toBe(false);
      const c = draw(id, w, h, {}), z = cardZones(w, h);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const px = c.at(OX + z.grid.x + x, OY + z.grid.y + y);
        if (!inBox(z.icon, z.grid.x + x, z.grid.y + y)) expect(px, `${id} ${wn}: the grid's corner is the card's face`).toBe(C.slate0);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------------ G1: synthetic footprints
const rigOf = (cells: [number, number][], arrows: [number, number, number][]): GridSpec => ({ cells, arrows: arrows.map(([x, y, dir]) => ({ cell: [x, y] as [number, number], dir })), rig: true });
const SYN: [string, GridSpec, { w: number; h: number; ox: number; oy: number }][] = [
  // [name, spec, the box at 4 px a cell: its size and the first tile's top-left]
  ["I2 along x, forward arrows", rigOf([[0, 0], [1, 0]], [[0, 0, 0], [1, 0, 0]]), { w: 9, h: 7, ox: 1, oy: 3 }],
  ["I2 along y, arrows right", rigOf([[0, 0], [0, 1]], [[0, 0, 1], [0, 1, 1]]), { w: 7, h: 9, ox: 1, oy: 1 }],
  ["I3 along x, arrows down", rigOf([[0, 0], [1, 0], [2, 0]], [[0, 0, 2], [1, 0, 2], [2, 0, 2]]), { w: 13, h: 7, ox: 1, oy: 1 }],
  ["I3 along y, arrows left and right (SPIKE RAIL)", rigOf([[0, 0], [0, 1], [0, 2]], [[0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 0, 3], [0, 1, 3], [0, 2, 3]]), { w: 9, h: 13, ox: 3, oy: 1 }],
  ["L3, arrows on every side", rigOf([[0, 0], [0, 1], [1, 1]], [[0, 0, 0], [0, 0, 3], [0, 1, 3], [0, 1, 2], [1, 1, 2], [1, 1, 1]]), { w: 3 + 8 + 2, h: 3 + 8 + 2, ox: 3, oy: 3 }],
  ["T4, arrows on every side", rigOf([[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 3], [2, 0, 1], [1, 1, 2]]), { w: 3 + 12 + 2, h: 3 + 8 + 2, ox: 3, oy: 3 }],
  ["2x2 factory", { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], arrows: [], rig: false }, { w: 9, h: 9, ox: 1, oy: 1 }],
  ["2x3 factory", { cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], arrows: [], rig: false }, { w: 13, h: 9, ox: 1, oy: 1 }],
  ["2x3 rig, arrows on every side", rigOf([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 2], [1, 1, 2], [2, 1, 2], [0, 0, 3], [0, 1, 3], [2, 0, 1], [2, 1, 1]]), { w: 3 + 12 + 2, h: 3 + 8 + 2, ox: 3, oy: 3 }],
  ["a plus (5 cells), arrows on every side", rigOf([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0, 0], [0, 1, 3], [2, 1, 1], [1, 2, 2]]), { w: 3 + 12 + 2, h: 3 + 12 + 2, ox: 3, oy: 3 }],
];

describe("SHOPCARD-1 (REQ-BFG-113): G1 draws any footprint, with arrowheads on every side", () => {
  for (const cell of [4, 5]) {
    it(`${SYN.length} synthetic footprints at ${cell} px a cell: each box, tile, seam, outline and arrowhead where expected`, () => {
      const t = cell - 1;
      for (const [name, spec, want] of SYN) {
        const geom = gridGeom(spec, cell), n = spec.cells.length;
        const W = Math.max(...spec.cells.map((q) => q[0])) + 1, H = Math.max(...spec.cells.map((q) => q[1])) + 1;
        // the box: the outline's 1 px (HEAD_LEN where an arrow points that way) and the cells' blocks; its first tile's corner
        const wantW = want.ox + W * cell + (spec.arrows.some((a) => a.dir === 1) ? HEAD_LEN - 1 : 0);
        const wantH = want.oy + H * cell + (spec.arrows.some((a) => a.dir === 2) ? HEAD_LEN - 1 : 0);
        expect([geom.ox, geom.oy, geom.w, geom.h], `${name} at ${cell}`).toEqual([want.ox, want.oy, wantW, wantH]);
        if (cell === 4) expect([geom.w, geom.h], `${name}: the box at 4 px`).toEqual([want.w, want.h]);
        const c = fresh(geom.w + 6, geom.h + 6), ox = 3, oy = 3;
        drawGrid(G(c), spec, ox, oy, cell);
        const fill = spec.rig ? C.wood2 : C.steel2, hi = spec.rig ? C.wood3 : C.steel3, seam = spec.rig ? C.wood0 : C.steel0;
        const at = (x: number, y: number) => c.at(ox + x, oy + y);
        const has = (x: number, y: number) => spec.cells.some(([u, v]) => u === x && v === y);
        // nothing is drawn outside the box
        let outside = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.at(x, y) !== null && (x < ox || y < oy || x >= ox + geom.w || y >= oy + geom.h)) outside++;
        expect(outside, `${name}: nothing outside its box`).toBe(0);
        spec.cells.forEach(([cx, cy], i) => {
          const tl = geom.tiles[i];
          expect([tl.w, tl.h], name).toEqual([t, t]);
          for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) expect(at(tl.x + x, tl.y + y), `${name} tile ${cx},${cy} ${x},${y}`).toBe(y === 0 ? hi : fill);
          // the block's last column and row: a seam where a cell lies beyond, else the outline's ink
          for (let k = 0; k < t; k++) {
            const arrow = (dir: number) => spec.arrows.some((a) => a.cell[0] === cx && a.cell[1] === cy && a.dir === dir);
            expect(at(tl.x + t, tl.y + k), `${name} ${cx},${cy}: right edge`).toBe(has(cx + 1, cy) ? seam : arrow(1) ? C.lime : C.ink);
            expect(at(tl.x + k, tl.y + t), `${name} ${cx},${cy}: bottom edge`).toBe(has(cx, cy + 1) ? seam : arrow(2) ? C.lime : C.ink);
          }
          // the outline on the top and left, where no cell lies beyond (an arrowhead may take its place)
          for (let k = 0; k < t; k++) {
            if (!has(cx, cy - 1) && !spec.arrows.some((a) => a.cell[0] === cx && a.cell[1] === cy && a.dir === 0)) expect(at(tl.x + k, tl.y - 1), `${name} ${cx},${cy}: top outline`).toBe(C.ink);
            if (!has(cx - 1, cy) && !spec.arrows.some((a) => a.cell[0] === cx && a.cell[1] === cy && a.dir === 3)) expect(at(tl.x - 1, tl.y + k), `${name} ${cx},${cy}: left outline`).toBe(C.ink);
          }
        });
        // the arrowheads: lime, outside the edge, HEAD_LEN long, a base of the tile's width and a tip of 1 px (2 on an even tile)
        spec.arrows.forEach((a, i) => {
          const hd = geom.heads[i], tl = geom.tiles[spec.cells.findIndex(([u, v]) => u === a.cell[0] && v === a.cell[1])];
          const along = a.dir === 0 || a.dir === 2 ? hd.h : hd.w;
          expect(along, `${name} arrow ${i}: at least 3 px long`).toBeGreaterThanOrEqual(3);
          // beside the tile's edge it shines from
          if (a.dir === 0) expect(hd.y + hd.h, name).toBe(tl.y);
          if (a.dir === 2) expect(hd.y, name).toBe(tl.y + t);
          if (a.dir === 3) expect(hd.x + hd.w, name).toBe(tl.x);
          if (a.dir === 1) expect(hd.x, name).toBe(tl.x + t);
          // the pointer's rows, tip outward: 1 (2) px, then the tile's width twice
          const runs: number[] = [];
          for (let k = 0; k < HEAD_LEN; k++) {
            let lime = 0;
            for (let m = 0; m < t; m++) {
              const x = a.dir === 0 || a.dir === 2 ? hd.x + m : a.dir === 1 ? hd.x + k : hd.x + (HEAD_LEN - 1 - k);
              const y = a.dir === 0 ? hd.y + (HEAD_LEN - 1 - k) : a.dir === 2 ? hd.y + k : hd.y + m;
              if (at(x, y) === C.lime) lime++;
            }
            runs.push(lime);
          }
          expect(runs, `${name} arrow ${i} (dir ${a.dir}): base, middle, tip`).toEqual([t, t, t % 2 ? 1 : 2]);
        });
        expect(n, name).toBeGreaterThan(1);
      }
    });
  }

  it("the grid canvas and the plate: shapeGrid is the cached grid, the plate puts 1 px of ink round it", () => {
    const id = "spikerail", sz = shapeGridSize(id), c = fresh(sz.w + 8, sz.h + 8);
    const box = drawShapePlate(G(c), id, 3, 3);
    expect(box).toEqual({ x: 3, y: 3, w: sz.w + 2, h: sz.h + 2 });
    expect(c.at(3, 3)).toBe(C.ink);
    expect(c.at(3 + box.w - 1, 3 + box.h - 1)).toBe(C.ink);
  });
});

// ------------------------------------------------------------------------------------------------------ F5: the words moved
describe("SHOPCARD-1 (REQ-BFG-115, F5): the desk's hover tooltip carries the whole face", () => {
  const runOn = (id: string, day: number) => {
    const run = newRun("furnace", 5, "sc1-tip");
    run.day = day;
    run.shop.wagons = [{ merchant: merchantOf(id), offers: [{ def: id, price: ITEMS[id].price, sold: false }] }];
    return run;
  };

  it("every buyable piece, days 1, 5 and 10: offerFace is the tap panel's face line for line (the same strings, the same day numbers)", () => {
    let pieces = 0, lines = 0;
    for (const d of buyableModules()) for (const day of [1, 5, 10]) {
      const run = runOn(d.id, day), panel = explainPanel(offerPanel(run, 0, 0)!, d.id);
      const face = panel.body.filter((b) => b.role !== "hint" && b.role !== "flavour").map((b) => b.text);
      const tip = offerFace(d.id, textOpts(run));
      expect(tip, `${d.id} day ${day}`).toEqual(face);
      expect(tip.length, `${d.id}: a face has a line`).toBeGreaterThan(0);
      lines += tip.length;
      if (day === 1) pieces++;
    }
    expect(pieces).toBe(buyableModules().length);
    console.log(`SHOPCARD1 (F5) tooltip faces: ${pieces} buyable pieces x 3 days, ${lines} lines`);
  });

  it("the tooltip draws every line of the face (each wrapped to its width), after the name, the kind and the families; it keeps on screen and a string is still one item", () => {
    for (const id of ["whetstone", "nailstrip", "gantry", "flak", "calibrate", "assembly", "mantlet"]) {
      const run = runOn(id, 5), face = offerFace(id, textOpts(run)), d = ITEMS[id];
      const c = fresh(300, 160);
      rec.text.length = 0;
      drawTooltip(G(c), { x: 10, y: 10, w: WIDE_CARD_MAX_W, h: WIDE_CARD_H }, d, 300, face, 160);
      const drawn = rec.text.map((t) => t.s).join("");
      const want = face.flatMap((l) => tooltipLines(l).map(lineText)).join("");
      expect(drawn.endsWith(want), `${id}: the face's lines are drawn, in order, last`).toBe(true);
      expect(drawn.startsWith(d.name), id).toBe(true);
      // on screen: no paint outside the canvas, whatever the height
      expect((c as unknown as { oob: number }).oob, `${id}: on screen`).toBe(0);
      // a low card keeps the box on screen too: it moves up over its card
      const low = fresh(300, 100);
      drawTooltip(G(low), { x: 10, y: 70, w: WIDE_CARD_MAX_W, h: WIDE_CARD_H }, d, 300, face, 100);
      expect((low as unknown as { oob: number }).oob, `${id}: kept on a short screen`).toBe(0);
    }
    // a pack's tooltip (one string) is as it was: the same box
    const a = fresh(200, 100), b = fresh(200, 100), d = ITEMS.whetstone;
    drawTooltip(G(a), { x: 10, y: 10, w: 40, h: 40 }, d, 200, "ONE SENTENCE.");
    drawTooltip(G(b), { x: 10, y: 10, w: 40, h: 40 }, d, 200, ["ONE SENTENCE."]);
    expect(a.px.join()).toBe(b.px.join());
  });
});
