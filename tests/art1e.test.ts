// ART-1E (REQ-BFG-098; BRIEF-ART1E step 3): the own art of the seven new scaling rigs (src/render/scaleArt.ts: CINDER MAIL, ROT
// GAUGE, LEECH COIL, CROWD PRESS, AEGIS SPIKE, GRUDGE ROD, TROPHY CHAIN), which SCALE-2c drew as a live rig's picture. Node has no
// canvas, so the render entry points draw here into the software raster of tests/wave3Art.test.ts (fillRect, drawImage with the
// 90-degree turns and flips the sprites use, source-in compositing, getImageData), which records every pixel's colour by name and
// counts any paint that falls outside its canvas. The seven ids are in ITEMS only with SCALE_RIGS on, so the world they are read
// in is withScaleRigs(fn), synchronously only (never withScaleRigs(async ...): SCALE-2e F6). The pixels themselves are shown on
// the sheet (scripts/art1e/sheet.ts) and in Chromium on the shop cards and the tap panel (the REPORT's stills).
// BUMP-1E: the switch ships ON (bb-0.12.0), so the seven are in ITEMS as shipped; the "absent with it off" half asks for the 0.9.11 world
// with withScaleRigs(fn, false) (synchronously only).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setArtB } from "../src/render/artB";
import { C } from "../src/render/palette";
import * as sprites from "../src/render/sprites";
import { gateSprite, itemIcon } from "../src/render/sprites";
import { SCALE_ART_IDS, drawScaleGate } from "../src/render/scaleArt";
import { ITEMS } from "../src/sim/content";
import { SCALE_IDS, SCALE_RIGS, withScaleRigs } from "../src/sim/scale";

// ------------------------------------------------------------------------------------------------- a software raster

type Pix = string | null;

class RasterCanvas {
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

class RasterContext {
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

(globalThis as unknown as { document: unknown }).document = { createElement: () => new RasterCanvas() };
const R = (c: HTMLCanvasElement | null | undefined): RasterCanvas => c as unknown as RasterCanvas;
const G = (c: RasterCanvas): CanvasRenderingContext2D => c.getContext() as unknown as CanvasRenderingContext2D;
const fresh = (w: number, h: number): RasterCanvas => { const c = new RasterCanvas(); c.width = w; c.height = h; return c; };

const PALETTE = new Set<string>(Object.values(C));
const sig = (c: RasterCanvas): string => c.px.map((p) => p ?? "-").join(",");
const mask = (c: RasterCanvas): string => c.px.map((p) => (p === null ? "0" : "1")).join("");
const opaque = (c: RasterCanvas): number => c.px.filter((p) => p !== null).length;
const colours = (c: RasterCanvas): Set<string> => new Set(c.px.filter((p): p is string => p !== null));

/** Not empty, every paint inside the canvas, palette colours only. */
function wellDrawn(c: RasterCanvas, w: number, h: number, min: number, what: string): void {
  expect([c.width, c.height], what).toEqual([w, h]);
  expect(c.oob, `${what} paints outside its cell`).toBe(0);
  expect(opaque(c), `${what} is nearly empty`).toBeGreaterThanOrEqual(min);
  for (const col of colours(c)) expect(PALETTE.has(col), `${what}: ${col} is not a palette colour`).toBe(true);
}

/** The opaque cells in the square x, y = lo .. hi (inclusive). */
function within(c: RasterCanvas, lo: number, hi: number): number {
  let n = 0;
  for (let y = lo; y <= hi; y++) for (let x = lo; x <= hi; x++) if (c.at(x, y) !== null) n++;
  return n;
}

/** How bright a picture is: the sum of its opaque pixels' luminance (Rec. 709 weights on the sRGB bytes). */
function light(c: RasterCanvas): number {
  let s = 0;
  for (const p of c.px) {
    if (p === null) continue;
    const [r, g, b] = hexRGBA(p);
    s += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return s;
}

/** Silhouette overlap: the cells opaque in both over the cells opaque in either (1 = the same shape). */
function iou(a: RasterCanvas, b: RasterCanvas): number {
  let both = 0, either = 0;
  for (let k = 0; k < a.px.length; k++) {
    const x = a.px[k] !== null, y = b.px[k] !== null;
    if (x && y) both++;
    if (x || y) either++;
  }
  return either ? both / either : 0;
}

/** The most a new rig's silhouette may overlap another rig's (the nearest today is 0.77: CINDER MAIL and IRON WALL). */
const MAX_IOU = 0.85;

// ARTB-CODE-3A (REQ-BFG-126), old -> new: art direction B now draws these seven rigs (CINDER MAIL, ROT GAUGE, LEECH COIL, CROWD PRESS, AEGIS SPIKE, GRUDGE ROD, TROPHY CHAIN: board/<id> and card/<id> of the 34 new rigs, batches 4a and 4b),
// so gateSprite and itemIcon answer art B's sprite with the switch on (a still idle picture with two work phases, not scaleArt.ts's moving one). Two asserts went red on that data: "the art moves: at least two idle frames differ"
// (CINDER MAIL: 1 idle picture) and "no rig's silhouette is near another rig's" (CROWD PRESS and TEMPER: 0.866, the bar 0.85). This file pins the BASE drawing (src/render/scaleArt.ts, the VITE_ARTB=0 path), so it runs with the switch
// off, every assert as it was; art B's pictures of the same ids are pinned in tests/artb3.board.test.ts.
beforeAll(() => setArtB(false));
afterAll(() => setArtB(true));

// ======================================================================================================= the seven rigs

describe("ART-1E: the seven new scaling rigs' own art (REQ-BFG-098)", () => {
  it("the seven ids are the SCALE_IDS in order: gates in ITEMS with SCALE_RIGS on (it ships on, BUMP-1E), absent with it off", () => {
    expect([...SCALE_ART_IDS]).toEqual([...SCALE_IDS]);
    expect(SCALE_ART_IDS).toHaveLength(7);
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the switch ships on (bb-0.12.0; was off, and the next line was read bare)
    // BUMP-1E: the switch ships ON, so "with the switch off" is the 0.9.11 world, asked for outright (withScaleRigs(fn, false), synchronously)
    withScaleRigs(() => {
      for (const id of SCALE_ART_IDS) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), `${id} with the switch off`).toBe(false);
    }, false);
    for (const id of SCALE_ART_IDS) expect(ITEMS[id]?.kind, `${id} as shipped`).toBe("gate"); // BUMP-1E: and as shipped the seven are in ITEMS, bare
    withScaleRigs(() => {
      for (const id of SCALE_ART_IDS) expect(ITEMS[id]?.kind, id).toBe("gate");
    });
  });

  it("the stand-in map is gone from sprites.ts: nothing draws another rig's picture for a new id", () => {
    expect("SCALE_ART_FROM" in sprites).toBe(false);
  });

  it("every rig draws through gateSprite (12x12) at frames 0-7, idle and active: not empty, inside its cell, palette only, its middle drawn", () => {
    for (const id of SCALE_ART_IDS) for (let f = 0; f < 8; f++) for (const active of [false, true]) {
      const c = R(gateSprite(id, f, active));
      const what = `${id} frame ${f}${active ? " active" : ""}`;
      wellDrawn(c, 12, 12, 50, what);
      // the identity sits in the middle (the card's marks cover only the outer ring): most of the middle 6x6 and 8x8 is drawn
      expect(within(c, 3, 8), `${what}: its middle 6x6 is mostly empty`).toBeGreaterThanOrEqual(26);
      expect(within(c, 2, 9), `${what}: its middle 8x8 is mostly empty`).toBeGreaterThanOrEqual(40);
    }
  });

  it("a rig's icon is its idle frame 0, as every rig's (itemIcon's default branch): shop card, cargo, scout deck, tap panel", () => {
    for (const id of SCALE_ART_IDS) {
      wellDrawn(R(itemIcon(id)), 12, 12, 50, `${id} icon`);
      expect(sig(R(itemIcon(id))), id).toBe(sig(R(gateSprite(id, 0, false))));
    }
  });

  it("the art moves: at least two idle frames differ; a hit (active) differs from idle at every frame, by brighter colour and not by a different silhouette", () => {
    for (const id of SCALE_ART_IDS) {
      const idle = Array.from({ length: 8 }, (_, f) => R(gateSprite(id, f, false)));
      expect(new Set(idle.map(sig)).size, `${id} idle frames`).toBeGreaterThanOrEqual(2);
      for (let f = 0; f < 8; f++) {
        const hit = R(gateSprite(id, f, true));
        expect(sig(hit), `${id} frame ${f}: active is idle`).not.toBe(sig(idle[f]));
        expect(mask(hit), `${id} frame ${f}: active has another silhouette than idle`).toBe(mask(idle[f]));
        expect(light(hit), `${id} frame ${f}: active is not brighter than idle`).toBeGreaterThan(light(idle[f]));
      }
    }
  });

  it("each icon differs from every other part's icon in ITEMS (SCALE_RIGS on) and from the other six; no rig's silhouette is its own or near another rig's", () => {
    withScaleRigs(() => {
      const defs = Object.values(ITEMS);
      expect(defs.length).toBeGreaterThan(100);
      for (const id of SCALE_ART_IDS) {
        const mine = R(itemIcon(id));
        for (const d of defs) {
          if (d.id === id) continue;
          const other = R(itemIcon(d.id));
          expect(sig(other), `${id}'s icon is ${d.id}'s`).not.toBe(sig(mine));
          if (d.kind !== "gate") continue;
          expect(mask(other), `${id}'s silhouette is ${d.id}'s`).not.toBe(mask(mine));
          expect(iou(mine, other), `${id}'s silhouette is near ${d.id}'s`).toBeLessThan(MAX_IOU);
        }
      }
    });
  });

  it("the hook answers for the seven only: any other id gets false and no paint", () => {
    for (const id of SCALE_ART_IDS) {
      const c = fresh(12, 12);
      expect(drawScaleGate(G(c), id, 0, false), id).toBe(true);
      expect(opaque(c), id).toBeGreaterThan(0);
    }
    withScaleRigs(() => {
      for (const id of [...Object.keys(ITEMS).filter((k) => !(SCALE_ART_IDS as readonly string[]).includes(k)), "zz-none", "constructor", "toString", "hasOwnProperty", "__proto__"]) {
        const c = fresh(12, 12);
        expect(drawScaleGate(G(c), id, 0, false), id).toBe(false);
        expect(opaque(c), `${id}: painted anyway`).toBe(0);
      }
    });
  });

  it("an out-of-range frame number turns round (frame 8 is 0, -1 is 7), as gateSprite's does", () => {
    for (const id of SCALE_ART_IDS) {
      const at = (f: number, active: boolean): string => { const c = fresh(12, 12); drawScaleGate(G(c), id, f, active); return sig(c); };
      for (const active of [false, true]) {
        expect(at(8, active), id).toBe(at(0, active));
        expect(at(-1, active), id).toBe(at(7, active));
      }
    }
  });

  it("GRUDGE ROD draws red tally notches and no heart (font.ts ICON.HULL is the run bar's heart, and it read as hull lost)", () => {
    const c = R(gateSprite("grudgerod", 0, false));
    const reds = c.px.filter((p) => p === C.red || p === C.fire1 || p === C.fire0).length;
    expect(reds, "its notches").toBeGreaterThanOrEqual(3);
    // no heart: the run bar's heart (sprites.ts heartIcon) is a 5 px wide blob of red; no row of this rod has 3 red in a row
    for (let y = 0; y < 12; y++) {
      let run = 0, worst = 0;
      for (let x = 0; x < 12; x++) { run = c.at(x, y) === C.red ? run + 1 : 0; worst = Math.max(worst, run); }
      expect(worst, `row ${y}`).toBeLessThan(3);
    }
  });
});
