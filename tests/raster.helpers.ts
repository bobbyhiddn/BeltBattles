// 0.8.0 I1 M4: a software raster for the render tests (not a test file itself). Node has no canvas, so the render entry
// points draw into this one: fillRect, clearRect, drawImage (with the 90-degree turns and flips the sprites use),
// source-in compositing and getImageData, recording every pixel's colour by its palette hex; a paint outside the canvas
// is counted. It is A1's RasterCanvas from tests/wave3Art.test.ts, moved here unchanged so new tests can share it (that
// file keeps its own copy). Call installRaster() before the first draw: makeCanvas then makes RasterCanvases.
import { expect } from "vitest";

export type Pix = string | null;

export class RasterCanvas {
  private w = 300;
  private h = 150;
  px: Pix[] = new Array<Pix>(300 * 150).fill(null);
  oob = 0; // paints that fell outside the canvas
  /** 0.8.0 I1: skip every paint made at globalAlpha < 1 (a hit's white silhouette, the IDLE dim), to read what is under it. */
  opaqueOnly = false;
  private ctx: RasterContext | null = null;
  get width(): number { return this.w; }
  set width(v: number) { this.w = Math.max(0, Math.floor(v)); this.px = new Array<Pix>(this.w * this.h).fill(null); }
  get height(): number { return this.h; }
  set height(v: number) { this.h = Math.max(0, Math.floor(v)); this.px = new Array<Pix>(this.w * this.h).fill(null); }
  getContext(): RasterContext { return (this.ctx ??= new RasterContext(this)); }
  at(x: number, y: number): Pix { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null; }
}

const hexRGBA = (s: string): [number, number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (!m) return [0, 0, 0, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

export class RasterContext {
  fillStyle: unknown = "#000000";
  strokeStyle: unknown = "#000000";
  lineWidth = 1;
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  private m = [1, 0, 0, 1, 0, 0]; // x' = a x + c y + e, y' = b x + d y + f
  private stack: { m: number[]; fill: unknown; alpha: number; op: string }[] = [];
  constructor(readonly canvas: RasterCanvas) {}
  save(): void { this.stack.push({ m: [...this.m], fill: this.fillStyle, alpha: this.globalAlpha, op: this.globalCompositeOperation }); }
  restore(): void {
    const s = this.stack.pop();
    if (s) { this.m = s.m; this.fillStyle = s.fill; this.globalAlpha = s.alpha; this.globalCompositeOperation = s.op; }
  }
  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.m;
    this.m = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
  }
  scale(sx: number, sy: number): void {
    const [a, b, c, d, e, f] = this.m;
    this.m = [a * sx, b * sx, c * sy, d * sy, e, f];
  }
  rotate(t: number): void {
    const cs = Math.round(Math.cos(t)), sn = Math.round(Math.sin(t)); // the sprites turn by quarter turns only
    const [a, b, c, d, e, f] = this.m;
    this.m = [a * cs + c * sn, b * cs + d * sn, c * cs - a * sn, d * cs - b * sn, e, f];
  }
  private map(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  private paint(i: number, j: number, col: string): void {
    const cv = this.canvas;
    if (i < 0 || j < 0 || i >= cv.width || j >= cv.height) { cv.oob++; return; }
    if (this.globalAlpha <= 0 || (cv.opaqueOnly && this.globalAlpha < 1)) return;
    const k = j * cv.width + i;
    if (this.globalCompositeOperation === "source-in") cv.px[k] = cv.px[k] === null ? null : col;
    else cv.px[k] = col;
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0] = this.map(x, y), [x1, y1] = this.map(x + w, y + h);
    const xa = Math.round(Math.min(x0, x1)), xb = Math.round(Math.max(x0, x1));
    const ya = Math.round(Math.min(y0, y1)), yb = Math.round(Math.max(y0, y1));
    for (let j = ya; j < yb; j++) for (let i = xa; i < xb; i++) this.paint(i, j, String(this.fillStyle));
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) {
      if (i >= 0 && j >= 0 && i < this.canvas.width && j < this.canvas.height) this.canvas.px[j * this.canvas.width + i] = null;
    }
  }
  drawImage(img: RasterCanvas, ...a: number[]): void {
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx = 0, dy = 0, dw = img.width, dh = img.height;
    if (a.length === 2) [dx, dy] = a;
    else if (a.length === 4) [dx, dy, dw, dh] = a;
    else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
      const u = Math.floor(sx + ((i + 0.5) * sw) / dw), v = Math.floor(sy + ((j + 0.5) * sh) / dh);
      const col = img.at(u, v);
      if (col === null) continue;
      const [X, Y] = this.map(dx + i + 0.5, dy + j + 0.5);
      this.paint(Math.floor(X), Math.floor(Y), col);
    }
  }
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    const data = new Uint8ClampedArray(4 * w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const col = this.canvas.at(x + i, y + j);
      if (col !== null) data.set(hexRGBA(col), 4 * (j * w + i));
    }
    return { data, width: w, height: h };
  }
  measureText(): { width: number } { return { width: 0 }; }
  beginPath(): void {}
  arc(): void {}
  rect(): void {}
  clip(): void {}
  stroke(): void {}
  fill(): void {}
  moveTo(): void {}
  lineTo(): void {}
}

/** Make document.createElement("canvas") (render/pixel.ts makeCanvas) give RasterCanvases. Call before any draw. */
export function installRaster(): void {
  (globalThis as unknown as { document: unknown }).document = { createElement: () => new RasterCanvas() };
}

/** A canvas's raster (sprites are HTMLCanvasElements made by makeCanvas). */
export const R = (c: HTMLCanvasElement | null | undefined): RasterCanvas => c as unknown as RasterCanvas;
/** A raster as the game's 2D context type. */
export const G = (c: RasterCanvas): CanvasRenderingContext2D => c.getContext() as unknown as CanvasRenderingContext2D;
/** A blank raster w x h. */
export const fresh = (w: number, h: number): RasterCanvas => { const c = new RasterCanvas(); c.width = w; c.height = h; return c; };
/** Every pixel as a string (equal strings: equal pictures). */
export const sig = (c: RasterCanvas): string => c.px.map((p) => p ?? "-").join(",");
/** The pixels of the region (x, y, w, h) as a string. */
export const region = (c: RasterCanvas, x: number, y: number, w: number, h: number): string => {
  const out: string[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push(c.at(x + i, y + j) ?? "-");
  return out.join(",");
};
/** Every pixel of `c` that differs from `d` (same size), as [x, y]. */
export function diffPx(c: RasterCanvas, d: RasterCanvas): [number, number][] {
  expect([c.width, c.height]).toEqual([d.width, d.height]);
  const out: [number, number][] = [];
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (c.at(i, j) !== d.at(i, j)) out.push([i, j]);
  return out;
}
