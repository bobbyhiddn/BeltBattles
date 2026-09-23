// Fixed-step combat simulation. Production, transport, processing, chamber handling,
// firing and impact are separate systems (spec §11, §12, §23). Playback speed never
// changes rules: callers only decide how many ticks to run per frame.

import { Rng } from "../core/rng";
import {
  AMMO, AMMO_SPACING, BATTLE_CAP, BELT_SPEED, BURN_TIME, CELL, COMMISSION_BASE, COMMISSION_STEP,
  DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS, JAM_COOLDOWN, JAM_THRESHOLD, RULES_VERSION,
  TICK, WIND_START, WIND_WARN, WINDOW_TIME,
  type AmmoKind, type HeroDef, type ItemDef, type TurretDef,
} from "./content";
import {
  cloneBuild, connectorClaims, defOf, kx, ky, occupancy, payloadDamage,
  routeInfo, routePolyline, type Build,
} from "./deck";

export type Side = 0 | 1; // 0 = player (south), 1 = enemy (north)

export interface Payload {
  id: number;
  ammo: AmmoKind;
  ride: number; // eligible ride time (moving on belts)
  mult: number; // split multiplier
  flat: number; // flat damage
  burn: number;
  shock: boolean;
  prior: number; // gates visited
  factory: number;
  copy: boolean; // produced by a Splitter
}

export interface BeltAmmo {
  p: Payload;
  s: number; // distance along route (px)
  processed: number; // last cell index whose gate centre was passed
  blocked: boolean;
}

export interface GateState {
  uid: number;
  def: ItemDef;
  x: number;
  y: number;
  route: number; // route index or -1 (not on a route)
  cellIdx: number;
  commissionAt: number;
  online: boolean;
  disrupted: number;
  flash: number; // render: time since last processed payload (counts down)
}

export interface RouteState {
  index: number;
  factory: number;
  cells: number[];
  connected: boolean;
  turret: number;
  L: number;
  gateAt: (GateState | null)[];
  ammo: BeltAmmo[]; // front (largest s) first
  cellDisrupt: number[];
  speedAt: number[]; // render: speed state per cell
  pts: { x: number; y: number }[];
  phase: number[]; // render: belt animation phase per cell (px)
  pressure: number; // blocked payloads on this route
}

export interface FactoryState {
  uid: number;
  def: ItemDef;
  x: number;
  y: number;
  routes: number[];
  timer: number;
  rr: number;
  disrupted: number;
  flash: number; // render
  stalled: boolean;
  produced: number;
}

export interface TurretState {
  index: number;
  def: TurretDef;
  stack: Payload[];
  phase: "load" | "fire";
  loadTimer: number;
  fireCd: number;
  jamSkip: number;
  jamRandom: boolean;
  jamCd: number;
  disrupted: number;
  perShot: number;
  interval: number;
  recoil: number; // render
  jamFx: number; // render
  waiting: number;
}

export interface HullState {
  hp: number;
  max: number;
  fray: number;
  burns: { dps: number; t: number }[];
  burnShown: number;
  windShown: number;
  flash: number; // render
}

export type TargetKind = "hull" | "belt" | "gate" | "factory" | "turret";

export interface Target {
  kind: TargetKind;
  ref: number; // uid, route index or turret index
  cell: number; // route cell index for belts
  x: number;
  y: number;
  weight: number;
}

export interface SideStats {
  shots: number;
  damage: number;
  firstShot: number;
  idle: number; // turret-seconds with nothing to fire
  turretTime: number;
  maxQueue: number;
  jams: number;
  disrupted: number; // seconds of own machinery disrupted
  windTaken: number;
  burnDealt: number;
  payloadSum: number;
  produced: number;
  stalled: number; // factory-seconds unable to stamp
}

export interface SideState {
  side: Side;
  build: Build;
  hero: HeroDef;
  hull: HullState;
  factories: FactoryState[];
  gates: GateState[];
  routes: RouteState[];
  turrets: TurretState[];
  targets: Target[];
  stats: SideStats;
}

export interface Projectile {
  id: number;
  from: Side;
  turret: number;
  payload: Payload;
  dmg: number;
  t: number;
  flight: number;
  target: Target;
  tx: number;
  ty: number;
  heavy: boolean;
}

export type SimEvent =
  | { type: "produce"; side: Side; factory: number }
  | { type: "process"; side: Side; gate: number; def: string }
  | { type: "commission"; side: Side; gate: number }
  | { type: "load"; side: Side; turret: number }
  | { type: "fire"; side: Side; turret: number; heavy: boolean; dmg: number; proj: number }
  | { type: "impact"; side: Side; x: number; y: number; dmg: number; heavy: boolean; kind: TargetKind; shock: boolean; burn: number; big: boolean }
  | { type: "jam"; side: Side; turret: number }
  | { type: "disrupt"; side: Side; kind: TargetKind; ref: number; cell: number }
  | { type: "burn"; side: Side; dmg: number }
  | { type: "wind"; dmg: number }
  | { type: "windwarn" }
  | { type: "end"; winner: Side | -1 };

export interface BattleRecord {
  rules: string;
  seed: number;
  builds: [Build, Build];
}

function emptyStats(): SideStats {
  return {
    shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0,
    disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0,
  };
}

export class Battle {
  t = 0;
  ticks = 0;
  over = false;
  winner: Side | -1 | null = null;
  readonly sides: [SideState, SideState];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  readonly rng: Rng;
  readonly record: BattleRecord;
  private nextId = 1;
  private windWarned = false;
  private windTick = 0;

  constructor(player: Build, enemy: Build, seed: number) {
    this.rng = new Rng(seed);
    this.record = { rules: RULES_VERSION, seed, builds: [cloneBuild(player), cloneBuild(enemy)] };
    this.sides = [this.makeSide(0, cloneBuild(player)), this.makeSide(1, cloneBuild(enemy))];
  }

  private makeSide(side: Side, b: Build): SideState {
    const h = HEROES[b.hero];
    const occ = occupancy(b);
    const claims = connectorClaims(b);
    const hull: HullState = {
      hp: h.hull + b.hullBonus, max: h.hull + b.hullBonus, fray: 0, burns: [], burnShown: 0, windShown: 0, flash: 0,
    };
    const gates: GateState[] = [];
    const gateByUid = new Map<number, GateState>();
    for (const p of b.items) {
      const d = defOf(p);
      if (d.kind !== "gate") continue;
      const g: GateState = {
        uid: p.uid, def: d, x: p.x, y: p.y, route: -1, cellIdx: -1, commissionAt: Infinity,
        online: false, disrupted: 0, flash: 0,
      };
      gates.push(g);
      gateByUid.set(p.uid, g);
    }
    const routes: RouteState[] = b.routes.map((r, i) => {
      const info = routeInfo(b, i, claims, occ);
      const gateAt: (GateState | null)[] = r.cells.map(() => null);
      info.gateCells.forEach((ci, gi) => {
        const g = gateByUid.get(info.gates[gi]);
        if (g) {
          g.route = i;
          g.cellIdx = ci;
          g.commissionAt = COMMISSION_BASE + COMMISSION_STEP * gi;
          gateAt[ci] = g;
        }
      });
      return {
        index: i, factory: r.factory, cells: [...r.cells], connected: info.connected, turret: info.turret,
        L: info.length, gateAt, ammo: [], cellDisrupt: r.cells.map(() => 0), speedAt: r.cells.map(() => 1),
        pts: routePolyline(b, r, info.connected), phase: r.cells.map(() => 0), pressure: 0,
      };
    });
    const factories: FactoryState[] = b.items
      .filter((p) => defOf(p).kind === "factory")
      .map((p) => ({
        uid: p.uid, def: defOf(p), x: p.x, y: p.y,
        routes: routes.filter((r) => r.factory === p.uid).map((r) => r.index),
        timer: 0.35, rr: 0, disrupted: 0, flash: 0, stalled: false, produced: 0,
      }));
    const turrets: TurretState[] = h.turrets.map((def, i) => {
      let perShot = 1, fireMul = 1;
      for (const m of b.mods.filter((m) => m.turret === i)) {
        const md = ITEMS[m.def]?.mod;
        if (md?.perShot) perShot = Math.max(perShot, md.perShot);
        if (md?.fireMul) fireMul *= md.fireMul;
      }
      return {
        index: i, def, stack: [], phase: "load", loadTimer: 0, fireCd: 0, jamSkip: 0, jamRandom: false,
        jamCd: 0, disrupted: 0, perShot, interval: def.fireInterval * fireMul, recoil: 0, jamFx: 0, waiting: 0,
      };
    });
    const targets: Target[] = [];
    for (const r of routes) {
      r.cells.forEach((k, ci) => {
        if (r.gateAt[ci]) return;
        targets.push({ kind: "belt", ref: r.index, cell: ci, x: kx(k) * CELL + 6, y: ky(k) * CELL + 6, weight: 1 });
      });
    }
    for (const g of gates) targets.push({ kind: "gate", ref: g.uid, cell: -1, x: g.x * CELL + 6, y: g.y * CELL + 6, weight: 2 });
    for (const f of factories) {
      const s = f.def.size * CELL;
      targets.push({ kind: "factory", ref: f.uid, cell: -1, x: f.x * CELL + s / 2, y: f.y * CELL + s / 2, weight: 3 });
    }
    turrets.forEach((tu) => {
      targets.push({ kind: "turret", ref: tu.index, cell: -1, x: (tu.def.col0 + tu.def.width / 2) * CELL, y: -9, weight: 2 });
    });
    return { side, build: b, hero: h, hull, factories, gates, routes, turrets, targets, stats: emptyStats() };
  }

  /** Advance exactly one fixed tick. */
  step(): void {
    if (this.over) return;
    const dt = TICK;
    this.t += dt;
    this.ticks++;
    for (const s of this.sides) this.updateMachinery(s, dt);
    for (const s of this.sides) this.produce(s, dt);
    for (const s of this.sides) this.transport(s, dt);
    for (const s of this.sides) this.chambers(s, dt);
    this.flight(dt);
    this.hullEffects(dt);
    this.checkEnd();
  }

  private updateMachinery(s: SideState, dt: number): void {
    for (const g of s.gates) {
      if (g.flash > 0) g.flash -= dt;
      if (g.disrupted > 0) {
        g.disrupted = Math.max(0, g.disrupted - dt);
        s.stats.disrupted += dt;
      }
      if (!g.online && g.route >= 0 && this.t >= g.commissionAt) {
        g.online = true;
        this.events.push({ type: "commission", side: s.side, gate: g.uid });
      }
    }
    for (const r of s.routes) {
      for (let i = 0; i < r.cellDisrupt.length; i++) {
        if (r.cellDisrupt[i] > 0) {
          r.cellDisrupt[i] = Math.max(0, r.cellDisrupt[i] - dt);
          s.stats.disrupted += dt;
        }
      }
      // speed states: later active speed gate wins for everything downstream of it
      let state = 1;
      for (let i = 0; i < r.cells.length; i++) {
        const g = r.gateAt[i];
        if (g && g.online && g.disrupted <= 0 && g.def.gate?.speed) state = g.def.gate.speed;
        r.speedAt[i] = state;
        const v = r.cellDisrupt[i] > 0 ? 0 : BELT_SPEED * state;
        r.phase[i] += v * dt;
      }
    }
    for (const f of s.factories) {
      if (f.flash > 0) f.flash -= dt;
      if (f.disrupted > 0) {
        f.disrupted = Math.max(0, f.disrupted - dt);
        s.stats.disrupted += dt;
      }
    }
    for (const tu of s.turrets) {
      if (tu.recoil > 0) tu.recoil = Math.max(0, tu.recoil - dt * 4);
      if (tu.jamFx > 0) tu.jamFx = Math.max(0, tu.jamFx - dt);
      if (tu.disrupted > 0) {
        tu.disrupted = Math.max(0, tu.disrupted - dt);
        s.stats.disrupted += dt;
      }
    }
    if (s.hull.flash > 0) s.hull.flash = Math.max(0, s.hull.flash - dt);
  }

  /**
   * Render-only: once the battle is over the sim stops stepping, so hit flashes and
   * recoil from the final tick would stay frozen on screen. Playback calls this instead.
   */
  settle(dt: number): void {
    for (const s of this.sides) {
      for (const g of s.gates) g.flash = Math.max(0, g.flash - dt);
      for (const f of s.factories) f.flash = Math.max(0, f.flash - dt);
      for (const tu of s.turrets) {
        tu.recoil = Math.max(0, tu.recoil - dt * 4);
        tu.jamFx = Math.max(0, tu.jamFx - dt);
      }
      s.hull.flash = Math.max(0, s.hull.flash - dt);
    }
  }

  private produce(s: SideState, dt: number): void {
    for (const f of s.factories) {
      if (!f.routes.length || f.disrupted > 0) continue;
      f.timer -= dt;
      if (f.timer > 0) continue;
      const n = f.routes.length;
      let placed = false;
      for (let k = 0; k < n; k++) {
        const ri = f.routes[(f.rr + k) % n];
        const r = s.routes[ri];
        const back = r.ammo[r.ammo.length - 1];
        if (!back || back.s >= AMMO_SPACING) {
          const spec = f.def.factory!;
          const p: Payload = {
            id: this.nextId++, ammo: spec.ammo, ride: 0, mult: 1, flat: 0, burn: 0, shock: false,
            prior: 0, factory: f.uid, copy: false,
          };
          r.ammo.push({ p, s: 0, processed: -1, blocked: false });
          f.rr = (f.rr + k + 1) % n;
          f.timer = spec.interval;
          f.flash = 0.18;
          f.produced++;
          f.stalled = false;
          s.stats.produced++;
          this.events.push({ type: "produce", side: s.side, factory: f.uid });
          placed = true;
          break;
        }
      }
      if (!placed) {
        f.stalled = true;
        f.timer = 0;
        s.stats.stalled += dt;
      }
    }
  }

  private speedStateAt(r: RouteState, pos: number): number {
    let state = 1;
    for (let i = 0; i < r.cells.length; i++) {
      const centre = i * CELL + CELL / 2;
      if (centre >= pos) break;
      const g = r.gateAt[i];
      if (g && g.online && g.disrupted <= 0 && g.def.gate?.speed) state = g.def.gate.speed;
    }
    return state;
  }

  private transport(s: SideState, dt: number): void {
    for (const r of s.routes) {
      const n = r.cells.length;
      const inserts: { after: BeltAmmo; copy: BeltAmmo }[] = [];
      let pressure = 0;
      for (let i = 0; i < r.ammo.length; i++) {
        const a = r.ammo[i];
        const limit = i === 0 ? r.L : r.ammo[i - 1].s - AMMO_SPACING;
        const ci = Math.min(n - 1, Math.floor(a.s / CELL));
        let v = BELT_SPEED * this.speedStateAt(r, a.s);
        if (ci >= 0 && r.cellDisrupt[ci] > 0) v = 0;
        const want = a.s + v * dt;
        let ns = Math.min(want, limit);
        if (ns < a.s) ns = a.s;
        const moved = ns - a.s;
        if (v > 0 && moved > 0) a.p.ride += moved / v;
        a.blocked = want > limit + 1e-6 || v === 0;
        if (a.blocked) pressure++;
        // process gates whose centres were crossed
        while (a.processed + 1 < n && (a.processed + 1) * CELL + CELL / 2 <= ns) {
          a.processed++;
          const g = r.gateAt[a.processed];
          if (g && g.online && g.disrupted <= 0) {
            const copy = this.applyGate(s, a, g);
            if (copy) inserts.push({ after: a, copy });
          }
        }
        a.s = ns;
      }
      for (const ins of inserts) {
        const idx = r.ammo.indexOf(ins.after);
        r.ammo.splice(idx + 1, 0, ins.copy);
      }
      r.pressure = pressure;
    }
  }

  private applyGate(s: SideState, a: BeltAmmo, g: GateState): BeltAmmo | null {
    const e = g.def.gate!;
    const p = a.p;
    let copy: BeltAmmo | null = null;
    if (e.flat) p.flat += e.flat;
    if (e.perPriorGate) p.flat += e.perPriorGate * p.prior;
    if (e.burn) p.burn += e.burn;
    if (e.shock) p.shock = true;
    if (e.split) {
      p.mult *= e.split.mult;
      p.flat *= e.split.mult;
      p.copy = true;
      const cp: Payload = { ...p, id: this.nextId++ };
      copy = { p: cp, s: a.s - 0.01, processed: a.processed, blocked: false };
    }
    p.prior++;
    if (copy) copy.p.prior = p.prior;
    g.flash = 0.22;
    this.events.push({ type: "process", side: s.side, gate: g.uid, def: g.def.id });
    return copy;
  }

  private chambers(s: SideState, dt: number): void {
    // intake: front payload at the end of a connected route enters its turret's chamber
    for (const r of s.routes) {
      if (!r.connected || !r.ammo.length) continue;
      const front = r.ammo[0];
      if (front.s < r.L - 1e-6) continue;
      const tu = s.turrets[r.turret];
      if (!tu || tu.disrupted > 0) continue;
      if (tu.phase === "load" && tu.stack.length < tu.def.window) {
        tu.stack.push(front.p);
        r.ammo.shift();
        this.events.push({ type: "load", side: s.side, turret: tu.index });
      }
    }
    for (const tu of s.turrets) {
      s.stats.turretTime += dt;
      // payloads backed up near this turret's intakes
      let waiting = 0;
      for (const r of s.routes) {
        if (r.turret !== tu.index || !r.connected) continue;
        for (const a of r.ammo) if (a.blocked && a.s >= r.L - 4 * CELL) waiting++;
      }
      tu.waiting = waiting;
      if (waiting > s.stats.maxQueue) s.stats.maxQueue = waiting;
      if (tu.disrupted > 0) continue;
      if (tu.fireCd > 0) tu.fireCd = Math.max(0, tu.fireCd - dt);
      if (tu.jamCd > 0) tu.jamCd = Math.max(0, tu.jamCd - dt);
      if (tu.phase === "load") {
        if (tu.stack.length > 0) tu.loadTimer += dt;
        if (tu.stack.length >= tu.def.window || (tu.stack.length > 0 && tu.loadTimer >= WINDOW_TIME)) {
          tu.phase = "fire";
        } else if (tu.stack.length === 0 && tu.fireCd <= 0) {
          s.stats.idle += dt;
        }
      }
      if (tu.phase === "fire") {
        if (waiting >= JAM_THRESHOLD && tu.jamCd <= 0 && tu.jamSkip === 0) {
          tu.jamSkip = 1;
          tu.jamRandom = true;
          tu.jamCd = JAM_COOLDOWN;
          tu.jamFx = 0.9;
          s.stats.jams++;
          this.events.push({ type: "jam", side: s.side, turret: tu.index });
        }
        if (tu.fireCd <= 0) {
          if (tu.jamSkip > 0) {
            tu.jamSkip--;
            tu.fireCd = tu.interval;
          } else {
            for (let k = 0; k < tu.perShot && tu.stack.length; k++) {
              const idx = tu.jamRandom ? this.rng.int(tu.stack.length) : tu.stack.length - 1;
              tu.jamRandom = false;
              const p = tu.stack.splice(idx, 1)[0];
              this.fire(s, tu, p, k);
            }
            tu.fireCd = tu.interval;
          }
          if (tu.stack.length === 0) {
            tu.phase = "load";
            tu.loadTimer = 0;
          }
        }
      }
    }
  }

  private fire(s: SideState, tu: TurretState, p: Payload, k: number): void {
    const foe = this.sides[s.side === 0 ? 1 : 0];
    const ammo = AMMO[p.ammo];
    const dmg = payloadDamage(ammo.base, ammo.rideScale, p.ride, p.mult, p.flat);
    const target = this.pickTarget(foe);
    let tx = target.x, ty = target.y;
    if (target.kind === "hull") {
      tx = this.rng.range(-6, 126);
      ty = this.rng.range(-4, 124);
    } else {
      tx += this.rng.range(-3, 3);
      ty += this.rng.range(-3, 3);
    }
    const heavy = tu.def.kind === "heavy";
    const flight = tu.def.flight + Math.max(0, ty) / 120 * 0.22 + k * 0.08;
    const proj: Projectile = {
      id: this.nextId++, from: s.side, turret: tu.index, payload: p, dmg, t: 0, flight, target, tx, ty, heavy,
    };
    this.projectiles.push(proj);
    tu.recoil = 1;
    s.stats.shots++;
    s.stats.payloadSum += dmg;
    if (s.stats.firstShot < 0) s.stats.firstShot = this.t;
    this.events.push({ type: "fire", side: s.side, turret: tu.index, heavy, dmg, proj: proj.id });
  }

  private pickTarget(foe: SideState): Target {
    if (this.rng.next() < 0.5 || !foe.targets.length) {
      return { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
    }
    return this.rng.weighted(foe.targets, (t) => t.weight);
  }

  private flight(dt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.t += dt;
      if (pr.t < pr.flight) {
        keep.push(pr);
        continue;
      }
      this.impact(pr);
    }
    this.projectiles = keep;
  }

  private impact(pr: Projectile): void {
    const atk = this.sides[pr.from];
    const def = this.sides[pr.from === 0 ? 1 : 0];
    const ammo = AMMO[pr.payload.ammo];
    const bonus = def.hull.fray * FRAY_BONUS;
    const total = pr.dmg + bonus;
    def.hull.hp -= total;
    def.hull.flash = 0.12;
    atk.stats.damage += total;
    if (ammo.fray > 0) def.hull.fray = Math.min(FRAY_MAX, def.hull.fray + ammo.fray);
    if (pr.payload.burn > 0) def.hull.burns.push({ dps: pr.payload.burn, t: BURN_TIME });
    let shocked = false;
    if (pr.payload.shock && pr.target.kind !== "hull") {
      shocked = this.disrupt(def, pr.target);
    }
    this.events.push({
      type: "impact", side: def.side, x: pr.tx, y: pr.ty, dmg: total, heavy: pr.heavy,
      kind: pr.target.kind, shock: shocked, burn: pr.payload.burn, big: total >= 14,
    });
  }

  private disrupt(s: SideState, t: Target): boolean {
    switch (t.kind) {
      case "gate": {
        const g = s.gates.find((g) => g.uid === t.ref);
        if (g) g.disrupted = DISRUPT_TIME;
        break;
      }
      case "factory": {
        const f = s.factories.find((f) => f.uid === t.ref);
        if (f) f.disrupted = DISRUPT_TIME;
        break;
      }
      case "turret": {
        const tu = s.turrets[t.ref];
        if (tu) tu.disrupted = DISRUPT_TIME;
        break;
      }
      case "belt": {
        const r = s.routes[t.ref];
        if (r && t.cell >= 0) r.cellDisrupt[t.cell] = DISRUPT_TIME;
        break;
      }
      default:
        return false;
    }
    this.events.push({ type: "disrupt", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell });
    return true;
  }

  private hullEffects(dt: number): void {
    for (const s of this.sides) {
      const foe = this.sides[s.side === 0 ? 1 : 0];
      let burn = 0;
      for (const b of s.hull.burns) {
        const step = Math.min(dt, b.t);
        burn += b.dps * step;
        b.t -= dt;
      }
      s.hull.burns = s.hull.burns.filter((b) => b.t > 0);
      if (burn > 0) {
        s.hull.hp -= burn;
        foe.stats.burnDealt += burn;
        foe.stats.damage += burn;
        s.hull.burnShown += burn;
        if (s.hull.burnShown >= 1) {
          const shown = Math.floor(s.hull.burnShown);
          s.hull.burnShown -= shown;
          this.events.push({ type: "burn", side: s.side, dmg: shown });
        }
      }
    }
    if (!this.windWarned && this.t >= WIND_WARN) {
      this.windWarned = true;
      this.events.push({ type: "windwarn" });
    }
    if (this.t >= WIND_START) {
      const dps = this.windDps();
      for (const s of this.sides) {
        s.hull.hp -= dps * dt;
        s.stats.windTaken += dps * dt;
      }
      this.windTick += dt;
      if (this.windTick >= 1) {
        this.windTick -= 1;
        this.events.push({ type: "wind", dmg: dps });
      }
    }
  }

  windDps(): number {
    if (this.t < WIND_START) return 0;
    return 1 + Math.floor((this.t - WIND_START) / 5);
  }

  /** 0..1 visual intensity of the dark wind. */
  windLevel(): number {
    return Math.max(0, Math.min(1, (this.t - WIND_WARN + 5) / 40));
  }

  private checkEnd(): void {
    const [p, e] = this.sides;
    let winner: Side | -1 | null = null;
    if (p.hull.hp <= 0 || e.hull.hp <= 0) {
      if (p.hull.hp <= 0 && e.hull.hp <= 0) winner = p.hull.hp > e.hull.hp ? 0 : e.hull.hp > p.hull.hp ? 1 : -1;
      else winner = p.hull.hp <= 0 ? 1 : 0;
    } else if (this.t >= BATTLE_CAP) {
      const pr = p.hull.hp / p.hull.max, er = e.hull.hp / e.hull.max;
      winner = pr > er ? 0 : er > pr ? 1 : -1;
    }
    if (winner !== null) {
      this.over = true;
      this.winner = winner;
      this.events.push({ type: "end", winner });
    }
  }

  drainEvents(): SimEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}

/** Headless run to completion (tests / balance). */
export function simulate(player: Build, enemy: Build, seed: number, maxTicks = 60 * 200): Battle {
  const b = new Battle(player, enemy, seed);
  while (!b.over && b.ticks < maxTicks) {
    b.step();
    b.events.length = 0;
  }
  return b;
}
