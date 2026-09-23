// Framed arena floor (STUDY rules 3 and 6): a quiet two-tone ground, worn track ruts
// under each cruiser, a painted front line between the bows, guard rails along the long
// edges, floodlight pools and a dithered vignette, all cached per layout. Ambient motion
// is limited to slow dust motes and lamp flicker so it never competes with the fight.

import { cellNoise } from "../core/rng";
import { C } from "./palette";
import { makeCanvas, rect, type G } from "./pixel";
import type { Box } from "./frame";

export interface BgSpec {
  hulls: Box[];
  vertical: boolean; // cruisers point N/S (portrait) -> rails on the left/right edges
  gapLine: boolean; // painted front line between the bows
  pad?: Box | null; // hazard-striped parking pad (build screen)
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function hexRGB(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function groundLayer(W: number, H: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  const lo = hexRGB(C.soil1), hi = hexRGB(C.soil2), dk = hexRGB(C.soil0);
  const val = (i: number, j: number) => cellNoise(i, j, 31);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = x / 28, fy = y / 28;
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      const v = (val(i, j) * (1 - tx) + val(i + 1, j) * tx) * (1 - ty) + (val(i, j + 1) * (1 - tx) + val(i + 1, j + 1) * tx) * ty;
      const th = BAYER[(y & 3) * 4 + (x & 3)] / 16;
      const col = v > 0.62 + th * 0.3 ? hi : v < 0.22 + th * 0.2 ? dk : lo;
      const o = (y * W + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // sparse pebbles, low contrast
  const n = Math.floor((W * H) / 700);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(cellNoise(k, 1, 7) * W), y = Math.floor(cellNoise(k, 2, 7) * H);
    rect(g, x, y + 1, 2, 1, C.soil0);
    rect(g, x, y, cellNoise(k, 3, 7) > 0.7 ? 2 : 1, 1, C.soil3);
  }
  return c;
}

function dither(g: G, x: number, y: number, w: number, h: number, col: string, density: number): void {
  if (density <= 0) return;
  g.fillStyle = col;
  const th = density * 16;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (BAYER[((y + j) & 3) * 4 + ((x + i) & 3)] < th) g.fillRect(x + i, y + j, 1, 1);
}

function buildLayer(W: number, H: number, s: BgSpec): HTMLCanvasElement {
  const c = groundLayer(W, H);
  const g = c.getContext("2d")!;
  // floodlight pools (warm, soft) near the long edges
  for (const [px, py] of s.vertical ? [[W * 0.5, H * 0.08], [W * 0.5, H * 0.92]] : [[W * 0.3, H * 0.12], [W * 0.7, H * 0.88]]) {
    const r = Math.min(W, H) * 0.42;
    for (let y = Math.max(0, Math.floor(py - r)); y < Math.min(H, py + r); y++) {
      for (let x = Math.max(0, Math.floor(px - r)); x < Math.min(W, px + r); x++) {
        const k = 1 - Math.hypot((x - px) / r, (y - py) / (r * 0.7));
        if (k > 0 && BAYER[(y & 3) * 4 + (x & 3)] < k * 7) rect(g, x, y, 1, 1, C.soil3);
      }
    }
  }
  // worn track ruts along each cruiser's axis
  for (const h of s.hulls) {
    if (s.vertical) {
      for (const tx of [h.x + 3, h.x + h.w - 14]) dither(g, Math.round(tx), 0, 11, H, C.soil0, 0.45);
    } else {
      for (const ty of [h.y + 3, h.y + h.h - 14]) dither(g, 0, Math.round(ty), W, 11, C.soil0, 0.45);
    }
  }
  // painted front line between the bows
  if (s.gapLine && s.hulls.length === 2) {
    const [a, b] = s.hulls;
    if (s.vertical) {
      const top = a.y < b.y ? a : b, bot = a.y < b.y ? b : a;
      const my = Math.round((top.y + top.h + bot.y) / 2);
      for (let x = 0; x < W; x += 8) { rect(g, x, my - 1, 4, 2, C.brass1); rect(g, x + 4, my - 1, 4, 2, C.soil0); }
    } else {
      const lf = a.x < b.x ? a : b, rt = a.x < b.x ? b : a;
      const mx = Math.round((lf.x + lf.w + rt.x) / 2);
      for (let y = 0; y < H; y += 8) { rect(g, mx - 1, y, 2, 4, C.brass1); rect(g, mx - 1, y + 4, 2, 4, C.soil0); }
    }
  }
  if (s.pad) hazardPad(g, s.pad);
  // guard rails on the long edges
  if (s.vertical) {
    for (const x of [1, W - 4]) {
      rect(g, x, 0, 3, H, C.ink);
      rect(g, x + 1, 0, 1, H, C.steel2);
      for (let y = 6; y < H; y += 22) { rect(g, x - 1, y, 5, 4, C.ink); rect(g, x, y + 1, 3, 2, C.steel1); }
    }
  } else {
    for (const y of [1, H - 4]) {
      rect(g, 0, y, W, 3, C.ink);
      rect(g, 0, y + 1, W, 1, C.steel2);
      for (let x = 6; x < W; x += 22) { rect(g, x, y - 1, 4, 5, C.ink); rect(g, x + 1, y, 2, 3, C.steel1); }
    }
  }
  // vignette
  const band = Math.max(10, Math.round(Math.min(W, H) * 0.12));
  for (let i = 0; i < band; i++) {
    const dens = (1 - i / band) * 0.75;
    dither(g, i, 0, 1, H, C.ink, dens);
    dither(g, W - 1 - i, 0, 1, H, C.ink, dens);
    dither(g, 0, i, W, 1, C.ink, dens);
    dither(g, 0, H - 1 - i, W, 1, C.ink, dens);
  }
  return c;
}

function hazardPad(g: G, p: Box): void {
  const x = Math.round(p.x), y = Math.round(p.y), w = Math.round(p.w), h = Math.round(p.h);
  dither(g, x, y, w, h, C.soil2, 0.5);
  for (let i = 0; i < w; i++) {
    const on = ((i >> 2) & 1) === 0;
    rect(g, x + i, y, 1, 2, on ? C.brass1 : C.ink);
    rect(g, x + i, y + h - 2, 1, 2, on ? C.brass1 : C.ink);
  }
  for (let j = 0; j < h; j++) {
    const on = ((j >> 2) & 1) === 0;
    rect(g, x, y + j, 2, 1, on ? C.brass1 : C.ink);
    rect(g, x + w - 2, y + j, 2, 1, on ? C.brass1 : C.ink);
  }
}

export class ArenaBg {
  private cv: HTMLCanvasElement | null = null;
  private key = -1;
  private readonly mx = new Float32Array(16);
  private readonly my = new Float32Array(16);

  draw(g: G, W: number, H: number, spec: BgSpec, t: number, ox = 0, oy = 0): void {
    // numeric layout key (no per-frame string building)
    let k = W * 7919 + H * 104729 + (spec.vertical ? 13 : 0) + (spec.gapLine ? 29 : 0);
    for (let i = 0; i < spec.hulls.length; i++) k = (k * 31 + spec.hulls[i].x * 17 + spec.hulls[i].y * 23) % 2147483647;
    if (spec.pad) k = (k * 37 + spec.pad.x * 3 + spec.pad.y * 5 + spec.pad.w * 7 + spec.pad.h * 11) % 2147483647;
    if (k !== this.key || !this.cv) {
      this.key = k;
      this.cv = buildLayer(W, H, spec);
      for (let i = 0; i < this.mx.length; i++) {
        this.mx[i] = cellNoise(i, 5, 3) * W;
        this.my[i] = cellNoise(i, 6, 3) * H;
      }
    }
    g.drawImage(this.cv, ox, oy);
    // ambient dust motes: slow drift, blinking in and out
    for (let i = 0; i < this.mx.length; i++) {
      const x = (this.mx[i] + t * (3 + (i % 4))) % W;
      const y = (this.my[i] + Math.sin(t * 0.7 + i) * 4 + H) % H;
      if (Math.floor(t * 2 + i * 0.37) % 3 === 0) continue;
      rect(g, Math.round(x + ox), Math.round(y + oy), 1, 1, i % 3 ? C.soil4 : C.soil5);
    }
  }
}
