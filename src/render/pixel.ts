// Low-level pixel drawing. Everything snaps to whole pixels; no smoothing anywhere.

export type G = CanvasRenderingContext2D;

/** PERF-1 (REQ-BFG-080): the draws each canvas makeCanvas made has taken. game/retain.ts keys each drawImage of a frame by
 *  its source and this count, so a frame that draws a sprite drawn into since the last frame redraws where it lands. */
const DRAWN = new WeakMap<object, { n: number }>();
const COUNTED = ["fillRect", "strokeRect", "clearRect", "drawImage", "fill", "stroke", "fillText", "strokeText", "putImageData"];

/** PERF-1: a makeCanvas canvas's draw count (-1: not one of makeCanvas's). */
export function canvasVersion(c: unknown): number {
  if (typeof c !== "object" || c === null) return -1;
  return DRAWN.get(c)?.n ?? -1;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  // PERF-1: count its draws (the same calls reach the canvas; only the count is added)
  const n = { n: 0 };
  DRAWN.set(c, n);
  const r = g as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of COUNTED) {
    const f = r[m];
    if (typeof f !== "function") continue;
    r[m] = function (this: unknown) {
      n.n++;
      // eslint-disable-next-line prefer-rest-params
      return f.apply(this, arguments as unknown as unknown[]);
    };
  }
  return [c, g];
}

export function rect(g: G, x: number, y: number, w: number, h: number, c: string): void {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(g: G, x: number, y: number, c: string): void {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
}

export function hline(g: G, x: number, y: number, w: number, c: string): void {
  rect(g, x, y, w, 1, c);
}

export function vline(g: G, x: number, y: number, h: number, c: string): void {
  rect(g, x, y, 1, h, c);
}

export function frame(g: G, x: number, y: number, w: number, h: number, c: string): void {
  hline(g, x, y, w, c);
  hline(g, x, y + h - 1, w, c);
  vline(g, x, y, h, c);
  vline(g, x + w - 1, y, h, c);
}

/** Filled box with light top/left edge and dark bottom/right edge (light from top-left). */
export function bevel(g: G, x: number, y: number, w: number, h: number, fill: string, hi: string, lo: string, outline?: string): void {
  let ox = x, oy = y, ow = w, oh = h;
  if (outline) {
    frame(g, x, y, w, h, outline);
    ox++; oy++; ow -= 2; oh -= 2;
  }
  rect(g, ox, oy, ow, oh, fill);
  hline(g, ox, oy, ow, hi);
  vline(g, ox, oy, oh, hi);
  hline(g, ox, oy + oh - 1, ow, lo);
  vline(g, ox + ow - 1, oy, oh, lo);
}

/** Pixel-perfect filled disc centred at (cx, cy) (may be fractional). */
export function disc(g: G, cx: number, cy: number, r: number, c: string): void {
  g.fillStyle = c;
  const r2 = r * r;
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy;
    const span = r2 - dy * dy;
    if (span < 0) continue;
    const half = Math.sqrt(span);
    const xa = Math.round(cx - half), xb = Math.round(cx + half);
    if (xb > xa) g.fillRect(xa, y, xb - xa, 1);
  }
}

/** 1px ring. */
export function ring(g: G, cx: number, cy: number, r: number, c: string): void {
  g.fillStyle = c;
  const r2o = r * r, r2i = (r - 1) * (r - 1);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = dx * dx + dy * dy;
      if (d <= r2o && d > r2i) g.fillRect(x, y, 1, 1);
    }
  }
}

export function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, c: string): void {
  g.fillStyle = c;
  const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  for (let y = y0; y < y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const span = 1 - dy * dy;
    if (span < 0) continue;
    const half = Math.sqrt(span) * rx;
    const xa = Math.round(cx - half), xb = Math.round(cx + half);
    if (xb > xa) g.fillRect(xa, y, xb - xa, 1);
  }
}

/** Checkerboard dither fill. */
export function dither(g: G, x: number, y: number, w: number, h: number, c: string, phase = 0): void {
  g.fillStyle = c;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (((i + j + phase) & 1) === 0) g.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** Sparse ordered dither: density 0..1 using a 4x4 Bayer matrix. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(g: G, x: number, y: number, w: number, h: number, c: string, density: number, ox = 0, oy = 0): void {
  if (density <= 0) return;
  g.fillStyle = c;
  const th = density * 16;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (BAYER[((j + oy) & 3) * 4 + ((i + ox) & 3)] < th) g.fillRect(x + i, y + j, 1, 1);
    }
  }
}

export function line(g: G, x0: number, y0: number, x1: number, y1: number, c: string): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = c;
  for (let n = 0; n < 512; n++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Sprite from character rows. '.' or ' ' = transparent. */
export function fromRows(rows: string[], pal: Record<string, string>): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [c, g] = makeCanvas(w, h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const col = pal[ch];
      if (col) px(g, x, y, col);
    }
  });
  return c;
}

/** Add a 1px outline around every opaque pixel. Output grows by 2px. */
export function outlined(src: HTMLCanvasElement, color: string, diagonal = false): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const sg = src.getContext("2d")!;
  const data = sg.getImageData(0, 0, w, h).data;
  const [c, g] = makeCanvas(w + 2, h + 2);
  g.fillStyle = color;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (solid(x, y)) continue;
      let n = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      if (!n && diagonal) n = solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1);
      if (n) g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  g.drawImage(src, 1, 1);
  return c;
}

/** Solid-colour silhouette of a sprite (hit flashes). */
export function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "source-over";
  return c;
}

export function flipY(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.width, src.height);
  g.translate(0, src.height);
  g.scale(1, -1);
  g.drawImage(src, 0, 0);
  return c;
}

export function flipX(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.width, src.height);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

/** Rotate 90° clockwise (lossless). */
export function rot90(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.height, src.width);
  g.translate(src.height, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

export function blit(g: G, img: CanvasImageSource, x: number, y: number): void {
  g.drawImage(img, Math.round(x), Math.round(y));
}
