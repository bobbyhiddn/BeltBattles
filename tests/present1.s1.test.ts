// PRESENT-1 S1 (SHOPCARD-1g; REQ-BFG-113 (1)-(3); backlog #471; BRIEF-PRESENT1 S1): every card of a piece bigger than one cell shows its grid.
//  (c) plain pieces bigger than one cell, the 2x2 factories and the size-2 turrets, get a footprint grid without arrows (shapePic.ts hasGrid);
//  (a) the grid is never dropped where it was: LAST CHANCE's narrow part card, the victory drop card and the warlord's pick buttons draw it over
//      the icon's corner where the words leave no room for the plate or the row's end (lcPartGrid, drawDropCard, drawGridRight's `corner`);
//  (b) a road event's choice card shows EVERY shaped part it gains or costs (event/cards.ts drawChoiceCard: the plates side by side);
//  (f) the in-battle scout face's icon is the build panel's shape picture for a shaped piece (battleScout.ts faceIcon).
// (d) and the px table are in the REPORT (scripts/browser kit); the shop card, the cargo slot, the drops, the road cards and the scout deck draw the
// grid wherever hasGrid says, so the plain pieces' rows here read the same cards tests/shopcard1.test.ts reads for the eleven shaped ones.
import { describe, expect, it } from "vitest";
import { G, R, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { ITEMS, buyableModules } from "../src/sim/content";
import { C } from "../src/render/palette";
import { itemIcon } from "../src/render/sprites";
import { textWidth } from "../src/render/font";
import { CARD_H, CARD_W, WIDE_CARD_H, WIDE_CARD_MAX_W } from "../src/screens/build/layout";
import { cardZones, drawCard, type CardState } from "../src/screens/build/shop";
import { shapedPiece } from "../src/screens/build/shapeEdit";
import { drawChoiceCard } from "../src/screens/event/cards";
import { drawDropCard } from "../src/screens/fork/drops";
import { lcPartGrid, lcPartPlate, lcPartSub } from "../src/screens/lastChancePicker";
import { faceIcon } from "../src/screens/battleScout";
import { HEAD_BIG, HEAD_LEN, SLOT_LATTICE, drawGridRight, gridCell, gridGeom, gridSpecOf, hasGrid, iconCell, shapeGridSize, shapePic } from "../src/ui/shapePic";
import { itemSlot } from "../src/ui/ui";
import { ENCHANT_DEFS } from "../src/sim/enchant";
import { footCount } from "../src/sim/foot";
import type { Build } from "../src/sim/deck";

installRaster();

type Box = { x: number; y: number; w: number; h: number };
const BASE: CardState = { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0 };
const fillOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood2 : C.steel2);
const limeIn = (c: RasterCanvas, b: Box): number => { let n = 0; for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (c.at(x, y) === C.lime) n++; return n; };
const merchantOf = (id: string) => ITEMS[id].merchant ?? "ironmonger";
const bigger = Object.keys(ITEMS).filter((id) => hasGrid(id));
const plain = bigger.filter((id) => !shapedPiece(id));
const factories2 = plain.filter((id) => ITEMS[id].kind === "factory"), turrets2 = plain.filter((id) => ITEMS[id].kind === "turret");

describe("PRESENT-1 S1 (c): every piece bigger than one cell has a grid, a plain one without arrows", () => {
  it("the plain ones: every 2x2 factory and every size-2 turret, 4 cells, no arrows, the kind's steel tiles, 11 x 11 at 5 px a cell", () => {
    expect(factories2.length).toBeGreaterThanOrEqual(15);
    expect(turrets2.length).toBeGreaterThanOrEqual(13);
    for (const id of Object.keys(ITEMS)) {
      const d = ITEMS[id];
      // a piece of one cell: none (a rig, a core, gear, a supply, a gate); a piece bigger than one: one, whatever its kind
      if (hasGrid(id)) expect(footCount(d) > 1 || shapedPiece(id), id).toBe(true);
      if (d.kind === "turret" || d.kind === "factory") expect(hasGrid(id), id).toBe(footCount(d) > 1);
      if (d.kind === "core" || d.kind === "mod" || d.kind === "supply" || d.kind === "converter") expect(hasGrid(id), id).toBe(false);
    }
    for (const id of plain) {
      const spec = gridSpecOf(id);
      expect(spec.cells, id).toHaveLength(4);
      expect(spec.arrows, `${id}: a plain piece has no arrows`).toEqual([]);
      expect(spec.rig, id).toBe(false);
      expect(gridCell(id), id).toBe(5);
      const geom = gridGeom(spec, 5);
      expect([geom.w, geom.h], `${id}: a 2x2 grid at 5 px a cell`).toEqual([11, 11]);
      expect(shapeGridSize(id)).toEqual({ w: 11, h: 11 });
    }
    expect(hasGrid("whetstone")).toBe(false);
    expect(hasGrid("no-such-piece")).toBe(false);
  });

  it("the shop card of every buyable 2x2 factory and size-2 turret, phone and desk: the plate at the grid corner, steel tiles, no arrowhead, at most 25% of the icon under it", () => {
    let n = 0;
    const worst: string[] = [];
    for (const d of buyableModules().filter((q) => plain.includes(q.id))) for (const [wn, w, h] of [["phone", CARD_W, CARD_H], ["desk", WIDE_CARD_MAX_W, WIDE_CARD_H], ["desk 69", 69, WIDE_CARD_H]] as [string, number, number][]) {
      const c = fresh(w + 8, h + 10);
      drawCard(G(c), { x: 4, y: 4, w, h }, ITEMS[d.id], d.price, merchantOf(d.id), { ...BASE }, 0);
      const z = cardZones(w, h, d.price), sz = shapeGridSize(d.id), plate: Box = { x: 4 + z.grid.x, y: 4 + z.grid.y, w: sz.w + 2, h: sz.h + 2 };
      expect(c.at(plate.x, plate.y), `${d.id} ${wn}: the plate's corner`).toBe(C.ink);
      for (const t of gridGeom(gridSpecOf(d.id), gridCell(d.id)).tiles) expect(c.at(plate.x + 1 + t.x + 1, plate.y + 1 + t.y + 1), `${d.id} ${wn}: a tile`).toBe(C.steel2);
      expect(limeIn(c, plate), `${d.id} ${wn}: no arrowhead on a plain piece`).toBe(0);
      // the plate hides at most 25% of the icon's opaque px (SHOPCARD-1 G3)
      const ic = R(itemIcon(d.id)), pl: Box = { x: z.grid.x, y: z.grid.y, w: sz.w + 2, h: sz.h + 2 };
      let opaque = 0, hidden = 0;
      for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) {
        if (ic.at(i, j) === null) continue;
        for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { opaque++; const cx = z.icon.x + 2 * i + a, cy = z.icon.y + 2 * j + b; if (cx >= pl.x && cx < pl.x + pl.w && cy >= pl.y && cy < pl.y + pl.h) hidden++; }
      }
      worst.push(`${d.id} ${wn} ${(100 * hidden / opaque).toFixed(1)}%`);
      expect(hidden / opaque, `${d.id} ${wn}: the plate hides at most 25% of the icon`).toBeLessThanOrEqual(0.25);
      n++;
    }
    expect(n).toBeGreaterThan(40);
    // eslint-disable-next-line no-console
    console.log(`PRESENT-1 S1 plain shop cards: ${n}; the most the plate hides: ${worst.sort((a, b) => parseFloat(b.split(" ").pop()!) - parseFloat(a.split(" ").pop()!)).slice(0, 3).join("; ")}`);
  });

  it("the cargo slot: the 2x2 grid over the icon inside the 16 px face, the star pips under it", () => {
    for (const id of plain) {
      const c = fresh(24, 24);
      itemSlot(G(c), 2, 2, id, false, 0, 1);
      // PRESENT-2 C2 (was: a tile's px is C.steel2): the slot's grid is a lattice (shapePic.ts slotGrid): the block corner is a lattice line; the tile is clear
      // (its px is the icon's own or the face's: tests/present2.slot.test.ts pins every tile px exactly; an icon may hold steel2 itself)
      for (const t of gridGeom(gridSpecOf(id), gridCell(id)).tiles) expect(c.at(2 + 1 + t.x - 1, 2 + 1 + t.y - 1), `${id}: a cell's block corner in the slot`).toBe(SLOT_LATTICE);
      expect(limeIn(c, { x: 0, y: 0, w: 24, h: 24 }), `${id}: no arrowhead`).toBe(0);
      const three = fresh(24, 24);
      itemSlot(G(three), 2, 2, id, false, 0, 3);
      expect([three.at(2 + 5, 2 + 13), three.at(2 + 8, 2 + 13), three.at(2 + 11, 2 + 13)], `${id}: ★3 pips`).toEqual([C.yellow, C.yellow, C.yellow]);
    }
  });
});

describe("PRESENT-1 S1 (a): the grid is not dropped where it was", () => {
  const withWords = (id: string): string[] => [ITEMS[id].name, ...Object.values(ENCHANT_DEFS).map((e) => `${e.name} ${ITEMS[id].name}`)];

  it("LAST CHANCE's part card: the plate where the words leave room, else over the icon's corner, at every card width (130-300 px), every piece bigger than one cell, every word", () => {
    let plates = 0, corners = 0;
    for (const id of bigger) for (const cardW of [130, 150, 178, 200, 233, 260, 300]) for (const name of withWords(id)) {
      const d = ITEMS[id], r = { x: 4, y: 10, w: cardW, h: 80 }, sub = lcPartSub(d.rarity, 1);
      const where = lcPartGrid(r, id, name, sub)!;
      expect(where, `${id} ${cardW} "${name}": never dropped`).not.toBeNull();
      if ("plate" in where) {
        expect(where.plate).toEqual(lcPartPlate(r, id, name, sub));
        plates++;
      } else {
        // over the icon box's inner corner (20 x 20 at +6, +7 in the 31 px head), the whole grid inside it
        const sz = shapeGridSize(id, iconCell(id)); // PRESENT-2 K: the corner over the icon is an icon-sized surface (the icon cell, HEAD_LEN)
        expect(where.corner, `${id} ${cardW}: the icon's corner`).toEqual({ x: r.x + 6, y: r.y + 7 });
        expect(sz.w, id).toBeLessThanOrEqual(20);
        expect(sz.h, id).toBeLessThanOrEqual(20);
        expect(lcPartPlate(r, id, name, sub), `${id} ${cardW}: the corner only where the plate has no room`).toBeNull();
        corners++;
      }
    }
    expect(lcPartGrid({ x: 0, y: 0, w: 233, h: 80 }, "whetstone", "WHETSTONE", "COMMON PART")).toBeNull();
    expect(plates).toBeGreaterThan(100);
    expect(corners).toBeGreaterThan(20); // the narrow cards and the long enchanted names that used to lose the grid
  });

  it("the victory drop card: the plate beside the words where they leave room, else the grid over the icon box's corner (plain and shaped pieces, 90-220 px)", () => {
    for (const id of bigger) for (const w of [90, 110, 140, 170, 200, 220]) {
      const c = fresh(w + 10, 30), x = 3, y = 3;
      drawDropCard(G(c), id, false, x, y, w, 1);
      const sz = shapeGridSize(id), pw = sz.w + 2, px = x + w - 4 - pw;
      const name = ITEMS[id].name, sub = "DROP · TO CARGO · ★1", room = x + 23 + Math.max(textWidth(name), textWidth(sub, "3")) + 4 <= px;
      const tiles = gridGeom(gridSpecOf(id), room ? gridCell(id) : iconCell(id), room ? HEAD_BIG : HEAD_LEN).tiles; // PRESENT-1 S1 (d): the plate at the roomy cell, the corner fallback at the icon cell (PICKAXE 5 / 4); PRESENT-2 K: the plate's 4 px arrow, the corner's 3
      // wherever the grid is, its tiles are in the kind's colour: on the plate (the image's top-left 1 px in from the plate's) or over the icon box's corner (x + 4, y + 4)
      const origin = room ? { x: px + 1, y: y + 1 + 1 } : { x: x + 4, y: y + 4 };
      for (const t of tiles) expect(c.at(origin.x + t.x + 1, origin.y + t.y + 1), `${id} ${w}: a tile ${room ? "on the plate" : "over the icon's corner"}`).toBe(fillOf(id));
      expect(c.at(px, y + 1) === C.ink, `${id} ${w}: the plate only where there is room`).toBe(room);
    }
  });

  it("the warlord's pick button: drawGridRight draws at the row's end where it clears the words and the badge, else at `corner`; no corner: dropped as before", () => {
    const id = "gantry", sz = shapeGridSize(id), geom = gridGeom(gridSpecOf(id), gridCell(id));
    const roomy = fresh(140, 40);
    expect(drawGridRight(G(roomy), id, 4, 6, 120, 4 + 18 + 40, Infinity, { x: 6, y: 8 })).toBe(true);
    const gx = 4 + 120 - 3 - sz.w;
    for (const t of geom.tiles) expect(roomy.at(gx + t.x + 1, 6 + t.y + 1)).toBe(fillOf(id));
    // the words reach the row's end: the corner
    const w = fresh(140, 40);
    expect(drawGridRight(G(w), id, 4, 6, 120, gx + 1, Infinity, { x: 6, y: 8 })).toBe(true);
    for (const t of gridGeom(gridSpecOf(id), iconCell(id)).tiles) expect(w.at(6 + t.x + 1, 8 + t.y + 1), "over the icon's corner").toBe(fillOf(id));
    expect(w.at(gx + 2, 6 + 2)).toBeNull(); // nothing at the row's end
    // a badge's top above the grid's foot: the corner too; no corner: not drawn (as before)
    expect(drawGridRight(G(fresh(140, 40)), id, 4, 6, 120, 0, 6 + sz.h - 1, { x: 6, y: 8 })).toBe(true);
    expect(drawGridRight(G(fresh(140, 40)), id, 4, 6, 120, gx + 1, Infinity)).toBe(false);
    // a plain 2x2 factory is a piece bigger than one cell now; a rig of one cell is not
    expect(drawGridRight(G(fresh(140, 40)), "kiln", 4, 6, 120, 0, Infinity)).toBe(true);
    expect(drawGridRight(G(fresh(140, 40)), "whetstone", 4, 6, 120, 0, Infinity, { x: 6, y: 8 })).toBe(false);
  });
});

describe("PRESENT-1 S1 (b): a road event's choice card shows every shaped part it gains or costs", () => {
  const v = { hover: false, pressed: false, state: "open" as const, won: false, shake: 0, t: 0, flash: false };
  const plateOf = (r: Box, ids: string[], i: number): Box => {
    // the plates side by side from the card's right end, in the order of the line (what it takes, then what it gives), 2 px apart
    const ws = ids.map((id) => shapeGridSize(id).w + 2), total = ws.reduce((a, b) => a + b, 0) + (ids.length - 1) * 2;
    const x = r.x + r.w - 4 - total + ws.slice(0, i).reduce((a, b) => a + b + 2, 0), sz = shapeGridSize(ids[i]);
    return { x, y: r.y + 15, w: ws[i], h: sz.h + 2 };
  };

  it("two shaped parts (one taken, one given), phone 190x42 and desk 160x50: both plates, side by side, clear of the badge row and the note line", () => {
    for (const [r, wn] of [[{ x: 3, y: 4, w: 190, h: 42 }, "phone"], [{ x: 3, y: 4, w: 160, h: 50 }, "desk"]] as [Box, string][]) {
      for (const [a, b] of [["spikerail", "gantry"], ["nailstrip", "pickaxe"], ["assembly", "kiln"], ["jawcrusher", "scrapcannon"]]) {
        const c = fresh(r.w + 8, r.h + 10);
        drawChoiceCard(G(c), r, { label: "TRADE", cost: [{ k: "item", def: a }], gain: [{ k: "item", def: b }] }, 0, v);
        for (const [i, id] of [a, b].entries()) {
          const p = plateOf(r, [a, b], i);
          expect(c.at(p.x, p.y), `${a}->${b} ${wn}: plate ${i + 1}'s corner`).toBe(C.ink);
          for (const t of gridGeom(gridSpecOf(id), gridCell(id), HEAD_BIG).tiles) expect(c.at(p.x + 1 + t.x + 1, p.y + 1 + t.y + 1), `${a}->${b} ${wn}: plate ${i + 1} tile`).toBe(fillOf(id)); // PRESENT-2 K: the road card's 4 px arrow
          expect(p.y + p.h, `${a}->${b} ${wn}: above the note line`).toBeLessThanOrEqual(r.y + r.h - 9);
          expect(p.x, `${a}->${b} ${wn}: inside the card`).toBeGreaterThan(r.x);
        }
        // the two plates do not touch each other
        const p1 = plateOf(r, [a, b], 0), p2 = plateOf(r, [a, b], 1);
        expect(p2.x, `${a}->${b} ${wn}: 2 px between the plates`).toBe(p1.x + p1.w + 2);
      }
    }
  });

  it("one shaped part (as before: the plate at the right end), none (a plain rig: no plate), a plain 2x2 factory (a plate without arrows)", () => {
    const r = { x: 3, y: 4, w: 190, h: 42 };
    const one = fresh(200, 60);
    drawChoiceCard(G(one), r, { label: "TRADE", cost: [{ k: "gold", n: 3 }], gain: [{ k: "item", def: "spikerail" }] }, 0, v);
    const sz = shapeGridSize("spikerail");
    expect(one.at(r.x + r.w - 4 - (sz.w + 2), r.y + 15)).toBe(C.ink);
    const none = fresh(200, 60);
    drawChoiceCard(G(none), r, { label: "TRADE", cost: [{ k: "gold", n: 3 }], gain: [{ k: "item", def: "whetstone" }] }, 0, v);
    expect(none.at(r.x + r.w - 5, r.y + 16)).toBe(C.slate0);
    const fac = fresh(200, 60);
    drawChoiceCard(G(fac), r, { label: "TRADE", cost: [{ k: "gold", n: 3 }], gain: [{ k: "item", def: "kiln" }] }, 0, v);
    const fs = shapeGridSize("kiln"), fp: Box = { x: r.x + r.w - 4 - (fs.w + 2), y: r.y + 15, w: fs.w + 2, h: fs.h + 2 };
    expect(fac.at(fp.x, fp.y)).toBe(C.ink);
    expect(limeIn(fac, fp)).toBe(0);
  });
});

describe("PRESENT-1 S1 (f): the in-battle scout face's icon is the build panel's shape picture for a shaped piece", () => {
  const build = (defs: string[]): Build => ({ hero: "furnace", items: defs.map((def, i) => ({ uid: i + 1, def, x: i, y: 1 })), routes: [], mods: [], beltCap: 14, hullBonus: 0 }) as unknown as Build;
  it("a shaped piece: shapePic (at most 14 x 14, inside the header's 16 x 16 box); any other piece: its icon", () => {
    for (const id of Object.keys(ITEMS).filter((q) => shapedPiece(q))) {
      const ic = faceIcon(build([id]), { kind: "item", uid: 1 });
      expect(ic, id).toBe(shapePic(id));
      expect(R(ic).width, id).toBeLessThanOrEqual(14);
      expect(R(ic).height, id).toBeLessThanOrEqual(14);
    }
    for (const id of ["whetstone", "kiln", "scrapcannon"]) expect(faceIcon(build([id]), { kind: "item", uid: 1 }), id).toBe(itemIcon(id));
  });
});
