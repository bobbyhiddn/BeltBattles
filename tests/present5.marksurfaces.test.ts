// PRESENT-5 G5 (REQ-BFG-113; backlog #537 (5)): the other icon-under-grid overlays take the drop row's footprint mark (shapePic.ts drawIconMark, G2's helper), where it fits: the old reward row (src/screens/fork/cards.ts drawParts), the scout report's deck
//  (src/screens/event/reveal.ts drawReveal) and LAST CHANCE's part card where the words leave the plate no room (src/screens/lastChancePicker.ts, the corner fallback). Each surface drew G1's grid at iconCell over its icon box's top-left (11 x 11 for a 2x2
//  part: the icon showed as a grey grid); now the icon is whole and the footprint is the mark in the box's corner. The cargo slot (ui.ts itemSlot) keeps its solid grid (PRESENT-3's C2 ruling).
//  The tests are agnostic to G2b's variant (they use drawIconMark's own rect and a recorder, never the backing's geometry), so reverting G2b leaves them green. A recorder wraps drawIconMark: with it OFF the surface is drawn with no mark at all (the baseline), and the
//  old overlay is laid over that baseline the way the old code drew it, to count what each drawing hides of the icon.
import { describe, expect, it, vi } from "vitest";
import { installRaster, fresh, G as gOf, R, type RasterCanvas } from "./raster.helpers";

type Box = { x: number; y: number; w: number; h: number };
const cap = vi.hoisted(() => ({ off: false, calls: [] as { def: string; x: number; y: number; size: number; rect: { x: number; y: number; w: number; h: number } }[] }));
vi.mock("../src/ui/shapePic", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/ui/shapePic")>();
  const drawIconMark: typeof m.drawIconMark = (g, def, x, y, size) => {
    const sz = m.shapeMarkSize(def), rect = { x: x + size - sz.w, y: y + size - sz.h, w: sz.w, h: sz.h };
    cap.calls.push({ def, x, y, size, rect });
    if (!cap.off) m.drawIconMark(g, def, x, y, size);
    return rect;
  };
  return { ...m, drawIconMark };
});

import { C } from "../src/render/palette";
import { itemIcon } from "../src/render/sprites";
import { ITEMS } from "../src/sim/content";
import { gridGeom, gridSpecOf, hasGrid, iconCell, markCell, shapeGrid, shapeMarkSize } from "../src/ui/shapePic";
import { drawWarlordCard, type ForkCardView } from "../src/screens/fork/cards";
import { drawReveal } from "../src/screens/event/reveal";
import { newRun, type DuskFoe } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { LastChancePicker, lcPartGrid, lcPartSub, lcWord } from "../src/screens/lastChancePicker";
import { lastChanceOffer } from "../src/sim/lastChance";
import { ENCHANT_DEFS } from "../src/sim/enchant";
import { VIEWS, VIEW_NAMES, freshStorage, regionsOf } from "./backdrop1.helpers";

installRaster();
freshStorage();

const SHAPED = Object.keys(ITEMS).filter((id) => hasGrid(id));
const fillOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood2 : C.steel2);
const hiOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood3 : C.steel3);
const inBox = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/** One surface drawn twice: with the mark (on) and with the recorder swallowing it (off = the baseline). `calls` = the drawIconMark calls of each drawing. */
function both(draw: (g: CanvasRenderingContext2D) => void, w: number, h: number): { on: RasterCanvas; off: RasterCanvas; calls: typeof cap.calls } {
  const run = (off: boolean): { c: RasterCanvas; calls: typeof cap.calls } => { cap.off = off; cap.calls.length = 0; const c = fresh(w, h); draw(gOf(c)); cap.off = false; return { c, calls: cap.calls.slice() }; };
  const a = run(false), b = run(true);
  expect(a.calls.map((q) => [q.def, q.x, q.y, q.size]), "the same marks asked for with and without").toEqual(b.calls.map((q) => [q.def, q.x, q.y, q.size]));
  return { on: a.c, off: b.c, calls: a.calls };
}
/** the icon's opaque pixels as [x, y, colour] when its 12 x 12 sprite is drawn centred at (cx, cy) */
function iconAt(id: string, cx: number, cy: number): [number, number, string][] {
  const ic = R(itemIcon(id)), out: [number, number, string][] = [];
  for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) { const v = ic.at(i, j); if (v !== null) out.push([cx - Math.floor(ic.width / 2) + i, cy - Math.floor(ic.height / 2) + j, v]); }
  return out;
}
/** the mark's tiles on `c` at the rect the helper returned: how many footprint cells show a tile of the kind's colours (the tile's own px) */
function tilesAt(c: RasterCanvas, id: string, rect: Box): number {
  const geom = gridGeom({ ...gridSpecOf(id), arrows: [] }, markCell(id)), t = markCell(id) - 1;
  let n = 0;
  for (const tl of geom.tiles) {
    let ok = true;
    for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) { const v = c.at(rect.x + tl.x + i, rect.y + tl.y + j); if (v !== fillOf(id) && v !== hiOf(id)) ok = false; }
    if (ok) n++;
  }
  return n;
}
/** What one box shows: the mark's tiles, no tile at a cell the footprint lacks, every changed pixel inside the box, and the icon's px hidden by the old overlay vs the mark (counts returned). */
function checkBox(on: RasterCanvas, off: RasterCanvas, call: { def: string; x: number; y: number; size: number; rect: Box }, iconC: { x: number; y: number }, what: string): { oldHidden: number; newHidden: number; icon: number } {
  const id = call.def, box: Box = { x: call.x, y: call.y, w: call.size, h: call.size }, spec = gridSpecOf(id), sz = shapeMarkSize(id);
  expect(call.rect, `${what}: the mark's rect is the box's bottom-right corner`).toEqual({ x: call.x + call.size - sz.w, y: call.y + call.size - sz.h, w: sz.w, h: sz.h });
  expect(tilesAt(on, id, call.rect), `${what}: one tile per footprint cell`).toBe(spec.cells.length);
  const W = Math.max(...spec.cells.map((q) => q[0])) + 1, H = Math.max(...spec.cells.map((q) => q[1])) + 1, cell = markCell(id);
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    if (spec.cells.some((q) => q[0] === cx && q[1] === cy)) continue;
    const v = on.at(call.rect.x + 1 + cx * cell, call.rect.y + 1 + cy * cell);
    expect(v === fillOf(id) || v === hiOf(id), `${what}: no tile at the missing cell (${cx}, ${cy})`).toBe(false);
  }
  let moved = 0;
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) if (on.at(x, y) !== off.at(x, y) && inBox(box, x, y)) moved++;
  expect(moved, `${what}: the mark changes pixels inside its box`).toBeGreaterThan(0);
  // the icon: hidden by the mark (on vs the baseline) and by the old overlay laid over the baseline
  const old = fresh(off.width, off.height);
  old.px = off.px.slice();
  gOf(old).drawImage(shapeGrid(id, iconCell(id)), call.x, call.y);
  const px0 = iconAt(id, iconC.x, iconC.y);
  let newHidden = 0, oldHidden = 0;
  for (const [x, y, v] of px0) { if (on.at(x, y) !== v) newHidden++; if (old.at(x, y) !== v) oldHidden++; }
  return { newHidden, oldHidden, icon: px0.length };
}

/** every pixel that differs between `on` and `off` lies inside one of the boxes (+0 px): the surface changes nowhere else */
function confined(on: RasterCanvas, off: RasterCanvas, boxes: Box[], what: string): void {
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) if (on.at(x, y) !== off.at(x, y) && !boxes.some((b) => inBox(b, x, y))) expect.fail(`${what}: pixel (${x}, ${y}) changed outside the icon boxes`);
}

describe("PRESENT-5 G5: the old reward row (fork/cards.ts drawParts: the Matriarch's legendary part; every warlord card of a game with NPC_DAY off)", () => {
  const v: ForkCardView = { hover: false, selected: false, key: 1, t: 0, calm: false, notes: [] };
  it("every shaped part, on the compact (portrait) card and the tall (landscape) card: the icon whole in its 14 x 14 box, one tile per footprint cell in the corner, nothing changed outside the box, the box and the 16 px pitch as they were", () => {
    let was = 0, now = 0, total = 0, boxes = 0;
    const lines: string[] = [];
    for (const compact of [true, false]) for (const id of SHAPED) {
      const rw = { gold: 12, parts: [id], legendary: true };
      const r = compact ? { x: 3, y: 3, w: 400, h: 40 } : { x: 3, y: 3, w: 130, h: 120 };
      const { on, off, calls } = both((g) => drawWarlordCard(g, r, "matriarch", "hard", rw, v, compact), r.w + 6, r.h + 6);
      expect(calls.length, `${id} ${compact ? "compact" : "tall"}: one mark`).toBe(1);
      const c = calls[0];
      expect(c.size).toBe(14);
      // the box as drawParts draws it: a 14 x 14 ink ring, the slate inside, the icon centred at +7, +7
      for (let i = 0; i < 14; i++) for (const [x, y] of [[c.x + i, c.y], [c.x + i, c.y + 13], [c.x, c.y + i], [c.x + 13, c.y + i]]) expect(off.at(x, y), `${id}: the box ring`).toBe(C.ink);
      const k = checkBox(on, off, c, { x: c.x + 7, y: c.y + 7 }, `${id} ${compact ? "compact" : "tall"}`);
      confined(on, off, [{ x: c.x, y: c.y, w: 14, h: 14 }], `${id} ${compact ? "compact" : "tall"}`);
      expect(k.newHidden, `${id}: the mark hides no more of the icon than the old overlay did`).toBeLessThanOrEqual(k.oldHidden);
      if (compact) { was += k.icon - k.oldHidden; now += k.icon - k.newHidden; total += k.icon; lines.push(`G5-FORK ${id.padEnd(12)} icon px ${String(k.icon).padStart(3)}: visible old ${String(k.icon - k.oldHidden).padStart(3)} -> new ${String(k.icon - k.newHidden).padStart(3)}`); }
      boxes++;
    }
    console.log(`${lines.join("\n")}\nG5-FORK total icon px ${total} (the compact card): visible old ${was} -> new ${now}`);
    expect(boxes).toBe(SHAPED.length * 2);
    expect(now).toBeGreaterThan(was * 1.5);
  });

  it("a plain part's box and a card with no parts are the old drawing: no mark is asked for", () => {
    for (const compact of [true, false]) {
      const r = compact ? { x: 3, y: 3, w: 400, h: 40 } : { x: 3, y: 3, w: 130, h: 120 };
      const { calls } = both((g) => drawWarlordCard(g, r, "matriarch", "hard", { gold: 12, parts: ["whetstone"], legendary: true }, v, compact), r.w + 6, r.h + 6);
      expect(calls.length).toBe(0);
      const none = both((g) => drawWarlordCard(g, r, "matriarch", "hard", { gold: 12, parts: [], legendary: false }, v, compact), r.w + 6, r.h + 6);
      expect(none.calls.length).toBe(0);
    }
  });
});

describe("PRESENT-5 G5: the scout report's deck (event/reveal.ts drawReveal: one 14 x 14 icon box per distinct part on a 17 px pitch, its count `x2` beside it)", () => {
  const foe = (defs: string[]): DuskFoe => ({ day: 5, kind: "standin", name: "GRUBNOSE", hero: "furnace", build: { hero: "furnace", items: defs.map((def, i) => ({ uid: i + 1, def, x: i, y: 1 })), routes: [], mods: [], beltCap: 14, hullBonus: 0 } }) as unknown as DuskFoe;
  it("every shaped part alone and twice (`x2`), on the report's two heights: the icon whole in its box, one tile per footprint cell in the corner, nothing changed outside the box (the count's text is the old one)", () => {
    let was = 0, now = 0, total = 0, n = 0;
    const lines: string[] = [];
    for (const h of [72, 58]) for (const id of SHAPED) for (const copies of [1, 2]) {
      const r = { x: 0, y: 0, w: 150, h };
      const { on, off, calls } = both((g) => drawReveal(g, r, foe(Array(copies).fill(id))), 160, h + 8);
      expect(calls.length, `${id} h ${h}: one mark per distinct part`).toBe(1);
      const c = calls[0], iy = 14 + Math.max(h >= 70 ? 24 : 16, 20) + 4;
      expect([c.x, c.y, c.size], `${id}: the deck's first box`).toEqual([5, iy, 14]);
      for (let i = 0; i < 14; i++) for (const [x, y] of [[c.x + i, c.y], [c.x + i, c.y + 13], [c.x, c.y + i], [c.x + 13, c.y + i]]) expect(off.at(x, y), `${id}: the box ring`).toBe(C.ink);
      const k = checkBox(on, off, c, { x: c.x + 7, y: c.y + 7 }, `${id} h ${h} x${copies}`);
      confined(on, off, [{ x: c.x, y: c.y, w: 14, h: 14 }], `${id} h ${h} x${copies}`);
      expect(k.newHidden, `${id}: the mark hides no more of the icon than the old overlay did`).toBeLessThanOrEqual(k.oldHidden);
      if (h === 72 && copies === 1) { was += k.icon - k.oldHidden; now += k.icon - k.newHidden; total += k.icon; lines.push(`G5-SCOUT ${id.padEnd(12)} icon px ${String(k.icon).padStart(3)}: visible old ${String(k.icon - k.oldHidden).padStart(3)} -> new ${String(k.icon - k.newHidden).padStart(3)}`); }
      n++;
    }
    console.log(`${lines.join("\n")}\nG5-SCOUT total icon px ${total}: visible old ${was} -> new ${now}`);
    expect(n).toBe(SHAPED.length * 4);
    expect(now).toBeGreaterThan(was * 1.5);
  });

  it("a deck of several shaped parts: every distinct shaped part gets its own mark in its own box, along the 17 px pitch (26 px after a counted part) and wrapping to the next row of boxes; a plain part asks for none", () => {
    const ids = ["scrapcannon", "kiln", "pickaxe", "whetstone", "spikerail", "gantry", "nailstrip", "elbowguard", "scrapcannon"].filter((id) => ITEMS[id]);
    const r = { x: 0, y: 0, w: 120, h: 100 }; // tall enough for a second row of boxes (a row needs iy + 15 <= the report's foot - 2)
    const { on, off, calls } = both((g) => drawReveal(g, r, foe(ids)), 130, 108);
    const shaped = [...new Set(ids)].filter((id) => hasGrid(id));
    expect(calls.map((q) => q.def), "the marks, in the deck's order").toEqual(shaped);
    for (const c of calls) expect(tilesAt(on, c.def, c.rect), `${c.def}: tiles`).toBe(gridSpecOf(c.def).cells.length);
    confined(on, off, calls.map((c) => ({ x: c.x, y: c.y, w: 14, h: 14 })), "the deck");
    // the boxes follow the old pitch: 17 px, 26 after the counted SCRAP CANNON (x2), a new row of boxes 17 px down where the next box would pass the report's edge
    const xs = calls.map((c) => c.x), ys = calls.map((c) => c.y);
    expect(xs[0], "the first box").toBe(5);
    expect(xs[1] - xs[0], "after a counted part: 26 px").toBe(26);
    expect(new Set(ys).size, "the deck wraps to a second row of boxes").toBeGreaterThan(1);
  });
});

describe("PRESENT-5 G5: LAST CHANCE's part card (lastChancePicker.ts: the plate beside the words where they leave room, else the corner fallback over the 20 x 20 icon floor)", () => {
  /** the brief's views and the narrowest phones the repo names (POLISH-3: 280x653 and 300x640 at x5; 320x568 at dpr 2, x3): W, H in the game's px, scale = device px per game px */
  const VX: { name: string; W: number; H: number; scale: number; dpr: number }[] = [...VIEW_NAMES.map((name) => ({ name, ...VIEWS[name] })), { name: "320x568", W: 213, H: 378, scale: 3, dpr: 2 }, { name: "300x640", W: 180, H: 384, scale: 5, dpr: 3 }, { name: "280x653", W: 168, H: 392, scale: 5, dpr: 3 }];
  /** the picker on a run of `seed` at `view` (the helper's scene, with the seed free: the offer, its part and its enchant word are the game's own for that seed); `draw(off)` one frame with the mark (or without it) */
  function frameOf(view: string, seed: number) {
    const v = VX.find((q) => q.name === view)!, ui = new UI();
    const run = newRun("furnace", seed, "present5-lc");
    (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 6 };
    (run as unknown as { hearts: boolean }).hearts = true;
    const s = {
      run, refit: false, touch: false, t: 0,
      game: { W: v.W, H: v.H, ui, view: { W: v.W, H: v.H, scale: v.scale, dpr: v.dpr, portrait: v.H > v.W * 1.05, sub: 1 }, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
      touched: () => {}, lcHeartT: Infinity,
    };
    const lc = new LastChancePicker(), o = lc.offer(s as never)!;
    const draw = (off: boolean): { c: RasterCanvas; calls: typeof cap.calls; regions: string[] } => {
      cap.off = off; cap.calls.length = 0;
      const c = fresh(v.W, v.H);
      ui.begin(); lc.draw(gOf(c), s as never); ui.end();
      cap.off = false;
      return { c, calls: cap.calls.slice(), regions: regionsOf(ui) };
    };
    draw(false); // the first frame fixes the offer's key: a fresh picker starts closed
    return { lc, o, run, layout: () => lc.layout(s as never, o), draw };
  }
  /** the seeds (1..) whose offer's part is a shaped piece, per view: where the part card draws the plate and where the corner (the decision is lcPartGrid's: card width, the part's name with its word, the sub line) */
  const found: { view: string; seed: number; id: string; corner: boolean }[] = [];
  for (const view of VX.map((q) => q.name)) {
    const cardW = Math.min(VX.find((q) => q.name === view)!.W - 8, 300);
    for (let seed = 1; seed <= 600; seed++) {
      const o = lastChanceOffer(seed, 6, "furnace", []);
      if (!o.part || !hasGrid(o.part)) continue;
      const d = ITEMS[o.part], word = lcWord({ seed }, o), name = word ? `${ENCHANT_DEFS[word.ench].name} ${d.name}` : d.name;
      const where = lcPartGrid({ x: 0, y: 0, w: cardW, h: 80 }, o.part, name, lcPartSub(d.rarity, o.partStars ?? 1));
      found.push({ view, seed, id: o.part, corner: !!where && "corner" in where });
    }
  }
  it("the game offers shaped parts on this card, and on each view the plate AND the corner both occur (the card width, the enchant word's length)", () => {
    expect(found.length).toBeGreaterThan(40);
    const corners = found.filter((f) => f.corner), plates = found.filter((f) => !f.corner);
    expect(corners.length, "the corner fallback is reached in the game").toBeGreaterThan(5);
    expect(plates.length, "the plate is reached").toBeGreaterThan(5);
    console.log(`G5-LC offers with a shaped part over seeds 1-600 and ${VX.length} views: ${found.length}; the plate ${plates.length}, the corner ${corners.length}; corner parts: ${[...new Set(corners.map((f) => f.id))].join(", ")}; by view (corner/all): ${VX.map((q) => q.name).map((vw) => `${vw} ${corners.filter((f) => f.view === vw).length}/${found.filter((f) => f.view === vw).length}`).join(", ")}`);
  });

  it("the corner fallback: the icon whole on its floor, one tile per footprint cell in the floor's corner, the frame changes nowhere else, the card's rects and the regions are the same with and without the mark; the plate case asks for no mark and is the old frame", () => {
    let corners = 0, plates = 0, was = 0, now = 0, total = 0;
    const lines: string[] = [];
    for (const view of VX.map((q) => q.name)) {
      const here = found.filter((f) => f.view === view);
      const picks = [...new Map(here.filter((f) => f.corner).map((f) => [f.id, f])).values()].slice(0, 3).concat(here.filter((f) => !f.corner).slice(0, 2));
      for (const f of picks) {
        const fr = frameOf(view, f.seed), L = fr.layout(), at = fr.lc.boons(fr.o).indexOf("part"), card = L.cards[at];
        expect(fr.o.part, `${view} seed ${f.seed}: the offer is the pure one`).toBe(f.id);
        const on = fr.draw(false), off = fr.draw(true);
        expect(on.regions, `${view} ${f.id}: the regions are the same with and without the mark`).toEqual(off.regions);
        expect(L.cards, `${view}: the card rects are the layout's`).toEqual(fr.layout().cards);
        if (!f.corner) {
          plates++;
          expect(on.calls.length, `${view} ${f.id} (plate): no mark asked for`).toBe(0);
          for (let y = 0; y < on.c.height; y++) for (let x = 0; x < on.c.width; x++) if (on.c.at(x, y) !== off.c.at(x, y)) expect.fail(`${view} ${f.id}: a plate card changed at (${x}, ${y})`);
          continue;
        }
        corners++;
        expect(on.calls.length, `${view} ${f.id} (corner): one mark`).toBe(1);
        const c = on.calls[0];
        expect([c.x, c.y, c.size], `${view} ${f.id}: the 20 x 20 icon floor at (+6, +7) of the part card`).toEqual([card.x + 6, card.y + 7, 20]);
        const k = checkBox(on.c, off.c, c, { x: card.x + 16, y: card.y + 17 }, `${view} ${f.id}`);
        confined(on.c, off.c, [{ x: c.x, y: c.y, w: 20, h: 20 }], `${view} ${f.id}`);
        expect(k.newHidden, `${view} ${f.id}: the mark hides at most a corner of the icon`).toBeLessThanOrEqual(20);
        was += k.icon - k.oldHidden; now += k.icon - k.newHidden; total += k.icon;
        lines.push(`G5-LC ${view.padEnd(10)} ${f.id.padEnd(10)} icon px ${String(k.icon).padStart(3)}: visible old ${String(k.icon - k.oldHidden).padStart(3)} -> new ${String(k.icon - k.newHidden).padStart(3)}`);
      }
    }
    console.log(`${lines.join("\n")}\nG5-LC total over ${corners} corner cards: icon px ${total}: visible old ${was} -> new ${now}; ${plates} plate cards unchanged`);
    expect(corners).toBeGreaterThan(5);
    expect(plates).toBeGreaterThan(3);
    expect(now).toBeGreaterThan(was);
  });
});
