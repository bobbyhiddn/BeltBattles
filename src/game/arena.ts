// Live battle playback: the fixed-step simulation driven at a chosen speed and turned into
// sound and screen juice (muzzle flashes, impacts, shake, hit-stop, popups). Shared by the
// battle screen, the title attract loop and the hero preview.

import type { Audio } from "../audio/audio";
import { Battle, type Side, type SimEvent } from "../sim/battle";
import { CELL, HEROES, TICK } from "../sim/content";
import { hullShade } from "../render/sprites";
import type { Build } from "../sim/deck";
import { Fx } from "../render/fx";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import {
  drawCloudShadows, drawCruiser, drawGround, drawProjectiles, drawWind, hullOrigin, hullRect, l2w, turretPivot,
} from "../render/world";

export class Arena {
  b: Battle;
  readonly fx = new Fx();
  speed = 1;
  paused = false;
  scroll = 0;
  tread = 0;
  clock = 0; // render clock: real seconds scaled by playback speed
  offY: [number, number] = [0, 0]; // per-side draw offsets (drive-in animation)
  sound: Audio | null;
  quiet = false; // attract mode: no sound
  show: [boolean, boolean] = [true, true]; // hero preview hides the dummy opponent
  overT = 0; // seconds since the battle ended (fades the storm front out)
  private acc = 0;

  constructor(player: Build, enemy: Build, seed: number, sound: Audio | null) {
    this.b = new Battle(player, enemy, seed);
    this.sound = sound;
  }

  /** Advance playback; returns the simulation events produced this frame. */
  update(dt: number, drive = true): SimEvent[] {
    const out: SimEvent[] = [];
    let k = this.paused ? 0 : 1;
    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= dt;
      k *= 0.08;
    }
    const sdt = dt * k * this.speed;
    this.clock += sdt;
    this.scroll += dt * k * 12;
    this.tread += dt * k * 12;
    if (drive && !this.b.over) {
      this.acc += sdt;
      let n = 0;
      while (this.acc >= TICK && n < 600 && !this.b.over) {
        this.b.step();
        this.acc -= TICK;
        n++;
        for (const e of this.b.drainEvents()) {
          this.react(e);
          out.push(e);
        }
      }
    }
    if (this.b.over) {
      this.overT += dt;
      this.b.settle(dt * k);
      // the wreck keeps smouldering
      for (const side of [0, 1] as Side[]) {
        if (this.b.sides[side].hull.hp > 0 || !this.show[side] || this.fx.rnd() > dt * 8) continue;
        const h = this.hullCenter(side);
        this.fx.smoke(h.x + (this.fx.rnd() - 0.5) * 120, h.y + (this.fx.rnd() - 0.5) * 110, 1, true, 12);
      }
    }
    this.fx.update(dt * k * Math.min(2, Math.max(1, this.speed * 0.75)));
    return out;
  }

  /** Resolve the rest of the battle instantly (SKIP). Only the end event is animated. */
  finish(): SimEvent[] {
    const out: SimEvent[] = [];
    while (!this.b.over && this.b.ticks < 60 * 200) {
      this.b.step();
      for (const e of this.b.drainEvents()) if (e.type === "end") out.push(e);
    }
    this.fx.clear();
    for (const e of out) this.react(e);
    return out;
  }

  private at(side: Side, lx: number, ly: number): { x: number; y: number } {
    const p = l2w(side, lx, ly);
    return { x: p.x, y: p.y + this.offY[side] };
  }

  hullCenter(side: Side): { x: number; y: number } {
    const r = hullRect(side);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 + this.offY[side] };
  }

  private react(e: SimEvent): void {
    const fx = this.fx;
    const snd = this.quiet ? null : this.sound;
    const fast = this.speed > 2;
    switch (e.type) {
      case "produce": {
        const f = this.b.sides[e.side].factories.find((q) => q.uid === e.factory);
        if (!f) return;
        const p = this.at(e.side, (f.x + f.def.size / 2) * CELL, (f.y + f.def.size / 2) * CELL);
        fx.smoke(p.x + 4, p.y - 8, 1, true, 10);
        if (f.def.id === "kiln") fx.embers(p.x, p.y - 6, 2);
        if (e.side === 0) snd?.play("stamp");
        return;
      }
      case "process": {
        const gs = this.b.sides[e.side].gates.find((q) => q.uid === e.gate);
        if (!gs) return;
        const p = this.at(e.side, (gs.x + 0.5) * CELL, (gs.y + 0.5) * CELL);
        if (e.def === "temper") {
          fx.embers(p.x, p.y, 3);
          if (e.side === 0) snd?.play("sizzle");
        } else if (e.def === "coil") {
          fx.sparks(p.x, p.y, 4, [C.ice, C.white], 40, 0);
          if (e.side === 0) snd?.play("zap");
        } else if (e.def === "whetstone") fx.sparks(p.x, p.y, 3, [C.yellow, C.white], 50);
        else if (e.def === "splitter") fx.sparks(p.x, p.y, 3, [C.plum4, C.white], 30, 0);
        else fx.sparks(p.x, p.y, 2, [C.bone, C.steel3], 24, 0);
        return;
      }
      case "commission": {
        const gs = this.b.sides[e.side].gates.find((q) => q.uid === e.gate);
        if (!gs) return;
        const p = this.at(e.side, (gs.x + 0.5) * CELL, (gs.y + 0.5) * CELL);
        fx.sparkle(p.x, p.y);
        if (e.side === 0) snd?.play("commission");
        return;
      }
      case "load":
        if (e.side === 0) snd?.play("load");
        return;
      case "fire": {
        const td = this.b.sides[e.side].hero.turrets[e.turret];
        const pv = turretPivot(e.side, td);
        const tip = e.heavy ? 20 : 15;
        const x = pv.x, y = pv.y + (e.side === 0 ? -tip : tip) + this.offY[e.side];
        fx.muzzle(x, y, e.heavy, e.side === 0 ? 0 : 2);
        fx.smoke(x, y, e.heavy ? 3 : 1, true, 6);
        fx.addTrauma(e.heavy ? 0.13 : 0.025);
        snd?.play(e.heavy ? "fire_heavy" : "fire_light");
        return;
      }
      case "impact": {
        const p = this.at(e.side, e.x, e.y);
        const size = e.big ? 26 : e.heavy ? 18 : 10;
        fx.explode(p.x, p.y, size, !e.heavy);
        fx.sparks(p.x, p.y, e.heavy ? 8 : 4, e.heavy ? [C.fire4, C.fire3, C.white] : [C.ice, C.white], e.heavy ? 80 : 50);
        if (e.heavy) {
          fx.debris(p.x, p.y, e.big ? 8 : 4, [C.steel2, C.rust3, C.steel1]);
          fx.smoke(p.x, p.y, 3, true, 12);
        }
        if (e.burn > 0) fx.embers(p.x, p.y, 4);
        const dmg = Math.max(1, Math.round(e.dmg));
        fx.popup(p.x + (fx.rnd() - 0.5) * 8, p.y - 6, String(dmg), e.big ? C.yellow : e.heavy ? C.fire4 : C.white, e.big);
        fx.addTrauma(e.big ? 0.42 : e.heavy ? 0.2 : 0.045);
        if (e.big) {
          fx.screenFlash(C.fire4, 0.22);
          if (!fast) fx.hitstop = 0.07;
          fx.explode(p.x + 7, p.y - 5, 14, false, 0.08);
          snd?.play("boom");
        } else snd?.play(e.heavy ? "impact" : "impact_small");
        if (e.shock) {
          fx.sparks(p.x, p.y, 6, [C.ice, C.white, C.cyan], 60, 0);
          snd?.play("zap");
        }
        return;
      }
      case "jam": {
        const td = this.b.sides[e.side].hero.turrets[e.turret];
        const pv = turretPivot(e.side, td);
        fx.smoke(pv.x, pv.y + this.offY[e.side], 4, true, 14);
        snd?.play("jam");
        return;
      }
      case "disrupt":
        if (e.side === 1 || !fast) snd?.play("zap");
        return;
      case "burn": {
        const h = this.hullCenter(e.side);
        fx.popup(h.x + (fx.rnd() - 0.5) * 60, h.y - 20 + (fx.rnd() - 0.5) * 30, String(e.dmg), C.fire3);
        return;
      }
      case "wind": {
        for (const side of [0, 1] as Side[]) {
          const h = this.hullCenter(side);
          fx.popup(h.x - 50 + fx.rnd() * 20, h.y, String(Math.round(e.dmg)), C.plum4);
        }
        snd?.play("whoosh");
        return;
      }
      case "windwarn":
        snd?.play("siren");
        return;
      case "end": {
        const loser: Side | -1 = e.winner === 0 ? 1 : e.winner === 1 ? 0 : -1;
        if (loser === -1) return;
        const h = this.hullCenter(loser);
        for (let i = 0; i < 9; i++) {
          const x = h.x + (fx.rnd() - 0.5) * 110, y = h.y + (fx.rnd() - 0.5) * 110;
          fx.explode(x, y, 16 + Math.floor(fx.rnd() * 14), false, i * 0.11);
        }
        fx.debris(h.x, h.y, 16, [C.steel2, C.rust3, C.steel1, C.fire3]);
        fx.smoke(h.x, h.y, 10, true, 16);
        fx.addTrauma(0.9);
        fx.screenFlash(C.white, 0.5);
        snd?.play("boom");
        return;
      }
    }
  }

  private drawWreck(g: G, side: Side, ox: number, oy: number): void {
    const faction = HEROES[this.b.sides[side].build.hero].faction;
    const o = hullOrigin(side);
    g.globalAlpha = Math.min(0.6, this.overT * 1.2);
    g.drawImage(hullShade(faction, side === 0 ? 0 : 2), Math.round(ox + o.x), Math.round(oy + o.y));
    g.globalAlpha = 1;
  }

  draw(g: G, ox: number, oy: number, W: number, H: number): void {
    const sx = ox + this.fx.shakeX, sy = oy + this.fx.shakeY;
    drawGround(g, sx, sy, W, H, this.scroll);
    drawCloudShadows(g, W, H, this.clock);
    const b = this.b;
    for (const side of [1, 0] as Side[]) {
      if (!this.show[side]) continue;
      const s = b.sides[side];
      drawCruiser(g, { side, build: s.build, sim: s, simT: b.t, t: this.clock, treadPhase: this.tread }, sx, sy + this.offY[side]);
      if (b.over && s.hull.hp <= 0) this.drawWreck(g, side, sx, sy + this.offY[side]);
    }
    drawProjectiles(g, b, sx, sy);
    this.fx.draw(g, sx, sy);
    drawWind(g, b.windLevel() * Math.max(0, 1 - this.overT / 1.2), W, H, this.clock);
    if (this.fx.flash > 0) {
      g.globalAlpha = Math.min(0.55, this.fx.flash);
      rect(g, 0, 0, W, H, this.fx.flashColor);
      g.globalAlpha = 1;
    }
  }
}
