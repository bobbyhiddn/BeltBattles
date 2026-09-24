// Content definitions — all rules data lives here, separate from presentation.
// Values are first-playable design values, not finished balance (spec §13, §24).

import { RACE_AMMO, RACE_HEROES, RACE_ITEMS, type RaceAmmoKind, type RaceHeroId } from "./races/data"; // races:

// bb-0.4.0: hulls +33% (and warlord hull steps / plating to match) so rounds 1-3 last
// 20-45 s at 1x instead of 16-18 s; every win/loss in the balance probe is unchanged.
export const RULES_VERSION = "bb-0.4.0";

export const CELL = 12; // world pixels per deck cell
export const GRID = 10; // 10x10 construction envelope
export const TICK = 1 / 60; // fixed simulation step (s)

export const BELT_SPEED = 30; // px per second at speed state 1.0
export const AMMO_SPACING = 7; // minimum distance between payloads on a belt (px)
export const WINDOW_TIME = 1.5; // chamber loading window closes this long after first load (s)
export const JAM_THRESHOLD = 4; // payloads backed up at a busy chamber before it jams
export const JAM_COOLDOWN = 3.0;
export const DISRUPT_TIME = 1.6; // Shock disruption duration (s)
export const BURN_TIME = 3.0; // each Burn stack deals 1 dmg/s for this long
export const FRAY_BONUS = 0.2; // extra damage per Fray stack on every later hit
export const FRAY_MAX = 15;
export const WIND_WARN = 20; // dark wind warning (s)
export const WIND_START = 25; // dark wind damage begins (s)
export const BATTLE_CAP = 120; // hard stop (s)
export const COMMISSION_BASE = 1.2; // first gate on a route comes online at this time (s)
export const COMMISSION_STEP = 0.6; // each further gate on the route adds this delay (s)

export type Rarity = "common" | "rare" | "epic" | "legendary";
// 0.6.1b: "core" is a turret core (ARSENAL.md §1): it lives in Build.mods, one socket per turret, beside the one mod
export type ItemKind = "gate" | "factory" | "mod" | "supply" | "core";
export type AmmoKind = "cinder" | "thread" | "plain" | RaceAmmoKind; // races: blank, alloy, bulwark, pendulum, leeches
export type HeroId = "furnace" | "weaver" | RaceHeroId; // races: foundry, bastion, metronome, siphon
export type Faction = "orc" | "elf" | "human" | "dwarf" | "beastfolk" | "unaligned"; // races: spec §6.2
export type TurretKind = "heavy" | "light" | "medium" | "adaptable"; // races: medium (FOUNDRY), adaptable (METRONOME)
export type MerchantId =
  | "ironmonger" | "tinker" | "alchemist" | "gunsmith"
  | "scrapper" | "quartermaster" | "arcane"; // 0.6.1d: ARSENAL wave 1 merchants (stock lands in a later job)

export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

/**
 * 0.6.2 BELTSIDE (ref/DESIGN-beltside.md R2-R3): a gate is a RIG on its own deck cell beside the belt, and
 * its arrows act on the belt tiles they point at. The shape is part of a rig def's identity: its arrows
 * in local directions at rotation 0 (0 forward, 1 = +x, 2 back, 3 = -x, as in deck.ts). A def without
 * `shape` takes RARITY_SHAPE[rarity]; a rare def picks II or L.
 */
export type RigShape = "I" | "II" | "L" | "T" | "X";
export const SHAPE_ARROWS: Record<RigShape, readonly number[]> = {
  I: [0], // one arrow
  II: [1, 3], // a straight pair, left and right
  L: [0, 1], // a bent pair
  T: [0, 1, 3], // three arrows
  X: [0, 1, 2, 3], // all four sides; ignores rotation
};
/** R2: arrows follow rarity. The default shape of each rarity. */
export const RARITY_SHAPE: Record<Rarity, RigShape> = { common: "I", rare: "II", epic: "T", legendary: "X" };
export const RARITY_ARROWS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };

export interface GateEffect {
  burn?: number; // Burn stacks added
  shock?: boolean; // impact disrupts struck machinery
  flat?: number; // flat damage added
  perPriorGate?: number; // damage per gate already visited (Long Haul)
  speed?: number; // downstream speed state (later state wins)
  split?: { copies: number; mult: number }; // Splitter
}

export interface FactorySpec {
  ammo: AmmoKind;
  interval: number; // seconds per stamp
  outputs: number; // routes it can feed
}

export interface ModSpec {
  fireMul?: number; // multiplies firing interval
  perShot?: number; // payloads per firing opportunity
}

/** 0.6.1b: how a turret fires (ARSENAL.md §2). "identity" is today's firing: every hero's signature core. */
export type CoreRoutine = "identity" | "scatter" | "rotary" | "pressure" | "gatling" | "hullbreaker" | "drake" | "salvo";

/**
 * 0.6.1b: a turret core's routine and numbers, written at heavy scale (ARSENAL.md §2.1 rule 4). The sim
 * (src/sim/cores.ts scaleCore) multiplies the absolute per-shot numbers (perQueued, volleyFlat, addBurn) by
 * the turret's classFactor; ratios, counts, cadence multipliers and times are not scaled.
 */
export interface CoreSpec {
  routine: CoreRoutine;
  pellets?: number; // SCATTER: pellets per payload, each aimed anew
  share?: number; // SCATTER: each pellet's share of the payload's damage
  order?: "LIFO" | "FIFO"; // ROTARY: which load fires first (identity: LIFO)
  windowTime?: number; // ROTARY: the window closes this long after its first load (s), instead of WINDOW_TIME
  intervalMul?: number; // ROTARY: x the fire interval
  noJam?: boolean; // ROTARY 3 stars, PRESSURE: never jams
  perQueued?: number; // PRESSURE: flat damage per payload queued at the turret (absolute)
  maxCount?: number; // PRESSURE: payloads counted at most
  start?: number; // GATLING: interval multiplier before any spin
  step?: number; // GATLING: each quick shot cuts the multiplier by this
  floor?: number; // GATLING: the lowest multiplier
  gap?: number; // GATLING: a shot within this many seconds of the last is quick; a longer gap halves the spin
  hullMul?: number; // HULLBREAKER: x damage; every shot hits bare hull
  flatPerBurn?: number; // DRAKE: flat damage converted per Burn stack (rounded down)
  addBurn?: number; // DRAKE: Burn stacks added per shot (absolute: x k, rounded half up, at least 1)
  burnTime?: number; // DRAKE: the Burn this turret lands lasts this long (s), instead of BURN_TIME
  flightMul?: number; // DRAKE: x flight time (a short spout)
  volleyFlat?: number; // SALVO: flat damage per volley shell (absolute)
  reloadMul?: number; // SALVO: x the fire interval after a volley
}

/** 0.6.1b: the shop tags (catalogue.json "tags"); a shop hint only, no tag-count bonus (ARSENAL-DECISIONS call 10). */
export type ModuleTag = "BURN" | "SHOCK" | "POISON" | "FRAY" | "EDGE" | "SPEED" | "HAUL" | "SPLIT" | "BURST" | "HARASS" | "GUARD" | "TIMING" | "VOLUME";

/**
 * 0.6.1a: the 2-star or 3-star override of a fusible module (ARSENAL.md §4.3, catalogue.json star2/star3).
 * gate/factory/mod are merged over the 1-star spec by stars.ts:effectAt (levels 2 then 3, so a 2-star
 * value carries to 3 stars unless 3 restates it). `pending` holds star values the 0.6.1a sim does not
 * read yet (they need a new field or code path; a later job implements them). `perk` names the perk.
 */
export interface ItemLevel {
  gate?: Partial<GateEffect>;
  factory?: Partial<FactorySpec>;
  mod?: Partial<ModSpec>;
  core?: Partial<CoreSpec>; // 0.6.1b: a turret core's star values
  perk?: string;
  pending?: Record<string, number>;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  price: number;
  size: 1 | 2; // footprint (cells per side)
  desc: string[]; // short lines, uppercase-friendly
  merchant?: MerchantId; // who sells it (undefined = not sold)
  shape?: RigShape; // 0.6.2 BELTSIDE: a rig's arrow shape (kind "gate" only); absent = RARITY_SHAPE[rarity]
  gate?: GateEffect;
  factory?: FactorySpec;
  mod?: ModSpec;
  core?: CoreSpec; // 0.6.1b: a turret core's firing routine (kind "core")
  supply?: { belt?: number; hull?: number };
  levels?: { 2?: ItemLevel; 3?: ItemLevel }; // 0.6.1a: star overrides (1 star = the spec above)
  tags?: ModuleTag[]; // 0.6.1b: catalogue.json tags (set on the cores; a shop hint only)
}

export const ITEMS: Record<string, ItemDef> = {
  // --- signature factories (not sold) ---
  kiln: {
    id: "kiln", name: "KILN", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["STAMPS CINDER SLUGS.", "SLUGS HEAT UP WHILE", "THEY RIDE THE BELT."],
    factory: { ammo: "cinder", interval: 1.25, outputs: 1 },
  },
  loom: {
    id: "loom", name: "LOOM", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["WEAVES THREAD SLUGS", "INTO UP TO 3 ROUTES.", "HITS STACK FRAY."],
    factory: { ammo: "thread", interval: 0.72, outputs: 3 },
  },
  // --- generic factory ---
  press: {
    id: "press", name: "STAMP PRESS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "ironmonger",
    desc: ["STAMPS PLAIN SLUGS", "EVERY 1.4S. NEEDS A", "FREE TURRET INTAKE."],
    factory: { ammo: "plain", interval: 1.4, outputs: 1 },
    levels: {
      2: { factory: { interval: 1.1 }, pending: { base: 5 }, perk: "HARDENED DIES" },
      3: { factory: { interval: 1 }, pending: { base: 7.5 }, perk: "MASTER DIES" },
    },
  },
  // --- processing gates ---
  temper: {
    id: "temper", name: "TEMPER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    desc: ["ADDS 2 BURN.", "BURN: 1 DMG/S FOR 3S", "PER STACK ON HIT."],
    gate: { burn: 2 },
    levels: { 2: { gate: { burn: 4 } }, 3: { gate: { burn: 7 } } },
  },
  whetstone: {
    id: "whetstone", name: "WHETSTONE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    desc: ["+2 FLAT DAMAGE.", "BEFORE A SPLITTER,", "BOTH COPIES GAIN IT."],
    gate: { flat: 2 },
    levels: { 2: { gate: { flat: 4 } }, 3: { gate: { flat: 7 } } },
  },
  grease: {
    id: "grease", name: "GREASE WORKS", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker",
    desc: ["BELT RUNS 1.6X FROM", "THE TILE IT HITS ON.", "LATER SPEED WINS."],
    gate: { speed: 1.6 },
    levels: { 2: { gate: { speed: 2.3 } }, 3: { gate: { speed: 3.1 } } },
  },
  brake: {
    id: "brake", name: "BRAKE SHOE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker",
    desc: ["BELT RUNS AT HALF", "SPEED FROM THE TILE", "IT HITS. SLOW COOK."],
    gate: { speed: 0.5 },
    levels: { 2: { gate: { speed: 0.31 } }, 3: { gate: { speed: 0.22 } } },
  },
  longhaul: {
    id: "longhaul", name: "LONG HAUL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "tinker", shape: "II",
    desc: ["+2 DAMAGE FOR EACH", "HIT THE PAYLOAD", "ALREADY TOOK."],
    gate: { perPriorGate: 2 },
    levels: {
      2: { gate: { perPriorGate: 4 }, pending: { priorCap: 6 } },
      3: { gate: { perPriorGate: 7 }, pending: { priorCap: 6 } },
    },
  },
  coil: {
    id: "coil", name: "GALVANIC COIL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist", shape: "L",
    desc: ["ADDS SHOCK. A SHOCK", "HIT STALLS THE ENEMY", "MACHINE IT STRIKES."],
    gate: { shock: true },
    levels: {
      2: { pending: { shock: 1.8, jump: 1 }, perk: "SPARK JUMP" },
      3: { pending: { shock: 2.8, jump: 1 }, perk: "SPARK JUMP" },
    },
  },
  splitter: {
    id: "splitter", name: "SPLITTER", kind: "gate", rarity: "epic", price: 7, size: 1, merchant: "tinker", shape: "T",
    desc: ["SPLITS A PAYLOAD IN", "TWO COPIES AT 60%.", "MORE BELT PRESSURE."],
    gate: { split: { copies: 2, mult: 0.6 } },
    levels: {
      2: { gate: { split: { copies: 2, mult: 0.72 } }, perk: "CLEAN CUT" },
      // THREE-WAY (3 copies at 57%) is pending: until then 3 stars split like 2 (CLEAN CUT)
      3: { pending: { copies: 3, mult: 0.57 }, perk: "THREE-WAY" },
    },
  },
  overdrive: {
    id: "overdrive", name: "OVERDRIVE", kind: "gate", rarity: "legendary", price: 10, size: 1, merchant: "tinker", shape: "X",
    desc: ["4 ARROWS: EACH BELT", "IT HITS RUNS 3X", "FROM THAT TILE ON."],
    gate: { speed: 3 },
    levels: {
      2: { gate: { speed: 4 }, perk: "REDLINE" },
      3: { gate: { speed: 5 }, pending: { flat: 3 }, perk: "AFTERBURNER" },
    },
  },
  // --- turret equipment ---
  chamber: {
    id: "chamber", name: "EXT. CHAMBER", kind: "mod", rarity: "epic", price: 7, size: 1, merchant: "gunsmith",
    desc: ["TURRET FIRES TWO", "PAYLOADS PER SHOT.", "DROP ON A TURRET."],
    mod: { perShot: 2 },
    levels: {
      2: { mod: { perShot: 2 }, pending: { window: 1 }, perk: "WIDE BREECH" },
      3: { mod: { perShot: 3 }, pending: { window: 1 }, perk: "TRIPLE BREECH" },
    },
  },
  calibrate: {
    id: "calibrate", name: "CALIBRATION", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    desc: ["TURRET FIRES 25%", "FASTER.", "DROP ON A TURRET."],
    mod: { fireMul: 0.75 },
    levels: { 2: { mod: { fireMul: 0.58 } }, 3: { mod: { fireMul: 0.46 } } },
  },
  // --- turret cores (0.6.1b, ARSENAL.md §2.3, catalogue.json): one socket per turret; numbers at heavy scale ---
  scatter: {
    id: "scatter", name: "SCATTER CHOKE", kind: "core", rarity: "common", price: 4, size: 1, merchant: "gunsmith",
    desc: ["SHOTS BURST INTO 3", "PELLETS AT 40%, EACH", "AIMED ANEW."], tags: ["SPLIT", "FRAY"],
    core: { routine: "scatter", pellets: 3, share: 0.4 },
    levels: { 2: { core: { pellets: 3, share: 0.48 } }, 3: { core: { pellets: 4, share: 0.42 } } },
  },
  rotary: {
    id: "rotary", name: "ROTARY BREECH", kind: "core", rarity: "common", price: 3, size: 1, merchant: "tinker",
    desc: ["FIRES THE OLDEST", "LOAD FIRST. WINDOWS", "CLOSE IN 0.8S."], tags: ["TIMING"],
    core: { routine: "rotary", order: "FIFO", windowTime: 0.8 },
    levels: {
      2: { core: { intervalMul: 0.85 }, perk: "GREASED RACE" },
      3: { core: { intervalMul: 0.7, noJam: true }, perk: "CLEAN FEED" },
    },
  },
  pressure: {
    id: "pressure", name: "PRESSURE BREECH", kind: "core", rarity: "common", price: 4, size: 1, merchant: "tinker",
    desc: ["+1.2 DAMAGE PER", "PAYLOAD QUEUED AT", "IT. NEVER JAMS."], tags: ["BURST", "VOLUME"],
    core: { routine: "pressure", perQueued: 1.2, maxCount: 5, noJam: true },
    levels: { 2: { core: { perQueued: 2.6 } }, 3: { core: { perQueued: 4.2 } } },
  },
  gatling: {
    id: "gatling", name: "GATLING SPOOL", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "gunsmith",
    // no loading window: a Prime-approved deviation from catalogue row 4 (oracle 5624d721a73a6282; cores.ts gatlingReady)
    desc: ["NEVER WAITS: FIRES", "EACH LOAD AT ONCE.", "EACH QUICK SHOT 6%", "FASTER, TO 0.6X."], tags: ["TIMING", "VOLUME"],
    core: { routine: "gatling", start: 1.2, step: 0.06, floor: 0.6, gap: 2.5 },
    levels: { 2: { core: { step: 0.09, floor: 0.4 } }, 3: { core: { step: 0.12, floor: 0.29 } } },
  },
  hullbreaker: {
    id: "hullbreaker", name: "HULLBREAKER", kind: "core", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    desc: ["NEVER HITS MACHINES.", "EVERY HULL HIT", "DEALS +30%."], tags: ["BURST"],
    core: { routine: "hullbreaker", hullMul: 1.3 },
    levels: { 2: { core: { hullMul: 1.66 } }, 3: { core: { hullMul: 2.05 } } },
  },
  drake: {
    id: "drake", name: "DRAKE NOZZLE", kind: "core", rarity: "rare", price: 5, size: 1, merchant: "alchemist",
    desc: ["TURNS FLAT DAMAGE", "INTO BURN. ITS FIRES", "BURN 4S, NOT 3."], tags: ["BURN"],
    core: { routine: "drake", flatPerBurn: 2, addBurn: 1, burnTime: 4, flightMul: 0.7 },
    levels: {
      2: { core: { flatPerBurn: 1.5, addBurn: 2, burnTime: 5 } },
      3: { core: { flatPerBurn: 1, addBurn: 3, burnTime: 6 } },
    },
  },
  // The catalogue's merchant is the Quartermaster, who arrives with job 0.6.1d; the Gunsmith sells it until then.
  salvo: {
    id: "salvo", name: "SALVO RACK", kind: "core", rarity: "epic", price: 7, size: 1, merchant: "gunsmith",
    desc: ["WAITS FOR A FULL", "WINDOW, THEN FIRES", "IT ALL AT +2 EACH."], tags: ["BURST"],
    core: { routine: "salvo", volleyFlat: 2, reloadMul: 1.6 },
    levels: { 2: { core: { volleyFlat: 4.4 } }, 3: { core: { volleyFlat: 7 } } },
  },
  // --- supplies (consumed on purchase) ---
  beltcrate: {
    id: "beltcrate", name: "BELT CRATE", kind: "supply", rarity: "common", price: 2, size: 1, merchant: "ironmonger",
    desc: ["+4 BELT CAPACITY.", "LONGER ROUTES COOK", "HOTTER PAYLOADS."],
    supply: { belt: 4 },
  },
  plating: {
    id: "plating", name: "ARMOR PLATING", kind: "supply", rarity: "rare", price: 5, size: 1, merchant: "ironmonger",
    desc: ["+25 MAX HULL", "FOR THE REST", "OF THE RUN."],
    supply: { hull: 25 },
  },
  ...RACE_ITEMS, // races: CRUCIBLE, WARDWORKS, CLOCKWORKS, SUMP (not sold); ESCAPEMENT, LONGCASE (beastfolk pool)
};

export interface AmmoDef {
  name: string;
  base: number; // base damage
  rideScale: number; // damage per second of eligible ride time
  fray: number; // Fray stacks applied on hit
  rideCurve?: (ride: number) => number; // races: PENDULUM SLUG; replaces base + rideScale x ride
}

export const AMMO: Record<AmmoKind, AmmoDef> = {
  cinder: { name: "CINDER SLUG", base: 4, rideScale: 1.2, fray: 0 },
  thread: { name: "THREAD SLUG", base: 3, rideScale: 0, fray: 1 },
  plain: { name: "PLAIN SLUG", base: 3, rideScale: 0, fray: 0 },
  ...RACE_AMMO, // races: ALLOY BLANK, ALLOY SLUG, BULWARK SLUG, PENDULUM SLUG, LEECH SLUGS
};

export interface TurretDef {
  col0: number; // leftmost deck column under the turret
  width: number; // columns spanned
  connectors: number[]; // deck columns (forward row) whose belts feed this turret
  kind: TurretKind; // races: was "heavy" | "light"
  fireInterval: number;
  window: number; // loading window size (LIFO stack)
  flight: number; // projectile flight time (s)
}

/**
 * 0.6.1b: a turret's class factor k = clamp(fireInterval / 1.0 s, 0.4, 1.2) (ARSENAL.md §2.1 rule 4): heavy
 * 1.0, medium 0.75, light 0.55. A core's absolute per-shot numbers are multiplied by it, so a light turret,
 * which fires about 1.8x as often, gets about the same per-second value as a heavy one.
 */
export function classFactor(t: { fireInterval: number }): number {
  return Math.min(1.2, Math.max(0.4, t.fireInterval / 1.0));
}

/**
 * 0.6.1b: a hero's signature core (ARSENAL.md §2.1 rules 1-2). It is implicit: never an ITEMS entry, never in
 * cargo, never sold, never merged. It runs the identity routine, today's firing, so a turret without a bought
 * core fights exactly as in 0.6.0.
 */
export interface SignatureCore {
  id: string;
  name: string;
}

export const SIGNATURE_CORES: Record<string, SignatureCore> = {
  kilnbreech: { id: "kilnbreech", name: "KILN BREECH" }, // FURNACE
  loomshuttle: { id: "loomshuttle", name: "LOOM SHUTTLE" }, // WEAVER
  cruciblebreech: { id: "cruciblebreech", name: "CRUCIBLE BREECH" }, // races: FOUNDRY
  bulwarkcannon: { id: "bulwarkcannon", name: "BULWARK CANNON" }, // races: BASTION
  pendulumhammer: { id: "pendulumhammer", name: "PENDULUM HAMMER" }, // races: METRONOME
  leechneedle: { id: "leechneedle", name: "LEECH NEEDLE" }, // races: SIPHON
};

export interface HeroDef {
  id: HeroId;
  name: string;
  faction: Faction;
  factionName: string;
  hull: number;
  factory: string;
  ammo: AmmoKind;
  belt: number;
  turrets: TurretDef[];
  blurb: string[];
  pattern: string;
  // 0.6.1b: the signature core's id (SIGNATURE_CORES). Optional only because src/sim/races/data.ts (not ours
  // to edit) builds its HeroDefs without it; HEROES below sets it for every hero.
  core?: string;
}

export const HEROES: Record<HeroId, HeroDef> = {
  furnace: {
    id: "furnace", name: "FURNACE", faction: "orc", factionName: "ORC WARBAND",
    hull: 200, factory: "kiln", ammo: "cinder", belt: 14,
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "heavy", fireInterval: 1.0, window: 3, flight: 0.6 }],
    blurb: ["KILN SLUGS HEAT UP ON", "THE BELT. LONGER ROUTES", "HIT HARDER, BUT LATER."],
    pattern: "DELAY TO COOK",
    core: "kilnbreech",
  },
  weaver: {
    id: "weaver", name: "WEAVER", faction: "elf", factionName: "ELVEN SKYWRIGHTS",
    hull: 180, factory: "loom", ammo: "thread", belt: 24,
    turrets: [
      { col0: 0, width: 2, connectors: [1], kind: "light", fireInterval: 0.55, window: 2, flight: 0.34 },
      { col0: 4, width: 2, connectors: [4], kind: "light", fireInterval: 0.55, window: 2, flight: 0.34 },
      { col0: 8, width: 2, connectors: [8], kind: "light", fireInterval: 0.55, window: 2, flight: 0.34 },
    ],
    blurb: ["THE LOOM FEEDS THREE", "LIGHT TURRETS. EVERY", "HIT FRAYS THE HULL."],
    pattern: "STEADY PRESSURE",
    core: "loomshuttle",
  },
  ...RACE_HEROES, // races: FOUNDRY (human), BASTION (dwarf), METRONOME (beastfolk), SIPHON — docs/RACES.md
  // 0.6.1b: the race heroes' signature cores, set on copies (races/data.ts stays as it is)
  foundry: { ...RACE_HEROES.foundry, core: "cruciblebreech" },
  bastion: { ...RACE_HEROES.bastion, core: "bulwarkcannon" },
  metronome: { ...RACE_HEROES.metronome, core: "pendulumhammer" },
  siphon: { ...RACE_HEROES.siphon, core: "leechneedle" },
};

export interface MerchantDef {
  id: MerchantId;
  name: string;
}

export const MERCHANTS: Record<MerchantId, MerchantDef> = {
  ironmonger: { id: "ironmonger", name: "IRONMONGER" },
  tinker: { id: "tinker", name: "TINKER" },
  alchemist: { id: "alchemist", name: "ALCHEMIST" },
  gunsmith: { id: "gunsmith", name: "GUNSMITH" },
  // 0.6.1d: no stock yet (a later job adds their parts), so itemsSoldBy is empty and rollShop's
  // merchant weight is 0 for each until then (ARSENAL.md §5.2 step 1).
  scrapper: { id: "scrapper", name: "SCRAPPER" },
  quartermaster: { id: "quartermaster", name: "QUARTERMASTER" },
  arcane: { id: "arcane", name: "ARCANE DEALER" },
};

export function itemsSoldBy(m: MerchantId): ItemDef[] {
  return Object.values(ITEMS).filter((d) => d.merchant === m);
}

// 0.6.0: a run is RUN_DAYS days (dawn caravan -> the road -> a dusk ghost). A dusk loss costs a
// life, a draw costs none; at 0 lives the run is lost, surviving day 10's dusk completes it.
export const RUN_DAYS = 10;
export const START_LIVES = 5; // tunable by the balance pass
export const START_GOLD = 8;
export const REROLL_COST = 2;
export const OFFERS = 5;

/** Gold after a dusk fight, indexed by day (0.5.0's round curve). */
export function incomeFor(day: number, won: boolean): number {
  return 6 + Math.min(day, 6) + (won ? 2 : 0);
}

export function rarityWeights(round: number): Record<Rarity, number> {
  return {
    common: Math.max(30, 64 - round * 4),
    rare: 26 + round * 2,
    epic: 8 + round * 2,
    legendary: round >= 4 ? 2 + (round - 4) * 1.5 : 0,
  };
}

/**
 * 0.6.1a: what a copy sells for, max(1, floor(valueOf(def, stars) / 2)) with valueOf = price x
 * 2^(stars - 1) (stars.ts; inlined here so content.ts imports nothing from stars.ts).
 */
export function sellValue(def: ItemDef | string, stars = 1): number {
  const d = typeof def === "string" ? ITEMS[def] : def;
  return Math.max(1, Math.floor(((d?.price ?? 0) * 2 ** (stars - 1)) / 2));
}

/** 0.6.2 BELTSIDE: a rig def's shape (its own, else its rarity's); undefined for anything that is not a rig. */
export function rigShape(def: ItemDef | string | undefined): RigShape | undefined {
  const d = typeof def === "string" ? (Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined) : def;
  if (!d || d.kind !== "gate") return undefined;
  return d.shape ?? RARITY_SHAPE[d.rarity];
}
