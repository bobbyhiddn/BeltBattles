// Content definitions — all rules data lives here, separate from presentation.
// Values are first-playable design values, not finished balance (spec §13, §24).

import { DORMANT_ITEMS, RACE_AMMO, RACE_HEROES, RACE_ITEMS, type RaceAmmoKind, type RaceHeroId } from "./races/data"; // races:

// bb-0.4.0: hulls +33% (and warlord hull steps / plating to match) so rounds 1-3 last
// 20-45 s at 1x instead of 16-18 s; every win/loss in the balance probe is unchanged.
// bb-0.6.1 (the flip): merging is live (net/validate.ts FUSE_LIVE): a deck holding two same-star
// copies of a fusible module is illegal, and the stand-in pool v2 decks carry merge stars. Ghosts
// and battle records made under older rules don't mix with these.
// bb-0.6.2 (BELTSIDE): turret slots, belt joins (JOIN PACE 0.7, at most 2 per deck), the LODESTONE floor,
// LONG HAUL 1/2/3.5, TEMPER burn 1/2/4, EASY PAY, the early-loss REFUND, SHOCK ROW and the captains' named builds.
export const RULES_VERSION = "bb-0.6.2";

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
// 0.6.2 TUNE-M, RULE JOIN PACE (the Prime's design decision): a factory whose belt joins another belt makes its loads
// at this share of its normal rate (its stamping timers run at this pace). It counts once, however long its chain; a
// factory none of whose belts joins runs as before. The join itself stays free (REQ-BFG-027).
export const JOIN_PACE = 0.7;
// 0.6.2 TUNE-M, RULE JOIN LIMIT (the Prime's decision, oracle ea0abdc95439b4d8): a deck holds at most this many joining
// belts. deck.ts joinProblem refuses the next one in route order ("2 JOINS PER DECK"); a saved deck with more keeps its
// first two, and the rest become open ends (pruneJoins on load).
export const JOIN_LIMIT = 2;

export type Rarity = "common" | "rare" | "epic" | "legendary";
// 0.6.1b: "core" is a turret core (ARSENAL.md §1): it lives in Build.mods, one socket per turret, beside the one mod
// 0.6.2s (REQ-BFG-031): "turret" is a turret: a module installed in a hull's TURRET SLOT (Build.turrets, deck.ts)
export type ItemKind = "gate" | "factory" | "mod" | "supply" | "core" | "turret";
export type AmmoKind = "cinder" | "thread" | "plain" | "shot" | "slag" | "sabot" | "frost" | "drag" | "limpet" | RaceAmmoKind;
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
  lockedFlat?: number; // damage instead of speed when this hero's belts are tempo locked
  split?: { copies: number; mult: number }; // Splitter
  // 0.6.1p: the star perks (ARSENAL.md §4.3, catalogue.json). Absent at 1 star, so 1-star decks fight as in 0.6.0.
  priorCap?: number; // LONG HAUL 2-3 stars: prior gates counted at most
  shockTime?: number; // GALVANIC COIL 2-3 stars: the stall in s (1 star: DISRUPT_TIME, 1.6 s, the catalogue's star1)
  jump?: number; // GALVANIC COIL SPARK JUMP: the spark also stalls this many nearest other machines (no RNG)
  guard?: number; // OVERDRIVE REDLINE/AFTERBURNER: GUARD_* flags on the tiles downstream (RouteState.guard)
  toll?: number; // future TOLLBOOTH: harassment hits absorbed on every route this rig reaches
  tollFactory?: boolean; // future TOLLBOOTH star 3: also protect the route's factory
  sift?: number | "all"; // future SIFTER: debuffs removed from a passing payload, in CHILL/SNAG/SAP order
  siftFlat?: number;
  siftClean?: number;
  pulse?: { speed: number; on: number; period: number; flat: number };
  sort?: { every: number; copies: number };
  repair?: number;
  heat?: number;
  poison?: number;
  overclockCooldown?: number;
  keg?: { fuse: number; flat: number; burn: number; wide?: boolean };
  burnPerRide?: { seconds: number; max: number };
  // QUENCH TANK (0.6.2 FB-B): `flat` on every payload it hits, then up to `stacks` Burn stacks become `perBurn` each;
  // Burn past `stacks` stays Burn (Battle.applyHit, deck.ts walkRoute)
  quench?: { flat: number; perBurn: number; stacks: number };
  staticTime?: number;
  perStalled?: { each: number; max: number };
  fray?: number;
  frayCap?: number;
  perTile?: { each: number; max: number };
  // 0.8.0 P1, wave 3 (output-D1/DESIGN-wave3.md 3.3; absent on every older rig, so they fight exactly as before):
  plate?: number; // PLATE ROLLER, SHIELD WALL: plating onto your hull for each payload it hits (E1, Battle.addPlate)
  plated?: { min: number; flat: number }; // SHIELD WALL: + flat on those payloads while your hull holds `min` plating or more
  gauge?: { flat: number; matched: number }; // TWIN GAUGE: + flat, or + matched on a matched belt (E6)
  pincer?: { flat: number; each: number; max: number }; // PINCER: + flat, + each for every other active rig on its tile (E5)
  brace?: { mul: number; plated: number }; // BRACE FRAME: enemy stalls, freezes and chain slows on its tiles and itself x mul (x plated while plated)
  latch?: { hold: number; flat: number }; // TWIN LATCH: holds a payload at most `hold` s for its other belt (E4); + flat on each payload it hits
  stoke?: number; // STOKER: each factory its arrows point at works this share faster (E3); its arrows do nothing to belts
  breaker?: { flat: number; floor: number }; // PLATE BREAKER: 1 plating for + flat; with none, + floor
}

/**
 * 0.6.1p: RouteState.guard flags. OVERDRIVE ★2 REDLINE sets GUARD_SLOW downstream and ★3 AFTERBURNER adds
 * GUARD_FREEZE; they act only once wave 2 adds enemy slow and freeze (nothing in wave 1 reads them). GUARD_SKIRT
 * marks a tile a MANTLET shields (★2 FULL PLATE: the last tile, 0.6.2 FB-B; ★3 BULWARK SKIRT: the last 3): the fed
 * turret's immunities cover it (Battle.disrupt).
 */
export const GUARD_SLOW = 1;
export const GUARD_FREEZE = 2;
export const GUARD_SKIRT = 4;

/** 0.6.1p: what stalls a machine (MANTLET immunities). Only "shock" exists in wave 1; wave 2 adds the rest. */
export type HarassCause = "shock" | "static" | "arc" | "drag" | "freeze" | "sabot" | "rip" | "limpet" | "sap";

export interface FactorySpec {
  ammo: AmmoKind;
  interval: number; // seconds per stamp
  outputs: number; // routes it can feed
  base?: number; // 0.6.1p: STAMP PRESS dies: base damage of its slugs (Payload.base), instead of AMMO[ammo].base
  // 0.6.1c: the wave-1 factories (catalogue.json simHook). Absent on KILN, LOOM, STAMP PRESS and every race factory,
  // so those stamp exactly as before.
  batch?: number; // DOUBLE STAMP, SHOT TOWER: slugs per cycle; the rest wait in the mouth for AMMO_SPACING (FactoryState.pending)
  cycle?: PayloadPreset[]; // HOT SWAP: each stamp writes the next preset, in turn (FactoryState.cycleIdx)
  commission?: number; // ASSEMBLY LINE: x every gate's commissionAt on its side (best wins); its own belts' gates are online at 0 s
  hotStart?: number; // ASSEMBLY LINE ★3 HOT START: its belts' gates are overclocked (x2, overclock.ts) for this many seconds
  trigger?: "harass";
  scrapFlat?: number;
  bigHaul?: boolean;
  round?: { kind: "sabot"; shrapnel?: boolean } | { kind: "frost"; seconds: number; spread: number } |
    { kind: "drag"; mul: number; seconds: number } | { kind: "limpet"; delay: number; blast: number; stall?: number };
  intervalMul?: number; // MIMIC: multiplied by the hero signature factory's interval
  // 0.8.0 P1, wave 3 (absent on every older factory):
  twin?: boolean; // TWIN MOULD: each cast pours one slug onto every belt with room on the same tick (Battle.pourAll)
  plate?: { every: number; amount: number }; // ARMOR PRESS: `amount` plating onto your hull every `every` s (FactoryState.plateTimer)
}

/** 0.6.1c HOT SWAP: what one step of the cycle writes on the slug at stamp time (catalogue.json hotswap). */
export interface PayloadPreset {
  tint: "ember" | "spark"; // render: the slug's colour (render/ammo.ts)
  burn?: number; // EMBER: Burn stacks
  shock?: boolean; // SPARK: Shock (1 star: DISRUPT_TIME, as a 1-star GALVANIC COIL)
  shockTime?: number; // SPARK 2-3 stars: the stall in s (0.6.1p's Payload.shockTime)
  jump?: number; // SPARK 2-3 stars: SPARK JUMP (0.6.1p's Payload.jump)
}

export interface ModSpec {
  fireMul?: number; // multiplies firing interval
  longRideFlat?: number; // LONGCASE: bonus on non-curve ammo after enough eligible belt ride
  longRideMin?: number; // minimum eligible ride seconds for longRideFlat
  perShot?: number; // payloads per firing opportunity
  // 0.6.1p (catalogue.json): EXT. CHAMBER WIDE BREECH, HOPPER, MANTLET and FINISHER RAM
  window?: number; // + loading window slots (TurretState.window)
  windowTime?: number; // + seconds before the window closes (TurretState.windowTime; GATLING never reads it)
  store?: number; // HOPPER ★2/★3 (0.6.2 FB-B): loads taken off the belt while the gun fires, dropped into the next window
  noJam?: boolean; // HOPPER ★3 BOTTOMLESS: this turret never jams
  immune?: HarassCause[]; // MANTLET: stalls this turret ignores (Battle.disrupt)
  intakeGuard?: number; // MANTLET ★2 FULL PLATE (1, 0.6.2 FB-B) and ★3 BULWARK SKIRT (3): the last n tiles of each route into this turret share its immunities
  finisher?: number; // FINISHER RAM: + this share of damage on the payload that empties a loading window
  intercept?: number; // future FLAK SCREEN: one side-wide intercept roll per incoming harassment projectile
  rerolls?: number;
  factoryWeight?: number;
  alwaysMachine?: boolean;
  // 0.8.0 P1, wave 3 (absent on every older mod; TWIN TRIGGER's shorter load time is a negative windowTime above):
  pairBonus?: number; // TWIN TRIGGER: paired loads (E2) deal this share more damage
  spall?: { every: number; add: number; max: number }; // SPALL CATCHER: every `every` damage taken adds `add` to the next shot, up to `max`
  seam?: { pair: number; lone: number }; // SEAM WELDER: plating for each pair this turret takes, and for each other load
}

/** 0.6.1b: how a turret fires (ARSENAL.md §2). "identity" is today's firing: every hero's signature core. */
export type CoreRoutine = "identity" | "scatter" | "rotary" | "pressure" | "gatling" | "hullbreaker" | "drake" | "salvo" |
  "mortar" | "grapnel" | "tesla" | "capacitor" | "compound" | "lance" | "anvil" | "steam"; // 0.8.0 P1: ANVIL, STEAM BREECH

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
  splash?: number; // MORTAR extra impact targets
  rip?: number; // GRAPNEL payloads removed
  reach?: number; // GRAPNEL reach in cells
  arcs?: number; // TESLA nearest machine targets
  stall?: number; // TESLA stall seconds
  perSecond?: number; // CAPACITOR flat per idle second
  maxSeconds?: number;
  mult?: number; // COMPOUND combined shell multiplier
  hold?: number; // COMPOUND maximum window seconds
  columns?: number; // LANCE struck deck columns
  // 0.8.0 P1, wave 3 (absent on every older core):
  anvilFlat?: number; // ANVIL BREECH: + this on each shot (absolute: x k)
  perPlate?: number; // ANVIL BREECH: + this for each plating on your hull, at fire time (absolute: x k)
  steamPlated?: number; // STEAM BREECH: x the fire interval while your hull holds plating
  steamBare?: number; // STEAM BREECH: x the fire interval without plating
}

/**
 * 0.6.1b: the shop tags (catalogue.json "tags"); a shop hint only, no tag-count bonus (ARSENAL-DECISIONS call 10).
 * 0.8.0 P1 (REQ-BFG-023, family map v2; output-D1/DESIGN-wave3.md section 2, the Prime's Q1 in VERIFIED-D1.md): seven
 * families of 14-25 members. FORGE folds BURN, EDGE and most of HAUL; HARASS folds SHOCK and GUARD; SWARM folds VOLUME,
 * SPLIT, FRAY and POISON; TEMPO folds TIMING and SPEED; BURST stays; wave 3 adds TWIN (two belts into one gun) and PLATE
 * (plating, repair and guards). Every buyable module carries 1-3 of them. Nothing in play reads a tag (the SMUGGLER
 * picks by effect: eventDefs.ts smugglerPool).
 */
export type ModuleTag = "FORGE" | "HARASS" | "SWARM" | "BURST" | "TEMPO" | "TWIN" | "PLATE";

/**
 * 0.6.1a: the 2-star or 3-star override of a fusible module (ARSENAL.md §4.3, catalogue.json star2/star3).
 * gate/factory/mod are merged over the 1-star spec by stars.ts:effectAt (levels 2 then 3, so a 2-star
 * value carries to 3 stars unless 3 restates it). `pending` holds star values the sim does not read yet;
 * 0.6.1p applied every 0.6.1a pending perk, so no live module stores any (the field stays for later waves).
 * `perk` names the perk.
 */
export interface ItemLevel {
  gate?: Partial<GateEffect>;
  factory?: Partial<FactorySpec>;
  mod?: Partial<ModSpec>;
  core?: Partial<CoreSpec>; // 0.6.1b: a turret core's star values
  turret?: Partial<TurretSpec>; // 0.6.2s: a turret's star values
  perk?: string;
  pending?: Record<string, number>;
}

/**
 * 0.6.2s (REQ-BFG-031) S2: which columns of its slot a turret takes belts on. "both": both columns; "inner": the
 * column nearer the deck's centre line (x 4.5), a tie going to the lower column (deck.ts slotIntakes).
 */
export type TurretIntake = "both" | "inner";

/**
 * 0.6.2s S3: a turret's firing numbers, exactly the fields a hero's TurretDef had (its class is TurretDef.kind).
 * Installed in a slot, it resolves to a TurretDef at the slot's columns (deck.ts turretSlots).
 */
export interface TurretSpec {
  class: TurretKind;
  fireInterval: number; // s between firing opportunities
  window: number; // loading window size (LIFO stack)
  flight: number; // projectile flight time (s)
  intake: TurretIntake;
}

/** 0.6.2s S1: one TURRET SLOT of a hull: a fixed 2-column span in the forward row; `start` names its starting turret. */
export interface SlotDef {
  col0: number;
  width: number;
  start?: string; // the ITEMS id of the turret the hero starts with here; absent: the slot starts empty
}

/** 0.6.2s S3 prices (the balance pass may retune) and S4 gear slots by rarity (+1 per star above 1, deck.ts gearSlotsOf). */
export const TURRET_PRICE: Record<Rarity, number> = { common: 6, rare: 8, epic: 10, legendary: 13 };
export const GEAR_SLOTS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };

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
  turret?: TurretSpec; // 0.6.2s: a turret's numbers (kind "turret")
  reason?: string; // 0.6.2s: a turret's one-line reason to buy it (player text)
  supply?: { belt?: number; hull?: number };
  levels?: { 2?: ItemLevel; 3?: ItemLevel }; // 0.6.1a: star overrides (1 star = the spec above)
  tags?: ModuleTag[]; // 0.6.1b: the shop tags (a hint only); 0.8.0 P1: family map v2, 1-3 on every buyable module
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
    desc: ["STAMPS PLAIN SLUGS", "EVERY 1.4S. NEEDS A", "FREE TURRET INTAKE."], tags: ["SWARM"],
    factory: { ammo: "plain", interval: 1.4, outputs: 1 },
    levels: { // 0.6.1p: the dies (base damage 5 / 7.5, Payload.base) are applied
      2: { factory: { interval: 1.1, base: 5 }, perk: "HARDENED DIES" },
      3: { factory: { interval: 1, base: 7.5 }, perk: "MASTER DIES" },
    },
  },
  // --- 0.6.1c: the six wave-1 factories (catalogue.json; ARSENAL.md §3.3 "Buyable factories"), values exactly ---
  doublestamp: {
    id: "doublestamp", name: "DOUBLE STAMP", kind: "factory", rarity: "rare", price: 6, size: 2, merchant: "ironmonger",
    desc: ["STAMPS TWO PLAIN", "SLUGS PER 2.2S CYCLE.", "QUEUE PRESSURE."], tags: ["SWARM"],
    factory: { ammo: "plain", interval: 2.2, outputs: 1, batch: 2 }, // base 3: the plain slug's
    levels: {
      2: { factory: { interval: 1.6, base: 5 } },
      3: { factory: { batch: 3 }, perk: "TRIPLE DIES" },
    },
  },
  shottower: {
    id: "shottower", name: "SHOT TOWER", kind: "factory", rarity: "rare", price: 6, size: 2, merchant: "gunsmith",
    desc: ["DROPS 3 BUCKSHOT", "(1 DMG) EVERY 1.5S.", "RIGS HIT EACH ONE."], tags: ["SWARM"], // beltside-062c: RIG (DESIGN §1)
    factory: { ammo: "shot", interval: 1.5, outputs: 1, batch: 3 }, // base 1: AMMO.shot
    levels: { 2: { factory: { interval: 1.35, base: 2 } }, 3: { factory: { interval: 1.3, base: 3 } } },
  },
  hotswap: {
    id: "hotswap", name: "HOT SWAP", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "quartermaster",
    desc: ["ALTERNATES EMBER", "SLUGS (2 BURN) AND", "SPARK SLUGS (SHOCK)."], tags: ["FORGE", "HARASS"],
    factory: { ammo: "plain", interval: 1.5, outputs: 1, cycle: [{ tint: "ember", burn: 2 }, { tint: "spark", shock: true }] },
    levels: { // the spark tracks GALVANIC COIL: 1.8 s and 2.8 s with SPARK JUMP (0.6.1p's shockTime and jump)
      2: { factory: { interval: 1.3, cycle: [{ tint: "ember", burn: 4 }, { tint: "spark", shock: true, shockTime: 1.8, jump: 1 }] } },
      3: { factory: { interval: 1.1, cycle: [{ tint: "ember", burn: 7 }, { tint: "spark", shock: true, shockTime: 2.8, jump: 1 }] } },
    },
  },
  slagpot: {
    id: "slagpot", name: "SLAG POT", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "ironmonger",
    desc: ["HEAVY SLAG SLUGS", "(7 DMG) THAT IGNORE", "BELT SPEED RIGS."], tags: ["FORGE", "BURST"], // beltside-062c: RIG (DESIGN §1)
    factory: { ammo: "slag", interval: 2.8, outputs: 1 }, // base 7: AMMO.slag (fixed 0.75x belt speed)
    levels: { 2: { factory: { interval: 2.2, base: 12 } }, 3: { factory: { interval: 1.75, base: 15 } } },
  },
  assembly: {
    id: "assembly", name: "ASSEMBLY LINE", kind: "factory", rarity: "common", price: 5, size: 2, merchant: "ironmonger",
    desc: ["SLOW PLAIN SLUGS, AND", "ALL YOUR RIGS", "COMMISSION 2X FAST."], tags: ["TEMPO", "SWARM"], // beltside-062c: RIG (DESIGN §1)
    factory: { ammo: "plain", interval: 1.8, outputs: 1, commission: 0.5 },
    levels: {
      2: { factory: { interval: 1.8, commission: 0.25, base: 4.5 } },
      3: { factory: { interval: 1.8, commission: 0, hotStart: 4, base: 6 }, perk: "HOT START" },
    },
  },
  gantry: {
    id: "gantry", name: "GANTRY PRESS", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "tinker",
    desc: ["ONE PRESS, TWO", "OUTPUTS: FEEDS TWO", "INTAKES BY TURNS."], tags: ["SWARM", "TWIN"],
    factory: { ammo: "plain", interval: 1.2, outputs: 2 }, // base 3: the plain slug's
    levels: {
      2: { factory: { interval: 0.7, outputs: 3 }, perk: "THIRD ARM" },
      3: { factory: { base: 6 }, perk: "HEAVY GANTRY" },
    },
  },
  scrapper: {
    id: "scrapper", name: "SCRAPPER", kind: "factory", rarity: "rare", price: 6, size: 2, merchant: "scrapper",
    desc: ["STAMPS SCRAP SLUGS", "WHEN HARASSMENT HITS", "FOE, OR EVERY 3S."], tags: ["HARASS", "SWARM"],
    factory: { ammo: "plain", interval: 3, outputs: 1, trigger: "harass", scrapFlat: 3 },
    levels: { 2: { factory: { interval: 2.5, scrapFlat: 6.5 } }, 3: { factory: { interval: 2, scrapFlat: 10.5, bigHaul: true }, perk: "BIG HAUL" } },
  },
  sabot: {
    id: "sabot", name: "SABOT FOUNDRY", kind: "factory", rarity: "epic", price: 9, size: 2, merchant: "quartermaster",
    desc: ["TELEGRAPHED ROUNDS", "WRECK RIGS OR STALL", "OTHER MACHINERY."], tags: ["HARASS", "BURST"],
    factory: { ammo: "sabot", interval: 6, outputs: 1, round: { kind: "sabot" } },
    levels: { 2: { factory: { interval: 2.8 } }, 3: { factory: { interval: 1.9, round: { kind: "sabot", shrapnel: true } }, perk: "SHRAPNEL" } },
  },
  frostbite: {
    id: "frostbite", name: "FROSTBITE FOUNDRY", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "arcane",
    desc: ["FROST ROUNDS FREEZE", "MACHINES AND PAUSE", "THEIR TIMERS."], tags: ["HARASS"],
    factory: { ammo: "frost", interval: 2.8, outputs: 1, round: { kind: "frost", seconds: 2.5, spread: 0 } },
    levels: { 2: { factory: { round: { kind: "frost", seconds: 2.75, spread: 1 } }, perk: "HOARFROST" },
      3: { factory: { round: { kind: "frost", seconds: 3, spread: 2 } }, perk: "HOARFROST" } },
  },
  dragchain: {
    id: "dragchain", name: "DRAG CHAIN FOUNDRY", kind: "factory", rarity: "common", price: 5, size: 2, merchant: "scrapper",
    desc: ["CHAIN ROUNDS SLOW", "A BELT SEGMENT AND", "SNAG ITS PAYLOADS."], tags: ["HARASS", "TEMPO"],
    factory: { ammo: "drag", interval: 1.8, outputs: 1, round: { kind: "drag", mul: 0.6, seconds: 3 } },
    levels: { 2: { factory: { round: { kind: "drag", mul: 0.4, seconds: 4.4 } } },
      3: { factory: { round: { kind: "drag", mul: 0.3, seconds: 6 } } } },
  },
  mimic: {
    id: "mimic", name: "MIMIC FORGE", kind: "factory", rarity: "legendary", price: 11, size: 2, merchant: "arcane",
    desc: ["STAMPS YOUR HERO'S", "SIGNATURE AMMO INTO", "A SECOND ROUTE."], tags: ["SWARM"],
    factory: { ammo: "plain", interval: 1, intervalMul: 1.4, outputs: 1 },
    levels: { 2: { factory: { intervalMul: 1 } }, 3: { factory: { intervalMul: 0.8, outputs: 2 }, perk: "TWIN SIGNET" } },
  },
  limpet: {
    id: "limpet", name: "LIMPET WORKS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "scrapper",
    desc: ["STICKY CHARGES BLOW", "3 SECONDS LATER FOR", "HULL DAMAGE."], tags: ["HARASS", "BURST"], // 0.6.2t 0b.1: no stall at 1 star
    factory: { ammo: "limpet", interval: 2.4, outputs: 1, round: { kind: "limpet", delay: 3, blast: 8 } },
    levels: { 2: { factory: { round: { kind: "limpet", delay: 3, blast: 18, stall: 1 } } },
      3: { factory: { round: { kind: "limpet", delay: 3, blast: 28, stall: 1.6 } } } },
  },
  // --- processing gates ---
  temper: {
    id: "temper", name: "TEMPER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    desc: ["ADDS 1 BURN.", "BURN: 1 DMG/S FOR 3S", "PER STACK ON HIT."], tags: ["FORGE"],
    gate: { burn: 1 },
    levels: { 2: { gate: { burn: 2 } }, 3: { gate: { burn: 4 } } },
  },
  whetstone: {
    id: "whetstone", name: "WHETSTONE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    desc: ["+2 FLAT DAMAGE.", "BEFORE A SPLITTER,", "BOTH COPIES GAIN IT."], tags: ["FORGE"],
    gate: { flat: 2 },
    levels: { 2: { gate: { flat: 4 } }, 3: { gate: { flat: 7 } } },
  },
  grease: {
    id: "grease", name: "GREASE WORKS", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker",
    desc: ["BELT RUNS 1.6X FROM", "ITS HIT. LOCKED BELTS", "GAIN +1 DAMAGE."], tags: ["TEMPO"],
    gate: { speed: 1.6, lockedFlat: 1 },
    levels: { 2: { gate: { speed: 2.3, lockedFlat: 2 } }, 3: { gate: { speed: 3.1, lockedFlat: 4 } } },
  },
  brake: {
    id: "brake", name: "BRAKE SHOE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker",
    desc: ["HALF SPEED FROM HIT.", "LOCKED BELTS GAIN", "+2 DAMAGE INSTEAD."], tags: ["FORGE", "TEMPO"],
    gate: { speed: 0.5, lockedFlat: 2 },
    levels: { // 0.6.1f: the slow stays at half speed (a deeper one starved the turret); the merge pays in friction heat
      2: { gate: { speed: 0.5, flat: 2, lockedFlat: 4 }, perk: "HOT SHOE" },
      3: { gate: { speed: 0.5, flat: 5, lockedFlat: 7 }, perk: "RED-HOT SHOE" },
    },
  },
  longhaul: {
    id: "longhaul", name: "LONG HAUL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "tinker", shape: "II",
    desc: ["+1 DAMAGE FOR EACH", "HIT THE PAYLOAD", "ALREADY TOOK."], tags: ["FORGE", "BURST"],
    gate: { perPriorGate: 1 },
    levels: { // 0.6.1p: priorCap applied (1 star counts every prior gate, as in 0.6.0)
      2: { gate: { perPriorGate: 2, priorCap: 6 } },
      3: { gate: { perPriorGate: 3.5, priorCap: 6 } },
    },
  },
  coil: {
    id: "coil", name: "GALVANIC COIL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist", shape: "L",
    desc: ["ADDS SHOCK. A SHOCK", "HIT STALLS THE ENEMY", "MACHINE IT STRIKES."], tags: ["HARASS"],
    gate: { shock: true }, // 1 star stalls DISRUPT_TIME (1.6 s, catalogue star1) exactly as in 0.6.0
    levels: { // 0.6.1p: the stall in seconds and SPARK JUMP are applied
      2: { gate: { shockTime: 1.8, jump: 1 }, perk: "SPARK JUMP" },
      3: { gate: { shockTime: 2.8, jump: 1 }, perk: "SPARK JUMP" },
    },
  },
  splitter: {
    id: "splitter", name: "SPLITTER", kind: "gate", rarity: "epic", price: 7, size: 1, merchant: "tinker", shape: "T",
    desc: ["SPLITS A PAYLOAD IN", "TWO COPIES AT 60%.", "MORE BELT PRESSURE."], tags: ["SWARM"],
    gate: { split: { copies: 2, mult: 0.6 } },
    levels: {
      2: { gate: { split: { copies: 2, mult: 0.72 } }, perk: "CLEAN CUT" },
      // 0.6.1f: PERFECT CUT keeps THREE-WAY's damage budget (2 x 0.85 = 1.70 vs 3 x 0.57) with no third payload to jam
      3: { gate: { split: { copies: 2, mult: 0.85 } }, perk: "PERFECT CUT" },
    },
  },
  overdrive: {
    id: "overdrive", name: "OVERDRIVE", kind: "gate", rarity: "legendary", price: 10, size: 1, merchant: "tinker", shape: "X",
    desc: ["4 ARROWS: 3X SPEED", "FROM HIT; LOCKED BELTS", "GAIN +3 DAMAGE."], tags: ["TEMPO"],
    gate: { speed: 3, lockedFlat: 3 },
    levels: { // 0.6.1p: AFTERBURNER's +3 flat applied; the guard flags wait for wave 2's enemy slow and freeze
      2: { gate: { speed: 4, flat: 1, lockedFlat: 5, guard: GUARD_SLOW }, perk: "REDLINE" },
      3: { gate: { speed: 5, flat: 3, lockedFlat: 11, guard: GUARD_SLOW | GUARD_FREEZE }, perk: "AFTERBURNER" },
    },
  },
  tollbooth: {
    id: "tollbooth", name: "TOLLBOOTH", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "ironmonger",
    desc: ["GUARDS ITS BELT", "FROM THE FIRST 2", "HARASSMENT HITS."], tags: ["HARASS", "PLATE"],
    gate: { toll: 2 }, levels: { 2: { gate: { toll: 4 } }, 3: { gate: { toll: 7, tollFactory: true }, perk: "FACTORY GUARD" } },
  },
  sifter: {
    id: "sifter", name: "SIFTER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    desc: ["REMOVES CHILL, SNAG", "OR SAP FROM PASSING", "PAYLOADS IN ORDER."], tags: ["HARASS", "FORGE", "PLATE"],
    gate: { sift: 1 }, levels: { 2: { gate: { sift: "all", siftFlat: 1 }, perk: "POLISH" },
      3: { gate: { sift: "all", siftFlat: 2, siftClean: 1 }, perk: "FINE MESH" } },
  },
  surge: {
    id: "surge", name: "SURGE VALVE", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "tinker",
    desc: ["PULSES 3X SPEED FOR", "1S EVERY 3S, +1 DMG", "PER PULSE RIDDEN.", "LOCKED BELTS +3 DMG."], tags: ["TEMPO", "BURST", "FORGE"],
    // 0.6.2 (REQ-BFG-021): a tempo-locked belt ignores the pulse and its per-pulse flat, so, like every other speed rig,
    // SURGE pays locked belts damage instead: a rare's 3/6/10 (between BRAKE SHOE's 2/4/7 and OVERDRIVE's 3/6/11)
    // 0.6.2 FB-B (oracle 16085a6430e4cc6a): the per-pulse flat is 1/2/3 (was 0/1/2). At ★1 the pulse cut ride time on
    // ride-scaled ammo and added nothing when the turret was the bottleneck (Furnace's audit cell: 78.3 -> 71.5)
    gate: { pulse: { speed: 3, on: 1, period: 3, flat: 1 }, lockedFlat: 3 },
    levels: { 2: { gate: { pulse: { speed: 4, on: 1, period: 2.5, flat: 2 }, lockedFlat: 6 }, perk: "OVERPRESSURE" },
      3: { gate: { pulse: { speed: 5, on: 1, period: 2, flat: 3 }, lockedFlat: 10 }, perk: "HAMMER VALVE" } },
  },
  sorting: {
    id: "sorting", name: "SORTING ARM", kind: "gate", rarity: "epic", price: 7, size: 1, merchant: "tinker",
    desc: ["COPIES EVERY 3RD", "PAYLOAD AT FULL", "STRENGTH."], tags: ["SWARM"],
    gate: { sort: { every: 3, copies: 2 } }, levels: { 2: { gate: { sort: { every: 2, copies: 2 } }, perk: "QUICK SORT" },
      3: { gate: { sort: { every: 2, copies: 3 } }, perk: "TRIPLE SORT" } },
  },
  riveter: {
    id: "riveter", name: "RIVETER", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "ironmonger",
    desc: ["EACH PASSING SLUG", "REPAIRS YOUR HULL", "BY 0.6."], tags: ["SWARM", "PLATE"],
    gate: { repair: 0.6 }, levels: { 2: { gate: { repair: 1.3 } }, 3: { gate: { repair: 2.1 } } },
  },
  heatjacket: {
    id: "heatjacket", name: "HEAT JACKET", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "quartermaster",
    desc: ["ADDS +0.4 DAMAGE", "PER SECOND RIDDEN", "AFTER THIS RIG."], tags: ["FORGE"],
    gate: { heat: 0.4 }, levels: { 2: { gate: { heat: 0.9 } }, 3: { gate: { heat: 1.4 } } },
  },
  venom: {
    id: "venom", name: "VENOM DRIP", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "alchemist",
    desc: ["ADDS 2 POISON.", "POOL TICKS AND", "REFRESHES ON HIT."], tags: ["SWARM", "FORGE"],
    gate: { poison: 2 }, levels: { 2: { gate: { poison: 4 } }, 3: { gate: { poison: 7 } } },
  },
  overclocker: {
    id: "overclocker", name: "OVERCLOCKER", kind: "gate", rarity: "rare", price: 6, size: 1, merchant: "tinker",
    desc: ["DOUBLES THE NEXT", "BOOSTABLE RIG ONCE,", "THEN COOLS FOR 4S."], tags: ["FORGE", "BURST", "TEMPO"],
    gate: { overclockCooldown: 4 }, levels: { 2: { gate: { overclockCooldown: 1.8 } }, 3: { gate: { overclockCooldown: 1.15 } } },
  },
  keg: {
    id: "keg", name: "POWDER KEG", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "scrapper",
    desc: ["BLOWS AT 12S:", "PAYLOADS ON ITS BELT", "GAIN +6 AND BURN."], tags: ["FORGE", "BURST", "TEMPO"],
    gate: { keg: { fuse: 12, flat: 6, burn: 1 } }, levels: { 2: { gate: { keg: { fuse: 10, flat: 13, burn: 2 } } },
      3: { gate: { keg: { fuse: 8, flat: 21, burn: 3, wide: true } }, perk: "WIDE BLAST" } },
  },
  bellows: {
    id: "bellows", name: "BELLOWS", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist",
    desc: ["ADDS BURN FROM", "RIDE TIME SO FAR,", "UP TO 4 STACKS."], tags: ["FORGE"],
    gate: { burnPerRide: { seconds: 2.5, max: 4 } }, levels: { 2: { gate: { burnPerRide: { seconds: 1.15, max: 9 } } },
      3: { gate: { burnPerRide: { seconds: 0.7, max: 14 } } } },
  },
  quench: {
    id: "quench", name: "QUENCH TANK", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "alchemist",
    desc: ["+1 DAMAGE TO EVERY", "PAYLOAD. TURNS UP TO", "4 BURN INTO +3 EACH."], tags: ["FORGE"],
    // 0.6.2 FB-B (oracle 16085a6430e4cc6a): a Burn stack deals 1 dmg/s for BURN_TIME (3 s), so each stack QUENCH spends
    // pays at least that (+3/+5/+7), and it spends only the 4/5/6 it pays for (more stays Burn). Every payload it hits
    // also hardens +1/+2/+3 (EDGE), below WHETSTONE's 2/4/7, so a QUENCH with no Burn to spend isn't dead but stays a
    // Burn payoff. Was: all Burn at +2/+4/+6 each, capped at +12/+26/+42 (★1 turned 2 Burn, 6 damage, into +4).
    gate: { quench: { flat: 1, perBurn: 3, stacks: 4 } }, levels: { 2: { gate: { quench: { flat: 2, perBurn: 5, stacks: 5 } } },
      3: { gate: { quench: { flat: 3, perBurn: 7, stacks: 6 } } } },
  },
  staticbrush: {
    id: "staticbrush", name: "STATIC BRUSH", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist",
    desc: ["BARE-HULL HITS", "STALL A RANDOM", "ENEMY TURRET."], tags: ["HARASS"],
    gate: { staticTime: 0.6 }, levels: { 2: { gate: { staticTime: 1.3 } }, 3: { gate: { staticTime: 2.1 } } },
  },
  lodestone: {
    id: "lodestone", name: "LODESTONE", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "arcane",
    desc: ["+1 DAMAGE ALWAYS,", "+1 PER ENEMY", "MACHINE STALLED."], tags: ["HARASS", "FORGE"],
    // 0.6.2 TUNE-M T2 (the Prime's decision, as QUENCH TANK's oracle 16085a6430e4cc6a): a floor, +1/+2/+3 flat on every
    // payload it hits (below WHETSTONE's 2/4/7), with the per-stalled bonus on top. Was the per-stalled bonus alone, so
    // a deck with no stall source got nothing from it at any star (NO EFFECT on FB-A and RB; CAND-A ablation FURNACE
    // d10 -5.4).
    gate: { flat: 1, perStalled: { each: 1, max: 6 } }, levels: { 2: { gate: { flat: 2, perStalled: { each: 2.2, max: 13 } } },
      3: { gate: { flat: 3, perStalled: { each: 3.5, max: 21 } } } },
  },
  barbed: {
    id: "barbed", name: "BARBED SPOOL", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "quartermaster",
    desc: ["HITS ADD 1 FRAY.", "LATER HITS DEAL", "+0.2 PER STACK."], tags: ["SWARM", "FORGE"],
    gate: { fray: 1 }, levels: { 2: { gate: { fray: 2, frayCap: 3 }, perk: "RAZOR WIRE" },
      3: { gate: { fray: 3, frayCap: 6 }, perk: "RAZOR WIRE" } },
  },
  counterweight: {
    id: "counterweight", name: "COUNTERWEIGHT", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "scrapper",
    desc: ["+0.5 DAMAGE PER", "BELT TILE ALREADY", "RIDDEN, MAX +6."], tags: ["FORGE"],
    gate: { perTile: { each: 0.5, max: 6 } }, levels: { 2: { gate: { perTile: { each: 1.1, max: 13 } } },
      3: { gate: { perTile: { each: 1.75, max: 21 } } } },
  },
  // --- turret equipment ---
  chamber: {
    id: "chamber", name: "EXT. CHAMBER", kind: "mod", rarity: "epic", price: 7, size: 1, merchant: "gunsmith",
    desc: ["TURRET FIRES TWO", "PAYLOADS PER SHOT.", "DROP ON A TURRET."], tags: ["BURST", "TWIN"],
    mod: { perShot: 2 },
    levels: { // 0.6.1p: WIDE BREECH's window +1 applied (TurretState.window)
      2: { mod: { perShot: 2, window: 1 }, perk: "WIDE BREECH" },
      3: { mod: { perShot: 3, window: 1 }, perk: "TRIPLE BREECH" },
    },
  },
  calibrate: {
    id: "calibrate", name: "CALIBRATION", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    desc: ["TURRET FIRES 25%", "FASTER.", "DROP ON A TURRET."], tags: ["TEMPO"],
    mod: { fireMul: 0.75 },
    levels: { 2: { mod: { fireMul: 0.58 } }, 3: { mod: { fireMul: 0.46 } } },
  },
  flak: {
    id: "flak", name: "FLAK SCREEN", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "quartermaster",
    desc: ["INTERCEPTS 25% OF", "INCOMING HARASSMENT", "ROUNDS SIDE-WIDE."], tags: ["HARASS", "PLATE"],
    mod: { intercept: 0.25 }, levels: { 2: { mod: { intercept: 0.55 } }, 3: { mod: { intercept: 0.85 } } },
  },
  spotter: {
    id: "spotter", name: "SPOTTER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    desc: ["TURRET REROLLS A", "BARE-HULL TARGET", "TOWARD MACHINERY."], tags: ["HARASS"],
    mod: { rerolls: 1 }, levels: { 2: { mod: { rerolls: 2, factoryWeight: 2 }, perk: "FACTORY SPOT" },
      3: { mod: { alwaysMachine: true, factoryWeight: 3 }, perk: "EAGLE EYE" } },
  },
  // --- 0.6.1p: the wave-1 turret mods (catalogue.json hopper, mantlet, ram; ARSENAL.md §3.3 Mods) ---
  // HOPPER: the first Quartermaster stock (0.6.1d brought the merchant; its own parts are a later job).
  // On a GATLING SPOOL turret its seconds do nothing (gatlingReady never reads windowTime); its slots still count.
  hopper: {
    id: "hopper", name: "HOPPER", kind: "mod", rarity: "common", price: 4, size: 1, merchant: "quartermaster",
    desc: ["CHAMBER HOLDS 1 MORE", "LOAD; WINDOWS STAY", "OPEN 0.5S LONGER."], tags: ["BURST", "TEMPO"],
    mod: { window: 1, windowTime: 0.5 },
    // 0.6.2 FB-B (oracle 16085a6430e4cc6a): every star keeps ★1's window (+1 slot, +0.5 s). ★2/★3 add a store: while the
    // gun fires it takes 1/2 loads off the belt, and they drop into the next window. On a sparse belt nothing waits, so
    // ★2 fires exactly as ★1; loads arriving together (two belts, a split) no longer wait or jam. Was: ★2 +2 slots and
    // +1.0 s, ★3 +3 and +1.5 s, whose extra slot sat empty on a sparse belt while the longer timer delayed each shot
    // (E1 seed 1 day 7: HOPPER ★2 WORSE).
    levels: {
      2: { mod: { store: 1 } },
      3: { mod: { store: 2, noJam: true }, perk: "BOTTOMLESS" },
    },
  },
  mantlet: {
    id: "mantlet", name: "MANTLET", kind: "mod", rarity: "common", price: 4, size: 1, merchant: "ironmonger",
    desc: ["ARMORED TURRET:", "SHOCK AND CHAIN SLOWS", "CAN'T STALL IT."], tags: ["HARASS", "PLATE"],
    mod: { immune: ["shock", "static", "arc", "drag"] },
    levels: {
      // 0.6.2 FB-B (oracle 16085a6430e4cc6a): FULL PLATE also shields the belt tile feeding its turret (intakeGuard 1),
      // and the rigs working it (DESIGN §11 P6), against the same stalls. Freeze and sabot rounds almost never strike
      // the turret itself, so FULL PLATE alone changed no star-bench fight (the MANTLET ★2 NO EFFECT rows).
      2: { mod: { immune: ["shock", "static", "arc", "drag", "freeze", "sabot"], intakeGuard: 1 }, perk: "FULL PLATE" },
      3: { mod: { intakeGuard: 3 }, perk: "BULWARK SKIRT" },
    },
  },
  ram: {
    id: "ram", name: "FINISHER RAM", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "tinker",
    desc: ["THE LAST PAYLOAD OUT", "OF EACH WINDOW HITS", "40% HARDER."], tags: ["BURST"],
    mod: { finisher: 0.4 }, // never on a GATLING SPOOL turret: it holds no window (battle.ts chambers)
    levels: { 2: { mod: { finisher: 0.88 } }, 3: { mod: { finisher: 1.4 } } },
  },
  // --- turret cores (0.6.1b, ARSENAL.md §2.3, catalogue.json): one socket per turret; numbers at heavy scale ---
  scatter: {
    id: "scatter", name: "SCATTER CHOKE", kind: "core", rarity: "common", price: 4, size: 1, merchant: "gunsmith",
    desc: ["SHOTS BURST INTO 3", "PELLETS AT 40%, EACH", "AIMED ANEW."], tags: ["SWARM"],
    core: { routine: "scatter", pellets: 3, share: 0.4 },
    levels: { 2: { core: { pellets: 3, share: 0.48 } }, 3: { core: { pellets: 4, share: 0.42 } } },
  },
  rotary: {
    // 0.6.2m (REQ-BFG-033): sold by the GUNSMITH (was the TINKER; see MERCHANTS)
    id: "rotary", name: "ROTARY BREECH", kind: "core", rarity: "common", price: 3, size: 1, merchant: "gunsmith",
    desc: ["FIRES THE OLDEST", "LOAD FIRST. WINDOWS", "CLOSE IN 0.8S."], tags: ["TEMPO"],
    core: { routine: "rotary", order: "FIFO", windowTime: 0.8 },
    levels: {
      2: { core: { intervalMul: 0.85 }, perk: "GREASED RACE" },
      3: { core: { intervalMul: 0.7, noJam: true }, perk: "CLEAN FEED" },
    },
  },
  pressure: {
    // 0.6.2m (REQ-BFG-033): sold by the GUNSMITH (was the TINKER; see MERCHANTS)
    id: "pressure", name: "PRESSURE BREECH", kind: "core", rarity: "common", price: 4, size: 1, merchant: "gunsmith",
    desc: ["+1.2 DAMAGE PER", "PAYLOAD QUEUED AT", "IT. NEVER JAMS."], tags: ["SWARM", "BURST"],
    core: { routine: "pressure", perQueued: 1.2, maxCount: 5, noJam: true },
    levels: { 2: { core: { perQueued: 2.6 } }, 3: { core: { perQueued: 4.2 } } },
  },
  gatling: {
    id: "gatling", name: "GATLING SPOOL", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "gunsmith",
    // no loading window: a Prime-approved deviation from catalogue row 4 (oracle 5624d721a73a6282; cores.ts gatlingReady)
    desc: ["NEVER WAITS: FIRES", "EACH LOAD AT ONCE.", "EACH QUICK SHOT 6%", "FASTER, TO 0.6X."], tags: ["TEMPO", "SWARM"],
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
    // 0.6.2m (REQ-BFG-033): sold by the ARCANE DEALER (was the ALCHEMIST; see MERCHANTS)
    id: "drake", name: "DRAKE NOZZLE", kind: "core", rarity: "rare", price: 5, size: 1, merchant: "arcane",
    desc: ["TURNS FLAT DAMAGE", "INTO BURN. ITS FIRES", "BURN 4S, NOT 3."], tags: ["FORGE"],
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
  mortar: {
    id: "mortar", name: "MORTAR TUBE", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "ironmonger",
    desc: ["LOB FLIES 2.2X LONG", "AND SPLASHES ONE", "MORE TARGET AT 50%."], tags: ["BURST", "HARASS"],
    core: { routine: "mortar", flightMul: 2.2, splash: 1, share: 0.5 },
    levels: { 2: { core: { splash: 2, share: 0.55 } }, 3: { core: { splash: 3, share: 0.58 } } },
  },
  grapnel: {
    id: "grapnel", name: "GRAPNEL GUN", kind: "core", rarity: "rare", price: 5, size: 1, merchant: "scrapper",
    desc: ["BELT HITS RIP THE", "NEAREST ENEMY SLUG", "OFF THAT ROUTE."], tags: ["HARASS"],
    core: { routine: "grapnel", rip: 1, reach: 1 }, levels: { 2: { core: { rip: 2, reach: 2 } },
      3: { core: { rip: 3, reach: 3 }, perk: "SALVAGE LINE" } },
  },
  tesla: {
    id: "tesla", name: "TESLA ARC", kind: "core", rarity: "epic", price: 8, size: 1, merchant: "arcane",
    desc: ["HITS ARC TO THE", "NEAREST MACHINE FOR", "25% PLUS 0.8S STALL."], tags: ["HARASS"],
    core: { routine: "tesla", arcs: 1, stall: 0.8, share: 0.25 },
    levels: { 2: { core: { arcs: 2, stall: 0.9 } }, 3: { core: { arcs: 3, stall: 0.93, share: 0.3 } } },
  },
  capacitor: {
    id: "capacitor", name: "CAPACITOR BANK", kind: "core", rarity: "epic", price: 7, size: 1, merchant: "arcane",
    desc: ["IDLE TIME CHARGES", "NEXT SHOT: +2 PER", "SECOND, UP TO 5S."], tags: ["BURST", "TEMPO"],
    core: { routine: "capacitor", perSecond: 2, maxSeconds: 5 },
    levels: { 2: { core: { perSecond: 4.4 } }, 3: { core: { perSecond: 7 } } },
  },
  compound: {
    id: "compound", name: "COMPOUND BREECH", kind: "core", rarity: "epic", price: 7, size: 1, merchant: "gunsmith",
    desc: ["PACKS TWO LOADS", "INTO ONE SHELL AT", "115% TOTAL DAMAGE."], tags: ["BURST", "TWIN"],
    core: { routine: "compound", mult: 1.15, hold: 3 },
    levels: { 2: { core: { mult: 1.33 } }, 3: { core: { mult: 1.52 } } },
  },
  lance: {
    id: "lance", name: "LODESTAR LANCE", kind: "core", rarity: "legendary", price: 10, size: 1, merchant: "arcane",
    desc: ["HITS THE HULL AND", "EVERY MACHINE IN", "ONE DECK COLUMN."], tags: ["HARASS", "BURST"],
    core: { routine: "lance", columns: 1, share: 0.2 },
    levels: { 2: { core: { columns: 2, share: 0.22 } }, 3: { core: { columns: 3, share: 0.23 } } },
  },
  // --- 0.6.2s turrets (REQ-BFG-031 S3): installed in a hull's TURRET SLOT (Build.turrets); any turret fits any slot.
  // The six starting lines, one per distinct hero turret, are ordinary commons with exactly the heroes' 0.6.1
  // numbers (HeroDef.slots names them). Star values (S6, step 4c from the bench, output-0.6.2s/bench): ★2 fires every
  // fireInterval x0.9, ★3 every x0.8, window unchanged (the brief's ★2 window +1 lost to ★1 on real decks: a fuller
  // window waits longer to fire).
  // Gear slots: rarity (common 1) + 1 per star above 1 (deck.ts). Step 5 (the shop-roll change): the GUNSMITH sells
  // every turret but the legendary THUNDERER, which the ARCANE DEALER sells (legendaries from day 4). Caravan only:
  // turrets are never road parts in 0.6.2 (eventDefs.ts roadPart), and FAMILY_WEIGHT draws them at half weight.
  scrapcannon: {
    id: "scrapcannon", name: "SCRAP CANNON", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["HEAVY TURRET.", "FIRES EVERY 1S.", "HOLDS 3 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A heavy gun that takes a belt on both columns.",
    turret: { class: "heavy", fireInterval: 1.0, window: 3, flight: 0.6, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.9 } }, 3: { turret: { fireInterval: 0.8 } } },
  },
  rampart: {
    id: "rampart", name: "RAMPART CANNON", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["HEAVY TURRET.", "FIRES EVERY 0.75S.", "HOLDS 3 LOADS."], tags: ["BURST", "TEMPO", "TWIN"],
    reason: "A quicker heavy gun with a slower shell.",
    turret: { class: "heavy", fireInterval: 0.75, window: 3, flight: 0.65, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.675 } }, 3: { turret: { fireInterval: 0.6 } } },
  },
  dartgun: {
    id: "dartgun", name: "DART GUN", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "FIRES EVERY 0.55S.", "HOLDS 2 LOADS."], tags: ["SWARM"],
    reason: "A fast light gun on one inner column.",
    turret: { class: "light", fireInterval: 0.55, window: 2, flight: 0.34, intake: "inner" },
    levels: { 2: { turret: { fireInterval: 0.495 } }, 3: { turret: { fireInterval: 0.44 } } },
  },
  spikegun: {
    id: "spikegun", name: "SPIKE GUN", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "FIRES EVERY 0.6S.", "HOLDS 2 LOADS."], tags: ["SWARM"],
    reason: "A light gun on one inner column.",
    turret: { class: "light", fireInterval: 0.6, window: 2, flight: 0.34, intake: "inner" },
    levels: { 2: { turret: { fireInterval: 0.54 } }, 3: { turret: { fireInterval: 0.48 } } },
  },
  carronade: {
    id: "carronade", name: "CARRONADE", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["MEDIUM TURRET.", "FIRES EVERY 0.8S.", "HOLDS 2 LOADS."], tags: ["SWARM", "TWIN"],
    reason: "A medium gun that takes a belt on both columns.",
    turret: { class: "medium", fireInterval: 0.8, window: 2, flight: 0.45, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.72 } }, 3: { turret: { fireInterval: 0.64 } } },
  },
  swivel: {
    id: "swivel", name: "SWIVEL GUN", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["ADAPTABLE TURRET.", "FIRES EVERY 0.7S.", "HOLDS 3 LOADS."], tags: ["TEMPO", "TWIN"],
    reason: "An adaptable gun on both columns.",
    turret: { class: "adaptable", fireInterval: 0.7, window: 3, flight: 0.55, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.63 } }, 3: { turret: { fireInterval: 0.56 } } },
  },
  // 0.6.2s S3: seven more turrets, a rare and an epic of each of light, medium and heavy, and one legendary. Each
  // differs from its class's commons in fireInterval, window, flight or intake, and only in those (no new battle
  // mechanics). Same star values as the commons: ★2 fire interval x0.9, ★3 x0.8, window unchanged.
  twinneedle: {
    id: "twinneedle", name: "TWIN NEEDLE", kind: "turret", rarity: "rare", price: TURRET_PRICE.rare, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "FIRES EVERY 0.55S.", "HOLDS 2 LOADS."], tags: ["SWARM", "TWIN"],
    reason: "A light gun that takes belts on both columns.",
    turret: { class: "light", fireInterval: 0.55, window: 2, flight: 0.34, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.495 } }, 3: { turret: { fireInterval: 0.44 } } },
  },
  hailgun: {
    id: "hailgun", name: "HAIL GUN", kind: "turret", rarity: "epic", price: TURRET_PRICE.epic, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "FIRES EVERY 0.45S.", "HOLDS 3 LOADS."], tags: ["SWARM", "TEMPO"],
    reason: "The fastest gun: it fires every 0.45 s and holds 3 loads.",
    turret: { class: "light", fireInterval: 0.45, window: 3, flight: 0.3, intake: "inner" },
    levels: { 2: { turret: { fireInterval: 0.405 } }, 3: { turret: { fireInterval: 0.36 } } },
  },
  deckgun: {
    id: "deckgun", name: "DECK GUN", kind: "turret", rarity: "rare", price: TURRET_PRICE.rare, size: 2, merchant: "gunsmith",
    desc: ["MEDIUM TURRET.", "FIRES EVERY 0.8S.", "HOLDS 3 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A medium gun that holds 3 loads, so fewer loads wait.",
    turret: { class: "medium", fireInterval: 0.8, window: 3, flight: 0.45, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.72 } }, 3: { turret: { fireInterval: 0.64 } } },
  },
  railgun: {
    id: "railgun", name: "RAIL GUN", kind: "turret", rarity: "epic", price: TURRET_PRICE.epic, size: 2, merchant: "gunsmith",
    desc: ["MEDIUM TURRET.", "FIRES EVERY 0.7S.", "HOLDS 3 LOADS."], tags: ["TEMPO", "TWIN"],
    reason: "Fires every 0.7 s, and its shots land in 0.3 s.",
    turret: { class: "medium", fireInterval: 0.7, window: 3, flight: 0.3, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.63 } }, 3: { turret: { fireInterval: 0.56 } } },
  },
  bombard: {
    id: "bombard", name: "BOMBARD", kind: "turret", rarity: "rare", price: TURRET_PRICE.rare, size: 2, merchant: "gunsmith",
    desc: ["HEAVY TURRET.", "FIRES EVERY 1S.", "HOLDS 4 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A heavy gun that holds 4 loads.",
    turret: { class: "heavy", fireInterval: 1.0, window: 4, flight: 0.6, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.9 } }, 3: { turret: { fireInterval: 0.8 } } },
  },
  siegegun: {
    id: "siegegun", name: "SIEGE GUN", kind: "turret", rarity: "epic", price: TURRET_PRICE.epic, size: 2, merchant: "gunsmith",
    desc: ["HEAVY TURRET.", "FIRES EVERY 0.85S.", "HOLDS 4 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A heavy gun that fires every 0.85 s and holds 4 loads.",
    turret: { class: "heavy", fireInterval: 0.85, window: 4, flight: 0.55, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.765 } }, 3: { turret: { fireInterval: 0.68 } } },
  },
  thunderer: {
    id: "thunderer", name: "THUNDERER", kind: "turret", rarity: "legendary", price: TURRET_PRICE.legendary, size: 2, merchant: "arcane",
    desc: ["HEAVY TURRET.", "FIRES EVERY 0.8S.", "HOLDS 4 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A heavy gun that fires every 0.8 s, with 4 gear slots.",
    turret: { class: "heavy", fireInterval: 0.8, window: 4, flight: 0.5, intake: "both" },
    levels: { 2: { turret: { fireInterval: 0.72 } }, 3: { turret: { fireInterval: 0.64 } } },
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
  ...RACE_ITEMS, // race signature factories are unsold; timing gear joins the shared merchant pool
};

// ---------------------------------------------------------------------------------------------------- wave 3 (0.8.0)

/**
 * 0.8.0 P1 (REQ-BFG-022, REQ-BFG-021): THE SWITCH. Wave 3's 15 modules are ITEMS entries (ITEMS[id] resolves, so the
 * sim, the stars, the text and the tests read them at any time), but while this is false they are hidden from every
 * listing of the catalogue: Object.keys/values(ITEMS), so buyableModules(), itemsSoldBy() (the caravan), the road-event
 * pools, the stand-in tools and the par player never see one, and validate.ts refuses a deck that holds one. I1 turns
 * wave 3 on with this one line. Tests and tools turn it on for one call with withWave3.
 */
export const WAVE3_LIVE = true;

/**
 * 0.8.0 P1: wave 3 (output-D1/DESIGN-wave3.md 3.1 and 3.3; the Prime's decisions in output-D1/verify-cap/VERIFIED-D1.md):
 * 8 rigs, 2 factories, 2 cores and 3 mods, with D1's kind, rarity, price, merchant, rig shape and v2 tags, and the
 * design's first-pass numbers at 1-3 stars (each star about 2.2x and 3.5x of the 1-star effect). The engine pieces they
 * need (E1 plating on every hull, E2 pairs, E3 stokers, E4 holds, E5 crossfire, E6 matched belts) are in battle.ts and
 * deck.ts, each guarded on its part, so a deck without a wave-3 part fights bit for bit as before.
 */
export const WAVE3_ITEMS: Record<string, ItemDef> = {
  plateroller: {
    id: "plateroller", name: "PLATE ROLLER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "ironmonger", shape: "I",
    desc: ["ROLLS PLATING ONTO", "YOUR HULL FOR EACH", "PAYLOAD IT HITS."], tags: ["PLATE", "SWARM"],
    gate: { plate: 0.5 },
    levels: { 2: { gate: { plate: 1.1 } }, 3: { gate: { plate: 1.7 } } },
  },
  twingauge: {
    id: "twingauge", name: "TWIN GAUGE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker", shape: "I",
    desc: ["ADDS DAMAGE, MORE", "ON A BELT MATCHED", "TO ITS TWIN."], tags: ["TWIN", "FORGE"],
    gate: { gauge: { flat: 1, matched: 3 } },
    levels: { 2: { gate: { gauge: { flat: 2.2, matched: 6.6 } } }, 3: { gate: { gauge: { flat: 3.5, matched: 10.5 } } } },
  },
  pincer: {
    id: "pincer", name: "PINCER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist", shape: "I",
    desc: ["ADDS DAMAGE, MORE", "FOR EACH RIG ON", "ITS TILE."], tags: ["FORGE"],
    gate: { pincer: { flat: 1, each: 2, max: 3 } },
    levels: { 2: { gate: { pincer: { flat: 2.2, each: 4.4, max: 3 } } }, 3: { gate: { pincer: { flat: 3.5, each: 7, max: 3 } } } },
  },
  braceframe: {
    id: "braceframe", name: "BRACE FRAME", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "ironmonger", shape: "L",
    desc: ["ENEMY STALLS ON ITS", "TILES END SOONER,", "SOONER STILL PLATED."], tags: ["PLATE", "HARASS"],
    gate: { brace: { mul: 0.5, plated: 0.25 } },
    levels: { 2: { gate: { brace: { mul: 0.3, plated: 0.15 } } }, 3: { gate: { brace: { mul: 0.15, plated: 0.05 } } } },
  },
  twinlatch: {
    id: "twinlatch", name: "TWIN LATCH", kind: "gate", rarity: "rare", price: 6, size: 1, merchant: "tinker", shape: "II",
    desc: ["HOLDS A PAYLOAD FOR", "ITS OTHER BELT, THEN", "LETS BOTH GO."], tags: ["TWIN", "TEMPO"],
    gate: { latch: { hold: 1, flat: 1 } },
    levels: { 2: { gate: { latch: { hold: 1, flat: 2.2 } } }, 3: { gate: { latch: { hold: 1, flat: 3.5 } } } },
  },
  stoker: {
    id: "stoker", name: "STOKER", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "scrapper", shape: "II",
    desc: ["FACTORIES ITS ARROWS", "POINT AT WORK", "FASTER."], tags: ["TEMPO", "SWARM"],
    gate: { stoke: 0.2 },
    levels: { 2: { gate: { stoke: 0.44 } }, 3: { gate: { stoke: 0.7 } } },
  },
  platebreaker: {
    id: "platebreaker", name: "PLATE BREAKER", kind: "gate", rarity: "epic", price: 7, size: 1, merchant: "scrapper", shape: "T",
    desc: ["TURNS YOUR HULL'S", "PLATING INTO", "PAYLOAD DAMAGE."], tags: ["PLATE", "FORGE"],
    gate: { breaker: { flat: 4, floor: 1 } },
    levels: { 2: { gate: { breaker: { flat: 8.8, floor: 2.2 } } }, 3: { gate: { breaker: { flat: 14, floor: 3.5 } } } },
  },
  shieldwall: {
    id: "shieldwall", name: "SHIELD WALL", kind: "gate", rarity: "legendary", price: 10, size: 1, merchant: "ironmonger", shape: "X",
    desc: ["PLATES YOUR HULL,", "AND HITS HARDER", "WHILE WELL PLATED."], tags: ["PLATE", "FORGE"],
    gate: { plate: 1, plated: { min: 12, flat: 3 } },
    levels: { 2: { gate: { plate: 2.2, plated: { min: 12, flat: 6.6 } } }, 3: { gate: { plate: 3.5, plated: { min: 12, flat: 10.5 } } } },
  },
  twinmould: {
    id: "twinmould", name: "TWIN MOULD", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "tinker",
    desc: ["CASTS A PLAIN SLUG", "ONTO EACH OF ITS", "BELTS AT ONCE."], tags: ["TWIN", "SWARM"],
    factory: { ammo: "plain", interval: 1.8, outputs: 2, twin: true }, // base 3: the plain slug's
    levels: { 2: { factory: { interval: 1.6, base: 5 } }, 3: { factory: { interval: 1.4, base: 6, outputs: 3 }, perk: "THIRD SPRUE" } },
  },
  armorpress: {
    id: "armorpress", name: "ARMOR PRESS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "ironmonger",
    desc: ["PRESSES PLATING ONTO", "YOUR HULL AND STAMPS", "PLAIN SLUGS."], tags: ["PLATE", "SWARM"],
    factory: { ammo: "plain", interval: 1.6, outputs: 1, plate: { every: 3, amount: 3 } }, // base 3: the plain slug's
    levels: { 2: { factory: { interval: 1.4, plate: { every: 3, amount: 6.6 } } }, 3: { factory: { interval: 1.2, plate: { every: 3, amount: 10.5 } } } },
  },
  anvil: {
    id: "anvil", name: "ANVIL BREECH", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "ironmonger",
    desc: ["SHOTS HIT HARDER", "THE MORE PLATING", "YOUR HULL HOLDS."], tags: ["PLATE", "BURST"],
    core: { routine: "anvil", anvilFlat: 2.5, perPlate: 1 },
    levels: { 2: { core: { anvilFlat: 5.5, perPlate: 2.2 } }, 3: { core: { anvilFlat: 8.75, perPlate: 3.5 } } },
  },
  steambreech: {
    id: "steambreech", name: "STEAM BREECH", kind: "core", rarity: "common", price: 4, size: 1, merchant: "gunsmith",
    desc: ["THE TURRET FIRES", "FASTER WHILE YOUR", "HULL IS PLATED."], tags: ["PLATE", "TEMPO"],
    core: { routine: "steam", steamPlated: 1 / 1.35, steamBare: 1 / 1.1 },
    levels: { 2: { core: { steamPlated: 1 / 1.7, steamBare: 1 / 1.2 } }, 3: { core: { steamPlated: 1 / 2.1, steamBare: 1 / 1.3 } } },
  },
  twintrigger: {
    id: "twintrigger", name: "TWIN TRIGGER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    desc: ["PAIRED LOADS HIT", "HARDER; A SHORTER", "LOAD TIME."], tags: ["TWIN", "TEMPO"],
    mod: { pairBonus: 0.25, windowTime: -0.25 },
    levels: { 2: { mod: { pairBonus: 0.55, windowTime: -0.4 } }, 3: { mod: { pairBonus: 0.88, windowTime: -0.55 } } },
  },
  spallcatcher: {
    id: "spallcatcher", name: "SPALL CATCHER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "quartermaster",
    desc: ["HITS YOUR SHIP TAKES", "CHARGE THIS TURRET'S", "NEXT SHOT."], tags: ["PLATE", "BURST"],
    mod: { spall: { every: 4, add: 1, max: 8 } },
    levels: { 2: { mod: { spall: { every: 4, add: 2.2, max: 17.6 } } }, 3: { mod: { spall: { every: 4, add: 3.5, max: 28 } } } },
  },
  seamwelder: {
    id: "seamwelder", name: "SEAM WELDER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "arcane",
    desc: ["PAIRS THIS TURRET", "TAKES PLATE YOUR", "HULL."], tags: ["TWIN", "PLATE"],
    mod: { seam: { pair: 1, lone: 0.2 } },
    levels: { 2: { mod: { seam: { pair: 2.2, lone: 0.4 } } }, 3: { mod: { seam: { pair: 3.5, lone: 0.7 } } } },
  },
};

/** 0.8.0 P1: wave 3's ids, in DESIGN 3.1's order. */
export const WAVE3_IDS: readonly string[] = Object.keys(WAVE3_ITEMS);

let wave3On = false;

/** 0.8.0 P1: is `id` a wave-3 module (whatever the switch)? */
export function isWave3(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(WAVE3_ITEMS, id);
}

/** 0.8.0 P1: is wave 3 in the game now (WAVE3_LIVE, or a withWave3 call)? */
export function wave3Live(): boolean {
  return wave3On;
}

/**
 * 0.8.0 P1: put wave 3 in the game (on) or keep it dormant (off). Each entry stays an own property of ITEMS either way;
 * only its enumerability follows the switch, so a listing of the catalogue sees wave 3 exactly when it is on, and its
 * place in ITEMS order (after every older entry) never moves.
 */
export function setWave3(on: boolean): void {
  for (const id of WAVE3_IDS) {
    Object.defineProperty(ITEMS, id, { value: WAVE3_ITEMS[id], enumerable: on, writable: true, configurable: true });
  }
  wave3On = on;
}

/** 0.8.0 P1: run `fn` with wave 3 on (or off), then put the switch back as it was, even if `fn` throws. */
export function withWave3<T>(fn: () => T, on = true): T {
  const was = wave3On;
  setWave3(on);
  try {
    return fn();
  } finally {
    setWave3(was);
  }
}

setWave3(WAVE3_LIVE);

export interface AmmoDef {
  name: string;
  base: number; // base damage
  rideScale: number; // damage per second of eligible ride time
  fray: number; // Fray stacks applied on hit
  rideCurve?: (ride: number) => number; // races: PENDULUM SLUG; replaces base + rideScale x ride
  fixedSpeed?: number; // 0.6.1c SLAG: always rides at this belt speed; speed gates and slows never change it (Battle.transport)
}

export const AMMO: Record<AmmoKind, AmmoDef> = {
  cinder: { name: "CINDER SLUG", base: 4, rideScale: 1.2, fray: 0 },
  thread: { name: "THREAD SLUG", base: 3, rideScale: 0, fray: 1 },
  plain: { name: "PLAIN SLUG", base: 3, rideScale: 0, fray: 0 },
  shot: { name: "BUCKSHOT", base: 1, rideScale: 0, fray: 0 }, // 0.6.1c SHOT TOWER: every per-payload gate hits each shot
  slag: { name: "SLAG SLUG", base: 7, rideScale: 0, fray: 0, fixedSpeed: 0.75 }, // 0.6.1c SLAG POT
  sabot: { name: "SABOT ROUND", base: 4, rideScale: 0, fray: 0 },
  frost: { name: "FROST ROUND", base: 2, rideScale: 0, fray: 0 },
  drag: { name: "CHAIN ROUND", base: 2, rideScale: 0, fray: 0 },
  limpet: { name: "LIMPET CHARGE", base: 2, rideScale: 0, fray: 0 },
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
  empty?: boolean; // 0.6.2s: an empty TURRET SLOT (deck.ts hero(b)): no connectors, nothing fights there
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
  // 0.6.2s (REQ-BFG-031 S1): the hull's TURRET SLOTS. Slot i < turrets.length is starting turret i (same col0 and
  // width) and names its starting def; the last slot is the one extra slot, empty at the start of a run. Optional
  // for the same reason as `core`; HEROES sets it for every hero. `turrets` stays the starting layout's numbers.
  slots?: SlotDef[];
}

/** 0.6.2s S1: each hull's slots. The extra slot's col0 is the brief's (FURNACE 8, BASTION 0, METRONOME 8, WEAVER 6,
 *  FOUNDRY 4, SIPHON 4); each starting slot names the common turret with exactly that hero's 0.6.1 numbers. */
export const HULL_SLOTS: Record<HeroId, SlotDef[]> = {
  furnace: [{ col0: 4, width: 2, start: "scrapcannon" }, { col0: 8, width: 2 }],
  weaver: [{ col0: 0, width: 2, start: "dartgun" }, { col0: 4, width: 2, start: "dartgun" }, { col0: 8, width: 2, start: "dartgun" }, { col0: 6, width: 2 }],
  foundry: [{ col0: 2, width: 2, start: "carronade" }, { col0: 6, width: 2, start: "carronade" }, { col0: 4, width: 2 }],
  bastion: [{ col0: 4, width: 2, start: "rampart" }, { col0: 0, width: 2 }],
  metronome: [{ col0: 4, width: 2, start: "swivel" }, { col0: 8, width: 2 }],
  siphon: [{ col0: 1, width: 2, start: "spikegun" }, { col0: 7, width: 2, start: "spikegun" }, { col0: 4, width: 2 }],
};

export const HEROES: Record<HeroId, HeroDef> = {
  furnace: {
    id: "furnace", name: "FURNACE", faction: "orc", factionName: "ORC WARBAND",
    hull: 200, factory: "kiln", ammo: "cinder", belt: 14,
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "heavy", fireInterval: 1.0, window: 3, flight: 0.6 }],
    blurb: ["KILN SLUGS HEAT UP ON", "LONG BELTS. AT 8+ TILES,", "BREECH FIRES EVERY 0.72S."],
    pattern: "DELAY TO COOK",
    core: "kilnbreech",
    slots: HULL_SLOTS.furnace,
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
    slots: HULL_SLOTS.weaver,
  },
  ...RACE_HEROES, // races: FOUNDRY (human), BASTION (dwarf), METRONOME (beastfolk), SIPHON — docs/RACES.md
  // 0.6.1b: the race heroes' signature cores, set on copies (races/data.ts stays as it is); 0.6.2s: their slots too
  foundry: { ...RACE_HEROES.foundry, core: "cruciblebreech", slots: HULL_SLOTS.foundry },
  bastion: { ...RACE_HEROES.bastion, core: "bulwarkcannon", slots: HULL_SLOTS.bastion },
  metronome: { ...RACE_HEROES.metronome, core: "pendulumhammer", slots: HULL_SLOTS.metronome },
  siphon: { ...RACE_HEROES.siphon, core: "leechneedle", slots: HULL_SLOTS.siphon },
};

export interface MerchantDef {
  id: MerchantId;
  name: string;
}

/**
 * 0.6.2m (REQ-BFG-033, the offer-mix tune): the rig sellers, TINKER and ALCHEMIST, sell no turret cores. rollShop is
 * fresh-first and every caravan has a rig seller, so a rig seller's cores were its leftovers: once a player owned most
 * of its rigs, its slots turned to cores (the operator's "more turret cores than rigs"). ROTARY and PRESSURE BREECH
 * moved to the GUNSMITH, DRAKE NOZZLE to the ARCANE DEALER. Rigs are now offered at least 2x as often as cores and as
 * turrets on every day 1-10, for a fresh run and for one holding many rigs (tests/shopMix.test.ts).
 */
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
  return Object.values(ITEMS).filter((d) => d.merchant === m && !DORMANT_ITEMS.has(d.id));
}

/** The shared, hero-blind salvage catalogue; supplies and dormant prototypes are not buyable modules. */
export function buyableModules(): ItemDef[] {
  return Object.values(ITEMS).filter((d) => !!d.merchant && d.price > 0 && d.kind !== "supply" && !DORMANT_ITEMS.has(d.id));
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
 * 0.6.2s (REQ-BFG-031 step 5, REQ-BFG-033): a family's weight when a wagon draws an offer among its choices (run.ts
 * rollShop: rng.weighted over the choices by the def's kind, instead of an even pick). Rigs are the caravan's
 * staple: on every day 1-10 they are offered at least 2x as often as turrets and at least 2x as often as cores,
 * averaged over 4,000+ seeded caravans per day (tests/shopMix.turrets.test.ts); one caravan may show more of
 * anything. A turret weighs half: the GUNSMITH stocks 12 of the 13 turrets beside its cores and mods, and at an even
 * pick its turrets would take almost 60% of its offers. Cores keep 1: the gunsmith's turrets already take the draws
 * that made cores too common (rig/core 1.87-2.26 before turrets, 2.47 or more with them), and a lower weight would
 * cut cores further while the extra turret slot adds a core socket. Every family at weight 1 draws exactly as the
 * even pick did, so a wagon whose choices hold no turret offers what it did before. The def's kind decides, never
 * the hero (REQ-BFG-021).
 */
export const FAMILY_WEIGHT: Record<ItemKind, number> = { gate: 1, factory: 1, mod: 1, supply: 1, core: 1, turret: 0.5 };

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
