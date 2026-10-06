// MOTION-1 (REQ-BFG-071; a display-only prototype behind the compile-time flag VITE_MOTION): "battles in motion".
// Both carriers sail left to right in parallel lanes, bows pointing right, and drift, turn (at most 12 degrees), surge
// and bob on smooth slow curves. Each board sits on a gimbal that counter-rotates its carrier's heading, so the two
// boards stay exactly parallel: screen-aligned by default, or both turned together by the dev knob ?sway=N (at most 3).
// Display only: this module imports nothing (no sim, no DOM), uses no sim RNG and no Math.random (its own small PRNG,
// seeded per battle), and runs on its own clock (frame time). The sim never reads anything here. docs/MOTION.md.

/** The three code-drawn seas, chosen by day (seaForDay). */
export type SeaKind = "calm" | "storm" | "ember";

/** The flag: a VITE_MOTION=1 build. Vite replaces it at build time, so the default build drops the motion paths. */
export const MOTION_BUILD: boolean = import.meta.env.VITE_MOTION === "1";

export interface MotionOpts {
  /** Motion and the new backdrops (a VITE_MOTION=1 build; ?motion=0 turns them off, ?motion=1 back on). */
  on: boolean;
  /** ?sway=N: the shared board sway, in degrees (|N| <= SWAY_MAX_DEG); 0, off, by default. */
  sway: number;
  /** ?sea=calm|storm|ember: force a setting (else the day decides). */
  sea: SeaKind | null;
  /** ?perf=1: the frame-time overlay with the per-layer ms split. */
  perf: boolean;
}

export const BANK_MAX_DEG = 12;
export const SWAY_MAX_DEG = 3;
/** Lane drift (px, logical): each carrier wanders this far either side of its lane (less where the gap is tight). */
export const DRIFT_MAX = 6;
/** Surge (px, logical): how far a carrier draws ahead or falls behind. Portrait; landscape uses SURGE_LAND. */
export const SURGE_MAX = 6;
export const SURGE_LAND = 10;
/** Sway's period (s): slow, as the brief's 6-20 s curves. */
export const SWAY_PERIOD = 11;
/** Reduce motion: the backdrop scrolls at a quarter speed. */
export const REDUCED_SCROLL = 0.25;

const DEG = Math.PI / 180;

/** The URL options of a VITE_MOTION=1 build. Without the flag every option is off and the URL is ignored. */
export function parseMotionOpts(search: string, build: boolean): MotionOpts {
  const off: MotionOpts = { on: false, sway: 0, sea: null, perf: false };
  if (!build) return off;
  const q = new URLSearchParams(search);
  const sway = Number(q.get("sway") ?? 0);
  const sea = q.get("sea");
  return {
    on: q.get("motion") !== "0",
    sway: Number.isFinite(sway) ? Math.max(-SWAY_MAX_DEG, Math.min(SWAY_MAX_DEG, sway)) : 0,
    sea: sea === "calm" || sea === "storm" || sea === "ember" ? sea : null,
    perf: q.get("perf") === "1",
  };
}

/** The page's options, read once. In the default build: all off, whatever the URL says. */
export const MOTION: MotionOpts = parseMotionOpts(typeof location === "undefined" ? "" : location.search, MOTION_BUILD);

/** CALM SEA on days 1-3, STORM on days 4-7, EMBER SEA on days 8-10 (and after). */
export function seaForDay(day: number): SeaKind {
  return day <= 3 ? "calm" : day <= 7 ? "storm" : "ember";
}

/** A small display-only PRNG (mulberry32), seeded per battle: wave crests, embers, rain and the curves' phases. */
export function displayRng(seed: number): () => number {
  let s = (seed ^ 0x5bd1e995) >>> 0 || 0x9e3779b9;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the lanes sit: the firing axis (vertical in portrait), the open floor between the boards at rest, and the
 *  least it may ever be (the layout's minimum gap). */
export interface LaneSpec {
  portrait: boolean;
  gapRest: number;
  gapMin: number;
}

/** A carrier's pose at a time: its offset from its rest place (logical px, unrounded), its heading (degrees, + = bow up
 *  on screen), the board's angle on screen (degrees: the gimbal turns it back to the shared sway), and its bob (-1..1). */
export interface Pose {
  x: number;
  y: number;
  bank: number;
  board: number;
  gimbal: number;
  bob: number;
}

interface Curves {
  a1: number; w1: number; p1: number; // lane drift, slow part
  a2: number; w2: number; p2: number; // lane drift, quicker part
  wx: number; px: number; // surge
  wb: number; pb: number; // bob
}

const TAU = Math.PI * 2;

function curves(rnd: () => number): Curves {
  const per = (lo: number, hi: number) => TAU / (lo + (hi - lo) * rnd());
  return {
    a1: 0.65, w1: per(12, 16), p1: rnd() * TAU,
    a2: 0.35, w2: per(6.5, 9), p2: rnd() * TAU,
    wx: per(15, 20), px: rnd() * TAU,
    wb: per(6, 7.5), pb: rnd() * TAU,
  };
}

/** A 2D affine map p -> (a*x + c*y + e, b*x + d*y + f), as canvas setTransform takes it. */
export interface Affine { a: number; b: number; c: number; d: number; e: number; f: number }

/**
 * The display clock and the transforms of one battle. Every pose is a pure function of the clock (and the seed), so a
 * still at a given time repeats, and the wake can read where the stern was a moment ago.
 */
export class MotionModel {
  /** The display clock (s): frame time, advanced by the screen while the battle isn't paused. */
  t = 0;
  /** Water travelled (s at full speed): the backdrop's scroll and the wake read it (a quarter speed with reduce motion). */
  dist = 0;
  reduced = false;
  /** The shared sway's amplitude (degrees, |s| <= 3); 0 = both boards screen-aligned. */
  readonly sway: number;
  private readonly cv: [Curves, Curves];
  private drift = DRIFT_MAX;
  private surge = SURGE_MAX;
  private bankMax = BANK_MAX_DEG;
  private lanes: LaneSpec = { portrait: true, gapRest: 100, gapMin: 22 };

  constructor(readonly seed: number, o: { sway?: number; reduced?: boolean } = {}) {
    const rnd = displayRng(seed);
    this.cv = [curves(rnd), curves(rnd)];
    this.sway = Math.max(-SWAY_MAX_DEG, Math.min(SWAY_MAX_DEG, o.sway ?? 0));
    this.reduced = !!o.reduced;
  }

  /** Fit the curves to a layout: the drift (portrait) or the surge (landscape) may only close the gap down to its
   *  minimum, so each side's share of the spare floor caps it (whole px, so rounded offsets keep the bound). */
  setLanes(spec: LaneSpec): void {
    this.lanes = spec;
    const spare = Math.max(0, Math.floor((spec.gapRest - spec.gapMin) / 2));
    if (spec.portrait) {
      this.drift = Math.min(DRIFT_MAX, spare);
      this.surge = SURGE_MAX;
    } else {
      this.drift = DRIFT_MAX;
      this.surge = Math.min(SURGE_LAND, spare);
    }
    // the heading follows the drift: a carrier that barely drifts barely turns
    this.bankMax = BANK_MAX_DEG * Math.min(1, this.drift / DRIFT_MAX);
  }

  get spec(): LaneSpec {
    return this.lanes;
  }

  /** Advance the display clock by a frame (capped, like the game loop's dt). */
  advance(dt: number): void {
    const d = Math.max(0, Math.min(0.25, dt));
    this.t += d;
    this.dist += d * this.scrollFactor();
  }

  /** The backdrop's speed factor: 1, or a quarter with reduce motion. */
  scrollFactor(): number {
    return this.reduced ? REDUCED_SCROLL : 1;
  }

  /** The shared board angle at time t (degrees): the same for both boards, always. */
  swayAt(t = this.t): number {
    return this.reduced || this.sway === 0 ? 0 : this.sway * Math.sin((TAU * t) / SWAY_PERIOD);
  }

  /** Side `s`'s pose at time t (0 the player, 1 the enemy). Reduce motion: straight sailing (no bank, drift, surge or bob). */
  pose(s: 0 | 1, t = this.t, out: Pose = { x: 0, y: 0, bank: 0, board: 0, gimbal: 0, bob: 0 }): Pose {
    const board = this.swayAt(t);
    if (this.reduced) {
      out.x = out.y = out.bank = out.bob = 0;
      out.board = board;
      out.gimbal = board;
      return out;
    }
    const c = this.cv[s];
    const u1 = c.w1 * t + c.p1, u2 = c.w2 * t + c.p2;
    out.y = this.drift * (c.a1 * Math.sin(u1) + c.a2 * Math.sin(u2));
    // the lane velocity's share of its largest possible value: the heading follows it, bow up while drifting up
    const v = (c.a1 * c.w1 * Math.cos(u1) + c.a2 * c.w2 * Math.cos(u2)) / (c.a1 * c.w1 + c.a2 * c.w2);
    out.bank = -this.bankMax * v + 0; // + 0: no -0
    out.x = this.surge * Math.sin(c.wx * t + c.px);
    out.bob = Math.sin(c.wb * t + c.pb);
    out.board = board;
    out.gimbal = board - out.bank; // the gimbal turns the board back by the heading, to the shared sway
    return out;
  }

  /** The integer offset a side is drawn at (logical px: whole device pixels, so the pixel art stays crisp). */
  offset(s: 0 | 1, t = this.t): [number, number] {
    const p = this.pose(s, t);
    return [Math.round(p.x), Math.round(p.y)];
  }

  /** The open floor between the boards at time t (logical px, as drawn): the rest gap closed or opened by the offsets
   *  along the firing axis (portrait: the enemy above, the player below; landscape: the player left, the enemy right). */
  gapAt(t = this.t): number {
    const [px, py] = this.offset(0, t), [ex, ey] = this.offset(1, t);
    return this.lanes.portrait ? this.lanes.gapRest + py - ey : this.lanes.gapRest + ex - px;
  }
}

/**
 * The board's map from rest-screen space (where today's drawing code draws it: its deck frame at rest, with the drive-in)
 * to the screen: the carrier (translate to its lane offset, turn by its heading) times the gimbal (turn back by the
 * heading, then the shared sway), about the board's pivot (its centre at rest). (cx, cy): the pivot; (ox, oy): the whole
 * offset (the carrier's rounded drift and surge plus the camera shake). The two rotations multiply out to the sway alone.
 */
export function boardAffine(cx: number, cy: number, ox: number, oy: number, bankDeg: number, gimbalDeg: number, out: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }): Affine {
  // carrier rotation (canvas angles: + is clockwise on screen, so a bow-up bank is a negative canvas angle)
  const r1 = -bankDeg * DEG, r2 = -gimbalDeg * DEG;
  const c1 = Math.cos(r1), s1 = Math.sin(r1), c2 = Math.cos(r2), s2 = Math.sin(r2);
  // R1 * R2
  const a = c1 * c2 - s1 * s2, b = s1 * c2 + c1 * s2;
  const c = -(c1 * s2 + s1 * c2), d = -s1 * s2 + c1 * c2;
  out.a = a; out.b = b; out.c = c; out.d = d;
  // p -> R (p - pivot) + pivot + offset
  out.e = cx + ox - (a * cx + c * cy);
  out.f = cy + oy - (b * cx + d * cy);
  // a screen-aligned board (no sway) is a pure whole-pixel translation: snap the rotation's rounding dust away
  if (Math.abs(b) < 1e-12 && Math.abs(c) < 1e-12) {
    out.a = out.d = 1;
    out.b = out.c = 0;
    out.e = Math.round(ox);
    out.f = Math.round(oy);
  }
  return out;
}

/** The angle (degrees, + = counter-clockwise on screen) an affine turns by. */
export function affineAngle(m: Affine): number {
  return -Math.atan2(m.b, m.a) / DEG;
}

export function applyAffine(m: Affine, x: number, y: number, out: number[]): number[] {
  out[0] = m.a * x + m.c * y + m.e;
  out[1] = m.b * x + m.d * y + m.f;
  return out;
}

/** The inverse map: a screen point back to rest-screen space (the tap's hit test). */
export function invertAffine(m: Affine, x: number, y: number, out: number[]): number[] {
  const det = m.a * m.d - m.b * m.c;
  const dx = x - m.e, dy = y - m.f;
  out[0] = (m.d * dx - m.c * dy) / det;
  out[1] = (-m.b * dx + m.a * dy) / det;
  return out;
}

/** Per-frame ms split for ?perf=1 (and the frame-time runs): backdrop, hulls, boards, shots, effects; "world" is the
 *  whole of today's drawArena when motion is off (?motion=0&perf=1), which has no finer split. */
export class MotionPerf {
  static readonly N = 240;
  readonly keys = ["backdrop", "hulls", "boards", "shots", "effects", "world"] as const;
  readonly ms: Float32Array[] = this.keys.map(() => new Float32Array(MotionPerf.N));
  n = 0;
  /** Running totals since the page loaded (the frame-time runs difference two readings). */
  readonly sum = new Float64Array(6);
  private cur = new Float32Array(6);
  add(k: number, ms: number): void {
    this.cur[k] += ms;
  }
  /** Close a frame. */
  frame(): void {
    const i = this.n % MotionPerf.N;
    for (let k = 0; k < 6; k++) {
      this.ms[k][i] = this.cur[k];
      this.sum[k] += this.cur[k];
      this.cur[k] = 0;
    }
    this.n++;
  }
  totals(): { frames: number; ms: Record<string, number> } {
    const ms: Record<string, number> = {};
    this.keys.forEach((key, k) => { ms[key] = this.sum[k]; });
    return { frames: this.n, ms };
  }
  /** Mean ms per frame of each pass over the last `n` frames. */
  mean(n = MotionPerf.N): Record<string, number> {
    const m = Math.min(n, this.n, MotionPerf.N);
    const r: Record<string, number> = {};
    this.keys.forEach((key, k) => {
      let s = 0;
      for (let j = 1; j <= m; j++) s += this.ms[k][(this.n - j) % MotionPerf.N];
      r[key] = m ? s / m : 0;
    });
    return r;
  }
}
