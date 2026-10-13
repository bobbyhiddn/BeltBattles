// PERF-1 (REQ-BFG-080, REVIEW-STAGE099 F1): the build screen draws only what changed. ZOOM-1 put the build screen on a
// canvas sub x sub times 0.9.8's pixels (game/viewGrid.ts: sub 5 on the 402x690 and 390x844 phones), and Chromium plays
// every draw of a frame into that backing store on the page's main thread before it composites (a software canvas in a
// headless page: about 15 ms a frame at cpu x4 on the 390x844 phone, against 1 ms at 0.9.8's size), so the build screen
// at x4 drew at 35-52 fps where 0.9.8 held 60. The game's own script was never the cost (2 ms).
//
// So a retained screen's frame (Screen.retain: the build screen) is recorded, not drawn: Retained.begin hands the screen
// a recorder in the 2D context's place, which keeps every call in order and, for each draw, everything in force that
// makes its pixels (the transform, globalAlpha, the fill style, image smoothing, every other property set, the clips,
// and for a sprite its draw count: render/pixel.ts canvasVersion). Retained.end compares the frame's draws with the last
// frame's, one by one:
//  - every draw the same: nothing is drawn (the canvas already holds this picture);
//  - else the whole frame is played onto the canvas, clipped to the boxes (device px) that its changed draws cover,
//    where they were and where they are, so the browser rasterises only those boxes;
//  - a changed draw the recorder can't bound (a path's fill or stroke, text, putImageData, a blend other than
//    source-over, a shadow or a filter), a frame whose changed boxes cover most of the canvas, the first frame, a resize
//    or a screen change: the whole frame is played unclipped, exactly as before.
// A query mid-frame (getImageData, measureText, isPointInPath, ...) plays what is recorded and the rest of the frame
// draws directly. Every frame ends with the canvas's state as the frame left it. Nothing in the picture changes: the
// same calls reach the canvas in the same order with the same state, and the pixels outside the clip are the last
// frame's, which those same draws (the unchanged ones, in the same order) made.

import { canvasVersion } from "../render/pixel";
import type { G } from "../render/pixel";

/** A box in device px: x0, y0, x1, y1 (x1 and y1 past the box). */
export type Box = [number, number, number, number];
type Mat = readonly number[];

/** One recorded call: a method with its arguments (a), or a property set (a null, v the value). */
interface Call { m: string; a: unknown[] | null; v: unknown }

/** One draw, with everything in force that makes its pixels. */
export interface Draw {
  m: string;
  a: unknown[];
  /** drawImage: its source's draw count (pixel.ts canvasVersion); else 0. */
  ver: number;
  t: Mat;
  alpha: unknown;
  fill: unknown;
  smooth: unknown;
  misc: string;
  clip: string;
  /** fill, stroke and clip: the path; else "". */
  path: string;
  /** Device px it can touch; null: unbounded (a frame where it changes plays whole). */
  box: Box | null;
}

/** The state in force (immutable: a change makes a new level). */
interface Level {
  t: Mat;
  alpha: unknown;
  fill: unknown;
  smooth: unknown;
  /** Every other property, as the canvas holds it. */
  misc: Readonly<Record<string, unknown>>;
  miscKey: string;
  /** A blend other than source-over, a shadow or a filter: no draw is bounded. */
  wild: boolean;
  clip: string;
}

const HOT = new Set(["globalAlpha", "fillStyle", "imageSmoothingEnabled"]);
/** Methods that change only the state or the path: played, never compared themselves (each draw carries their effect). */
const STATE = new Set(["save", "restore", "translate", "scale", "rotate", "transform", "setTransform", "resetTransform",
  "beginPath", "closePath", "moveTo", "lineTo", "rect", "roundRect", "arc", "arcTo", "ellipse", "quadraticCurveTo",
  "bezierCurveTo", "clip", "setLineDash"]);
const PATH = new Set(["closePath", "moveTo", "lineTo", "rect", "roundRect", "arc", "arcTo", "ellipse", "quadraticCurveTo", "bezierCurveTo"]);
/** Methods that draw. fillRect, clearRect and drawImage have a box; the others play their frame whole when they change. */
const DRAWS = new Set(["fillRect", "clearRect", "strokeRect", "drawImage", "fill", "stroke", "fillText", "strokeText",
  "putImageData", "drawFocusIfNeeded"]);
/** Methods that make an object and change nothing on the canvas: they go to the canvas's own context. */
const MAKERS = new Set(["createLinearGradient", "createRadialGradient", "createConicGradient", "createPattern",
  "createImageData", "getContextAttributes", "isContextLost"]);
/** The 2D context's members when there is no CanvasRenderingContext2D to read them from (the unit tests). */
const METHODS0 = [...STATE, ...DRAWS, ...MAKERS, "getImageData", "getTransform", "measureText", "isPointInPath",
  "isPointInStroke", "getLineDash", "reset"];
const PROPS0 = ["globalAlpha", "fillStyle", "imageSmoothingEnabled", "globalCompositeOperation", "strokeStyle", "lineWidth",
  "lineCap", "lineJoin", "miterLimit", "lineDashOffset", "font", "textAlign", "textBaseline", "direction", "shadowBlur",
  "shadowColor", "shadowOffsetX", "shadowOffsetY", "filter", "imageSmoothingQuality"];

/** The 2D context's methods and settable properties (CanvasRenderingContext2D.prototype in a page). */
function members(): { methods: string[]; props: string[] } {
  const P = (globalThis as { CanvasRenderingContext2D?: { prototype: object } }).CanvasRenderingContext2D?.prototype;
  if (!P) return { methods: METHODS0, props: PROPS0 };
  const methods: string[] = [], props: string[] = [];
  for (const n of Object.getOwnPropertyNames(P)) {
    if (n === "constructor" || n === "canvas") continue;
    const d = Object.getOwnPropertyDescriptor(P, n)!;
    if (typeof d.value === "function") methods.push(n);
    else if (d.set) props.push(n);
  }
  return { methods, props };
}

const mul = (m: Mat, a: number, b: number, c: number, d: number, e: number, f: number): number[] => [
  m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5],
];

/** The device-px box a w x h rect at (x, y) covers under t, one px wider on each side; null when not finite. */
export function rectBox(t: Mat, x: number, y: number, w: number, h: number): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const px of [+x, +x + +w]) {
    for (const py of [+y, +y + +h]) {
      const X = t[0] * px + t[2] * py + t[4], Y = t[1] * px + t[3] * py + t[5];
      if (X < x0) x0 = X;
      if (X > x1) x1 = X;
      if (Y < y0) y0 = Y;
      if (Y > y1) y1 = Y;
    }
  }
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(y0) || !Number.isFinite(y1)) return null;
  return [Math.floor(x0) - 1, Math.floor(y0) - 1, Math.ceil(x1) + 1, Math.ceil(y1) + 1];
}

/** drawImage's destination box (its 3-, 5- and 9-argument forms); null for any other. */
function imageBox(t: Mat, a: unknown[]): Box | null {
  const img = a[0] as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | null;
  if (!img) return null;
  const n = a as number[];
  if (a.length === 3) return rectBox(t, n[1], n[2], img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
  if (a.length === 5) return rectBox(t, n[1], n[2], n[3], n[4]);
  if (a.length === 9) return rectBox(t, n[5], n[6], n[7], n[8]);
  return null;
}

function sameDraw(p: Draw, q: Draw): boolean {
  if (p.m !== q.m || p.ver !== q.ver || p.alpha !== q.alpha || p.fill !== q.fill || p.smooth !== q.smooth || p.misc !== q.misc
    || p.clip !== q.clip || p.path !== q.path || p.a.length !== q.a.length) return false;
  if (p.t !== q.t) for (let i = 0; i < 6; i++) if (p.t[i] !== q.t[i]) return false;
  for (let i = 0; i < p.a.length; i++) if (p.a[i] !== q.a[i]) return false;
  return true;
}

/** Boxes that touch or overlap made one; clamped to the W x H canvas (empty ones dropped). */
export function mergeBoxes(boxes: Box[], W: number, H: number): Box[] {
  let out: Box[] = [];
  for (const b of boxes) {
    const c: Box = [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(W, b[2]), Math.min(H, b[3])];
    if (c[2] > c[0] && c[3] > c[1]) out.push(c);
  }
  if (out.length > 64) {
    const u = out.reduce((s, b): Box => [Math.min(s[0], b[0]), Math.min(s[1], b[1]), Math.max(s[2], b[2]), Math.max(s[3], b[3])]);
    return [u];
  }
  for (let merged = true; merged;) {
    merged = false;
    const next: Box[] = [];
    for (const b of out) {
      const o = next.find((c) => b[0] <= c[2] && c[0] <= b[2] && b[1] <= c[3] && c[1] <= b[3]);
      if (o) {
        o[0] = Math.min(o[0], b[0]); o[1] = Math.min(o[1], b[1]); o[2] = Math.max(o[2], b[2]); o[3] = Math.max(o[3], b[3]);
        merged = true;
      } else next.push([b[0], b[1], b[2], b[3]]);
    }
    out = next;
  }
  return out;
}

/** What changed between two frames' draws: null (nothing), "all" (play it whole) or the boxes to play it in. Draws are
 *  matched in order (index by index where the counts agree, else the common head and tail), so a pixel outside every
 *  unmatched draw's box is made by the same draws in the same order in both frames. */
export function changedBoxes(prev: Draw[], cur: Draw[]): Box[] | "all" | null {
  const out: Box[] = [];
  const add = (d: Draw): boolean => {
    if (!d.box) return false;
    out.push(d.box);
    return true;
  };
  const n = prev.length, m = cur.length;
  if (n === m) {
    for (let i = 0; i < n; i++) if (!sameDraw(prev[i], cur[i]) && (!add(prev[i]) || !add(cur[i]))) return "all";
  } else {
    let p = 0;
    while (p < n && p < m && sameDraw(prev[p], cur[p])) p++;
    let s = 0;
    while (s < n - p && s < m - p && sameDraw(prev[n - 1 - s], cur[m - 1 - s])) s++;
    for (let i = p; i < n - s; i++) if (!add(prev[i])) return "all";
    for (let i = p; i < m - s; i++) if (!add(cur[i])) return "all";
  }
  return out.length ? out : null;
}

/** A frame's boxes past this share of the canvas play it whole (the clip would save little). */
const WHOLE_SHARE = 0.6;

export interface RetainStats {
  /** Frames played whole, played in boxes, not drawn (the same picture), and drawn directly after a query. */
  whole: number;
  part: number;
  still: number;
  direct: number;
  /** The share of the canvas the boxes covered, summed over the frames played in boxes. */
  area: number;
  /** The last frame's boxes (device px; [] when it was not drawn, null when it was played whole). */
  last: Box[] | null;
}

export class Retained {
  /** Tooling (motionperf, the frame checks; never read by the game). */
  readonly stats: RetainStats = { whole: 0, part: 0, still: 0, direct: 0, area: 0, last: null };
  /** Tooling: draw directly every frame, as before PERF-1 (the frame checks compare the two ways). */
  off = false;
  /** The recorder handed out in the context's place. */
  readonly ctx: G;
  private real: G | null = null;
  private scratch: CanvasRenderingContext2D | null | undefined;
  private readonly props: string[];
  private calls: Call[] = [];
  private draws: Draw[] = [];
  private prev: Draw[] | null = null;
  private valid = false;
  private w = -1;
  private h = -1;
  private lv!: Level;
  private init!: Level;
  private stack: Level[] = [];
  private path = "";
  /** This frame drew with a path it didn't begin, or clipped outside a save: it plays whole. */
  private wildFrame = false;
  /** Between begin and end: record; else (or after a query) every call goes to the canvas. */
  private recording = false;
  private direct = false;
  private appliedMisc: Readonly<Record<string, unknown>> | null = null;

  constructor() {
    const { methods, props } = members();
    this.props = props;
    const rec: Record<string, unknown> = {};
    for (const m of methods) rec[m] = (...a: unknown[]): unknown => this.call(m, a);
    for (const p of props) Object.defineProperty(rec, p, { get: () => this.get(p), set: (v: unknown) => this.set(p, v), enumerable: true });
    Object.defineProperty(rec, "canvas", { get: () => this.real?.canvas });
    this.ctx = rec as unknown as G;
  }

  /** The canvas changed outside the recorder (a resize, a screen that draws directly): the next frame plays whole. */
  invalidate(): void {
    this.valid = false;
  }

  /** Start a frame on `real`: returns the recorder to draw with. */
  begin(real: G): G {
    if (this.real !== real || real.canvas.width !== this.w || real.canvas.height !== this.h) this.valid = false;
    this.real = real;
    if (!this.valid) {
      this.prev = null;
      this.stack = [];
      this.path = "";
      this.lv = this.readLevel(real);
      this.appliedMisc = this.lv.misc;
      this.valid = true;
    }
    this.init = this.lv;
    this.calls = [];
    this.draws = [];
    this.wildFrame = false;
    this.pathBegun = false;
    this.direct = false;
    this.recording = true;
    return this.ctx;
  }

  /** End the frame: draw what changed (see the head of this file). */
  end(): void {
    const real = this.real!;
    this.recording = false;
    if (this.direct) {
      this.direct = false;
      this.stats.direct++;
      this.stats.last = null;
      this.valid = false;
      return;
    }
    const W = real.canvas.width, H = real.canvas.height;
    let boxes: Box[] | "all" | null = "all";
    if (this.prev && !this.wildFrame && this.stack.length === 0) {
      boxes = changedBoxes(this.prev, this.draws);
      if (boxes && boxes !== "all") {
        boxes = mergeBoxes(boxes, W, H);
        const area = boxes.reduce((s, b) => s + (b[2] - b[0]) * (b[3] - b[1]), 0) / Math.max(1, W * H);
        if (area > WHOLE_SHARE) boxes = "all";
        else if (!boxes.length) boxes = null;
        else this.stats.area += area;
      }
    }
    if (boxes === null) {
      this.stats.still++;
      this.stats.last = [];
    } else if (boxes === "all") {
      this.stats.whole++;
      this.stats.last = null;
      this.applyLevel(real, this.init);
      this.play(real);
    } else {
      this.stats.part++;
      this.stats.last = boxes;
      real.save();
      real.setTransform(1, 0, 0, 1, 0, 0);
      real.beginPath();
      for (const b of boxes) real.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      real.clip();
      real.beginPath();
      this.appliedMisc = null; // inside the save: the restore undoes what applyLevel sets
      this.applyLevel(real, this.init);
      this.play(real);
      real.restore();
      this.appliedMisc = null;
    }
    // the canvas's state as the frame left it (a still frame's trailing sets included)
    this.applyLevel(real, this.lv);
    if (this.stack.length) this.valid = false; // an unbalanced save: start over next frame
    this.prev = this.draws;
    this.draws = [];
    this.calls = [];
    this.w = W;
    this.h = H;
  }

  // ------------------------------------------------------------------ the recorder

  private call(m: string, a: unknown[]): unknown {
    const real = this.real;
    if (!this.recording || this.direct) {
      if (!real) return undefined;
      if (this.recording === false && DRAWS.has(m)) this.valid = false; // a draw outside a frame: the next plays whole
      return (real as unknown as Record<string, (...x: unknown[]) => unknown>)[m](...a);
    }
    if (DRAWS.has(m)) {
      this.draw(m, a);
      this.calls.push({ m, a, v: null });
      return undefined;
    }
    if (STATE.has(m)) {
      this.state(m, a);
      this.calls.push({ m, a, v: null });
      return undefined;
    }
    if (m === "getTransform" && typeof DOMMatrix !== "undefined") return new DOMMatrix(this.lv.t as number[]);
    if (MAKERS.has(m)) return (real as unknown as Record<string, (...x: unknown[]) => unknown>)[m](...a);
    // a query that reads the canvas or the state in full (getImageData, measureText, isPointInPath, ...), or a call the
    // recorder doesn't know: play what is recorded, then draw the rest of the frame directly
    this.goDirect();
    return (real as unknown as Record<string, (...x: unknown[]) => unknown>)[m](...a);
  }

  private get(p: string): unknown {
    if (!this.recording || this.direct || !this.lv) return (this.real as unknown as Record<string, unknown> | null)?.[p];
    if (p === "globalAlpha") return this.lv.alpha;
    if (p === "fillStyle") return this.lv.fill;
    if (p === "imageSmoothingEnabled") return this.lv.smooth;
    return p in this.lv.misc ? this.lv.misc[p] : (this.real as unknown as Record<string, unknown>)[p];
  }

  private set(p: string, v: unknown): void {
    if (!this.recording || this.direct) {
      if (this.real) (this.real as unknown as Record<string, unknown>)[p] = v;
      if (!this.recording) this.valid = false;
      return;
    }
    this.calls.push({ m: p, a: null, v });
    const eff = this.held(p, v);
    const lv = this.lv;
    if (p === "globalAlpha") { if (eff !== lv.alpha) this.lv = { ...lv, alpha: eff }; }
    else if (p === "fillStyle") { if (eff !== lv.fill) this.lv = { ...lv, fill: eff }; }
    else if (p === "imageSmoothingEnabled") { if (eff !== lv.smooth) this.lv = { ...lv, smooth: eff }; }
    else if (lv.misc[p] !== eff) this.lv = this.withMisc(lv, { ...lv.misc, [p]: eff });
  }

  /** What the canvas holds after `p = v` from the value in force (an invalid value is ignored, as the canvas does):
   *  read back from a 1 px scratch context (none outside a page: the value as given). */
  private held(p: string, v: unknown): unknown {
    if (this.scratch === undefined) {
      const doc = (globalThis as { document?: Document }).document;
      const c = doc?.createElement("canvas");
      if (c) { c.width = 1; c.height = 1; }
      this.scratch = c?.getContext("2d") ?? null;
    }
    const s = this.scratch as unknown as Record<string, unknown> | null;
    if (!s) return v;
    s[p] = this.get(p);
    s[p] = v;
    return s[p];
  }

  private withMisc(lv: Level, misc: Record<string, unknown>): Level {
    const shadow = (Number(misc.shadowBlur) || 0) !== 0 || (Number(misc.shadowOffsetX) || 0) !== 0 || (Number(misc.shadowOffsetY) || 0) !== 0;
    const wild = (misc.globalCompositeOperation ?? "source-over") !== "source-over" || (misc.filter ?? "none") !== "none" || shadow;
    let key = "";
    for (const k of Object.keys(misc).sort()) key += `${k}=${String(misc[k])};`;
    return { ...lv, misc, miscKey: key, wild };
  }

  private readLevel(real: G): Level {
    const r = real as unknown as Record<string, unknown>;
    const m = real.getTransform?.();
    const t = m ? [m.a, m.b, m.c, m.d, m.e, m.f] : [1, 0, 0, 1, 0, 0];
    const misc: Record<string, unknown> = {};
    for (const p of this.props) if (!HOT.has(p) && p in r) misc[p] = r[p];
    return this.withMisc({ t, alpha: r.globalAlpha, fill: r.fillStyle, smooth: r.imageSmoothingEnabled, misc: {}, miscKey: "", wild: false, clip: "" }, misc);
  }

  /** Put `lv` on the canvas: its transform and properties (the less common ones only when they changed). */
  private applyLevel(real: G, lv: Level): void {
    const t = lv.t;
    real.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
    const r = real as unknown as Record<string, unknown>;
    r.globalAlpha = lv.alpha;
    r.fillStyle = lv.fill;
    r.imageSmoothingEnabled = lv.smooth;
    if (this.appliedMisc !== lv.misc) {
      for (const k of Object.keys(lv.misc)) {
        if (k === "lineDash") real.setLineDash(JSON.parse(String(lv.misc[k])) as number[]);
        else if (r[k] !== lv.misc[k]) r[k] = lv.misc[k];
      }
      this.appliedMisc = lv.misc;
    }
  }

  private play(real: G): void {
    const r = real as unknown as Record<string, unknown>;
    for (const c of this.calls) {
      if (c.a) (r[c.m] as (...x: unknown[]) => unknown).apply(real, c.a);
      else r[c.m] = c.v;
    }
  }

  /** A query mid-frame: what is recorded is played whole, and the rest of the frame draws on the canvas directly. */
  private goDirect(): void {
    const real = this.real!;
    this.applyLevel(real, this.init);
    this.play(real);
    this.calls = [];
    this.direct = true;
  }

  private draw(m: string, a: unknown[]): void {
    const lv = this.lv;
    let box: Box | null = null, ver = 0, path = "";
    if (m === "drawImage") {
      ver = canvasVersion(a[0]);
      if (!lv.wild) box = imageBox(lv.t, a);
    } else if (m === "fillRect" || m === "clearRect") {
      if (!lv.wild) box = rectBox(lv.t, a[0] as number, a[1] as number, a[2] as number, a[3] as number);
    } else if (m === "fill" || m === "stroke" || m === "drawFocusIfNeeded") {
      path = this.path;
      // the last frame's path (no beginPath yet this frame): the clipped play begins a new one, so play this frame whole
      if (!this.pathBegun && !(typeof a[0] === "object" && a[0] !== null)) this.wildFrame = true;
    } else if (m === "putImageData") this.wildFrame = true; // it ignores the clip: play the frame whole
    this.draws.push({
      m, a, ver, t: lv.t, alpha: lv.alpha, fill: m === "drawImage" ? null : lv.fill, smooth: m === "drawImage" ? lv.smooth : null,
      misc: lv.miscKey, clip: lv.clip, path, box,
    });
  }

  private state(m: string, a: unknown[]): void {
    const lv = this.lv;
    const n = a as number[];
    switch (m) {
      case "save": this.stack.push(lv); return;
      case "restore": if (this.stack.length) this.lv = this.stack.pop()!; return;
      case "translate": this.lv = { ...lv, t: mul(lv.t, 1, 0, 0, 1, +n[0], +n[1]) }; return;
      case "scale": this.lv = { ...lv, t: mul(lv.t, +n[0], 0, 0, +n[1], 0, 0) }; return;
      case "rotate": { const c = Math.cos(+n[0]), s = Math.sin(+n[0]); this.lv = { ...lv, t: mul(lv.t, c, s, -s, c, 0, 0) }; return; }
      case "transform": this.lv = { ...lv, t: mul(lv.t, +n[0], +n[1], +n[2], +n[3], +n[4], +n[5]) }; return;
      case "resetTransform": this.lv = { ...lv, t: [1, 0, 0, 1, 0, 0] }; return;
      case "setTransform": {
        if (a.length >= 6) this.lv = { ...lv, t: [+n[0], +n[1], +n[2], +n[3], +n[4], +n[5]] };
        else {
          const o = (a[0] ?? {}) as Record<string, number | undefined>;
          this.lv = { ...lv, t: [o.a ?? o.m11 ?? 1, o.b ?? o.m12 ?? 0, o.c ?? o.m21 ?? 0, o.d ?? o.m22 ?? 1, o.e ?? o.m41 ?? 0, o.f ?? o.m42 ?? 0] };
        }
        return;
      }
      case "beginPath": this.path = ""; this.pathBegun = true; return;
      case "clip": {
        if (!this.pathBegun && !(typeof a[0] === "object" && a[0] !== null)) this.wildFrame = true;
        if (this.stack.length === 0) this.wildFrame = true; // a clip outside a save outlives the frame: play it whole
        const desc = typeof a[0] === "object" && a[0] !== null ? `P${pathId(a[0])}${String(a[1] ?? "")}@${lv.t.join(",")}` : `${this.path}${String(a[0] ?? "")}`;
        this.lv = { ...lv, clip: `${lv.clip}|${desc}` };
        return;
      }
      case "setLineDash": this.lv = this.withMisc(lv, { ...lv.misc, lineDash: JSON.stringify(a[0] ?? []) }); return;
      default:
        if (PATH.has(m)) {
          if (!this.pathBegun) this.wildFrame = true; // drawing on a path the frame didn't begin: play it whole
          this.path += `${m}(${a.map(String).join(",")})@${lv.t.join(",")};`;
        }
    }
  }

  /** The frame began a path (beginPath) before its path calls; else they extend the last frame's path. */
  private pathBegun = false;
}

const PATH_IDS = new WeakMap<object, number>();
let pathIds = 0;
function pathId(p: object): number {
  let id = PATH_IDS.get(p);
  if (id === undefined) PATH_IDS.set(p, (id = ++pathIds));
  return id;
}
