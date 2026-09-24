// Fixed-step combat simulation. Production, transport, processing, chamber handling,
// firing and impact are separate systems (spec §11, §12, §23). Playback speed never
// changes rules: callers only decide how many ticks to run per frame.

import { Rng } from "../core/rng";
import {
  AMMO, AMMO_SPACING, BATTLE_CAP, BELT_SPEED, BURN_TIME, CELL, COMMISSION_BASE, COMMISSION_STEP,
  DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, GUARD_SKIRT, HEROES, ITEMS, JAM_COOLDOWN, JAM_THRESHOLD, RULES_VERSION,
  TICK, WIND_START, WIND_WARN, WINDOW_TIME,
  type AmmoKind, type CoreRoutine, type HarassCause, type HeroDef, type ItemDef, type TurretDef,
} from "./content";
import { drakeConvert, pressureBonus, resolveCore, ROUTINES, type TurretCore } from "./cores"; // 0.6.1b
import {
  cloneBuild, connectorClaims, defOf, kx, ky, occupancy, payloadDamage, rigHits,
  routeInfo, routePolyline, speedWinner, type Build, type Dir, type HitTier,
} from "./deck";
import { makeRaceSide, raceAbsorb, raceIntake, raceLoaded, raceProduce, type RaceSide } from "./races"; // races:
import { effectAt, starsOf } from "./stars";
import { raceBeltSpeed, raceCurveDamage, raceDrag, raceImpact, raceLink } from "./races"; // races: METRONOME, SIPHON

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
  // 0.6.1p: star perks, absent on every 1-star payload (Payload.shock stays a boolean: src/sim/races builds payloads)
  shockTime?: number; // GALVANIC COIL 2-3 stars: the stall its Shock deals (absent: DISRUPT_TIME)
  jump?: number; // GALVANIC COIL SPARK JUMP: nearest other machines its Shock also stalls
  base?: number; // STAMP PRESS 2-3 stars: base damage, instead of AMMO[ammo].base
}

export interface BeltAmmo {
  p: Payload;
  s: number; // distance along route (px)
  processed: number; // last tile index whose centre (and hits) was passed
  blocked: boolean;
}

/** 0.6.2 BELTSIDE: one arrow of a rig landing on a belt tile (deck.ts RigHit, bound to the rig's state). */
export interface TileHit {
  g: GateState;
  dir: Dir; // the arrow's absolute deck-local direction
  tier: HitTier; // R7 tier
  route: number;
  tile: number;
}

/** A rig (kind "gate"): machinery on its own cell whose arrows act on the belt tiles they point at. */
export interface GateState {
  uid: number;
  def: ItemDef;
  x: number;
  y: number;
  route: number; // 0.6.2: the route of its first hit (route, then tile order), or -1 when IDLE
  cellIdx: number; // 0.6.2: the tile of its first hit, or -1
  hits: TileHit[]; // 0.6.2: every arrow that lands on a belt, in route, tile and R7 order ([] = IDLE)
  commissionAt: number;
  online: boolean;
  disrupted: number;
  flash: number; // render: time since last processed payload (counts down)
  arrowFlash: number[]; // 0.6.2 render (V3): per absolute direction, counts down after that arrow applied
}

export interface RouteState {
  index: number;
  factory: number;
  cells: number[];
  connected: boolean;
  turret: number;
  L: number;
  gateAt: TileHit[][]; // 0.6.2: per tile, the hits landing on it in R7 order (was one gate or null)
  ammo: BeltAmmo[]; // front (largest s) first
  cellDisrupt: number[];
  speedAt: number[]; // render: speed state per cell
  pts: { x: number; y: number }[];
  phase: number[]; // render: belt animation phase per cell (px)
  pressure: number; // blocked payloads on this route
  // 0.6.1p: GUARD_* flags per cell (content.ts), set in makeSide: OVERDRIVE REDLINE/AFTERBURNER (read by wave 2's
  // enemy slow and freeze; nothing in wave 1 does) and MANTLET ★3 BULWARK SKIRT (read by Battle.disrupt)
  guard: number[];
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
  // 0.6.1b: the core socket (src/sim/cores.ts). Precomputed so chambers stops reading def.window and WINDOW_TIME.
  core: TurretCore; // a bought core at its stars (x k), or the hero's signature identity core
  window: number; // loading window size (TurretDef.window)
  windowTime: number; // the window closes this long after its first load (WINDOW_TIME unless the core sets it)
  spin: number; // GATLING SPOOL: the current interval multiplier (1 for every other routine)
  lastShot: number; // GATLING SPOOL: battle time of the last firing opportunity (-1: none yet)
  // 0.6.1p: gear (makeTurret). window/windowTime above already include EXT. CHAMBER and HOPPER.
  noJam: boolean; // HOPPER ★3 BOTTOMLESS
  immune: HarassCause[]; // MANTLET: stalls Battle.disrupt ignores on this turret
  intakeGuard: number; // MANTLET ★3 BULWARK SKIRT: the last n tiles of each route into it share `immune`
  finisher: number; // FINISHER RAM: + this share of damage on the payload that empties the window (never on a GATLING)
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
  race?: RaceSide; // races: race mechanics state; undefined for Furnace and Weaver
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
  // 0.6.1b: set only by a bought core (Battle.fireCore); absent on every identity shot
  core?: CoreRoutine; // render hooks (pellets, flame cone, volley)
  share?: number; // SCATTER pellet: its share of the payload, which also scales the Fray bonus
  burn?: number; // Burn stacks it lands, instead of payload.burn (SCATTER splits them, DRAKE adds)
  burnTime?: number; // their duration, instead of BURN_TIME (DRAKE)
  noFray?: boolean; // SCATTER: only the first pellet applies the ammo's Fray stacks
  finisher?: boolean; // 0.6.1p: a FINISHER RAM finisher (render: a 1 px red trail); absent otherwise
}

export type SimEvent =
  | { type: "produce"; side: Side; factory: number }
  | { type: "process"; side: Side; gate: number; def: string; dir: Dir; route: number; tile: number } // 0.6.2: the arrow and the tile it hit
  | { type: "commission"; side: Side; gate: number }
  | { type: "load"; side: Side; turret: number }
  | { type: "fuse"; side: Side; turret: number; dmg: number } // races: two alloy blanks fused (FOUNDRY)
  | { type: "fire"; side: Side; turret: number; heavy: boolean; dmg: number; proj: number; core?: CoreRoutine } // 0.6.1b: core set by a bought core
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

/** The bare-hull target (a hull pick, or every HULLBREAKER shot). */
function hullTarget(): Target {
  return { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
}

/**
 * 0.6.2 BELTSIDE, R7 item 4: the speed state one tile sets from its active speed hits (online, not
 * disrupted): the biggest change on a log scale, a tie to the faster (deck.ts speedWinner); undefined
 * when no speed hit is active there.
 */
export function tileSpeed(list: readonly TileHit[]): number | undefined {
  let best: number | undefined;
  for (const h of list) {
    const sp = h.g.def.gate?.speed;
    if (!sp || !h.g.online || h.g.disrupted > 0) continue;
    best = best === undefined ? sp : speedWinner([best, sp]);
  }
  return best;
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
  private drained: SimEvent[] = []; // the other half of the drainEvents() double buffer
  readonly rng: Rng;
  readonly record: BattleRecord;
  private nextId = 1;
  private windWarned = false;
  private windTick = 0;

  constructor(player: Build, enemy: Build, seed: number) {
    this.rng = new Rng(seed);
    this.record = { rules: RULES_VERSION, seed, builds: [cloneBuild(player), cloneBuild(enemy)] };
    this.sides = [this.makeSide(0, cloneBuild(player)), this.makeSide(1, cloneBuild(enemy))];
    raceLink(this.sides); // races: a side facing SIPHON gets Drag state
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
      const d = effectAt(p.def, starsOf(p)); // 0.6.1a: the gate's spec at its stars (1 star = ITEMS[def])
      if (d.kind !== "gate") continue;
      const g: GateState = {
        uid: p.uid, def: d, x: p.x, y: p.y, route: -1, cellIdx: -1, hits: [], commissionAt: Infinity,
        online: false, disrupted: 0, flash: 0, arrowFlash: [0, 0, 0, 0],
      };
      gates.push(g);
      gateByUid.set(p.uid, g);
    }
    // 0.6.2 BELTSIDE: every arrow landing on a belt tile, per route and tile in R7 order (deck.ts rigHits).
    // Commissioning keeps the old rule per route, counting rigs (not arrows) in order of their first hit
    // there: the k-th rig on a route comes online at COMMISSION_BASE + COMMISSION_STEP x k, and a rig on
    // several routes comes online at the earliest of those times. An IDLE rig never comes online.
    const hits = rigHits(b);
    const routes: RouteState[] = b.routes.map((r, i) => {
      const info = routeInfo(b, i, claims, occ, hits);
      const rank = new Map<number, number>();
      const gateAt: TileHit[][] = (hits[i] ?? r.cells.map(() => [])).map((list) => list.flatMap((h) => {
        const g = gateByUid.get(h.uid);
        if (!g) return [];
        if (!rank.has(g.uid)) {
          rank.set(g.uid, rank.size);
          g.commissionAt = Math.min(g.commissionAt, COMMISSION_BASE + COMMISSION_STEP * (rank.size - 1));
        }
        const th: TileHit = { g, dir: h.dir, tier: h.tier, route: i, tile: h.tile };
        g.hits.push(th);
        if (g.route < 0) {
          g.route = i;
          g.cellIdx = h.tile;
        }
        return [th];
      }));
      return {
        index: i, factory: r.factory, cells: [...r.cells], connected: info.connected, turret: info.turret,
        L: info.length, gateAt, ammo: [], cellDisrupt: r.cells.map(() => 0), speedAt: r.cells.map(() => 1),
        pts: routePolyline(b, r, info.connected), phase: r.cells.map(() => 0), pressure: 0,
        guard: r.cells.map(() => 0), // 0.6.1p
      };
    });
    const factories: FactoryState[] = b.items
      .filter((p) => defOf(p).kind === "factory")
      .map((p) => ({
        uid: p.uid, def: effectAt(p.def, starsOf(p)), x: p.x, y: p.y, // 0.6.1a: factory spec at its stars
        routes: routes.filter((r) => r.factory === p.uid).map((r) => r.index),
        timer: 0.35, rr: 0, disrupted: 0, flash: 0, stalled: false, produced: 0,
      }));
    const turrets: TurretState[] = h.turrets.map((def, i) => makeTurret(b, i, def)); // 0.6.1b: gear and core
    // 0.6.1p: guard flags. OVERDRIVE ★2/★3 flags its own tile and every tile downstream (static: wave 2's hooks
    // decide whether the gate must be online); a MANTLET ★3 turret's BULWARK SKIRT flags each connected route's last n tiles.
    // beltside-062 B4 (DESIGN §11 P5): a tile's flags are the OR of every hit landing on it, whichever speed wins
    // the tile, and they reach that tile and every tile downstream; an X rig flags each belt it hits.
    for (const r of routes) {
      r.gateAt.forEach((list, ci) => {
        let flags = 0;
        for (const h of list) flags |= h.g.def.gate?.guard ?? 0;
        if (flags) for (let j = ci; j < r.guard.length; j++) r.guard[j] |= flags;
      });
      const skirt = r.connected ? turrets[r.turret]?.intakeGuard ?? 0 : 0;
      for (let j = Math.max(0, r.guard.length - skirt); j < r.guard.length; j++) r.guard[j] |= GUARD_SKIRT;
    }
    const targets: Target[] = [];
    // 0.6.2 BELTSIDE (R9): no machinery stands on a belt, so every belt tile is a belt target; a rig stays
    // a gate target (weight 2) at its own cell, hitting a belt or IDLE.
    for (const r of routes) {
      r.cells.forEach((k, ci) => {
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
    return {
      side, build: b, hero: h, hull, factories, gates, routes, turrets, targets, stats: emptyStats(),
      race: makeRaceSide(b), // races:
    };
  }

  /** races: payload ids for payloads created by race hooks (src/sim/races). */
  newId(): number {
    return this.nextId++;
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
      for (let d = 0; d < 4; d++) if (g.arrowFlash[d] > 0) g.arrowFlash[d] = Math.max(0, g.arrowFlash[d] - dt);
      if (g.disrupted > 0) {
        g.disrupted = Math.max(0, g.disrupted - dt);
        s.stats.disrupted += dt;
      }
      if (!g.online && g.hits.length > 0 && this.t >= g.commissionAt) {
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
      // speed states: the latest tile with an active speed hit wins for everything downstream of it
      // (0.6.2, R7 item 4: several speed hits on one tile resolve by tileSpeed)
      let state = 1;
      for (let i = 0; i < r.cells.length; i++) {
        const won = tileSpeed(r.gateAt[i]);
        if (won !== undefined) state = won;
        r.speedAt[i] = s.race ? raceBeltSpeed(this, s, r.index, i, state) : state; // races: speed lock, Drag
        const v = r.cellDisrupt[i] > 0 ? 0 : BELT_SPEED * r.speedAt[i]; // races: was BELT_SPEED * state
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
      for (const g of s.gates) {
        g.flash = Math.max(0, g.flash - dt);
        for (let d = 0; d < 4; d++) g.arrowFlash[d] = Math.max(0, g.arrowFlash[d] - dt);
      }
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
      if (s.race && raceProduce(this, s, f, dt)) continue; // races: Crucible twin pour
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
          if (spec.base !== undefined) p.base = spec.base; // 0.6.1p: STAMP PRESS dies (absent at 1 star)
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
      const won = tileSpeed(r.gateAt[i]);
      if (won !== undefined) state = won;
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
        let v = BELT_SPEED * (s.race?.speedLock ? 1 : this.speedStateAt(r, a.s)); // races: METRONOME speed lock
        if (ci >= 0 && r.cellDisrupt[ci] > 0) v = 0;
        const drag = s.race ? raceDrag(this, s, r.index, ci) : 1; // races: SIPHON Drag
        if (drag !== 1) v *= drag; // races:
        const want = a.s + v * dt;
        let ns = Math.min(want, limit);
        if (ns < a.s) ns = a.s;
        const moved = ns - a.s;
        if (v > 0 && moved > 0 && drag === 1) a.p.ride += moved / v; // races: dragged movement isn't ride
        a.blocked = want > limit + 1e-6 || v === 0;
        if (a.blocked) pressure++;
        // apply the hits of every tile whose centre was crossed (0.6.2: R7 order, one per arrow)
        while (a.processed + 1 < n && (a.processed + 1) * CELL + CELL / 2 <= ns) {
          a.processed++;
          // beltside-062 B1: BELTSIDE's per-tile hit list (0.6.1p's copies ride applyTile's trailing placement)
          const list = r.gateAt[a.processed];
          if (list.length) this.applyTile(s, a, list, inserts);
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

  /**
   * 0.6.2 BELTSIDE: a payload crosses a tile centre: every active hit there applies in R7 order (the list is
   * sorted). A SPLITTER-type hit's copies take the rest of this tile's hits too, so the tile treats the
   * original and its copies alike (Decision 3). A disrupted or uncommissioned rig stops all its arrows (R9).
   * beltside-062 B2 (DESIGN §11 P2): each SPLITTER hit is one split, and ★3 THREE-WAY makes two copies per hit;
   * a later hit on the same tile applies to the original and to every copy made so far.
   */
  private applyTile(s: SideState, a: BeltAmmo, list: TileHit[], inserts: { after: BeltAmmo; copy: BeltAmmo }[]): void {
    let group: BeltAmmo[] | null = null; // the original plus copies made on this tile (only once a split happens)
    for (const h of list) {
      const g = h.g;
      if (!g.online || g.disrupted > 0) continue;
      const on: BeltAmmo[] = group ?? [a];
      const made: BeltAmmo[] = [];
      for (const x of on) made.push(...this.applyHit(s, x, h));
      if (made.length) group = [...on, ...made];
    }
    if (!group) return;
    // the copies trail the original in the order they were made, 0.01 px apart (one split: a.s - 0.01, as
    // before; one ★3 split: a.s - 0.01 and a.s - 0.02, as 0.6.1p); queued last-first because each insert lands
    // right behind the original
    for (let k = group.length - 1; k >= 1; k--) {
      group[k].s = a.s - 0.01 * k;
      inserts.push({ after: a, copy: group[k] });
    }
  }

  /**
   * One rig arrow processes payload `a` (0.6.1p's applyGate body, unchanged); returns the copies a SPLITTER hit
   * makes (copies - 1 of them: 1, or 2 at ★3 THREE-WAY), else [].
   */
  private applyHit(s: SideState, a: BeltAmmo, h: TileHit): BeltAmmo[] {
    const g = h.g;
    const e = g.def.gate!;
    const p = a.p;
    const copies: BeltAmmo[] = [];
    if (e.flat) p.flat += e.flat;
    // 0.6.1p: LONG HAUL ★2/★3 counts at most priorCap prior gates (1 star has no cap)
    if (e.perPriorGate) p.flat += e.perPriorGate * (e.priorCap !== undefined ? Math.min(p.prior, e.priorCap) : p.prior);
    if (e.burn) p.burn += e.burn;
    if (e.shock) {
      p.shock = true;
      // 0.6.1p: GALVANIC COIL ★2/★3: the longest stall and jump passed wins (a 1-star coil sets neither)
      if (e.shockTime !== undefined) p.shockTime = Math.max(p.shockTime ?? DISRUPT_TIME, e.shockTime);
      if (e.jump) p.jump = Math.max(p.jump ?? 0, e.jump);
    }
    if (e.split) {
      p.mult *= e.split.mult;
      p.flat *= e.split.mult;
      p.copy = true;
      for (let c = 1; c < e.split.copies; c++) { // 0.6.1p: ★3 THREE-WAY makes two copies
        const cp: Payload = { ...p, id: this.nextId++ };
        copies.push({ p: cp, s: a.s - 0.01 * c, processed: a.processed, blocked: false });
      }
    }
    p.prior++;
    for (const c of copies) c.p.prior = p.prior;
    g.flash = 0.22;
    g.arrowFlash[h.dir] = 0.22;
    this.events.push({ type: "process", side: s.side, gate: g.uid, def: g.def.id, dir: h.dir, route: h.route, tile: h.tile });
    return copies; // beltside-062 B3
  }

  private chambers(s: SideState, dt: number): void {
    // intake: front payload at the end of a connected route enters its turret's chamber
    for (const r of s.routes) {
      if (!r.connected || !r.ammo.length) continue;
      const front = r.ammo[0];
      if (front.s < r.L - 1e-6) continue;
      const tu = s.turrets[r.turret];
      if (!tu || tu.disrupted > 0) continue;
      if (s.race && raceIntake(this, s, r, tu, front.p)) { // races: alloy fusion (no slot used)
        r.ammo.shift();
        continue;
      }
      if (tu.phase === "load" && tu.stack.length < tu.window) { // 0.6.1b: was tu.def.window (the same number)
        tu.stack.push(front.p);
        r.ammo.shift();
        this.events.push({ type: "load", side: s.side, turret: tu.index });
        if (s.race) raceLoaded(this, s, r, tu, front.p); // races: blank sync stamp, bulwark plating
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
      // 0.6.1b: the core's chamber hooks (src/sim/cores.ts ROUTINES); the identity hooks are the old rules
      const rt = ROUTINES[tu.core.routine];
      if (tu.phase === "load") {
        if (tu.stack.length > 0) tu.loadTimer += dt;
        if (rt.ready(tu)) { // identity: stack.length >= window || (stack.length > 0 && loadTimer >= WINDOW_TIME)
          tu.phase = "fire";
        } else if (tu.stack.length === 0 && tu.fireCd <= 0) {
          s.stats.idle += dt;
        }
      }
      if (tu.phase === "fire") {
        if (waiting >= JAM_THRESHOLD && tu.jamCd <= 0 && tu.jamSkip === 0 && !rt.noJam(tu) && !tu.noJam) { // 0.6.1p: + HOPPER ★3
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
            const n = rt.count(tu); // identity: perShot
            for (let k = 0; k < n && tu.stack.length; k++) {
              const queued = tu.waiting + tu.stack.length; // PRESSURE BREECH: waiting plus its window, this load included
              const idx = tu.jamRandom ? this.rng.int(tu.stack.length) : rt.select(tu); // identity: LIFO
              tu.jamRandom = false;
              const p = tu.stack.splice(idx, 1)[0];
              // 0.6.1p FINISHER RAM: the payload that empties the window. A GATLING never holds a window
              // (cores.ts gatlingReady), so none of its shots is a finisher (the Prime's call, brief 0.6.1p).
              const fin = tu.finisher > 0 && tu.stack.length === 0 && tu.core.routine !== "gatling";
              this.fire(s, tu, p, k, queued, fin);
            }
            tu.fireCd = rt.cadence(tu, this.t); // identity: interval
          }
          if (tu.stack.length === 0) {
            tu.phase = "load";
            tu.loadTimer = 0;
          }
        }
      }
    }
  }

  private fire(s: SideState, tu: TurretState, p: Payload, k: number, queued: number, fin = false): void {
    if (tu.core.bought) return this.fireCore(s, tu, p, k, queued, fin); // 0.6.1b; the identity shot below is unchanged
    const foe = this.sides[s.side === 0 ? 1 : 0];
    const ammo = AMMO[p.ammo];
    let dmg = ammo.rideCurve // races: PENDULUM curve
      ? raceCurveDamage(ammo, s, tu, p)
      : payloadDamage(p.base ?? ammo.base, ammo.rideScale, p.ride, p.mult, p.flat); // 0.6.1p: p.base (STAMP PRESS dies)
    if (fin) dmg *= 1 + tu.finisher; // 0.6.1p: FINISHER RAM
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
    if (fin) proj.finisher = true; // 0.6.1p
    this.projectiles.push(proj);
    tu.recoil = 1;
    s.stats.shots++;
    s.stats.payloadSum += dmg;
    if (s.stats.firstShot < 0) s.stats.firstShot = this.t;
    this.events.push({ type: "fire", side: s.side, turret: tu.index, heavy, dmg, proj: proj.id });
  }

  /**
   * 0.6.1b, the shape hook: what one payload fired by a bought core becomes (ARSENAL.md §2.3, catalogue.json).
   * - SCATTER: `pellets` projectiles at `share` each, each aimed anew (a target draw per pellet); Burn is
   *   divided between them (rounded up), Shock rides every pellet, only the first applies the ammo's Fray.
   * - PRESSURE: + perQueued x min(maxCount, queued). SALVO: + volleyFlat on every volley shell.
   * - HULLBREAKER: always bare hull (no target draw), x hullMul.
   * - DRAKE: the flat bonus becomes Burn (1 stack per flatPerBurn), + addBurn, lasting burnTime; flight x flightMul.
   * ROTARY and GATLING fire like the identity shot (their hooks are in the chamber).
   */
  private fireCore(s: SideState, tu: TurretState, p: Payload, k: number, queued: number, fin = false): void {
    const foe = this.sides[s.side === 0 ? 1 : 0];
    const ammo = AMMO[p.ammo];
    const c = tu.core.spec, routine = tu.core.routine;
    const conv = routine === "drake" ? drakeConvert(c, p.flat) : { stacks: 0, used: 0 };
    let dmg = ammo.rideCurve
      ? Math.max(1, raceCurveDamage(ammo, s, tu, p) - conv.used)
      : payloadDamage(p.base ?? ammo.base, ammo.rideScale, p.ride, p.mult, p.flat - conv.used); // 0.6.1p: p.base
    let burn = p.burn, burnTime: number | undefined, flightMul = 1, pellets = 1, share = 1;
    if (routine === "pressure") dmg += pressureBonus(c, queued);
    else if (routine === "salvo") dmg += c.volleyFlat ?? 0;
    else if (routine === "hullbreaker") dmg *= c.hullMul ?? 1;
    else if (routine === "drake") {
      burn += conv.stacks + (c.addBurn ?? 0);
      burnTime = c.burnTime;
      flightMul = c.flightMul ?? 1;
    } else if (routine === "scatter") {
      pellets = Math.max(1, c.pellets ?? 1);
      share = c.share ?? 1;
    }
    if (fin) dmg *= 1 + tu.finisher; // 0.6.1p: FINISHER RAM, after the core's own bonus (never set on a GATLING)
    const heavy = tu.def.kind === "heavy";
    for (let j = 0; j < pellets; j++) {
      const target = routine === "hullbreaker" ? hullTarget() : this.pickTarget(foe); // HULLBREAKER: no target draw
      let tx = target.x, ty = target.y;
      if (target.kind === "hull") {
        tx = this.rng.range(-6, 126);
        ty = this.rng.range(-4, 124);
      } else {
        tx += this.rng.range(-3, 3);
        ty += this.rng.range(-3, 3);
      }
      const flight = tu.def.flight * flightMul + Math.max(0, ty) / 120 * 0.22 + k * 0.08 + j * 0.03;
      const pd = dmg * share;
      const proj: Projectile = {
        id: this.nextId++, from: s.side, turret: tu.index, payload: p, dmg: pd, t: 0, flight, target, tx, ty, heavy,
        core: routine, burn: pellets > 1 ? Math.ceil(burn / pellets) : burn,
        ...(burnTime !== undefined ? { burnTime } : {}),
        ...(pellets > 1 ? { share, noFray: j > 0 } : {}),
        ...(fin ? { finisher: true } : {}), // 0.6.1p
      };
      this.projectiles.push(proj);
      s.stats.shots++;
      s.stats.payloadSum += pd;
      this.events.push({ type: "fire", side: s.side, turret: tu.index, heavy, dmg: pd, proj: proj.id, core: routine });
    }
    tu.recoil = 1;
    if (s.stats.firstShot < 0) s.stats.firstShot = this.t;
  }

  private pickTarget(foe: SideState): Target {
    if (this.rng.next() < 0.5 || !foe.targets.length) {
      return hullTarget();
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
    // 0.6.1b: a SCATTER pellet's Fray bonus x its share, so Fray isn't multiplied (absent on identity shots)
    const bonus = pr.share !== undefined ? def.hull.fray * FRAY_BONUS * pr.share : def.hull.fray * FRAY_BONUS;
    const total = pr.dmg + bonus;
    def.hull.hp -= def.race ? raceAbsorb(def, total) : total; // races: bulwark plating soaks first
    def.hull.flash = 0.12;
    atk.stats.damage += total;
    if (ammo.fray > 0 && !pr.noFray) def.hull.fray = Math.min(FRAY_MAX, def.hull.fray + ammo.fray);
    const burn = pr.burn ?? pr.payload.burn; // 0.6.1b: a core's Burn (SCATTER split, DRAKE added), else the payload's
    if (burn > 0) def.hull.burns.push({ dps: burn, t: pr.burnTime ?? BURN_TIME });
    let shocked = false;
    if (pr.payload.shock && pr.target.kind !== "hull") {
      const secs = pr.payload.shockTime ?? DISRUPT_TIME; // 0.6.1p: GALVANIC COIL ★2/★3 stall longer
      shocked = this.disrupt(def, pr.target, secs, "shock");
      if (pr.payload.jump) this.sparkJump(def, pr.target, secs, pr.payload.jump); // 0.6.1p: SPARK JUMP
    }
    if (atk.race || def.race) raceImpact(this, atk, def, pr); // races: SIPHON echo memory and Drag
    this.events.push({
      type: "impact", side: def.side, x: pr.tx, y: pr.ty, dmg: total, heavy: pr.heavy,
      kind: pr.target.kind, shock: shocked, burn, big: total >= 14,
    });
  }

  /**
   * Stall a machine for `secs` (a longer stall already running is kept: with 1-star coils every stall is
   * DISRUPT_TIME, so this is exactly 0.6.0's overwrite). 0.6.1p MANTLET: a turret whose `immune` lists `cause` is
   * not stalled, nor is a tile of its ★3 BULWARK SKIRT (RouteState.guard GUARD_SKIRT), nor (beltside-062, P6) a rig
   * with at least one hit on such a tile; false, and no event, then.
   */
  private disrupt(s: SideState, t: Target, secs = DISRUPT_TIME, cause: HarassCause = "shock"): boolean {
    switch (t.kind) {
      case "gate": {
        const g = s.gates.find((g) => g.uid === t.ref);
        // beltside-062 B5 (DESIGN §11 P6): a rig is skirted when ANY of its hits lands on a skirt tile (not only its
        // first hit, g.route/g.cellIdx); an IDLE rig (no hits) is never skirted
        if (g && g.hits.some((h) => this.skirted(s, s.routes[h.route], h.tile, cause))) return false;
        if (g) g.disrupted = Math.max(g.disrupted, secs);
        break;
      }
      case "factory": {
        const f = s.factories.find((f) => f.uid === t.ref);
        if (f) f.disrupted = Math.max(f.disrupted, secs);
        break;
      }
      case "turret": {
        const tu = s.turrets[t.ref];
        if (tu && tu.immune.includes(cause)) return false;
        if (tu) tu.disrupted = Math.max(tu.disrupted, secs);
        break;
      }
      case "belt": {
        const r = s.routes[t.ref];
        if (r && t.cell >= 0 && this.skirted(s, r, t.cell, cause)) return false;
        if (r && t.cell >= 0) r.cellDisrupt[t.cell] = Math.max(r.cellDisrupt[t.cell], secs);
        break;
      }
      default:
        return false;
    }
    this.events.push({ type: "disrupt", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell });
    return true;
  }

  /** 0.6.1p MANTLET ★3: cell `ci` of route `r` lies in its turret's BULWARK SKIRT and that turret ignores `cause`. */
  private skirted(s: SideState, r: RouteState | undefined, ci: number, cause: HarassCause): boolean {
    if (!r || ci < 0 || !((r.guard[ci] ?? 0) & GUARD_SKIRT)) return false;
    return s.turrets[r.turret]?.immune.includes(cause) ?? false;
  }

  /**
   * 0.6.1p GALVANIC COIL ★2/★3 SPARK JUMP: the spark also stalls the `n` machines nearest the struck one (by
   * distance between target centres; ties keep foe.targets order). No RNG draw.
   */
  private sparkJump(s: SideState, from: Target, secs: number, n: number): void {
    const others = s.targets
      .filter((t) => t.kind !== "hull" && !(t.kind === from.kind && t.ref === from.ref && t.cell === from.cell))
      .map((t, i) => ({ t, i, d: (t.x - from.x) ** 2 + (t.y - from.y) ** 2 }))
      .sort((a, b) => a.d - b.d || a.i - b.i);
    for (const o of others.slice(0, n)) this.disrupt(s, o.t, secs, "shock");
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
        s.hull.hp -= s.race ? raceAbsorb(s, burn) : burn; // races: plating soaks Burn (not the wind)
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

  /** Hand over this tick's events without allocating: two arrays swap roles, so the array
   *  returned stays valid until the next drainEvents() call, which clears and reuses it.
   *  Read (or copy) the events before the next tick is drained. */
  drainEvents(): SimEvent[] {
    const ev = this.events;
    const next = this.drained;
    next.length = 0;
    this.events = next;
    this.drained = ev;
    return ev;
  }
}

/**
 * One turret's battle state (Battle.makeSide). Its gear first (mods keep their precedence over cores,
 * ARSENAL.md §2.1 rule 7: CALIBRATION multiplies the interval, EXT. CHAMBER raises payloads per shot), then
 * 0.6.1b its core (src/sim/cores.ts resolveCore): a bought core at its stars with its absolute numbers x k, or
 * the hero's signature identity core, whose numbers are exactly today's. Exported for tests that fit a core to a
 * stand-in TurretDef (the medium class).
 */
export function makeTurret(b: Build, i: number, def: TurretDef): TurretState {
  const g = gearStats(b, i);
  const core = resolveCore(b, i, def);
  const c = core.spec;
  const interval = def.fireInterval * g.fireMul;
  const windowTime = c.windowTime ?? WINDOW_TIME;
  return {
    index: i, def, stack: [], phase: "load", loadTimer: 0, fireCd: 0, jamSkip: 0, jamRandom: false,
    jamCd: 0, disrupted: 0, perShot: g.perShot, interval: c.intervalMul ? interval * c.intervalMul : interval, recoil: 0, jamFx: 0,
    // 0.6.1p: EXT. CHAMBER ★2/★3 and HOPPER add window slots; HOPPER adds seconds to the core's window time (a
    // GATLING never reads windowTime, cores.ts gatlingReady, so there HOPPER's seconds do nothing; its slots count)
    waiting: 0, core, window: def.window + g.window, windowTime: g.windowTime ? windowTime + g.windowTime : windowTime,
    spin: c.start ?? 1, lastShot: -1,
    noJam: g.noJam, immune: g.immune, intakeGuard: g.intakeGuard, finisher: g.finisher,
  };
}

/** 0.6.1p: turret i's gear at its stars, folded (makeTurret; the inspector and the cruiser art read it too). */
export interface GearStats {
  perShot: number; // payloads per firing opportunity (the most any gear gives, at least 1)
  fireMul: number; // x the fire interval
  window: number; // + window slots
  windowTime: number; // + window seconds
  noJam: boolean;
  immune: HarassCause[];
  intakeGuard: number;
  finisher: number;
}

export function gearStats(b: Build, i: number): GearStats {
  const out: GearStats = { perShot: 1, fireMul: 1, window: 0, windowTime: 0, noJam: false, immune: [], intakeGuard: 0, finisher: 0 };
  for (const m of b.mods.filter((m) => m.turret === i)) {
    const md = ITEMS[m.def] ? effectAt(m.def, starsOf(m)).mod : undefined; // 0.6.1a: mod spec at its stars (a core has none)
    if (md?.perShot) out.perShot = Math.max(out.perShot, md.perShot);
    if (md?.fireMul) out.fireMul *= md.fireMul;
    if (md?.window) out.window += md.window;
    if (md?.windowTime) out.windowTime += md.windowTime;
    if (md?.noJam) out.noJam = true;
    if (md?.immune) for (const c of md.immune) if (!out.immune.includes(c)) out.immune.push(c);
    if (md?.intakeGuard) out.intakeGuard = Math.max(out.intakeGuard, md.intakeGuard);
    if (md?.finisher) out.finisher = Math.max(out.finisher, md.finisher);
  }
  return out;
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
