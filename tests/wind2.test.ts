// WIND-2 (REQ-BFG-093): the dark wind looks fair on every layout. Call 1: side by side (the desk, a phone held sideways)
// the storm rolls in from both screen edges, so both boards sit under the same share of it; stacked (a portrait phone)
// the one front from the left, as before. Presentation only: nothing here touches the sim.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { battleLayout, battleScale, laneLayout } from "../src/game/battleLayout";
import { windBoth } from "../src/game/arenaMotion";
import { hullBox, type Box } from "../src/render/frame";
import { C } from "../src/render/palette";
import { drawWind } from "../src/render/world";
import { bayer, type G } from "../src/render/pixel";

/** A recorder (node has no canvas): each fillRect with its colour and alpha, and each drawImage of a recorded canvas
 *  (its own fills, e.g. the cached dither rows) at its place. */
interface Fill { x: number; y: number; w: number; h: number; fill: string; alpha: number }
interface Img { img: { fills: Fill[] }; x: number; y: number; alpha: number }
function recorder(): { g: G; fills: Fill[]; imgs: Img[] } {
  const fills: Fill[] = [], imgs: Img[] = [];
  const st = { fillStyle: "", globalAlpha: 1, imageSmoothingEnabled: false };
  const g = {
    get fillStyle() { return st.fillStyle; },
    set fillStyle(v: string) { st.fillStyle = v; },
    get globalAlpha() { return st.globalAlpha; },
    set globalAlpha(v: number) { st.globalAlpha = v; },
    get imageSmoothingEnabled() { return st.imageSmoothingEnabled; },
    set imageSmoothingEnabled(v: boolean) { st.imageSmoothingEnabled = v; },
    fillRect(x: number, y: number, w: number, h: number) { fills.push({ x, y, w, h, fill: st.fillStyle, alpha: st.globalAlpha }); },
    drawImage(img: { fills: Fill[] }, x: number, y: number) { imgs.push({ img, x, y, alpha: st.globalAlpha }); },
  };
  return { g: g as unknown as G, fills, imgs };
}

/** A stand-in `document` whose canvases record (the dither rows are made with makeCanvas). */
const doc = globalThis as { document?: unknown };
let prevDoc: unknown;
beforeAll(() => {
  prevDoc = doc.document;
  doc.document = {
    createElement: () => {
      const r = recorder();
      return { width: 0, height: 0, fills: r.fills, getContext: () => r.g };
    },
  };
});
afterAll(() => { doc.document = prevDoc; });

/** The cells an image draw paints: its canvas's fills, moved to where it is drawn. */
const cellsOf = (imgs: Img[]): string[] => imgs.flatMap((d) => d.img.fills.flatMap((f) => {
  const out: string[] = [];
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) out.push(`${d.x + f.x + i},${d.y + f.y + j},${f.fill}`);
  return out;
})).sort();

/** The battle's layout on a viewport, as the battle and the replay lay it out (lanes included). */
function layoutOf(w: number, h: number, dpr: number) {
  const v = computeView(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p));
  return { v, L: laneLayout(battleLayout(v.W, v.H, v.portrait)) };
}

const SIDE_BY_SIDE: [string, number, number, number][] = [["desk 1920x1080", 1920, 1080, 1], ["laptop 1366x768", 1366, 768, 1], ["laptop 1280x720", 1280, 720, 1], ["phone landscape 844x390", 844, 390, 3], ["phone landscape 667x375", 667, 375, 2]];
const STACKED: [string, number, number, number][] = [["phone 390x844", 390, 844, 3], ["phone 402x690", 402, 690, 3], ["phone 360x640", 360, 640, 2]];

/** The band's cells (the 0.55-alpha plum0 rects), as a W x H coverage grid. */
function bandGrid(fills: Fill[], W: number, H: number): Uint8Array {
  const cov = new Uint8Array(W * H);
  for (const f of fills) {
    if (f.fill !== C.plum0 || f.alpha !== 0.55) continue;
    for (let y = Math.max(0, f.y); y < Math.min(H, f.y + f.h); y++) for (let x = Math.max(0, f.x); x < Math.min(W, f.x + f.w); x++) cov[y * W + x] = 1;
  }
  return cov;
}

/** The share of a box's cells (on screen) under the band. */
function share(cov: Uint8Array, W: number, H: number, b: Box): number {
  let n = 0, u = 0;
  for (let y = Math.max(0, b.y); y < Math.min(H, b.y + b.h); y++) for (let x = Math.max(0, b.x); x < Math.min(W, b.x + b.w); x++) {
    n++;
    u += cov[y * W + x];
  }
  return n ? u / n : 0;
}

describe("WIND-2 call 1: a fair storm", () => {
  it("the mode comes from the layout at rest: side by side on the desk, laptops and phones held sideways; stacked on portrait phones", () => {
    for (const [name, w, h, dpr] of SIDE_BY_SIDE) {
      const { L } = layoutOf(w, h, dpr);
      expect(windBoth(hullBox(L.frames[0]), hullBox(L.frames[1])), name).toBe(true);
    }
    for (const [name, w, h, dpr] of STACKED) {
      const { L } = layoutOf(w, h, dpr);
      expect(windBoth(hullBox(L.frames[0]), hullBox(L.frames[1])), name).toBe(false);
    }
  });

  it("side by side, the band comes in from both edges: each row's west front and its mirror image, the wash once, twice the dither and streaks", () => {
    for (const [W, H] of [[384, 216], [422, 195]]) for (const level of [0.4, 0.9, 1]) for (const t of [30.3, 50.3, 68.3]) {
      const one = recorder(), two = recorder();
      drawWind(one.g, level, W, H, t);
      drawWind(two.g, level, W, H, t, { both: true });
      const wash = (fs: Fill[]) => fs.filter((f) => f.fill === C.plum0 && f.alpha !== 0.55);
      expect(wash(two.fills)).toEqual(wash(one.fills)); // the wash as it was: one rect over the whole screen
      expect(wash(two.fills)).toEqual([{ x: 0, y: 0, w: W, h: H, fill: C.plum0, alpha: Math.min(0.32, level * 0.32) }]);
      const band1 = one.fills.filter((f) => f.fill === C.plum0 && f.alpha === 0.55);
      const band2 = two.fills.filter((f) => f.fill === C.plum0 && f.alpha === 0.55);
      expect(band1.every((f) => f.x === 0)).toBe(true); // one front, from the west
      expect(band2.length).toBe(band1.length * 2);
      for (const f of band1) {
        expect(band2).toContainEqual(f); // the west front unchanged
        expect(band2).toContainEqual({ ...f, x: W - f.w }); // and its mirror image, flush with the east edge
      }
      expect(two.imgs.length).toBe(2 * one.imgs.length); // the dither rows at both fronts
      const cells = (imgs: Img[], c: string) => cellsOf(imgs).filter((s) => s.endsWith(c)).length;
      expect(cells(two.imgs, C.plum1)).toBe(2 * cells(one.imgs, C.plum1));
      expect(cells(two.imgs, C.plum2)).toBe(2 * cells(one.imgs, C.plum2));
      expect(cells(one.imgs, C.plum1)).toBeGreaterThan(0);
      const streaks = (fs: Fill[]) => fs.filter((f) => (f.fill === C.plum3 || f.fill === C.plum4) && f.h === 1);
      expect(streaks(one.fills).length).toBe(Math.floor(10 + level * 40));
      expect(streaks(two.fills).length).toBe(2 * streaks(one.fills).length); // each front its own, as dense as the one was
      for (const s of streaks(one.fills)) expect(streaks(two.fills)).toContainEqual({ ...s, x: W - s.x - s.w });
      // the two fronts never meet: each reaches at most 42% of the width plus its wobble
      for (const f of band2) expect(f.w).toBeLessThanOrEqual(Math.round(level * W * 0.42 + 10));
    }
  });

  it("stacked (a portrait phone), the storm draws exactly as before: no flag, or the flag false, is the one west front", () => {
    for (const t of [30.3, 68.3]) {
      const a = recorder(), b = recorder();
      drawWind(a.g, 1, 195, 422, t);
      drawWind(b.g, 1, 195, 422, t, { both: false });
      expect(b.fills).toEqual(a.fills);
      expect(cellsOf(b.imgs)).toEqual(cellsOf(a.imgs));
      expect(a.fills.filter((f) => f.fill === C.plum0 && f.alpha === 0.55).every((f) => f.x === 0)).toBe(true);
    }
  });

  it("the cached dither rows paint exactly bayer's cells, row by row, as the per-pixel dither did (wind2-base)", () => {
    for (const [W, H] of [[195, 422], [384, 216], [422, 195]]) for (const level of [0.3, 0.9, 1]) for (const t of [26.2, 50.3, 68.3]) {
      const r = recorder(), ref = recorder();
      drawWind(r.g, level, W, H, t);
      const front = level * W * 0.42; // wind2-base's dither, per pixel (render/world.ts at 6dda035)
      for (let y = 0; y < H; y += 2) {
        const wob = Math.sin(y * 0.07 + t * 1.3) * 7 + Math.sin(y * 0.19 - t * 2.3) * 3;
        const fx = Math.max(0, Math.round(front + wob));
        if (fx <= 0) continue;
        bayer(ref.g, fx - 10, y, 10, 2, C.plum1, 0.5, 0, y);
        bayer(ref.g, fx - 4, y, 6, 2, C.plum2, 0.35, 1, y);
      }
      const refCells = ref.fills.map((f) => `${f.x},${f.y},${f.fill}`).sort();
      expect(cellsOf(r.imgs), `${W}x${H} level ${level} t ${t}`).toEqual(refCells);
      expect(r.imgs.every((d) => d.alpha === 1)).toBe(true);
    }
  });

  it("each board sits under the same share of the band (within 10 points) on every layout, at the wind's levels and moments", () => {
    for (const [name, w, h, dpr] of [...SIDE_BY_SIDE, ...STACKED]) {
      const { v, L } = layoutOf(w, h, dpr);
      const both = windBoth(hullBox(L.frames[0]), hullBox(L.frames[1]));
      for (const level of [0.5, 0.88, 1]) for (const t of [30.3, 50.3, 68.3]) {
        const r = recorder();
        drawWind(r.g, level, v.W, v.H, t, { both });
        const cov = bandGrid(r.fills, v.W, v.H);
        const s0 = share(cov, v.W, v.H, L.hulls[0]), s1 = share(cov, v.W, v.H, L.hulls[1]);
        expect(Math.abs(s0 - s1), `${name} level ${level} t ${t}: ${s0.toFixed(3)} vs ${s1.toFixed(3)}`).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("the mark (tooling) draws the band alone, flat and opaque in its colour, on both fronts", () => {
    const r = recorder();
    drawWind(r.g, 1, 384, 216, 50.3, { both: true, mark: "#FF00FF" });
    expect(r.fills.length).toBeGreaterThan(0);
    expect(r.fills.every((f) => f.fill === "#FF00FF" && f.alpha === 1 && f.h === 2)).toBe(true);
    expect(r.fills.some((f) => f.x === 0) && r.fills.some((f) => f.x + f.w === 384)).toBe(true);
  });
});
