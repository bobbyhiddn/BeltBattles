// FIELD-1 (REQ-BFG-075): the battle camera. Display only: it imports no sim value, uses no Math.random and runs on the
// display clock. One camera transform, composed with each board's (motion.ts boardAffine) in game/arenaMotion.ts: the
// hulls, boards, shots, effects and damage numbers all go through it, and a tap is hit-tested through its inverse. The
// HUD is drawn without it, screen-anchored at today's size.
//
// Two named shots: CLOSE, today's framing (the battle's own device-pixel scale, battleLayout.ts battleScale), and WIDE,
// the fight zoomed out so both carriers and the setting show with room to spare. At rest each shot draws one art pixel
// as a whole number of device pixels, so the pixel art stays crisp. To show both scales whole, the battle's canvas runs on
// a finer grid (cameraGrid): `unit` device px per canvas px, the HUD drawn at `sub` canvas px per logical px (core/io.ts
// View.sub; the still screens keep sub 1, today's canvas). A move between the shots (easeTo) may pass through other
// scales on the way.

import type { Affine } from "./motion";

export type Shot = "close" | "wide";

/** WIDE's target: the two hulls, at every motion phase (bank, surge), span at most this share of the screen's width. */
export const WIDE_SHARE = 0.75;

/** The rest-screen x reach of a carrier about its pivot at any heading up to 12 degrees (the flared stern's corners turn
 *  out to 102 px behind it; the bow and its wave reach 99 ahead): render/carrier.ts's outline. */
export const SHIP_BACK = 102, SHIP_AHEAD = 99;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** WIDE's device-pixel scale: the largest whole scale, at most CLOSE's, at which `span` rest px (the hulls across, with
 *  their motion) take at most `share` of the `pw` device px of the screen's width; but never below half of CLOSE (a
 *  deeper zoom would draw the art at a third of today's size or less: a 1280x720 laptop, CLOSE x3, stops at x2). */
export function wideScale(pw: number, close: number, span: number, share = WIDE_SHARE): number {
  const floor = Math.max(1, Math.ceil(close / 2));
  for (let s = close; s > floor; s--) if (span * s <= share * pw) return s;
  return floor;
}

/** The battle's canvas grid on a screen: the two shots' device-pixel scales, the canvas px (`unit` device px each, the
 *  largest that holds both shots' pixels whole) and the HUD's canvas px per logical px (`sub`). */
export interface Grid {
  close: number;
  wide: number;
  unit: number;
  sub: number;
}

export function cameraGrid(close: number, wide: number): Grid {
  const unit = gcd(close, wide);
  return { close, wide, unit, sub: close / unit };
}

/** The camera's ease: smoothstep (no jump in speed at either end). */
export function ease(k: number): number {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
}

/**
 * The camera of one battle view. Its zoom is relative to today's logical px: CLOSE 1, WIDE grid.wide / grid.close. It
 * zooms about `focus` (rest-screen logical px, whole: the lanes' centre), which stays where it is on screen.
 */
export class Camera {
  /** The shot it sits at, or is easing to. */
  shot: Shot;
  private z0: number;
  private z1: number;
  private t = 0;
  private dur = 0;
  focus: [number, number] = [0, 0];

  constructor(readonly grid: Grid, shot: Shot = "wide") {
    this.shot = shot;
    this.z0 = this.z1 = this.zoomOf(shot);
  }

  /** A shot's zoom against today's framing. */
  zoomOf(s: Shot): number {
    return s === "close" ? 1 : this.grid.wide / this.grid.close;
  }

  /** Ease to `shot` over `secs` seconds of display clock (0: cut). */
  easeTo(shot: Shot, secs: number): void {
    this.z0 = this.zoom;
    this.z1 = this.zoomOf(shot);
    this.shot = shot;
    this.t = 0;
    this.dur = Math.max(0, secs);
  }

  /** Advance the move (display clock; capped like the game loop's dt). */
  update(dt: number): void {
    if (this.t < this.dur) this.t = Math.min(this.dur, this.t + Math.max(0, Math.min(0.25, dt)));
  }

  /** Moving between shots (not at rest). */
  get moving(): boolean {
    return this.t < this.dur;
  }

  /** The zoom now. */
  get zoom(): number {
    return this.dur <= 0 || this.t >= this.dur ? this.z1 : this.z0 + (this.z1 - this.z0) * ease(this.t / this.dur);
  }

  /** The world layer's canvas px per layer px (`f`): at rest one art px is one layer px (CLOSE: sub; WIDE: wide / unit),
   *  and while moving the finer of the two. */
  layerF(): number {
    const g = this.grid, fw = g.wide / g.unit;
    return !this.moving && this.shot === "close" ? g.sub : Math.min(fw, g.sub);
  }

  /**
   * The camera's map from rest-screen logical px to the world layer's px (`f` canvas px each, the layer blitted at the
   * canvas's top left): scale k = sub * zoom / f about the focus, the focus kept at its screen place. At rest k is 1 and
   * the translation is snapped to whole layer px, so every art pixel is one layer pixel: crisp.
   */
  layerAffine(f: number, out: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }): Affine {
    const sub = this.grid.sub, z = this.zoom, k = (sub * z) / f;
    const [fx, fy] = this.focus;
    let tx = (sub * fx) / f - k * fx, ty = (sub * fy) / f - k * fy;
    if (!this.moving) { tx = Math.round(tx); ty = Math.round(ty); }
    out.a = k; out.b = 0; out.c = 0; out.d = k; out.e = tx; out.f = ty;
    return out;
  }

  /** The same map to screen logical px (the HUD's, the input's): what a tap is inverted through. */
  screenAffine(out: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }): Affine {
    const f = this.layerF(), s = f / this.grid.sub;
    this.layerAffine(f, out);
    out.a *= s; out.d *= s; out.e *= s; out.f *= s;
    return out;
  }
}
