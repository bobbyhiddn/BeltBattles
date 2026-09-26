// Fixed-step combat simulation. Production, transport, processing, chamber handling,
// firing and impact are separate systems (spec §11, §12, §23). Playback speed never
// changes rules: callers only decide how many ticks to run per frame.

import { Rng } from "../core/rng";
import {
  AMMO, AMMO_SPACING, BATTLE_CAP, BELT_SPEED, BURN_TIME, CELL, COMMISSION_BASE, COMMISSION_STEP,
  DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, GUARD_FREEZE, GUARD_SKIRT, GUARD_SLOW, HEROES, ITEMS, JAM_COOLDOWN, JAM_THRESHOLD, RULES_VERSION,
  TICK, WIND_START, WIND_WARN, WINDOW_TIME,
  type AmmoKind, type CoreRoutine, type HarassCause, type HeroDef, type ItemDef, type TurretDef,
} from "./content";
import { drakeConvert, pressureBonus, resolveCore, ROUTINES, type TurretCore } from "./cores"; // 0.6.1b
import {
  cloneBuild, connectorClaims, defOf, installedTurrets, kx, ky, occupancy, payloadDamage, rigHits,
  routeInfo, routePolyline, speedWinner, type Build, type Dir, type HitTier, type RigHit,
} from "./deck";
import { journeyTiles, type JoinLink } from "./deck"; // 0.6.2j: belt joins
import { makeRaceSide, raceAbsorb, raceIntake, raceLoaded, raceProduce, type RaceSide } from "./races"; // races:
import { effectAt, starsOf } from "./stars";
import { boostable, overclocked } from "./overclock";
import { debuffedDamage, segmentBounds, siftDebuffs, type HarassRound, type PayloadDebuffs } from "./harassment";
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
  preset?: "ember" | "spark"; // 0.6.1c HOT SWAP: the cycle step it was stamped with (render tint; burn/shock already written)
  debuffs?: PayloadDebuffs; // carried across routes, copies and future junction handoffs
  harass?: HarassRound; // opt-in round hook for the later foundries; ordinary ammo has no extra draws
  static?: boolean; // opt-in Static hull stall hook
  arc?: number; // opt-in nearest-machine arc count; each arc passes through the same guard
  rip?: { count: number; reach: number }; // opt-in Grapnel core hook, reach in belt tiles
  heat?: number;
  heatRide?: number;
  heatBonus?: number;
  pulseSeen?: Record<number, number>;
  compound?: Payload;
  poison?: number;
  fray?: number;
  frayCap?: number;
  staticTime?: number;
  boosters?: number[];
  // 0.6.2j (J14 (a)): set once the payload rides a main belt after a join: add it to a tile's index on the belt it
  // rides to get that tile's place on the payload's own journey (its own belt's tiles, then the main belt's from the
  // join tile on). Absent on every payload that never joined (0). Copies inherit it.
  journeyOffset?: number;
}

export interface BeltAmmo {
  p: Payload;
  s: number; // distance along route (px)
  processed: number; // last tile index whose centre (and hits) was passed
  blocked: boolean;
  via?: number; // 0.6.2j, render: the joining belt it entered this route from (drawn crossing until the join tile's centre)
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
  frozen: number;
  wrecked: boolean;
  tolls: number;
  sorted: number; // SORTING ARM counts every arrow hit in battle order
  cooldown: number;
  fuse: number;
  consumed: boolean;
  boostedBy: { booster: GateState; route: number }[];
  flash: number; // render: time since last processed payload (counts down)
  arrowFlash: number[]; // 0.6.2 render (V3): per absolute direction, counts down after that arrow applied
  // 0.6.1c ASSEMBLY LINE ★3 HOT START: overclocked (overclock.ts) until this battle time (s). beltside-062c (DESIGN
  // §12 P7): the whole rig, every arrow on any belt, once one of its arrows hits a ★3 Assembly Line's belt
  hotUntil?: number;
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
  cellFrozen: number[];
  cellSlow: { mul: number; t: number }[];
  speedAt: number[]; // render: speed state per cell
  pts: { x: number; y: number }[];
  phase: number[]; // render: belt animation phase per cell (px)
  pressure: number; // blocked payloads on this route
  // 0.6.1p: GUARD_* flags per cell (content.ts), set in makeSide: OVERDRIVE REDLINE/AFTERBURNER (read by wave 2's
  // enemy slow and freeze; nothing in wave 1 does) and the tiles a MANTLET shields (★2 FULL PLATE, 0.6.2 FB-B, and ★3
  // BULWARK SKIRT; read by Battle.disrupt)
  guard: number[];
  // 0.6.2j: set only on a joining belt (legal join). Its payloads go to the main belt at the join tile (Battle.joins),
  // never into a turret: `connected` is false and `turret` -1 here; `join.feeds` is its chain's turret.
  join?: RouteJoin;
}

/** 0.6.2j (J1-J6): a joining belt's link into its main belt, read once in makeSide. */
export interface RouteJoin {
  route: number; // the main belt (route index)
  tile: number; // the join tile's index along it
  enter: number; // where a joined payload enters the main belt: the join tile's upstream edge, tile x CELL (px)
  tail: number; // J6: the path from this belt's end to its chain's turret intake (px)
  feeds: number; // the chain's turret (routeInfo's J2 turret), or -1 when the chain reaches none
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
  frozen: number;
  flash: number; // render
  stalled: boolean;
  produced: number;
  // 0.6.1c (FactorySpec.batch / cycle): 0 for every factory without them, so those stamp exactly as before
  pending: number; // DOUBLE STAMP, SHOT TOWER: slugs of this cycle still waiting in the mouth for AMMO_SPACING
  cycleIdx: number; // HOT SWAP: the preset the next stamp writes
  seenHarass: number;
  seenWreck: number;
  triggerQueue: number;
  triggerCooldown: number;
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
  frozen: number;
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
  intakeGuard: number; // MANTLET ★2 FULL PLATE (1, 0.6.2 FB-B), ★3 BULWARK SKIRT (3): the last n tiles of each route into it share `immune`
  finisher: number; // FINISHER RAM: + this share of damage on the payload that empties the window (never on a GATLING)
  intercept: number; // Flak mod's chance; the side takes the maximum across its turrets
  rerolls: number;
  factoryWeight: number;
  alwaysMachine: boolean;
  charge: number;
  salvage: number;
  longRideFlat: number; // LONGCASE: damage on other ammo after its belt-ride threshold
  longRideMin: number;
}

export interface HullState {
  hp: number;
  max: number;
  fray: number;
  frayMax: number;
  poison: { stacks: number; t: number };
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
  flak: number;
  harassAccepted: number; // future Scrapper consumes accepted enemy effects from this side
  wreckAccepted: number;
  limpets: { at: number; target: Target; from: Side; blast: number; stall: number }[];
  stats: SideStats;
  race?: RaceSide; // races: race mechanics state; undefined for Furnace and Weaver
  joiners?: RouteState[]; // 0.6.2j (J5): the joining belts, lowest last-cell key first; absent without joins
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
  flakChecked?: boolean;
  splash?: number;
  splashShare?: number;
  tesla?: { arcs: number; stall: number; share: number };
  lance?: { columns: number; share: number; col: number };
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
  | { type: "telegraph"; side: Side; proj: number; round: HarassRound["kind"]; target: Target; impactAt: number }
  | { type: "flak"; side: Side; proj: number }
  | { type: "toll"; side: Side; gate: number; remaining: number; cause: HarassCause }
  | { type: "harass"; side: Side; kind: TargetKind; ref: number; cell: number; cause: HarassCause }
  | { type: "repair"; side: Side; amount: number; gate: number }
  | { type: "arc" | "lance" | "splash"; side: Side; x: number; y: number }
  | { type: "freeze" | "slow" | "wreck" | "rip" | "limpet"; side: Side; kind: TargetKind; ref: number; cell: number; payload?: number }
  | { type: "burn"; side: Side; dmg: number }
  | { type: "poison"; side: Side; dmg: number }
  | { type: "keg"; side: Side; gate: number }
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
    if (!sp || !h.g.online || h.g.disrupted > 0 || h.g.frozen > 0 || h.g.wrecked) continue;
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
      hp: h.hull + b.hullBonus, max: h.hull + b.hullBonus, fray: 0, frayMax: FRAY_MAX,
      poison: { stacks: 0, t: 0 }, burns: [], burnShown: 0, windShown: 0, flash: 0,
    };
    const gates: GateState[] = [];
    const gateByUid = new Map<number, GateState>();
    for (const p of b.items) {
      const d = effectAt(p.def, starsOf(p)); // 0.6.1a: the gate's spec at its stars (1 star = ITEMS[def])
      if (d.kind !== "gate") continue;
      const g: GateState = {
        uid: p.uid, def: d, x: p.x, y: p.y, route: -1, cellIdx: -1, hits: [], commissionAt: Infinity,
        online: false, disrupted: 0, frozen: 0, wrecked: false, tolls: d.gate?.toll ?? 0, sorted: 0,
        cooldown: 0, fuse: d.gate?.keg?.fuse ?? 0, consumed: false, boostedBy: [],
        flash: 0, arrowFlash: [0, 0, 0, 0],
      };
      gates.push(g);
      gateByUid.set(p.uid, g);
    }
    // 0.6.2 BELTSIDE: every arrow landing on a belt tile, per route and tile in R7 order (deck.ts rigHits).
    // Commissioning keeps the old rule per route, counting rigs (not arrows) in order of their first hit
    // there: the k-th rig on a route comes online at COMMISSION_BASE + COMMISSION_STEP x k, and a rig on
    // several routes comes online at the earliest of those times. An IDLE rig never comes online.
    // beltside-062c (DESIGN §12 P7): 0.6.1c's ASSEMBLY LINE rule, per route. With a running Assembly Line, a
    // route's time is scaled by the best factor, except on an Assembly Line's own belt, where it is 0 s (and
    // ★3 HOT START overclocks the whole rig until hotUntil). The earliest time over the rig's routes still wins,
    // so one arrow on an Assembly Line's belt brings the rig online at 0 s.
    const hits = rigHits(b);
    const asm = assemblyLines(b, claims, occ, hits); // 0.6.1c ASSEMBLY LINE (empty without one: commissioning as before)
    const links: { link: JoinLink; feeds: number }[] = []; // 0.6.2j: the joining belts' legal joins, by route index
    const routes: RouteState[] = b.routes.map((r, i) => {
      const info = routeInfo(b, i, claims, occ, hits);
      if (info.join) links[i] = { link: info.join, feeds: info.turret };
      const rank = new Map<number, number>();
      const gateAt: TileHit[][] = (hits[i] ?? r.cells.map(() => [])).map((list) => list.flatMap((h) => {
        const g = gateByUid.get(h.uid);
        if (!g) return [];
        if (!rank.has(g.uid)) {
          rank.set(g.uid, rank.size);
          let at = COMMISSION_BASE + COMMISSION_STEP * (rank.size - 1);
          if (asm.own.size) { // 0.6.1c: x the best factor; online at 0 s on an Assembly Line's own belt (+ HOT START)
            const hot = asm.own.get(i);
            at = hot === undefined ? at * asm.factor : 0;
            if (hot) g.hotUntil = Math.max(g.hotUntil ?? 0, hot);
          }
          g.commissionAt = Math.min(g.commissionAt, at);
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
        // 0.6.2j: a joining belt feeds no turret intake itself (connected false, turret -1; its join below)
        index: i, factory: r.factory, cells: [...r.cells], connected: info.connected && !info.join, turret: info.join ? -1 : info.turret,
        L: info.length, gateAt, ammo: [], cellDisrupt: r.cells.map(() => 0),
        cellFrozen: r.cells.map(() => 0), cellSlow: r.cells.map(() => ({ mul: 1, t: 0 })),
        speedAt: r.cells.map(() => 1),
        pts: routePolyline(b, r, info.connected, info.join), phase: r.cells.map(() => 0), pressure: 0,
        guard: r.cells.map(() => 0), // 0.6.1p
      };
    });
    const joiners = joinStates(routes, links); // 0.6.2j (J1-J6): none without joins
    // Each Overclocker follows its belt to the first later payload-changing rig. 0.6.2j (J14 (a)): on a joining belt,
    // along the payload's journey (journeyHits): past the join when its own belt has none left, unless the Overclocker
    // also works that main belt (its own payloads would carry it there too)
    for (const r of routes) {
      const own = r.gateAt.flat();
      const ordered = r.join ? [...own, ...journeyHits(routes, r)] : own;
      const mains = r.join ? journeyRoutes(routes, r) : [];
      for (let i = 0; i < own.length; i++) {
        const booster = ordered[i].g;
        if (!booster.def.gate?.overclockCooldown) continue;
        const target = ordered.slice(i + 1).find((h) => h.g !== booster && boostable(h.g.def.gate!));
        if (target && (target.route === r.index || !booster.hits.some((h) => mains.includes(h.route)))) {
          target.g.boostedBy.push({ booster, route: target.route });
        }
      }
    }
    const factories: FactoryState[] = b.items
      .filter((p) => defOf(p).kind === "factory")
      .map((p) => ({
        uid: p.uid, def: this.factoryDef(effectAt(p.def, starsOf(p)), h), x: p.x, y: p.y,
        routes: routes.filter((r) => r.factory === p.uid).map((r) => r.index),
        timer: 0.35, rr: 0, disrupted: 0, frozen: 0, flash: 0, stalled: false, produced: 0,
        pending: 0, cycleIdx: 0, seenHarass: 0, seenWreck: 0, triggerQueue: 0, triggerCooldown: 0,
      }));
    // 0.6.1b: gear and core. 0.6.2s (REQ-BFG-031 S9): one turret per OCCUPIED slot (deck.ts installedTurrets), in
    // slot order, its index the slot index; an empty slot fights with nothing and is no target. With the starting
    // layout that is exactly the hero's turrets 0..n-1, so every older deck fights as before.
    const turrets: TurretState[] = installedTurrets(b).map((s) => makeTurret(b, s.slot, s.td));
    const bySlot = (slot: number) => turrets.find((tu) => tu.index === slot);
    // 0.6.1p: guard flags. OVERDRIVE ★2/★3 flags its own tile and every tile downstream (static: wave 2's hooks
    // decide whether the gate must be online); a MANTLET turret's shield (★2 FULL PLATE: 1 tile, 0.6.2 FB-B; ★3 BULWARK
    // SKIRT: 3) flags each connected route's last n tiles.
    // beltside-062 B4 (DESIGN §11 P5): a tile's flags are the OR of every hit landing on it, whichever speed wins
    // the tile, and they reach that tile and every tile downstream; an X rig flags each belt it hits.
    for (const r of routes) {
      r.gateAt.forEach((list, ci) => {
        let flags = 0;
        for (const h of list) flags |= h.g.def.gate?.guard ?? 0;
        if (flags) for (let j = ci; j < r.guard.length; j++) r.guard[j] |= flags;
      });
      const skirt = r.connected ? bySlot(r.turret)?.intakeGuard ?? 0 : 0;
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
      side, build: b, hero: h, hull, factories, gates, routes, turrets, targets,
      flak: Math.max(0, ...turrets.map((tu) => tu.intercept)), harassAccepted: 0, wreckAccepted: 0,
      limpets: [], stats: emptyStats(),
      race: makeRaceSide(b), // races:
      ...(joiners.length ? { joiners } : {}), // 0.6.2j
    };
  }

  private factoryDef(def: ItemDef, hero: HeroDef): ItemDef {
    const spec = def.factory;
    if (def.id !== "mimic" || !spec) return def;
    return { ...def, factory: { ...spec, ammo: hero.ammo,
      interval: (ITEMS[hero.factory].factory?.interval ?? 1) * (spec.intervalMul ?? 1) } };
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
    for (const s of this.sides) if (s.joiners) this.joins(s); // 0.6.2j (J5): after every belt has moved
    for (const s of this.sides) this.chambers(s, dt);
    this.flight(dt);
    this.hullEffects(dt);
    this.checkEnd();
  }

  private updateMachinery(s: SideState, dt: number): void {
    for (const g of s.gates) {
      if (g.flash > 0) g.flash -= dt;
      for (let d = 0; d < 4; d++) if (g.arrowFlash[d] > 0) g.arrowFlash[d] = Math.max(0, g.arrowFlash[d] - dt);
      const stopped = g.disrupted > 0 || g.frozen > 0;
      if (g.disrupted > 0) {
        g.disrupted = Math.max(0, g.disrupted - dt);
      }
      if (g.frozen > 0) {
        g.frozen = Math.max(0, g.frozen - dt);
        if (!g.online && Number.isFinite(g.commissionAt)) g.commissionAt += dt;
      }
      if (stopped) s.stats.disrupted += dt;
      if (!g.online && !g.wrecked && !g.consumed && g.frozen <= 0 && g.hits.length > 0 && this.t >= g.commissionAt) {
        g.online = true;
        this.events.push({ type: "commission", side: s.side, gate: g.uid });
      }
      if (!stopped && !g.wrecked && g.online) {
        if (g.cooldown > 0) g.cooldown = Math.max(0, g.cooldown - dt);
        if (g.def.gate?.keg && !g.consumed) {
          g.fuse -= dt;
          if (g.fuse <= 0) this.detonateKeg(s, g);
        }
      }
    }
    for (const r of s.routes) {
      for (let i = 0; i < r.cellDisrupt.length; i++) {
        const stopped = r.cellDisrupt[i] > 0 || r.cellFrozen[i] > 0;
        if (r.cellDisrupt[i] > 0) {
          r.cellDisrupt[i] = Math.max(0, r.cellDisrupt[i] - dt);
        }
        if (r.cellFrozen[i] > 0) {
          r.cellFrozen[i] = Math.max(0, r.cellFrozen[i] - dt);
        }
        if (stopped) s.stats.disrupted += dt;
        if (r.cellSlow[i].t > 0) r.cellSlow[i].t = Math.max(0, r.cellSlow[i].t - dt);
      }
      // speed states: the latest tile with an active speed hit wins for everything downstream of it
      // (0.6.2, R7 item 4: several speed hits on one tile resolve by tileSpeed)
      let state = 1;
      for (let i = 0; i < r.cells.length; i++) {
        const won = this.tileSpeedAt(r.gateAt[i]);
        if (won !== undefined) state = won;
        const shown = s.race ? raceBeltSpeed(this, s, r.index, i, state) : state; // races: speed lock, Drag
        const slow = !s.race?.speedLock && r.cellSlow[i].t > 0 && !this.routeGuardActive(r, i, GUARD_SLOW) ? r.cellSlow[i].mul : 1;
        r.speedAt[i] = shown * slow;
        const v = r.cellDisrupt[i] > 0 || r.cellFrozen[i] > 0 ? 0 : BELT_SPEED * r.speedAt[i];
        r.phase[i] += v * dt;
      }
    }
    for (const f of s.factories) {
      if (f.flash > 0) f.flash -= dt;
      const stopped = f.disrupted > 0 || f.frozen > 0;
      if (f.disrupted > 0) {
        f.disrupted = Math.max(0, f.disrupted - dt);
      }
      if (f.frozen > 0) f.frozen = Math.max(0, f.frozen - dt);
      if (stopped) s.stats.disrupted += dt;
    }
    for (const tu of s.turrets) {
      if (tu.recoil > 0) tu.recoil = Math.max(0, tu.recoil - dt * 4);
      if (tu.jamFx > 0) tu.jamFx = Math.max(0, tu.jamFx - dt);
      const stopped = tu.disrupted > 0 || tu.frozen > 0;
      if (tu.disrupted > 0) {
        tu.disrupted = Math.max(0, tu.disrupted - dt);
      }
      if (tu.frozen > 0) tu.frozen = Math.max(0, tu.frozen - dt);
      if (stopped) s.stats.disrupted += dt;
    }
    if (s.hull.flash > 0) s.hull.flash = Math.max(0, s.hull.flash - dt);
  }

  private detonateKeg(s: SideState, g: GateState): void {
    const keg = g.def.gate!.keg!;
    g.consumed = true;
    g.online = false;
    const routes = new Set(g.hits.map((h) => h.route));
    if (keg.wide) for (const r of s.routes) {
      if (r.cells.some((k) => Math.abs(kx(k) - g.x) + Math.abs(ky(k) - g.y) === 1)) routes.add(r.index);
    }
    for (const id of routes) for (const a of s.routes[id].ammo) {
      a.p.flat += keg.flat;
      a.p.burn += keg.burn;
    }
    this.events.push({ type: "keg", side: s.side, gate: g.uid });
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
      const spec = f.def.factory!;
      if (spec.trigger === "harass") {
        const gained = s.harassAccepted - f.seenHarass + (spec.bigHaul ? s.wreckAccepted - f.seenWreck : 0);
        f.triggerQueue = Math.min(3, f.triggerQueue + gained);
        f.seenHarass = s.harassAccepted;
        f.seenWreck = s.wreckAccepted;
      }
      if (!f.routes.length || f.disrupted > 0 || f.frozen > 0) continue;
      if (f.triggerCooldown > 0) f.triggerCooldown = Math.max(0, f.triggerCooldown - dt);
      if (f.triggerQueue > 0 && f.triggerCooldown <= 0 && this.stamp(s, f)) {
        f.triggerQueue--;
        f.triggerCooldown = 0.6;
      }
      // 0.6.1c DOUBLE STAMP / SHOT TOWER: the batch's waiting slugs leave the mouth as AMMO_SPACING frees, round-robin
      // like any stamp. A factory without a batch never has one waiting (pending stays 0).
      if (f.pending > 0 && this.stamp(s, f)) f.pending--;
      f.timer -= dt;
      if (f.timer > 0) continue;
      if (s.race && raceProduce(this, s, f, dt)) continue; // races: Crucible twin pour
      if (f.pending === 0 && this.stamp(s, f)) {
        f.timer = spec.interval;
        if (spec.batch && spec.batch > 1) f.pending = spec.batch - 1; // 0.6.1c: the rest of the batch waits in the mouth
      } else { // no room on any route (0.6.1c: or the last batch still fills the mouth): the next cycle waits
        f.stalled = true;
        f.timer = 0;
        s.stats.stalled += dt;
      }
    }
  }

  /**
   * One slug from factory `f` onto its next route (round-robin) with AMMO_SPACING room; false if none has room.
   * 0.6.1c: split out of produce so a batch's waiting slugs stamp the same way; HOT SWAP writes its next preset.
   */
  private stamp(s: SideState, f: FactoryState): boolean {
    const n = f.routes.length;
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
        if (spec.scrapFlat !== undefined) p.flat += spec.scrapFlat;
        if (spec.round) p.harass = { ...spec.round };
        if (spec.cycle?.length) { // 0.6.1c HOT SWAP: EMBER (+ Burn), then SPARK (+ Shock), in turn
          const pr = spec.cycle[f.cycleIdx % spec.cycle.length];
          f.cycleIdx = (f.cycleIdx + 1) % spec.cycle.length;
          p.preset = pr.tint;
          if (pr.burn) p.burn = pr.burn;
          if (pr.shock) p.shock = true;
          if (pr.shockTime !== undefined) p.shockTime = pr.shockTime;
          if (pr.jump) p.jump = pr.jump;
        }
        r.ammo.push({ p, s: 0, processed: -1, blocked: false });
        f.rr = (f.rr + k + 1) % n;
        f.flash = 0.18;
        f.produced++;
        f.stalled = false;
        s.stats.produced++;
        this.events.push({ type: "produce", side: s.side, factory: f.uid });
        return true;
      }
    }
    return false;
  }

  private speedStateAt(r: RouteState, pos: number): number {
    let state = 1;
    for (let i = 0; i < r.cells.length; i++) {
      const centre = i * CELL + CELL / 2;
      if (centre >= pos) break;
      const won = this.tileSpeedAt(r.gateAt[i]);
      if (won !== undefined) state = won;
    }
    return state;
  }

  private tileSpeedAt(list: readonly TileHit[]): number | undefined {
    const speeds: number[] = [];
    for (const h of list) {
      const g = h.g;
      if (!g.online || g.wrecked || g.disrupted > 0 || g.frozen > 0) continue;
      const e = g.def.gate!;
      if (e.speed !== undefined) speeds.push(e.speed);
      if (e.pulse) speeds.push(this.t % e.pulse.period < e.pulse.on ? e.pulse.speed : 1);
    }
    return speedWinner(speeds);
  }

  private pulseAt(r: RouteState, pos: number): GateState | undefined {
    let pulse: GateState | undefined;
    for (let i = 0; i < r.cells.length && i * CELL + CELL / 2 < pos; i++) {
      for (const h of r.gateAt[i]) {
        const g = h.g;
        if (!g.online || g.wrecked || g.disrupted > 0 || g.frozen > 0) continue;
        if (g.def.gate?.speed !== undefined) pulse = undefined;
        if (g.def.gate?.pulse) pulse = g;
      }
    }
    return pulse;
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
        // 0.6.1c SLAG: a fixed belt speed that speed gates, the speed lock and slows never change (a stalled tile still stops it)
        const fixed = AMMO[a.p.ammo]?.fixedSpeed;
        let v = BELT_SPEED * (fixed ?? (s.race?.speedLock ? 1 : this.speedStateAt(r, a.s))); // races: METRONOME speed lock
        if (ci >= 0 && (r.cellDisrupt[ci] > 0 || r.cellFrozen[ci] > 0)) v = 0;
        const drag = s.race && fixed === undefined ? raceDrag(this, s, r.index, ci) : 1; // races: SIPHON Drag
        if (drag !== 1) v *= drag; // races:
        if (ci >= 0 && r.cellFrozen[ci] > 0) (a.p.debuffs ??= {}).chill = true;
        if (ci >= 0 && r.cellSlow[ci].t > 0 && !this.routeGuardActive(r, ci, GUARD_SLOW) && !s.race?.speedLock && fixed === undefined) {
          v *= r.cellSlow[ci].mul;
          (a.p.debuffs ??= {}).snag = true;
        }
        if (a.p.debuffs?.snag && fixed === undefined) v *= 0.8;
        const want = a.s + v * dt;
        let ns = Math.min(want, limit);
        if (ns < a.s) ns = a.s;
        const moved = ns - a.s;
        if (v > 0 && moved > 0 && drag === 1) {
          const ride = moved / v;
          a.p.ride += ride; // races: dragged movement isn't ride
          if (a.p.heat) {
            a.p.heatRide = (a.p.heatRide ?? 0) + ride;
            a.p.heatBonus = (a.p.heatBonus ?? 0) + a.p.heat * ride;
          }
          const surge = fixed === undefined && !s.race?.speedLock ? this.pulseAt(r, a.s) : undefined;
          const pulse = surge?.def.gate?.pulse;
          if (surge && pulse && pulse.flat > 0 && this.t % pulse.period < pulse.on) {
            const cycle = Math.floor(this.t / pulse.period);
            const seen = a.p.pulseSeen ??= {};
            if (seen[surge.uid] !== cycle) { seen[surge.uid] = cycle; a.p.flat += pulse.flat; }
          }
        }
        a.blocked = want > limit + 1e-6 || v === 0;
        if (a.blocked) pressure++;
        // apply the hits of every tile whose centre was crossed (0.6.2: R7 order, one per arrow)
        while (a.processed + 1 < n && (a.processed + 1) * CELL + CELL / 2 <= ns) {
          a.processed++;
          // beltside-062 B1: BELTSIDE's per-tile hit list. A SPLITTER hit returns copies - 1 new ones (1 at every
          // star since 0.6.1f's PERFECT CUT; 2 while ASSEMBLY LINE's HOT START overclocks it); they ride
          // applyTile's trailing placement, each behind the one before it
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
   * 0.6.2j (J4, J5; SPEC 8.3's ordering rule): once a tick, after every belt has moved (step), each joining belt, lowest
   * last-cell key first (makeSide's joiners), hands the payload waiting at its end (s >= L) to its main belt: it
   * enters at the join tile's upstream edge (`enter`, the same path distance to the tile's centre as on one continuous
   * belt) when no main-belt payload is within AMMO_SPACING of that point, ahead or behind; otherwise it waits and its
   * belt backs up behind it (transport's spacing). The main belt goes first; one payload per joiner per tick; no RNG.
   * It keeps everything it carries, joins the main belt's list in path order, and takes the join tile's hits and every
   * later one (processed = tile - 1). journeyOffset keeps its tile count on its own journey (J14 (a)).
   */
  private joins(s: SideState): void {
    for (const r of s.joiners!) {
      const a = r.ammo[0];
      if (!a || a.s < r.L - 1e-6) continue;
      const j = r.join!;
      const m = s.routes[j.route];
      let k = 0, gap = true;
      for (let i = 0; i < m.ammo.length; i++) {
        const d = m.ammo[i].s - j.enter;
        if (Math.abs(d) < AMMO_SPACING) { gap = false; break; }
        if (d > 0) k = i + 1;
      }
      if (!gap) continue; // J5: the main belt has right of way
      r.ammo.shift();
      a.p.journeyOffset = (a.p.journeyOffset ?? 0) + r.cells.length - j.tile;
      a.s = j.enter;
      a.processed = j.tile - 1;
      a.blocked = false;
      a.via = r.index;
      m.ammo.splice(k, 0, a);
    }
  }

  /**
   * 0.6.2 BELTSIDE: a payload crosses a tile centre: every active hit there applies in R7 order (the list is
   * sorted). A SPLITTER-type hit's copies take the rest of this tile's hits too, so the tile treats the
   * original and its copies alike (Decision 3). A disrupted or uncommissioned rig stops all its arrows (R9).
   * beltside-062 B2 (DESIGN §11 P2, §13 P12): each SPLITTER hit is one split, and a split makes one extra copy at
   * every star (0.6.1f's PERFECT CUT; an overclocked split makes one more); a later hit on the same tile applies
   * to the original and to every copy made so far.
   */
  private applyTile(s: SideState, a: BeltAmmo, list: TileHit[], inserts: { after: BeltAmmo; copy: BeltAmmo }[]): void {
    let group: BeltAmmo[] | null = null; // the original plus copies made on this tile (only once a split happens)
    for (const h of list) {
      const g = h.g;
      if (!g.online || g.disrupted > 0 || g.frozen > 0 || g.wrecked) continue;
      const on: BeltAmmo[] = group ?? [a];
      const made: BeltAmmo[] = [];
      for (const x of on) made.push(...this.applyHit(s, x, h));
      if (made.length) group = [...on, ...made];
    }
    if (!group) return;
    // the copies trail the original in the order they were made, 0.01 px apart (one split: a.s - 0.01, as
    // before; one overclocked split: a.s - 0.01 and a.s - 0.02, as the generic loop); queued last-first because
    // each insert lands right behind the original
    for (let k = group.length - 1; k >= 1; k--) {
      group[k].s = a.s - 0.01 * k;
      inserts.push({ after: a, copy: group[k] });
    }
  }

  /**
   * One rig arrow processes payload `a` (0.6.1p's applyGate body, unchanged); returns the copies a SPLITTER hit
   * makes (copies - 1 of them: 1 at every star since 0.6.1f, 2 while HOT START overclocks it), else [].
   */
  private applyHit(s: SideState, a: BeltAmmo, h: TileHit): BeltAmmo[] {
    const g = h.g;
    // 0.6.1c ASSEMBLY LINE ★3 HOT START: while it lasts the gate's effect applies twice (overclock.ts, ARSENAL.md §3.4).
    // beltside-062c (DESIGN §12 P7): hotUntil is the rig's, so every arrow of the rig is overclocked, on any belt
    const p = a.p;
    if (g.def.gate?.overclockCooldown) (p.boosters ??= []).push(g.uid);
    const booster = g.boostedBy.find(({ booster, route }) => route === h.route && p.boosters?.includes(booster.uid) && booster.online &&
      !booster.wrecked && booster.disrupted <= 0 && booster.frozen <= 0 && booster.cooldown <= 0);
    if (booster) {
      booster.booster.cooldown = booster.booster.def.gate!.overclockCooldown!;
      p.boosters = p.boosters!.filter((uid) => uid !== booster.booster.uid);
    }
    const doubled = !!booster || g.hotUntil !== undefined && this.t < g.hotUntil;
    const e = doubled ? overclocked(g.def.gate!) : g.def.gate!;
    const copies: BeltAmmo[] = [];
    if (e.flat) p.flat += e.flat;
    if (s.race?.speedLock && e.lockedFlat) p.flat += e.lockedFlat;
    // 0.6.1p: LONG HAUL ★2/★3 counts at most priorCap prior gates (1 star has no cap)
    if (e.perPriorGate) p.flat += e.perPriorGate * (e.priorCap !== undefined ? Math.min(p.prior, e.priorCap) : p.prior);
    if (e.burn) p.burn += e.burn;
    if (e.poison) p.poison = (p.poison ?? 0) + e.poison;
    if (e.burnPerRide) {
      const original = g.def.gate!.burnPerRide!;
      p.burn += (doubled ? 2 : 1) * Math.min(original.max, Math.floor(p.ride / original.seconds));
    }
    if (e.quench) { // 0.6.2 FB-B: + flat on every payload; up to `stacks` Burn stacks at perBurn each, the rest stays Burn
      const spent = Math.min(p.burn, e.quench.stacks);
      p.flat += e.quench.flat + spent * e.quench.perBurn;
      p.burn -= spent;
    }
    if (e.staticTime) { p.static = true; p.staticTime = Math.max(p.staticTime ?? 0, e.staticTime); }
    if (e.perStalled) {
      const foe = this.sides[s.side === 0 ? 1 : 0];
      const stalled = [...foe.gates, ...foe.factories, ...foe.turrets]
        .filter((m) => m.disrupted > 0 || m.frozen > 0 || ("wrecked" in m && m.wrecked)).length;
      p.flat += Math.min(e.perStalled.max, stalled * e.perStalled.each);
    }
    if (e.fray) { p.fray = (p.fray ?? 0) + e.fray; p.frayCap = Math.max(p.frayCap ?? 0, e.frayCap ?? 0); }
    // 0.6.2j (J14 (a)): COUNTERWEIGHT counts the tiles ridden on the payload's own journey
    if (e.perTile) p.flat += Math.min(e.perTile.max, (p.journeyOffset === undefined ? a.processed : a.processed + p.journeyOffset) * e.perTile.each);
    if (e.shock) {
      p.shock = true;
      // 0.6.1p: GALVANIC COIL ★2/★3: the longest stall and jump passed wins (a 1-star coil sets neither)
      if (e.shockTime !== undefined) p.shockTime = Math.max(p.shockTime ?? DISRUPT_TIME, e.shockTime);
      if (e.jump) p.jump = Math.max(p.jump ?? 0, e.jump);
    }
    if (e.sift) {
      const removed = siftDebuffs(p.debuffs, e.sift);
      p.flat += removed * (e.siftFlat ?? 0) + (removed === 0 ? e.siftClean ?? 0 : 0);
    }
    if (e.heat) p.heat = (p.heat ?? 0) + e.heat;
    if (e.repair) {
      const repair = Math.min(e.repair, s.hull.max - s.hull.hp);
      if (repair > 0) { s.hull.hp += repair; this.events.push({ type: "repair", side: s.side, amount: repair, gate: g.uid }); }
    }
    if (e.sort) {
      g.sorted++;
      if (g.sorted % e.sort.every === 0) for (let c = 1; c < e.sort.copies; c++) {
        const cp: Payload = { ...p, id: this.nextId++, ...(p.debuffs ? { debuffs: { ...p.debuffs } } : {}),
          ...(p.pulseSeen ? { pulseSeen: { ...p.pulseSeen } } : {}) };
        copies.push({ p: cp, s: a.s - 0.01 * c, processed: a.processed, blocked: false });
      }
    }
    if (e.split) {
      p.mult *= e.split.mult;
      p.flat *= e.split.mult;
      p.copy = true;
      for (let c = 1; c < e.split.copies; c++) { // generic: copies - 1 new ones (an overclocked split makes one more)
        const cp: Payload = { ...p, id: this.nextId++, ...(p.debuffs ? { debuffs: { ...p.debuffs } } : {}),
          ...(p.pulseSeen ? { pulseSeen: { ...p.pulseSeen } } : {}) };
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
      const tu = turretAt(s, r.turret); // 0.6.2s: by slot
      if (!tu || tu.disrupted > 0 || tu.frozen > 0) continue;
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
        if (r.join) { // 0.6.2j (J6): a joining belt's queue counts where its path through the join is that close
          if (r.join.feeds === tu.index) for (const a of r.ammo) if (a.blocked && a.s >= r.L + r.join.tail - 4 * CELL) waiting++;
          continue;
        }
        if (r.turret !== tu.index || !r.connected) continue;
        for (const a of r.ammo) if (a.blocked && a.s >= r.L - 4 * CELL) waiting++;
      }
      tu.waiting = waiting;
      if (waiting > s.stats.maxQueue) s.stats.maxQueue = waiting;
      if (tu.disrupted > 0 || tu.frozen > 0) continue;
      if (tu.core.routine === "capacitor" && tu.stack.length === 0)
        tu.charge = Math.min(tu.core.spec.maxSeconds ?? 5, tu.charge + dt);
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
              if (tu.core.routine === "compound" && tu.stack.length) p.compound = tu.stack.pop();
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
      : payloadDamage(p.base ?? ammo.base, ammo.rideScale, p.ride, p.mult, p.flat + (p.heatBonus ?? 0));
    if (!ammo.rideCurve && tu.longRideFlat && p.ride >= tu.longRideMin) dmg += tu.longRideFlat;
    if (fin) dmg *= 1 + tu.finisher; // 0.6.1p: FINISHER RAM
    dmg = debuffedDamage(dmg, p.debuffs);
    const target = this.pickTarget(foe, !!p.harass, tu);
    let tx = target.x, ty = target.y;
    if (target.kind === "hull") {
      tx = this.rng.range(-6, 126);
      ty = this.rng.range(-4, 124);
    } else {
      tx += this.rng.range(-3, 3);
      ty += this.rng.range(-3, 3);
    }
    const heavy = tu.def.kind === "heavy";
    const flight = this.roundFlight(tu.def.flight + Math.max(0, ty) / 120 * 0.22 + k * 0.08, p);
    const proj: Projectile = {
      id: this.nextId++, from: s.side, turret: tu.index, payload: p, dmg, t: 0, flight, target, tx, ty, heavy,
    };
    if (fin) proj.finisher = true; // 0.6.1p
    this.telegraph(proj);
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
    if (routine === "grapnel") p.rip = { count: c.rip ?? 1, reach: c.reach ?? 1 };
    const conv = routine === "drake" ? drakeConvert(c, p.flat) : { stacks: 0, used: 0 };
    let dmg = ammo.rideCurve
      ? Math.max(1, raceCurveDamage(ammo, s, tu, p) - conv.used)
      : payloadDamage(p.base ?? ammo.base, ammo.rideScale, p.ride, p.mult, p.flat - conv.used + (p.heatBonus ?? 0));
    if (!ammo.rideCurve && tu.longRideFlat && p.ride >= tu.longRideMin) dmg += tu.longRideFlat;
    let burn = p.burn, burnTime: number | undefined, flightMul = 1, pellets = 1, share = 1;
    if (routine === "pressure") dmg += pressureBonus(c, queued);
    else if (routine === "salvo") dmg += c.volleyFlat ?? 0;
    else if (routine === "hullbreaker") dmg *= c.hullMul ?? 1;
    else if (routine === "capacitor") { dmg += (c.perSecond ?? 0) * tu.charge; tu.charge = 0; }
    else if (routine === "compound" && p.compound) {
      const q = p.compound, qa = AMMO[q.ammo];
      const qd = qa.rideCurve ? raceCurveDamage(qa, s, tu, q) : payloadDamage(q.base ?? qa.base, qa.rideScale, q.ride, q.mult, q.flat + (q.heatBonus ?? 0));
      dmg = (debuffedDamage(dmg, p.debuffs) + debuffedDamage(qd, q.debuffs)) * (c.mult ?? 1);
      p.burn += q.burn;
      burn += q.burn;
      p.poison = (p.poison ?? 0) + (q.poison ?? 0);
      p.shock ||= q.shock;
      p.static ||= q.static;
      p.staticTime = Math.max(p.staticTime ?? 0, q.staticTime ?? 0) || undefined;
      p.shockTime = Math.max(p.shockTime ?? 0, q.shockTime ?? 0) || undefined;
      p.jump = Math.max(p.jump ?? 0, q.jump ?? 0) || undefined;
    }
    else if (routine === "drake") {
      burn += conv.stacks + (c.addBurn ?? 0);
      burnTime = c.burnTime;
      flightMul = c.flightMul ?? 1;
    } else if (routine === "scatter") {
      pellets = Math.max(1, c.pellets ?? 1);
      share = c.share ?? 1;
    }
    if (fin) dmg *= 1 + tu.finisher; // 0.6.1p: FINISHER RAM, after the core's own bonus (never set on a GATLING)
    if (tu.salvage) { dmg += tu.salvage; tu.salvage = 0; }
    if (routine !== "compound" || !p.compound) dmg = debuffedDamage(dmg, p.debuffs);
    const heavy = tu.def.kind === "heavy";
    for (let j = 0; j < pellets; j++) {
      const target = routine === "hullbreaker" ? hullTarget() : this.pickTarget(foe, !!p.harass, tu);
      let tx = target.x, ty = target.y;
      if (target.kind === "hull") {
        tx = this.rng.range(-6, 126);
        ty = this.rng.range(-4, 124);
      } else {
        tx += this.rng.range(-3, 3);
        ty += this.rng.range(-3, 3);
      }
      const flight = this.roundFlight(tu.def.flight * (routine === "mortar" ? c.flightMul ?? 2.2 : flightMul) + Math.max(0, ty) / 120 * 0.22 + k * 0.08 + j * 0.03, p);
      const pd = dmg * share;
      const proj: Projectile = {
        id: this.nextId++, from: s.side, turret: tu.index, payload: p, dmg: pd, t: 0, flight, target, tx, ty, heavy,
        core: routine, burn: pellets > 1 ? Math.ceil(burn / pellets) : burn,
        ...(burnTime !== undefined ? { burnTime } : {}),
        ...(pellets > 1 ? { share, noFray: j > 0 } : {}),
        ...(fin ? { finisher: true } : {}), // 0.6.1p
        ...(routine === "mortar" ? { splash: c.splash, splashShare: c.share } : {}),
        ...(routine === "tesla" ? { tesla: { arcs: c.arcs ?? 1, stall: c.stall ?? 0.8, share: c.share ?? 0.25 } } : {}),
        ...(routine === "lance" ? { lance: { columns: c.columns ?? 1, share: c.share ?? 0.2, col: Math.floor(target.x / CELL) } } : {}),
      };
      this.telegraph(proj);
      this.projectiles.push(proj);
      s.stats.shots++;
      s.stats.payloadSum += pd;
      this.events.push({ type: "fire", side: s.side, turret: tu.index, heavy, dmg: pd, proj: proj.id, core: routine });
    }
    tu.recoil = 1;
    if (s.stats.firstShot < 0) s.stats.firstShot = this.t;
  }

  private pickTarget(foe: SideState, special = false, turret?: TurretState): Target {
    if (turret?.alwaysMachine && foe.targets.length) return this.rng.weighted(foe.targets, (t) => t.weight * (t.kind === "factory" ? turret.factoryWeight : 1));
    const weight = turret?.factoryWeight ?? 1;
    let target = this.pickOnce(foe, weight);
    for (let i = 0; i < (special ? 1 : 0) + (turret?.rerolls ?? 0) && target.kind === "hull"; i++) target = this.pickOnce(foe, weight);
    return target;
  }

  private pickOnce(foe: SideState, factoryWeight = 1): Target {
    if (this.rng.next() < 0.5 || !foe.targets.length) {
      return hullTarget();
    }
    return this.rng.weighted(foe.targets, (t) => t.weight * (t.kind === "factory" ? factoryWeight : 1));
  }

  private roundFlight(flight: number, p: Payload): number {
    return p.harass ? Math.max(1.2 + TICK, flight + 0.6) : flight;
  }

  private telegraph(pr: Projectile): void {
    if (pr.payload.harass) this.events.push({
      type: "telegraph", side: pr.from, proj: pr.id, round: pr.payload.harass.kind,
      target: pr.target, impactAt: this.t + pr.flight,
    });
  }

  private isHarassingProjectile(pr: Projectile): boolean {
    const p = pr.payload;
    return !!(p.harass || p.shock || p.static || p.arc || p.rip || pr.tesla || pr.lance);
  }

  private flight(dt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.t += dt;
      if (!pr.flakChecked && this.isHarassingProjectile(pr) && pr.t >= pr.flight / 2) {
        pr.flakChecked = true;
        const defender = this.sides[pr.from === 0 ? 1 : 0];
        if (defender.flak > 0 && this.rng.next() < defender.flak) {
          this.events.push({ type: "flak", side: defender.side, proj: pr.id });
          continue;
        }
      }
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
    const hit = pr.lance ? hullTarget() : pr.target;
    // 0.6.1b: a SCATTER pellet's Fray bonus x its share, so Fray isn't multiplied (absent on identity shots)
    const bonus = pr.share !== undefined ? def.hull.fray * FRAY_BONUS * pr.share : def.hull.fray * FRAY_BONUS;
    const total = pr.dmg + bonus + (pr.payload.harass?.kind === "sabot" && hit.kind === "hull" ? 6 : 0);
    def.hull.hp -= def.race ? raceAbsorb(def, total) : total; // races: bulwark plating soaks first
    def.hull.flash = 0.12;
    atk.stats.damage += total;
    if (!pr.noFray && (ammo.fray > 0 || pr.payload.fray)) {
      def.hull.frayMax = Math.max(def.hull.frayMax, FRAY_MAX + (pr.payload.frayCap ?? 0));
      def.hull.fray = Math.min(def.hull.frayMax, def.hull.fray + ammo.fray + (pr.payload.fray ?? 0));
    }
    if (pr.payload.poison) {
      def.hull.poison.stacks = Math.min(24, def.hull.poison.stacks + pr.payload.poison);
      def.hull.poison.t = 6;
    }
    const burn = pr.burn ?? pr.payload.burn; // 0.6.1b: a core's Burn (SCATTER split, DRAKE added), else the payload's
    if (burn > 0) def.hull.burns.push({ dps: burn, t: pr.burnTime ?? BURN_TIME });
    let shocked = false;
    if (pr.payload.shock && hit.kind !== "hull") {
      const secs = pr.payload.shockTime ?? DISRUPT_TIME; // 0.6.1p: GALVANIC COIL ★2/★3 stall longer
      shocked = this.disrupt(def, hit, secs, "shock");
      if (pr.payload.jump) this.sparkJump(def, hit, secs, pr.payload.jump); // 0.6.1p: SPARK JUMP
    }
    if (pr.payload.static && hit.kind === "hull" && def.turrets.length) {
      const turret = def.turrets[this.rng.int(def.turrets.length)];
      this.disrupt(def, def.targets.find((t) => t.kind === "turret" && t.ref === turret.index)!, pr.payload.staticTime ?? DISRUPT_TIME, "static");
    }
    if (pr.payload.arc && hit.kind !== "hull") this.sparkJump(def, hit, DISRUPT_TIME, pr.payload.arc, "arc");
    if (pr.payload.rip) {
      const ripped = this.rip(def, hit, pr.payload.rip.count, pr.payload.rip.reach);
      const gun = turretAt(atk, pr.turret); // 0.6.2s: by slot
      if (ripped && pr.core === "grapnel" && gun && gun.core.stars >= 3) gun.salvage += ripped * gun.core.k;
    }
    if (pr.payload.harass) this.roundImpact(def, hit, pr.payload.harass, pr.from, pr.payload.debuffs);
    if (atk.race || def.race) raceImpact(this, atk, def, pr); // races: SIPHON echo memory and Drag
    this.events.push({
      type: "impact", side: def.side, x: pr.tx, y: pr.ty, dmg: total, heavy: pr.heavy,
      kind: hit.kind, shock: shocked, burn, big: total >= 14,
    });
    if (pr.splash) for (let i = 0; i < pr.splash; i++) {
      const t = this.pickTarget(def, !!pr.payload.harass);
      this.secondaryImpact(pr, t, pr.splashShare ?? 0.5, "splash");
    }
    if (pr.tesla) {
      const origin = pr.target;
      for (const t of this.nearestMachines(def, origin, pr.tesla.arcs)) {
        const clean = { ...pr, payload: { ...pr.payload, harass: undefined, rip: undefined, shock: false, static: false, arc: undefined } };
        this.secondaryImpact(clean, t, pr.tesla.share, "arc");
        this.disrupt(def, t, pr.tesla.stall, "arc");
      }
    }
    if (pr.lance) {
      let count = 0;
      const cols = pr.lance.columns;
      for (const t of def.targets) {
        if (count >= 10) break;
        const col = Math.floor(t.x / CELL);
        if (col < pr.lance.col || col >= pr.lance.col + cols) continue;
        this.secondaryImpact(pr, t, pr.lance.share, "lance");
        count++;
      }
    }
  }

  private secondaryImpact(pr: Projectile, target: Target, share: number, effect: "arc" | "lance" | "splash"): void {
    this.events.push({ type: effect, side: pr.from === 0 ? 1 : 0, x: target.x, y: target.y });
    this.impact({ ...pr, dmg: pr.dmg * share, target, tx: target.x, ty: target.y,
      splash: undefined, tesla: undefined, lance: undefined });
  }

  private nearestMachines(s: SideState, from: Target, n: number): Target[] {
    return s.targets.filter((t) => !(t.kind === from.kind && t.ref === from.ref && t.cell === from.cell))
      .map((t, i) => ({ t, i, d: (t.x - from.x) ** 2 + (t.y - from.y) ** 2 }))
      .sort((a, b) => a.d - b.d || a.i - b.i).slice(0, n).map((v) => v.t);
  }

  /** All accepted hostile effects pass here. Order: Flak in flight, then Toll, then route and Mantlet guards. */
  private acceptHarassment(s: SideState, t: Target, cause: HarassCause): boolean {
    if (t.kind === "hull") return false;
    const r = t.kind === "belt" ? s.routes[t.ref] : undefined;
    const g = t.kind === "gate" ? s.gates.find((g) => g.uid === t.ref) : undefined;
    const f = t.kind === "factory" ? s.factories.find((f) => f.uid === t.ref) : undefined;
    const tu = t.kind === "turret" ? turretAt(s, t.ref) : undefined; // 0.6.2s: a turret target's ref is its slot
    if (t.kind === "belt" && (!r || t.cell < 0 || t.cell >= r.cells.length)) return false;
    if (t.kind === "gate" && !g || t.kind === "factory" && !f || t.kind === "turret" && !tu) return false;
    if (g?.wrecked && cause !== "rip") return false;

    const routeIds = t.kind === "belt" ? [t.ref]
      : t.kind === "gate" ? [...new Set(g!.hits.map((h) => h.route))]
      : t.kind === "factory" ? f!.routes
      : t.kind === "turret" ? s.routes.filter((route) => route.connected && route.turret === t.ref).map((route) => route.index) : [];
    const toll = s.gates.find((gate) => gate.online && !gate.wrecked && gate.disrupted <= 0 && gate.frozen <= 0 && gate.tolls > 0 &&
      gate.hits.some((h) => routeIds.includes(h.route)) &&
      (t.kind !== "factory" || gate.def.gate?.tollFactory));
    if (toll) {
      toll.tolls--;
      this.events.push({ type: "toll", side: s.side, gate: toll.uid, remaining: toll.tolls, cause });
      return false;
    }
    if (t.kind === "turret" && tu!.immune.includes(cause)) return false;
    if (t.kind === "belt") {
      if (this.skirted(s, r, t.cell, cause)) return false;
      if (cause === "drag" && this.routeGuardActive(r!, t.cell, GUARD_SLOW)) return false;
      if (cause === "freeze" && this.routeGuardActive(r!, t.cell, GUARD_FREEZE)) return false;
    }
    if (g && g.hits.some((h) => this.skirted(s, s.routes[h.route], h.tile, cause))) return false;
    this.sides[s.side === 0 ? 1 : 0].harassAccepted++;
    if (cause === "sabot" && t.kind === "gate") this.sides[s.side === 0 ? 1 : 0].wreckAccepted++;
    this.events.push({ type: "harass", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell, cause });
    return true;
  }

  private disrupt(s: SideState, t: Target, secs = DISRUPT_TIME, cause: HarassCause = "shock"): boolean {
    if (secs <= 0 || !this.acceptHarassment(s, t, cause)) return false;
    if (t.kind === "gate") s.gates.find((g) => g.uid === t.ref)!.disrupted = Math.max(s.gates.find((g) => g.uid === t.ref)!.disrupted, secs);
    else if (t.kind === "factory") s.factories.find((f) => f.uid === t.ref)!.disrupted = Math.max(s.factories.find((f) => f.uid === t.ref)!.disrupted, secs);
    else if (t.kind === "turret") turretAt(s, t.ref)!.disrupted = Math.max(turretAt(s, t.ref)!.disrupted, secs);
    else if (t.kind === "belt") s.routes[t.ref].cellDisrupt[t.cell] = Math.max(s.routes[t.ref].cellDisrupt[t.cell], secs);
    this.events.push({ type: "disrupt", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell });
    return true;
  }

  private roundImpact(s: SideState, t: Target, round: HarassRound, from: Side, debuffs?: PayloadDebuffs): void {
    if (round.kind === "sabot") {
      let landed = false;
      if (t.kind === "gate") {
        if (!this.acceptHarassment(s, t, "sabot")) return;
        s.gates.find((g) => g.uid === t.ref)!.wrecked = true;
        landed = true;
      } else if (t.kind === "belt") {
        if (!this.disrupt(s, t, 5, "sabot")) return;
        landed = true;
      } else if (t.kind === "factory" || t.kind === "turret") {
        if (!this.disrupt(s, t, t.kind === "factory" ? 4 : 3, "sabot")) return;
      } else return;
      if (t.kind === "gate") this.events.push({ type: "wreck", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell });
      if (round.shrapnel && landed) {
        const hits = t.kind === "belt" ? [{ route: t.ref, tile: t.cell }]
          : s.gates.find((g) => g.uid === t.ref)?.hits ?? [];
        for (const h of hits) for (const ci of [h.tile - 1, h.tile + 1]) {
          const r = s.routes[h.route];
          if (r && ci >= 0 && ci < r.cells.length) {
            const target = s.targets.find((x) => x.kind === "belt" && x.ref === h.route && x.cell === ci);
            if (target) this.disrupt(s, target, 2, "sabot");
          }
        }
      }
    } else if (round.kind === "frost") {
      if (this.freeze(s, t, round.seconds) && round.spread)
        for (const other of this.nearestMachines(s, t, round.spread)) this.freeze(s, other, round.seconds);
    } else if (round.kind === "drag") {
      this.slowSegment(s, t, round.mul, round.seconds);
    } else {
      s.limpets.push({ at: this.t + round.delay, target: t, from, blast: debuffedDamage(round.blast, debuffs), stall: round.stall ?? 0 });
    }
  }

  private freeze(s: SideState, t: Target, secs: number): boolean {
    if (secs <= 0 || !this.acceptHarassment(s, t, "freeze")) return false;
    if (t.kind === "gate") {
      const g = s.gates.find((g) => g.uid === t.ref)!;
      g.frozen = Math.max(g.frozen, secs);
    } else if (t.kind === "factory") {
      const f = s.factories.find((f) => f.uid === t.ref)!;
      f.frozen = Math.max(f.frozen, secs);
    } else if (t.kind === "turret") {
      const tu = turretAt(s, t.ref)!;
      tu.frozen = Math.max(tu.frozen, secs);
    } else if (t.kind === "belt") {
      const r = s.routes[t.ref];
      r.cellFrozen[t.cell] = Math.max(r.cellFrozen[t.cell], secs);
      for (const a of r.ammo) if (Math.floor(a.s / CELL) === t.cell) (a.p.debuffs ??= {}).chill = true;
    }
    this.events.push({ type: "freeze", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell });
    return true;
  }

  /** A rig contributes nodes at arrow-hit belt tiles; its own deck cell is never a segment tile. */
  private slowSegment(s: SideState, t: Target, mul: number, secs: number): boolean {
    if (secs <= 0 || mul >= 1 || (t.kind !== "belt" && t.kind !== "gate" && t.kind !== "factory" && t.kind !== "turret")) return false;
    if (t.kind === "factory" || t.kind === "turret") {
      if (!this.acceptHarassment(s, t, "drag")) return false;
      if (t.kind === "factory") s.factories.find((f) => f.uid === t.ref)!.timer += 0.8;
      else turretAt(s, t.ref)!.fireCd += 0.5;
    } else {
      const hits = t.kind === "belt" ? [{ route: t.ref, tile: t.cell }]
        : s.gates.find((g) => g.uid === t.ref)?.hits ?? [];
      const tiles = new Map<number, Set<number>>();
      for (const h of hits) {
        const r = s.routes[h.route];
        if (!r || h.tile < 0 || h.tile >= r.cells.length) continue;
        const [lo, hi] = segmentBounds(r.gateAt.map((list) => list.length > 0), h.tile);
        for (let ci = lo; ci <= hi; ci++) {
          if (this.routeGuardActive(r, ci, GUARD_SLOW) || s.race?.speedLock) continue;
          // 0.6.2 FB-B: a tile a MANTLET shields (★2 FULL PLATE, ★3 BULWARK SKIRT) keeps out of a chain round's segment
          // slow too, as a REDLINE tile does, wherever on the segment the round landed
          if (this.skirted(s, r, ci, "drag")) continue;
          if (!tiles.has(h.route)) tiles.set(h.route, new Set());
          tiles.get(h.route)!.add(ci);
        }
      }
      if (!tiles.size || !this.acceptHarassment(s, t, "drag")) return false;
      for (const [ri, cells] of tiles) {
        const r = s.routes[ri];
        for (const ci of cells) {
          const slow = r.cellSlow[ci];
          slow.mul = Math.min(slow.t > 0 ? slow.mul : 1, mul);
          slow.t = Math.max(slow.t, secs);
        }
        for (const a of r.ammo) if (cells.has(Math.floor(a.s / CELL)) && AMMO[a.p.ammo].fixedSpeed === undefined)
          (a.p.debuffs ??= {}).snag = true;
      }
    }
    this.events.push({ type: "slow", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell });
    return true;
  }

  /** Grapnel candidates use route distance, then route index and payload id for stable ties. */
  private rip(s: SideState, t: Target, count: number, reach: number): number {
    if (count <= 0 || reach < 0 || (t.kind !== "belt" && t.kind !== "gate")) return 0;
    const keg = t.kind === "gate" ? s.gates.find((g) => g.uid === t.ref && !!g.def.gate?.keg) : undefined;
    const hits = t.kind === "belt" ? [{ route: t.ref, tile: t.cell }]
      : s.gates.find((g) => g.uid === t.ref)?.hits ?? [];
    const candidates = new Map<number, { route: number; ammo: BeltAmmo; distance: number }>();
    for (const h of hits) {
      const r = s.routes[h.route];
      if (!r || h.tile < 0 || h.tile >= r.cells.length) continue;
      const centre = h.tile * CELL + CELL / 2;
      for (const a of r.ammo) {
        const distance = Math.abs(a.s - centre);
        if (distance > reach * CELL) continue;
        const old = candidates.get(a.p.id);
        if (!old || distance < old.distance) candidates.set(a.p.id, { route: h.route, ammo: a, distance });
      }
    }
    if ((!candidates.size && !keg) || !this.acceptHarassment(s, t, "rip")) return 0;
    if (keg) { keg.consumed = true; keg.online = false; }
    const picked = [...candidates.values()].sort((a, b) => a.distance - b.distance || a.route - b.route || a.ammo.p.id - b.ammo.p.id).slice(0, count);
    for (const c of picked) {
      const r = s.routes[c.route];
      r.ammo.splice(r.ammo.indexOf(c.ammo), 1);
      this.events.push({ type: "rip", side: s.side, kind: "belt", ref: c.route, cell: Math.floor(c.ammo.s / CELL), payload: c.ammo.p.id });
    }
    return picked.length;
  }

  /** Future SAP sources can mark the nearest payload through the same guard. */
  applyPayloadDebuff(s: SideState, t: Target, mark: keyof PayloadDebuffs): boolean {
    if (t.kind !== "belt") return false;
    const r = s.routes[t.ref];
    if (!r || t.cell < 0 || t.cell >= r.cells.length) return false;
    const centre = t.cell * CELL + CELL / 2;
    const a = [...r.ammo].sort((x, y) => Math.abs(x.s - centre) - Math.abs(y.s - centre) || x.p.id - y.p.id)[0];
    if (!a || !this.acceptHarassment(s, t, mark === "sap" ? "sap" : mark === "chill" ? "freeze" : "drag")) return false;
    (a.p.debuffs ??= {})[mark] = true;
    return true;
  }

  /** 0.6.1p MANTLET: cell `ci` of route `r` lies in its turret's shield (★3 BULWARK SKIRT; since 0.6.2 FB-B also ★2
   *  FULL PLATE's intake tile) and that turret ignores `cause`. */
  private skirted(s: SideState, r: RouteState | undefined, ci: number, cause: HarassCause): boolean {
    if (!r || ci < 0 || !((r.guard[ci] ?? 0) & GUARD_SKIRT)) return false;
    return turretAt(s, r.turret)?.immune.includes(cause) ?? false;
  }

  /** Static route flags describe placement; only a working Overdrive grants the live protection. */
  private routeGuardActive(r: RouteState, ci: number, flag: number): boolean {
    for (let i = 0; i <= ci; i++) for (const h of r.gateAt[i]) {
      const g = h.g;
      if (g.online && !g.wrecked && g.disrupted <= 0 && g.frozen <= 0 && ((g.def.gate?.guard ?? 0) & flag)) return true;
    }
    return false;
  }

  /**
   * 0.6.1p GALVANIC COIL ★2/★3 SPARK JUMP: the spark also stalls the `n` machines nearest the struck one (by
   * distance between target centres; ties keep foe.targets order). No RNG draw.
   */
  private sparkJump(s: SideState, from: Target, secs: number, n: number, cause: HarassCause = "shock"): void {
    const others = s.targets
      .filter((t) => t.kind !== "hull" && !(t.kind === from.kind && t.ref === from.ref && t.cell === from.cell))
      .map((t, i) => ({ t, i, d: (t.x - from.x) ** 2 + (t.y - from.y) ** 2 }))
      .sort((a, b) => a.d - b.d || a.i - b.i);
    for (const o of others.slice(0, n)) this.disrupt(s, o.t, secs, cause);
  }

  private hullEffects(dt: number): void {
    for (const s of this.sides) {
      const foe = this.sides[s.side === 0 ? 1 : 0];
      for (let i = s.limpets.length - 1; i >= 0; i--) {
        const charge = s.limpets[i];
        if (this.t + 1e-9 < charge.at) continue;
        s.limpets.splice(i, 1);
        s.hull.hp -= s.race ? raceAbsorb(s, charge.blast) : charge.blast;
        s.hull.flash = 0.12;
        foe.stats.damage += charge.blast;
        if (charge.stall > 0) this.disrupt(s, charge.target, charge.stall, "limpet");
        this.events.push({ type: "limpet", side: s.side, kind: charge.target.kind, ref: charge.target.ref, cell: charge.target.cell });
      }
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
      if (s.hull.poison.t > 0) {
        const damage = s.hull.poison.stacks * 0.4 * Math.min(dt, s.hull.poison.t);
        s.hull.poison.t = Math.max(0, s.hull.poison.t - dt);
        s.hull.hp -= s.race ? raceAbsorb(s, damage) : damage;
        foe.stats.damage += damage;
        if (damage > 0) this.events.push({ type: "poison", side: s.side, dmg: damage });
        if (s.hull.poison.t === 0) s.hull.poison.stacks = 0;
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
/**
 * 0.6.1c ASSEMBLY LINE (FactorySpec.commission), read once in makeSide. A running Assembly Line (one feeding a
 * connected route) sets the side's commissioning factor, the best (lowest) one winning; `own` maps each of its
 * routes to its HOT START seconds (0 below 3 stars). Without one `own` is empty and commissioning is as before.
 * beltside-062c: `hits` (rigHits(b)) is only shared with routeInfo, so makeSide computes the hits once; connection
 * doesn't depend on them.
 */
export function assemblyLines(
  b: Build, claims = connectorClaims(b), occ = occupancy(b), hits?: RigHit[][][],
): { factor: number; own: Map<number, number> } {
  let factor = 1;
  const own = new Map<number, number>();
  b.routes.forEach((r, i) => {
    const f = b.items.find((p) => p.uid === r.factory);
    const fs = f && ITEMS[f.def]?.kind === "factory" ? effectAt(f.def, starsOf(f)).factory : undefined;
    if (fs?.commission === undefined || !routeInfo(b, i, claims, occ, hits).connected) return;
    factor = Math.min(factor, fs.commission);
    own.set(i, fs.hotStart ?? 0);
  });
  return { factor, own };
}

/**
 * 0.6.2s (REQ-BFG-031 S9): side `s`'s turret in slot `slot` (TurretState.index), or undefined when that slot is empty.
 * Turrets are one per occupied slot in slot order, so with the starting layout turrets[slot] is it (the fast path).
 */
export function turretAt(s: Pick<SideState, "turrets">, slot: number): TurretState | undefined {
  const tu = s.turrets[slot];
  return tu && tu.index === slot ? tu : s.turrets.find((x) => x.index === slot);
}

/** E1 (FURNACE): a turret fed by a belt of 8+ tiles fires at this share of its interval (1.0 s x 0.72 = 0.72 s, the
 *  starting SCRAP CANNON's 0.6.1 cadence exactly). 0.6.2s: a share, so a bought or starred turret keeps its own pace. */
export const FURNACE_LONG_BELT = 0.72;

/**
 * 0.6.2j (J1-J6): write each joining belt's RouteJoin (makeSide's legal joins, `links` by route index): its main belt,
 * join tile and entry point, the chain's turret, and J6's tail (the path from its end to that turret's intake: the
 * main belt from the entry point on, and that belt's own tail when it joins on in turn). Returns the joining belts
 * lowest last-cell key first, J5's tie order. Empty for a deck without joins.
 */
function joinStates(routes: RouteState[], links: { link: JoinLink; feeds: number }[]): RouteState[] {
  const out: RouteState[] = [];
  links.forEach((l, i) => {
    routes[i].join = { route: l.link.route, tile: l.link.tile, enter: l.link.tile * CELL, tail: 0, feeds: l.feeds };
    out.push(routes[i]);
  });
  const tail = (r: RouteState, depth: number): number => {
    const m = routes[r.join!.route];
    return m.L - r.join!.enter + (m.join && depth < routes.length ? tail(m, depth + 1) : 0);
  };
  for (const r of out) r.join!.tail = tail(r, 0);
  return out.sort((a, c) => a.cells[a.cells.length - 1] - c.cells[c.cells.length - 1]);
}

/** 0.6.2j (J14 (a)): the main belts a payload from joining belt r rides after its own, in order. */
function journeyRoutes(routes: RouteState[], r: RouteState): number[] {
  const out: number[] = [];
  for (let cur = r, n = 0; cur.join && n < routes.length; n++) {
    out.push(cur.join.route);
    cur = routes[cur.join.route];
  }
  return out;
}

/** 0.6.2j (J14 (a)): the hits a payload from joining belt r meets past its join: each main belt's from its join tile
 *  on, tile by tile in R7 order (the Overclocker's "next boostable rig" on the payload's journey). */
function journeyHits(routes: RouteState[], r: RouteState): TileHit[] {
  const out: TileHit[] = [];
  for (let cur = r, n = 0; cur.join && n < routes.length; n++) {
    const m = routes[cur.join.route];
    for (let t = cur.join.tile; t < m.gateAt.length; t++) out.push(...m.gateAt[t]);
    cur = m;
  }
  return out;
}

export function makeTurret(b: Build, i: number, def: TurretDef): TurretState {
  const g = gearStats(b, i);
  const core = resolveCore(b, i, def);
  const c = core.spec;
  // E1: Furnace's Breech keeps its opening cadence, then fires faster when a long belt feeds it.
  // The existing heavy-gun class factor still comes from the hero's 1.0s base interval.
  const longFurnaceBelt = b.hero === "furnace" && b.routes.some((r, ri) => {
    if ((r.join === undefined ? r.cells.length : journeyTiles(b, ri)) < 8) return false; // 0.6.2j (J14 (a)): its journey
    const info = routeInfo(b, ri);
    return info.connected && info.turret === i;
  });
  const interval = (longFurnaceBelt ? def.fireInterval * FURNACE_LONG_BELT : def.fireInterval) * g.fireMul;
  const windowTime = c.windowTime ?? WINDOW_TIME;
  return {
    index: i, def, stack: [], phase: "load", loadTimer: 0, fireCd: 0, jamSkip: 0, jamRandom: false,
    jamCd: 0, disrupted: 0, frozen: 0, perShot: g.perShot, interval: c.intervalMul ? interval * c.intervalMul : interval, recoil: 0, jamFx: 0,
    // 0.6.1p: EXT. CHAMBER ★2/★3 and HOPPER add window slots; HOPPER adds seconds to the core's window time (a
    // GATLING never reads windowTime, cores.ts gatlingReady, so there HOPPER's seconds do nothing; its slots count)
    waiting: 0, core, window: def.window + g.window, windowTime: g.windowTime ? windowTime + g.windowTime : windowTime,
    spin: c.start ?? 1, lastShot: -1,
    noJam: g.noJam, immune: g.immune, intakeGuard: g.intakeGuard, finisher: g.finisher, intercept: g.intercept,
    rerolls: g.rerolls, factoryWeight: g.factoryWeight, alwaysMachine: g.alwaysMachine, charge: 0, salvage: 0,
    longRideFlat: g.longRideFlat, longRideMin: g.longRideMin,
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
  intercept: number;
  rerolls: number;
  factoryWeight: number;
  alwaysMachine: boolean;
  longRideFlat: number;
  longRideMin: number;
}

export function gearStats(b: Build, i: number): GearStats {
  const out: GearStats = { perShot: 1, fireMul: 1, window: 0, windowTime: 0, noJam: false, immune: [], intakeGuard: 0,
    finisher: 0, intercept: 0, rerolls: 0, factoryWeight: 1, alwaysMachine: false, longRideFlat: 0, longRideMin: 0 };
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
    if (md?.intercept) out.intercept = Math.max(out.intercept, md.intercept);
    if (md?.rerolls) out.rerolls = Math.max(out.rerolls, md.rerolls);
    if (md?.factoryWeight) out.factoryWeight = Math.max(out.factoryWeight, md.factoryWeight);
    if (md?.alwaysMachine) out.alwaysMachine = true;
    if (md?.longRideFlat) {
      out.longRideFlat = Math.max(out.longRideFlat, md.longRideFlat);
      out.longRideMin = md.longRideMin ?? 0;
    }
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
