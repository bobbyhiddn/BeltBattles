// POLISH-1 (REQ-BFG-085; BRIEF-POLISH1 P1; BUMP-1F's review F1): the mark a frame cut. (P2, LAST CHANCE's spark, is tests/polish1.lcspark.test.ts.)
//  P1  a selected GROWING rig keeps its counter readable. build.ts drawSelection lays the selection's frames after the machinery, so a 1 px
//      frame line cut the counter's top-left (a 3 read as a 9). The build screen's own drawSelection runs here over a software raster, on
//      the two views' real frames (the 402x690 @3 phone and the 1280x800 desk), for a GROWING rig at EVERY cell of the board: selected, a
//      neighbour selected, a belt selected, a turret selected. Every pixel of every counter box is the box as it is drawn alone, and the frame still shows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { G, RasterCanvas, diffPx, fresh, installRaster, region } from "./raster.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { UI } from "../src/ui/ui";
import { newRun, type Run } from "../src/game/run";
import { ENCHANT, ENCHANT_DEFS, setEnchant, withEnchant } from "../src/sim/enchant";
import { counterSize, drawEnchantCounters, drawGrowCounter, pieceMarkAt } from "../src/render/enchantMarks";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { BuildTurret, Placed } from "../src/sim/deck";
import { C } from "../src/render/palette";
import { footX, footY } from "../src/render/frame";
import { drawMachinery } from "../src/render/machinery";
import { drawTurrets, type CruiserView } from "../src/render/cruiser";
import type { Game } from "../src/game/game";

installRaster();

class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
beforeEach(() => {
  vi.stubGlobal("localStorage", new MapStore());
  setTipsForTests("done"); // no first-run hint strip in the way
});
afterEach(() => {
  vi.unstubAllGlobals();
  setEnchant(ENCHANT);
});

/** The two views the brief names: the op phone and the desk. */
const VIEWS = { phone: [402, 690, 3], desk: [1280, 800, 1] } as const;
type ViewName = keyof typeof VIEWS;
const VIEW_NAMES = Object.keys(VIEWS) as ViewName[];

// ------------------------------------------------------------------------------------------------------------------------- P1

/** The stand-in Game BuildScreen reads (tests/enchant1.apply.test.ts's FakeGame, trimmed). */
class FakeGame {
  readonly ui = new UI();
  readonly canvas = { style: {} };
  readonly t = 0;
  readonly toasting = false;
  view: ReturnType<typeof viewWithSub>;
  readonly audio = new Proxy({}, { get: () => () => undefined });
  constructor(public run: Run, w: number, h: number, dpr: number) { this.view = viewWithSub(w, h, dpr); }
  get W(): number { return this.view.W; }
  get H(): number { return this.view.H; }
  get portrait(): boolean { return this.view.portrait; }
  toast(): void {}
  error(): void {}
  go(): void {}
  soundButton(): void {}
}

/** The private parts of BuildScreen the test reads and calls. */
interface Seen {
  sel: unknown;
  L: { frame: CruiserView["frame"] };
  view: CruiserView;
  drawSelection(g: CanvasRenderingContext2D): void;
  draw(g: CanvasRenderingContext2D): void;
}

/** A context over a raster whose methods the raster lacks (gradients, patterns, text metrics) do nothing, so a whole BuildScreen frame can be drawn. */
const lenient = (c: RasterCanvas): CanvasRenderingContext2D =>
  new Proxy(G(c), { get: (t, k, r) => { const v = Reflect.get(t, k, r); return v !== undefined ? (typeof v === "function" ? v.bind(t) : v) : (): undefined => undefined; } }) as unknown as CanvasRenderingContext2D;

/** A BuildScreen on the stand-in Game at one view, drawn once into a 1 x 1 raster (every paint is out of it: only the layout and the view model are wanted). */
function screenAt(run: Run, view: ViewName): Seen {
  const [w, h, dpr] = VIEWS[view];
  const fake = new FakeGame(run, w, h, dpr);
  const screen = new BuildScreen(fake as unknown as Game);
  fake.view = viewWithSub(w, h, dpr, screen.pickScale.bind(screen), screen.pickSub.bind(screen));
  screen.enter();
  screen.update(3);
  fake.ui.begin();
  screen.draw(lenient(fresh(1, 1)));
  fake.ui.end();
  return screen as unknown as Seen;
}

const BIG = 640; // the carrier-space raster the board is drawn into (the frame's cells all lie inside it)
const isFrame = (c: string | null): boolean => c === C.white || c === C.yellow;

/** The deck as drawFrame draws the carrier group's marks and the selection: the machinery, the turrets, then build.ts drawSelection. `before`, when
 *  given, takes a copy of the board as it stood just before drawSelection (what the unselected frame shows, whatever the painter's order put on top). */
function drawBoard(sc: Seen, c: RasterCanvas, before?: RasterCanvas): void {
  c.px.fill(null);
  const g = G(c);
  sc.view.frame = sc.L.frame;
  drawMachinery(g, sc.view);
  drawTurrets(g, sc.view);
  if (before) before.px = c.px.slice();
  sc.drawSelection(g);
}

/** Every pixel of every GROWING counter on the board (the boxes drawEnchantCounters draws alone), and how many of them `c` has changed. */
function boxesCut(sc: Seen, c: RasterCanvas): { boxes: number; cut: number } {
  const alone = fresh(BIG, BIG);
  drawEnchantCounters(G(alone), sc.view);
  let boxes = 0, cut = 0;
  for (let i = 0; i < alone.px.length; i++) if (alone.px[i] !== null) { boxes++; if (c.px[i] !== alone.px[i]) cut++; }
  return { boxes, cut };
}

describe("POLISH-1 P1: a selected GROWING rig keeps its counter whole", () => {
  const base = (): Placed[] => heroStartBuild("furnace").items.map((p) => ({ ...p }));

  for (const view of VIEW_NAMES) {
    it(`${view}: a GROWING rig at every cell, selected: its counter box is the box drawn alone (one digit and two), and the frame still shows the selection`, () => {
      withEnchant(() => {
        const run = newRun("furnace", 7);
        const items = base();
        run.build.items = items;
        const sc = screenAt(run, view);
        const c = fresh(BIG, BIG);
        let cells = 0;
        for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) for (const grow of [3, 12]) {
          const rig: Placed = { uid: 900, def: "whetstone", x, y, ench: "growing", grow };
          run.build.items = [...items, rig];
          sc.sel = { kind: "item", uid: 900 };
          drawBoard(sc, c);
          const at = pieceMarkAt(sc.L.frame, rig).counter, { w, h } = counterSize(grow);
          const alone = fresh(BIG, BIG);
          drawGrowCounter(G(alone), at.x, at.y, grow, ENCHANT_DEFS.growing.color);
          expect(region(c, at.x, at.y, w, h), `${view} cell (${x},${y}) grow ${grow}: the box`).toBe(region(alone, at.x, at.y, w, h));
          // the frame still shows the selection: its top and left sides (clear of the counter, which hangs off the bottom-right corner) and the corner's other pixels
          const cx = Math.round(footX(sc.L.frame, x, y, 1)), cy = Math.round(footY(sc.L.frame, x, y, 1));
          expect(isFrame(c.at(cx + 5, cy - 1)) && isFrame(c.at(cx - 1, cy + 5)), `${view} cell (${x},${y}): the frame's top and left sides show`).toBe(true);
          cells++;
        }
        expect(cells).toBe(200); // 10 x 10 cells x the two counter widths (3 and 12)
      }, true);
    });

    it(`${view}: a neighbour, a belt, a factory or a turret selected: no frame pixel changes a GROWING counter's box (rigs at every cell, a factory, a turret)`, () => {
      withEnchant(() => {
        const run = newRun("furnace", 7);
        const items = base();
        const sc = screenAt(run, view);
        const c = fresh(BIG, BIG), before = fresh(BIG, BIG);
        let combos = 0, boxes = 0;
        const check = (what: string, framed = true): void => {
          drawBoard(sc, c, before);
          if (!framed) { // nothing selected: drawSelection draws nothing, so the frame is the board as it stood (a turret's sprite may lie over a box there, as it always did)
            expect(diffPx(before, c), `${view} ${what}: drawSelection changed pixels with nothing selected`).toEqual([]);
            combos++;
            return;
          }
          const r = boxesCut(sc, c);
          expect(r.cut, `${view} ${what}: pixels of a counter box that a frame changed`).toBe(0);
          boxes += r.boxes;
          combos++;
        };
        for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
          const rig: Placed = { uid: 900, def: "whetstone", x, y, ench: "growing", grow: 3 };
          const around: Placed[] = [...(x < 9 ? [{ uid: 901, def: "whetstone", x: x + 1, y } as Placed] : []), ...(y < 9 ? [{ uid: 902, def: "whetstone", x, y: y + 1 } as Placed] : [])];
          run.build.items = [...items, rig, ...around];
          for (const sel of [...around.map((p) => ({ kind: "item", uid: p.uid })), { kind: "route", index: 0 }, { kind: "none" }]) {
            sc.sel = sel;
            check(`rig (${x},${y}) with ${JSON.stringify(sel)} selected`, sel.kind !== "none");
          }
        }
        // a GROWING factory (2 x 2: its counter hangs off its bottom-right cell) and a GROWING turret, each selected and each beside a selected neighbour
        for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
          const kiln: Placed = { uid: 910, def: "kiln", x, y, ench: "growing", grow: 12 };
          run.build.items = [...items.filter((p) => p.def !== "kiln"), kiln, { uid: 911, def: "whetstone", x: Math.min(9, x + 2), y: Math.min(9, y + 2) }];
          for (const sel of [{ kind: "item", uid: 910 }, { kind: "item", uid: 911 }]) { sc.sel = sel; check(`factory (${x},${y}) with ${JSON.stringify(sel)} selected`); }
        }
        const turrets: BuildTurret[] = [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "growing", grow: 3 }];
        run.build.items = [...items];
        run.build.turrets = turrets;
        for (const sel of [{ kind: "turret", index: 0 }, { kind: "turret", index: 1 }, { kind: "none" }]) { sc.sel = sel; check(`turret with ${JSON.stringify(sel)} selected`, sel.kind !== "none"); }
        expect(combos).toBeGreaterThan(400);
        expect(boxes, "the scan read real boxes").toBeGreaterThan(combos * 20);
      }, true);
    });
  }

  it("the scan is not vacuous: the selection's frame lines do land inside counter boxes (a plain twin with the same frames draws them there), on both views", () => {
    for (const view of VIEW_NAMES) withEnchant(() => {
      const run = newRun("furnace", 7);
      const items = base();
      const sc = screenAt(run, view);
      const c = fresh(BIG, BIG), twin = fresh(BIG, BIG);
      let over = 0;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const rig: Placed = { uid: 900, def: "whetstone", x, y, ench: "growing", grow: 3 };
        run.build.items = [...items, rig, { uid: 901, def: "whetstone", x: x + 1, y }];
        sc.sel = { kind: "item", uid: 901 };
        drawBoard(sc, c);
        const alone = fresh(BIG, BIG);
        drawEnchantCounters(G(alone), sc.view);
        run.build.items = [...items, { uid: 900, def: "whetstone", x, y }, { uid: 901, def: "whetstone", x: x + 1, y }]; // the same board with no word: no counter, the frames only
        drawBoard(sc, twin);
        for (let i = 0; i < alone.px.length; i++) if (alone.px[i] !== null && isFrame(twin.px[i])) over++;
      }
      expect(over, `${view}: frame pixels over a counter's box`).toBeGreaterThan(40);
    }, true);
  });

  it("drawEnchantCounters: over a finished frame it changes no pixel the machinery drew, the switch off draws nothing, a lifted piece draws none", () => {
    withEnchant(() => {
      const run = newRun("furnace", 7);
      run.build.items = [...base(), { uid: 900, def: "whetstone", x: 5, y: 5, ench: "growing", grow: 7 }, { uid: 901, def: "whetstone", x: 2, y: 2, ench: "fiery" }];
      run.build.turrets = [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "growing", grow: 12 }];
      const sc = screenAt(run, "phone");
      const a = fresh(BIG, BIG), b = fresh(BIG, BIG);
      sc.view.frame = sc.L.frame;
      drawMachinery(G(a), sc.view);
      drawTurrets(G(a), sc.view);
      drawMachinery(G(b), sc.view);
      drawTurrets(G(b), sc.view);
      drawEnchantCounters(G(b), sc.view);
      expect(diffPx(a, b), "drawn twice, the same pixels").toEqual([]);
      const lone = fresh(BIG, BIG);
      withEnchant(() => drawEnchantCounters(G(lone), sc.view), false);
      expect(lone.px.every((p) => p === null), "the switch off: no pixel").toBe(true);
      const lifted = fresh(BIG, BIG);
      sc.view.hideItem = 900;
      drawEnchantCounters(G(lifted), sc.view);
      const at = pieceMarkAt(sc.L.frame, run.build.items.find((p) => p.uid === 900)!).counter;
      expect(region(lifted, at.x, at.y, 7, 9), "no counter on the lifted rig").toBe(region(fresh(BIG, BIG), at.x, at.y, 7, 9));
      sc.view.hideItem = -1;
    }, true);
  });
});
