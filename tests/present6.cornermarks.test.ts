// PRESENT-6 G6 (REQ-BFG-113; backlog #583 (1); cap's ruling 3 on PRESENT-5's Q3): the last two grid-over-icon corner fallbacks draw the footprint MARK (shapePic.ts drawIconMark, PRESENT-5 G2a's helper), not G1's grid over the icon:
//  - the victory screen's drop card (src/screens/fork/drops.ts drawDropCard): a card too narrow for the plate beside the words (the plate case is unchanged to the pixel) drew `shapeGrid(drop, iconCell(drop))` at (x + 4, y + 4), over the
//    card's own 14 x 14 icon box, so the icon showed as a grey grid; now drawIconMark(g, drop, x + 4, y + 4, 14);
//  - the warlord's pick buttons (src/screens/warlordHud.ts, shapePic.ts drawGridRight's `corner`): where the name or the badge leaves the grid no room at the row's end, the same grid went over the icon (at bx + 2, by + 2); now `corner` is the
//    icon's box { x, y, size } and the fallback is drawIconMark's mark in it.
// The shape of tests/present5.marksurfaces.test.ts: a recorder wraps the surface's call (with it OFF the surface is the baseline, with no mark at all) and the OLD overlay is laid over that baseline exactly where the old code drew it, to count what each
// drawing hides of the icon. Known trade-off, accepted (cap's ruling 2): the mark has no arrowheads, so a rig shows its footprint but not its arrows there.
import { describe, expect, it, vi } from "vitest";
import { installRaster, fresh, G as gOf, R, type RasterCanvas } from "./raster.helpers";

type Box = { x: number; y: number; w: number; h: number };
const cap = vi.hoisted(() => ({
  off: false,
  marks: [] as { def: string; x: number; y: number; size: number; rect: { x: number; y: number; w: number; h: number } }[],
  rights: [] as { def: string; x: number; y: number; w: number; left: number; floor: number; corner: { x: number; y: number; size: number } | undefined; fallback: boolean }[],
}));
vi.mock("../src/ui/shapePic", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/ui/shapePic")>();
  // the surfaces that import drawIconMark (the drop card): ON draws the mark, OFF swallows it (the baseline)
  const drawIconMark: typeof m.drawIconMark = (g, def, x, y, size) => {
    const sz = m.shapeMarkSize(def), rect = { x: x + size - sz.w, y: y + size - sz.h, w: sz.w, h: sz.h };
    cap.marks.push({ def, x, y, size, rect });
    if (!cap.off) m.drawIconMark(g, def, x, y, size);
    return rect;
  };
  // the warlord's pick buttons reach the mark inside drawGridRight (a call within the module, which the wrapper above cannot see): the wrapper records each call, says whether it is the corner fallback (the same
  // condition as shapePic.ts drawGridRight: no room at the row's end, or the badge's top above the grid's foot), and OFF calls it WITHOUT `corner` (the row as PRESENT-1 S1 (a) first drew it: the fallback dropped)
  const drawGridRight: typeof m.drawGridRight = (g, def, x, y, w, left, floor = Infinity, corner) => {
    const sz = m.shapeGridSize(def), px = x + w - 3 - sz.w, fallback = m.hasGrid(def) && (px < left || y + sz.h > floor);
    cap.rights.push({ def, x, y, w, left, floor, corner, fallback });
    return m.drawGridRight(g, def, x, y, w, left, floor, cap.off ? undefined : corner);
  };
  return { ...m, drawIconMark, drawGridRight };
});

import { computeView } from "../src/core/io";
import { C } from "../src/render/palette";
import { textWidth as textW } from "../src/render/font";
import { itemIcon } from "../src/render/sprites";
import { ITEMS } from "../src/sim/content";
import { ENCHANT_DEFS } from "../src/sim/enchant";
import { gridGeom, gridSpecOf, hasGrid, iconCell, markCell, shapeGrid, shapeGridSize, shapeMarkSize } from "../src/ui/shapePic";
import { drawDropCard, dropCardText } from "../src/screens/fork/drops";
import { drawWarlordResult } from "../src/screens/warlordHud";
import { finishWarlord, pickRoad } from "../src/game/road";
import { gainModule } from "../src/game/fuse";
import { shopBadge, type Run } from "../src/game/run";
import type { Game } from "../src/game/game";
import { setupFork } from "../src/tooling";
import { withNpcDay } from "../src/sim/npcDay";
import { UI } from "../src/ui/ui";

installRaster();

/** the plate's width: the grid's box plus its 1 px ink margin each side (drops.ts :179) */
const gridWidthPlate = (id: string): number => shapeGridSize(id).w + 2;
const SHAPED = Object.keys(ITEMS).filter((id) => hasGrid(id));
const fillOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood2 : C.steel2);
const hiOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood3 : C.steel3);
const inBox = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/** The brief's views (CSS size, @dpr as kit/looks.mjs opens them) and the narrowest phones the repo names; the game's own W x H comes from core/io.ts computeView. */
const VIEWS: { name: string; css: [number, number]; dpr: number }[] = [
  { name: "402x690", css: [402, 690], dpr: 3 }, { name: "390x660", css: [390, 660], dpr: 3 }, { name: "360x640", css: [360, 640], dpr: 2 }, { name: "320x568", css: [320, 568], dpr: 2 },
  { name: "300x640", css: [300, 640], dpr: 3 }, { name: "280x653", css: [280, 653], dpr: 3 }, { name: "844x390", css: [844, 390], dpr: 3 }, { name: "667x375", css: [667, 375], dpr: 2 },
  { name: "1280x800", css: [1280, 800], dpr: 1 }, { name: "1366x768", css: [1366, 768], dpr: 1 }, { name: "1920x1080", css: [1920, 1080], dpr: 1 },
];
const viewOf = (v: (typeof VIEWS)[number]): { W: number; H: number; scale: number } => computeView(v.css[0], v.css[1], v.dpr);
/** warlordHud.ts drawWarlordResult: the card is cw = min(W - 10, 214) wide (:91); its drop card is drawn at x + 10, cw - 20 wide (:126). */
const dropCardW = (W: number): number => Math.min(W - 10, 214) - 20;

/** One surface drawn twice: with the mark (on) and with the recorder swallowing it (off = the baseline). `marks` = the drawIconMark calls of the ON drawing. */
function both(draw: (g: CanvasRenderingContext2D) => void, w: number, h: number): { on: RasterCanvas; off: RasterCanvas; marks: typeof cap.marks } {
  const run = (off: boolean): { c: RasterCanvas; marks: typeof cap.marks } => { cap.off = off; cap.marks.length = 0; const c = fresh(w, h); draw(gOf(c)); cap.off = false; return { c, marks: cap.marks.slice() }; };
  const a = run(false), b = run(true);
  expect(a.marks.map((q) => [q.def, q.x, q.y, q.size]), "the same marks asked for with and without").toEqual(b.marks.map((q) => [q.def, q.x, q.y, q.size]));
  return { on: a.c, off: b.c, marks: a.marks };
}
/** the icon's opaque pixels as [x, y, colour] when its sprite is drawn centred at (cx, cy) the way the surfaces draw it (cx - floor(width / 2)) */
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
/** What one icon box shows: the mark's rect is the box's bottom-right corner, one tile per footprint cell, no tile at a cell the footprint lacks, every changed pixel inside the box, and the icon's px hidden by the old overlay vs the mark (counts returned).
 *  `oldAt` = where the old code drew G1's grid (top-left), `iconC` = the icon's centre. */
function checkBox(on: RasterCanvas, off: RasterCanvas, call: { def: string; x: number; y: number; size: number; rect: Box }, oldAt: { x: number; y: number }, iconC: { x: number; y: number }, what: string): { oldHidden: number; newHidden: number; icon: number } {
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
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) if (on.at(x, y) !== off.at(x, y)) { moved++; if (!inBox(box, x, y)) expect.fail(`${what}: pixel (${x}, ${y}) changed outside the icon box`); }
  expect(moved, `${what}: the mark changes pixels inside its box`).toBeGreaterThan(0);
  // the icon: hidden by the mark (on vs the baseline) and by the old overlay laid over the baseline
  const old = fresh(off.width, off.height);
  old.px = off.px.slice();
  gOf(old).drawImage(shapeGrid(id, iconCell(id)), oldAt.x, oldAt.y);
  const px0 = iconAt(id, iconC.x, iconC.y);
  let newHidden = 0, oldHidden = 0;
  for (const [x, y, v] of px0) { if (on.at(x, y) !== v) newHidden++; if (old.at(x, y) !== v) oldHidden++; }
  return { newHidden, oldHidden, icon: px0.length };
}
const identical = (a: RasterCanvas, b: RasterCanvas, what: string): void => {
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (a.at(x, y) !== b.at(x, y)) expect.fail(`${what}: pixel (${x}, ${y}) differs`);
};

describe("PRESENT-6 G6: the victory screen's drop card (drops.ts drawDropCard: the plate beside the words where they leave room, else the corner fallback over the card's 14 x 14 icon box at (x + 4, y + 4))", () => {
  const WORD = Object.keys(ENCHANT_DEFS)[0];
  /** the card's sub-line variants a win can show: DROP · TO CARGO · ★1 (easy and medium), ★2 (hard), the Matriarch's LEGENDARY · TO CARGO, and a drop that keeps a rival's word (STAR n) */
  const VARIANTS: { tag: string; legendary: boolean; stars: number; word?: string }[] = [
    { tag: "★1", legendary: false, stars: 1 }, { tag: "★2", legendary: false, stars: 2 }, { tag: "legendary", legendary: true, stars: 1 }, { tag: "word STAR 2", legendary: false, stars: 2, word: WORD },
  ];
  const draw = (id: string, w: number, v: (typeof VARIANTS)[number]): { on: RasterCanvas; off: RasterCanvas; marks: typeof cap.marks } => both((g) => drawDropCard(g, id, v.legendary, 3, 3, w, v.stars, v.word), w + 10, 30);

  it("where the game reaches the fallback: per view (the victory card is a BattleScreen, which frames itself by core/io.ts's default scale; the drop card is cw - 20 wide, cw = min(W - 10, 214)), the shaped parts whose card takes the corner, and the least room the plate has to spare (slack, px)", () => {
    const lines: string[] = [];
    let corners = 0;
    for (const view of VIEWS) {
      const { W, H, scale } = viewOf(view), w = dropCardW(W);
      const corner = new Set<string>();
      let slack = Infinity, at = "";
      for (const v of VARIANTS) for (const id of SHAPED) {
        if (draw(id, w, v).marks.length) corner.add(id);
        const t = dropCardText(id, v.legendary, v.stars, v.word)!, s = (w - 4 - gridWidthPlate(id)) - (23 + Math.max(textW(t.name), textW(t.sub, "3")) + 4);
        if (s < slack) { slack = s; at = `${id}, ${v.tag}`; }
      }
      corners += corner.size;
      lines.push(`G6-DROP ${view.name.padEnd(9)} game ${W}x${H} x${scale}  card w ${w}: parts at the corner in any sub line ${corner.size} of ${SHAPED.length}; least spare room for the plate ${slack} px (${at})`);
    }
    console.log(lines.join("\n"));
    expect(SHAPED.length, "PRESENT-5 counted 44 shaped parts").toBe(44);
    // a report, not a pin: today no brief view reaches the corner (corners = 0 and every slack is positive); the fallback is the code's own safety for a longer name or a narrower card, drawn by the next test at 90-220 px
    expect(Number.isFinite(corners)).toBe(true);
  });

  it("every shaped part, every width from the game's views and 90-220 px, every sub line: the corner case asks for ONE mark in the card's 14 x 14 box at (x + 4, y + 4), the icon whole, one tile per footprint cell, nothing changed outside the box; the plate case asks for none and is the OFF drawing to the pixel", () => {
    const widths = [...new Set([...VIEWS.map((v) => dropCardW(viewOf(v).W)), 90, 110, 140, 170, 200, 220])].sort((a, b) => a - b);
    let corners = 0, plates = 0, was = 0, now = 0, total = 0;
    const lines: string[] = [];
    for (const v of VARIANTS) for (const id of SHAPED) for (const w of widths) {
      const { on, off, marks } = draw(id, w, v);
      const t = dropCardText(id, v.legendary, v.stars, v.word)!, x = 3, y = 3, pw = gridWidthPlate(id);
      const room = x + 23 + Math.max(textW(t.name), textW(t.sub, "3")) + 4 <= x + w - 4 - pw;
      expect(marks.length, `${id} w ${w} ${v.tag}: a mark exactly where the old code drew the corner grid (no room for the plate)`).toBe(room ? 0 : 1);
      if (room) { plates++; identical(on, off, `${id} w ${w} ${v.tag} (plate)`); continue; }
      corners++;
      const c = marks[0];
      expect([c.x, c.y, c.size], `${id} w ${w}: the card's icon box`).toEqual([x + 4, y + 4, 14]);
      const k = checkBox(on, off, c, { x: x + 4, y: y + 4 }, { x: x + 11, y: y + 11 }, `${id} w ${w} ${v.tag}`);
      expect(k.newHidden, `${id}: the mark hides no more of the icon than the old overlay did`).toBeLessThanOrEqual(k.oldHidden);
      if (v.tag === "★1" && w === 110) { was += k.icon - k.oldHidden; now += k.icon - k.newHidden; total += k.icon; lines.push(`G6-DROP ${id.padEnd(12)} icon px ${String(k.icon).padStart(3)}: visible old ${String(k.icon - k.oldHidden).padStart(3)} -> new ${String(k.icon - k.newHidden).padStart(3)}`); }
    }
    console.log(`${lines.join("\n")}\nG6-DROP total over the ${SHAPED.length} shaped parts at a 110 px card: icon px ${total}: visible old ${was} -> new ${now}; ${corners} corner cases and ${plates} plate cases checked over ${widths.length} widths x ${VARIANTS.length} sub lines`);
    expect(corners).toBeGreaterThan(200);
    expect(plates).toBeGreaterThan(200);
    expect(now).toBeGreaterThan(was * 1.5);
  });

  it("a plain part and NO DROP ask for no mark (the card is the OFF drawing)", () => {
    for (const id of ["whetstone", "grease"]) if (ITEMS[id] && !hasGrid(id)) for (const w of [90, 140, 200]) { const { on, off, marks } = draw(id, w, VARIANTS[0]); expect(marks.length).toBe(0); identical(on, off, `${id} ${w}`); }
    const none = both((g) => drawDropCard(g, null, false, 3, 3, 120), 130, 30);
    expect(none.marks.length).toBe(0);
    identical(none.on, none.off, "NO DROP");
  });
});

describe("PRESENT-6 G6: the warlord's pick buttons (warlordHud.ts drawWarlordResult with NPC_DAY off: two part buttons, each with its icon at bx + 4 and its name at bx + 18; the footprint at the row's end, else, where the name or the badge leaves no room, drawGridRight's `corner`)", () => {
  const noop = (): void => undefined;
  /** a Hard warlord win with the part pick open (NPC_DAY off: the stored result offers two parts), the offered parts replaced by `a` and `b`; `own` = parts already in cargo (a second copy gives its button a MERGE badge) */
  function pickRun(a: string, b: string, own: string[] = []): Run {
    return withNpcDay(() => {
      const run = setupFork({ hero: "furnace", day: 4, seed: 9 });
      expect(pickRoad(run, "hard").ok).toBe(true);
      finishWarlord(run, 0, 24.6);
      const r = run.warlord!.result!;
      expect(r.outcome).toBe("win");
      r.parts = [a, b];
      r.took = null;
      for (const d of own) gainModule(run, d);
      return run;
    }, false);
  }
  /** The result card drawn on a W x H raster (the game's own function, NPC_DAY off), ON (the mark) and OFF (drawGridRight called without `corner`: the baseline). `rights` = the drawGridRight calls of the ON drawing, one per button. */
  function frame(run: Run, W: number, H = 150): { on: RasterCanvas; off: RasterCanvas; rights: typeof cap.rights; regions: string[]; offRegions: string[]; box: Box } {
    const go = (off: boolean) => {
      cap.off = off; cap.rights.length = 0;
      const game = { W, H, ui: new UI(), run, portrait: W < H } as unknown as Game, c = fresh(W, H);
      game.ui.begin();
      const box = withNpcDay(() => drawWarlordResult(gOf(c), game, run.warlord!, 1.4, { take: [noop, noop], refit: noop, fight: noop, road: noop }), false);
      game.ui.end();
      cap.off = false;
      return { c, rights: cap.rights.slice(), regions: game.ui.regions.map((q) => `${q.id}:${q.r.x},${q.r.y},${q.r.w},${q.r.h}`), box };
    };
    const a = go(false), b = go(true);
    return { on: a.c, off: b.c, rights: a.rights, regions: a.regions, offRegions: b.regions, box: a.box };
  }
  /** the button geometry the card draws: warlordHud.ts :142 and :154 (bw = floor((cw - 24) / 2), button i at x + 10 + i * (bw + 4), top at yy + ch - 26) */
  const cwOf = (W: number): number => Math.min(W - 10, 214);
  const bwOf = (W: number): number => Math.floor((cwOf(W) - 24) / 2);

  it("where the game reaches the fallback: with NPC_DAY on (as shipped; src/sim/npcDay.ts NPC_DAY = true) a win's card returns before the pick buttons (:145-151), so no view reaches drawGridRight; with it off, per card width, the shaped parts that take the corner (no badge / with a MERGE badge)", () => {
    const lines: string[] = [];
    // NPC_DAY on: the card of a Hard win draws no pick button and never calls drawGridRight, on every brief view
    for (const view of VIEWS) {
      const { W } = viewOf(view);
      const run = withNpcDay(() => {
        const r = setupFork({ hero: "furnace", day: 4, seed: 9 });
        pickRoad(r, "hard");
        finishWarlord(r, 0, 24.6);
        return r;
      }, true);
      cap.rights.length = 0;
      const game = { W: cwOf(W) + 10, H: 160, ui: new UI(), run, portrait: true } as unknown as Game, c = fresh(cwOf(W) + 10, 160);
      game.ui.begin();
      withNpcDay(() => drawWarlordResult(gOf(c), game, run.warlord!, 1.4, { take: [noop, noop], refit: noop, fight: noop, road: noop }), true);
      game.ui.end();
      expect(cap.rights.length, `${view.name}: NPC_DAY on draws no pick button`).toBe(0);
      expect(game.ui.regions.some((q) => q.id.startsWith("take")), `${view.name}: no take region`).toBe(false);
    }
    // NPC_DAY off: per distinct card width
    const widths = [...new Set(VIEWS.map((v) => cwOf(viewOf(v).W)))].sort((a, b) => a - b);
    for (const cw of widths) {
      const views = VIEWS.filter((v) => cwOf(viewOf(v).W) === cw).map((v) => v.name).join(" ");
      const n = { plain: 0, badge: 0 }, kinds = new Set<string>();
      for (const id of SHAPED) for (const own of [false, true]) {
        const run = pickRun(id, "whetstone", own ? [id] : []);
        const f = frame(run, cw + 10);
        const r0 = f.rights[0];
        expect(r0.def).toBe(id);
        if (own) kinds.add(`${id}:${shopBadge(run, id)?.kind ?? "none"}`);
        if (r0.fallback) n[own ? "badge" : "plain"]++;
      }
      lines.push(`G6-WARLORD (NPC_DAY off) card ${cw} px, button ${bwOf(cw + 10)} px (views: ${views}): corner of ${SHAPED.length} shaped parts: no badge ${n.plain}, with a copy in cargo ${n.badge}`);
    }
    console.log(lines.join("\n"));
  });

  it("every shaped part, no badge and with a copy in cargo (MERGE / MAX badge), at the game's two card widths and a narrow one: the corner case draws ONE mark in the icon's 14 x 14 floor at (bx + 3, by + 3), the icon whole, one tile per footprint cell, nothing changed outside the floor, the mark clear of the name (bx + 18) and the badge; the plate case is the OFF drawing to the pixel", () => {
    let corners = 0, plates = 0, was = 0, now = 0, total = 0, gap = Infinity;
    const lines: string[] = [];
    for (const W of [cwOf(viewOf(VIEWS[0]).W) + 10, cwOf(viewOf(VIEWS[5]).W) + 10, 150]) for (const own of [false, true]) for (const id of SHAPED) {
      const run = pickRun(id, "whetstone", own ? [id] : []);
      const f = frame(run, W), r0 = f.rights[0], bx = r0.x, by = r0.y - 2, bw = r0.w;
      expect([r0.def, bx, by], `${id}: the first button`).toEqual([id, f.box.x + 10, f.box.y + f.box.h - 26]);
      expect(bw, `${id}: the button's width`).toBe(bwOf(W));
      expect(f.rights[1].fallback, "the plain second part asks for no grid").toBe(false);
      if (!r0.fallback) { plates++; identical(f.on, f.off, `${id} W ${W} (plate)`); expect(r0.corner).toEqual({ x: bx + 3, y: by + 3, size: 14 }); continue; }
      corners++;
      expect(r0.corner, `${id}: the icon's 14 x 14 floor, the 12 px icon 1 px in`).toEqual({ x: bx + 3, y: by + 3, size: 14 });
      const sz = shapeMarkSize(id), rect = { x: bx + 3 + 14 - sz.w, y: by + 3 + 14 - sz.h, w: sz.w, h: sz.h };
      const k = checkBox(f.on, f.off, { def: id, x: bx + 3, y: by + 3, size: 14, rect }, { x: bx + 2, y: by + 2 }, { x: bx + 10, y: by + 10 }, `${id} W ${W}${own ? " (badge)" : ""}`);
      expect(k.newHidden, `${id}: the mark hides no more of the icon than the old overlay did`).toBeLessThanOrEqual(k.oldHidden);
      // clear of the name (drawn at bx + 18) with room to spare, and of the badge (drawn after the grid, at bx + bw - bw2 - 2, by + 12, 7 rows)
      expect(rect.x + rect.w, `${id}: the mark ends before the name (bx + 18)`).toBeLessThanOrEqual(bx + 18);
      gap = Math.min(gap, bx + 18 - (rect.x + rect.w));
      const badge = shopBadge(run, id);
      if (badge) {
        const bw2 = Math.max(20, Math.min(34, bw - 6)), bb = { x: bx + bw - bw2 - 2, y: by + 12, w: bw2, h: 7 };
        expect(rect.x + rect.w <= bb.x || rect.y + rect.h <= bb.y || rect.x >= bb.x + bb.w, `${id}: the mark clears the badge`).toBe(true);
      }
      if (W === cwOf(viewOf(VIEWS[0]).W) + 10 && own) { was += k.icon - k.oldHidden; now += k.icon - k.newHidden; total += k.icon; lines.push(`G6-WARLORD ${id.padEnd(12)} icon px ${String(k.icon).padStart(3)}: visible old ${String(k.icon - k.oldHidden).padStart(3)} -> new ${String(k.icon - k.newHidden).padStart(3)}`); }
      // the card's regions are the same with and without the mark
      expect(f.regions).toEqual(f.offRegions);
    }
    console.log(`${lines.join("\n")}\nG6-WARLORD total over the ${SHAPED.length} shaped parts with a badge at the 214 px card: icon px ${total}: visible old ${was} -> new ${now}; ${corners} corner cases and ${plates} plate cases checked; the mark ends ${gap} px before the name's first column at the least`);
    expect(corners).toBeGreaterThan(40);
    expect(plates).toBeGreaterThan(5);
    expect(now).toBeGreaterThan(was * 1.5);
  });

  it("a plain part asks for no grid or mark; the card's rect, its buttons and the regions are the same with and without the mark", () => {
    const run = pickRun("whetstone", "grease");
    const f = frame(run, 224);
    expect(f.rights.every((q) => !q.fallback)).toBe(true);
    identical(f.on, f.off, "plain parts");
    const run2 = pickRun("pickaxe", "whetstone", ["pickaxe"]);
    const g = frame(run2, 224);
    expect(g.regions).toEqual(g.offRegions);
    expect(g.regions.some((q) => q.startsWith("take0:"))).toBe(true);
  });
});
