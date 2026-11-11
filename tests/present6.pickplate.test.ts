// PRESENT-6 A2 (REQ-BFG-115, REQ-BFG-113; backlog #583 (2); cap's ruling 5 on PRESENT-5's Q5): PICKAXE's plate on the narrow phone shop card hid 128 of its icon's 336 opaque px (38.1%; the guide is 25%) since PRESENT-5 A gave the card 4 px heads. The narrow card's plate is
//  now SHAPED (shapePic.ts drawShapePlate's `trim`, shapePlateInk): ink only behind the grid's own px (tiles, seams, outline, heads) and 1 px round them (up, down, left, right), where it was the grid's whole box in a 1 px margin. The plate's rect, the 4 px heads (HEAD_BIG)
//  and the 4 px cell (GRID_CELL_MIN) are as they were; every wide card's plate is the box still. A recorder round drawShapePlate gives three drawings of every card: as shipped, with the OLD box plate (`trim` forced off: the base's drawing) and with no plate at all (the card's face under it).
//  Proof: (1) the hidden count by pixels (PICKAXE 128 -> 82 of 336) and the plate's px on the icon's 24 x 24 box (a number that holds for any picture: 168 -> 111); (2) every head still HEAD_BIG (each head's lime px); (3) no ink px of the plate meets a mark, for widths 46..68,
//  both heights and prices of 1, 2 and 3 digits; (4) every card is the old drawing's to the pixel outside the plate's rect, and inside it each px is the old plate's where the new plate has ink and the bare card's where it has none; (5) a wide card is the old drawing whole.
import { describe, expect, it, vi } from "vitest";
import { G, R, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

const mode = vi.hoisted(() => ({ m: "as" as "as" | "box" | "none" }));
vi.mock("../src/ui/shapePic", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/ui/shapePic")>();
  const drawShapePlate: typeof m.drawShapePlate = (g, id, x, y, cell, alpha, headLen, trim) => {
    if (mode.m === "none") { const sz = m.shapeGridSize(id, cell, headLen); return { x, y, w: sz.w + 2, h: sz.h + 2 }; } // no plate and no grid: the card's own face
    return m.drawShapePlate(g, id, x, y, cell, alpha, headLen, mode.m === "box" ? false : trim);
  };
  return { ...m, drawShapePlate };
});

import { ITEMS, buyableModules, type MerchantId } from "../src/sim/content";
import type { ShopBadge } from "../src/game/run";
import { C } from "../src/render/palette";
import { itemIcon } from "../src/render/sprites";
import { CARD_TEXT_MIN_W, CARD_W, CARD_H, WIDE_CARD_H, WIDE_CARD_MAX_W } from "../src/screens/build/layout";
import { OWNED_MARK_H, OWNED_MARK_W, cardPriceBox, cardZones, drawCard, ownedMarkAt, type CardState } from "../src/screens/build/shop";
import { CARGO_FACE, HEAD_BIG, gridCell, gridGeom, gridSpecOf, hasGrid, shapeGrid, shapeGridSize, shapePlateInk } from "../src/ui/shapePic";

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

function draw(id: string, w: number, h: number, s: Partial<CardState>, price: number, m: "as" | "box" | "none" = "as"): RasterCanvas {
  mode.m = m;
  const c = fresh(w + 2 * OX, h + 2 * OY + 2);
  drawCard(G(c), { x: OX, y: OY, w, h }, ITEMS[id], price, merchantOf(id), { ...BASE, ...s }, 0);
  mode.m = "as";
  return c;
}
/** the plate's rect on the narrow card (HEAD_BIG at its icon-sized cell), in card px */
const plateOf = (id: string, w: number, h: number, price: number): Box => { const z = cardZones(w, h, price), sz = shapeGridSize(id, gridCell(id, CARGO_FACE), HEAD_BIG); return { x: z.grid.x, y: z.grid.y, w: sz.w + 2, h: sz.h + 2 }; };
/** the plate's ink px as drawn on the narrow card: the mask canvas shapePlateInk (opaque = ink) at the plate's place */
const inkAt = (id: string, p: Box): ((x: number, y: number) => boolean) => { const m = R(shapePlateInk(id, gridCell(id, CARGO_FACE), HEAD_BIG)); return (x, y) => inBox(p, x, y) && m.at(x - p.x, y - p.y) !== null; };
/** the icon's opaque px on the card at x2 (24 x 24 at cardZones' icon box), in card px */
function iconPx(id: string, z: ReturnType<typeof cardZones>): [number, number][] {
  const ic = R(itemIcon(id)), out: [number, number][] = [];
  for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) if (ic.at(i, j) !== null) for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) out.push([z.icon.x + 2 * i + a, z.icon.y + 2 * j + b]);
  return out;
}

describe("PRESENT-6 A2: the narrow phone shop card's plate is shaped (ink only behind the grid's own px and 1 px round them)", () => {
  it("shapePlateInk: the plate's box (the grid + 1 px each side), every grid px inked, the ink within 1 px (up, down, left, right) of a grid px, and the box's empty corners bare", () => {
    for (const id of SHAPED) {
      const cell = gridCell(id, CARGO_FACE), g = gridGeom(gridSpecOf(id), cell, HEAD_BIG), grid = R(shapeGrid(id, cell, HEAD_BIG)), mask = R(shapePlateInk(id, cell, HEAD_BIG));
      expect([mask.width, mask.height], `${id}: the plate's box`).toEqual([g.w + 2, g.h + 2]);
      let ink = 0, corners = 0;
      for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
        const gx = x - 1, gy = y - 1, g0 = gx >= 0 && gy >= 0 && gx < g.w && gy < g.h && grid.at(gx, gy) !== null;
        const near = (dx: number, dy: number): boolean => { const a = gx + dx, b = gy + dy; return a >= 0 && b >= 0 && a < g.w && b < g.h && grid.at(a, b) !== null; };
        const want = g0 || near(-1, 0) || near(1, 0) || near(0, -1) || near(0, 1);
        expect(mask.at(x, y) !== null, `${id}: plate px (${x}, ${y})`).toBe(want);
        if (mask.at(x, y) !== null) { ink++; expect(mask.at(x, y), `${id}: ink`).toBe(C.ink); } else corners++;
      }
      expect(ink, `${id}: the plate is not empty`).toBeGreaterThan(0);
      if (id === "pickaxe") expect(corners, "PICKAXE's box has bare corners").toBeGreaterThan(20);
    }
  });

  it("the hidden count by pixels on the 46 x 42 phone card: PICKAXE hides 82 of its icon's 336 opaque px (24.4%; the box plate hid 128, 38.1%); no part hides more than before or more than 25%; the plate's px on the icon's 24 x 24 box fall (PICKAXE 168 -> 111)", () => {
    const rows: string[] = [];
    let worse = 0;
    for (const id of SHAPED) {
      const price = 12, z = cardZones(CARD_W, CARD_H, price), p = plateOf(id, CARD_W, CARD_H, price), ink = inkAt(id, p), px = iconPx(id, z);
      let was = 0, now = 0, onBoxWas = 0, onBoxNow = 0;
      for (const [x, y] of px) { if (inBox(p, x, y)) was++; if (ink(x, y)) now++; }
      for (let y = z.icon.y; y < z.icon.y + z.icon.h; y++) for (let x = z.icon.x; x < z.icon.x + z.icon.w; x++) { if (inBox(p, x, y)) onBoxWas++; if (ink(x, y)) onBoxNow++; }
      rows.push(`A2 ${id.padEnd(12)} plate ${p.w}x${p.h}: hides ${String(was).padStart(3)} -> ${String(now).padStart(3)} of ${px.length} (${((100 * was) / px.length).toFixed(1)}% -> ${((100 * now) / px.length).toFixed(1)}%); plate px on the icon's box ${String(onBoxWas).padStart(3)} -> ${String(onBoxNow).padStart(3)} of ${z.icon.w * z.icon.h}`);
      if (now > was) worse++;
      expect(now, `${id}: the plate hides no more than the box did`).toBeLessThanOrEqual(was);
      expect(now / px.length, `${id}: at most 25% of the icon is hidden (PICKAXE's was the one measured exception, 128 of 336)`).toBeLessThanOrEqual(0.25);
      expect(onBoxNow, `${id}: no more plate on the icon's box`).toBeLessThanOrEqual(onBoxWas);
      if (id === "pickaxe") {
        expect([was, px.length], "the box plate hid 128 of 336").toEqual([128, 336]);
        expect([now, px.length], "the shaped plate hides 82 of 336 (24.4%, under the 84 of the 25% guide)").toEqual([82, 336]);
        expect([onBoxWas, onBoxNow]).toEqual([168, 111]);
      }
    }
    expect(worse, "no part's hidden share rises").toBe(0);
    console.log(`A2 the narrow card's plate on the icon, per shaped part (the base's box plate -> the tip's shaped plate), ${SHAPED.length} parts:\n${rows.join("\n")}`);
  });

  it("the pixels agree: the card drawn as shipped hides the icon's px exactly where the shaped plate's ink is (a recorded no-plate drawing is the icon's face), for PICKAXE and every rig", () => {
    for (const id of RIGS) {
      const price = 12, z = cardZones(CARD_W, CARD_H, price), p = plateOf(id, CARD_W, CARD_H, price), ink = inkAt(id, p), a = draw(id, CARD_W, CARD_H, {}, price), none = draw(id, CARD_W, CARD_H, {}, price, "none");
      let changed = 0;
      for (const [x, y] of iconPx(id, z)) { if (a.at(OX + x, OY + y) !== none.at(OX + x, OY + y)) { changed++; expect(ink(x, y), `${id}: icon px (${x}, ${y}) changed without plate ink there`).toBe(true); } }
      // (an icon px of the plate's own ink colour under the ink does not change: the count of changed px is at most the mask's)
      if (id === "pickaxe") expect(changed, "PICKAXE's brown and grey icon px under the ink change").toBeGreaterThan(40);
    }
  });

  it("every rig's arrowheads on the narrow card are still HEAD_BIG (4 px long: the tip, the head's width, a 2 px shaft twice: s + t + 2 s lime px) over the shaped plate, where gridGeom puts them, at every width, height and state", () => {
    let heads = 0;
    for (const id of RIGS) for (const [w, h] of SIZES) for (const [sn, s] of STATES) {
      if (s.sold) continue; // a sold card is dimmed (alpha): its lime is not the palette's
      const price = 7, z = cardZones(w, h, price), spec = gridSpecOf(id), cell = gridCell(id, CARGO_FACE), t = cell - 1, sp = t % 2 ? 1 : 2;
      const c = draw(id, w, h, s, price), geom = gridGeom(spec, cell, HEAD_BIG), gx = OX + z.grid.x + 1, gy = OY + z.grid.y + 1;
      expect(geom.heads.length, id).toBe(spec.arrows.length);
      for (const hd of geom.heads) {
        let lime = 0;
        for (let y = 0; y < hd.h; y++) for (let x = 0; x < hd.w; x++) if (c.at(gx + hd.x + x, gy + hd.y + y) === C.lime) lime++;
        expect(lime, `${id} ${w}x${h} ${sn}: an arrowhead of ${HEAD_BIG} rows`).toBe(sp + t + 2 * sp);
        expect(hd.dir === 0 || hd.dir === 2 ? hd.h : hd.w, id).toBe(HEAD_BIG);
        heads++;
      }
    }
    expect(heads).toBeGreaterThan(9 * 5 * 6);
    expect(gridCell("pickaxe", CARGO_FACE), "the 4 px cell").toBe(4);
  });

  it("the plate meets no mark (the merge plate, the owned marker, the sale plate, the gem, the price's box) and lies inside the picture area, for every shaped part, widths 46..68, both heights, prices of 1, 2 and 3 digits (the ink lies inside the plate's rect: the first test; so no ink px meets a mark either)", () => {
    let n = 0;
    for (const id of SHAPED) for (let w = CARD_W; w < CARD_TEXT_MIN_W; w++) for (const h of [CARD_H, WIDE_CARD_H]) for (const price of [1, 9, 12, 99, 105, 999]) {
      const z = cardZones(w, h, price), p = plateOf(id, w, h, price), om = ownedMarkAt(h);
      const zones: Record<string, Box> = { merge: z.merge, sale: z.sale, gem: z.gem, price: cardPriceBox(w, h, price), owned: { x: om.x, y: om.y, w: OWNED_MARK_W, h: OWNED_MARK_H } };
      for (const [k, q] of Object.entries(zones)) expect(hit(p, q), `${id} ${w}x${h} price ${price}: the plate ${JSON.stringify(p)} meets the ${k} ${JSON.stringify(q)}`).toBe(false);
      expect(p.x, id).toBeGreaterThanOrEqual(z.pic.x);
      expect(p.y, id).toBeGreaterThanOrEqual(z.pic.y);
      expect(p.x + p.w, `${id} ${w}x${h}: inside the picture area's width`).toBeLessThanOrEqual(z.pic.x + z.pic.w);
      expect(p.y + p.h, `${id} ${w}x${h}: inside the picture area's height`).toBeLessThanOrEqual(z.pic.y + z.pic.h);
      n++;
    }
    expect(n).toBe(SHAPED.length * (CARD_TEXT_MIN_W - CARD_W) * 2 * 6);
  }, 120_000);

  it("every card is the OLD drawing's (the base's box plate) to the pixel outside the plate's rect, and inside it each px is the old plate's where the new plate has ink and the bare card's where it has none, for every shaped part, size and state", () => {
    let compared = 0, bare = 0;
    const prices = [7, 12, 105];
    for (const id of SHAPED) for (const [w, h] of SIZES) for (const [sn, s] of STATES) {
      const price = prices[(compared + id.length) % 3], a = draw(id, w, h, s, price), old = draw(id, w, h, s, price, "box"), none = draw(id, w, h, s, price, "none");
      const p = plateOf(id, w, h, price), lift = s.selected ? 2 : s.hover ? 1 : 0, box: Box = { x: OX + p.x, y: OY - lift + p.y, w: p.w, h: p.h }, m = R(shapePlateInk(id, gridCell(id, CARGO_FACE), HEAD_BIG));
      for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
        if (!inBox(box, x, y)) { if (a.at(x, y) !== old.at(x, y)) expect.fail(`${id} ${w}x${h} ${sn}: pixel (${x - OX}, ${y - OY}) is ${a.at(x, y)}, the old card drew ${old.at(x, y)}, outside the plate ${JSON.stringify(p)}`); continue; }
        // the mask holds every px the grid draws (shapePlateInk's own test), so outside it there is no grid px either: the card there is the face the no-plate drawing shows
        const inked = m.at(x - box.x, y - box.y) !== null, want = inked ? old.at(x, y) : none.at(x, y);
        if (a.at(x, y) !== want) expect.fail(`${id} ${w}x${h} ${sn}: plate px (${x - box.x}, ${y - box.y}) is ${a.at(x, y)}, want ${want} (${inked ? "the old plate's" : "the bare card's"})`);
        if (!inked) bare++;
      }
      compared++;
    }
    expect(compared).toBe(SHAPED.length * SIZES.length * STATES.length);
    expect(bare, "the plates' bare corners and gaps show the card").toBeGreaterThan(1000);
  });

  it("a wide card (69 px and up) keeps the plate's whole box: the card is the old drawing's to the pixel", () => {
    for (const id of SHAPED) for (const [w, h] of [[CARD_TEXT_MIN_W, WIDE_CARD_H], [WIDE_CARD_MAX_W, WIDE_CARD_H]] as const) for (const [sn, s] of STATES) {
      const a = draw(id, w, h, s, 12), old = draw(id, w, h, s, 12, "box");
      for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (a.at(x, y) !== old.at(x, y)) expect.fail(`${id} ${w}x${h} ${sn}: pixel (${x}, ${y}) differs on a wide card`);
    }
  });
});
