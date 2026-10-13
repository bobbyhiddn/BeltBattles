// PERF-1 (REQ-BFG-080, REVIEW-STAGE099 F1): the build screen draws only what changed (src/game/retain.ts). The browser
// proof (every build-screen frame byte-identical to the frame drawn directly, on the five pinned phones and the desk,
// tips new and done, a rune held; still, dragging, a panel open) is W/kit-perf1/probe-same.mjs with samepixels; here the
// recorder itself, on a small software canvas: random frames drawn through it (only where they changed) equal the same
// frames drawn directly, pixel for pixel, whatever changes (a place, a colour, alpha, a transform, a clip, a sprite drawn
// into, a draw added or dropped), so nothing that moves can freeze; and the cases that must play a frame whole do.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Retained, changedBoxes, mergeBoxes, rectBox, type Box } from "../src/game/retain";
import { canvasVersion, makeCanvas } from "../src/render/pixel";

type Clip = (x: number, y: number) => boolean;

/** A software 2D context: scale-and-translate transforms, rect clips, fillRect and drawImage with an order-sensitive
 *  blend (alpha under 1 mixes with what is under it), a call log. Enough to tell any two different pictures apart. */
class SoftCtx {
  readonly canvas: { width: number; height: number };
  px: Int32Array;
  log: string[] = [];
  fillStyle: unknown = "#0";
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  globalCompositeOperation = "source-over";
  private t = [1, 0, 0, 1, 0, 0];
  private clips: Clip[] = [];
  private pathR: Box[] = [];
  private stack: { t: number[]; clips: Clip[]; fillStyle: unknown; globalAlpha: number; smooth: boolean }[] = [];
  constructor(w: number, h: number) {
    this.canvas = { width: w, height: h };
    this.px = new Int32Array(w * h);
  }
  getTransform() { const [a, b, c, d, e, f] = this.t; return { a, b, c, d, e, f }; }
  save() { this.log.push("save"); this.stack.push({ t: [...this.t], clips: this.clips, fillStyle: this.fillStyle, globalAlpha: this.globalAlpha, smooth: this.imageSmoothingEnabled }); }
  restore() {
    this.log.push("restore");
    const s = this.stack.pop();
    if (s) { this.t = s.t; this.clips = s.clips; this.fillStyle = s.fillStyle; this.globalAlpha = s.globalAlpha; this.imageSmoothingEnabled = s.smooth; }
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.log.push(`setTransform ${[a, b, c, d, e, f]}`); this.t = [a, b, c, d, e, f]; }
  translate(x: number, y: number) { this.t = [this.t[0], 0, 0, this.t[3], this.t[4] + this.t[0] * x, this.t[5] + this.t[3] * y]; }
  scale(x: number, y: number) { this.t = [this.t[0] * x, 0, 0, this.t[3] * y, this.t[4], this.t[5]]; }
  beginPath() { this.pathR = []; }
  rect(x: number, y: number, w: number, h: number) {
    const [a, , , d, e, f] = this.t;
    const X0 = a * x + e, X1 = a * (x + w) + e, Y0 = d * y + f, Y1 = d * (y + h) + f;
    this.pathR.push([Math.min(X0, X1), Math.min(Y0, Y1), Math.max(X0, X1), Math.max(Y0, Y1)]);
  }
  clip() {
    this.log.push(`clip ${this.pathR.length}`);
    const rs = this.pathR.slice();
    this.clips = [...this.clips, (x, y) => rs.some((r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])];
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.log.push("fillRect");
    const c = Number(String(this.fillStyle).replace(/\D/g, "")) | 0;
    this.paint(x, y, w, h, () => c);
  }
  drawImage(img: { width: number; height: number; color?: number }, x: number, y: number) {
    this.log.push("drawImage");
    const v = canvasVersion(img);
    this.paint(x, y, img.width, img.height, (i, j) => (img.color ?? 0) * 7 + i * 3 + j + v * 1000);
  }
  private paint(x: number, y: number, w: number, h: number, col: (i: number, j: number) => number) {
    const [a, , , d, e, f] = this.t;
    const X0 = Math.min(a * x + e, a * (x + w) + e), X1 = Math.max(a * x + e, a * (x + w) + e);
    const Y0 = Math.min(d * y + f, d * (y + h) + f), Y1 = Math.max(d * y + f, d * (y + h) + f);
    const W = this.canvas.width, H = this.canvas.height;
    for (let j = Math.max(0, Math.floor(Y0)); j < Math.min(H, Math.ceil(Y1)); j++) {
      for (let i = Math.max(0, Math.floor(X0)); i < Math.min(W, Math.ceil(X1)); i++) {
        const cx = i + 0.5, cy = j + 0.5;
        if (cx < X0 || cx >= X1 || cy < Y0 || cy >= Y1 || this.clips.some((c) => !c(cx, cy))) continue;
        const c = col(Math.floor((cx - X0) / a), Math.floor((cy - Y0) / d));
        const k = j * W + i;
        this.px[k] = this.globalAlpha >= 1 ? c : (this.px[k] * 31 + c * 7 + Math.round(this.globalAlpha * 100)) | 0;
      }
    }
  }
}

/** pixel.ts makeCanvas outside a page: a stand-in document whose canvases hand out a context with the drawing methods. */
function withDocument<T>(fn: () => T): T {
  const g0 = globalThis as { document?: unknown };
  const had = g0.document;
  const ctxOf = () => ({ imageSmoothingEnabled: true, fillRect() {}, drawImage() {}, clearRect() {}, fill() {}, stroke() {}, strokeRect() {}, fillText() {}, strokeText() {}, putImageData() {} });
  g0.document = { createElement: () => { const c = { width: 0, height: 0, ctx: ctxOf(), getContext: () => c.ctx }; return c; } };
  try {
    return fn();
  } finally {
    g0.document = had;
  }
}

/** A frame's scene: sprites and rects in groups (a group is a translate + scale, maybe clipped), some faded. */
interface Item { kind: "rect" | "img"; x: number; y: number; w: number; h: number; color: number; alpha: number; group: number; img: number }
interface Scene { items: Item[]; groups: { x: number; y: number; k: number; clip: boolean }[] }

function drawScene(g: CanvasRenderingContext2D, s: Scene, sub: number, imgs: CanvasImageSource[]): void {
  g.setTransform(sub, 0, 0, sub, 0, 0);
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
  g.fillStyle = "#1";
  g.fillRect(0, 0, 64, 48); // the sea: covers the canvas
  s.groups.forEach((gr, gi) => {
    g.save();
    g.translate(gr.x, gr.y);
    g.scale(gr.k, gr.k);
    if (gr.clip) { g.beginPath(); g.rect(0, 0, 12, 10); g.clip(); }
    for (const it of s.items) {
      if (it.group !== gi) continue;
      g.globalAlpha = it.alpha;
      if (it.kind === "rect") { g.fillStyle = `#${it.color}`; g.fillRect(it.x, it.y, it.w, it.h); }
      else g.drawImage(imgs[it.img], it.x, it.y);
      g.globalAlpha = 1;
    }
    g.restore();
  });
}

/** A seeded random stream (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("PERF-1: the build screen draws only what changed (game/retain.ts)", () => {
  it("random frames drawn through the recorder equal the same frames drawn directly, pixel for pixel, whatever changes", () => {
    const sub = 3, W = 64 * sub, H = 48 * sub;
    const kinds = { part: 0, whole: 0, still: 0 };
    withDocument(() => {
      for (let seed = 1; seed <= 12; seed++) {
        const r = rng(seed), ri = (n: number) => Math.floor(r() * n);
        // three sprites from makeCanvas (their draws are counted: pixel.ts canvasVersion)
        const sprites = [0, 1, 2].map((i) => { const [c, g] = makeCanvas(3 + i, 2 + i); (c as unknown as { color: number }).color = 40 + i; return { c, g }; });
        const imgs = sprites.map((s) => s.c as unknown as CanvasImageSource);
        const scene: Scene = { groups: [{ x: 0, y: 0, k: 1, clip: false }, { x: 20, y: 10, k: 2, clip: false }, { x: 40, y: 30, k: 1, clip: true }], items: [] };
        for (let i = 0; i < 14; i++) scene.items.push({ kind: r() < 0.5 ? "rect" : "img", x: ri(30), y: ri(20), w: 1 + ri(8), h: 1 + ri(6), color: 2 + ri(9), alpha: r() < 0.2 ? 0.5 : 1, group: ri(3), img: ri(3) });
        const direct = new SoftCtx(W, H), real = new SoftCtx(W, H);
        const rec = new Retained();
        for (let f = 0; f < 60; f++) {
          // change something (or nothing) this frame
          const what = ri(9);
          const it = scene.items[ri(scene.items.length)];
          if (what === 0) { it.x += ri(5) - 2; it.y += ri(3) - 1; }
          else if (what === 1) it.color = 2 + ri(9);
          else if (what === 2) it.alpha = it.alpha === 1 ? 0.5 : 1;
          else if (what === 3) scene.groups[ri(3)].x += ri(3) - 1;
          else if (what === 4) { const gr = scene.groups[ri(3)]; gr.clip = !gr.clip; }
          else if (what === 5 && scene.items.length < 20) scene.items.splice(ri(scene.items.length), 0, { ...it, x: ri(30), color: 2 + ri(9) });
          else if (what === 6 && scene.items.length > 4) scene.items.splice(ri(scene.items.length), 1);
          else if (what === 7) sprites[ri(3)].g.fillRect(0, 0, 1, 1); // a sprite drawn into since the last frame
          drawScene(direct as unknown as CanvasRenderingContext2D, scene, sub, imgs);
          drawScene(rec.begin(real as unknown as CanvasRenderingContext2D), scene, sub, imgs);
          rec.end();
          const kind = rec.stats.last === null ? "whole" : rec.stats.last.length ? "part" : "still";
          kinds[kind]++;
          let diff = 0;
          for (let k = 0; k < direct.px.length; k++) if (direct.px[k] !== real.px[k]) diff++;
          expect(diff, `seed ${seed} frame ${f} (${kind})`).toBe(0);
        }
      }
    });
    // all three ways happened: in boxes, not drawn, whole (each seed's first frame at least)
    expect(kinds.part).toBeGreaterThan(100);
    expect(kinds.still).toBeGreaterThan(30);
    expect(kinds.whole).toBeGreaterThanOrEqual(12);
  });

  it("a frame drawn again unchanged draws nothing; a changed draw plays the frame clipped to its old and new boxes", () => {
    const real = new SoftCtx(100, 100), rec = new Retained();
    const frame = (x: number) => {
      const g = rec.begin(real as unknown as CanvasRenderingContext2D);
      g.setTransform(5, 0, 0, 5, 0, 0);
      g.fillStyle = "#3";
      g.fillRect(0, 0, 20, 20);
      g.fillStyle = "#7";
      g.fillRect(x, 2, 2, 2);
      rec.end();
    };
    frame(2);
    expect(rec.stats.last).toBeNull(); // the first frame plays whole
    real.log = [];
    frame(2);
    expect(rec.stats.last).toEqual([]);
    expect(real.log.filter((l) => l === "fillRect" || l === "drawImage" || l.startsWith("clip"))).toEqual([]); // nothing drawn
    real.log = [];
    frame(10);
    // the old place (2..4 x 5 = 10..20, one px wider) and the new (50..60): two boxes, then the whole frame clipped
    expect(rec.stats.last).toEqual([[9, 9, 21, 21], [49, 9, 61, 21]]);
    expect(real.log.slice(0, 3)).toEqual(["save", "setTransform 1,0,0,1,0,0", "clip 2"]);
    expect(real.log.filter((l) => l === "fillRect").length).toBe(2);
  });

  it("a soft draw (not whole-pixel exact: a fractional scale) is never cut by a box: the box it meets grows to hold it", () => {
    // in a page, Skia can sample an image drawn at a fractional scale differently where a clip's edge cuts it (the frame
    // check found 10 px on the 390x660 phone with a rune, where the build screen's grid falls back to sub 1)
    const real = new SoftCtx(200, 200), rec = new Retained();
    const img = { width: 10, height: 10, color: 3 };
    const frame = (x: number) => {
      const g = rec.begin(real as unknown as CanvasRenderingContext2D);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = "#2";
      g.fillRect(0, 0, 200, 200);
      g.setTransform(1.5, 0, 0, 1.5, 0, 0); // the sprite at x 1.5: device 60..75, soft
      g.drawImage(img as unknown as CanvasImageSource, 40, 40);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = "#5";
      g.fillRect(x, 70, 4, 4); // exact
      rec.end();
    };
    frame(150);
    frame(150);
    expect(rec.stats.last).toEqual([]);
    frame(56); // the new place [55, 69, 61, 75] meets the sprite's [59, 59, 76, 76]: it grows to hold it whole
    expect([...(rec.stats.last as Box[])].sort((p, q) => p[0] - q[0])).toEqual([[55, 59, 76, 76], [149, 69, 155, 75]]);
    // an exact sprite (a whole scale on pixel lines) is cut freely
    const rec2 = new Retained(), real2 = new SoftCtx(200, 200);
    const frame2 = (x: number) => {
      const g = rec2.begin(real2 as unknown as CanvasRenderingContext2D);
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = "#2";
      g.fillRect(0, 0, 100, 100);
      g.drawImage(img as unknown as CanvasImageSource, 30, 30); // device 60..80, exact
      g.fillStyle = "#5";
      g.fillRect(x, 35, 2, 2);
      rec2.end();
    };
    frame2(80);
    frame2(28); // new place [55, 69, 61, 75]: meets the sprite, which is exact, so the box stays
    expect([...(rec2.stats.last as Box[])].sort((p, q) => p[0] - q[0])).toEqual([[55, 69, 61, 75], [159, 69, 165, 75]]);
    // a 1:1 sprite (a texel per device px: Skia's sprite blit, another blend path where a clip cuts it) is soft too
    const rec3 = new Retained(), real3 = new SoftCtx(200, 200);
    const frame3 = (x: number) => {
      const g = rec3.begin(real3 as unknown as CanvasRenderingContext2D);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = "#2";
      g.fillRect(0, 0, 200, 200);
      g.drawImage(img as unknown as CanvasImageSource, 60, 60); // device 60..70, 1:1
      g.fillStyle = "#5";
      g.fillRect(x, 62, 4, 4);
      rec3.end();
    };
    frame3(150);
    frame3(57); // new place [56, 61, 62, 67] meets the sprite's [59, 59, 71, 71]: grows to [56, 59, 71, 71]
    expect([...(rec3.stats.last as Box[])].sort((p, q) => p[0] - q[0])).toEqual([[56, 59, 71, 71], [149, 61, 155, 67]]);
  });

  it("each state a draw reads counts: the fill style, alpha, smoothing, the transform, a clip", () => {
    const img = { width: 2, height: 2, color: 9 };
    const variants: [string, (g: CanvasRenderingContext2D) => void][] = [
      ["fillStyle", (g) => { g.fillStyle = "#4"; }],
      ["globalAlpha", (g) => { g.globalAlpha = 0.5; }],
      ["imageSmoothingEnabled", (g) => { g.imageSmoothingEnabled = true; }],
      ["translate", (g) => { g.translate(1, 0); }],
      ["clip", (g) => { g.beginPath(); g.rect(0, 0, 3, 3); g.clip(); }],
    ];
    for (const [name, v] of variants) {
      const real = new SoftCtx(100, 100), rec = new Retained();
      const frame = (on: boolean) => {
        const g = rec.begin(real as unknown as CanvasRenderingContext2D);
        g.setTransform(5, 0, 0, 5, 0, 0);
        g.imageSmoothingEnabled = false;
        g.globalAlpha = 1;
        g.fillStyle = "#3";
        g.save();
        if (on) v(g);
        g.fillRect(4, 4, 2, 2);
        g.drawImage(img as unknown as CanvasImageSource, 8, 8);
        g.restore();
        rec.end();
      };
      frame(false);
      frame(false);
      expect(rec.stats.last, name).toEqual([]);
      frame(true);
      expect(rec.stats.last === null || (rec.stats.last as Box[]).length > 0, name).toBe(true);
    }
  });

  it("a makeCanvas sprite counts its draws (canvasVersion), and a frame that draws it after it changed redraws there", () => {
    withDocument(() => {
      const [c, g] = makeCanvas(4, 4);
      expect(canvasVersion(c)).toBe(0);
      g.fillRect(0, 0, 1, 1);
      g.drawImage(c as unknown as CanvasImageSource, 0, 0);
      expect(canvasVersion(c)).toBe(2);
      expect(canvasVersion({})).toBe(-1);
      const real = new SoftCtx(50, 50), rec = new Retained();
      const frame = () => {
        rec.begin(real as unknown as CanvasRenderingContext2D).drawImage(c as unknown as CanvasImageSource, 1, 1);
        rec.end();
      };
      frame();
      frame();
      expect(rec.stats.last).toEqual([]);
      g.fillRect(1, 1, 1, 1); // the sprite drawn into
      frame();
      expect(rec.stats.last).toEqual([[0, 0, 6, 6]]);
    });
  });

  it("what can't be bounded plays the frame whole when it changes: a path's fill, text, a blend", () => {
    const cases: [string, (g: CanvasRenderingContext2D, k: number) => void][] = [
      ["fill", (g, k) => { g.beginPath(); g.rect(k, 0, 2, 2); g.fill(); }],
      ["text", (g, k) => { g.fillText(`T${k}`, 1, 1); }],
      ["blend", (g, k) => { g.globalCompositeOperation = "lighter"; g.fillRect(k, 0, 1, 1); g.globalCompositeOperation = "source-over"; }],
    ];
    for (const [name, draw] of cases) {
      const soft = new SoftCtx(40, 40);
      const real = soft as unknown as Record<string, unknown>;
      for (const m of ["fill", "fillText"]) real[m] = () => undefined;
      const rec = new Retained();
      const frame = (k: number) => {
        const g = rec.begin(real as unknown as CanvasRenderingContext2D);
        g.fillRect(0, 0, 40, 40);
        draw(g, k);
        rec.end();
      };
      frame(1);
      frame(1);
      expect(rec.stats.last, name).toEqual([]);
      frame(2);
      expect(rec.stats.last, name).toBeNull();
    }
  });

  it("a resize or an invalidate plays the next frame whole; a query mid-frame (getImageData) draws the rest directly", () => {
    const soft = new SoftCtx(40, 40);
    (soft as unknown as Record<string, unknown>).getImageData = () => "pixels";
    const rec = new Retained();
    const frame = (q = false) => {
      const g = rec.begin(soft as unknown as CanvasRenderingContext2D);
      g.fillRect(0, 0, 4, 4);
      if (q) expect(g.getImageData(0, 0, 1, 1)).toBe("pixels");
      g.fillRect(5, 5, 4, 4);
      rec.end();
    };
    frame();
    frame();
    expect(rec.stats.last).toEqual([]);
    soft.canvas.width = 41;
    frame();
    expect(rec.stats.last).toBeNull();
    frame();
    rec.invalidate();
    frame();
    expect(rec.stats.last).toBeNull();
    soft.log = [];
    frame(true);
    expect(rec.stats.direct).toBe(1);
    expect(soft.log.filter((l) => l === "fillRect").length).toBe(2); // the first played, the second drawn directly
    frame();
    expect(rec.stats.last).toBeNull(); // after a direct frame: whole
  });

  it("boxes: a rect's device box under the transform, one px wider; touching boxes merge; past 64 they become one", () => {
    expect(rectBox([5, 0, 0, 5, 10, 20], 1, 1, 2, 3)).toEqual([14, 24, 26, 41]);
    expect(rectBox([1, 0, 0, 1, 0, 0], NaN, 0, 1, 1)).toBeNull();
    expect(mergeBoxes([[0, 0, 10, 10], [10, 0, 20, 10], [50, 50, 60, 60]], 100, 100)).toEqual([[0, 0, 20, 10], [50, 50, 60, 60]]);
    expect(mergeBoxes([[-5, -5, 3, 3]], 100, 100)).toEqual([[0, 0, 3, 3]]);
    const many: Box[] = Array.from({ length: 70 }, (_, i): Box => [i * 3, 0, i * 3 + 1, 1]);
    expect(mergeBoxes(many, 1000, 10)).toEqual([[0, 0, 208, 1]]);
    // a draw added in the middle: only the added draw's box (the head and the tail match)
    const d = (x: number) => ({ m: "fillRect", a: [x, 0, 1, 1], ver: 0, t: [1, 0, 0, 1, 0, 0], alpha: 1, fill: "#1", smooth: null, misc: "", clip: "", path: "", box: [x, 0, x + 1, 1] as Box, soft: false });
    expect(changedBoxes([d(1), d(2), d(3)], [d(1), d(2), d(9), d(3)])).toEqual([[9, 0, 10, 1]]);
    expect(changedBoxes([d(1), d(2)], [d(1), d(2)])).toBeNull();
  });

  it("the build screen asks for it (Screen.retain); no other screen does, so every other screen draws as before", () => {
    const root = decodeURIComponent(new URL("../src/screens", import.meta.url).pathname);
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith(".ts")) files.push(p);
      }
    };
    walk(root);
    const asks = files.filter((f) => /readonly retain = true/.test(readFileSync(f, "utf8")));
    expect(asks.map((f) => f.slice(root.length + 1))).toEqual(["build/build.ts"]);
    const game = readFileSync(decodeURIComponent(new URL("../src/game/game.ts", import.meta.url).pathname), "utf8");
    // only on ZOOM-1's finer grid (sub > 1); at sub 1 (0.9.8's canvas) the build screen draws directly, as before
    expect(game).toMatch(/this\.screen\.retain && !this\.retained\.off && \(this\.view\.sub \?\? 1\) > 1/);
  });
});
