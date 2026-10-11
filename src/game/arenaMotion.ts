// MOTION-1 (REQ-BFG-071) drew the battle in motion as a prototype; MOTION-2 ships it: the battle, the title's attract
// fight and replays draw an Arena this way, and the hero preview draws one held still. The sea (render/backdrop.ts)
// scrolls behind; each carrier (render/carrier.ts, drawn by render/ship.ts) sails right in its lane on its own clock
// (render/motion.ts); each board rides on its carrier's gimbal: today's drawing code draws it at rest (its deck frame,
// a.drawn), under the board's transform. Shots fly between the boards' current transforms; the arena's effects ride with
// the board they belong to (Fx.anchor); a tap is hit-tested through the inverse transform (MOTION-2: nothing is drawn for
// it; scripts/motiontap.mjs reads it). The sim is never touched: this reads the battle and the arena (as drawArena does)
// and writes nothing they read. docs/MOTION.md.

// FIELD-1 (REQ-BFG-075): the battle's setting (render/scenery.ts: water, ground or air, picked per battle) and its
// medium under the hulls (water: the wake and bow wave; ground: treads and dust; air: engine pods and contrails), and the
// battle camera (render/camera.ts). With a camera (the battle and the replay) the world (the setting, carriers, boards,
// shots, effects and damage numbers) is drawn into a world layer, one layer px per art px at rest, through the camera's
// map composed with each board's affine, and the layer is blitted onto the game's finer canvas grid at a whole factor;
// taps are hit-tested through the camera's inverse. The HUD, the dark wind and the screen flash are drawn on the canvas
// at today's size, screen-anchored. Without a camera (the title's attract fight, the hero preview) the arena draws as it
// did, at today's framing.

import type { Side } from "../sim/battle";
import { C } from "../render/palette";
import { makeCanvas, rect, type G } from "../render/pixel";
import { TILE, TILES, hullBox, localX, localY, sx, sy, type Box } from "../render/frame";
import { drawTurrets } from "../render/cruiser";
import { drawMachinery } from "../render/machinery";
import { drawWind } from "../render/world";
import { drawText, textWidth } from "../render/font";
import { EMIT, PIVOT_X, PLATE_HX, PLATE_W, foam } from "../render/carrier";
import { dimPlate, dimShip, drawPlate, drawShip, plateBox } from "../render/ship";
import { LANDS, SEAS, SeaBackdrop, isSea } from "../render/backdrop";
import { mediumOf, type Medium } from "../render/scenery";
import { Camera, type Grid, type Shot } from "../render/camera";
import { skinOf } from "../render/styles"; // CUSTOM-2a (REQ-BFG-072): each board's floor style (its view's skin)
import {
  BANK_MAX_DEG, DRIFT_MAX, MOTION_KNOBS, MotionModel, MotionPerf, applyAffine, boardAffine, invertAffine, seaForDay,
  type Affine, type MotionOpts, type Pose, type SceneId, type SeaKind,
} from "../render/motion";
import { CRACKS_25, CRACKS_50, cracks, drawShells, type ShotMap } from "./arenaDraw";
import type { Arena } from "./arena";
import { laneSpec, type BattleLayout } from "./battleLayout";

const DEG = Math.PI / 180;
/** The wake: samples (one every WAKE_DT s back in time) of where the stern was, carried off by the water. */
const WAKE_N = 34, WAKE_DT = 0.1;
/** FIELD-1: the dust (ground) and the contrails (air), sampled the same way from the treads' and pods' aft ends. */
const DUST_N = 26, TRAIL_N = 30;
const ID: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** m1 then m2: the map p -> m1(m2(p)), into `out`. */
export function compose(m1: Affine, m2: Affine, out: Affine): Affine {
  const a = m1.a * m2.a + m1.c * m2.b, b = m1.b * m2.a + m1.d * m2.b;
  const c = m1.a * m2.c + m1.c * m2.d, d = m1.b * m2.c + m1.d * m2.d;
  const e = m1.a * m2.e + m1.c * m2.f + m1.e, f = m1.b * m2.e + m1.d * m2.f + m1.f;
  out.a = a; out.b = b; out.c = c; out.d = d; out.e = e; out.f = f;
  return out;
}

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
  /** FIELD-1: the setting (any of the eight; render/scenery.ts) and the medium its carriers ride. */
  readonly kind: SceneId;
  readonly medium: Medium;
  /** Each board's map from rest-screen space to the screen, this frame (the camera shake included: what is drawn). */
  readonly aff: [Affine, Affine] = [{ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }];
  /** The same without the camera shake: carrier x board alone, what a tap hit-tests through (a hit's shake, a few px for a
   *  frame or two, must not move the tile under a finger). */
  readonly hitAff: [Affine, Affine] = [{ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }];
  /** Each carrier's pivot on screen this frame (logical px), and its drawn heading (whole degrees). */
  readonly pivot: [number, number][] = [[0, 0], [0, 0]];
  readonly bankDrawn: [number, number] = [0, 0];
  /** FIELD-1: the battle camera (the battle and the replay; render/camera.ts). Null: today's framing (the title's attract
   *  fight, the hero preview), drawn straight onto the canvas as before. */
  camera: Camera | null = null;
  /** FIELD-1: this frame's camera maps from rest-screen logical px: to the world layer's px (what is drawn), and to the
   *  screen's logical px (what a tap is inverted through). The identity without a camera. */
  readonly cam: Affine = { ...ID };
  readonly scr: Affine = { ...ID };
  private layer: HTMLCanvasElement | null = null;
  private lg: G | null = null;
  /** The world layer's canvas px per layer px this frame. */
  private lf = 1;
  /** The rest-screen x of the view's left edge (with a margin): the wake, dust and contrails stop there. */
  private left = -4;
  private readonly cm: Affine = { ...ID };
  private readonly pose: Pose = { x: 0, y: 0, bank: 0, board: 0, gimbal: 0, bob: 0 };
  private readonly past: Pose = { x: 0, y: 0, bank: 0, board: 0, gimbal: 0, bob: 0 };
  private readonly tmp = [0, 0];
  private readonly pr: Box = { x: 0, y: 0, w: 0, h: 0 };
  /** Tooling (scripts/motiontap.mjs, a test-only probe): the last tap that hit a board tile, with the clock then. MOTION-2
   *  (REVIEW-MOTION1 Q4): a tap draws nothing; the hit test stays for the probe. */
  lastTap: (TileHit & { t: number; n: number }) | null = null;
  taps = 0;

  /** `held` (MOTION-2, the hero preview): the ships stay still on a still sea. FIELD-1: `scene`, the setting (a battle's
   *  pick), or a day whose sea it takes (seaForDay, as before: the hero preview). The test builds' ?sea= knob wins. */
  constructor(seed: number, scene: number | SceneId, opts: MotionOpts, reduced: boolean, held = false) {
    this.model = new MotionModel(seed, { sway: opts.sway, reduced, held });
    this.kind = opts.sea ?? (typeof scene === "number" ? seaForDay(scene) : scene);
    this.medium = mediumOf(this.kind);
    this.perf = MOTION_KNOBS && opts.perf ? new MotionPerf() : null; // ?perf=1: test builds only
  }

  /** The lanes from the battle layout: the rest gap along the firing axis and its least. CUSTOM-3 (REVIEW-STAGE096 R5 b):
   *  with the whole layout (the battle, replays), landscape also keeps the surge inside the boards' margin (laneSpec);
   *  the title's attract fight passes its gap alone and keeps 0.9.6's lanes. */
  setLanes(L: Pick<BattleLayout, "portrait" | "gap"> & Partial<Pick<BattleLayout, "W" | "frames">>, gapMin: number): void {
    if (L.W !== undefined && L.frames) this.model.setLanes(laneSpec({ portrait: L.portrait, gap: L.gap, W: L.W, frames: L.frames }, gapMin));
    else this.model.setLanes({ portrait: L.portrait, gapRest: L.gap, gapMin });
  }

  /** FIELD-1: draw through the battle camera on `grid` (battleLayout.ts battleGrid), zooming about `focus` (rest-screen
   *  logical px). A new grid (a resize) makes a new camera at the shot the old one had. */
  useCamera(grid: Grid, focus: [number, number], shot: Shot = "wide"): Camera {
    const c = this.camera;
    if (!c || c.grid.close !== grid.close || c.grid.wide !== grid.wide || c.grid.unit !== grid.unit) this.camera = new Camera(grid, c ? c.shot : shot);
    this.camera!.focus = focus;
    this.camMaps();
    return this.camera!;
  }

  update(dt: number, reduced: boolean): void {
    this.model.reduced = reduced;
    this.model.advance(dt);
    this.camera?.update(dt); // FIELD-1: a move between shots runs on the display clock
  }

  // ------------------------------------------------------------ transforms

  /** FIELD-1: this frame's camera maps (the identity without a camera). */
  private camMaps(): void {
    const cam = this.camera;
    if (!cam) return;
    this.lf = cam.layerF();
    cam.layerAffine(this.lf, this.cam);
    cam.screenAffine(this.scr);
    this.left = -this.cam.e / this.cam.a - 4;
  }

  /** FIELD-1: the rest-screen point under a screen point (logical px): through the camera's inverse. */
  toRest(x: number, y: number, out: number[]): number[] {
    if (!this.camera) {
      out[0] = x;
      out[1] = y;
      return out;
    }
    return invertAffine(this.scr, x, y, out);
  }

  /** This frame's board maps and carrier pivots (call before drawing; taps read the last frame's). */
  frame(a: Arena): void {
    this.camMaps();
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

  /** ShotMap: a rest-screen point on `side`'s board -> the screen now (before the camera: the world is drawn under it). */
  toScreen(side: Side, x: number, y: number, out: number[]): number[] {
    return applyAffine(this.aff[side], x, y, out);
  }

  /** The tap's hit test: the screen point (logical px), through the camera's inverse (FIELD-1) and the inverse of
   *  (carrier x board), to a board tile (or null). */
  hit(a: Arena, x: number, y: number): TileHit | null {
    this.toRest(x, y, this.tmp);
    const rx = this.tmp[0], ry = this.tmp[1];
    for (const s of [0, 1] as Side[]) {
      if (!a.show[s]) continue;
      invertAffine(this.hitAff[s], rx, ry, this.tmp);
      const f = a.drawn[s];
      const lx = localX(f, this.tmp[0], this.tmp[1]), ly = localY(f, this.tmp[0], this.tmp[1]);
      const cx = Math.floor(lx / TILE), cy = Math.floor(ly / TILE);
      if (cx >= 0 && cy >= 0 && cx < TILES && cy < TILES) return { side: s, cx, cy };
    }
    return null;
  }

  /** SCOUT-1 (REQ-BFG-076): the point under a screen point (logical px) in `side`'s deck px (its board's local frame, as
   *  hit() reads it, without the camera shake): through the camera's inverse and the board's. A turret's mount sits at
   *  render/frame.ts TURRET_LY there, above the grid's first row. */
  localAt(a: Arena, side: Side, x: number, y: number, out: number[]): number[] {
    this.toRest(x, y, this.tmp);
    invertAffine(this.hitAff[side], this.tmp[0], this.tmp[1], this.tmp);
    const f = a.drawn[side];
    out[0] = localX(f, this.tmp[0], this.tmp[1]);
    out[1] = localY(f, this.tmp[0], this.tmp[1]);
    return out;
  }

  /** SCOUT-1: a point in `side`'s deck px on screen now (logical px, without the shake, through the camera): localAt's
   *  inverse (tooling: where a part sits). */
  localToScreen(a: Arena, side: Side, lx: number, ly: number): [number, number] {
    const f = a.drawn[side];
    applyAffine(this.hitAff[side], sx(f, lx, ly), sy(f, lx, ly), this.tmp);
    if (this.camera) applyAffine(this.scr, this.tmp[0], this.tmp[1], this.tmp);
    return [this.tmp[0], this.tmp[1]];
  }

  /** A tile's centre on screen now (logical px, without the camera shake; FIELD-1: through the camera): what a tap must
   *  hit. */
  tileCentre(a: Arena, side: Side, cx: number, cy: number): [number, number] {
    const f = a.drawn[side];
    const lx = (cx + 0.5) * TILE, ly = (cy + 0.5) * TILE;
    applyAffine(this.hitAff[side], sx(f, lx, ly), sy(f, lx, ly), this.tmp);
    if (this.camera) applyAffine(this.scr, this.tmp[0], this.tmp[1], this.tmp);
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

  /** FIELD-1: the world layer for this frame (sized to cover the canvas at `lf` canvas px per layer px), reset. */
  private worldLayer(W: number, H: number): G {
    const gr = this.camera!.grid;
    const lw = Math.ceil((W * gr.sub) / this.lf), lh = Math.ceil((H * gr.sub) / this.lf);
    if (!this.layer || this.layer.width !== lw || this.layer.height !== lh) {
      const [c, lg] = makeCanvas(lw, lh);
      this.layer = c;
      this.lg = lg;
    }
    const lg = this.lg!;
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.imageSmoothingEnabled = false;
    lg.globalAlpha = 1;
    return lg;
  }

  /** FIELD-1: the rows the boards sit in at rest (their plates, with the drift and a margin), through `m`, for the
   *  ground and air settings to keep their features out of (render/backdrop.ts SeaFrame.bands). */
  private bandsFor(g: G, a: Arena | undefined, m: Affine): number[] | undefined {
    if (!a || isSea(this.kind)) return undefined;
    const out: number[] = [];
    for (const s of [0, 1] as Side[]) {
      const r = plateBox(g, a.frames[s], this.pr);
      // the plate's rows with its drift and 18 px more: where its damage smoke and fire drift (the readability test)
      out.push(Math.floor(m.d * (r.y - DRIFT_MAX - 18) + m.f), Math.ceil(m.d * (r.y + r.h + DRIFT_MAX + 18) + m.f));
    }
    return out;
  }

  /** The setting, at the camera shake (as the floor was); held still in a preview. FIELD-1: with a camera, into the world
   *  layer, at the camera's zoom (built once at WIDE's size, so a move between shots never rebuilds it); `a`, the arena
   *  (the boards' rows, for the ground and air settings). */
  drawSea(g: G, W: number, H: number, ox: number, oy: number, scale: number, dpr: number, seed: number, a?: Arena): void {
    const t0 = this.perf ? now() : 0;
    const m = this.model;
    const cam = this.camera;
    if (!cam) {
      const f = { W, H, kind: this.kind, dist: m.dist, t: m.t, reduced: m.reduced, seed, scale, dpr, bands: this.bandsFor(g, a, ID) };
      if (m.held) this.sea.drawStill(g, f);
      else this.sea.draw(g, f, ox, oy);
    } else {
      this.camMaps();
      const lg = this.worldLayer(W, H);
      const gr = cam.grid, fw = gr.wide / gr.unit;
      const bw = Math.ceil((W * gr.sub) / fw), bh = Math.ceil((H * gr.sub) / fw);
      const [fx, fy] = cam.focus;
      // the focus in backdrop px (its place in WIDE's layer at rest) and in this frame's layer
      const bfx = fx + Math.round((gr.sub * fx) / fw - fx), bfy = fy + Math.round((gr.sub * fy) / fw - fy);
      const k = this.cam.a, lfx = k * fx + this.cam.e, lfy = k * fy + this.cam.f;
      let ex = lfx - k * bfx, ey = lfy - k * bfy;
      if (!cam.moving) { ex = Math.round(ex); ey = Math.round(ey); }
      lg.setTransform(k, 0, 0, k, ex, ey);
      const bands = this.bandsFor(g, a, { a: 1, b: 0, c: 0, d: 1, e: bfx - fx, f: bfy - fy });
      this.sea.draw(lg, { W: bw, H: bh, kind: this.kind, dist: m.dist, t: m.t, reduced: m.reduced, seed, scale: gr.wide, dpr, bands }, ox, oy);
      lg.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this.perf) this.perf.add(0, now() - t0);
  }

  /** The arena in motion (drawArena's order: carriers, boards, shots, effects, numbers, the wind, the flash). FIELD-1:
   *  with a camera, the world into its layer (drawSea started it) through the camera, then the layer onto the canvas. */
  draw(g: G, a: Arena, W: number, H: number, reduced: boolean): void {
    const b = a.b;
    const P = this.perf;
    this.frame(a);
    const cam = this.camera;
    const t: G = cam && this.lg ? this.lg : g; // where the world is drawn
    if (cam) t.setTransform(this.cam.a, 0, 0, this.cam.d, this.cam.e, this.cam.f);
    let t0 = P ? now() : 0;
    // carriers: their medium's trail, shadow, hull (screen space; the pivot carries the shake)
    for (const s of [0, 1] as Side[]) {
      if (!a.show[s]) continue;
      if (!this.model.held) this.drawTrail(t, s);
      const hero = a.views[s].model.hero;
      const deg = this.bankDrawn[s];
      const px = this.pivot[s][0], py = this.pivot[s][1];
      const carrier = skinOf(a.views[s].skin).carrier; // CUSTOM-3 (REQ-BFG-074): the player's carrier style; a foe's the default
      drawShip(t, hero, px, py, deg, Math.round(this.model.pose(s, this.model.t, this.pose).bob), carrier, this.medium);
      if (a.loser === s && a.koT > 0.35) dimShip(t, hero, px, py, deg, Math.min(0.62, (a.koT - 0.35) * 1.1), carrier, this.medium);
    }
    if (P) { const t1 = now(); P.add(1, t1 - t0); t0 = t1; }
    // boards, each under its gimbal's transform (FIELD-1: and the camera's): today's drawing code, at rest
    for (const s of [0, 1] as Side[]) {
      if (!a.show[s]) continue;
      const v = a.views[s];
      v.t = a.clock;
      v.tread = a.tread;
      v.flash = b.sides[s].hull.flash;
      const A = cam ? compose(this.cam, this.aff[s], this.cm) : this.aff[s];
      t.save();
      t.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
      const f = a.drawn[s];
      const r = plateBox(t, f, this.pr);
      drawPlate(t, v.model.hero, f.facing, r, skinOf(v.skin).floor); // CUSTOM-2a: the plate cut with this board's floor
      if (v.flash && v.flash > 0.05 && !reduced) {
        rect(t, r.x, r.y, r.w, 1, C.white); rect(t, r.x, r.y + r.h - 1, r.w, 1, C.white);
        rect(t, r.x, r.y, 1, r.h, C.white); rect(t, r.x + r.w - 1, r.y, 1, r.h, C.white);
      }
      a.fx.drawDecals(t, 0, 0, s);
      const hpct = b.sides[s].hull.hp / b.sides[s].hull.max;
      if (hpct < 0.5) cracks(t, f, CRACKS_50, PLATE_HX, PLATE_HX + PLATE_W);
      if (hpct < 0.25) cracks(t, f, CRACKS_25, PLATE_HX, PLATE_HX + PLATE_W);
      drawMachinery(t, v);
      drawTurrets(t, v);
      if (a.loser === v.side && a.koT > 0.35) dimPlate(t, r, Math.min(0.62, (a.koT - 0.35) * 1.1));
      for (const charge of b.sides[s].limpets) {
        const x = Math.round(sx(f, charge.target.x, charge.target.y)), y = Math.round(sy(f, charge.target.x, charge.target.y));
        const blink = Math.floor(a.clock * 8) % 2 === 0 ? C.fire4 : C.red;
        rect(t, x - 2, y - 2, 5, 5, C.ink); rect(t, x - 1, y - 1, 3, 3, blink);
      }
      t.restore();
    }
    if (P) { const t1 = now(); P.add(2, t1 - t0); t0 = t1; }
    // shots, in screen space: from each gun's current place to its target's current place
    if (!b.over) drawShells(t, a, this);
    if (P) { const t1 = now(); P.add(3, t1 - t0); t0 = t1; }
    // effects and numbers ride with their board; the rest at the shake
    for (const s of [0, 1] as Side[]) {
      const A = cam ? compose(this.cam, this.aff[s], this.cm) : this.aff[s];
      t.save();
      t.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
      a.fx.draw(t, 0, 0, s);
      t.restore();
    }
    const ox = a.fx.shakeX, oy = a.fx.shakeY;
    a.fx.draw(t, ox, oy, -1);
    for (const s of [0, 1] as Side[]) {
      const A = cam ? compose(this.cam, this.aff[s], this.cm) : this.aff[s];
      t.save();
      t.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
      a.fx.drawPops(t, 0, 0, s);
      t.restore();
    }
    a.fx.drawPops(t, ox, oy, -1);
    a.fx.drawDecals(t, ox, oy, -1);
    if (cam && this.layer) {
      // FIELD-1: the world layer onto the canvas, `lf` canvas px per layer px (whole: crisp), then the HUD-sized overlays
      t.setTransform(1, 0, 0, 1, 0, 0);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(this.layer, 0, 0, this.layer.width * this.lf, this.layer.height * this.lf);
      g.restore();
    }
    // WIND-2 (REQ-BFG-093): side by side, the storm rolls in from both screen edges (windBoth: the layout at rest)
    const level = b.windLevel() * Math.max(0, 1 - a.overT / 1.2);
    drawWind(g, level, W, H, a.clock, { both: windBoth(hullBox(a.drawn[0]), hullBox(a.drawn[1])), mark: this.windMark });
    this.drawWindPops(g, a, W, H); // WIND-1 (REQ-BFG-093): the wind's numbers above the wind
    if (a.fx.flash > 0 && !reduced) {
      g.globalAlpha = Math.min(0.5, a.fx.flash);
      rect(g, 0, 0, W, H, a.fx.flashColor);
      g.globalAlpha = 1;
    }
    if (P) { P.add(4, now() - t0); P.frame(); }
  }

  /** WIND-1 (REQ-BFG-093): the HUD the dark wind's numbers keep clear of (logical px, at rest: each side's plate and the
   *  playback bar); the battle and the replay set it at each layout. Empty: only the screen's edges. */
  windKeep: { plates: readonly Box[]; bar: Box | null } = { plates: [], bar: null };
  /** WIND-2 (REQ-BFG-093) tooling, display only (scripts/mirror1shots.mjs sets it for one frame, then clears it; the game
   *  never does): a colour the dark wind's band is drawn in, flat and opaque (render/world.ts drawWind's `look.mark`). */
  windMark = "";
  /** WIND-1 tooling (read only; bb.windInfo): the wind numbers drawn this frame, their side, text and box (logical px). */
  readonly windDrawn: { side: Side; text: string; x: number; y: number; w: number; h: number; beside: boolean }[] = [];

  /**
   * WIND-1 (REQ-BFG-093): the dark wind's numbers (Fx.windPop), drawn on the canvas after the wind, so its wash, band and
   * streaks never dim them: the 5x7 face at twice its size (a big hit's number at CLOSE, bigger at WIDE) with an ink outline,
   * upright. Each sits on its own carrier's hull (its board's map and the camera: it rides with the carrier), rises and
   * blinks out as the other numbers do; it is kept inside the screen and clear of both plates and the bar (moved up or down
   * out of one); a carrier whose hull centre is off the screen gets its number beside its own plate instead.
   */
  private drawWindPops(g: G, a: Arena, W: number, H: number): void {
    const fx = a.fx, list = fx.popList, q = this.tmp, keep = this.windKeep, out = this.windDrawn;
    out.length = 0;
    for (let i = 0; i < fx.popCount; i++) {
      const p = list[i];
      if (!p.wind || (p.side !== 0 && p.side !== 1)) continue;
      const s = p.side as Side;
      const k = p.t / p.max;
      if (k > 0.78 && Math.floor(p.t * 22) % 2) continue; // blinks out, as drawPops
      applyAffine(this.aff[s], p.x, p.y, q);
      if (this.camera) applyAffine(this.scr, q[0], q[1], q);
      const w = textWidth(p.text) * 2 + 4, h = 7 * 2 + 4; // the text x2 and its 2 px outline
      const at = placeWindNumber(q[0], q[1], 16 * Math.min(1, k * 2.2), w, h, W, H, keep, s);
      drawText(g, p.text, at.x + 2, at.y + 2, p.t < 0.05 ? C.white : p.color, { outline: C.ink, scale: 2 });
      out.push({ side: s, text: p.text, x: at.x, y: at.y, w, h, beside: at.beside });
    }
  }

  /** FIELD-1: the carrier's trail in its medium: the wake on water, dust on ground, contrails in the air. */
  private drawTrail(g: G, s: Side): void {
    if (this.medium === "water") this.drawWake(g, s);
    else if (this.medium === "ground") this.drawDust(g, s);
    else this.drawContrails(g, s);
  }

  /** The wake: where the stern was over the last few seconds, carried off left by the water, spreading and fading. */
  private drawWake(g: G, s: Side): void {
    const m = this.model;
    const look = SEAS[this.kind as SeaKind];
    const v = look.speeds[2] * m.scrollFactor(); // the water's speed past the hull (the near layer's)
    const sternX = -PIVOT_X + 3;
    const cx = this.pivot[s][0] - Math.round(m.pose(s, m.t, this.past).x), cy = this.pivot[s][1] - Math.round(this.past.y);
    for (let k = 1; k <= WAKE_N; k++) {
      const tau = k * WAKE_DT;
      const p = m.pose(s, m.t - tau, this.past);
      const r = -p.bank * DEG;
      const x = cx + Math.round(p.x) + sternX * Math.cos(r) - v * tau;
      const y = cy + Math.round(p.y) + sternX * Math.sin(r);
      if (x < this.left) break;
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

  /** A point of the carrier `s` (ship-local about its pivot: x aft-to-fore, y across) at its pose `tau` s ago, carried
   *  off left by the ground or air speed `v` since: rest-screen px into `out`. */
  private trailPoint(s: Side, tau: number, lx: number, ly: number, v: number, out: number[]): number[] {
    const m = this.model;
    const cx = this.pivot[s][0] - Math.round(m.pose(s, m.t, this.past).x), cy = this.pivot[s][1] - Math.round(this.past.y);
    const p = m.pose(s, m.t - tau, this.past);
    const r = -p.bank * DEG, c = Math.cos(r), sn = Math.sin(r);
    out[0] = cx + Math.round(p.x) + lx * c - ly * sn - v * tau;
    out[1] = cy + Math.round(p.y) + lx * sn + ly * c;
    return out;
  }

  /** FIELD-1, GROUND: dust kicked up at the treads' aft ends, carried off left as the wake is, swelling and thinning as it
   *  ages (the setting's tan, rust or leaf-brown). Reduce motion: half as long, and it doesn't spread. */
  private drawDust(g: G, s: Side): void {
    const m = this.model;
    const look = LANDS[this.kind as Exclude<SceneId, SeaKind>];
    const [fresh, old] = look.dust ?? ["#6A5A40", "#45392A"];
    const v = look.speeds[2] * m.scrollFactor();
    const [lx, ly] = EMIT.ground;
    const n = m.reduced ? DUST_N / 2 : DUST_N, q = this.tmp;
    for (let k = 1; k <= n; k++) {
      const age = k / n;
      for (const side of [-1, 1]) {
        this.trailPoint(s, k * WAKE_DT, lx, side * ly, v, q);
        if (q[0] < this.left) continue;
        if (age > 0.45 && (k + s + (side > 0 ? 1 : 0)) % 2 === 1) continue; // thinning out
        const sz = 1 + Math.min(2, Math.floor(age * 3));
        const spread = m.reduced ? 0 : Math.round(age * 5) * side;
        rect(g, Math.round(q[0]) - (sz >> 1), Math.round(q[1]) + spread - (sz >> 1), sz, sz, age < 0.35 ? fresh : old);
      }
    }
  }

  /** FIELD-1, AIR: a contrail from each flank's aft engine pod, a 1 px line carried off left, white then grey, fading out
   *  (every other pixel in its last third). Reduce motion: half as long. */
  private drawContrails(g: G, s: Side): void {
    const m = this.model;
    const look = LANDS[this.kind as Exclude<SceneId, SeaKind>];
    const [fresh, old] = look.trail ?? ["#B8C8DA", "#6F86A3"];
    const v = look.speeds[2] * m.scrollFactor();
    const [lx, ly] = EMIT.air;
    const n = m.reduced ? TRAIL_N / 2 : TRAIL_N, q = this.tmp;
    for (const side of [-1, 1]) {
      this.trailPoint(s, 0, lx, side * ly, v, q);
      let px = q[0], py = q[1];
      for (let k = 1; k <= n; k++) {
        this.trailPoint(s, k * WAKE_DT, lx, side * ly, v, q);
        const age = k / n, col = age < 0.4 ? fresh : old;
        const steps = Math.max(1, Math.ceil(Math.abs(px - q[0])));
        for (let i = 0; i < steps; i++) {
          const x = Math.round(px + ((q[0] - px) * i) / steps), y = Math.round(py + ((q[1] - py) * i) / steps);
          if (age > 0.66 && (x + y) % 2 !== 0) continue;
          rect(g, x, y, 1, 1, col);
        }
        px = q[0];
        py = q[1];
        if (px < this.left) break;
      }
    }
  }
}

/**
 * WIND-2 (REQ-BFG-093): the dark wind's mode on this layout, from the two hulls at rest (`a.drawn`: never the camera, so
 * CLOSE never flips it): true when they sit side by side (their centres differ more across than down: the desk, a phone
 * held sideways), where the storm rolls in from both screen edges so each board sits under the same share of it; false
 * when they are stacked (a portrait phone), where today's one front from the left lies over both alike. Pure.
 */
export function windBoth(h0: Box, h1: Box): boolean {
  return Math.abs(h0.x + h0.w / 2 - (h1.x + h1.w / 2)) > Math.abs(h0.y + h0.h / 2 - (h1.y + h1.h / 2));
}

/**
 * WIND-1 (REQ-BFG-093): where a dark wind number of w x h (logical px, its outline included) is drawn: centred on its
 * carrier's point (cx, cy) on screen, `rise` px up; a point off the W x H screen (a carrier out of view) puts it beside its
 * own plate (`keep.plates[side]`), on the screen's side of it. Then inside the screen, 1 px in, and out of every plate and
 * the bar: towards the screen's middle (a plate or bar in the lower half pushes it up, in the upper half down), again until
 * clear (a plate and the bar can sit edge to edge). Pure (tests/wind1.test.ts).
 */
export function placeWindNumber(cx: number, cy: number, rise: number, w: number, h: number, W: number, H: number,
  keep: { plates: readonly Box[]; bar: Box | null }, side: Side): { x: number; y: number; beside: boolean } {
  let x = Math.round(cx - w / 2), y = Math.round(cy - h / 2 - rise);
  const beside = cx < 0 || cx >= W || cy < 0 || cy >= H;
  const pl = keep.plates[side];
  if (beside && pl) {
    x = Math.round(pl.x + pl.w / 2 - w / 2);
    y = pl.y + pl.h / 2 < H / 2 ? pl.y + pl.h + 2 : pl.y - h - 2;
  }
  x = Math.max(1, Math.min(W - w - 1, x));
  y = Math.max(1, Math.min(H - h - 1, y));
  const n = keep.plates.length + (keep.bar ? 1 : 0);
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let j = 0; j < n; j++) {
      const r = j < keep.plates.length ? keep.plates[j] : keep.bar!;
      if (x >= r.x + r.w || r.x >= x + w || y >= r.y + r.h || r.y >= y + h) continue;
      y = r.y + r.h / 2 >= H / 2 ? r.y - h - 1 : r.y + r.h + 1;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, y: Math.max(1, Math.min(H - h - 1, y)), beside };
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
