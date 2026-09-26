// Live battle playback: the fixed-step simulation driven at a chosen speed, turned into
// sound and juice. Effects read sim state but never write it or touch the sim RNG, so a
// battle played here ends exactly like simulate() (tests/arena.test.ts). Shared by the
// battle screen, the title attract loop and the hero preview. No DOM access in update().

import type { Audio } from "../audio/audio";
import { Battle, type Side, type SimEvent } from "../sim/battle";
import { BELT_SPEED, CELL, HEROES, TICK, WINDOW_TIME } from "../sim/content";
import { turretSlots, type Build } from "../sim/deck";
import { Fx } from "../render/fx";
import { cruiserModel, type CruiserModel, type CruiserView } from "../render/cruiser";
import { chevronSpeed } from "../render/machinery"; // 0.6.2p (item 5): a fixed-speed belt's chevrons
import type { DeckFrame } from "../render/frame";
import { damageFx, react } from "./arenaReact";
import { makeViews } from "./arenaDraw";

const SIDES: Side[] = [0, 1];

export interface SideFx {
  model: CruiserModel;
  beltPhase: Float32Array[];
  windup: Float32Array;
  recoil: Float32Array;
  hpShown: number; // trailing (chip) portion of the hull bar
  chipHold: number;
  barFlash: number;
  lastHp: number;
  smokeT: number;
}

function sideFx(b: Battle, side: Side): SideFx {
  const s = b.sides[side];
  return {
    model: cruiserModel(s.build),
    beltPhase: s.routes.map((r) => new Float32Array(r.cells.length)),
    // 0.6.2s (REQ-BFG-031 S9): per TURRET SLOT (the index a turret's events carry), empty slots included
    windup: new Float32Array(turretSlots(s.build).length),
    recoil: new Float32Array(turretSlots(s.build).length),
    hpShown: s.hull.hp, chipHold: 0, barFlash: 0, lastHp: s.hull.hp, smokeT: 0,
  };
}

export class Arena {
  b: Battle;
  readonly fx = new Fx();
  readonly sfx: [SideFx, SideFx];
  frames: [DeckFrame, DeckFrame] = [{ facing: 0, dx: 0, dy: 0 }, { facing: 2, dx: 0, dy: 0 }];
  /** Frames actually drawn (base frames + drive-in offset), refreshed in place. */
  readonly drawn: [DeckFrame, DeckFrame] = [{ facing: 0, dx: 0, dy: 0 }, { facing: 2, dx: 0, dy: 0 }];
  enter: [number, number][] = [[0, 1], [0, -1]];
  off: [number, number] = [0, 0]; // drive-in distance per side (px, away from the gap)
  speed = 1;
  paused = false;
  tread = 0;
  clock = 0; // render clock (s, scaled by playback speed)
  sound: Audio | null;
  quiet = false;
  show: [boolean, boolean] = [true, true];
  overT = 0;
  koT = -1; // seconds since the KO (drives slow-mo)
  loser: Side | -1 = -1;
  shakePeak = 0; // largest camera offset since the last reset (metrics)
  readonly views: [CruiserView, CruiserView];
  private acc = 0;
  private readonly out: SimEvent[] = []; // update()'s reused per-frame event list

  constructor(player: Build, enemy: Build, seed: number, sound: Audio | null) {
    this.b = new Battle(player, enemy, seed);
    this.sound = sound;
    this.sfx = [sideFx(this.b, 0), sideFx(this.b, 1)];
    this.views = makeViews(this);
  }

  setFrames(frames: [DeckFrame, DeckFrame], enter: [number, number][]): void {
    this.frames = frames;
    this.enter = enter;
    this.syncFrames();
  }

  syncFrames(): void {
    for (const side of SIDES) {
      const f = this.frames[side], d = this.drawn[side];
      d.facing = f.facing;
      d.dx = f.dx + Math.round(this.enter[side][0] * this.off[side]);
      d.dy = f.dy + Math.round(this.enter[side][1] * this.off[side]);
    }
  }

  /** Playback time scale from the KO slow-mo (1 = normal). */
  private koScale(): number {
    if (this.koT < 0) return 1;
    if (this.koT < 0.9) return 0.3;
    return Math.min(1, 0.3 + (this.koT - 0.9) * 2.4);
  }

  /** Advance playback; returns the simulation events produced this frame. The array is reused:
   *  it is valid until the next update() call, so read it (or copy it) before then. */
  update(dt: number, drive = true): SimEvent[] {
    const out = this.out;
    out.length = 0;
    const fx = this.fx;
    if (fx.hitstop > 0) {
      // hit-stop: hold the frame (sim, belts, shells) while the shake keeps ringing
      fx.hitstop--;
      fx.update(dt * 0.15);
      this.trackShake();
      return out;
    }
    if (this.koT >= 0) this.koT += dt;
    const k = (this.paused ? 0 : 1) * this.koScale();
    const sdt = dt * k * this.speed;
    this.clock += sdt;
    if (drive && !this.b.over) {
      this.acc += sdt;
      let n = 0;
      while (this.acc >= TICK && n < 600 && !this.b.over) {
        this.b.step();
        this.acc -= TICK;
        n++;
        const ev = this.b.drainEvents();
        for (let i = 0; i < ev.length; i++) {
          react(this, ev[i]);
          out.push(ev[i]);
        }
      }
    }
    if (this.b.over) {
      this.overT += dt;
      this.b.settle(dt * k);
    }
    for (const side of SIDES) {
      this.updateSide(side, sdt, dt * k);
      if (this.show[side]) damageFx(this, side, dt * k);
    }
    // effects follow the playback: slowed with 0.5X (0.6.0), sped up to at most 2x at 2X/4X
    fx.update(dt * k * (this.speed < 1 ? this.speed : Math.min(2, Math.max(1, this.speed * 0.75))));
    this.trackShake();
    return out;
  }

  private trackShake(): void {
    const s = Math.abs(this.fx.shakeX) + Math.abs(this.fx.shakeY);
    if (s > this.shakePeak) this.shakePeak = s;
  }

  private updateSide(side: Side, sdt: number, rdt: number): void {
    const s = this.b.sides[side], f = this.sfx[side];
    // belts advance by their real travel: a queued (blocked) cell stops, disrupted cells stop. 0.6.2p (item 5): a
    // fixed-speed belt (SLAG POT) at its own pace, whatever its speed rigs and slows (render only: chevronSpeed)
    for (let ri = 0; ri < s.routes.length; ri++) {
      const r = s.routes[ri], ph = f.beltPhase[ri], fixed = f.model.routes[ri]?.fixed;
      for (let i = 0; i < ph.length; i++) {
        // 0.6.2j: a joining belt whose chain reaches a turret runs too (it feeds no intake itself)
        let v = r.cellDisrupt[i] > 0 || !(r.connected || (r.join !== undefined && r.join.feeds >= 0)) ? 0 : BELT_SPEED * chevronSpeed(r.speedAt[i], fixed);
        if (v > 0) {
          for (let a = 0; a < r.ammo.length; a++) {
            const am = r.ammo[a];
            if (am.blocked && Math.min(ph.length - 1, Math.floor(am.s / CELL)) === i) { v = 0; break; }
          }
        }
        ph[i] += v * sdt;
      }
    }
    // turret wind-up (anticipation) and recoil read from chamber state
    for (let n = 0; n < s.turrets.length; n++) {
      const tu = s.turrets[n], i = tu.index; // 0.6.2s: the slot
      let w = 0;
      if (tu.disrupted > 0) w = 0;
      else if (tu.phase === "fire") w = tu.stack.length ? Math.max(0.35, 1 - tu.fireCd / 0.35) : 0;
      else if (tu.stack.length) w = Math.min(0.85, Math.max(tu.loadTimer / WINDOW_TIME, tu.stack.length / tu.def.window) * 0.85);
      f.windup[i] += (w - f.windup[i]) * Math.min(1, rdt * 14);
      f.recoil[i] = Math.round(tu.recoil * tu.recoil * (tu.def.kind === "heavy" ? 5 : 3));
    }
    // hull bar chip damage: flash, hold, then drain
    const hp = Math.max(0, s.hull.hp);
    if (hp < f.lastHp - 0.01) {
      f.barFlash = 0.12;
      f.chipHold = 0.4;
    }
    f.lastHp = hp;
    f.barFlash = Math.max(0, f.barFlash - rdt);
    if (f.chipHold > 0) f.chipHold -= rdt;
    else if (f.hpShown > hp) f.hpShown = Math.max(hp, f.hpShown - rdt * Math.max(24, (f.hpShown - hp) * 3));
    if (f.hpShown < hp) f.hpShown = hp;
  }

  /** Resolve the rest of the battle instantly (SKIP). Only the end event is animated. */
  finish(): SimEvent[] {
    const out: SimEvent[] = [];
    while (!this.b.over && this.b.ticks < 60 * 200) {
      this.b.step();
      for (const e of this.b.drainEvents()) if (e.type === "end") out.push(e);
    }
    this.fx.clear();
    for (const e of out) react(this, e);
    return out;
  }

  heroOf(side: Side): string {
    return HEROES[this.b.sides[side].build.hero].name;
  }
}
