// WIND-2 (REQ-BFG-093): the dark wind looks fair on every layout. Call 1: side by side (the desk, a phone held sideways)
// the storm rolls in from both screen edges, so both boards sit under the same share of it; stacked (a portrait phone)
// the one front from the left, as before. Presentation only: nothing here touches the sim.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { battleGrid, battleLayout, battleScale, cameraFocus, laneLayout, minGap } from "../src/game/battleLayout";
import { ArenaMotion, windBoth } from "../src/game/arenaMotion";
import { Arena } from "../src/game/arena";
import { viewWithSub } from "../src/game/viewGrid";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { hullBox, type Box } from "../src/render/frame";
import { C } from "../src/render/palette";
import { drawWind } from "../src/render/world";
import { bayer, type G } from "../src/render/pixel";

/** A recording 2D context (node has no canvas): each fillRect with its colour and alpha, each drawImage of a recorded
 *  canvas (its own fills: the cached dither rows, the glyphs) at its place, each setTransform, in one ordered list per
 *  canvas (`ops`), and the fills and images apart; every other call is a no-op (as tests/motion.test.ts's fakeCtx). */
interface Fill { x: number; y: number; w: number; h: number; fill: string; alpha: number }
interface FakeCanvas { width: number; height: number; fills: Fill[]; imgs: Img[]; ops: Op[]; getContext: () => G }
interface Img { img: FakeCanvas; x: number; y: number; alpha: number }
type Op = { op: "fill"; f: Fill } | { op: "img"; d: Img } | { op: "tf"; m: number[] };
function fakeCanvas(): FakeCanvas {
  const c: FakeCanvas = { width: 0, height: 0, fills: [], imgs: [], ops: [], getContext: () => g };
  const st: Record<string, unknown> = { canvas: c, fillStyle: "#000000", globalAlpha: 1, imageSmoothingEnabled: false };
  const g = new Proxy(st, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      if (k === "fillRect") return (x: number, y: number, w: number, h: number) => {
        const f = { x, y, w, h, fill: t.fillStyle as string, alpha: t.globalAlpha as number };
        c.fills.push(f);
        c.ops.push({ op: "fill", f });
      };
      if (k === "drawImage") return (img: FakeCanvas, ...n: number[]) => {
        const d = { img, x: n.length >= 8 ? n[4] : n[0], y: n.length >= 8 ? n[5] : n[1], alpha: t.globalAlpha as number };
        c.imgs.push(d);
        c.ops.push({ op: "img", d });
      };
      if (k === "setTransform") return (...m: number[]) => { c.ops.push({ op: "tf", m }); };
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
function recorder(): { g: G; fills: Fill[]; imgs: Img[]; canvas: FakeCanvas } {
  const c = fakeCanvas();
  return { g: c.getContext(), fills: c.fills, imgs: c.imgs, canvas: c };
}

/** A stand-in `document` whose canvases record (the dither rows, the world layer and the glyphs are made with makeCanvas). */
const doc = globalThis as { document?: unknown };
let prevDoc: unknown;
beforeAll(() => {
  prevDoc = doc.document;
  doc.document = { createElement: () => fakeCanvas() };
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

/** The battle's arena in motion on a viewport, through the camera, as BattleScreen and ReplayScreen set it up, with the
 *  dark wind at full strength (display only: the battle's windLevel read as 1) and numbers of colours of their own: a hit
 *  on each board and one at the shake, and a wind number on each board, all 0.3 s old (steady, in their colours). */
const HIT = ["#A1B2C3", "#B2C3D4", "#C3D4E5"];
function windyArena(w: number, h: number, dpr: number, shot: "wide" | "close") {
  const pick = (pw: number, ph: number, p: boolean, scale: number) => { const gr = battleGrid(pw, ph, p); return gr.close === scale ? gr.sub : 1; };
  const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pick);
  const grid = battleGrid(Math.floor(w * dpr), Math.floor(h * dpr), v.portrait);
  const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
  const a = new Arena(startingBuild("furnace", 1), warlordBuild("weaver", 3), 7, null);
  a.quiet = true;
  a.setFrames(L.frames, L.enter);
  (a.b as unknown as { windLevel: () => number }).windLevel = () => 1;
  const am = new ArenaMotion(7, "calm", { sway: 0, sea: null, perf: false }, false);
  am.setLanes(L, minGap(v.portrait ? v.H : v.W));
  am.useCamera(grid, cameraFocus(L), shot);
  [0, 1, -1].forEach((s, i) => {
    a.fx.anchor = s;
    a.fx.popup(L.hulls[Math.max(0, s)].x + 30, L.hulls[Math.max(0, s)].y + 30, "40", HIT[i]);
  });
  for (const s of [0, 1]) {
    a.fx.anchor = s;
    a.fx.windPop(L.hulls[s].x + 70, L.hulls[s].y + 70, "90", C.windHit);
  }
  a.fx.anchor = -1;
  for (let i = 0; i < a.fx.popCount; i++) a.fx.popList[i].t = 0.3;
  return { v, grid, L, a, am };
}

describe("WIND-2 call 2: every number above the storm", () => {
  it("the numbers are drawn on the canvas after the whole storm, the wind's numbers after them, and none in the world layer", () => {
    for (const [w, h, dpr] of [[1920, 1080, 1], [390, 844, 3], [844, 390, 3]]) for (const shot of ["wide", "close"] as const) {
      const { v, a, am } = windyArena(w, h, dpr, shot);
      const screen = fakeCanvas();
      am.drawSea(screen.getContext(), v.W, v.H, 0, 0, v.scale, v.dpr, 7, a);
      am.draw(screen.getContext(), a, v.W, v.H, false);
      const name = `${w}x${h} ${shot}`;
      const ops = screen.ops;
      const layer = (am as unknown as { layer: FakeCanvas }).layer;
      const has = (d: Img, c: string) => d.img.fills.some((f) => f.fill === c);
      const at = (pred: (o: Op) => boolean) => ops.map((o, i) => (pred(o) ? i : -1)).filter((i) => i >= 0);
      const blit = at((o) => o.op === "img" && o.d.img === layer);
      const storm = at((o) => o.op === "fill" && (o.f.fill === C.plum0 || o.f.fill === C.plum3 || o.f.fill === C.plum4));
      const dither = at((o) => o.op === "img" && (has(o.d, C.plum1) || has(o.d, C.plum2)));
      const pops = at((o) => o.op === "img" && HIT.some((c) => has(o.d, c)));
      const wind = at((o) => o.op === "img" && has(o.d, C.windHit));
      expect(blit.length, name).toBe(1);
      expect(storm.length && dither.length, name).toBeGreaterThan(0);
      expect(storm.filter((i) => ops[i].op === "fill" && (ops[i] as { f: Fill }).f.alpha === 0.55).length, name).toBeGreaterThan(0); // the band
      expect(pops.length, name).toBeGreaterThanOrEqual(3 * 2); // three numbers, two glyphs each
      expect(wind.length, name).toBeGreaterThanOrEqual(2 * 2);
      const lastStorm = Math.max(...storm, ...dither);
      expect(Math.min(...storm, ...dither), name).toBeGreaterThan(blit[0]); // the storm over the world
      expect(Math.min(...pops), name).toBeGreaterThan(lastStorm); // every number over the whole storm
      expect(Math.min(...wind), name).toBeGreaterThan(Math.max(...pops)); // WIND-1's wind numbers over them
      expect(layer.imgs.filter((d) => HIT.some((c) => has(d, c))), name).toEqual([]); // nothing of them in the world layer
    }
  });

  it("at rest each number covers the canvas pixels the world layer's blit gave it: whole layer px, lf canvas px each", () => {
    for (const [w, h, dpr] of [[1920, 1080, 1], [390, 844, 3], [402, 690, 3], [844, 390, 3]]) for (const shot of ["wide", "close"] as const) {
      const { v, a, am } = windyArena(w, h, dpr, shot);
      const screen = fakeCanvas();
      am.drawSea(screen.getContext(), v.W, v.H, 0, 0, v.scale, v.dpr, 7, a);
      am.draw(screen.getContext(), a, v.W, v.H, false);
      const lf = (am as unknown as { lf: number }).lf, name = `${w}x${h} ${shot} lf ${lf}`;
      expect(Number.isInteger(lf), name).toBe(true);
      let tf: number[] = [];
      let n = 0;
      for (const o of screen.ops) {
        if (o.op === "tf") tf = o.m;
        if (o.op !== "img" || !HIT.some((c) => o.d.img.fills.some((f) => f.fill === c))) continue;
        // the canvas transform is lf x (the camera's map o the board's): a whole-pixel translation in layer px, unscaled
        expect([tf[0], tf[1], tf[2], tf[3]], name).toEqual([lf, 0, 0, lf]);
        expect(Number.isInteger(tf[4] / lf) && Number.isInteger(tf[5] / lf), `${name}: ${tf}`).toBe(true);
        expect(Number.isInteger(o.d.x) && Number.isInteger(o.d.y), name).toBe(true);
        n++;
      }
      expect(n, name).toBeGreaterThanOrEqual(6);
    }
  });
});
