// Fixed-step combat simulation. Production, transport, processing, chamber handling,
// firing and impact are separate systems (spec §11, §12, §23). Playback speed never
// changes rules: callers only decide how many ticks to run per frame.

import { Rng } from "../core/rng";
import {
  AMMO, AMMO_SPACING, BATTLE_CAP, BELT_SPEED, BURN_TIME, CELL, COMMISSION_BASE, COMMISSION_STEP,
  DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, GUARD_FREEZE, GUARD_SKIRT, GUARD_SLOW, HEROES, ITEMS, JAM_COOLDOWN, JAM_THRESHOLD, JOIN_PACE, RULES_VERSION,
  TICK, WIND_START, WIND_WARN, WINDOW_TIME,
  SPEED_K, rateMul, secPer, // NUM-2 (REQ-BFG-047): SPEED
  type AmmoKind, type CoreRoutine, type FactorySpec, type HarassCause, type HeroDef, type ItemDef, type TurretDef,
} from "./content";
import { drakeConvert, pressureBonus, resolveCore, ROUTINES, spinInterval, steamInterval, type TurretCore } from "./cores"; // 0.6.1b
import { salvoReload } from "./cores"; // Y4 (release Y; BRIEF-Y4 S1): SALVO RACK's volley reload, one helper with the turret row
import {
  cloneBuild, connectorClaims, defOf, installedTurrets, kx, ky, occupancy, payloadDamage, rigHits,
  routeInfo, routePolyline, speedWinner, type Build, type Dir, type HitTier, type RigHit,
} from "./deck";
import { journeyTiles, type JoinLink } from "./deck"; // 0.6.2j: belt joins
import { shotFloor } from "./deck"; // Y2 (release Y): a LIMPET charge's shot floor with the star switch on
import { matchedRoutes, stokeHits } from "./deck"; // 0.8.0 P1: wave 3's E3 (stokers) and E6 (matched belts)
import { makeRaceSide, raceIntake, raceLoaded, raceProduce, type RaceSide } from "./races"; // races:
import { PLATE_CAP, absorb, newPlateState, type PlateState } from "./races/bastion"; // 0.8.0 P1 (E1): plating on every hull
import { mergedPieces, runeMods, type RuneMods } from "./runes"; // RUNES-1 (REQ-BFG-058); RUNES-2a: merged pieces
import { inSync, pourAll } from "./races/foundry"; // 0.8.0 P1: E2's pair rule (Foundry's sync rule); TWIN MOULD's pour
import { effectAt, gradeOf, starsOf } from "./stars";
// Y3 (release Y): chargeable (was boostable), the OVERCLOCKER's target: with the star switch off it is boostable itself
import { chargeable, overclocked } from "./overclock";
import { debuffedDamage, siftDebuffs, type HarassRound, type PayloadDebuffs } from "./harassment";
import { raceBeltSpeed, raceCurveDamage, raceDrag, raceImpact, raceLink } from "./races"; // races: METRONOME, SIPHON
import { BURN_DPS } from "./content"; // NUM-1 (REQ-BFG-047): BURN per stack each second
import { pct, roundHalfUp } from "./pct"; // NUM-1 (REQ-BFG-047, N1 2.1): the integer damage pipeline's one rounding
import { SHIELD_CAP } from "./content"; // SUS-A (REQ-BFG-069): SHIELD's MAX
import { STUN_CAUSES, starRules } from "./content"; // Y2 (release Y; REQ-BFG-070, REQ-BFG-046): the star switch; harassment is a STUN

export type Side = 0 | 1; // 0 = player (south), 1 = enemy (north)

/** SUS-A (REQ-BFG-069): what a heal came from (the `heal` event's `source`). */
export type HealSource = "riveter" | "mendpress" | "regen" | "rune"; // SUS-D: "rune" (TWIN SALVE, SCRAP MEDIC, LEECH VOW)

/** SUS-A: one side's sustain counters (made at its first SHIELD gain or heal; nothing in play reads them: the bench, the HUD). */
export interface HealCounts {
  gained: number; // SHIELD gained
  healed: number; // hull heal() gave back
  burnLost: number; // healing BURN's rule took away (a hull with BURN heals half)
  windLost: number; // healing the dark wind's rule took away (nothing heals from WIND_START)
}

/** SUS-A: ticks a second, on the battle's integer tick count (REGEN's whole seconds, the wind's rule for heals). */
const TICKS_PER_SEC = Math.round(1 / TICK);
/** SUS-A: the tick from which nothing heals (WIND_START on the integer tick count: 1500, at 25 s exactly). */
const WIND_TICKS = Math.round(WIND_START / TICK);
/** NUM-3 (REQ-BFG-047): a STUN's seconds as a whole number of ticks (Battle.disrupt sets it; BRACE FRAME's and STEADY
 *  IRON's cuts first), so a STUN of n ticks set on tick T reads 0 from tick T + n on, on the integer tick count. */
const stunTicks = (secs: number): number => Math.round(secs * TICKS_PER_SEC);
/** NUM-3: one tick off a STUN's timer. Below half a tick it is over: a whole-tick timer never ends a tick late on a float
 *  residue of its 1/60 s steps (1.6 s used to run 96 or 97 ticks). */
const stunLeft = (left: number, dt: number): number => (left - dt < TICK / 2 ? 0 : left - dt);

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
  // 0.8.0 P1 (E2): set on a chamber load that pairs (two loads that reach one turret through different intakes within
  // SYNC_WINDOW, or a FOUNDRY fusion), only in a turret that holds a pair reader (TWIN TRIGGER, SEAM WELDER)
  paired?: boolean;
  // bb-0.8.3 (REQ-BFG-042 D3): an alloy blank stamped alone, one a cycle in turn (Battle.stamp: a MIMIC FORGE below ★3 on
  // FOUNDRY, which doesn't pour): it never fuses with another blank of its own factory (races/foundry.ts tryFuse)
  lone?: boolean;
}

export interface BeltAmmo {
  p: Payload;
  s: number; // distance along route (px)
  processed: number; // last tile index whose centre (and hits) was passed
  blocked: boolean;
  via?: number; // 0.6.2j, render: the joining belt it entered this route from (drawn crossing until the join tile's centre)
  hold?: { g: GateState; arrow: number }; // 0.8.0 P1 (E4): held at a TWIN LATCH arrow's tile centre (absent: free)
}

/** 0.6.2 BELTSIDE: one arrow of a rig landing on a belt tile (deck.ts RigHit, bound to the rig's state). */
export interface TileHit {
  g: GateState;
  dir: Dir; // the arrow's absolute deck-local direction
  tier: HitTier; // R7 tier
  route: number;
  tile: number;
  matched?: boolean; // 0.8.0 P1 (E6): a TWIN GAUGE hit on a matched belt (deck.ts matchedRoutes; set only on gauge hits)
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
  /** Always 0 in play; tests set it to pause a machine. (FLIP-X2, REVIEW-FLIPX1 answer 1: kept as the test stop hook.) */
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
  // 0.8.0 P1, wave 3 (set only on the wave-3 rig that needs it):
  factoryHits?: number[]; // E3 STOKER: the factories its arrows point at (one uid per arrow); they count for its online test
  latch?: LatchState; // E4 TWIN LATCH, when both its arrows hit belts: the payload each arrow holds and since when
  // Y3 (release Y; DESIGN-Y row 28): a SURGE VALVE's last pulse (its pulsePhase cycle), set only with the star switch on
  surged?: number;
}

/** 0.8.0 P1 (E4): a TWIN LATCH whose two arrows hit belts. Arrow i is the latch's hits[i]. */
export interface LatchState {
  held: (BeltAmmo | null)[]; // the payload each arrow holds at its tile's centre
  since: number[]; // battle time each was held
  at: (number | null)[]; // a staggered release still to come (oracle a0e94bc69949561f): battle time it lets that one go
  same: boolean; // both arrows' belts end at one turret: release staggered so the two arrive together
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
  // enemy CHAIN and FROST rounds' STUNs since NUM-3's STUN fold) and the tiles a MANTLET shields (★2 FULL GUARD, 0.6.2 FB-B, and ★3
  // BULWARK SKIRT; read by Battle.disrupt)
  guard: number[];
  // 0.6.2j: set only on a joining belt (legal join). Its payloads go to the main belt at the join tile (Battle.joins),
  // never into a turret: `connected` is false and `turret` -1 here; `join.feeds` is its chain's turret.
  join?: RouteJoin;
  // 0.8.0 P1 (E4): per tile, the TWIN LATCH arrows that can hold a payload there (set only on a route a holding latch hits)
  holds?: TileHit[][];
  // 0.8.0 P1: per tile, the BRACE FRAMEs hitting it (set only on a route a brace hits), as makeSide writes `guard`
  braces?: GateState[][];
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
  /** Always 0 in play; tests set it to pause a machine. (FLIP-X2, REVIEW-FLIPX1 answer 1: kept as the test stop hook.) */
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
  // 0.6.2 TUNE-M, RULE JOIN PACE: the pace its timers run at (produce: the stamping timer and a trigger's cooldown):
  // JOIN_PACE when one of its belts joins another belt, else 1 (exactly as before: dt x 1 is dt)
  pace: number;
  // 0.8.0 P1 (E3): the STOKER arrows pointing at it and the share each adds (set only on a stoked factory); its timers run
  // at pace x (1 + the stokes of the active ones). `stoked`: the extra seconds of work they gave it (a counter, not stats)
  stokers?: { g: GateState; stoke: number }[];
  stoked?: number;
  // 0.8.0 P1 (STOKER's cap, oracle a0e94bc69949561f): for a stoked factory, each turret its belts reach, the loads one of
  // its stamps sends there (perStamp), and the other factories feeding that turret with theirs. Battle.stokedPace caps
  // the stoke so the factory never stamps faster than the turret can take what the others leave of its live pace.
  stokeCap?: { turret: number; perStamp: number; others: { f: FactoryState; perStamp: number }[] }[];
  curPace?: number; // a stoked factory's stamp pace this tick (what another stoked factory sharing its turret reads)
  // 0.8.0 P1, ARMOR PRESS: seconds to its next plating (set only on a press with a belt that reaches a turret)
  plateTimer?: number;
  // SUS-A (REQ-BFG-069), MEND PRESS: seconds to its next HEAL (ARMOR PRESS's timer: set only with a belt that reaches a turret)
  healTimer?: number;
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
  /** Always 0 in play; tests set it to pause a machine. (FLIP-X2, REVIEW-FLIPX1 answer 1: kept as the test stop hook.) */
  frozen: number;
  perShot: number;
  interval: number; // NUM-2 (REQ-BFG-047): 30 / speed, the seconds between shots the battle uses
  speed: number; // NUM-2: the whole speed (shots per 30 s): speedRaw rounded half up once
  speedRaw: number; // NUM-2: the turret's speed x each of its rates ((100 + X) / 100), unrounded (setSpeed)
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
  // 0.6.2 FB-B HOPPER ★2/★3: loads taken off the belt while the gun fires (at most storeMax), with the route each came
  // from; they drop into the next window (Battle.dropStore)
  store: { p: Payload; route: number }[];
  storeMax: number;
  noJam: boolean; // HOPPER ★3 BOTTOMLESS
  immune: HarassCause[]; // MANTLET: stalls Battle.disrupt ignores on this turret
  intakeGuard: number; // MANTLET ★2 FULL GUARD (1, 0.6.2 FB-B; NUM-3: was FULL PLATE), ★3 BULWARK SKIRT (3): the last n tiles of each route into it share `immune`
  finisher: number; // FINISHER RAM: + this share of damage on the payload that empties the window (never on a GATLING)
  intercept: number; // Flak mod's chance; the side takes the maximum across its turrets
  rerolls: number;
  factoryWeight: number;
  alwaysMachine: boolean;
  charge: number;
  salvage: number;
  longRideFlat: number; // LONGCASE: damage on other ammo after its belt-ride threshold
  longRideMin: number;
  // 0.8.0 P1, wave 3 (from its gear and core; absent without them, so the turret fires exactly as before):
  pairing?: boolean; // E2: it holds a pair reader (TWIN TRIGGER, SEAM WELDER), so its loads are marked as pairs
  pairBonus?: number; // TWIN TRIGGER: a paired load deals this share more damage
  seam?: { pair: number; lone: number }; // SEAM WELDER: plating for each pairing load, and for each other load
  spall?: { every: number; add: number; max?: number }; // SPALL CATCHER (Y5: no max with the star switch on)
  spallCharge?: number; // SPALL CATCHER: damage waiting for its next shot
  plated?: boolean; // STEAM BREECH: your hull holds plating this tick (Battle.chambers)
  runeFired?: boolean; // RUNES-1: it has fired this battle (SHARP SCRAP's first shot); set only on a side with runes
  runeVolley?: boolean; // RUNES-2a: its volley's first shot is next (FIRST BLOOD); set only on a side holding it
  // SUS-A (REQ-BFG-069), from its gear (absent without it). A STUN, freeze or disruption on the turret pauses both.
  bell?: { every: number; amount: number; timer: number }; // WARD BELL: + amount SHIELD when `timer` runs out (it then adds `every`)
  regen?: number; // MENDING LOOM: REGEN on your hull at each whole second (Battle.sustainTick)
}

export interface HullState {
  hp: number;
  max: number;
  fray: number;
  frayMax: number;
  // NUM-1 (REQ-BFG-047): `acc`, the seconds since the last whole tick (poison and each Burn deal once a second)
  poison: { stacks: number; t: number; acc?: number };
  burns: { dps: number; t: number; acc?: number }[]; // dps: the Burn stacks (each deals BURN_DPS a second)
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
  /** Y2 (release Y, DESIGN-Y row 10): with the star switch on, each FLAK SCREEN's share, in turret order (each rolls on its
   *  own, Battle.flight); absent off, and without a screen. */
  flaks?: number[];
  harassAccepted: number; // future Scrapper consumes accepted enemy effects from this side
  wreckAccepted: number;
  limpets: { at: number; target: Target; from: Side; blast: number; stall: number }[];
  stats: SideStats;
  race?: RaceSide; // races: race mechanics state; undefined for Furnace and Weaver
  joiners?: RouteState[]; // 0.6.2j (J5): the joining belts, lowest last-cell key first; absent without joins
  // 0.8.0 P1 (E1, the Prime's Q4): every side's plating pool, made in makeSide. It stays at 0 without a plating source
  // (absorb then hands back the damage unchanged). A race side's RaceSide.plating IS this object (BASTION's plateOnLoad
  // writes it; H1's plating bar reads either).
  plate: PlateState;
  // 0.8.0 P1, wave 3 (set only when the side holds the part that needs it):
  pairs?: WeakMap<Payload, { at: number; route: number }>; // E2: when and through which route each chamber load entered
  latches?: GateState[]; // E4: its TWIN LATCHes whose two arrows hit belts
  surges?: GateState[]; // Y3 (DESIGN-Y row 28): with the star switch on, its SURGE VALVEs with an arrow on a belt (surgeTick)
  spall?: TurretState[]; // SPALL CATCHER: its turrets carrying one
  braced?: boolean; // BRACE FRAME: the side holds one
  rune?: RuneMods; // RUNES-1 (REQ-BFG-058): what this side's runes do (runes.ts runeMods); absent without runes
  // RUNES-2a, set only on a side whose runes need them:
  merged?: number; // SCRAP SAINT: the build's merged pieces (runes.ts mergedPieces)
  wins?: number; // WARLORD'S DUE: the wins this side carried into the fight (Battle's `wins`; its snapshot's or run's)
  blocked?: number; // SHIELD (SUS-A; WARD STONE's before): the foe's hits it has stopped so far
  halfPlated?: boolean; // LAST WALL: its PLATE has come
  // SUS-A (REQ-BFG-069): SHIELD, whole hits it stops next (0..SHIELD_CAP; absent until its first gain), and the counters
  shield?: number;
  heals?: HealCounts;
  // SUS-D (REQ-BFG-069), set only on a side whose runes need them:
  guardTimer?: number; // TICK GUARD: seconds to its next SHIELD (carries its remainder)
  halfHealed?: boolean; // SCRAP MEDIC: its HEAL has come
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
  runeBurn?: number; // RUNES-2a: EMBER SHOT's BURN stacks on this volley-opening shot; absent otherwise
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
  // 0.8.0 H1 M3 (display only: the CLANK): a bulwark slug that loaded plated the hull by `amount` (BASTION; races/index.ts
  // raceLoaded, after the `load` event). Only a bulwark slug plates, so Furnace and Weaver never emit one.
  | { type: "plate"; side: Side; turret: number; amount: number }
  | { type: "fire"; side: Side; turret: number; heavy: boolean; dmg: number; proj: number; core?: CoreRoutine } // 0.6.1b: core set by a bought core
  | { type: "impact"; side: Side; x: number; y: number; dmg: number; heavy: boolean; kind: TargetKind; shock: boolean; burn: number; big: boolean }
  | { type: "jam"; side: Side; turret: number }
  | { type: "disrupt"; side: Side; kind: TargetKind; ref: number; cell: number }
  | { type: "telegraph"; side: Side; proj: number; round: HarassRound["kind"]; target: Target; impactAt: number }
  | { type: "flak"; side: Side; proj: number }
  | { type: "toll"; side: Side; gate: number; remaining: number; cause: HarassCause }
  | { type: "harass"; side: Side; kind: TargetKind; ref: number; cell: number; cause: HarassCause }
  // SUS-A (REQ-BFG-069): was RIVETER's "repair". `amount`: the hull it actually gave back; `gate` (RIVETER) or `factory`
  // (MEND PRESS): the piece; REGEN has neither
  | { type: "heal"; side: Side; amount: number; source: HealSource; gate?: number; factory?: number }
  | { type: "shield"; side: Side; amount: number; shield: number } // SUS-A: SHIELD gained (+) or broken by a hit (-); `shield`: the count after
  | { type: "arc" | "lance" | "splash"; side: Side; x: number; y: number }
  | { type: "wreck" | "rip" | "limpet"; side: Side; kind: TargetKind; ref: number; cell: number; payload?: number }
  | { type: "burn"; side: Side; dmg: number }
  | { type: "poison"; side: Side; dmg: number }
  | { type: "keg"; side: Side; gate: number }
  // 0.8.0 P1, wave 3: fired only by wave-3 parts (a race hero fires what it fired before)
  | { type: "plate"; side: Side; amount: number; plate: number } // E1: plating added (+) or spent (-); `plate`: the pool after
  | { type: "pair"; side: Side; turret: number } // E2: two loads paired in a pair-reading turret (a FOUNDRY fusion too)
  | { type: "hold" | "release"; side: Side; gate: number; route: number } // E4: a TWIN LATCH holds or lets go a payload
  | { type: "brace"; side: Side; gate: number; saved: number } // BRACE FRAME: seconds it took off an enemy STUN (NUM-3: every STUN)
  | { type: "wind"; dmg: number }
  | { type: "windwarn" }
  | { type: "end"; winner: Side | -1 };

export interface BattleRecord {
  rules: string;
  seed: number;
  builds: [Build, Build];
  wins?: [number, number]; // RUNES-2a: the wins each side carried in, only when a side holds WARLORD'S DUE (Battle)
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
  private windDue = 0; // NUM-1: the wind blown since its last whole tick

  /** RUNES-2a: `wins`, the wins each side carried into the fight (the run's own, a ghost's snapshot `wins`; 0 for a
   *  stand-in or a warlord), read only by a side holding WARLORD'S DUE; the record keeps them only then (replay.ts), so a
   *  replay is exact and every other battle and record is as before. */
  constructor(player: Build, enemy: Build, seed: number, wins?: readonly [number, number]) {
    this.rng = new Rng(seed);
    this.record = { rules: RULES_VERSION, seed, builds: [cloneBuild(player), cloneBuild(enemy)] };
    this.sides = [this.makeSide(0, cloneBuild(player)), this.makeSide(1, cloneBuild(enemy))];
    let reads = false;
    for (const s of this.sides) if (s.rune?.winDmgPct) { s.wins = Math.max(0, Math.floor(wins?.[s.side] ?? 0)); reads = true; }
    if (reads && wins) this.record.wins = [Math.max(0, Math.floor(wins[0])), Math.max(0, Math.floor(wins[1]))];
    raceLink(this.sides); // races: a side facing SIPHON gets Drag state
    // RUNES-1 (REQ-BFG-058): battle-start runes (no RNG; nothing happens on a side without runes)
    for (const s of this.sides) {
      if (!s.rune) continue;
      if (s.rune.startPlate > 0) this.addPlate(s, s.rune.startPlate); // RIVET HOARD, GRAVE PLATES (PLATE_CAP holds)
      if (s.rune.startFray > 0) { // LOOSE THREAD, TANGLE WIRE: on the foe's hull
        const foe = this.sides[s.side === 0 ? 1 : 0].hull;
        foe.fray = Math.min(foe.frayMax, foe.fray + s.rune.startFray);
      }
      // RUNES-2a: ASH KINDLE, BURN stacks on the foe's hull (BURN_TIME each; SLOW EMBERS makes yours last longer)
      if (s.rune.startBurn > 0) this.sides[s.side === 0 ? 1 : 0].hull.burns.push({ dps: s.rune.startBurn, t: this.burnTime(s, BURN_TIME) });
      // FURN-Y: SEARING's baseline, n BURN on the foe's hull at the start (its own stack; heal() reads its no-HEAL rule)
      if (s.rune.searBurn > 0) this.sides[s.side === 0 ? 1 : 0].hull.burns.push({ dps: s.rune.searBurn, t: this.burnTime(s, BURN_TIME) });
      // SUS-A (REQ-BFG-069): WARD STONE's SHIELD at t = 0 (its kind was blockHits: the foe's first n hits; SHIELD_CAP holds)
      if (s.rune.startShield > 0) this.gainShield(s, s.rune.startShield);
      if (s.rune.shieldEvery > 0) s.guardTimer = s.rune.shieldEvery; // SUS-D: TICK GUARD, its first SHIELD at t = n
    }
  }

  // ---- RUNES-2a (REQ-BFG-058): the new runes' battle hooks. Each reads only a side holding runes (SideState.rune), never
  // the RNG, so a side without runes battles exactly as before (tests/runes.parity.test.ts).

  /** SLOW EMBERS: how long a BURN stack side s lands lasts (its BURN_TIME or a core's, a whole % longer). */
  private burnTime(s: SideState, t: number): number {
    return s.rune?.burnTime ? t * (1 + s.rune.burnTime / 100) : t;
  }

  /** A load's ride for its damage (THE LONG ROAD: its ride bonus x n). */
  private rideOf(s: SideState, p: Payload): number {
    const ride = s.rune?.rideMul ? p.ride * s.rune.rideMul : p.ride;
    // FURN-Y (release Y; Y-FURN): COAL CHUTE / HEAT SINK's "YOUR HEAT: +n%" reads the KILN's HEAT too (its face's {HEAT}12, the
    // glossary's RIDE: "THE HEAT A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE"), not only a HEAT JACKET's: the ride the
    // slug's own rideScale reads, +n%. Only payloadDamage reads rideOf; a side without heatPct rides exactly as before
    return s.rune?.heatPct ? ride * (1 + s.rune.heatPct / 100) : ride;
  }

  /**
   * The share side s's runes multiply a shot by (after the flat runes, before the debuffs): SCRAP SAINT +n% per merged
   * piece; WIDOW'S WEB +n% per FRAY on the foe's hull; WARLORD'S DUE +n% per win; TOLL ROAD +n% per rig the load passed;
   * FIRST BLOOD +n% on a volley's first shot (`first`); TWIN SUNS +n% on a PAIR shot (RUNES-087F; RUNES-2a's x n). 1 for
   * every other shot.
   */
  private runeMul(s: SideState, paired: boolean, p: Payload, first: boolean): number {
    const m = s.rune!, foe = this.sides[s.side === 0 ? 1 : 0];
    const pct = m.mergedPct * (s.merged ?? 0) + m.frayShotPct * foe.hull.fray + m.winDmgPct * (s.wins ?? 0) + m.priorPct * p.prior
      + (first ? m.volleyFirst : 0) + (paired ? m.pairPct : 0) + m.shatterPct; // FURN-Y: SHATTER SHOT's baseline, +n% on every shot
    return pct ? 1 + pct / 100 : 1;
  }

  /** FIRST BLOOD, EMBER SHOT: is this turret's shot the first of its volley? (Consumes the mark chambers set.) */
  private volleyOpen(tu: TurretState): boolean {
    if (!tu.runeVolley) return false;
    tu.runeVolley = false;
    return true;
  }

  /** MOLTEN VOWS: a PAIR shot fires n times: n - 1 more projectiles at its one target and aim point (no new draw), each
   *  0.08 s behind the one before it, counted as shots. */
  private echo(s: SideState, proj: Projectile): void {
    const n = s.rune?.pairTwice ?? 0;
    for (let j = 1; j < n; j++) {
      const copy: Projectile = { ...proj, id: this.nextId++, flight: proj.flight + 0.08 * j };
      this.projectiles.push(copy);
      s.stats.shots++;
      s.stats.payloadSum += copy.dmg;
      this.events.push({ type: "fire", side: s.side, turret: copy.turret, heavy: copy.heavy, dmg: copy.dmg, proj: copy.id, ...(copy.core ? { core: copy.core } : {}) });
    }
  }

  /** The damage of a projectile landing on side def from side atk, after both sides' runes (impact): SCRAP BITER +n on a
   *  machine; SNARE KNOT +n on a hull at its FRAY cap; IRON HIDE -n a hit (never below 0). SUS-A: WARD STONE is SHIELD
   *  now (startShield; Battle.shieldHit stops the hit right after this, where its blockHits did). */
  private runeHit(atk: SideState, def: SideState, hit: Target, total: number): number {
    if (atk.rune) {
      if (atk.rune.machineDmg && hit.kind !== "hull") total += atk.rune.machineDmg;
      if (atk.rune.fullFrayDmg && def.hull.fray >= def.hull.frayMax) total += atk.rune.fullFrayDmg;
    }
    if (def.rune) {
      if (def.rune.hitCut) total = Math.max(0, total - def.rune.hitCut);
    }
    return total;
  }

  /** SUS-A (REQ-BFG-069): side def holds a SHIELD, so this hit is stopped whole: one SHIELD breaks (a `shield` event), the
   *  hit counts as stopped (SideState.blocked) and deals 0, so it costs no PLATE. WARD STONE's identity: any impact breaks
   *  one, whatever its damage (one IRON HIDE cut to 0 too). */
  private shieldHit(def: SideState): number {
    def.shield! -= 1;
    def.blocked = (def.blocked ?? 0) + 1;
    this.events.push({ type: "shield", side: def.side, amount: -1, shield: def.shield! });
    return 0;
  }

  /** BULWARK OATH: a race hook's own plating (BASTION's bulwark slugs: races/bastion.ts plateOnLoad) x n too: the extra
   *  (n - 1) x what it added, through addPlate (PLATE_CAP holds). Without the rune it just runs the hook. */
  private racePlate(s: SideState, hook: () => void): void {
    const k = s.rune?.plateMul, g0 = s.plate.gained;
    hook();
    if (k && s.plate.gained > g0) this.addPlate(s, (s.plate.gained - g0) * (k - 1), true);
  }

  /** LAST WALL: n PLATE once a battle, the first time side s's hull is below half (step, after the hull effects). */
  private runeHalf(s: SideState): void {
    if (!s.rune?.halfPlate || s.halfPlated || s.hull.hp >= s.hull.max / 2) return;
    s.halfPlated = true;
    this.addPlate(s, s.rune.halfPlate);
  }

  // ---- SUS-D (REQ-BFG-069; SUSTAIN-1 4.6): the sustain runes' hooks. Each reads only a side holding runes, never the
  // RNG; every heal goes through heal() (max hull, the dark wind, BURN, SEARING) and every SHIELD through gainShield
  // (SHIELD_CAP), so a side without these runes battles exactly as before.

  /** SCRAP MEDIC: HEAL n once a battle, the first time side s's hull is below half (where LAST WALL fires). Used up even
   *  when heal() gives nothing (the dark wind, a dead hull). */
  private runeHalfHeal(s: SideState): void {
    if (!s.rune?.halfHeal || s.halfHealed || s.hull.hp >= s.hull.max / 2) return;
    s.halfHealed = true;
    this.heal(s, s.rune.halfHeal, "rune");
  }

  /** TICK GUARD: +1 SHIELD every n s through gainShield (the cap holds), the first at t = n; the timer carries its
   *  remainder (+= n), as WARD BELL's does. No machine holds it, so nothing pauses it; it runs in the dark wind too, as
   *  WARD BELL's timer does (SHIELD heals nothing; the wind goes past it). */
  private runeGuard(s: SideState, dt: number): void {
    s.guardTimer! -= dt;
    if (s.guardTimer! > 1e-9) return;
    this.gainShield(s, 1);
    s.guardTimer! += s.rune!.shieldEvery;
  }

  /** SHATTER SHOT: side def's SHIELD breaks (a `shield` event) but the hit is not stopped: its damage goes on to PLATE,
   *  then HULL. Not counted in SideState.blocked. */
  private shieldShatter(def: SideState, total: number): number {
    def.shield! -= 1;
    this.events.push({ type: "shield", side: def.side, amount: -1, shield: def.shield! });
    return total;
  }

  /** LEECH VOW: each shot of side atk that lands heals n (a SHIELD-stopped one too); TWIN SALVE: each PAIR shot that lands
   *  heals n (HOT SEAM's PAIR test). Each through heal(), its own call. */
  private runeHeal(atk: SideState, pr: Projectile): void {
    const m = atk.rune!;
    if (m.hitHeal) this.heal(atk, m.hitHeal, "rune");
    if (m.pairHeal && (pr.payload.paired || pr.payload.compound?.paired)) this.heal(atk, m.pairHeal, "rune");
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
    // 0.8.0 P1 (E6): which belts are matched, read only when the side holds a TWIN GAUGE (static: lengths never change)
    const matched = gates.some((g) => g.def.gate?.gauge) ? matchedRoutes(b, claims, occ) : undefined;
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
            // Y3 (release Y; DESIGN-Y row 32): with the star switch on its own belts' rigs take the same factor as every
            // rig (no instant start), and HOT START is gone (its data holds no hotStart, so `hot` is 0 and sets nothing)
            at = hot === undefined || starRules() ? at * asm.factor : 0;
            if (hot) g.hotUntil = Math.max(g.hotUntil ?? 0, hot);
          }
          g.commissionAt = Math.min(g.commissionAt, at);
        }
        const th: TileHit = { g, dir: h.dir, tier: h.tier, route: i, tile: h.tile };
        if (matched && g.def.gate?.gauge) th.matched = matched[i]; // 0.8.0 P1 (E6)
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
        speedAt: r.cells.map(() => 1),
        pts: routePolyline(b, r, info.connected, info.join), phase: r.cells.map(() => 0), pressure: 0,
        guard: r.cells.map(() => 0), // 0.6.1p
      };
    });
    const joiners = joinStates(routes, links); // 0.6.2j (J1-J6): none without joins
    // 0.8.0 P1 (E4): a TWIN LATCH whose two arrows both hit belts holds payloads; its tiles are marked on their routes.
    // One arrow on a belt never holds (it only adds damage).
    const latches = gates.filter((g) => g.def.gate?.latch && g.hits.length === 2);
    for (const g of latches) {
      const ends = g.hits.map((h) => (routes[h.route].connected ? routes[h.route].turret : routes[h.route].join?.feeds ?? -1));
      g.latch = { held: [null, null], since: [0, 0], at: [null, null], same: ends[0] >= 0 && ends[0] === ends[1] };
      for (const h of g.hits) (routes[h.route].holds ??= routes[h.route].cells.map(() => []))[h.tile].push(h);
    }
    // 0.8.0 P1: BRACE FRAME: each tile it hits remembers it (Battle.braceCut shortens STUNs there; NUM-3: every STUN source)
    for (const g of gates) {
      if (!g.def.gate?.brace) continue;
      for (const h of g.hits) (routes[h.route].braces ??= routes[h.route].cells.map(() => []))[h.tile].push(g);
    }
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
        // Y3 (release Y; DESIGN-Y row 29): with the star switch on the first later rig, whatever it is (overclock.ts
        // chargeable); off, the first boostable one, as before
        const target = ordered.slice(i + 1).find((h) => h.g !== booster && chargeable(h.g.def.gate!));
        if (target && (target.route === r.index || !booster.hits.some((h) => mains.includes(h.route)))) {
          target.g.boostedBy.push({ booster, route: target.route });
        }
      }
    }
    const factories: FactoryState[] = b.items
      .filter((p) => defOf(p).kind === "factory")
      .map((p) => ({
        // bb-0.8.3 (REQ-BFG-043 D10): at its grade (the hero factory: its FACTORY level; stars.ts gradeOf)
        uid: p.uid, def: this.factoryDef(effectAt(p.def, gradeOf(b, p)), h), x: p.x, y: p.y,
        routes: routes.filter((r) => r.factory === p.uid).map((r) => r.index),
        timer: 0.35, rr: 0, disrupted: 0, frozen: 0, flash: 0, stalled: false, produced: 0,
        pending: 0, cycleIdx: 0, seenHarass: 0, seenWreck: 0, triggerQueue: 0, triggerCooldown: 0,
        // 0.6.2 TUNE-M, RULE JOIN PACE: one of its belts joins another (a legal join: joinStates set RouteState.join)
        pace: routes.some((r) => r.factory === p.uid && r.join) ? JOIN_PACE : 1,
      }));
    // 0.8.0 P1, ARMOR PRESS: "IT NEEDS A BELT TO A TURRET TO WORK": its plating timer runs only with such a belt
    for (const f of factories) {
      const pl = f.def.factory?.plate;
      if (pl && routes.some((r) => r.factory === f.uid && (r.connected || (r.join?.feeds ?? -1) >= 0))) f.plateTimer = pl.every;
      // SUS-A (REQ-BFG-069): MEND PRESS, modelled on ARMOR PRESS: its HEAL timer runs only with such a belt
      const hl = f.def.factory?.heal;
      if (hl && routes.some((r) => r.factory === f.uid && (r.connected || (r.join?.feeds ?? -1) >= 0))) f.healTimer = hl.every;
    }
    // 0.8.0 P1 (E3, the Prime's guard): a STOKER's arrows that point into a factory. Only a stoking rig counts such hits:
    // they bring it online (at COMMISSION_BASE, x a running ASSEMBLY LINE's factor) and stoke that factory's timers.
    if (gates.some((g) => g.def.gate?.stoke)) {
      for (const sh of stokeHits(b)) {
        const g = gateByUid.get(sh.uid), f = factories.find((x) => x.uid === sh.factory);
        if (!g || !f) continue;
        (g.factoryHits ??= []).push(f.uid);
        (f.stokers ??= []).push({ g, stoke: g.def.gate!.stoke! });
        f.stoked = 0;
        g.commissionAt = Math.min(g.commissionAt, asm.own.size ? COMMISSION_BASE * asm.factor : COMMISSION_BASE);
      }
      // STOKER's cap (oracle a0e94bc69949561f): which turrets each stoked factory's belts reach, and the loads a stamp of
      // each factory feeding them sends there: a twin pour one a belt (a CRUCIBLE's blanks into one gun fuse into one
      // load), any other stamp one belt in turn; a batch its slugs
      const reach = (r: RouteState): number => (r.connected ? r.turret : r.join?.feeds ?? -1);
      // bb-0.8.3 (REQ-BFG-042 D4): loadsPerStamp, the pour size included
      const perStampOf = (f: FactoryState, turret: number): number =>
        loadsPerStamp(f.def.factory!, f.routes.length, routes.filter((r) => r.factory === f.uid && reach(r) === turret).length);
      for (const f of factories) {
        if (!f.stokers) continue;
        const turrets = [...new Set(routes.filter((r) => r.factory === f.uid && reach(r) >= 0).map(reach))];
        f.stokeCap = turrets.map((turret) => ({
          turret, perStamp: perStampOf(f, turret),
          others: factories.filter((g) => g !== f && routes.some((r) => r.factory === g.uid && reach(r) === turret))
            .map((g) => ({ f: g, perStamp: perStampOf(g, turret) })),
        }));
      }
    }
    // 0.6.1b: gear and core. 0.6.2s (REQ-BFG-031 S9): one turret per OCCUPIED slot (deck.ts installedTurrets), in
    // slot order, its index the slot index; an empty slot fights with nothing and is no target. With the starting
    // layout that is exactly the hero's turrets 0..n-1, so every older deck fights as before.
    const turrets: TurretState[] = installedTurrets(b).map((s) => makeTurret(b, s.slot, s.td));
    const bySlot = (slot: number) => turrets.find((tu) => tu.index === slot);
    // 0.6.1p: guard flags. OVERDRIVE ★2/★3 flags its own tile and every tile downstream (static: wave 2's hooks
    // decide whether the gate must be online); a MANTLET turret's shield (★2 FULL GUARD, was FULL PLATE: 1 tile, 0.6.2 FB-B; ★3 BULWARK
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
    const plate = newPlateState(); // 0.8.0 P1 (E1): every hull's plating pool, shared with a race side's RaceSide.plating
    const spall = turrets.filter((tu) => tu.spall);
    // RUNES-1 (REQ-BFG-058): GUN OIL / HAIR TRIGGER fire a whole % faster (the interval / (1 + pct/100)); OILED COGS /
    // STOKED FIRES run the factories' timers a whole % faster (their pace x (1 + pct/100))
    const rune = runeMods(b.runes);
    // RUNES-2a: HAIR TRIGGER's new form (allRate) speeds both, adding to the turret and factory RATE runes; MANY HANDS
    // adds its % per turret
    if (rune) {
      const pct = rune.turretRate + rune.allRate + rune.perTurretRate * turrets.length;
      if (pct) for (const tu of turrets) setSpeed(tu, tu.speedRaw * rateMul(pct)); // NUM-2: in the one rounding
      if (rune.factoryRate + rune.allRate) for (const f of factories) f.pace *= 1 + (rune.factoryRate + rune.allRate) / 100;
      // QUICK LATCH: every rig comes online a whole % sooner (an IDLE rig never does)
      if (rune.rigSoon) for (const g of gates) if (Number.isFinite(g.commissionAt)) g.commissionAt *= Math.max(0, 1 - rune.rigSoon / 100);
      // BULKHEADS, SCRAP HALO: HULL per turret and per merged piece, on this battle's hull (not the build's hullBonus)
      const extra = rune.perTurretHull * turrets.length + rune.mergedHull * mergedPieces(b);
      if (extra) { hull.hp += extra; hull.max += extra; }
    }
    // TWIN NAILS / MOLTEN BOND read PAIRs (abilityText.ts: two loads into one turret through different intakes within
    // SYNC_WINDOW; a FOUNDRY fusion is a pair), so the side's turrets read pairs as E2's pair readers do (marks only).
    // RUNES-2a: every PAIR rune does (MOLTEN VOWS, TWIN SUNS, HOT SEAM, SEAM RIVETS)
    if (rune && (rune.pairDmg || rune.pairTwice || rune.pairPct || rune.pairBurn || rune.pairPlate)) for (const tu of turrets) tu.pairing = true;
    if (rune?.pairHeal) for (const tu of turrets) tu.pairing = true; // SUS-D: TWIN SALVE reads PAIRs too
    return {
      side, build: b, hero: h, hull, factories, gates, routes, turrets, targets,
      flak: Math.max(0, ...turrets.map((tu) => tu.intercept)), harassAccepted: 0, wreckAccepted: 0,
      // Y2 (DESIGN-Y row 10): with the switch on, every FLAK SCREEN's own share (absent without a screen, and off)
      ...(starRules() && turrets.some((tu) => tu.intercept > 0) ? { flaks: turrets.map((tu) => tu.intercept).filter((v) => v > 0) } : {}),
      limpets: [], stats: emptyStats(),
      race: makeRaceSide(b, plate), // races:
      ...(joiners.length ? { joiners } : {}), // 0.6.2j
      plate,
      // 0.8.0 P1, wave 3: E2's pair record only with a pair reader on board; E4's latches; SPALL CATCHER's turrets
      ...(turrets.some((tu) => tu.pairing) ? { pairs: new WeakMap<Payload, { at: number; route: number }>() } : {}),
      ...(latches.length ? { latches } : {}),
      // Y3 (DESIGN-Y row 28): with the star switch on, the SURGE VALVEs whose damage pulse surgeTick runs (absent off)
      ...(starRules() && gates.some((g) => g.def.gate?.pulse && g.hits.length) ? { surges: gates.filter((g) => g.def.gate?.pulse && g.hits.length) } : {}),
      ...(spall.length ? { spall } : {}),
      ...(gates.some((g) => g.def.gate?.brace) ? { braced: true } : {}),
      ...(rune ? { rune } : {}), // RUNES-1
      ...(rune?.mergedPct ? { merged: mergedPieces(b) } : {}), // RUNES-2a: SCRAP SAINT
    };
  }

  private factoryDef(def: ItemDef, hero: HeroDef): ItemDef {
    const spec = def.factory;
    if (def.id !== "mimic" || !spec) return def;
    // bb-0.8.3 (REQ-BFG-042 D3): a ★3 MIMIC (TWIN SIGNET) pours only where it makes the hero's blanks (FOUNDRY; stars.ts
    // pourAt); on every other hero it stamps one slug a cycle, in turn
    const { pour, ...rest } = spec;
    // NUM-2 (REQ-BFG-047): the hero factory's (level 1) speed x MIMIC's rate %, rounded half up once (content.ts factorySpeed)
    return { ...def, factory: { ...rest, ammo: hero.ammo, ...(pour && hero.ammo === "blank" ? { pour } : {}),
      speed: roundHalfUp((ITEMS[hero.factory].factory?.speed ?? SPEED_K) * rateMul(spec.rate)) } };
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
    this.sustainTick(dt); // SUS-A (REQ-BFG-069): WARD BELL's SHIELD timers; REGEN at each whole second (after the hull effects)
    for (const s of this.sides) if (s.guardTimer !== undefined) this.runeGuard(s, dt); // SUS-D: TICK GUARD
    for (const s of this.sides) if (s.rune?.halfPlate) this.runeHalf(s); // RUNES-2a: LAST WALL
    for (const s of this.sides) if (s.rune?.halfHeal) this.runeHalfHeal(s); // SUS-D: SCRAP MEDIC
    this.checkEnd();
  }

  private updateMachinery(s: SideState, dt: number): void {
    for (const g of s.gates) {
      if (g.flash > 0) g.flash -= dt;
      for (let d = 0; d < 4; d++) if (g.arrowFlash[d] > 0) g.arrowFlash[d] = Math.max(0, g.arrowFlash[d] - dt);
      const stopped = g.disrupted > 0 || g.frozen > 0;
      if (g.disrupted > 0) {
        g.disrupted = stunLeft(g.disrupted, dt); // NUM-3: ends on its whole tick
      }
      if (g.frozen > 0) {
        g.frozen = Math.max(0, g.frozen - dt);
        if (!g.online && Number.isFinite(g.commissionAt)) g.commissionAt += dt;
      }
      if (stopped) s.stats.disrupted += dt;
      // 0.8.0 P1 (E3): a STOKER's factory hits count as hits here (g.factoryHits is set on a stoking rig only)
      if (!g.online && !g.wrecked && !g.consumed && g.frozen <= 0 && (g.hits.length > 0 || !!g.factoryHits) && this.t >= g.commissionAt) {
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
    if (s.latches) for (const g of s.latches) this.latchTick(s, g); // 0.8.0 P1 (E4): releases, before this tick's transport
    if (s.surges) for (const g of s.surges) this.surgeTick(s, g); // Y3 (DESIGN-Y row 28): the damage pulses (star switch on)
    for (const r of s.routes) {
      for (let i = 0; i < r.cellDisrupt.length; i++) {
        const stopped = r.cellDisrupt[i] > 0;
        if (r.cellDisrupt[i] > 0) {
          r.cellDisrupt[i] = stunLeft(r.cellDisrupt[i], dt); // NUM-3: ends on its whole tick
        }
        if (stopped) s.stats.disrupted += dt;
      }
      // speed states: the latest tile with an active speed hit wins for everything downstream of it
      // (0.6.2, R7 item 4: several speed hits on one tile resolve by tileSpeed)
      let state = 1;
      for (let i = 0; i < r.cells.length; i++) {
        const won = this.tileSpeedAt(r.gateAt[i]);
        if (won !== undefined) state = won;
        const shown = s.race ? raceBeltSpeed(this, s, r.index, i, state) : state; // races: speed lock, Drag
        r.speedAt[i] = shown; // NUM-3 (R1's STUN fold): no chain slow any more (its rounds STUN)
        const v = r.cellDisrupt[i] > 0 ? 0 : BELT_SPEED * r.speedAt[i];
        r.phase[i] += v * dt;
      }
    }
    for (const f of s.factories) {
      if (f.flash > 0) f.flash -= dt;
      const stopped = f.disrupted > 0 || f.frozen > 0;
      if (f.disrupted > 0) {
        f.disrupted = stunLeft(f.disrupted, dt); // NUM-3: ends on its whole tick
      }
      if (f.frozen > 0) f.frozen = Math.max(0, f.frozen - dt);
      if (stopped) s.stats.disrupted += dt;
    }
    for (const tu of s.turrets) {
      if (tu.recoil > 0) tu.recoil = Math.max(0, tu.recoil - dt * 4);
      if (tu.jamFx > 0) tu.jamFx = Math.max(0, tu.jamFx - dt);
      const stopped = tu.disrupted > 0 || tu.frozen > 0;
      if (tu.disrupted > 0) {
        tu.disrupted = stunLeft(tu.disrupted, dt); // NUM-3: ends on its whole tick
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
        // Y2 (DESIGN-Y row 9, SCRAPPER): with the switch on it counts only STUNs (harassAccepted: the shared rule), ★3 BIG
        // HAUL's wreck stamp goes, and its queue has no cap (the belt's room still paces its stamps: Battle.stamp)
        const star = starRules();
        const gained = s.harassAccepted - f.seenHarass + (spec.bigHaul && !star ? s.wreckAccepted - f.seenWreck : 0);
        f.triggerQueue = star ? f.triggerQueue + gained : Math.min(3, f.triggerQueue + gained);
        f.seenHarass = s.harassAccepted;
        f.seenWreck = s.wreckAccepted;
      }
      if (!f.routes.length || f.disrupted > 0 || f.frozen > 0) continue;
      // 0.8.0 P1 (E3): a stoked factory's stamp timer and trigger cooldown run at pace x (1 + its active stokes), capped
      // so it never outruns its turrets (stokedPace); every other factory at f.pace
      let pace = f.stokers ? this.stokedPace(s, f, dt) : f.pace;
      // RUNES-2a: LAST STAND, below half hull the factories work a whole % faster too (stamping and trigger cooldown)
      if (s.rune?.lastStand && s.hull.hp < s.hull.max / 2) pace *= 1 + s.rune.lastStand / 100;
      // 0.8.0 P1: ARMOR PRESS's plating timer at the stamping pace, with the full stoke (it puts no payload on a belt)
      if (f.plateTimer !== undefined) this.pressPlate(s, f, dt * (f.stokers ? f.pace * (1 + this.stokeOf(f)) : f.pace));
      // SUS-A (REQ-BFG-069): MEND PRESS's HEAL timer, as ARMOR PRESS's (the same pace; stalled or frozen it pauses above)
      if (f.healTimer !== undefined) this.pressHeal(s, f, dt * (f.stokers ? f.pace * (1 + this.stokeOf(f)) : f.pace));
      // 0.6.2 TUNE-M, RULE JOIN PACE: a joined factory's timers run at f.pace (1 for every other factory: dt as before)
      if (f.triggerCooldown > 0) f.triggerCooldown = Math.max(0, f.triggerCooldown - dt * pace);
      if (f.triggerQueue > 0 && f.triggerCooldown <= 0 && this.stamp(s, f)) {
        f.triggerQueue--;
        f.triggerCooldown = 0.6;
      }
      // 0.6.1c DOUBLE STAMP / SHOT TOWER: the batch's waiting slugs leave the mouth as AMMO_SPACING frees, round-robin
      // like any stamp. A factory without a batch never has one waiting (pending stays 0).
      if (f.pending > 0 && this.stamp(s, f)) f.pending--;
      f.timer -= dt * pace; // RULE JOIN PACE: a joined factory's cycle takes 1 / pace as long (0.8.0 P1: and a stoked one's)
      if (f.timer > 0) continue;
      if (s.race && raceProduce(this, s, f, dt)) continue; // races: the CRUCIBLE's pour (a ★3 MIMIC's on FOUNDRY); SUMP
      // 0.8.0 P1: TWIN MOULD casts one slug onto each belt with room, on the same tick (the twin pour). bb-0.8.3 (REQ-BFG-042
      // D4): onto at most its pour size (2, ★3 3), taking its belts in turn when it feeds more (rule R)
      if (spec.twin) {
        pourAll(this, s, f, dt, () => this.mouldSlug(f), spec.pour);
        continue;
      }
      if (f.pending === 0 && this.stamp(s, f)) {
        f.timer += secPer(spec.speed); // NUM-2 (REQ-BFG-047): 30 / speed, carrying the remainder (was a reset to the interval)
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
        if (spec.ammo === "blank") p.lone = true; // bb-0.8.3 (D3): a blank stamped alone never fuses with its own factory's
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
        if (s.rune?.stampPlate) this.addPlate(s, s.rune.stampPlate); // RUNES-2a: FORGE WARD, PLATE each stamp (PLATE_CAP holds)
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
      // Y3 (release Y; DESIGN-Y row 28; REVIEW-STARD answer 5): with the star switch on SURGE VALVE's speed pulse is gone
      // (its damage pulse is surgeTick's), so it sets no speed state; off, as before
      if (e.pulse && !starRules()) speeds.push(this.pulsePhase(e.pulse).on ? e.pulse.speed : 1);
    }
    return speedWinner(speeds);
  }

  /**
   * Y3 (release Y; DESIGN-Y row 28; REVIEW-STARD answer 5: the damage pulse), each tick with the star switch on: once each
   * pulse period (pulsePhase's cycle on the battle's tick count, the speed pulse's own timing), in the first tick of its
   * `on` window that the valve works (online, not STUNned, frozen or wrecked), every slug on each belt its arrows hit gains
   * pulse.flat once: before or after its tile, on slag and on a locked belt alike (no speed in it any more). A valve that
   * doesn't work through the window misses that pulse.
   */
  private surgeTick(s: SideState, g: GateState): void {
    if (!g.online || g.wrecked || g.disrupted > 0 || g.frozen > 0) return;
    const p = g.def.gate!.pulse!, phase = this.pulsePhase(p);
    if (!phase.on || g.surged === phase.cycle) return;
    g.surged = phase.cycle;
    for (const ri of new Set(g.hits.map((h) => h.route))) for (const a of s.routes[ri].ammo) a.p.flat += p.flat;
    g.flash = 0.22;
    for (const h of g.hits) g.arrowFlash[h.dir] = 0.22;
  }

  /**
   * NUM-3 (REQ-BFG-047; cap's answer 3 to NUM-2: a repeating cadence carries its remainder): SURGE VALVE's pulse on the
   * battle's integer tick count. Pulse `cycle` starts on the first tick at or after cycle x period (each period runs from
   * the last one's exact end, never from the tick it landed on: 1.01 s pulses start on ticks 61, 122, 182, 243, where a
   * reset would give 183, 244) and lasts `on` s. Was `this.t % period < on` on the float clock, whose drift (this.t is
   * 24.99999999999986 on tick 1500) put a whole-second pulse's first or last tick on either side of its boundary.
   */
  private pulsePhase(p: { on: number; period: number }): { on: boolean; cycle: number } {
    const per = p.period * TICKS_PER_SEC; // ticks a period: whole for N1's whole seconds (180 / 180 / 120)
    const cycle = Math.floor((this.ticks + 1e-9) / per);
    const start = Math.ceil(cycle * per - 1e-9);
    return { on: this.ticks - start < Math.round(p.on * TICKS_PER_SEC), cycle };
  }

  private pulseAt(r: RouteState, pos: number): GateState | undefined {
    if (starRules()) return undefined; // Y3 (release Y; DESIGN-Y row 28): no per-ride pulse with the star switch on (surgeTick)
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
        let limit = i === 0 ? r.L : r.ammo[i - 1].s - AMMO_SPACING;
        // 0.8.0 P1 (E4): a held payload stays put; one reaching a free, working TWIN LATCH arrow stops at that tile's
        // centre, so the seconds it waits there are never ride (RACES.md section 0). Only routes a holding latch hits.
        if (r.holds) limit = this.holdLimit(r, a, limit);
        const ci = Math.min(n - 1, Math.floor(a.s / CELL));
        // 0.6.1c SLAG: a fixed belt speed that speed gates, the speed lock and slows never change (a stalled tile still stops it)
        const fixed = AMMO[a.p.ammo]?.fixedSpeed;
        let v = BELT_SPEED * (fixed ?? (s.race?.speedLock ? 1 : this.speedStateAt(r, a.s))); // races: METRONOME speed lock
        if (ci >= 0 && r.cellDisrupt[ci] > 0) v = 0;
        const drag = s.race && fixed === undefined ? raceDrag(this, s, r.index, ci) : 1; // races: SIPHON Drag
        if (drag !== 1) v *= drag; // races:
        // NUM-3 (R1's STUN fold): no CHILL (a frozen tile's mark) and no SNAG (a chain slow's mark and x0.8 ride) any more
        const want = a.s + v * dt;
        let ns = Math.min(want, limit);
        if (ns < a.s) ns = a.s;
        const moved = ns - a.s;
        if (v > 0 && moved > 0 && drag === 1) {
          const ride = moved / v;
          a.p.ride += ride; // races: dragged movement isn't ride
          if (a.p.heat) {
            a.p.heatRide = (a.p.heatRide ?? 0) + ride;
            // RUNES-1: COAL CHUTE / HEAT SINK, +pct% HEAT (a side without them gains exactly as before)
            a.p.heatBonus = (a.p.heatBonus ?? 0) + (s.rune?.heatPct ? a.p.heat * ride * (1 + s.rune.heatPct / 100) : a.p.heat * ride);
          }
          // Y3 (DESIGN-Y row 28): with the star switch on pulseAt finds no valve, so no per-ride pulse flat (surgeTick pays
          // every slug on the belt instead)
          const surge = fixed === undefined && !s.race?.speedLock ? this.pulseAt(r, a.s) : undefined;
          const pulse = surge?.def.gate?.pulse;
          const phase = surge && pulse && pulse.flat > 0 ? this.pulsePhase(pulse) : undefined; // NUM-3: the integer tick count
          if (surge && pulse && phase?.on) {
            const cycle = phase.cycle;
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
          if (r.holds?.[a.processed].length) this.tryHold(s, r, a); // 0.8.0 P1 (E4): the hold is the tile's last step
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

  // ------------------------------------------------------------------------------------- 0.8.0 P1: wave 3's engine

  /** E5 (crossfire, DESIGN-beltside section 8): the other rigs hitting hit h's tile that are working (online, not
   *  stalled, frozen or wrecked). One arrow of a rig reaches a tile at most once, so hits are rigs. */
  private crossfire(s: SideState, h: TileHit): number {
    let n = 0;
    for (const o of s.routes[h.route].gateAt[h.tile]) {
      const g = o.g;
      if (g !== h.g && g.online && !g.wrecked && g.disrupted <= 0 && g.frozen <= 0) n++;
    }
    return n;
  }

  /** E4: is TWIN LATCH `g` working (online, not stalled, frozen or wrecked)? A latch that isn't holds nothing. */
  private latchWorks(g: GateState): boolean {
    return g.online && !g.wrecked && g.disrupted <= 0 && g.frozen <= 0;
  }

  /** E4: payload `a`'s transport limit on a route a holding latch hits: where it is, while held; else the centre of the
   *  first tile ahead with a working latch arrow that holds nothing, when that comes before `limit`. */
  private holdLimit(r: RouteState, a: BeltAmmo, limit: number): number {
    if (a.hold) return Math.min(limit, a.s);
    for (let t = a.processed + 1; t < r.cells.length; t++) {
      for (const h of r.holds![t]) {
        if (!h.g.latch!.held[h.g.hits.indexOf(h)] && this.latchWorks(h.g)) return Math.min(limit, t * CELL + CELL / 2);
      }
    }
    return limit;
  }

  /** E4: payload `a` has just crossed the centre of tile a.processed (its hits applied): the first working latch arrow
   *  there that holds nothing holds it, until updateMachinery lets it go (latchTick). */
  private tryHold(s: SideState, r: RouteState, a: BeltAmmo): void {
    if (a.hold) return;
    for (const h of r.holds![a.processed]) {
      const g = h.g, l = g.latch!, arrow = g.hits.indexOf(h);
      if (l.held[arrow] || !this.latchWorks(g)) continue;
      l.held[arrow] = a;
      l.since[arrow] = this.t;
      a.hold = { g, arrow };
      this.events.push({ type: "hold", side: s.side, gate: g.uid, route: r.index });
      return;
    }
  }

  /**
   * E4, each tick before transport. A stalled, frozen or wrecked latch lets everything go. When each arrow holds a
   * payload (neither already on its way out): if both belts end at one turret, the payload with the longer trip left
   * goes now and the other after the difference between their trips (tripTime, at the belts' speeds now), so both reach
   * the turret together (the Prime's amendment, oracle a0e94bc69949561f: a latch's two tiles sit 2 cells apart and a
   * gun's intakes 1, so a release on one tick lands them an odd number of tiles apart); belts that end at different
   * turrets go together. No payload is held more than `hold` seconds in all; one alone goes after `hold` seconds.
   */
  private latchTick(s: SideState, g: GateState): void {
    const l = g.latch!, hold = g.def.gate!.latch!.hold;
    if (!this.latchWorks(g)) {
      for (let i = 0; i < l.held.length; i++) this.release(s, g, i);
      return;
    }
    for (let i = 0; i < l.held.length; i++) if (l.held[i] && l.at[i] !== null && this.t >= l.at[i]! - 1e-9) this.release(s, g, i);
    if (l.held[0] && l.held[1] && l.at[0] === null && l.at[1] === null) {
      if (!l.same) {
        this.release(s, g, 0);
        this.release(s, g, 1);
      } else {
        const trip = [0, 1].map((i) => this.tripTime(s, g.hits[i].route, l.held[i]!));
        const first = trip[0] >= trip[1] ? 0 : 1, second = 1 - first;
        this.release(s, g, first);
        const at = Math.min(this.t + Math.abs(trip[0] - trip[1]), l.since[second] + hold);
        if (at <= this.t + 1e-9) this.release(s, g, second);
        else l.at[second] = at;
      }
    }
    for (let i = 0; i < l.held.length; i++) if (l.held[i] && this.t - l.since[i] >= hold - 1e-9) this.release(s, g, i);
  }

  /** E4: the seconds payload `a` on route `ri` takes from where it is to its turret's intake at the belt's speeds now:
   *  each CELL to the next tile centre at the speed the tile behind it sets (RouteState.speedAt; a fixed-speed slag
   *  slug's own speed), the last stretch to the route's end too. A joining belt's trip stops at its join. */
  private tripTime(s: SideState, ri: number, a: BeltAmmo): number {
    const r = s.routes[ri];
    const fixed = AMMO[a.p.ammo]?.fixedSpeed;
    let t = 0;
    for (let ci = Math.min(r.cells.length - 1, Math.max(0, Math.floor(a.s / CELL))); ci < r.cells.length; ci++) {
      const from = Math.max(a.s, ci * CELL + CELL / 2), to = ci === r.cells.length - 1 ? r.L : (ci + 1) * CELL + CELL / 2;
      if (to > from) t += (to - from) / (BELT_SPEED * Math.max(1e-6, fixed ?? r.speedAt[ci]));
    }
    return t;
  }

  /** E4: latch `g`'s arrow `i` lets its payload go. */
  private release(s: SideState, g: GateState, i: number): void {
    const l = g.latch!, a = l.held[i];
    l.at[i] = null;
    if (!a) return;
    delete a.hold;
    l.held[i] = null;
    this.events.push({ type: "release", side: s.side, gate: g.uid, route: g.hits[i].route });
  }

  /** TWIN MOULD: one slug of its ammo (its dies' base from 2 stars), as Battle.stamp writes it. */
  private mouldSlug(f: FactoryState): Payload {
    const spec = f.def.factory!;
    const p: Payload = { id: this.nextId++, ammo: spec.ammo, ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: f.uid, copy: false };
    if (spec.base !== undefined) p.base = spec.base;
    return p;
  }

  /** ARMOR PRESS: its plating timer runs `step` seconds (the stamping pace); each time it ends, `amount` plating (E1). */
  private pressPlate(s: SideState, f: FactoryState, step: number): void {
    const pl = f.def.factory!.plate!;
    f.plateTimer! -= step;
    if (f.plateTimer! > 1e-9) return;
    this.addPlate(s, pl.amount);
    f.plateTimer! += pl.every;
  }

  /** SUS-A (REQ-BFG-069), MEND PRESS: ARMOR PRESS's timer (pressPlate), but each time it ends, HEAL `amount` (Battle.heal).
   *  It carries its remainder (+= every); in the dark wind it still runs, and heal() gives nothing. */
  private pressHeal(s: SideState, f: FactoryState, step: number): void {
    const hl = f.def.factory!.heal!;
    f.healTimer! -= step;
    if (f.healTimer! > 1e-9) return;
    this.heal(s, hl.amount, "mendpress", f.uid);
    f.healTimer! += hl.every;
  }

  /**
   * SUS-A (REQ-BFG-069; SUSTAIN-1 4.3, 4.5): every hull gain in battle (RIVETER, MEND PRESS, REGEN) comes through here.
   * Three rules: never past max hull; nothing heals from WIND_START (25 s, on the integer tick count); a hull with any
   * BURN on it heals half, rounded down. No crit, OVERCLOCKER or FRAY touches a heal; max-hull gains (ARMOR PACK, the HULL
   * runes) are not heals. A dead hull heals nothing. Returns the hull it gave back; a `heal` event when any.
   */
  heal(s: SideState, n: number, source: HealSource, from?: number): number {
    if (!(n > 0) || s.hull.hp <= 0) return 0;
    const c = (s.heals ??= { gained: 0, healed: 0, burnLost: 0, windLost: 0 });
    if (this.ticks >= WIND_TICKS) { // the dark wind's rule
      c.windLost += n;
      return 0;
    }
    const foeRune = this.sides[s.side === 0 ? 1 : 0].rune;
    if (s.hull.burns.length > 0 && (foeRune?.burnNoHeal || foeRune?.searBurn)) { c.burnLost += n; return 0; } // SUS-D: SEARING (FURN-Y: searBurn keeps it)
    if (s.hull.burns.length > 0) { // BURN's rule: half, rounded down
      const half = Math.floor(n / 2);
      c.burnLost += n - half;
      n = half;
    }
    const add = Math.min(n, s.hull.max - s.hull.hp);
    if (!(add > 0)) return 0;
    s.hull.hp += add;
    c.healed += add;
    this.events.push({ type: "heal", side: s.side, amount: add, source,
      ...(from === undefined ? {} : source === "riveter" ? { gate: from } : { factory: from }) });
    return add;
  }

  /** SUS-A: + n SHIELD on side s, never above SHIELD_CAP (a gain at the cap is lost); a `shield` event when any lands. */
  gainShield(s: SideState, n: number): number {
    const now = s.shield ?? 0, add = Math.min(n, SHIELD_CAP - now);
    if (!(add > 0)) return 0;
    s.shield = now + add;
    (s.heals ??= { gained: 0, healed: 0, burnLost: 0, windLost: 0 }).gained += add;
    this.events.push({ type: "shield", side: s.side, amount: add, shield: s.shield });
    return add;
  }

  /**
   * SUS-A, each tick after the hull effects: each WARD BELL's timer runs while its turret works (a STUN, freeze or
   * disruption on the turret pauses it: it doesn't advance and banks nothing) and carries its remainder (+= every);
   * then, at each whole second of battle time (every TICKS_PER_SEC ticks on the integer tick count), each living hull's
   * REGEN (its working MENDING LOOMs') heals through heal(). No RNG; a side without these pieces does nothing here.
   */
  private sustainTick(dt: number): void {
    const whole = this.ticks % TICKS_PER_SEC === 0;
    for (const s of this.sides) {
      let regen = s.rune?.regen ?? 0; // SUS-D: GREEN THREAD's REGEN adds to the MENDING LOOMs' (one heal a second)
      for (const tu of s.turrets) {
        if (!tu.bell && !tu.regen) continue;
        if (tu.disrupted > 0 || tu.frozen > 0) continue; // paused
        if (tu.bell) {
          tu.bell.timer -= dt;
          if (tu.bell.timer <= 1e-9) {
            this.gainShield(s, tu.bell.amount);
            tu.bell.timer += tu.bell.every;
          }
        }
        if (tu.regen) regen += tu.regen;
      }
      if (whole && regen > 0 && s.hull.hp > 0) this.heal(s, regen, "regen");
    }
  }

  /** E3: the stoke of a factory's working STOKERs (online, not stalled, frozen or wrecked). */
  private stokeOf(f: FactoryState): number {
    let k = 0;
    for (const st of f.stokers!) if (st.g.online && !st.g.wrecked && st.g.disrupted <= 0 && st.g.frozen <= 0) k += st.stoke;
    return k;
  }

  /**
   * E3 with STOKER's cap (the Prime's call, oracle a0e94bc69949561f: "the stoke never makes a factory stamp faster than
   * the turret its route feeds can take"): the pace of a stoked factory's stamp timer and trigger cooldown. Each turret
   * its belts reach takes 1 / loadPace loads a second (read live); the other factories feeding it use their share of that
   * (their stamp rate now x the loads a stamp sends there), and this factory may use what is left. With I0 its unstoked
   * stamp interval (JOIN_PACE included) and Imin the shortest interval that leaves no turret over its pace (the largest
   * over its turrets; Infinity where nothing is left), it stamps every max(I0 / (1 + stoke), min(I0, Imin)): the full
   * stoke where the guns have room, never faster than they can take, never slower than unstoked. A factory with no belt
   * to a turret keeps the full stoke. Counts the extra work in f.stoked.
   */
  private stokedPace(s: SideState, f: FactoryState, dt: number): number {
    const k = this.stokeOf(f);
    let pace = f.pace * (1 + k);
    // Y3 (release Y; DESIGN-Y row 31; REVIEW-STARD answer 4): with the star switch on the cap is gone: the full stoke, so a
    // stoked factory may overfeed its gun (and jam it); off, capped as before
    if (k > 0 && f.stokeCap?.length && !starRules()) {
      const i0 = secPer(f.def.factory!.speed) / f.pace; // NUM-2: 30 / speed
      let imin = 0;
      for (const c of f.stokeCap) {
        const tu = turretAt(s, c.turret);
        if (!tu) continue;
        // a turret fed by this factory alone takes its full pace (its loads come evenly); one other factories share keeps
        // SHARED_HEADROOM of its pace free, since loads from several factories drift in and out of step and bunch up
        let left = (c.others.length ? 1 - SHARED_HEADROOM : 1) / loadPace(tu);
        for (const o of c.others) left -= ((o.f.stokers ? o.f.curPace ?? o.f.pace : o.f.pace) / secPer(o.f.def.factory!.speed)) * o.perStamp;
        imin = Math.max(imin, left > 1e-9 ? c.perStamp / left : Infinity);
      }
      const eff = Math.max(i0 / (1 + k), Math.min(i0, imin));
      pace = secPer(f.def.factory!.speed) / eff;
    }
    f.curPace = pace;
    f.stoked = (f.stoked ?? 0) + dt * (pace - f.pace);
    return pace;
  }

  /** E1: `n` plating onto side s's hull from a wave-3 part, up to PLATE_CAP (the same 24 BASTION's slugs fill); a
   *  `plate` event when any lands. Returns the plating added. RUNES-2a: BULWARK OATH multiplies every gain (`raw`: the
   *  extra share of a gain made elsewhere, already multiplied: racePlate). */
  addPlate(s: SideState, n: number, raw = false): number {
    if (!raw && s.rune?.plateMul) n *= s.rune.plateMul;
    const st = s.plate, add = Math.min(n, PLATE_CAP - st.plate);
    if (!(add > 0)) return 0;
    st.plate += add;
    st.gained += add;
    if (st.plate > st.peak) st.peak = st.plate;
    this.events.push({ type: "plate", side: s.side, amount: add, plate: st.plate });
    return add;
  }

  /** E1: a wave-3 part spends `n` plating off side s's hull (PLATE BREAKER), at most what it holds; a `plate` event. */
  spendPlate(s: SideState, n: number): number {
    const st = s.plate, take = Math.min(n, st.plate);
    if (!(take > 0)) return 0;
    st.plate -= take;
    this.events.push({ type: "plate", side: s.side, amount: -take, plate: st.plate });
    return take;
  }

  /**
   * E2, after a normal load into a pair-reading turret (chambers, dropStore): the load pairs with the turret's last
   * unpaired load from another route still in the chamber when they entered no more than SYNC_WINDOW apart (FOUNDRY's
   * sync rule, races/foundry.ts inSync, for any ammo); both are marked and a `pair` event fires. Marks only, no RNG.
   * Then SEAM WELDER plates the hull: `pair` for a load that paired, `lone` for any other. Returns whether it paired.
   */
  private loaded(s: SideState, tu: TurretState, route: number, p: Payload): boolean {
    const seen = s.pairs!;
    let paired = false;
    for (let i = tu.stack.length - 1; i >= 0; i--) {
      const q = tu.stack[i];
      if (q === p || q.paired) continue;
      const m = seen.get(q);
      if (!m || !inSync(this.t - m.at, m.route === route)) continue;
      q.paired = true;
      p.paired = true;
      paired = true;
      this.events.push({ type: "pair", side: s.side, turret: tu.index });
      if (s.rune?.pairPlate) this.addPlate(s, s.rune.pairPlate); // RUNES-2a: SEAM RIVETS
      break;
    }
    seen.set(p, { at: this.t, route });
    if (tu.seam) this.addPlate(s, paired ? tu.seam.pair : tu.seam.lone);
    return paired;
  }

  /** SPALL CATCHER: damage that lands on side s charges each of its turrets carrying one: add x (the hull's part + twice
   *  what plating soaked) / every, up to max. The dark wind never comes through here (hullEffects' wind line).
   *  Y5 (release Y; DESIGN-Y row 47): with the star switch on a PLATE soak counts once, and there is no cap (its def holds no
   *  max: content.ts STAR_DIFF); off, as before. */
  private spallCharge(s: SideState, hull: number, plate: number): void {
    const taken = hull + (starRules() ? 1 : 2) * plate;
    if (!(taken > 0)) return;
    for (const tu of s.spall!) {
      const sp = tu.spall!;
      tu.spallCharge = Math.min(sp.max ?? Infinity, (tu.spallCharge ?? 0) + (sp.add * taken) / sp.every);
    }
  }

  /** E2: a FOUNDRY fusion in a pair-reading turret is a pair: the alloy slug is marked, and SEAM WELDER plates `pair`. */
  private fusionPair(s: SideState, tu: TurretState, alloy: Payload): void {
    alloy.paired = true;
    this.events.push({ type: "pair", side: s.side, turret: tu.index });
    if (tu.seam) this.addPlate(s, tu.seam.pair);
    if (s.rune?.pairPlate) this.addPlate(s, s.rune.pairPlate); // RUNES-2a: SEAM RIVETS
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
    // 0.8.0 P1, wave 3 (R7 tier 1, additive; each field exists only on its wave-3 rig):
    if (e.gauge) p.flat += h.matched ? e.gauge.matched : e.gauge.flat; // E6 TWIN GAUGE: more on a matched belt
    // E5 PINCER. Y3 (release Y; DESIGN-Y row 20): with the star switch on its def has no `max` (and flat 0: content.ts
    // STAR_DIFF), so every other working rig counts; off, max 3, as before
    if (e.pincer) p.flat += e.pincer.flat + e.pincer.each * Math.min(e.pincer.max ?? Infinity, this.crossfire(s, h));
    if (e.latch) p.flat += e.latch.flat; // TWIN LATCH: each payload it hits (its hold is E4, after the tile's hits)
    if (e.plate) this.addPlate(s, e.plate); // PLATE ROLLER, SHIELD WALL: plating for each payload it hits (E1)
    if (e.plated && s.plate.plate >= e.plated.min) p.flat += e.plated.flat; // SHIELD WALL: after its plating, at 12+
    if (e.breaker) { // PLATE BREAKER: takes 1 plating for + flat; with none to take, + floor (it never takes more)
      if (s.plate.plate >= 10) { // NUM-1: 10 plating (x10 of 1)
        this.spendPlate(s, 10);
        p.flat += e.breaker.flat;
      } else p.flat += e.breaker.floor;
    }
    // 0.6.1p: LONG HAUL ★2/★3 counts at most priorCap prior gates (1 star has no cap)
    if (e.perPriorGate) p.flat += e.perPriorGate * (e.priorCap !== undefined ? Math.min(p.prior, e.priorCap) : p.prior);
    if (e.burn) p.burn += e.burn;
    if (e.poison) p.poison = (p.poison ?? 0) + e.poison;
    if (e.burnPerRide) {
      const original = g.def.gate!.burnPerRide!;
      // Y3 (release Y; DESIGN-Y row 22): with the star switch on, + burn for each whole `per` s ridden (1/2/3 for each 2 s),
      // no cap; off, floor(ride x burn / per) up to max, as before (NUM-3: n per 10 s)
      const n = starRules() ? original.burn * Math.floor(p.ride / original.per) : Math.min(original.max ?? Infinity, Math.floor((p.ride * original.burn) / original.per));
      p.burn += (doubled ? 2 : 1) * n;
    }
    if (e.quench) { // 0.6.2 FB-B: + flat on every payload; up to `stacks` Burn stacks at perBurn each, the rest stays Burn
      // Y3 (DESIGN-Y row 23): with the star switch on its def has no `stacks` (and flat 0), so every BURN stack turns
      const spent = Math.min(p.burn, e.quench.stacks ?? Infinity);
      p.flat += e.quench.flat + spent * e.quench.perBurn;
      p.burn -= spent;
    }
    if (e.staticTime) { p.static = true; p.staticTime = Math.max(p.staticTime ?? 0, e.staticTime); }
    if (e.perStalled && starRules()) {
      // Y2 (DESIGN-Y row 15, LODESTONE): with the switch on, +each for each enemy part a STUN holds now: its rigs, factories,
      // turrets and belt tiles; a wrecked rig is no STUN; no cap (its floor is gone from its data: content.ts STAR_DIFF)
      const foe = this.sides[s.side === 0 ? 1 : 0];
      const stunned = [...foe.gates.filter((g) => !g.wrecked), ...foe.factories, ...foe.turrets].filter((m) => m.disrupted > 0 || m.frozen > 0).length +
        foe.routes.reduce((n, r) => n + r.cellDisrupt.filter((t) => t > 0).length, 0);
      p.flat += stunned * e.perStalled.each;
    } else if (e.perStalled) {
      const foe = this.sides[s.side === 0 ? 1 : 0];
      const stalled = [...foe.gates, ...foe.factories, ...foe.turrets]
        .filter((m) => m.disrupted > 0 || m.frozen > 0 || ("wrecked" in m && m.wrecked)).length;
      p.flat += Math.min(e.perStalled.max, stalled * e.perStalled.each);
    }
    if (e.fray) { p.fray = (p.fray ?? 0) + e.fray; p.frayCap = Math.max(p.frayCap ?? 0, e.frayCap ?? 0); }
    // 0.6.2j (J14 (a)): COUNTERWEIGHT counts the tiles ridden on the payload's own journey. Y5 (release Y; DESIGN-Y row 41):
    // with the star switch on its def has no `max` (content.ts STAR_DIFF), so every tile counts; off, its cap, as before
    if (e.perTile) p.flat += Math.min(e.perTile.max ?? Infinity, (p.journeyOffset === undefined ? a.processed : a.processed + p.journeyOffset) * e.perTile.each);
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
    if (e.heal) this.heal(s, e.heal, "riveter", g.uid); // SUS-A (REQ-BFG-069): RIVETER heals through heal() (its rules)
    if (e.sort) {
      g.sorted++;
      if (g.sorted % e.sort.every === 0) for (let c = 1; c < e.sort.copies; c++) {
        const cp: Payload = { ...p, id: this.nextId++, ...(p.debuffs ? { debuffs: { ...p.debuffs } } : {}),
          ...(p.pulseSeen ? { pulseSeen: { ...p.pulseSeen } } : {}) };
        copies.push({ p: cp, s: a.s - 0.01 * c, processed: a.processed, blocked: false });
      }
    }
    if (e.split) {
      p.mult *= e.split.mult; // a share: payloadDamage rounds the slug's damage once, at fire
      p.flat = pct(p.flat, 100 * e.split.mult); // NUM-1: the flat bonus so far x the split's %, rounded half up once
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
      const alloy = s.race ? raceIntake(this, s, r, tu, front.p) : null; // races: alloy fusion (no slot used)
      if (alloy) {
        r.ammo.shift();
        if (tu.pairing) this.fusionPair(s, tu, alloy); // 0.8.0 P1 (E2): a FOUNDRY fusion is a pair
        continue;
      }
      if (tu.phase === "load" && tu.stack.length < tu.window) { // 0.6.1b: was tu.def.window (the same number)
        tu.stack.push(front.p);
        r.ammo.shift();
        this.events.push({ type: "load", side: s.side, turret: tu.index });
        if (s.race) this.racePlate(s, () => raceLoaded(this, s, r, tu, front.p)); // races: blank sync stamp, bulwark plating
        if (tu.pairing) this.loaded(s, tu, r.index, front.p); // 0.8.0 P1 (E2, SEAM WELDER)
      } else if (tu.phase === "fire" && tu.store.length < tu.storeMax) { // 0.6.2 FB-B: a HOPPER ★2/★3 store takes it
        tu.store.push({ p: front.p, route: r.index });
        r.ammo.shift();
        this.events.push({ type: "load", side: s.side, turret: tu.index });
      }
    }
    for (const tu of s.turrets) {
      s.stats.turretTime += dt;
      if (tu.core.routine === "steam") tu.plated = s.plate.plate > 0; // 0.8.0 P1: STEAM BREECH reads it in its cadence
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
      // Y5 (release Y; DESIGN-Y row 42): with the star switch on CAPACITOR BANK's def has no maxSeconds (content.ts STAR_DIFF):
      // it charges for as long as its chamber sits empty; off, up to maxSeconds (5 s), as before
      if (tu.core.routine === "capacitor" && tu.stack.length === 0)
        tu.charge = Math.min(tu.core.spec.maxSeconds ?? (starRules() ? Infinity : 5), tu.charge + dt);
      // NUM-2 (REQ-BFG-047, N1 2.2): the shot timer carries its remainder (it stops within a tick below 0, and a shot adds
      // the next interval to it), so an over-fed turret's long-run rate is exactly speed / 30 a second (was a clamp at 0)
      if (tu.fireCd > 0) tu.fireCd -= dt;
      if (tu.jamCd > 0) tu.jamCd = Math.max(0, tu.jamCd - dt);
      // 0.6.1b: the core's chamber hooks (src/sim/cores.ts ROUTINES); the identity hooks are the old rules
      const rt = ROUTINES[tu.core.routine];
      if (tu.phase === "load") {
        if (tu.stack.length > 0) tu.loadTimer += dt;
        if (rt.ready(tu)) { // identity: stack.length >= window || (stack.length > 0 && loadTimer >= WINDOW_TIME)
          tu.phase = "fire";
          if (s.rune?.volleyFirst || s.rune?.volleyBurn) tu.runeVolley = true; // RUNES-2a: FIRST BLOOD, EMBER SHOT: the volley opens
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
            tu.fireCd += tu.interval; // NUM-2: the remainder carried
          } else {
            const n = rt.count(tu); // identity: perShot
            for (let k = 0; k < n && tu.stack.length; k++) {
              // PRESSURE BREECH: waiting plus its window, this load included (0.6.2 FB-B: plus a HOPPER's stored loads)
              const queued = tu.waiting + tu.stack.length + tu.store.length;
              const idx = tu.jamRandom ? this.rng.int(tu.stack.length) : rt.select(tu); // identity: LIFO
              tu.jamRandom = false;
              const p = tu.stack.splice(idx, 1)[0];
              if (tu.core.routine === "compound" && tu.stack.length) p.compound = tu.stack.pop();
              // 0.6.1p FINISHER RAM: the payload that empties the window. A GATLING never holds a window
              // (cores.ts gatlingReady), so none of its shots is a finisher (the Prime's call, brief 0.6.1p).
              const fin = tu.finisher > 0 && tu.stack.length === 0 && tu.core.routine !== "gatling";
              this.fire(s, tu, p, k, queued, fin);
            }
            tu.fireCd += rt.cadence(tu, this.t); // identity: interval (NUM-2: 30 / speed, the remainder carried)
            // RUNES-2a: LAST STAND, below half hull the next shot comes a whole % sooner
            if (s.rune?.lastStand && s.hull.hp < s.hull.max / 2) tu.fireCd /= 1 + s.rune.lastStand / 100;
          }
          if (tu.stack.length === 0) {
            tu.phase = "load";
            tu.loadTimer = 0;
            if (tu.store.length) this.dropStore(s, tu); // 0.6.2 FB-B: HOPPER ★2/★3
          }
        }
      }
    }
  }

  /**
   * 0.6.2 FB-B HOPPER ★2/★3: the loads its store took while the gun fired enter the new window, oldest first, each as if
   * it reached its intake now (a FOUNDRY blank can still fuse with a synced partner dropped before it). The window's
   * timer starts with them. A window always has room for the store (1/2 loads; the smallest window with a HOPPER is 3).
   */
  private dropStore(s: SideState, tu: TurretState): void {
    const held = tu.store;
    tu.store = [];
    for (const it of held) {
      const r = s.routes[it.route];
      const alloy = s.race ? raceIntake(this, s, r, tu, it.p) : null; // races: alloy fusion (no slot used)
      if (alloy) {
        if (tu.pairing) this.fusionPair(s, tu, alloy); // 0.8.0 P1 (E2)
        continue;
      }
      if (tu.stack.length >= tu.window) {
        tu.store.push(it);
        continue;
      }
      tu.stack.push(it.p);
      if (s.race) this.racePlate(s, () => raceLoaded(this, s, r, tu, it.p)); // races: blank sync stamp, bulwark plating
      if (tu.pairing) this.loaded(s, tu, it.route, it.p); // 0.8.0 P1 (E2): as if it reached its intake now
    }
  }

  private fire(s: SideState, tu: TurretState, p: Payload, k: number, queued: number, fin = false): void {
    if (tu.core.bought) return this.fireCore(s, tu, p, k, queued, fin); // 0.6.1b; the identity shot below is unchanged
    const foe = this.sides[s.side === 0 ? 1 : 0];
    const ammo = AMMO[p.ammo];
    let dmg = ammo.rideCurve // races: PENDULUM curve
      ? raceCurveDamage(ammo, s, tu, p)
      : payloadDamage(p.base ?? ammo.base, ammo.rideScale, this.rideOf(s, p), p.mult, p.flat + (p.heatBonus ?? 0), shotFloor(p.ammo)); // RUNES-2a: THE LONG ROAD; Y2: shotFloor
    if (!ammo.rideCurve && tu.longRideFlat && p.ride >= tu.longRideMin) dmg += tu.longRideFlat;
    // NUM-1 (REQ-BFG-047): payloadDamage made the slug's damage whole at fire (its HEAT and split share rounded once); each
    // % below rounds half up once, where it applies (pct)
    if (p.paired && tu.pairBonus) dmg = pct(dmg, 100 * (1 + tu.pairBonus)); // 0.8.0 P1: TWIN TRIGGER on a paired load (E2), before the RAM
    if (fin) dmg = pct(dmg, 100 * (1 + tu.finisher)); // 0.6.1p: FINISHER RAM
    if (tu.spallCharge) { dmg += roundHalfUp(tu.spallCharge); tu.spallCharge = 0; } // 0.8.0 P1: SPALL CATCHER's charge, this shot (NUM-1: whole)
    const open = s.rune ? this.volleyOpen(tu) : false; // RUNES-2a: the volley's first shot (FIRST BLOOD, EMBER SHOT)
    if (s.rune) { // RUNES-1 (REQ-BFG-058): the flat runes; RUNES-2a: then the multiplying ones
      dmg += this.runeShot(s, tu, !!p.paired, p);
      dmg = pct(dmg, 100 * this.runeMul(s, !!p.paired, p, open)); // NUM-1: the runes' whole % sum, rounded once
    }
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
    if (open && s.rune?.volleyBurn) proj.runeBurn = s.rune.volleyBurn; // RUNES-2a: EMBER SHOT
    this.telegraph(proj);
    this.projectiles.push(proj);
    tu.recoil = 1;
    s.stats.shots++;
    s.stats.payloadSum += dmg;
    if (s.stats.firstShot < 0) s.stats.firstShot = this.t;
    this.events.push({ type: "fire", side: s.side, turret: tu.index, heavy, dmg, proj: proj.id });
    if (p.paired && s.rune?.pairTwice) this.echo(s, proj); // RUNES-2a: MOLTEN VOWS
  }

  /** RUNES-1 (REQ-BFG-058): the flat damage side s's runes add to one shot of turret tu (before the debuffs, like the
   *  gear's flat bonuses): WAR EDGE on every shot, TWIN NAILS / MOLTEN BOND on a PAIR shot, SHARP SCRAP on the turret's
   *  first shot of the battle. Only called for a side with runes. */
  private runeShot(s: SideState, tu: TurretState, paired: boolean, p?: Payload): number {
    const m = s.rune!;
    let add = m.shotDmg + (paired ? m.pairDmg : 0);
    if (!tu.runeFired) {
      tu.runeFired = true;
      add += m.firstShotDmg;
    }
    // RUNES-2a: BARBED SILK on a load that adds FRAY; IRON TEMPER while the hull holds PLATE; FINAL NAIL on the shot that
    // empties the volley (the window: chambers spliced it)
    if (p) {
      if (m.frayHitDmg && (AMMO[p.ammo].fray > 0 || p.fray)) add += m.frayHitDmg;
    }
    if (m.platedDmg && s.plate.plate > 0) add += m.platedDmg;
    if (m.finisherDmg && tu.stack.length === 0 && tu.core.routine !== "gatling") add += m.finisherDmg; // a GATLING holds no window
    return add;
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
      ? Math.max(10, raceCurveDamage(ammo, s, tu, p) - conv.used) // NUM-1: the least shot x10 (curveDamage's floor)
      : payloadDamage(p.base ?? ammo.base, ammo.rideScale, this.rideOf(s, p), p.mult, p.flat - conv.used + (p.heatBonus ?? 0), shotFloor(p.ammo)); // RUNES-2a: THE LONG ROAD; Y2: shotFloor
    if (!ammo.rideCurve && tu.longRideFlat && p.ride >= tu.longRideMin) dmg += tu.longRideFlat;
    let burn = p.burn, burnTime: number | undefined, flightMul = 1, pellets = 1, share = 1;
    // NUM-1 (REQ-BFG-047): the core's numbers are whole at install (cores.ts scaleCore); every % or rate here rounds half
    // up once (ANVIL's plating %, HULLBREAKER, CAPACITOR's idle seconds, COMPOUND)
    if (routine === "pressure") dmg += pressureBonus(c, queued);
    else if (routine === "salvo") dmg += c.volleyFlat ?? 0;
    else if (routine === "anvil") dmg += (c.anvilFlat ?? 0) + pct(s.plate.plate, 100 * (c.perPlate ?? 0)); // 0.8.0 P1: ANVIL BREECH (x k)
    else if (routine === "hullbreaker") dmg = pct(dmg, 100 * (c.hullMul ?? 1));
    else if (routine === "capacitor") { dmg += roundHalfUp((c.perSecond ?? 0) * tu.charge); tu.charge = 0; }
    else if (routine === "compound" && p.compound) {
      const q = p.compound, qa = AMMO[q.ammo];
      const qd = qa.rideCurve ? raceCurveDamage(qa, s, tu, q) : payloadDamage(q.base ?? qa.base, qa.rideScale, this.rideOf(s, q), q.mult, q.flat + (q.heatBonus ?? 0), shotFloor(q.ammo)); // Y2: shotFloor
      dmg = pct(debuffedDamage(dmg, p.debuffs) + debuffedDamage(qd, q.debuffs), 100 * (c.mult ?? 1));
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
    // 0.8.0 P1: TWIN TRIGGER on a paired load (E2; a COMPOUND shell packing one counts), before the RAM
    if (tu.pairBonus && (p.paired || p.compound?.paired)) dmg = pct(dmg, 100 * (1 + tu.pairBonus));
    if (fin) dmg = pct(dmg, 100 * (1 + tu.finisher)); // 0.6.1p: FINISHER RAM, after the core's own bonus (never set on a GATLING)
    if (tu.salvage) { dmg += tu.salvage; tu.salvage = 0; }
    if (tu.spallCharge) { dmg += roundHalfUp(tu.spallCharge); tu.spallCharge = 0; } // 0.8.0 P1: SPALL CATCHER's charge, this shot (NUM-1: whole)
    const paired = !!(p.paired || p.compound?.paired);
    const open = s.rune ? this.volleyOpen(tu) : false; // RUNES-2a: the volley's first shot (FIRST BLOOD, EMBER SHOT)
    if (s.rune) { // RUNES-1 (REQ-BFG-058): the flat runes; RUNES-2a: then the multiplying ones
      dmg += this.runeShot(s, tu, paired, p);
      dmg = pct(dmg, 100 * this.runeMul(s, paired, p, open)); // NUM-1: the runes' whole % sum, rounded once
    }
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
      const pd = pct(dmg, 100 * share); // NUM-1: a SCATTER pellet's share, rounded half up once (share 1: dmg)
      const proj: Projectile = {
        id: this.nextId++, from: s.side, turret: tu.index, payload: p, dmg: pd, t: 0, flight, target, tx, ty, heavy,
        core: routine, burn: pellets > 1 ? Math.ceil(burn / pellets) : burn,
        ...(burnTime !== undefined ? { burnTime } : {}),
        ...(pellets > 1 ? { share, noFray: j > 0 } : {}),
        ...(fin ? { finisher: true } : {}), // 0.6.1p
        ...(j === 0 && open && s.rune?.volleyBurn ? { runeBurn: s.rune.volleyBurn } : {}), // RUNES-2a: EMBER SHOT, its first pellet
        ...(routine === "mortar" ? { splash: c.splash, splashShare: c.share } : {}),
        ...(routine === "tesla" ? { tesla: { arcs: c.arcs ?? 1, stall: c.stall ?? 0.8, share: c.share ?? 0.25 } } : {}),
        ...(routine === "lance" ? { lance: { columns: c.columns ?? 1, share: c.share ?? 0.2, col: Math.floor(target.x / CELL) } } : {}),
      };
      this.telegraph(proj);
      this.projectiles.push(proj);
      s.stats.shots++;
      s.stats.payloadSum += pd;
      this.events.push({ type: "fire", side: s.side, turret: tu.index, heavy, dmg: pd, proj: proj.id, core: routine });
      if (paired && s.rune?.pairTwice) this.echo(s, proj); // RUNES-2a: MOLTEN VOWS, each pellet
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
    // Y2 (release Y; DESIGN-Y section 3, the shared rule): with the switch on, harassment is a STUN, so FLAK SCREEN rolls
    // only for a shot that carries one: a shock, a static or arc slug, a TESLA shot, a SABOT, FROST or CHAIN round, a
    // LIMPET charge with a stall. A GRAPNEL rip, a LANCE shot and a stall-less LIMPET charge carry none
    if (starRules()) {
      const h = p.harass;
      return !!(p.shock || p.static || p.arc || pr.tesla ||
        (h && (h.kind === "sabot" || h.kind === "frost" || h.kind === "drag" || (h.kind === "limpet" && (h.stall ?? 0) > 0))));
    }
    return !!(p.harass || p.shock || p.static || p.arc || p.rip || pr.tesla || pr.lance);
  }

  private flight(dt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.t += dt;
      if (!pr.flakChecked && this.isHarassingProjectile(pr) && pr.t >= pr.flight / 2) {
        pr.flakChecked = true;
        const defender = this.sides[pr.from === 0 ? 1 : 0];
        // Y2 (DESIGN-Y row 10, FLAK SCREEN): with the switch on each screen rolls on its own (SideState.flaks, in turret
        // order) until one downs the shot; off, one roll at the side's best screen, as before
        if (defender.flaks ? defender.flaks.some((f) => this.rng.next() < f) : defender.flak > 0 && this.rng.next() < defender.flak) {
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
    // NUM-1 (REQ-BFG-047): FRAY_BONUS is whole (2 a stack); a pellet's share of it rounds half up once
    let bonus = pr.share !== undefined ? pct(def.hull.fray * FRAY_BONUS, 100 * pr.share) : def.hull.fray * FRAY_BONUS;
    if (atk.rune?.frayMul) bonus *= atk.rune.frayMul; // RUNES-2a: LOOM OF WOE, your FRAY bonus x n
    let total = pr.dmg + bonus; // NUM-3 (R1's STUN fold): SABOT's bare-hull +60 is gone
    if (atk.rune || def.rune) total = this.runeHit(atk, def, hit, total); // RUNES-2a: SCRAP BITER, SNARE KNOT, IRON HIDE, WARD STONE
    // SUS-A (REQ-BFG-069): SHIELD, then PLATE, then HULL. A SHIELD stops this whole hit (0, its FRAY bonus included), where
    // WARD STONE's blockHits stopped it: after IRON HIDE, on any impact; its BURN, FRAY, STUN and poison still land below
    if (def.shield) total = atk.rune?.shieldPierce || atk.rune?.shatterPct ? this.shieldShatter(def, total) : this.shieldHit(def); // SUS-D: SHATTER SHOT (FURN-Y: shatterPct keeps it)
    // races: bulwark plating soaks first. 0.8.0 P1 (E1): every hull's plating (0 without a source: the damage unchanged)
    const hullPart = absorb(def.plate, total);
    def.hull.hp -= hullPart;
    if (def.spall) this.spallCharge(def, hullPart, total - hullPart); // SPALL CATCHER
    def.hull.flash = 0.12;
    atk.stats.damage += total;
    if (def.rune?.plateOnHit && total > 0) this.addPlate(def, def.rune.plateOnHit); // RUNES-2a: SCAB IRON, after this hit's soak
    if (!pr.noFray && (ammo.fray > 0 || pr.payload.fray)) {
      def.hull.frayMax = Math.max(def.hull.frayMax, FRAY_MAX + (pr.payload.frayCap ?? 0));
      // RUNES-1: DOUBLE KNOT, +n FRAY on each of your hits that adds FRAY (a side without it adds exactly as before)
      def.hull.fray = Math.min(def.hull.frayMax, def.hull.fray + ammo.fray + (pr.payload.fray ?? 0) + (atk.rune ? atk.rune.frayHit : 0));
    } else if (!pr.noFray && atk.rune?.otherFray) { // RUNES-2a: THREAD STORM, a hit that adds no FRAY adds n
      def.hull.fray = Math.min(def.hull.frayMax, def.hull.fray + atk.rune.otherFray);
    }
    if (pr.payload.poison) {
      def.hull.poison.stacks = Math.min(24, def.hull.poison.stacks + pr.payload.poison);
      def.hull.poison.t = 6;
    }
    let burn = pr.burn ?? pr.payload.burn; // 0.6.1b: a core's Burn (SCATTER split, DRAKE added), else the payload's
    // RUNES-2a: SLOW EMBERS (your BURN lasts longer)
    if (burn > 0) def.hull.burns.push({ dps: burn, t: this.burnTime(atk, pr.burnTime ?? BURN_TIME) });
    if (atk.rune) { // RUNES-2a: EMBER SHOT on a volley's first shot, HOT SEAM on a PAIR shot: BURN stacks on this hit
      const more = (pr.runeBurn ?? 0) + (atk.rune.pairBurn && (pr.payload.paired || pr.payload.compound?.paired) ? atk.rune.pairBurn : 0);
      if (more > 0) {
        def.hull.burns.push({ dps: more, t: this.burnTime(atk, BURN_TIME) });
        burn += more;
      }
    }
    if (atk.rune && (atk.rune.hitHeal || atk.rune.pairHeal)) this.runeHeal(atk, pr); // SUS-D: LEECH VOW, TWIN SALVE
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
      // NUM-1: 10 a ripped load (x10 of 1) x the class's whole %, rounded half up once
      // Y2 (DESIGN-Y row 19, GRAPNEL GUN ★3): with the switch on SALVAGE LINE's next-shot damage goes (its name stays, ⓘ only)
      if (ripped && pr.core === "grapnel" && gun && gun.core.stars >= 3 && !starRules()) gun.salvage += pct(10 * ripped, roundHalfUp(100 * gun.core.k));
    }
    if (pr.payload.harass) this.roundImpact(def, hit, pr.payload.harass, pr.from, pr.payload.debuffs);
    if (atk.race || def.race) raceImpact(this, atk, def, pr); // races: SIPHON echo memory and Drag
    this.events.push({
      type: "impact", side: def.side, x: pr.tx, y: pr.ty, dmg: total, heavy: pr.heavy,
      kind: hit.kind, shock: shocked, burn, big: total >= 140, // NUM-1: the big-hit flag x10
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
    this.impact({ ...pr, dmg: pct(pr.dmg, 100 * share), target, tx: target.x, ty: target.y, // NUM-1: the share, rounded once
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
    // Y2 (release Y; DESIGN-Y section 3, the shared rule): with the switch on, harassment is a STUN. A SABOT wreck (cause
    // "wreck") and a GRAPNEL rip ("rip") still land, but TOLLBOOTH spends no toll on them and an enemy SCRAPPER doesn't
    // count them. With it off every cause is harassment, as before
    const stun = !starRules() || STUN_CAUSES.includes(cause);

    const routeIds = t.kind === "belt" ? [t.ref]
      : t.kind === "gate" ? [...new Set(g!.hits.map((h) => h.route))]
      : t.kind === "factory" ? f!.routes
      : t.kind === "turret" ? s.routes.filter((route) => route.connected && route.turret === t.ref).map((route) => route.index) : [];
    // Y2 (DESIGN-Y row 8, TOLLBOOTH): with the switch on its belt's factory is covered from ★1 (off: ★3 FACTORY GUARD only)
    const toll = stun && s.gates.find((gate) => gate.online && !gate.wrecked && gate.disrupted <= 0 && gate.frozen <= 0 && gate.tolls > 0 &&
      gate.hits.some((h) => routeIds.includes(h.route)) &&
      (t.kind !== "factory" || starRules() || gate.def.gate?.tollFactory));
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
    // Y2 (DESIGN-Y row 14, MANTLET): with the switch on a guarded tile's rigs no longer share its turret's immunity
    if (g && !starRules() && g.hits.some((h) => this.skirted(s, s.routes[h.route], h.tile, cause))) return false;
    if (stun) this.sides[s.side === 0 ? 1 : 0].harassAccepted++; // Y2: with the switch on, a STUN only
    if ((cause === "sabot" || cause === "wreck") && t.kind === "gate") this.sides[s.side === 0 ? 1 : 0].wreckAccepted++;
    this.events.push({ type: "harass", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell, cause });
    return true;
  }

  /**
   * 0.8.0 P1, BRACE FRAME: the seconds an enemy STUN (NUM-3: every source) lasts on a tile working braces `list` hit (or
   * on a brace itself): x the best working brace's multiplier there, its plated one while the hull holds plating. A
   * `brace` event names the brace and the seconds it saved. The harassment is accepted first, so it still counts
   * (an enemy SCRAPPER's stamp). Only a side holding a brace comes here.
   */
  private braceCut(s: SideState, list: readonly GateState[] | undefined, secs: number): number {
    if (!list?.length) return secs;
    // Y2 (DESIGN-Y row 16, BRACE FRAME): with the switch on the plated multiplier goes: its `mul` whatever the hull holds
    const plated = s.plate.plate > 0 && !starRules();
    let best: GateState | undefined, mul = 1;
    for (const g of list) {
      if (!g.online || g.wrecked || g.disrupted > 0 || g.frozen > 0) continue;
      const m = plated ? g.def.gate!.brace!.plated : g.def.gate!.brace!.mul;
      if (m < mul) { mul = m; best = g; }
    }
    if (!best) return secs;
    this.events.push({ type: "brace", side: s.side, gate: best.uid, saved: secs - secs * mul });
    return secs * mul;
  }

  /** BRACE FRAME: the braces covering target t (a belt tile's, or t itself when it is a brace); undefined for none. */
  private bracesAt(s: SideState, t: Target): readonly GateState[] | undefined {
    if (t.kind === "belt") return s.routes[t.ref]?.braces?.[t.cell];
    if (t.kind === "gate") {
      if (starRules()) return undefined; // Y2 (DESIGN-Y row 16): with the switch on a frame no longer braces itself
      const g = s.gates.find((x) => x.uid === t.ref);
      return g?.def.gate?.brace ? [g] : undefined;
    }
    return undefined;
  }

  private disrupt(s: SideState, t: Target, secs = DISRUPT_TIME, cause: HarassCause = "shock"): boolean {
    if (secs <= 0 || !this.acceptHarassment(s, t, cause)) return false;
    if (s.braced) secs = this.braceCut(s, this.bracesAt(s, t), secs); // 0.8.0 P1: BRACE FRAME
    if (s.rune?.stallCut) secs *= Math.max(0, 1 - s.rune.stallCut / 100); // RUNES-2a: STEADY IRON, a STALL n% shorter
    secs = stunTicks(secs) * TICK; // NUM-3 (REQ-BFG-047): a whole number of ticks, after the cuts (stunLeft ends it on its tick)
    if (t.kind === "gate") s.gates.find((g) => g.uid === t.ref)!.disrupted = Math.max(s.gates.find((g) => g.uid === t.ref)!.disrupted, secs);
    else if (t.kind === "factory") s.factories.find((f) => f.uid === t.ref)!.disrupted = Math.max(s.factories.find((f) => f.uid === t.ref)!.disrupted, secs);
    else if (t.kind === "turret") turretAt(s, t.ref)!.disrupted = Math.max(turretAt(s, t.ref)!.disrupted, secs);
    else if (t.kind === "belt") s.routes[t.ref].cellDisrupt[t.cell] = Math.max(s.routes[t.ref].cellDisrupt[t.cell], secs);
    this.events.push({ type: "disrupt", side: s.side, kind: t.kind, ref: t.ref, cell: t.cell });
    return true;
  }

  /**
   * NUM-3 (R1's STUN fold, REQ-BFG-046): a SABOT round wrecks a rig and STUNs any other part (one STUN, `round.seconds`;
   * was a stall of 5 / 4 / 3 s by belt tile / factory / turret); a FROSTBITE round STUNs the part it hits (and its
   * HOARFROST spread; was a freeze with CHILL); a DRAG CHAIN round STUNs the part it hits (was a belt slow over a rig-to-rig
   * stretch with SNAG, or a factory +0.8 s / turret +0.5 s delay). Each STUN goes through `disrupt`, so it is one timer
   * with one meaning: TOLLBOOTH, MANTLET, BRACE FRAME, STEADY IRON and SUS-A's pauses read it alike.
   */
  private roundImpact(s: SideState, t: Target, round: HarassRound, from: Side, debuffs?: PayloadDebuffs): void {
    if (round.kind === "sabot") {
      let landed = false;
      if (t.kind === "gate") {
        // Y2 (release Y; the shared rule): with the switch on, a wreck is its own cause, "wreck", never a STUN
        if (!this.acceptHarassment(s, t, starRules() ? "wreck" : "sabot")) return;
        s.gates.find((g) => g.uid === t.ref)!.wrecked = true;
        landed = true;
      } else if (t.kind === "belt") {
        if (!this.disrupt(s, t, round.seconds, "sabot")) return;
        landed = true;
      } else if (t.kind === "factory" || t.kind === "turret") {
        if (!this.disrupt(s, t, round.seconds, "sabot")) return;
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
      if (this.disrupt(s, t, round.seconds, "freeze") && round.spread)
        for (const other of this.nearestMachines(s, t, round.spread)) this.disrupt(s, other, round.seconds, "freeze");
    } else if (round.kind === "drag") {
      this.disrupt(s, t, round.seconds, "drag");
    } else {
      s.limpets.push({ at: this.t + round.delay, target: t, from, blast: debuffedDamage(round.blast, debuffs), stall: round.stall ?? 0 });
    }
  }

  /** Grapnel candidates use route distance, then route index and payload id for stable ties. */
  private rip(s: SideState, t: Target, count: number, reach: number): number {
    if (count <= 0 || reach < 0 || (t.kind !== "belt" && t.kind !== "gate")) return 0;
    // Y2 (DESIGN-Y row 19): with the switch on a hit POWDER KEG is no longer disarmed (a rig like any other: the slugs by
    // its arrows' tiles are ripped)
    const keg = t.kind === "gate" && !starRules() ? s.gates.find((g) => g.uid === t.ref && !!g.def.gate?.keg) : undefined;
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
      if (c.ammo.hold) { // 0.8.0 P1 (E4): a ripped payload frees its latch arrow
        const l = c.ammo.hold.g.latch!;
        l.held[c.ammo.hold.arrow] = null;
        l.at[c.ammo.hold.arrow] = null;
      }
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
    if (!a || !this.acceptHarassment(s, t, mark)) return false; // NUM-3: SAP is the one mark left (CHILL and SNAG are gone)
    (a.p.debuffs ??= {})[mark] = true;
    return true;
  }

  /** 0.6.1p MANTLET: cell `ci` of route `r` lies in its turret's shield (★3 BULWARK SKIRT; since 0.6.2 FB-B also ★2
   *  FULL GUARD's intake tile, was FULL PLATE) and that turret ignores `cause`. */
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
        const blast = absorb(s.plate, charge.blast); // 0.8.0 P1 (E1): plating soaks limpet blasts on every hull
        s.hull.hp -= blast;
        if (s.spall) this.spallCharge(s, blast, charge.blast - blast); // SPALL CATCHER
        s.hull.flash = 0.12;
        foe.stats.damage += charge.blast;
        if (charge.stall > 0) this.disrupt(s, charge.target, charge.stall, "limpet");
        this.events.push({ type: "limpet", side: s.side, kind: charge.target.kind, ref: charge.target.ref, cell: charge.target.cell });
      }
      // NUM-1 (REQ-BFG-047, N1 2.1): each Burn ticks once a second, BURN_DPS a stack (was dps x step every tick, which made
      // the hull fractional); a Burn whose length isn't whole (SLOW EMBERS) deals its last part when it ends, rounded half
      // up once. The same total a stack, BURN_DPS x its seconds.
      let burn = 0;
      for (const b of s.hull.burns) {
        const step = Math.min(dt, b.t);
        b.acc = (b.acc ?? 0) + step;
        b.t -= dt;
        if (b.acc >= 1 - 1e-9) {
          burn += b.dps * BURN_DPS;
          b.acc -= 1;
        } else if (b.t <= 0 && b.acc > 1e-6) burn += roundHalfUp(b.dps * BURN_DPS * b.acc);
      }
      s.hull.burns = s.hull.burns.filter((b) => b.t > 0);
      // RUNES-2a: PYRE HEART (the foe's BURN on this hull deals n% more), ASH CLOAK (this hull's runes: n% less). NUM-1: the
      // two whole %s multiply the tick once, rounded half up once
      if (burn > 0 && (foe.rune?.burnPct || s.rune?.burnCut)) burn = pct(burn, (100 + (foe.rune?.burnPct ?? 0)) * Math.max(0, 100 - (s.rune?.burnCut ?? 0)) / 100);
      if (burn > 0) {
        const burnt = absorb(s.plate, burn); // races: plating soaks Burn (not the wind); 0.8.0 P1 (E1): on every hull
        s.hull.hp -= burnt;
        if (s.spall) this.spallCharge(s, burnt, burn - burnt); // SPALL CATCHER
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
        // NUM-1 (REQ-BFG-047): poison ticks once a second, 4 a stack (x10 of 0.4 a stack each second; was x dt every tick);
        // the part-second left when it runs out is dealt then, rounded half up once
        const po = s.hull.poison;
        po.acc = (po.acc ?? 0) + Math.min(dt, po.t);
        let damage = 0;
        if (po.acc >= 1 - 1e-9) {
          damage = po.stacks * 4;
          po.acc -= 1;
        } else if (po.t - dt <= 0 && po.acc > 1e-6) {
          damage = roundHalfUp(po.stacks * 4 * po.acc);
          po.acc = 0;
        }
        s.hull.poison.t = Math.max(0, s.hull.poison.t - dt);
        const poisoned = absorb(s.plate, damage); // 0.8.0 P1 (E1): plating soaks poison ticks on every hull
        s.hull.hp -= poisoned;
        if (s.spall) this.spallCharge(s, poisoned, damage - poisoned); // SPALL CATCHER
        foe.stats.damage += damage;
        if (damage > 0) this.events.push({ type: "poison", side: s.side, dmg: damage });
        if (s.hull.poison.t === 0) { s.hull.poison.stacks = 0; po.acc = 0; }
      }
    }
    if (!this.windWarned && this.t >= WIND_WARN) {
      this.windWarned = true;
      this.events.push({ type: "windwarn" });
    }
    if (this.t >= WIND_START) {
      // NUM-1 (REQ-BFG-047, N1 2.1): the dark wind x10, in whole ticks: once a second (the old `wind` event's beat) both
      // hulls take what the wind blew since the last tick (windDps x the seconds), rounded half up once
      this.windDue += this.windDps() * dt;
      this.windTick += dt;
      if (this.windTick >= 1) {
        this.windTick -= 1;
        const dmg = roundHalfUp(this.windDue);
        this.windDue = 0;
        for (const s of this.sides) {
          s.hull.hp -= dmg;
          s.stats.windTaken += dmg;
        }
        this.events.push({ type: "wind", dmg });
      }
    }
  }

  windDps(): number {
    if (this.t < WIND_START) return 0;
    return 10 * (1 + Math.floor((this.t - WIND_START) / 5)); // NUM-1: x10 (10 a second, +10 every 5 s)
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
    const fs = f && ITEMS[f.def]?.kind === "factory" ? effectAt(f.def, gradeOf(b, f)).factory : undefined;
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
 *  starting SCRAP CANNON's 0.6.1 cadence exactly). 0.6.2s: a share, so a bought or starred turret keeps its own pace.
 *  NUM-2 (REQ-BFG-047, N1 2.3): a whole rate %, 39% faster (the interval x 100 / 139 = 0.7194; was x0.72, the hero
 *  select's "39%"), in the turret's one rounding (makeTurret). */
export const FURNACE_LONG_BELT = 39;

/** NUM-2 (REQ-BFG-047): set a turret's unrounded speed, and from it the whole speed (rounded half up once) and the
 *  interval the battle uses (30 / speed). */
export function setSpeed(tu: Pick<TurretState, "speed" | "speedRaw" | "interval">, raw: number): void {
  tu.speedRaw = raw;
  tu.speed = Math.max(1, roundHalfUp(raw));
  tu.interval = secPer(tu.speed);
}

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

/**
 * bb-0.8.3 (REQ-BFG-042 D4): the loads one cast (or stamp) of a factory with `belts` belts sends into a turret that `into`
 * of them reach: the STOKER cap's forecast (Battle.makeSide's perStamp). A stamp feeds its belts one at a time, in turn
 * (into / belts); a pour of `pour` slugs (FactorySpec.pour; the battle's own spec, so a MIMIC FORGE pours only where
 * factoryDef keeps it) onto no more belts than that puts one onto each, and onto more takes `pour` of them in turn (rule
 * R): pour / belts of a cast each. A pour of blanks into one gun fuses its pair into one load (at most one load a cast). A
 * batch sends its slugs. 0.8.0's model is this at 0.8.0's belt counts.
 */
export function loadsPerStamp(spec: FactorySpec, belts: number, into: number): number {
  const n = Math.max(1, belts), share = spec.pour ? Math.min(1, spec.pour / n) : 1 / n;
  const loads = spec.ammo === "blank" && spec.pour ? Math.min(1, into * share) : into * share;
  return loads * (spec.batch ?? 1);
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
  // NUM-2 (REQ-BFG-047, N1 2.2-2.3): the turret's speed x each whole rate % it has (its gear: CALIBRATION, ESCAPEMENT; its
  // core: ROTARY; E1's long belt), rounded half up once: the speed the battle uses; its interval is 30 / that speed
  const speedRaw = def.speed * g.speedMul * (longFurnaceBelt ? rateMul(FURNACE_LONG_BELT) : 1) * rateMul(c.fireRate);
  const speed = Math.max(1, roundHalfUp(speedRaw));
  const windowTime = c.windowTime ?? WINDOW_TIME;
  return {
    index: i, def, stack: [], phase: "load", loadTimer: 0, fireCd: 0, jamSkip: 0, jamRandom: false,
    jamCd: 0, disrupted: 0, frozen: 0, perShot: g.perShot, interval: secPer(speed), speed, speedRaw, recoil: 0, jamFx: 0,
    // 0.6.1p: EXT. CHAMBER ★2/★3 and HOPPER add window slots; HOPPER adds seconds to the core's window time (a
    // GATLING never reads windowTime, cores.ts gatlingReady, so there HOPPER's seconds do nothing; its slots count)
    // 0.8.0 P1: TWIN TRIGGER's load time is shorter (a negative windowTime), never below LOAD_FLOOR; HOPPER's longer one
    // is always above it, so every older turret's load time is unchanged
    waiting: 0, core, window: def.window + g.window, windowTime: g.windowTime ? Math.max(LOAD_FLOOR, windowTime + g.windowTime) : windowTime,
    spin: 1 / rateMul(c.start), lastShot: -1, // NUM-2: GATLING's first spin, its whole rate % as an interval share
    store: [], storeMax: g.store, // 0.6.2 FB-B: HOPPER ★2/★3
    noJam: g.noJam, immune: g.immune, intakeGuard: g.intakeGuard, finisher: g.finisher, intercept: g.intercept,
    rerolls: g.rerolls, factoryWeight: g.factoryWeight, alwaysMachine: g.alwaysMachine, charge: 0, salvage: 0,
    longRideFlat: g.longRideFlat, longRideMin: g.longRideMin,
    // 0.8.0 P1, wave 3's gear (absent without it): E2's pair reader, TWIN TRIGGER, SEAM WELDER, SPALL CATCHER
    ...(g.pairBonus || g.seam ? { pairing: true } : {}),
    ...(g.pairBonus ? { pairBonus: g.pairBonus } : {}),
    ...(g.seam ? { seam: g.seam } : {}),
    ...(g.spall ? { spall: g.spall, spallCharge: 0 } : {}),
    // SUS-A (REQ-BFG-069): WARD BELL (its first SHIELD at t = every) and MENDING LOOM (absent without them)
    ...(g.shield ? { bell: { every: g.shield.every, amount: g.shield.amount, timer: g.shield.every } } : {}),
    ...(g.regen ? { regen: g.regen } : {}),
  };
}

/** 0.8.0 P1: the shortest load time gear can give a turret (TWIN TRIGGER, DESIGN-wave3.md 3.3 module 13). */
export const LOAD_FLOOR = 0.3;

/** 0.8.0 P1 (STOKER's cap): the share of a turret's pace a stoke leaves free when several factories feed the turret. */
export const SHARED_HEADROOM = 0.1;

/**
 * 0.8.0 P1 (STOKER's cap): the seconds turret tu takes for each load when it fires flat out, read live: its interval
 * (stars, CALIBRATION and a ROTARY's multiplier included) x its core's cadence now (STEAM BREECH plated or bare, a GATLING's
 * spin), over the loads a shot takes (EXT. CHAMBER; a COMPOUND packs 2; a SALVO fires its whole chamber, then reloads).
 */
export function loadPace(tu: TurretState): number {
  const routine = tu.core.routine;
  if (routine === "salvo") return salvoReload(tu) / Math.max(1, tu.window); // Y4 (S1): cores.ts salvoReload (off: interval x reloadMul)
  let cd = tu.interval;
  if (routine === "steam") cd = steamInterval(tu); // NUM-2: 30 / its whole speed now (cores.ts)
  else if (routine === "gatling") cd = spinInterval(tu);
  return cd / Math.max(1, routine === "compound" ? 2 * tu.perShot : tu.perShot);
}

/** 0.6.1p: turret i's gear at its stars, folded (makeTurret; the inspector and the cruiser art read it too). */
export interface GearStats {
  perShot: number; // payloads per firing opportunity (the most any gear gives, at least 1)
  speedMul: number; // NUM-2 (REQ-BFG-047): x the speed, the product of the gear's (100 + fireRate) / 100 (was fireMul, x the interval)
  window: number; // + window slots
  windowTime: number; // + window seconds
  store: number; // HOPPER ★2/★3 (0.6.2 FB-B): loads held while the gun fires
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
  // 0.8.0 P1, wave 3's gear (pairBonus 0 and the rest absent without it):
  pairBonus: number; // TWIN TRIGGER
  seam?: { pair: number; lone: number }; // SEAM WELDER
  spall?: { every: number; add: number; max?: number }; // SPALL CATCHER (Y5: no max with the star switch on)
  // SUS-A (REQ-BFG-069; absent without them):
  shield?: { every: number; amount: number }; // WARD BELL
  regen?: number; // MENDING LOOM
}

export function gearStats(b: Build, i: number): GearStats {
  const out: GearStats = { perShot: 1, speedMul: 1, window: 0, windowTime: 0, store: 0, noJam: false, immune: [], intakeGuard: 0,
    finisher: 0, intercept: 0, rerolls: 0, factoryWeight: 1, alwaysMachine: false, longRideFlat: 0, longRideMin: 0, pairBonus: 0 };
  for (const m of b.mods.filter((m) => m.turret === i)) {
    const md = ITEMS[m.def] ? effectAt(m.def, starsOf(m)).mod : undefined; // 0.6.1a: mod spec at its stars (a core has none)
    if (md?.perShot) out.perShot = Math.max(out.perShot, md.perShot);
    if (md?.fireRate) out.speedMul *= rateMul(md.fireRate); // NUM-2: a whole rate % (CALIBRATION, ESCAPEMENT)
    if (md?.window) out.window += md.window;
    if (md?.windowTime) out.windowTime += md.windowTime;
    if (md?.store) out.store = Math.max(out.store, md.store); // 0.6.2 FB-B: HOPPER ★2/★3
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
    if (md?.pairBonus) out.pairBonus = Math.max(out.pairBonus, md.pairBonus); // 0.8.0 P1: TWIN TRIGGER
    if (md?.seam) out.seam = md.seam; // SEAM WELDER (a turret holds one copy of a def)
    if (md?.spall) out.spall = md.spall; // SPALL CATCHER
    if (md?.shield) out.shield = md.shield; // SUS-A: WARD BELL (a turret holds one copy of a def)
    if (md?.regen) out.regen = md.regen; // SUS-A: MENDING LOOM
  }
  return out;
}

/** Headless run to completion (tests / balance). */
export function simulate(player: Build, enemy: Build, seed: number, maxTicks = 60 * 200, wins?: readonly [number, number]): Battle {
  const b = new Battle(player, enemy, seed, wins); // RUNES-2a: `wins` for WARLORD'S DUE (Battle's constructor)
  while (!b.over && b.ticks < maxTicks) {
    b.step();
    b.events.length = 0;
  }
  return b;
}
