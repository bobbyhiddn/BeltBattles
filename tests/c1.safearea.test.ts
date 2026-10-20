// C1 (BRIEF-C1 item 2): keep the HUD out of phone notches. index.html's #stage carries env(safe-area-inset-*) as padding; the
// game reads it back (src/core/safeArea.ts) and hands computeView the safe size, the window less the insets. computeView and the
// layouts are untouched: they see a smaller screen and nothing else. The safety bar: with every inset 0 the view is exactly what it
// was, number for number, for every screen's own scale pick.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeView, defaultScale } from "../src/core/io";
import { NO_INSETS, readInsets, safeBox, type Insets } from "../src/core/safeArea";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { buildScale } from "../src/screens/build/layout";
import { customizeScale } from "../src/screens/customize";
import { titleScale } from "../src/screens/titleLayout";
import { makeGame, padding } from "./c1.gameHarness";

const ROOT = new URL("..", import.meta.url).pathname;

afterEach(() => vi.unstubAllGlobals());

/** CSS viewports: phones (portrait and landscape), a small phone, a tablet, the desk at 1x and 2x, the Deck. */
const VIEWS: [string, number, number, number][] = [
  ["iPhone 390x844 @3", 390, 844, 3], ["iPhone SE 375x667 @2", 375, 667, 2], ["iPhone on its side 844x390 @3", 844, 390, 3],
  ["Android 360x640 @3", 360, 640, 3], ["Android 412x915 @2.625", 412, 915, 2.625], ["desk 1440x900 @1", 1440, 900, 1],
  ["desk 1440x900 @2", 1440, 900, 2], ["Steam Deck 1280x800 @1", 1280, 800, 1], ["iPad 1024x1366 @2", 1024, 1366, 2], ["small 320x480 @2", 320, 480, 2],
];

type Pick = { name: string; scale?: (pw: number, ph: number, p: boolean, dpr?: number) => number; sub?: (pw: number, ph: number, p: boolean, scale: number) => number };
/** The picks the screens hand the game (game.ts computeView: Screen.pickScale, Screen.pickSub); none: io.ts defaultScale. */
const picks = (dpr: number): Pick[] => [
  { name: "default" },
  { name: "title", scale: (pw, ph, p) => titleScale(pw, ph, p, dpr) },
  { name: "build", scale: buildScale },
  { name: "customize", scale: customizeScale },
  { name: "battle", scale: battleScale, sub: (pw, ph, p, scale) => { const gr = battleGrid(pw, ph, p); return gr.close === scale ? gr.sub : 1; } },
];

describe("C1 item 2: reading the insets", () => {
  it("readInsets: the stage's computed padding in CSS px; nothing for no stage, no style engine, an empty, negative or unreadable length", () => {
    const style = () => padding([47, 0, 34, 12.5]);
    expect(readInsets({} as Element, style)).toEqual({ top: 47, right: 0, bottom: 34, left: 12.5 });
    expect(readInsets(null, style)).toEqual(NO_INSETS);
    expect(readInsets(undefined, style)).toEqual(NO_INSETS);
    expect(readInsets({} as Element, undefined)).toEqual(NO_INSETS);
    expect(readInsets({} as Element, () => ({ paddingTop: "", paddingRight: "-4px", paddingBottom: "auto", paddingLeft: "NaN" }))).toEqual(NO_INSETS);
    expect(readInsets({} as Element, () => padding([0, 0, 0, 0]))).toEqual(NO_INSETS);
    // the default style engine is the page's getComputedStyle (none in node: nothing read)
    expect(readInsets({} as Element)).toEqual(NO_INSETS);
    vi.stubGlobal("getComputedStyle", () => padding([20, 0, 0, 0]));
    expect(readInsets({} as Element)).toEqual({ top: 20, right: 0, bottom: 0, left: 0 });
  });

  it("safeBox: with every inset 0 the window size itself, untouched; else the window less the insets, at least 1 CSS px each way", () => {
    for (const [w, h] of [[390, 844], [1440, 900], [0, 0], [333.5, 777.25], [1e6, 1]]) expect(safeBox(w, h, NO_INSETS)).toEqual({ w, h });
    expect(safeBox(390, 844)).toEqual({ w: 390, h: 844 }); // no insets given: the window
    expect(safeBox(390, 844, { top: 47, right: 0, bottom: 34, left: 0 })).toEqual({ w: 390, h: 763 });
    expect(safeBox(844, 390, { top: 0, right: 47, bottom: 21, left: 47 })).toEqual({ w: 750, h: 369 });
    expect(safeBox(100, 100, { top: 80, right: 80, bottom: 80, left: 80 })).toEqual({ w: 1, h: 1 });
  });
});

describe("C1 item 2: the safety bar, with every inset 0 the view is exactly 0.9.13's", () => {
  it("computeView and viewWithSub give the same View for the same box, for every view and every screen's own pick", () => {
    let n = 0;
    for (const [what, w, h, dpr] of VIEWS) {
      for (const p of picks(dpr)) {
        const box = safeBox(w, h, NO_INSETS);
        expect(viewWithSub(box.w, box.h, dpr, p.scale, p.sub), `${what} ${p.name}`).toEqual(viewWithSub(w, h, dpr, p.scale, p.sub));
        expect(computeView(box.w, box.h, dpr, p.scale), `${what} ${p.name}`).toEqual(computeView(w, h, dpr, p.scale));
        n++;
      }
    }
    expect(n).toBe(VIEWS.length * 5);
  });

  it("the Game, on a page whose stage has no padding (a desk, most Android phones), frames exactly as it did: the same view and canvas size", () => {
    for (const [what, w, h, dpr] of VIEWS) {
      const r = makeGame({ w, h, dpr });
      const want = viewWithSub(w, h, dpr);
      expect(r.game.view, what).toEqual(want);
      expect(r.css(), what).toEqual({ w: (want.W * want.scale) / dpr, h: (want.H * want.scale) / dpr });
      vi.unstubAllGlobals();
    }
  });

  it("with the screen's own pick (battle: scale and grid) and no insets, the Game's view is the battle's, as before", () => {
    const [, w, h, dpr] = VIEWS[0];
    const p = picks(dpr)[4];
    const r = makeGame({ w, h, dpr, screen: { pickScale: p.scale, pickSub: p.sub } });
    expect(r.game.view).toEqual(viewWithSub(w, h, dpr, p.scale, p.sub));
  });
});

describe("C1 item 2: with insets, the canvas sits inside the safe box and the game sees the safe size", () => {
  const NOTCH: [string, number, number, number, Insets][] = [
    ["iPhone portrait, notch and home bar", 390, 844, 3, { top: 47, right: 0, bottom: 34, left: 0 }],
    ["iPhone on its side, notch at the left", 844, 390, 3, { top: 0, right: 47, bottom: 21, left: 47 }],
    ["Android 15 edge to edge, status and navigation bars", 412, 915, 2.625, { top: 24, right: 0, bottom: 48, left: 0 }],
    ["a camera cutout in a corner (fractional px)", 360, 800, 3, { top: 32.5, right: 0, bottom: 0.5, left: 0 }],
  ];

  it("the Game frames the safe box: its view is the safe size's, and its canvas lies inside the insets", () => {
    for (const [what, w, h, dpr, ins] of NOTCH) {
      const r = makeGame({ w, h, dpr, insets: [ins.top, ins.right, ins.bottom, ins.left] });
      const box = safeBox(w, h, ins);
      expect(r.game.view, what).toEqual(viewWithSub(box.w, box.h, dpr));
      const c = r.css();
      // the stage's content box starts at (left, top) and is box.w x box.h; the canvas is centred in it
      const x0 = ins.left + (box.w - c.w) / 2, y0 = ins.top + (box.h - c.h) / 2;
      expect(c.w, what).toBeLessThanOrEqual(box.w + 1e-9);
      expect(c.h, what).toBeLessThanOrEqual(box.h + 1e-9);
      expect(x0, `${what}: left of the canvas`).toBeGreaterThanOrEqual(ins.left - 1e-9);
      expect(y0, `${what}: top of the canvas`).toBeGreaterThanOrEqual(ins.top - 1e-9);
      expect(x0 + c.w, `${what}: right of the canvas`).toBeLessThanOrEqual(w - ins.right + 1e-9);
      expect(y0 + c.h, `${what}: bottom of the canvas`).toBeLessThanOrEqual(h - ins.bottom + 1e-9);
      vi.unstubAllGlobals();
    }
  });

  it("the unsafe size would not have fit: without the change the canvas of the same phone would reach under the home bar", () => {
    // the 0.9.13 framing of the notched portrait phone: the whole window; its canvas is taller than the safe box
    const [, w, h, dpr, ins] = NOTCH[0];
    const old = viewWithSub(w, h, dpr);
    const oldH = (old.H * old.scale) / dpr;
    expect(oldH).toBeGreaterThan(h - ins.top - ins.bottom);
  });

  it("re-checked on resize and on orientation change: a turned phone reads its new insets and window", () => {
    const [, w, h, dpr, ins] = NOTCH[0];
    const r = makeGame({ w, h, dpr, insets: [ins.top, ins.right, ins.bottom, ins.left] });
    const portrait = r.game.view;
    // the phone turns: the window swaps its sides and the insets move to the left and right
    r.win.innerWidth = h;
    r.win.innerHeight = w;
    r.setInsets([0, 47, 21, 47]);
    r.win.fire("orientationchange");
    const landscape = r.game.view;
    expect(landscape).toEqual(viewWithSub(h - 94, w - 21, dpr));
    expect(landscape.portrait).toBe(false);
    expect(landscape).not.toEqual(portrait);
    // turned back: `resize` alone does it too
    r.win.innerWidth = w;
    r.win.innerHeight = h;
    r.setInsets([ins.top, ins.right, ins.bottom, ins.left]);
    r.win.fire("resize");
    expect(r.game.view).toEqual(portrait);
    // and the insets alone changing (the bars hide) is seen at the next resize
    r.setInsets([0, 0, 0, 0]);
    r.win.fire("resize");
    expect(r.game.view).toEqual(viewWithSub(w, h, dpr));
  });

  it("the stage's CSS: padding from env(safe-area-inset-*) (and Capacitor's variables), border-box, canvas centred; viewport-fit=cover stays", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const stage = /#stage \{([^}]*)\}/.exec(html)![1];
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(stage).toContain(`padding-${side}: max(env(safe-area-inset-${side}, 0px), var(--safe-area-inset-${side}, 0px));`);
    }
    expect(stage).toContain("box-sizing: border-box;");
    expect(stage).toContain("inset: 0;");
    expect(stage).toContain("align-items: center;");
    expect(stage).toContain("justify-content: center;");
    expect(html).toContain("viewport-fit=cover");
    // computeView and the layouts are untouched: the old defaultScale is still the menu scale
    expect(defaultScale(390 * 3, 844 * 3, true)).toBe(5);
  });
});
