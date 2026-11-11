// PRESENT-5 A (REQ-BFG-113, REQ-BFG-115; backlog #537 (2); PRESENT-3's brief section A): the narrow phone shop card (46..68 px wide: CARD_W up to CARD_TEXT_MIN_W - 1) draws a rig's arrowheads 4 px long, HEAD_BIG (src/ui/shapePic.ts), at its
//  icon-sized cell, where it drew HEAD_LEN (3 px). The plate's room under the card's marks holds them: no layout change (src/screens/build/layout.ts is untouched; the card's rect, the zones, the icon, the price and the marks are as they were).
//  Proof here: (1) every rig's arrowheads on the narrow card are HEAD_BIG (the tip, the head's width, a 2 px shaft twice), (2) the card is pixel-identical to the OLD drawing (drawShapePlate called without a head, as the base's shop.ts did) everywhere outside the
//  new plate's rect: the icon, the price, every mark, the gem and the frame keep their pixels whole; every shaped part that is not a rig (no arrowhead) is identical to the pixel, (3) the new plate meets no mark: not the merge plate, the owned
//  marker, the sale plate, the gem or the price's box, for every width 46..68, both heights, prices of 1, 2 and 3 digits; and sits inside the picture area.
import { describe, expect, it, vi } from "vitest";
import { G, R, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

/** `old`: shop.ts's drawShapePlate call as it was at present5-base (no `head` argument: the narrow card's HEAD_LEN); PRESENT-5 A passes HEAD_BIG. */
const mode = vi.hoisted(() => ({ old: false }));
vi.mock("../src/ui/shapePic", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/ui/shapePic")>();
  // PRESENT-6 A2 (the wrapper's cause): the narrow card's plate is shaped now (`trim`: shapePic.ts drawShapePlate's 8th argument); the wrapper forwards it, and the OLD drawing is the base's whole-box plate (no head, no trim)
  const drawShapePlate: typeof m.drawShapePlate = (g, id, x, y, cell, alpha, headLen, trim) => m.drawShapePlate(g, id, x, y, cell, alpha, mode.old ? undefined : headLen, mode.old ? false : trim);
  return { ...m, drawShapePlate };
});

import { ITEMS, buyableModules, type MerchantId } from "../src/sim/content";
import type { ShopBadge } from "../src/game/run";
import { C } from "../src/render/palette";
import { CARD_TEXT_MIN_W, CARD_W, CARD_H, WIDE_CARD_H } from "../src/screens/build/layout";
import { OWNED_MARK_H, OWNED_MARK_W, cardPriceBox, cardZones, drawCard, ownedMarkAt, type CardState } from "../src/screens/build/shop";
import { CARGO_FACE, HEAD_BIG, HEAD_LEN, gridCell, gridGeom, gridSpecOf, hasGrid, shapeGridSize, shapePlateInk } from "../src/ui/shapePic";

installRaster();

type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inBox = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
const BASE: CardState = { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0 };
const STATES: [string, Partial<CardState>][] = [
  ["affordable", {}], ["too dear", { affordable: false }], ["merge ★2", { badge: { kind: "merge", toStars: 2 } as ShopBadge }], ["owned", { badge: { kind: "wait" } as ShopBadge }],
  ["sale", { sale: true }], ["merge and sale", { sale: true, badge: { kind: "merge", toStars: 3 } as ShopBadge }], ["sold", { sold: true }],
];
const SIZES: [number, number][] = [[CARD_W, CARD_H], [CARD_W, WIDE_CARD_H], [52, WIDE_CARD_H], [60, WIDE_CARD_H], [CARD_TEXT_MIN_W - 1, WIDE_CARD_H]];
const OX = 4, OY = 4;
const merchantOf = (id: string): MerchantId => ITEMS[id].merchant ?? "ironmonger";
const SHAPED = buyableModules().filter((d) => hasGrid(d.id)).map((d) => d.id);
const RIGS = SHAPED.filter((id) => gridSpecOf(id).arrows.length > 0);

function draw(id: string, w: number, h: number, s: Partial<CardState>, price: number, old: boolean): RasterCanvas {
  mode.old = old;
  const c = fresh(w + 2 * OX, h + 2 * OY + 2);
  drawCard(G(c), { x: OX, y: OY, w, h }, ITEMS[id], price, merchantOf(id), { ...BASE, ...s }, 0);
  mode.old = false;
  return c;
}
/** the plate's rect as the narrow card draws it now (HEAD_BIG at its icon-sized cell), in card px */
const plateNow = (id: string, w: number, h: number, price: number): Box => { const z = cardZones(w, h, price), sz = shapeGridSize(id, gridCell(id, CARGO_FACE), HEAD_BIG); return { x: z.grid.x, y: z.grid.y, w: sz.w + 2, h: sz.h + 2 }; };

describe("PRESENT-5 A: the narrow phone shop card's arrowheads are HEAD_BIG", () => {
  it("the shop sells shaped parts and nine of them are rigs with arrowheads (the narrow card's cell is 5 px, PICKAXE's 4)", () => {
    expect(SHAPED.length).toBeGreaterThan(20);
    expect(RIGS.sort()).toEqual(["cinderhook", "elbowguard", "embertrough", "jawcrusher", "nailstrip", "pickaxe", "sawbar", "sparkcomb", "spikerail"]);
    for (const id of RIGS) expect(gridCell(id, CARGO_FACE), id).toBe(id === "pickaxe" ? 4 : 5);
    expect(HEAD_BIG).toBe(4);
    expect(HEAD_LEN).toBe(3);
  });

  it("every rig's arrowheads on the narrow card are HEAD_BIG: 4 px long, the tip, the head's width, a 2 px shaft twice (s + t + 2 s lime px), where gridGeom puts them; the OLD drawing's were HEAD_LEN (s + 2 t px)", () => {
    let heads = 0;
    for (const id of RIGS) for (const [w, h] of SIZES) for (const [sn, s] of STATES) {
      if (s.sold) continue; // a sold card is dimmed (alpha): its lime is not the palette's
      const price = 7, z = cardZones(w, h, price), spec = gridSpecOf(id), cell = gridCell(id, CARGO_FACE), t = cell - 1, sp = t % 2 ? 1 : 2;
      for (const [old, head] of [[false, HEAD_BIG], [true, HEAD_LEN]] as const) {
        const c = draw(id, w, h, s, price, old), geom = gridGeom(spec, cell, head), gx = OX + z.grid.x + 1, gy = OY + z.grid.y + 1;
        expect(geom.heads.length, id).toBe(spec.arrows.length);
        for (const hd of geom.heads) {
          let lime = 0;
          for (let y = 0; y < hd.h; y++) for (let x = 0; x < hd.w; x++) if (c.at(gx + hd.x + x, gy + hd.y + y) === C.lime) lime++;
          expect(lime, `${id} ${w}x${h} ${sn} ${old ? "old" : "now"}: an arrowhead of ${head} rows`).toBe(head === HEAD_BIG ? sp + t + 2 * sp : sp + 2 * t);
          expect(hd.dir === 0 || hd.dir === 2 ? hd.h : hd.w, id).toBe(head);
          if (!old) heads++;
        }
      }
    }
    expect(heads).toBeGreaterThan(9 * 5 * 6);
  });

  it("the icon, the price and every mark keep their pixels whole: the card is the OLD drawing's to the pixel everywhere outside the new plate's rect, for every shaped part, width, height and state; a part with no arrowhead is identical whole", () => {
    let compared = 0, plateChanged = 0;
    const prices = [7, 12, 105];
    for (const id of SHAPED) for (const [w, h] of SIZES) for (const [sn, s] of STATES) {
      const price = prices[(compared + id.length) % 3];
      const a = draw(id, w, h, s, price, false), b = draw(id, w, h, s, price, true);
      const p = plateNow(id, w, h, price), lift = s.selected ? 2 : s.hover ? 1 : 0;
      const box: Box = { x: OX + p.x, y: OY - lift + p.y, w: p.w, h: p.h };
      let outside = 0, inside = 0;
      for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
        if (a.at(x, y) === b.at(x, y)) continue;
        if (inBox(box, x, y)) inside++; else { outside++; expect.fail(`${id} ${w}x${h} ${sn}: pixel (${x - OX}, ${y - OY}) is ${a.at(x, y)}, the old card drew ${b.at(x, y)}, outside the plate ${JSON.stringify(p)}`); }
      }
      expect(outside).toBe(0);
      // PRESENT-6 A2 (REQ-BFG-115; #583 (2)), old -> new: the narrow card's plate is shaped now (ink only behind the grid's px and 1 px round them), so a part with no arrowhead differs from the OLD whole-box drawing inside its plate's rect too, at the
      // box's bare corners and gaps only (at most the bare px: tests/present6.pickplate.test.ts proves every px of the plate rect); it was identical whole
      if (!RIGS.includes(id)) { const mk = R(shapePlateInk(id, gridCell(id, CARGO_FACE), HEAD_BIG)); let ink = 0; for (let j = 0; j < mk.height; j++) for (let i = 0; i < mk.width; i++) if (mk.at(i, j) !== null) ink++; expect(inside, `${id}: no arrowhead, the card is the old one but for the plate's bare px`).toBeLessThanOrEqual(p.w * p.h - ink); }
      else plateChanged += inside > 0 ? 1 : 0;
      compared++;
    }
    expect(compared).toBe(SHAPED.length * SIZES.length * STATES.length);
    expect(plateChanged, "the rigs' plates changed").toBeGreaterThan(RIGS.length * 3);
  });

  it("the new plate meets no mark (the merge plate, the owned marker, the sale plate, the gem, the price's box) and lies inside the picture area, for every rig and shaped part, widths 46..68, both heights, prices of 1, 2 and 3 digits", () => {
    let n = 0;
    for (const id of SHAPED) for (let w = CARD_W; w < CARD_TEXT_MIN_W; w++) for (const h of [CARD_H, WIDE_CARD_H]) for (const price of [1, 9, 12, 99, 105, 999]) {
      const z = cardZones(w, h, price), p = plateNow(id, w, h, price), om = ownedMarkAt(h);
      const zones: Record<string, Box> = { merge: z.merge, sale: z.sale, gem: z.gem, price: cardPriceBox(w, h, price), owned: { x: om.x, y: om.y, w: OWNED_MARK_W, h: OWNED_MARK_H } };
      for (const [k, q] of Object.entries(zones)) expect(hit(p, q), `${id} ${w}x${h} price ${price}: the plate ${JSON.stringify(p)} meets the ${k} ${JSON.stringify(q)}`).toBe(false);
      expect(p.x, id).toBeGreaterThanOrEqual(z.pic.x);
      expect(p.y, id).toBeGreaterThanOrEqual(z.pic.y);
      expect(p.x + p.w, `${id} ${w}x${h}: inside the picture area's width`).toBeLessThanOrEqual(z.pic.x + z.pic.w);
      expect(p.y + p.h, `${id} ${w}x${h}: inside the picture area's height`).toBeLessThanOrEqual(z.pic.y + z.pic.h);
      n++;
    }
    expect(n).toBe(SHAPED.length * (CARD_TEXT_MIN_W - CARD_W) * 2 * 6);
  });
});
