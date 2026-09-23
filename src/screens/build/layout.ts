// Build-phase layout (portrait and landscape) and the merchant caravan's drive-in /
// drive-out animation. Everything here is screen-space.

import type { Rect } from "../../ui/ui";
import { WAGON_W } from "../../render/sprites";

export type Sel =
  | { kind: "none" }
  | { kind: "offer"; wagon: number; slot: number }
  | { kind: "cargo"; uid: number }
  | { kind: "item"; uid: number }
  | { kind: "route"; index: number }
  | { kind: "turret"; index: number };

export interface BuildLayout {
  W: number;
  H: number;
  portrait: boolean;
  bar: Rect;
  wagonY: number;
  wagonX: number[]; // parked x for each wagon
  reroll: Rect;
  ox: number; // screen position of the world origin
  oy: number;
  hull: Rect;
  deck: Rect;
  cargo: Rect;
  insp: Rect;
  fight: Rect;
  info: Rect | null;
}

export const HULL_TOP_WORLD = 20; // player hull top edge in world space

export function buildLayout(W: number, H: number, portrait: boolean, nWagons: number): BuildLayout {
  const n = Math.max(1, nWagons);
  const gap = Math.max(2, Math.min(8, Math.floor((W - n * WAGON_W) / (n + 1))));
  const total = n * WAGON_W + (n - 1) * gap;
  const ox = Math.floor(W / 2);
  const wagonX = Array.from({ length: n }, (_, i) => Math.floor(ox - total / 2) + i * (WAGON_W + gap));
  const bar: Rect = { x: 0, y: 0, w: W, h: 14 };
  if (portrait) {
    // Tall phones have spare height: spread it between the rows instead of leaving a
    // dead band above FIGHT. The inspector never grows past what its content needs.
    const spare = Math.max(0, H - 426);
    const wagonY = 25 + Math.floor(spare * 0.2);
    const hy = 72 + Math.floor(spare * 0.45);
    const oy = hy - HULL_TOP_WORLD;
    const cargo: Rect = { x: 4, y: hy + 148 + 11, w: W - 8, h: 22 };
    const iy = cargo.y + cargo.h + 5;
    const ih = Math.max(60, Math.min(INSP_MAX_H, H - iy - 33));
    return {
      W, H, portrait, bar, wagonY, wagonX,
      reroll: { x: W - 70, y: wagonY + 29, w: 66, h: 14 },
      ox, oy,
      hull: { x: ox - 80, y: hy - 12, w: 160, h: 164 },
      deck: { x: ox - 60, y: oy + 38, w: 120, h: 120 },
      cargo,
      insp: { x: 4, y: iy, w: W - 8, h: ih },
      fight: { x: W - 94, y: H - 29, w: 90, h: 25 },
      info: null,
    };
  }
  const stack = 8 + 26 + 12 + 148 + 11 + 22;
  const top0 = Math.max(16, Math.floor((H - stack) / 2));
  const wagonY = top0 + 8;
  const hy = wagonY + 26 + 12;
  const oy = hy - HULL_TOP_WORLD;
  // Landscape: inspector in the left column (top-aligned with the caravan, only as tall
  // as its content), next-battle card and FIGHT in the right column, cargo under the hull.
  const lw = Math.min(196, ox - 80 - 14);
  const ix = Math.max(6, ox - 88 - lw);
  const cw = Math.min(230, Math.max(160, Math.floor(W * 0.36)), 2 * (ox - (ix + lw) - 6));
  const cargo: Rect = { x: ox - Math.floor(cw / 2), y: hy + 148 + 11, w: cw, h: 22 };
  const rx = ox + 88;
  const rw = Math.min(196, W - rx - 8);
  const fw = Math.min(150, rw - 4); // one width for the whole right column
  return {
    W, H, portrait, bar, wagonY, wagonX,
    reroll: { x: Math.min(W - 78, wagonX[n - 1] + WAGON_W + 10), y: wagonY + 6, w: 70, h: 14 },
    ox, oy,
    hull: { x: ox - 80, y: hy - 12, w: 160, h: 164 },
    deck: { x: ox - 60, y: oy + 38, w: 120, h: 120 },
    cargo,
    insp: { x: ix, y: wagonY, w: lw, h: Math.min(INSP_MAX_H, H - wagonY - 8) },
    fight: { x: rx + 4, y: cargo.y + cargo.h - 28, w: fw, h: 28 },
    info: { x: rx + 4, y: hy + 8, w: fw, h: 42 },
  };
}

/** Tallest the inspector gets: header, a four-line description, stats, hint, button. */
export const INSP_MAX_H = 150;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Wagon convoy: drives in from the right, parks, opens; drives out to the left. */
export class Caravan {
  state: "in" | "parked" | "out" = "in";
  t = 0;
  count = 0;
  private then: (() => void) | null = null;

  arrive(n: number): void {
    this.count = n;
    this.state = "in";
    this.t = 0;
  }

  leave(then: () => void): void {
    this.state = "out";
    this.t = 0;
    this.then = then;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.state === "in" && this.t > (this.count - 1) * 0.12 + 0.98) this.state = "parked";
    if (this.state === "out" && this.t > (this.count - 1) * 0.06 + 0.42) {
      const f = this.then;
      this.then = null;
      this.state = "parked";
      f?.();
    }
  }

  x(i: number, target: number, W: number): number {
    if (this.state === "in") {
      const s = W + 12 + i * 34;
      const k = clamp01((this.t - i * 0.12) / 0.7);
      return Math.round(s + (target - s) * (1 - Math.pow(1 - k, 3)));
    }
    if (this.state === "out") {
      const k = clamp01((this.t - i * 0.06) / 0.36);
      return Math.round(target + (-WAGON_W - 30 - target) * k * k);
    }
    return target;
  }

  open(i: number): number {
    if (this.state === "out") return 0;
    if (this.state === "parked") return 1;
    return clamp01((this.t - i * 0.12 - 0.7) / 0.25);
  }

  moving(i: number): boolean {
    if (this.state === "out") return this.t > i * 0.06;
    return this.state === "in" && this.t - i * 0.12 < 0.7;
  }

  get ready(): boolean {
    return this.state === "parked";
  }
}
