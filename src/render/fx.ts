// Juice: pooled particles, frame animations, damage numbers, scorch decals, screen shake,
// flashes and hit-stop. Nothing here allocates per frame; spawn calls reuse pooled slots.
// Reduced Motion (settings) zeroes the camera shake and suppresses full-screen flashes but
// keeps every gameplay cue (sparks, numbers, decals).

import { settings } from "../core/settings";
import { C } from "./palette";
import { DEBRIS, DUST, EMBER, Particles, SMOKE, SPARK, STREAK, cid } from "./particles";
import { explosion, sparkStar } from "./sprites";
import { muzzleFlash, ringSprite, scorchSprite } from "./fxsprites";
import { drawText } from "./font";
import type { G } from "./pixel";

const EX = 0, MF = 1, SP = 2, RING = 3;

interface Anim {
  kind: number;
  x: number;
  y: number;
  t: number;
  fps: number;
  frames: number;
  size: number;
  cool: boolean;
  dir: number;
  heavy: boolean;
  delay: number;
  color: string;
  side: number; // MOTION-1: the board it rides with (-1: none)
}

/** A damage number in the pool. WIND-1 (REQ-BFG-093): exported, read only, for the dark wind's numbers (`wind`), which
 *  ArenaMotion draws above the wind; drawPops draws every other one. */
export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  max: number;
  big: boolean;
  side: number; // MOTION-1
  wind: boolean; // WIND-1: a dark wind number (Fx.windPop)
}

/** WIND-1 (REQ-BFG-093): the longest a dark wind number lives (s, effect time): a big hit's. */
export const WIND_POP_MAX = 1.15;

interface Decal {
  x: number;
  y: number;
  r: number;
  v: number;
  t: number;
  max: number;
  side: number; // MOTION-1
}

/** MOTION-1 (REQ-BFG-071): draw every effect, whatever board it belongs to (the default: as before motion). */
export const ALL_SIDES = -2;

function pool<T>(n: number, make: () => T): T[] {
  const a: T[] = [];
  for (let i = 0; i < n; i++) a.push(make());
  return a;
}

const SMOKE_LIGHT = cid(C.slate3), SMOKE_DARK = cid(C.slate0);
const DUST0 = cid(C.soil5), DUST1 = cid(C.soil3);
const EMB0 = cid(C.fire4), EMB1 = cid(C.fire1);

export class Fx {
  readonly parts = new Particles(1400);
  private anims = pool<Anim>(128, () => ({ kind: 0, x: 0, y: 0, t: 0, fps: 0, frames: 0, size: 0, cool: false, dir: 0, heavy: false, delay: 0, color: C.white, side: -1 }));
  private na = 0;
  private pops = pool<Popup>(48, () => ({ x: 0, y: 0, text: "", color: C.white, t: 0, max: 1, big: false, side: -1, wind: false }));
  private np = 0;
  private decals = pool<Decal>(40, () => ({ x: 0, y: 0, r: 0, v: 0, t: 0, max: 1, side: -1 }));
  private nd = 0;
  private anchorSide = -1;
  /** MOTION-1 (REQ-BFG-071, display only): the board the next spawns belong to (0, 1; -1 none). The arena's react() sets
   *  it per event; a motion build draws each board's effects with that board's transform, so hits, flashes and numbers
   *  stay on their tile while the ships move. Drawing without a side (the default) draws them all, as before. */
  get anchor(): number {
    return this.anchorSide;
  }
  set anchor(s: number) {
    this.anchorSide = s;
    this.parts.tag = s;
  }
  trauma = 0;
  flash = 0; // screen flash 0..1
  flashColor: string = C.white;
  hitstop = 0; // frames to freeze
  shakeX = 0;
  shakeY = 0;
  private kickX = 0;
  private kickY = 0;
  // landing-frame punch of a hit: exact minimum offset (world px) on the next update
  private landPx = 0;
  private landX = 0;
  private landY = 0;
  private seed = 1;

  /** Cosmetic RNG (never the simulation's). */
  rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Tooling (metrics, bb.seedFx): restart the cosmetic RNG at `seed`, so a measured shake
   *  repeats exactly. Never the simulation's RNG. */
  reseed(seed: number): void {
    this.seed = seed >>> 0;
  }

  clear(): void {
    this.parts.clear();
    this.na = this.np = this.nd = 0;
    this.trauma = this.flash = this.hitstop = 0;
    this.kickX = this.kickY = this.shakeX = this.shakeY = 0;
    this.landPx = this.landX = this.landY = 0;
  }

  get busy(): number {
    return this.parts.n + this.na;
  }

  /** Live counts (tooling / screenshots). */
  stats(): { parts: number; anims: number; muzzles: number; explosions: number; bigFresh: number; pops: number } {
    let muzzles = 0, explosions = 0, bigFresh = 0;
    for (let i = 0; i < this.na; i++) {
      const a = this.anims[i];
      if (a.delay > 0) continue;
      if (a.kind === MF) muzzles++;
      else if (a.kind === EX) {
        explosions++;
        if (a.size >= 18 && a.t * a.fps < 3) bigFresh++;
      }
    }
    return { parts: this.parts.n, anims: this.na, muzzles, explosions, bigFresh, pops: this.np };
  }

  addTrauma(a: number): void {
    this.trauma = Math.min(1, this.trauma + a);
  }

  /** Directional punch (px), e.g. along the travel of a heavy shell. */
  kick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
  }

  /** A hit lands: the next frame's camera offset is at least `px` world px (|x|+|y|), along
   *  (dx, dy) if the noise and kick come out smaller. Deterministic: whatever the cosmetic RNG
   *  returns, the landing frame shows the punch. The strongest punch of a frame wins. */
  land(dx: number, dy: number, px: number): void {
    if (px <= this.landPx) return;
    this.landPx = px;
    this.landX = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? -1 : 1) : 0;
    this.landY = this.landX === 0 ? (dy < 0 ? -1 : 1) : 0;
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const k = Math.pow(0.78, dt * 60);
    this.kickX *= k;
    this.kickY *= k;
    if (settings.reducedMotion) {
      this.shakeX = this.shakeY = 0;
    } else {
      // trauma^1.5: light bolts stay ~1 px, heavy shells 2-3 px, a KO 6+ px (world pixels)
      const s = this.trauma * Math.sqrt(this.trauma);
      this.shakeX = Math.round((this.rnd() * 2 - 1) * 7 * s + this.kickX);
      this.shakeY = Math.round((this.rnd() * 2 - 1) * 6 * s + this.kickY);
      if (this.landPx > 0 && Math.abs(this.shakeX) + Math.abs(this.shakeY) < this.landPx) {
        this.shakeX = this.landX * this.landPx;
        this.shakeY = this.landY * this.landPx;
      }
    }
    this.landPx = 0;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.parts.update(dt);
    let i = 0;
    while (i < this.na) {
      const a = this.anims[i];
      if (a.delay > 0) a.delay -= dt;
      else a.t += dt;
      if (a.delay <= 0 && a.t * a.fps >= a.frames) this.killAnim(i);
      else i++;
    }
    i = 0;
    while (i < this.np) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t >= p.max) this.swap(this.pops, i, --this.np);
      else i++;
    }
    i = 0;
    while (i < this.nd) {
      const d = this.decals[i];
      d.t += dt;
      if (d.t >= d.max) this.swap(this.decals, i, --this.nd);
      else i++;
    }
  }

  private swap<T>(arr: T[], i: number, j: number): void {
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }

  private killAnim(i: number): void {
    this.swap(this.anims, i, --this.na);
  }

  private anim(kind: number, x: number, y: number, fps: number, frames: number): Anim | null {
    if (this.na >= this.anims.length) return null;
    const a = this.anims[this.na++];
    a.kind = kind; a.x = x; a.y = y; a.t = 0; a.fps = fps; a.frames = frames;
    a.size = 0; a.cool = false; a.dir = 0; a.heavy = false; a.delay = 0; a.color = C.white;
    a.side = this.anchorSide;
    return a;
  }

  // ------------------------------------------------------------ spawners

  sparks(x: number, y: number, n: number, colors: readonly string[], speed = 70, grav = 0): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = speed * (0.35 + this.rnd() * 0.9);
      const life = 0.18 + this.rnd() * 0.3;
      this.parts.spawn(SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, life, cid(colors[i % colors.length]), cid(colors[(i + 1) % colors.length]), this.rnd() < 0.25 ? 2 : 1, grav, 0.9);
    }
  }

  /** Sparks sprayed in a cone around (dx, dy). */
  spray(x: number, y: number, n: number, dx: number, dy: number, colors: readonly string[], speed = 90): void {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + (this.rnd() - 0.5) * 1.3;
      const v = speed * (0.45 + this.rnd() * 0.8);
      this.parts.spawn(STREAK, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.15 + this.rnd() * 0.2, cid(colors[i % colors.length]), cid(colors[colors.length - 1]), 1, 0, 0.88);
    }
  }

  /** 0.6.1b DRAKE NOZZLE: a short fire-cone puff at the muzzle, facing (dx, dy) -- its flame cone's launch. */
  flameJet(x: number, y: number, dx: number, dy: number): void {
    this.spray(x, y, 3, dx, dy, [C.fire4, C.fire3, C.fire1], 55);
    this.embers(x, y, 2);
  }

  embers(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const life = 0.4 + this.rnd() * 0.6;
      this.parts.spawn(EMBER, x + (this.rnd() - 0.5) * 4, y, (this.rnd() - 0.5) * 10, -12 - this.rnd() * 18, life, EMB0, EMB1, 1, -6, 0.98);
    }
  }

  smoke(x: number, y: number, n: number, dark = false, rise = 10): void {
    for (let i = 0; i < n; i++) {
      const life = 0.6 + this.rnd() * 0.8;
      const c = dark ? SMOKE_DARK : SMOKE_LIGHT;
      this.parts.spawn(SMOKE, x + (this.rnd() - 0.5) * 3, y + (this.rnd() - 0.5) * 3, (this.rnd() - 0.5) * 8, -rise * (0.5 + this.rnd()), life, c, c, 2 + Math.floor(this.rnd() * 2), 0, 0.97);
    }
  }

  dust(x: number, y: number, n: number, vy = 18): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = 10 + this.rnd() * 16;
      this.parts.spawn(DUST, x + (this.rnd() - 0.5) * 6, y, Math.cos(a) * v, Math.sin(a) * v * 0.6 + vy * 0.3, 0.35 + this.rnd() * 0.4, DUST0, DUST1, 1 + Math.floor(this.rnd() * 2), 0, 0.9);
    }
  }

  debris(x: number, y: number, n: number, colors: readonly string[], speed = 55): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = speed * (0.4 + this.rnd() * 0.9);
      this.parts.spawn(DEBRIS, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.7 + this.rnd() * 0.6, cid(colors[i % colors.length]), cid(colors[i % colors.length]), 2, 260, 0.985, 1, 50 + this.rnd() * 70);
    }
  }

  explode(x: number, y: number, size: number, cool = false, delay = 0): void {
    const a = this.anim(EX, x, y, 18, 7);
    if (!a) return;
    a.size = size; a.cool = cool; a.delay = delay;
  }

  muzzle(x: number, y: number, heavy: boolean, dir: number): void {
    const a = this.anim(MF, x, y, heavy ? 22 : 28, heavy ? 3 : 2);
    if (!a) return;
    a.heavy = heavy; a.dir = dir;
  }

  sparkle(x: number, y: number, delay = 0): void {
    const a = this.anim(SP, x, y, 14, 3);
    if (a) a.delay = delay;
  }

  ring(x: number, y: number, maxR: number, color: string, delay = 0): void {
    const a = this.anim(RING, x, y, 30, Math.max(2, Math.floor(maxR / 2)));
    if (!a) return;
    a.color = color; a.delay = delay; a.size = maxR;
  }

  popup(x: number, y: number, text: string, color: string, big = false): void {
    if (this.np >= this.pops.length) return;
    const p = this.pops[this.np++];
    p.x = x; p.y = y; p.text = text; p.color = color; p.t = 0; p.max = big ? 1.15 : 0.85; p.big = big;
    p.side = this.anchorSide;
    p.wind = false; // WIND-1
  }

  /**
   * WIND-1 (REQ-BFG-093): the dark wind's number on the anchor's hull, at (x, y) (rest-screen px, as popup's), living `max` s
   * of effect time (at most WIND_POP_MAX). A full pool never loses one: it takes the slot of the ordinary number with the
   * most of its life gone (were every slot a wind number, the oldest of all). Big, and drawn above the wind (ArenaMotion,
   * from windPops); drawPops never draws it. popup's own parameters are unchanged.
   */
  windPop(x: number, y: number, text: string, color: string, max = WIND_POP_MAX): void {
    let p: Popup;
    if (this.np < this.pops.length) p = this.pops[this.np++];
    else {
      let k = -1;
      for (let i = 0; i < this.np; i++) {
        const q = this.pops[i];
        if (!q.wind && (k < 0 || q.t / q.max > this.pops[k].t / this.pops[k].max)) k = i;
      }
      if (k < 0) for (let i = 0; i < this.np; i++) if (k < 0 || this.pops[i].t > this.pops[k].t) k = i;
      p = this.pops[k];
    }
    p.x = x; p.y = y; p.text = text; p.color = color; p.t = 0; p.max = Math.min(WIND_POP_MAX, max); p.big = true;
    p.side = this.anchorSide;
    p.wind = true;
  }

  /** WIND-1 (REQ-BFG-093): the live numbers (read only; the first `popCount`), for the wind's numbers' own pass. */
  get popList(): readonly Popup[] {
    return this.pops;
  }

  get popCount(): number {
    return this.np;
  }

  scorch(x: number, y: number, r: number): void {
    const d = this.nd < this.decals.length ? this.decals[this.nd++] : this.decals[Math.floor(this.rnd() * this.decals.length)];
    d.x = x; d.y = y; d.r = r; d.v = Math.floor(this.rnd() * 4); d.t = 0; d.max = 5;
    d.side = this.anchorSide;
  }

  screenFlash(color: string, amount: number): void {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  // ------------------------------------------------------------ drawing

  /** MOTION-1: `only` draws one board's decals (-1: those of none); absent, all of them, as before. */
  drawDecals(g: G, ox: number, oy: number, only = ALL_SIDES): void {
    for (let i = 0; i < this.nd; i++) {
      const d = this.decals[i];
      if (only !== ALL_SIDES && d.side !== only) continue;
      const k = 1 - d.t / d.max;
      g.globalAlpha = Math.min(0.7, k * 1.2);
      const img = scorchSprite(d.r, d.v);
      g.drawImage(img, Math.round(d.x + ox - img.width / 2), Math.round(d.y + oy - img.height / 2));
    }
    g.globalAlpha = 1;
  }

  /** MOTION-1: `only` draws one board's particles and animations (-1: those of none); absent, all, as before. */
  draw(g: G, ox: number, oy: number, only = ALL_SIDES): void {
    this.parts.draw(g, ox, oy, only);
    for (let i = 0; i < this.na; i++) {
      const a = this.anims[i];
      if (a.delay > 0) continue;
      if (only !== ALL_SIDES && a.side !== only) continue;
      const f = Math.min(a.frames - 1, Math.floor(a.t * a.fps));
      let img: HTMLCanvasElement;
      if (a.kind === EX) img = explosion(a.size, f, a.cool);
      else if (a.kind === MF) img = muzzleFlash(a.heavy, f, a.dir);
      else if (a.kind === RING) img = ringSprite(Math.min(a.size, 3 + f * 2), a.color);
      else img = sparkStar(f);
      g.drawImage(img, Math.round(a.x + ox - img.width / 2), Math.round(a.y + oy - img.height / 2));
    }
  }

  /** Damage numbers: pop up, hold, blink out. Drawn above everything in the world (WIND-2, REQ-BFG-093: and above the dark
   *  wind: ArenaMotion.drawPops draws them on the canvas after it, as the world layer would). */
  drawPops(g: G, ox: number, oy: number, only = ALL_SIDES): void {
    for (let i = 0; i < this.np; i++) {
      const p = this.pops[i];
      if (p.wind) continue; // WIND-1 (REQ-BFG-093): the wind's numbers have their own pass, above the wind
      if (only !== ALL_SIDES && p.side !== only) continue;
      const k = p.t / p.max;
      const rise = (p.big ? 16 : 11) * Math.min(1, k * 2.2);
      if (k > 0.78 && Math.floor(p.t * 22) % 2) continue;
      const col = p.t < 0.05 ? C.white : p.color;
      drawText(g, p.text, Math.round(p.x + ox), Math.round(p.y + oy - rise), col, { align: "center", outline: C.ink, scale: p.big ? 2 : 1 });
    }
  }
}
