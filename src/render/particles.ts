// Pooled particles: fixed-capacity struct-of-arrays, swap-remove on death, no allocation
// after construction. Positions are world space; z lifts a particle off the ground (debris
// arcs and bounces, drawn with a contact shadow).

import { C } from "./palette";
import { makeCanvas, type G } from "./pixel";

export const SPARK = 0, EMBER = 1, SMOKE = 2, DEBRIS = 3, DUST = 4, STREAK = 5;

const COLORS: string[] = [];
const INDEX = new Map<string, number>();
/** Colour -> small integer id (particles store ids, not strings). */
export function cid(hex: string): number {
  let i = INDEX.get(hex);
  if (i === undefined) {
    i = COLORS.length;
    COLORS.push(hex);
    INDEX.set(hex, i);
  }
  return i;
}

const puffs = new Map<number, HTMLCanvasElement>();
function puff(r: number, dark: boolean): HTMLCanvasElement {
  const k = r * 2 + (dark ? 1 : 0);
  let c = puffs.get(k);
  if (!c) {
    const s = r * 2 + 2;
    const [cv, g] = makeCanvas(s, s);
    const body = dark ? C.slate0 : C.slate3, hi = dark ? C.slate1 : C.slate4;
    const disc = (cx: number, cy: number, rr: number, col: string) => {
      g.fillStyle = col;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rr * rr) g.fillRect(x, y, 1, 1);
    };
    disc(s / 2, s / 2, r, body);
    disc(s / 2 - r * 0.3, s / 2 - r * 0.3, r * 0.55, hi);
    c = cv;
    puffs.set(k, c);
  }
  return c;
}

export class Particles {
  readonly cap: number;
  n = 0;
  readonly kind: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;
  readonly grav: Float32Array;
  readonly drag: Float32Array;
  readonly c0: Uint16Array;
  readonly c1: Uint16Array;
  readonly size: Uint8Array;
  /** MOTION-1 (REQ-BFG-071, display only): the board a particle belongs to (-1: none), from `tag` when it spawned, so a
   *  motion build draws it riding with that board. Without motion, draw() is called for every side, as before. */
  readonly side: Int8Array;
  tag = -1;

  constructor(cap = 1400) {
    this.cap = cap;
    this.kind = new Uint8Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.c0 = new Uint16Array(cap);
    this.c1 = new Uint16Array(cap);
    this.size = new Uint8Array(cap);
    this.side = new Int8Array(cap);
  }

  clear(): void {
    this.n = 0;
  }

  /** Spawn one particle; when full the oldest slot is recycled. Returns its index. */
  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, c0: number, c1: number, size = 1, grav = 0, drag = 1, z = 0, vz = 0): number {
    let i = this.n;
    if (i >= this.cap) i = (Math.floor(x * 7 + y * 13) & 0x7fffffff) % this.cap;
    else this.n++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.c0[i] = c0;
    this.c1[i] = c1;
    this.size[i] = size;
    this.side[i] = this.tag;
    return i;
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.kind[i] = this.kind[j];
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.z[i] = this.z[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.vz[i] = this.vz[j];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.grav[i] = this.grav[j];
    this.drag[i] = this.drag[j];
    this.c0[i] = this.c0[j];
    this.c1[i] = this.c1[j];
    this.size[i] = this.size[j];
    this.side[i] = this.side[j];
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const l = this.life[i] - dt;
      if (l <= 0) {
        this.kill(i);
        continue;
      }
      this.life[i] = l;
      const d = 1 - (1 - this.drag[i]) * Math.min(3, dt * 60);
      this.vx[i] *= d;
      this.vy[i] *= d;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      if (this.kind[i] === DEBRIS) {
        this.vz[i] -= this.grav[i] * dt;
        let z = this.z[i] + this.vz[i] * dt;
        if (z < 0) {
          z = 0;
          this.vz[i] = -this.vz[i] * 0.35;
          this.vx[i] *= 0.55;
          this.vy[i] *= 0.55;
        }
        this.z[i] = z;
      } else {
        this.vy[i] += this.grav[i] * dt;
      }
      i++;
    }
  }

  /** MOTION-1: `only` (>= -1) draws one board's particles (-1: those of none); absent, every particle, as before. */
  draw(g: G, ox: number, oy: number, only = -2): void {
    for (let i = 0; i < this.n; i++) {
      if (only !== -2 && this.side[i] !== only) continue;
      const x = Math.round(this.x[i] + ox), y = Math.round(this.y[i] + oy);
      const t = this.life[i] / this.max[i];
      const col = COLORS[t > 0.5 ? this.c0[i] : this.c1[i]];
      switch (this.kind[i]) {
        case SMOKE: {
          if (t < 0.3 && ((x + y) & 1)) break;
          const r = Math.min(6, this.size[i] + Math.floor((1 - t) * 2.5));
          const img = puff(r, this.c0[i] === 1);
          g.drawImage(img, x - (img.width >> 1), y - (img.height >> 1));
          break;
        }
        case DEBRIS: {
          const zy = Math.round(this.z[i]);
          if (zy > 0) {
            g.fillStyle = C.ink;
            g.fillRect(x - 1, y, 2, 1);
          }
          g.fillStyle = C.ink;
          g.fillRect(x - 1, y - zy - 1, 3, 3);
          g.fillStyle = col;
          g.fillRect(x, y - zy - 1, 1, 2);
          break;
        }
        case STREAK:
        case SPARK: {
          g.fillStyle = col;
          const s = this.size[i];
          g.fillRect(x, y, s, s);
          const sp = Math.abs(this.vx[i]) + Math.abs(this.vy[i]);
          if (sp > 40) {
            const k = 2 / sp;
            g.fillRect(Math.round(x - this.vx[i] * k), Math.round(y - this.vy[i] * k), 1, 1);
          }
          break;
        }
        default: {
          g.fillStyle = col;
          const s = this.size[i];
          g.fillRect(x, y, s, s);
        }
      }
    }
  }
}

/** Dark smoke puffs use colour id 1 (reserved below) so the draw loop can pick the ramp. */
cid(C.slate3);
cid(C.slate0);
