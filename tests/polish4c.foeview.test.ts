// POLISH-4c (REQ-BFG-089; RULING-REVIEW-POLISH4 N10): a battle face with no CLOSE button in the build screen's scouted foe view (src/screens/build/foeView.ts) closes the way every face does there:
// by a press off any part, by Escape and by `foeback` (BACK). Since POLISH-4 (P4-3) battleScout.ts facePlan draws a face WITHOUT its CLOSE row where the row would cost one of the piece's own ability lines (PanelPlan.bare): no `faceclose`
// region, BattleFaces.last.close null. The foe view needs no button for it: FoeView.press (:118) closes a face on a press off every part of the foe's carrier, FoeView.key (:127) on Escape (the face first, then the view), and
// `foeback` (:149) closes the view. This test goes through the BUILD SCREEN's own paths, not FoeView's methods, so the UI's regions get their say: a real BuildScreen on a SPY-revealed run (tests/scout1c.foe.test.ts's scoutRun) at 851x393@2.75,
// every press routed as Game.pointerDown / pointerUp route it (game.ts :310-353: the screen hears the press (BuildScreen.pressed :901), a region under the finger takes it, else BuildScreen.down :892), Escape through BuildScreen.key :954.
// STEP 1 of POLISH-4c measured the view for a bare face (O/STEP1-TABLE.md; the build screen at the 13 views of tests/polish4.helpers.ts, a press at every part of the foe's carrier through BuildScreen.down, one drawn frame, BattleFaces.last.close):
// none. 4 heroes x days 2-10 x seeds 1-60 (2,160 revealed foes, 348,400 faces) and 6 heroes x days 2-16 x seeds 1-60 on 25 views (1,972,650 faces by facePlan) have a CLOSE on every face: on every landscape view the foe view's face column is
// 252-396 px tall (the battle's face area is 162-229 px, 162-177 on the landscape phones), so the CLOSE row never costs an ability line there. The test therefore looks for a bare face first (`close` null after a drawn frame) and, finding none, runs the same three paths on the
// foe's first turret face. The closing code never reads the plan (it reads the press, the key and the regions), so these are the paths a bare face takes; if a later change draws a bare face here, this test takes it by itself.
// It passes at polish4-accepted as well (nothing in src changed): it is a guard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { G, RasterCanvas, fresh, installRaster } from "./raster.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { UI, inside, type Rect } from "../src/ui/ui";
import { newRun, type Run } from "../src/game/run";
import { makeEvent, pickChoice } from "../src/game/events";
import { partAt } from "../src/screens/battleScout";
import { foePartsOnScreen, foeViewRects, scoutedFoe } from "../src/screens/build/foeView";
import { toDeck } from "../src/screens/build/layout";
import { localX, localY } from "../src/render/frame";
import { tapPx } from "../src/ui/tap";
import type { Game } from "../src/game/game";
import { VIEWS13 } from "./polish4.helpers";

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
afterEach(() => vi.unstubAllGlobals());

/** The stand-in Game BuildScreen reads (tests/polish1.marks.test.ts's FakeGame): a real UI, the view the phone gets, silent audio. */
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

/** A context over a raster whose methods the raster lacks (gradients, patterns, text metrics) do nothing, so a whole BuildScreen frame can be drawn (polish1.marks.test.ts). */
const lenient = (c: RasterCanvas): CanvasRenderingContext2D =>
  new Proxy(G(c), { get: (t, k, r) => { const v = Reflect.get(t, k, r); return v !== undefined ? (typeof v === "function" ? v.bind(t) : v) : (): undefined => undefined; } }) as unknown as CanvasRenderingContext2D;

/** tests/scout1c.foe.test.ts scoutRun: a run on `day` at its road's SCOUT stop with SPY picked (tonight's deck revealed), the run then in REFIT. */
function scoutRun(day: number, seed: number): Run {
  const run = newRun("furnace", seed);
  run.day = day;
  run.gold = 9;
  run.event = makeEvent(run.seed, run.day, "scout");
  run.stage = "event";
  expect(pickChoice(run, 2).ok).toBe(true); // the scout stop: HAGGLE, SEND WORD, SPY
  run.stage = "refit";
  return run;
}

type Part = ReturnType<typeof foePartsOnScreen>[number];

/** The build screen at 851x393@2.75 on the revealed run of scripts/touchcheck.mjs's foecard section (FURNACE, day 5, seed 31), with the game's press routing and the helpers the three paths use. */
function rig() {
  const run = scoutRun(5, 31);
  const foe = scoutedFoe(run)!;
  expect(foe).not.toBeNull();
  const [w, h, dpr] = VIEWS13["pixel5-851x393@2.75"];
  const game = new FakeGame(run, w, h, dpr);
  const s = new BuildScreen(game as unknown as Game);
  game.view = viewWithSub(w, h, dpr, s.pickScale.bind(s), s.pickSub.bind(s));
  s.enter();
  s.update(3);
  const g = lenient(fresh(1, 1));
  /** one drawn frame: the regions it lays are hit-testable from here */
  const frame = (): void => { game.ui.begin(); s.draw(g); game.ui.end(); };
  frame();
  /** A finger's press and lift at logical (x, y), routed as Game.pointerDown and pointerUp route them (game.ts :310-353), then a frame. */
  const press = (x: number, y: number): void => {
    const ui = game.ui;
    ui.pointer.x = x; ui.pointer.y = y; ui.pointer.down = true; ui.pointer.kind = "touch"; ui.pressed = null;
    const r = ui.hit(x, y);
    s.pressed(x, y, r ? r.id : null); // the screen hears every press (BuildScreen.pressed :901: a press off a face's word closes the keyword view)
    if (r) { if (r.onDown) r.onDown(x, y); else ui.pressed = r.id; } // a region takes the press
    else s.down(x, y, "touch"); // else the screen's own down :892 -> FoeView.press
    ui.pointer.down = false;
    const id = ui.pressed as string | null;
    ui.pressed = null;
    if (id) { const r2 = ui.hit(x, y); if (r2 && r2.id === id && r2.onTap) r2.onTap(); } // the lift over the same region fires its tap
    else s.up(x, y);
    frame();
  };
  const key = (k: string): void => { s.key(k); frame(); };
  const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  /** the NEXT BATTLE card's tap target, then a press on it: the view opens (the card's `foecard` region) */
  const openView = (): void => {
    expect(s.foeView.open).toBe(false);
    const card = game.ui.regions.find((q) => q.id === "foecard");
    expect(card, "the revealed foe's card is a target").toBeDefined();
    press(centre(card!.r).x, centre(card!.r).y);
    expect(s.foeView.open, "a press on the card opens the foe's view").toBe(true);
  };
  /** a press on the part's point: its face opens (a face already open is closed by Escape first: it may lie over the point); returns the face as drawn */
  const openFace = (p: Part) => {
    if (s.foeView.faces.open) key("Escape");
    press(p.x, p.y);
    expect(s.foeView.faces.open, `a press on ${p.name} opens its face`).toEqual({ side: 1, sel: p.sel });
    return s.foeView.faces.last;
  };
  /** a point where a press closes the open face: off its rect, off every UI region and off every part of the foe's carrier (the card's place first, as touchcheck.mjs :2350 presses it; else a grid of the screen) */
  const offAnyPart = (face: Rect): { x: number; y: number; where: string } => {
    const L = s.L, pad = { x: face.x - 2, y: face.y - 2, w: face.w + 4, h: face.h + 4 };
    const good = (x: number, y: number): boolean => {
      const d = toDeck(L, x, y);
      return x > 2 && y > 2 && x < game.W - 2 && y < game.H - 2 && !inside(pad, x, y) && !game.ui.hit(x, y) && partAt(foe.build, localX(L.frame, d.x, d.y), localY(L.frame, d.x, d.y)) === null;
    };
    const card = foeViewRects(L, tapPx(game.view)).cardHit;
    if (card && good(centre(card).x, centre(card).y)) return { ...centre(card), where: "the card's place" };
    for (let y = 6; y < game.H - 6; y += 6) for (let x = 6; x < game.W - 6; x += 6) if (good(x, y)) return { x, y, where: `an empty place (${x},${y})` };
    throw new Error("no point off every part, off the face and off every UI region");
  };
  const parts = foePartsOnScreen(s.L, foe);
  return { run, foe, game, s, frame, press, key, centre, openView, openFace, offAnyPart, parts };
}

/** The face the three paths run on: a bare one (`close` null after a drawn frame) if the foe's view has one, else the foe's first turret's face (it has a CLOSE: STEP 1 found no bare face in this view). */
function chosen(r: ReturnType<typeof rig>): { part: Part; bare: boolean } {
  for (const p of r.parts) {
    const last = r.openFace(p);
    r.key("Escape"); // the face closes (the view stays open)
    if (last && last.close === null) return { part: p, bare: true };
  }
  return { part: r.parts.find((p) => p.sel.kind === "turret")!, bare: false };
}

describe("POLISH-4c (N10): a face in the scouted foe view closes by a press off any part, by Escape and by foeback (851x393@2.75)", () => {
  it("the view opens from the NEXT BATTLE card and a press on a part opens its face, drawn with the regions a face lays (a bare one lays no faceclose)", () => {
    const r = rig();
    r.openView();
    r.frame();
    const { part, bare } = chosen(r);
    const last = r.openFace(part)!;
    expect(last, "the face is drawn").not.toBeNull();
    expect(last.lines.length).toBeGreaterThan(0);
    const ids = r.game.ui.regions.map((q) => q.id);
    expect(ids, "BACK is laid").toContain("foeback");
    expect(ids, "the face blocks presses").toContain("face");
    if (bare) {
      expect(last.close).toBeNull();
      expect(ids, "a bare face lays no CLOSE button").not.toContain("faceclose");
    } else {
      expect(last.close, "STEP 1: this view's faces keep their CLOSE row").not.toBeNull();
      expect(ids).toContain("faceclose");
    }
  });

  it("(i) a press off any part closes the face, the view staying open; a press ON the face does not", () => {
    const r = rig();
    r.openView();
    const { part } = chosen(r);
    const run0 = JSON.stringify(r.run);
    let last = r.openFace(part)!;
    // the face is a region that takes presses: a press on its body closes nothing
    const body = r.centre(last.r);
    expect(r.game.ui.hit(body.x, body.y)?.id).toBe("face");
    r.press(body.x, body.y);
    expect(r.s.foeView.faces.open, "a press on the face keeps it").not.toBeNull();
    // a press off every part
    last = r.s.foeView.faces.last!;
    const at = r.offAnyPart(last.r);
    r.press(at.x, at.y);
    expect(r.s.foeView.faces.open, `the press at ${at.x.toFixed(1)},${at.y.toFixed(1)} (${at.where}) closed the face`).toBeNull();
    expect(r.s.foeView.faces.last, "no face is drawn").toBeNull();
    expect(r.s.foeView.open, "the view stays open").toBe(true);
    expect(JSON.stringify(r.run), "the run is untouched").toBe(run0);
    // a press on another part swaps the face (the view's one other press)
    const other = r.parts.find((q) => JSON.stringify(q.sel) !== JSON.stringify(part.sel))!;
    r.openFace(part);
    r.press(other.x, other.y);
    expect(r.s.foeView.faces.open).toEqual({ side: 1, sel: other.sel });
  });

  it("(ii) Escape closes the face, the view staying open; a second Escape closes the view", () => {
    const r = rig();
    r.openView();
    const { part } = chosen(r);
    r.openFace(part);
    r.key("Escape");
    expect(r.s.foeView.faces.open, "the face first").toBeNull();
    expect(r.s.foeView.faces.last).toBeNull();
    expect(r.s.foeView.open, "the view stays open").toBe(true);
    r.key("Escape");
    expect(r.s.foeView.open, "then the view").toBe(false);
    expect(r.game.ui.regions.some((q) => q.id === "fight"), "the build screen's FIGHT is back").toBe(true);
  });

  it("(iii) foeback (BACK) closes the view, face and all", () => {
    const r = rig();
    r.openView();
    const { part } = chosen(r);
    r.openFace(part);
    const back = r.s.foeView.last!.back;
    expect(r.game.ui.hit(r.centre(back).x, r.centre(back).y)?.id, "BACK's target is the foeback region").toBe("foeback");
    r.press(r.centre(back).x, r.centre(back).y);
    expect(r.s.foeView.open, "the view is closed").toBe(false);
    expect(r.s.foeView.faces.open, "and its face").toBeNull();
    expect(r.s.foeView.faces.last).toBeNull();
    expect(r.game.ui.regions.some((q) => q.id === "fight"), "the build screen's FIGHT is back").toBe(true);
    // the view opens again from the card, with no face
    r.openView();
    expect(r.s.foeView.faces.open).toBeNull();
  });
});
