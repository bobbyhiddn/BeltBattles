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
import { newWave3Fx, tickWave3Fx, type Wave3Fx } from "../render/wave3Moments"; // 0.8.0 I1 M4: A1's battle moments
import type { PairWatch } from "./pairCue"; // PAIR-CUE (REQ-BFG-100): the PAIR on the board (display only)

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
  // 0.8.0 H1 M3 (display only; the sim never reads them): per turret slot, seconds left on FOUNDRY's weld flash (the
  // `fuse` event) and on BASTION's CLANK (the `plate` event); the plating strip's trailing chip (plating just lost, like
  // hpShown), how long it holds, the plating last seen, and the newest segment's shine as plating lands
  fuse: Float32Array;
  clank: Float32Array;
  plateShown: number;
  plateHold: number;
  plateLast: number;
  plateShine: number;
  // 0.8.0 I1 M4 (display only): wave 3's event moments (render/wave3Moments.ts): pairs, ANVIL BREECH shots, BRACE FRAME's
  // cuts, TWIN LATCH's releases, PLATE BREAKER's blows and ARMOR PRESS's presses
  w3: Wave3Fx;
  // SUS-B (REQ-BFG-069; display only): seconds left on the SHIELD break cue (a `shield` event of -1) and the pip that broke
  // (the count after the break, so the pip at that index)
  shieldBreak: number;
  shieldAt: number;
  // WIND-1 (REQ-BFG-093; display only): seconds left on the hull bar's purple flash for a dark wind tick (arenaReact windPop)
  windFlash: number;
  // WIND-1 (REQ-BFG-097; display only): a SHIELD just stopped a hit (its `shield` event of -1); the hit's own impact, next in
  // the step, pops BLOCKED there
  shieldStop: boolean;
}

function sideFx(b: Battle, side: Side): SideFx {
  const s = b.sides[side];
  // 0.8.0 I1 M4: the side's plating pool (P1's E1: SideState.plate, which IS a race side's RaceSide.plating), so a hull
  // plated by wave-3 parts shows its plating as BASTION's does; 0 on every hull without a plating source
  const plate = s.plate.plate;
  return {
    model: cruiserModel(s.build),
    beltPhase: s.routes.map((r) => new Float32Array(r.cells.length)),
    // 0.6.2s (REQ-BFG-031 S9): per TURRET SLOT (the index a turret's events carry), empty slots included
    windup: new Float32Array(turretSlots(s.build).length),
    recoil: new Float32Array(turretSlots(s.build).length),
    hpShown: s.hull.hp, chipHold: 0, barFlash: 0, lastHp: s.hull.hp, smokeT: 0,
    fuse: new Float32Array(turretSlots(s.build).length),
    clank: new Float32Array(turretSlots(s.build).length),
    plateShown: plate, plateHold: 0, plateLast: plate, plateShine: 0,
    w3: newWave3Fx(turretSlots(s.build).length),
    shieldBreak: 0, shieldAt: 0, // SUS-B
    windFlash: 0, shieldStop: false, // WIND-1
  };
}

/** 0.8.0 H1 M3: how long the plating strip holds plating just lost (white) before it drains, like the hull bar's chip. */
export const PLATE_HOLD = 0.4;

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
  /** WIND-1 (REQ-BFG-093; display only): seconds since the DARK WIND callout started (the windwarn, or the first wind tick
   *  if that comes first; once a fight); -1 before it. The battle and the replay draw it (battleHud.ts drawWindCall). */
  windCallT = -1;
  loser: Side | -1 = -1;
  shakePeak = 0; // largest camera offset since the last reset (metrics)
  readonly views: [CruiserView, CruiserView];
  /** PAIR-CUE (REQ-BFG-100, REQ-BFG-081; display only): the battle's and the replay's PAIR watch (game/pairCue.ts), fed
   *  every step played, before its events are reacted to; null elsewhere (the title's attract fight, the hero preview: no
   *  cue). It reads the battle and never writes it or the sim's RNG. */
  cue: PairWatch | null = null;
  private acc = 0;
  private readonly out: SimEvent[] = []; // update()'s reused per-frame event list
  /** 0.6.2 TUNE-M, RULE SHOCK ROW (display only): per side, the enemy machines its Shock stalled (the battle's own
   *  "harass" events with cause "shock": each one a machine, belt tile or rig a Shock hit or its spark jump stopped),
   *  counted from every event drained, played or skipped. The battle itself is untouched. */
  readonly shocks: [number, number] = [0, 0];

  /** Count one drained event into the readout tallies (shocks). */
  private tally(e: SimEvent): void {
    if (e.type === "harass" && e.cause === "shock") this.shocks[e.side === 0 ? 1 : 0]++;
  }

  /** SCOUT-1 (REQ-BFG-076; display only, as `shocks`): per side, per TURRET SLOT (the index a turret's events carry), the
   *  shots it fired (its `fire` events) and the damage they dealt on landing (each landing's `impact`, its splash, arcs
   *  and lances included), counted from every step played or skipped. The BURN they set and limpet blasts are in the
   *  side's DAMAGE DEALT but not here: no event names the turret behind them. */
  readonly partShots: [number[], number[]] = [[], []];
  readonly partDamage: [number[], number[]] = [[], []];
  /** SCOUT-1: each shot in flight's side and slot (its `fire` event's), by projectile id, until it lands or is downed. */
  private readonly flying = new Map<number, { side: Side; slot: number }>();
  /** SCOUT-1: the ids in flight before a step (Battle.projectiles, read only). */
  private readonly preIds: number[] = [];
  private readonly alive = new Set<number>();

  /** SCOUT-1: before a step, the shots in flight (read only). */
  private preStep(): void {
    const ps = this.b.projectiles, ids = this.preIds;
    ids.length = ps.length;
    for (let i = 0; i < ps.length; i++) ids[i] = ps[i].id;
  }

  /**
   * SCOUT-1: after a step, its events into the per-turret tallies. A step lands its shots in flight order (Battle.flight:
   * Battle.projectiles, which is in id order), each with one `impact`, then its splash, arcs or lances, each an `arc`,
   * `lance` or `splash` event before its own `impact`. So the step's landed shots, the ids in flight before it and fired in
   * it that are gone after it and were not downed (`flak`), sorted by id, take its first-hand impacts in turn.
   */
  private countStep(ev: readonly SimEvent[]): void {
    const alive = this.alive;
    alive.clear();
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === "fire") {
        this.flying.set(e.proj, { side: e.side, slot: e.turret });
        this.partShots[e.side][e.turret] = (this.partShots[e.side][e.turret] ?? 0) + 1;
      } else if (e.type === "flak") this.flying.delete(e.proj);
    }
    for (const p of this.b.projectiles) alive.add(p.id);
    const landed: number[] = [];
    for (const id of this.preIds) if (!alive.has(id) && this.flying.has(id)) landed.push(id);
    // a shot fired in this step that also landed in it (a new id: never one in flight before it)
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === "fire" && !alive.has(e.proj) && this.flying.has(e.proj)) landed.push(e.proj);
    }
    if (!landed.length) return;
    landed.sort((x, y) => x - y);
    let k = 0, cur: { side: Side; slot: number } | undefined, second = false;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === "splash" || e.type === "arc" || e.type === "lance") second = true;
      else if (e.type === "impact") {
        if (!second) cur = k < landed.length ? this.flying.get(landed[k++]) : undefined;
        second = false;
        if (cur) this.partDamage[cur.side][cur.slot] = (this.partDamage[cur.side][cur.slot] ?? 0) + e.dmg;
      }
    }
    for (const id of landed) this.flying.delete(id);
  }

  /** 0.8.0 H1 M3 (display only): per side, plating soaked in the step being played that no impact has shown yet. Within
   *  a step, plating takes the step's hits before Burn (Battle: impacts, then hullEffects), so the step's
   *  impacts take it in order (takeSoak). 0 for every hull without plating: Furnace and Weaver never have any. */
  private readonly soakLeft: [number, number] = [0, 0];
  private readonly soakSeen: [number, number] = [0, 0];

  /** After a step: the plating each side soaked in it (race.plating.absorbed's growth). 0.8.0 I1 M4: SideState.plate, the
   *  same pool for a race side, and on every hull since P1's E1 (absorbed stays 0 without a plating source). */
  private stepSoak(): void {
    for (const side of SIDES) {
      const pl = this.b.sides[side].plate;
      this.soakLeft[side] = pl.absorbed - this.soakSeen[side];
      this.soakSeen[side] = pl.absorbed;
    }
  }

  /** 0.8.0 H1 M3 (display only): how much of a hit of `dmg` on `side` its plating took (react's impact popup). */
  takeSoak(side: Side, dmg: number): number {
    const t = Math.min(this.soakLeft[side], Math.max(0, dmg));
    this.soakLeft[side] -= t;
    return t;
  }

  /** 0.7.0a: `battle` (a replay: replayBattle(record), fresh and unstepped) is played instead of a new Battle. RUNES-2a:
   *  `wins`, each side's wins carried into the fight (WARLORD'S DUE; sim/battle.ts Battle). HULL-1a (REQ-BFG-079): `day`,
   *  the day the fight is on (Battle's: the day's hull with HULL_SCALE on; nothing without it). */
  constructor(player: Build, enemy: Build, seed: number, sound: Audio | null, battle?: Battle, wins?: readonly [number, number], day?: number) {
    this.b = battle ?? new Battle(player, enemy, seed, wins, day);
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
      this.cue?.tick(dt * 0.15); // PAIR-CUE: the cue's flashes age with the numbers
      this.trackShake();
      return out;
    }
    if (this.koT >= 0) this.koT += dt;
    if (this.windCallT >= 0 && !this.paused) this.windCallT += dt; // WIND-1: the callout runs on real time, held by a pause
    const k = (this.paused ? 0 : 1) * this.koScale();
    const sdt = dt * k * this.speed;
    this.clock += sdt;
    if (drive && !this.b.over) {
      this.acc += sdt;
      let n = 0;
      while (this.acc >= TICK && n < 600 && !this.b.over) {
        this.preStep(); // SCOUT-1: read only
        this.cue?.pre(this.b); // PAIR-CUE: read only
        this.b.step();
        this.stepSoak(); // 0.8.0 H1 M3: read only
        this.acc -= TICK;
        n++;
        const ev = this.b.drainEvents();
        this.countStep(ev); // SCOUT-1: read only
        this.cue?.step(this, ev); // PAIR-CUE: read only; before react (the PAIR shots' impacts it marks)
        for (let i = 0; i < ev.length; i++) {
          this.tally(ev[i]);
          react(this, ev[i], i > 0 ? ev[i - 1] : null); // 0.8.0 I1 M4: the step's event before it (PLATE BREAKER's blow)
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
    const fdt = dt * k * (this.speed < 1 ? this.speed : Math.min(2, Math.max(1, this.speed * 0.75)));
    fx.update(fdt);
    this.cue?.tick(fdt); // PAIR-CUE: the cue's flashes age with the numbers
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
    // 0.8.0 H1 M3: the weld flashes and CLANKs play out; the plating strip holds plating just lost, then drains it
    for (let i = 0; i < f.fuse.length; i++) {
      if (f.fuse[i] > 0) f.fuse[i] = Math.max(0, f.fuse[i] - rdt);
      if (f.clank[i] > 0) f.clank[i] = Math.max(0, f.clank[i] - rdt);
    }
    const plate = s.plate.plate; // 0.8.0 I1 M4: every hull's pool (E1); a race side's is its RaceSide.plating
    if (plate < f.plateLast - 1e-9) f.plateHold = PLATE_HOLD;
    f.plateLast = plate;
    f.plateShine = Math.max(0, f.plateShine - rdt);
    if (f.plateHold > 0) f.plateHold -= rdt;
    else if (f.plateShown > plate) f.plateShown = Math.max(plate, f.plateShown - rdt * Math.max(8, (f.plateShown - plate) * 3));
    if (f.plateShown < plate) f.plateShown = plate;
    tickWave3Fx(f.w3, s, rdt); // 0.8.0 I1 M4: wave 3's moments play out; ARMOR PRESS's presses read off its timer
    f.shieldBreak = Math.max(0, f.shieldBreak - rdt); // SUS-B: the SHIELD break cue plays out
    f.windFlash = Math.max(0, f.windFlash - rdt); // WIND-1: the bar's wind flash plays out
  }

  /** Resolve the rest of the battle instantly (SKIP). Only the end event is animated. */
  finish(): SimEvent[] {
    const out: SimEvent[] = [];
    while (!this.b.over && this.b.ticks < 60 * 200) {
      this.preStep(); // SCOUT-1: read only
      this.b.step();
      const ev = this.b.drainEvents();
      this.countStep(ev); // SCOUT-1: read only
      for (const e of ev) {
        this.tally(e);
        if (e.type === "end") out.push(e);
      }
    }
    this.stepSoak(); // 0.8.0 H1 M3: nothing skipped is shown, so no soak is left over
    this.soakLeft[0] = this.soakLeft[1] = 0;
    this.fx.clear();
    this.cue?.reset(); // PAIR-CUE: nothing skipped is shown
    for (const e of out) react(this, e);
    return out;
  }

  heroOf(side: Side): string {
    return HEROES[this.b.sides[side].build.hero].name;
  }
}
