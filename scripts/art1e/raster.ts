// ART-1E (REQ-BFG-098; BRIEF-ART1E steps 1, 5 and 6) picture tooling, not shipped: Node has no canvas, so the render entry
// points (sprites.ts gateSprite, itemIcon) draw into the software raster of tests/wave3Art.test.ts (fillRect, drawImage with
// the 90-degree turns and flips the sprites use, source-in compositing, getImageData), which keeps every pixel's colour by
// name. Img is an RGBA picture with nearest-neighbour blits and the game's own 5x7 letters (font.ts glyphRows); encodePng
// writes it with node:zlib. Used by sheet.ts (the sheet), match.ts (the cold read's picture) and sigs.ts (off-identity).
// Build and run (from the repo root): npx vite build --ssr scripts/art1e/<tool>.ts --outDir <W>/tmp/art1e-<tool> --emptyOutDir --logLevel warn
//   node <W>/tmp/art1e-<tool>/<tool>.js <args>
import { deflateSync } from "node:zlib";
import { glyphRows } from "../../src/render/font";

export type Pix = string | null;

export class RasterCanvas {
  private w = 300;
  private h = 150;
  px: Pix[] = new Array<Pix>(300 * 150).fill(null);
  oob = 0; // paints that fell outside the canvas
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
    if (this.globalAlpha <= 0) return;
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

/** Install the stub `document` the render code's makeCanvas asks for (call it once, before the first sprite is drawn). */
export function installDocument(): void {
  (globalThis as unknown as { document: unknown }).document = { createElement: () => new RasterCanvas() };
}

export const R = (c: unknown): RasterCanvas => c as RasterCanvas;

/** A picture's pixel colours, one string (the tests' sig). */
export const sigOf = (c: RasterCanvas): string => c.px.map((p) => p ?? "-").join(",");
/** Its opaque mask, one string of 0 and 1 (the tests' mask). */
export const maskOf = (c: RasterCanvas): string => c.px.map((p) => (p === null ? "0" : "1")).join("");

export type RGB = [number, number, number];
export const rgb = (hex: string): RGB => { const [r, g, b] = hexRGBA(hex); return [r, g, b]; };

/** An RGBA picture, built by nearest-neighbour blits (art px x scale), then written as a PNG. */
export class Img {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number, ground: RGB) {
    this.data = new Uint8Array(w * h * 4);
    this.rect(0, 0, w, h, ground);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const k = (j * this.w + i) * 4;
        this.data[k] = c[0]; this.data[k + 1] = c[1]; this.data[k + 2] = c[2]; this.data[k + 3] = 255;
      }
    }
  }
  /** Blit a raster canvas at (x, y) with each art px `s` screen px wide (transparent px skipped). */
  blit(src: RasterCanvas, x: number, y: number, s: number): void {
    for (let j = 0; j < src.height; j++) for (let i = 0; i < src.width; i++) {
      const col = src.at(i, j);
      if (col !== null) this.rect(x + i * s, y + j * s, s, s, rgb(col));
    }
  }
  /** Text in the game's 5x7 face (glyphRows), each art px `s` screen px wide; returns the width drawn. */
  text(str: string, x: number, y: number, c: RGB, s: number): number {
    let cx = x;
    for (const ch of str) {
      const rows = glyphRows(ch, "5");
      if (rows) {
        rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") this.rect(cx + i * s, y + j * s, s, s, c); });
      }
      cx += ((rows?.[0]?.length ?? 3) + 1) * s;
    }
    return cx - x;
  }
  png(): Uint8Array { return encodePng(this.w, this.h, this.data); }
}

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An 8-bit RGBA PNG. */
export function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
