// MOTION-1 (REQ-BFG-071) drew the battle in motion as a prototype; MOTION-2 ships it: the battle, the title's attract
// fight and replays draw an Arena this way, and the hero preview draws one held still. The sea (render/backdrop.ts)
// scrolls behind; each carrier (render/carrier.ts, drawn by render/ship.ts) sails right in its lane on its own clock
// (render/motion.ts); each board rides on its carrier's gimbal: today's drawing code draws it at rest (its deck frame,
// a.drawn), under the board's transform. Shots fly between the boards' current transforms; the arena's effects ride with
// the board they belong to (Fx.anchor); a tap is hit-tested through the inverse transform (MOTION-2: nothing is drawn for
// it; scripts/motiontap.mjs reads it). The sim is never touched: this reads the battle and the arena (as drawArena does)
// and writes nothing they read. docs/MOTION.md.

import type { Side } from "../sim/battle";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { TILE, TILES, hullBox, localX, localY, sx, sy, type Box } from "../render/frame";
import { drawTurrets } from "../render/cruiser";
import { drawMachinery } from "../render/machinery";
import { drawWind } from "../render/world";
import { drawText } from "../render/font";
import { PIVOT_X, PLATE_HX, PLATE_W, foam } from "../render/carrier";
import { dimPlate, dimShip, drawPlate, drawShip, plateBox } from "../render/ship";
import { SEAS, SeaBackdrop } from "../render/backdrop";
import {
  BANK_MAX_DEG, MOTION_KNOBS, MotionModel, MotionPerf, applyAffine, boardAffine, invertAffine, seaForDay,
  type Affine, type MotionOpts, type Pose, type SeaKind,
} from "../render/motion";
import { CRACKS_25, CRACKS_50, cracks, drawShells, type ShotMap } from "./arenaDraw";
import type { Arena } from "./arena";
import type { BattleLayout } from "./battleLayout";

const DEG = Math.PI / 180;
/** The wake: samples (one every WAKE_DT s back in time) of where the stern was, carried off by the water. */
const WAKE_N = 34, WAKE_DT = 0.1;

export interface TileHit { side: Side; cx: number; cy: number }

const now = (): number => (typeof performance !== "undefined" ? performance.now() : 0);

/** The ?perf=1 overlay's ms readings (a dev tool in test builds, never player text): a non-negative number with 1 or 2
 *  decimals. numbers.lint (NUM-4) keeps decimal formatting out of render code, so this is spelled out. */
function decimals(x: number, d: 1 | 2): string {
  const k = d === 1 ? 10 : 100;
  const r = Math.round(Math.max(0, x) * k);
  const frac = String(r % k);
  return `${Math.floor(r / k)}.${d === 2 && frac.length < 2 ? `0${frac}` : frac}`;
}

export class ArenaMotion implements ShotMap {
  readonly model: MotionModel;
  readonly sea = new SeaBackdrop();
  readonly perf: MotionPerf | null;
  readonly kind: SeaKind;
  /** Each board's map from rest-screen space to the screen, this frame (the camera shake included: what is drawn). */
  readonly aff: [Affine, Affine] = [{ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }];
  /** The same without the camera shake: carrier x board alone, what a tap hit-tests through (a hit's shake, a few px for a
   *  frame or two, must not move the tile under a finger). */
  readonly hitAff: [Affine, Affine] = [{ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }];
  /** Each carrier's pivot on screen this frame (logical px), and its drawn heading (whole degrees). */
  readonly pivot: [number, number][] = [[0, 0], [0, 0]];
  readonly bankDrawn: [number, number] = [0, 0];
  private readonly pose: Pose = { x: 0, y: 0, bank: 0, board: 0, gimbal: 0, bob: 0 };
  private readonly past: Pose = { x: 0, y: 0, bank: 0, board: 0, gimbal: 0, bob: 0 };
  private readonly tmp = [0, 0];
  private readonly pr: Box = { x: 0, y: 0, w: 0, h: 0 };
  /** Tooling (scripts/motiontap.mjs, a test-only probe): the last tap that hit a board tile, with the clock then. MOTION-2
   *  (REVIEW-MOTION1 Q4): a tap draws nothing; the hit test stays for the probe. */
  lastTap: (TileHit & { t: number; n: number }) | null = null;
  taps = 0;

  /** `held` (MOTION-2, the hero preview): the ships stay still on a still sea. */
  constructor(seed: number, day: number, opts: MotionOpts, reduced: boolean, held = false) {
    this.model = new MotionModel(seed, { sway: opts.sway, reduced, held });
    this.kind = opts.sea ?? seaForDay(day);
    this.perf = MOTION_KNOBS && opts.perf ? new MotionPerf() : null; // ?perf=1: test builds only
  }

  /** The lanes from the battle layout: the rest gap along the firing axis and its least. */
  setLanes(L: Pick<BattleLayout, "portrait" | "gap">, gapMin: number): void {
    this.model.setLanes({ portrait: L.portrait, gapRest: L.gap, gapMin });
  }

  update(dt: number, reduced: boolean): void {
    this.model.reduced = reduced;
    this.model.advance(dt);
  }

  // ------------------------------------------------------------ transforms

  /** This frame's board maps and carrier pivots (call before drawing; taps read the last frame's). */
  frame(a: Arena): void {
    const ox = a.fx.shakeX, oy = a.fx.shakeY;
    for (const s of [0, 1] as Side[]) {
      const hb = hullBox(a.drawn[s]);
      const cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2;
      const p = this.model.pose(s, this.model.t, this.pose);
      const dx = Math.round(p.x), dy = Math.round(p.y);
      const H = boardAffine(cx, cy, dx, dy, p.bank, p.gimbal, this.hitAff[s]), A = this.aff[s];
      A.a = H.a; A.b = H.b; A.c = H.c; A.d = H.d; A.e = H.e + ox; A.f = H.f + oy; // the shake: one whole-pixel translate on top
      this.pivot[s][0] = cx + dx + ox;
      this.pivot[s][1] = cy + dy + oy;
      this.bankDrawn[s] = Math.max(-BANK_MAX_DEG, Math.min(BANK_MAX_DEG, Math.round(p.bank)));
    }
  }

  /** ShotMap: a rest-screen point on `side`'s board -> the screen now. */
  toScreen(side: Side, x: number, y: number, out: number[]): number[] {
    return applyAffine(this.aff[side], x, y, out);
  }

  /** The tap's hit test: the screen point, through the inverse of (carrier x board), to a board tile (or null). */
  hit(a: Arena, x: number, y: number): TileHit | null {
    for (const s of [0, 1] as Side[]) {
      if (!a.show[s]) continue;
      invertAffine(this.hitAff[s], x, y, this.tmp);
      const f = a.drawn[s];
      const lx = localX(f, this.tmp[0], this.tmp[1]), ly = localY(f, this.tmp[0], this.tmp[1]);
      const cx = Math.floor(lx / TILE), cy = Math.floor(ly / TILE);
      if (cx >= 0 && cy >= 0 && cx < TILES && cy < TILES) return { side: s, cx, cy };
    }
    return null;
  }

  /** A tile's centre on screen now (logical px, without the camera shake): what a tap must hit. */
  tileCentre(a: Arena, side: Side, cx: number, cy: number): [number, number] {
    const f = a.drawn[side];
    const lx = (cx + 0.5) * TILE, ly = (cy + 0.5) * TILE;
    applyAffine(this.hitAff[side], sx(f, lx, ly), sy(f, lx, ly), this.tmp);
    return [this.tmp[0], this.tmp[1]];
  }

  /** A tap at (x, y): hit-tested and remembered for the probe. Display only, and nothing is drawn (REVIEW-MOTION1 Q4). */
  tap(a: Arena, x: number, y: number): TileHit | null {
    const h = this.hit(a, x, y);
    if (!h) return null;
    this.lastTap = { ...h, t: this.model.t, n: ++this.taps };
    return h;
  }

  // ------------------------------------------------------------ drawing

  /** The sea, at the camera shake (as the floor was); held still in a preview. */
  drawSea(g: G, W: number, H: number, ox: number, oy: number, scale: number, dpr: number, seed: number): void {
    const t0 = this.perf ? now() : 0;
    const m = this.model;
    const f = { W, H, kind: this.kind, dist: m.dist, t: m.t, reduced: m.reduced, seed, scale, dpr };
    if (m.held) this.sea.drawStill(g, f);
    else this.sea.draw(g, f, ox, oy);
    if (this.perf) this.perf.add(0, now() - t0);
  }

  /** The arena in motion (drawArena's order: carriers, boards, shots, effects, numbers, the wind, the flash). */
  draw(g: G, a: Arena, W: number, H: number, reduced: boolean): void {
    const b = a.b;
    const P = this.perf;
    this.frame(a);
    let t0 = P ? now() : 0;
    // carriers: wake, shadow, hull (screen space; the pivot carries the shake)
    for (const s of [0, 1] as Side[]) {
      if (!a.show[s]) continue;
      if (!this.model.held) this.drawWake(g, s);
      const hero = a.views[s].model.hero;
      const deg = this.bankDrawn[s];
      const px = this.pivot[s][0], py = this.pivot[s][1];
      drawShip(g, hero, px, py, deg, Math.round(this.model.pose(s, this.model.t, this.pose).bob));
      if (a.loser === s && a.koT > 0.35) dimShip(g, hero, px, py, deg, Math.min(0.62, (a.koT - 0.35) * 1.1));
    }
    if (P) { const t1 = now(); P.add(1, t1 - t0); t0 = t1; }
    // boards, each under its gimbal's transform: today's drawing code, at rest
    for (const s of [0, 1] as Side[]) {
      if (!a.show[s]) continue;
      const v = a.views[s];
      v.t = a.clock;
      v.tread = a.tread;
      v.flash = b.sides[s].hull.flash;
      const A = this.aff[s];
      g.save();
      g.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
      const f = a.drawn[s];
      const r = plateBox(g, f, this.pr);
      drawPlate(g, v.model.hero, f.facing, r);
      if (v.flash && v.flash > 0.05 && !reduced) {
        rect(g, r.x, r.y, r.w, 1, C.white); rect(g, r.x, r.y + r.h - 1, r.w, 1, C.white);
        rect(g, r.x, r.y, 1, r.h, C.white); rect(g, r.x + r.w - 1, r.y, 1, r.h, C.white);
      }
      a.fx.drawDecals(g, 0, 0, s);
      const hpct = b.sides[s].hull.hp / b.sides[s].hull.max;
      if (hpct < 0.5) cracks(g, f, CRACKS_50, PLATE_HX, PLATE_HX + PLATE_W);
      if (hpct < 0.25) cracks(g, f, CRACKS_25, PLATE_HX, PLATE_HX + PLATE_W);
      drawMachinery(g, v);
      drawTurrets(g, v);
      if (a.loser === v.side && a.koT > 0.35) dimPlate(g, r, Math.min(0.62, (a.koT - 0.35) * 1.1));
      for (const charge of b.sides[s].limpets) {
        const x = Math.round(sx(f, charge.target.x, charge.target.y)), y = Math.round(sy(f, charge.target.x, charge.target.y));
        const blink = Math.floor(a.clock * 8) % 2 === 0 ? C.fire4 : C.red;
        rect(g, x - 2, y - 2, 5, 5, C.ink); rect(g, x - 1, y - 1, 3, 3, blink);
      }
      g.restore();
    }
    if (P) { const t1 = now(); P.add(2, t1 - t0); t0 = t1; }
    // shots, in screen space: from each gun's current place to its target's current place
    if (!b.over) drawShells(g, a, this);
    if (P) { const t1 = now(); P.add(3, t1 - t0); t0 = t1; }
    // effects and numbers ride with their board; the rest at the shake
    for (const s of [0, 1] as Side[]) {
      const A = this.aff[s];
      g.save();
      g.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
      a.fx.draw(g, 0, 0, s);
      g.restore();
    }
    const ox = a.fx.shakeX, oy = a.fx.shakeY;
    a.fx.draw(g, ox, oy, -1);
    for (const s of [0, 1] as Side[]) {
      const A = this.aff[s];
      g.save();
      g.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
      a.fx.drawPops(g, 0, 0, s);
      g.restore();
    }
    a.fx.drawPops(g, ox, oy, -1);
    a.fx.drawDecals(g, ox, oy, -1);
    drawWind(g, b.windLevel() * Math.max(0, 1 - a.overT / 1.2), W, H, a.clock);
    if (a.fx.flash > 0 && !reduced) {
      g.globalAlpha = Math.min(0.5, a.fx.flash);
      rect(g, 0, 0, W, H, a.fx.flashColor);
      g.globalAlpha = 1;
    }
    if (P) { P.add(4, now() - t0); P.frame(); }
  }

  /** The wake: where the stern was over the last few seconds, carried off left by the water, spreading and fading. */
  private drawWake(g: G, s: Side): void {
    const m = this.model;
    const look = SEAS[this.kind];
    const v = look.speeds[2] * m.scrollFactor(); // the water's speed past the hull (the near layer's)
    const sternX = -PIVOT_X + 3;
    const cx = this.pivot[s][0] - Math.round(m.pose(s, m.t, this.past).x), cy = this.pivot[s][1] - Math.round(this.past.y);
    for (let k = 1; k <= WAKE_N; k++) {
      const tau = k * WAKE_DT;
      const p = m.pose(s, m.t - tau, this.past);
      const r = -p.bank * DEG;
      const x = cx + Math.round(p.x) + sternX * Math.cos(r) - v * tau;
      const y = cy + Math.round(p.y) + sternX * Math.sin(r);
      if (x < -4) break;
      const age = k / WAKE_N;
      const spread = 3 + age * 13;
      const col = age < 0.25 ? look.spark : age < 0.6 ? look.foam : look.crest;
      if (k % 2 === 0 || age < 0.3) foam(g, x, y - 1, age < 0.3 ? 3 : 2, col);
      if ((k + s) % 2 === 1) {
        foam(g, x, y - spread, 2, age < 0.5 ? look.foam : look.crest);
        foam(g, x, y + spread, 2, age < 0.5 ? look.foam : look.crest);
      }
    }
  }
}

/** ?perf=1 (test builds only; MOTION-2 keeps it out of the player bundle): the frame-time overlay (the rAF interval's
 *  median and p95 over the last 120 frames, and the motion's layer split). */
export function drawMotionPerf(g: G, m: ArenaMotion, game: { perfGap: Float32Array; perfN: number }): void {
  const P = m.perf;
  if (!P) return;
  const n = Math.min(120, game.perfN, game.perfGap.length);
  const a: number[] = [];
  for (let k = 1; k <= n; k++) a.push(game.perfGap[(game.perfN - k) % game.perfGap.length]);
  a.sort((x, y) => x - y);
  const q = (p: number) => (a.length ? a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)] : 0);
  const s = P.mean(120);
  const f = (x: number) => decimals(x, 2);
  const lines = [
    `FRAME P50 ${decimals(q(0.5), 1)} P95 ${decimals(q(0.95), 1)} MS`,
    `BG ${f(s.backdrop)} HULL ${f(s.hulls)} BOARD ${f(s.boards)}`,
    `SHOT ${f(s.shots)} FX ${f(s.effects)} SEA ${m.kind.toUpperCase()}`,
  ];
  g.globalAlpha = 0.8;
  rect(g, 1, 1, 128, 22, C.ink);
  g.globalAlpha = 1;
  lines.forEach((ln, i) => drawText(g, ln, 3, 3 + i * 7, i ? C.bone : C.yellow, { font: "3" }));
}
