// Juice: particles, frame animations, damage popups, screen shake, flashes, hit-stop.

import { C } from "./palette";
import { explosion, muzzleFlash, smokePuff, sparkStar } from "./sprites";
import { drawText } from "./font";
import type { G } from "./pixel";

export type PKind = "px" | "smoke" | "ember" | "debris" | "streak" | "dust";

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  color2: string;
  size: number;
  grav: number;
  drag: number;
  dark: boolean;
}

interface Anim {
  kind: "ex" | "mf" | "spark";
  x: number;
  y: number;
  t: number;
  fps: number;
  frames: number;
  size: number;
  cool: boolean;
  facing: 0 | 2;
  heavy: boolean;
  delay: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  max: number;
  big: boolean;
}

export class Fx {
  parts: Particle[] = [];
  anims: Anim[] = [];
  pops: Popup[] = [];
  trauma = 0;
  flash = 0; // screen flash 0..1
  flashColor = C.white;
  hitstop = 0;
  shakeX = 0;
  shakeY = 0;
  private seed = 1;

  rnd(): number {
    // local cosmetic RNG (never used by the simulation)
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  clear(): void {
    this.parts = [];
    this.anims = [];
    this.pops = [];
    this.trauma = 0;
    this.flash = 0;
    this.hitstop = 0;
  }

  addTrauma(a: number): void {
    this.trauma = Math.min(1, this.trauma + a);
  }

  update(dt: number): void {
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    this.shakeX = Math.round((this.rnd() * 2 - 1) * 6 * s);
    this.shakeY = Math.round((this.rnd() * 2 - 1) * 5 * s);
    this.flash = Math.max(0, this.flash - dt * 6);
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      keep.push(p);
    }
    this.parts = keep;
    this.anims = this.anims.filter((a) => {
      if (a.delay > 0) {
        a.delay -= dt;
        return true;
      }
      a.t += dt;
      return a.t * a.fps < a.frames;
    });
    this.pops = this.pops.filter((p) => {
      p.t += dt;
      return p.t < p.max;
    });
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  }

  private push(p: Partial<Particle> & { x: number; y: number }): void {
    this.parts.push({
      kind: "px", vx: 0, vy: 0, life: 0.5, max: 0.5, color: C.white, color2: C.white, size: 1,
      grav: 0, drag: 1, dark: false, ...p,
    } as Particle);
  }

  sparks(x: number, y: number, n: number, colors: string[], speed = 60, grav = 90): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = speed * (0.3 + this.rnd() * 0.9);
      const life = 0.2 + this.rnd() * 0.35;
      this.push({
        kind: "px", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life, max: life,
        color: colors[i % colors.length], color2: colors[(i + 1) % colors.length], grav, drag: 0.93,
      });
    }
  }

  embers(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const life = 0.4 + this.rnd() * 0.6;
      this.push({
        kind: "ember", x: x + (this.rnd() - 0.5) * 4, y, vx: (this.rnd() - 0.5) * 10, vy: -12 - this.rnd() * 18,
        life, max: life, color: C.fire4, color2: C.fire1, grav: -6, drag: 0.98,
      });
    }
  }

  smoke(x: number, y: number, n: number, dark = false, rise = 10): void {
    for (let i = 0; i < n; i++) {
      const life = 0.6 + this.rnd() * 0.8;
      this.push({
        kind: "smoke", x: x + (this.rnd() - 0.5) * 3, y: y + (this.rnd() - 0.5) * 3, vx: (this.rnd() - 0.5) * 8,
        vy: -rise * (0.5 + this.rnd()), life, max: life, size: 2 + Math.floor(this.rnd() * 3), dark, drag: 0.97,
      });
    }
  }

  dust(x: number, y: number, n: number, vy = 18): void {
    for (let i = 0; i < n; i++) {
      const life = 0.4 + this.rnd() * 0.5;
      this.push({
        kind: "dust", x: x + (this.rnd() - 0.5) * 6, y, vx: (this.rnd() - 0.5) * 10, vy: vy * (0.6 + this.rnd() * 0.6),
        life, max: life, size: 1 + Math.floor(this.rnd() * 2), color: C.soil5, color2: C.soil3, drag: 0.95,
      });
    }
  }

  debris(x: number, y: number, n: number, colors: string[]): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = 40 + this.rnd() * 70;
      const life = 0.35 + this.rnd() * 0.4;
      this.push({
        kind: "debris", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life,
        color: colors[i % colors.length], color2: C.ink, size: 2, grav: 120, drag: 0.9,
      });
    }
  }

  streak(x: number, y: number, vx: number, vy: number, life: number, color: string): void {
    this.push({ kind: "streak", x, y, vx, vy, life, max: life, color, color2: color });
  }

  explode(x: number, y: number, size: number, cool = false, delay = 0): void {
    this.anims.push({ kind: "ex", x, y, t: 0, fps: 18, frames: 7, size, cool, facing: 0, heavy: true, delay });
  }

  muzzle(x: number, y: number, heavy: boolean, facing: 0 | 2): void {
    this.anims.push({ kind: "mf", x, y, t: 0, fps: heavy ? 20 : 26, frames: heavy ? 3 : 2, size: 0, cool: false, facing, heavy, delay: 0 });
  }

  sparkle(x: number, y: number, delay = 0): void {
    this.anims.push({ kind: "spark", x, y, t: 0, fps: 14, frames: 3, size: 0, cool: false, facing: 0, heavy: false, delay });
  }

  popup(x: number, y: number, text: string, color: string, big = false): void {
    this.pops.push({ x, y, text, color, t: 0, max: big ? 1.1 : 0.8, big });
  }

  screenFlash(color: string, amount: number): void {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  /** Draw world-space effects with offset (ox, oy) = screen position of world origin. */
  draw(g: G, ox: number, oy: number): void {
    for (const p of this.parts) {
      const x = Math.round(p.x + ox), y = Math.round(p.y + oy);
      const t = p.life / p.max;
      switch (p.kind) {
        case "smoke": {
          const img = smokePuff(p.size, p.dark);
          if (t < 0.35 && ((x + y) & 1)) break;
          g.drawImage(img, x - img.width / 2, y - img.height / 2);
          break;
        }
        case "ember": {
          g.fillStyle = t > 0.5 ? p.color : p.color2;
          g.fillRect(x, y, 1, 1);
          break;
        }
        case "debris": {
          g.fillStyle = p.color2;
          g.fillRect(x - 1, y - 1, 3, 3);
          g.fillStyle = p.color;
          g.fillRect(x, y - 1, 1, 2);
          break;
        }
        case "streak": {
          g.fillStyle = p.color;
          const len = 3;
          const n = Math.hypot(p.vx, p.vy) || 1;
          for (let k = 0; k < len; k++) g.fillRect(Math.round(x - (p.vx / n) * k), Math.round(y - (p.vy / n) * k), 1, 1);
          break;
        }
        case "dust": {
          g.fillStyle = t > 0.5 ? p.color : p.color2;
          g.fillRect(x, y, p.size, p.size);
          break;
        }
        default: {
          g.fillStyle = t > 0.45 ? p.color : p.color2;
          g.fillRect(x, y, p.size, p.size);
        }
      }
    }
    for (const a of this.anims) {
      if (a.delay > 0) continue;
      const f = Math.min(a.frames - 1, Math.floor(a.t * a.fps));
      let img: HTMLCanvasElement;
      if (a.kind === "ex") img = explosion(a.size, f, a.cool);
      else if (a.kind === "mf") img = muzzleFlash(a.heavy ? "heavy" : "light", f, a.facing);
      else img = sparkStar(f);
      g.drawImage(img, Math.round(a.x + ox - img.width / 2), Math.round(a.y + oy - img.height / 2));
    }
    for (const p of this.pops) {
      const k = p.t / p.max;
      const rise = p.big ? 14 : 10;
      const y = p.y + oy - rise * Math.min(1, k * 1.6);
      if (k > 0.75 && Math.floor(p.t * 20) % 2) continue;
      drawText(g, p.text, p.x + ox, y, p.color, { font: p.big ? "5" : "3", align: "center", outline: C.ink });
    }
  }
}
