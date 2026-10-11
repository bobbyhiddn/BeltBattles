// PAIR-CUE (REQ-BFG-100) test helpers (not a test file): a recording 2D context and a stand-in `document`, as
// tests/wind2.test.ts's (node has no canvas). Each fillRect with its colour and alpha, each drawImage of a recorded canvas
// (its own fills: the glyphs) at its place, each setTransform, in one ordered list per canvas; every other call a no-op.
import type { G } from "../src/render/pixel";

export interface Fill { x: number; y: number; w: number; h: number; fill: string; alpha: number }
export interface Img { img: FakeCanvas; x: number; y: number; alpha: number }
export type Op = { op: "fill"; f: Fill } | { op: "img"; d: Img } | { op: "tf"; m: number[] };
export interface FakeCanvas { width: number; height: number; fills: Fill[]; imgs: Img[]; ops: Op[]; getContext: () => G }

export function fakeCanvas(): FakeCanvas {
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

/** Install a stand-in `document` whose canvases record; returns the restore. */
export function fakeDom(): () => void {
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { createElement: () => fakeCanvas() };
  return () => { doc.document = prev; };
}

/** An image draw paints this colour (one of its canvas's fills). */
export const paints = (d: Img, c: string): boolean => d.img.fills.some((f) => f.fill === c);
