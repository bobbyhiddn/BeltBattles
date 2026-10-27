// PRESENT-1 T3 TITLE-TAP (REVIEW-CUSTOM2B ruling 2; backlog #372; REQ-BFG-038's title): the HOW TO PLAY / OPTIONS / CUSTOMIZE row
// (title.ts, font "3") was 18-31 CSS px tall on a phone, and every real tap passed. Each of the three now takes a finger's target (ui/tap.ts
// tapPx: 44 CSS px) through button()'s `hit` option (ui.ts:144) made with tapRect (ui.ts:184), as CUSTOMIZE's BACK does (customize.ts:190):
// grown evenly about the drawn button, kept below NEW RUN / CONTINUE's bottom edge and above the screen's, the row's own columns wide.
// It draws nothing different: the drawn rects (TitleLayout.buttons) are exactly the ones before, and a mouse (the desk) keeps the drawn
// rect as its target. The title is drawn here on a recording canvas (tests/run1.screens.draw.test.ts's way) and the regions it registered read.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeView } from "../src/core/io";
import { newRun } from "../src/game/run";
import { TitleScreen } from "../src/screens/title";
import { titleScale, type TitleLayout } from "../src/screens/titleLayout";
import type { Game } from "../src/game/game";
import type { G } from "../src/render/pixel";
import { TAP_CSS } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";

/** The phones of scripts/touchcheck.mjs (the touch views and the 360x640 @2 and 375x667 @2 phones its CUSTOMIZE/title section runs on) and a
 *  320 px wide one; then the desk and a laptop, whose mouse keeps the drawn rect. [name, css w, css h, dpr, a phone?] */
const VIEWS: [string, number, number, number, boolean][] = [
  ["360x640@2", 360, 640, 2, true], ["375x667@2", 375, 667, 2, true], ["390x844@3", 390, 844, 3, true], ["390x660@3", 390, 660, 3, true],
  ["402x690@3", 402, 690, 3, true], ["430x739@3", 430, 739, 3, true], ["844x390@3", 844, 390, 3, true], ["320x568@2", 320, 568, 2, true],
  ["1440x900@1", 1440, 900, 1, false], ["1440x900@2", 1440, 900, 2, false], ["1280x720@1", 1280, 720, 1, false],
];

interface RecCanvas { width: number; height: number; getContext: () => G }
/** A recording canvas (tests/run1.screens.draw.test.ts's recCanvas, without the call log): every drawing call does nothing. */
function recCanvas(): RecCanvas {
  const c: RecCanvas = { width: 0, height: 0, getContext: () => g };
  const st: Record<string, unknown> = {
    canvas: c, fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, imageSmoothingEnabled: false, lineWidth: 1,
    globalCompositeOperation: "source-over", font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", filter: "none",
  };
  const g = new Proxy(st, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      if (k === "getImageData" || k === "createImageData") return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (k === "measureText") return () => ({ width: 0 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
      return () => undefined;
    },
    set(t, k, v) {
      if (typeof k === "string") t[k] = v;
      return true;
    },
  }) as unknown as G;
  return c;
}

let restoreDom: () => void = () => undefined;
beforeAll(() => {
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { createElement: () => recCanvas() };
  restoreDom = () => { doc.document = prev; };
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
});
afterAll(() => { restoreDom(); vi.unstubAllGlobals(); });

/** The title drawn once on a CSS viewport as the game sizes it, with a saved run or none: the regions it registered, by id. */
function drawn(w: number, h: number, dpr: number, save: boolean) {
  const view = computeView(w, h, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const audio = new Proxy({}, { get: () => () => undefined });
  const ui = new UI();
  const game = { run: null, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui, canvas: recCanvas(), toast() {}, go() {}, error() {}, soundButton() {}, openName() {}, transitioning: false } as unknown as Game;
  const s = new TitleScreen(game);
  s.pickScale(Math.floor(w * dpr), Math.floor(h * dpr), view.portrait);
  const priv = s as unknown as { save: unknown; L: TitleLayout };
  priv.save = save ? newRun("furnace", 11, "p1-tap") : null;
  for (let i = 0; i < 2; i++) s.update(1 / 60);
  ui.begin();
  s.draw(recCanvas().getContext());
  ui.end();
  const by: Record<string, Rect> = {};
  for (const r of ui.regions) by[r.id] = r.r;
  return { view, L: priv.L, by, css: view.scale / view.dpr, ui };
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("PRESENT-1 T3 TITLE-TAP: finger-tall targets on the title's small row", () => {
  for (const [name, w, h, dpr, phone] of VIEWS) {
    for (const save of [false, true]) {
      it(`${name}, ${save ? "with a saved run" : "no saved run"}: ${phone ? "HOW TO PLAY, OPTIONS and CUSTOMIZE are each at least 44 CSS px tall, clear of every other target" : "a mouse keeps the drawn rects"}`, () => {
        const { view, L, by, css, ui } = drawn(w, h, dpr, save);
        const row = ["help", "options", "customize"] as const;
        for (const id of row) expect(by[id], id).toBeTruthy();
        for (const id of row) {
          const drawnBtn = L.buttons[id], hit = by[id];
          if (!phone) {
            expect(hit, `${id}: a mouse's target is the drawn rect`).toEqual(drawnBtn);
            continue;
          }
          // a finger's target: at least TAP_CSS CSS px tall (it was 18-31), the row's own columns wide, around the drawn button
          expect(hit.h * css, `${id} target height in CSS px`).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
          expect(hit.h).toBeGreaterThanOrEqual(drawnBtn.h);
          expect(hit.x).toBe(drawnBtn.x);
          expect(hit.w).toBe(drawnBtn.w);
          expect(hit.y).toBeLessThanOrEqual(drawnBtn.y);
          expect(hit.y + hit.h).toBeGreaterThanOrEqual(drawnBtn.y + drawnBtn.h);
          // inside the screen, below the button above's bottom edge (their targets are their drawn rects), above the screen's
          const above = L.buttons.cont ?? L.buttons.new;
          expect(hit.y).toBeGreaterThanOrEqual(above.y + above.h);
          expect(hit.y + hit.h).toBeLessThanOrEqual(view.H);
        }
        if (phone) {
          // no target overlaps another button's target: the three, NEW RUN and CONTINUE (and the sound button)
          const ids = ["new", ...(save ? ["cont"] : []), ...row, "sound"].filter((id) => by[id]);
          for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(overlap(by[ids[i]], by[ids[j]]), `${ids[i]} against ${ids[j]}`).toBe(false);
          // the centre of each drawn button reaches its own target, and the first row of the drawn button's neighbours do not
          for (const id of row) {
            const b = L.buttons[id];
            expect(ui.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, `${id}'s centre`).toBe(id);
          }
        }
        expect(!!by.cont).toBe(save);
        // the drawn rects are the layout's, as before: NEW RUN and CONTINUE's targets are exactly theirs
        expect(by.new).toEqual(L.buttons.new);
        if (save) expect(by.cont).toEqual(L.buttons.cont);
      });
    }
  }
});
