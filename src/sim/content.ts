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
// bb-0.8.3 (job BELTS, REQ-BFG-043, REQ-BFG-044): belt slots grow with a factory's level (bought factories by stars, 2 / 3
// / 4; the hero's factory by its FACTORY upgrade, 2 / 3 / 4 / 5, the LOOM one more), and every hero's two gold upgrades
// (TURRET SPEED, FACTORY; Build.upgrades). Ghosts and records made under bb-0.8.0 don't mix with these.
// bb-0.8.6 (job PACKS, REQ-BFG-051): the caravan's two fixed packs (BELT PACK, ARMOR PACK). bb-0.8.7 (job RUNES-1,
// REQ-BFG-058): runes, one pick at every dawn. Ghosts and records made under bb-0.8.6 don't mix with these.
// bb-0.9.0 (release X, job FLIP-X2; REQ-BFG-047, REQ-BFG-069, REQ-BFG-058): the whole numbers (NUM-1..4), R1's STUN fold
// and whole-second durations, the sustain pieces and runes (SHIELD, HEAL, REGEN) and the bots' runes, every pool
// regenerated once with them; an upload holds exactly one rune a dawn. Ghosts and records made under bb-0.8.7 don't mix.
export const RULES_VERSION = "bb-0.9.0";
/**
 * RUNES-1 (REQ-BFG-058, decision 10): the rules whose bot pools a rules release carries forward instead of regenerating
 * them: the stand-in pool (standInPoolData.ts's `rules` tag) and the seed ghosts drawn from it and from the par player
 * (tools/samplePool.ts; they travel under RULES_VERSION). bb-0.8.7 carries bb-0.8.6's: bots hold no runes until RUNES-2
 * regenerates the pools, and a rune-less build battles exactly as under bb-0.8.6 (tests/runes.parity.test.ts). A release
 * with no entry here runs on pools generated under its own rules.
 * FLIP-X2 (RUNES-2a section 3 step 6): bb-0.8.7's entry is removed. Release X regenerates every pool under its own rules
 * with the bots' runes, so no release carries an older pool forward now.
 */
export const POOL_RULES_CARRIED: Readonly<Record<string, string>> = {};
/** The rules this build's bot pools were generated under: RULES_VERSION's entry in POOL_RULES_CARRIED, else RULES_VERSION. */
export const POOL_RULES: string = POOL_RULES_CARRIED[RULES_VERSION] ?? RULES_VERSION;

export const CELL = 12; // world pixels per deck cell
export const GRID = 10; // 10x10 construction envelope
export const TICK = 1 / 60; // fixed simulation step (s)
/** NUM-2 (REQ-BFG-047, N1 2.2): SPEED counts shots or slugs per SPEED_K seconds. A turret or factory stores its whole
 *  `speed`; the battle's interval is SPEED_K / speed (secPer), its timers carry their remainder, so the long-run rate is
 *  exactly speed / SPEED_K a second. */
export const SPEED_K = 30;
/** NUM-2: the seconds between two actions at this speed (SPEED_K / speed). */
export const secPer = (speed: number): number => SPEED_K / speed;
/** NUM-2 (N1 2.3): a speed `rate` whole % faster ("X% FASTER": the speed x (100 + X) / 100; the interval x 100 / (100 + X)),
 *  unrounded: the battle rounds the product of all of a machine's rates half up once (Battle.makeTurret, Battle.factoryDef). */
export const rateMul = (rate: number | undefined): number => (100 + (rate ?? 0)) / 100;

export const BELT_SPEED = 30; // px per second at speed state 1.0
export const AMMO_SPACING = 7; // minimum distance between payloads on a belt (px)
export const WINDOW_TIME = 1.5; // chamber loading window closes this long after first load (s)
export const JAM_THRESHOLD = 4; // payloads backed up at a busy chamber before it jams
export const JAM_COOLDOWN = 3.0;
export const DISRUPT_TIME = 2; // Shock disruption duration (s). NUM-3 (REQ-BFG-047, N1 2.2): a ★1 GALVANIC COIL or SPARK STUN, whole seconds (was 1.6)
export const BURN_TIME = 3.0; // each Burn stack deals 1 dmg/s for this long
/** NUM-1 (REQ-BFG-047, N1 2.1): the damage a Burn stack deals each second (x10 of 1), once a second (Battle.hullEffects):
 *  BURN_DPS x BURN_TIME a stack, the same total as before, in whole ticks. */
export const BURN_DPS = 10;
export const FRAY_BONUS = 2; // extra damage per Fray stack on every later hit
export const FRAY_MAX = 15;
export const WIND_WARN = 20; // dark wind warning (s)
export const WIND_START = 25; // dark wind damage begins (s)
export const BATTLE_CAP = 120; // hard stop (s)
/** SUS-A (REQ-BFG-069; SUSTAIN-1 4.2-4.3): SHIELD is a whole count on each side, never above this. Each SHIELD stops one
 *  whole hit (Battle.impact: SHIELD, then PLATE, then HULL); a gain at the cap is lost. Never scaled (a count). */
export const SHIELD_CAP = 3;
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
  shockTime?: number; // GALVANIC COIL 2-3 stars: the STUN in s (1 star: DISRUPT_TIME, 2 s since NUM-3; was 1.6 s, the catalogue's star1)
  jump?: number; // GALVANIC COIL SPARK JUMP: the spark also stalls this many nearest other machines (no RNG)
  guard?: number; // OVERDRIVE REDLINE/AFTERBURNER: GUARD_* flags on the tiles downstream (RouteState.guard)
  toll?: number; // future TOLLBOOTH: harassment hits absorbed on every route this rig reaches
  tollFactory?: boolean; // future TOLLBOOTH star 3: also protect the route's factory
  sift?: number | "all"; // SIFTER: marks removed from a passing payload (NUM-3: SAP only; CHILL and SNAG are gone)
  siftFlat?: number;
  siftClean?: number;
  pulse?: { speed: number; on: number; period: number; flat: number };
  sort?: { every: number; copies: number };
  heal?: number; // SUS-A (REQ-BFG-069; was `repair`): RIVETER, HEAL this much for each payload it hits (Battle.heal)
  heat?: number;
  poison?: number;
  overclockCooldown?: number;
  keg?: { fuse: number; flat: number; burn: number; wide?: boolean };
  // NUM-3 (REQ-BFG-047, N1 2.2): BELLOWS, + `burn` BURN for each `per` s the payload has ridden, at most `max` (was 1 BURN
  // every `seconds`: 2.5 / 1.15 / 0.7 s; now 4 / 9 / 14 BURN for each 10 s, exact at ★1, +3.5% at ★2, -2% at ★3)
  burnPerRide?: { burn: number; per: number; max: number };
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
  brace?: { mul: number; plated: number }; // BRACE FRAME: enemy STUNs on its tiles and itself x mul (x plated while plated; NUM-3: every STUN)
  latch?: { hold: number; flat: number }; // TWIN LATCH: holds a payload at most `hold` s for its other belt (E4); + flat on each payload it hits
  stoke?: number; // STOKER: each factory its arrows point at works this share faster (E3); its arrows do nothing to belts
  breaker?: { flat: number; floor: number }; // PLATE BREAKER: 1 plating for + flat; with none, + floor
}

/**
 * 0.6.1p: RouteState.guard flags. OVERDRIVE ★2 REDLINE sets GUARD_SLOW downstream and ★3 AFTERBURNER adds
 * GUARD_FREEZE (NUM-3, R1's STUN fold: they keep enemy CHAIN and FROST rounds' STUNs off those tiles). GUARD_SKIRT
 * marks a tile a MANTLET shields (★2 FULL GUARD, was FULL PLATE: the last tile, 0.6.2 FB-B; ★3 BULWARK SKIRT: the last 3): the fed
 * turret's immunities cover it (Battle.disrupt).
 */
export const GUARD_SLOW = 1;
export const GUARD_FREEZE = 2;
export const GUARD_SKIRT = 4;

/** 0.6.1p: what stalls a machine (MANTLET immunities). Only "shock" exists in wave 1; wave 2 adds the rest.
 *  NUM-3 (R1's STUN fold, REQ-BFG-046): a cause names the SOURCE; every one but "rip" and "sap" is a STUN now (Battle.disrupt):
 *  "freeze" is a FROSTBITE round, "drag" a DRAG CHAIN round, "sabot" a SABOT's STUN on a part that isn't a rig. */
export type HarassCause = "shock" | "static" | "arc" | "drag" | "freeze" | "sabot" | "rip" | "limpet" | "sap";
/** NUM-3 (R1's STUN fold): every source of a STUN. MANTLET is immune to all of them from ★1 (R1: "IMMUNE TO STUN"). */
export const STUN_CAUSES: readonly HarassCause[] = ["shock", "static", "arc", "drag", "freeze", "sabot", "limpet"];

export interface FactorySpec {
  ammo: AmmoKind;
  speed: number; // NUM-2 (REQ-BFG-047): slugs per SPEED_K (30) s, a whole number; a stamp every 30 / speed s (was `interval`)
  // bb-0.8.3 (REQ-BFG-042 D1-D3): belt slots are no spec number. Every factory's grow with its stars (stars.ts outputsAt:
  // BELT_SLOTS, 2 at ★1, 3 at ★2, 4 at ★3, plus `lead`); 0.8.0's `outputs` (the routes it could feed) is gone.
  lead?: number; // bb-0.8.3 (D2, D3): belt slots a factory has over BELT_SLOTS at every star (the LOOM, GANTRY PRESS: 1)
  // bb-0.8.3 (D4): a pour: one cast puts a slug onto at most this many of its belts with room, all on one tick, taking
  // them in turn when it feeds more (races/foundry.ts pourAll, rule R). Absent: one slug a cycle, onto its belts in turn
  // (Battle.stamp). TWIN MOULD 2 (★3 THIRD SPRUE 3), the CRUCIBLE 2, a ★3 MIMIC FORGE 2 where it makes FOUNDRY's blanks
  pour?: number;
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
  // NUM-3 (R1's STUN fold): a sabot, frost or chain round STUNs the part it hits for `seconds` (Battle.roundImpact)
  round?: { kind: "sabot"; seconds: number; shrapnel?: boolean } | { kind: "frost"; seconds: number; spread: number } |
    { kind: "drag"; seconds: number } | { kind: "limpet"; delay: number; blast: number; stall?: number };
  rate?: number; // MIMIC (NUM-2): a whole rate % on the hero signature factory's speed (was intervalMul, the interval x)
  // 0.8.0 P1, wave 3 (absent on every older factory):
  twin?: boolean; // TWIN MOULD: each cast pours one slug onto up to `pour` belts with room on the same tick (pourAll)
  plate?: { every: number; amount: number }; // ARMOR PRESS: `amount` plating onto your hull every `every` s (FactoryState.plateTimer)
  heal?: { every: number; amount: number }; // SUS-A (REQ-BFG-069), MEND PRESS: HEAL `amount` every `every` s (FactoryState.healTimer; Battle.heal)
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
  fireRate?: number; // NUM-2 (REQ-BFG-047): the turret fires this whole % faster (CALIBRATION, ESCAPEMENT; was fireMul, the interval x)
  longRideFlat?: number; // LONGCASE: bonus on non-curve ammo after enough eligible belt ride
  longRideMin?: number; // minimum eligible ride seconds for longRideFlat
  perShot?: number; // payloads per firing opportunity
  // 0.6.1p (catalogue.json): EXT. CHAMBER WIDE BREECH, HOPPER, MANTLET and FINISHER RAM
  window?: number; // + loading window slots (TurretState.window)
  windowTime?: number; // + seconds before the window closes (TurretState.windowTime; GATLING never reads it)
  store?: number; // HOPPER ★2/★3 (0.6.2 FB-B): loads taken off the belt while the gun fires, dropped into the next window
  noJam?: boolean; // HOPPER ★3 BOTTOMLESS: this turret never jams
  immune?: HarassCause[]; // MANTLET: stalls this turret ignores (Battle.disrupt)
  intakeGuard?: number; // MANTLET ★2 FULL GUARD (1, 0.6.2 FB-B; NUM-3: was FULL PLATE) and ★3 BULWARK SKIRT (3): the last n tiles of each route into this turret share its immunities
  finisher?: number; // FINISHER RAM: + this share of damage on the payload that empties a loading window
  intercept?: number; // future FLAK SCREEN: one side-wide intercept roll per incoming harassment projectile
  rerolls?: number;
  factoryWeight?: number;
  alwaysMachine?: boolean;
  // 0.8.0 P1, wave 3 (absent on every older mod; TWIN TRIGGER's shorter load time is a negative windowTime above):
  pairBonus?: number; // TWIN TRIGGER: paired loads (E2) deal this share more damage
  spall?: { every: number; add: number; max: number }; // SPALL CATCHER: every `every` damage taken adds `add` to the next shot, up to `max`
  seam?: { pair: number; lone: number }; // SEAM WELDER: plating for each pair this turret takes, and for each other load
  // SUS-A (REQ-BFG-069; absent on every older mod):
  shield?: { every: number; amount: number }; // WARD BELL: + `amount` SHIELD every `every` s (TurretState.bell), the first at t = every
  regen?: number; // MENDING LOOM: REGEN, this much hull healed at each whole second (Battle.sustainTick; Battle.heal)
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
  fireRate?: number; // ROTARY (NUM-2): fires this whole % faster (was intervalMul, the interval x)
  noJam?: boolean; // ROTARY 3 stars, PRESSURE: never jams
  perQueued?: number; // PRESSURE: flat damage per payload queued at the turret (absolute)
  maxCount?: number; // PRESSURE: payloads counted at most
  start?: number; // GATLING (NUM-2): its whole rate % before any spin (-17; was the interval multiplier 1.2)
  step?: number; // GATLING: each quick shot cuts the spin (the interval multiplier, 100 / (100 + rate)) by this
  top?: number; // GATLING (NUM-2): its whole rate % at full spin (+67 / +150 / +245; was floor, the lowest multiplier)
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
  steamPlated?: number; // STEAM BREECH (NUM-2): fires this whole % faster while your hull holds plating (was the interval x)
  steamBare?: number; // STEAM BREECH (NUM-2): fires this whole % faster without plating (was the interval x)
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
  speed: number; // NUM-2 (REQ-BFG-047): shots per SPEED_K (30) s, a whole number; the battle's interval is 30 / speed (was fireInterval)
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
  // 0.6.1a: star overrides (1 star = the spec above). bb-0.8.3 (REQ-BFG-043 D10): a hero's signature factory's are its
  // FACTORY upgrade levels 2-4 instead (it has no stars; stars.ts gradeOf)
  levels?: { 2?: ItemLevel; 3?: ItemLevel; 4?: ItemLevel };
  tags?: ModuleTag[]; // 0.6.1b: the shop tags (a hint only); 0.8.0 P1: family map v2, 1-3 on every buyable module
}

export const ITEMS: Record<string, ItemDef> = {
  // --- signature factories (no merchant sells them, no shop offers them) ---
  // bb-0.8.3 (REQ-BFG-043, REQ-BFG-044 D10): a hero's signature factory never merges and has no stars. It goes from level
  // 1 to level 4 through the hero's FACTORY upgrade (UPGRADE_PRICE gold, bought in the caravan outside the shop roll;
  // build.upgrades.factory), with 2 / 3 / 4 / 5 belt slots (the LOOM 3 / 4 / 5 / 6: `lead` 1). Its levels grow ONLY its
  // cycle (the Prime's oracle 6c20deea1363d0bb, D2), on the house's curve's interval steps: x 11/14 at level 2, then x 11/13
  // at level 3 and again at level 4, each from the unrounded level before, to 0.01 s (tests/belts.upgrades.test.ts derives
  // them); its base stays its level-1 value, because its own rules multiply base (the fuse, the ride scaling, the leech).
  // No perk name. Its own rules keep their kind (cinder ride scaling, the KILN BREECH, the LOOM's thread, the CRUCIBLE's
  // pour of 2 and the fuse, the bulwark plating, the pendulum's curve, the leech).
  kiln: {
    id: "kiln", name: "KILN", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["STAMPS CINDER SLUGS.", "SLUGS HEAT UP WHILE", "THEY RIDE THE BELT."],
    factory: { ammo: "cinder", speed: 24 }, // base 4: the cinder slug's
    levels: { 2: { factory: { speed: 30 } }, 3: { factory: { speed: 36 } }, 4: { factory: { speed: 42 } } },
  },
  loom: {
    id: "loom", name: "LOOM", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["WEAVES THREAD SLUGS", "THAT FRAY THE HULL", "ONTO MANY BELTS."], // bb-0.8.3 (M4): was "INTO UP TO 3 ROUTES. HITS STACK FRAY."
    factory: { ammo: "thread", speed: 42, lead: 1 }, // base 3: the thread slug's; WEAVER's belt specialist: one more slot
    levels: { 2: { factory: { speed: 53 } }, 3: { factory: { speed: 64 } }, 4: { factory: { speed: 75 } } },
  },
  // --- generic factory ---
  press: {
    id: "press", name: "STAMP PRESS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "ironmonger",
    desc: ["STAMPS PLAIN SLUGS", "STEADILY. NEEDS A", "FREE TURRET INTAKE."], tags: ["SWARM"],
    factory: { ammo: "plain", speed: 21 },
    levels: { // 0.6.1p: the dies (base damage 5 / 7.5, Payload.base) are applied
      2: { factory: { speed: 27, base: 50 }, perk: "HARDENED DIES" },
      3: { factory: { speed: 30, base: 75 }, perk: "MASTER DIES" },
    },
  },
  // --- 0.6.1c: the six wave-1 factories (catalogue.json; ARSENAL.md §3.3 "Buyable factories"), values exactly ---
  doublestamp: {
    id: "doublestamp", name: "DOUBLE STAMP", kind: "factory", rarity: "rare", price: 6, size: 2, merchant: "ironmonger",
    desc: ["STAMPS TWO PLAIN", "SLUGS AT A TIME.", "QUEUE PRESSURE."], tags: ["SWARM"],
    factory: { ammo: "plain", speed: 14, batch: 2 }, // base 3: the plain slug's
    levels: {
      2: { factory: { speed: 19, base: 50 } },
      3: { factory: { batch: 3 }, perk: "TRIPLE DIES" },
    },
  },
  shottower: {
    id: "shottower", name: "SHOT TOWER", kind: "factory", rarity: "rare", price: 6, size: 2, merchant: "gunsmith",
    desc: ["DROPS 3 BUCKSHOT", "AT A TIME.", "RIGS HIT EACH ONE."], tags: ["SWARM"], // beltside-062c: RIG (DESIGN §1)
    factory: { ammo: "shot", speed: 20, batch: 3 }, // base 1: AMMO.shot
    levels: { 2: { factory: { speed: 22, base: 20 } }, 3: { factory: { speed: 23, base: 30 } } },
  },
  hotswap: {
    id: "hotswap", name: "HOT SWAP", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "quartermaster",
    desc: ["ALTERNATES EMBER", "SLUGS (2 BURN) AND", "SPARK SLUGS (SHOCK)."], tags: ["FORGE", "HARASS"],
    factory: { ammo: "plain", speed: 20, cycle: [{ tint: "ember", burn: 2 }, { tint: "spark", shock: true }] },
    levels: { // NUM-3 (N1 2.2): STUN 2 / 2 / 3 s (was 1.6 / 1.8 / 2.8). The spark tracks GALVANIC COIL: its ★2 / ★3 shockTime with SPARK JUMP (0.6.1p's shockTime and jump)
      2: { factory: { speed: 23, cycle: [{ tint: "ember", burn: 4 }, { tint: "spark", shock: true, shockTime: 2, jump: 1 }] } },
      3: { factory: { speed: 27, cycle: [{ tint: "ember", burn: 7 }, { tint: "spark", shock: true, shockTime: 3, jump: 1 }] } },
    },
  },
  slagpot: {
    id: "slagpot", name: "SLAG POT", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "ironmonger",
    desc: ["HEAVY SLAG SLUGS", "THAT IGNORE", "BELT SPEED RIGS."], tags: ["FORGE", "BURST"], // beltside-062c: RIG (DESIGN §1)
    factory: { ammo: "slag", speed: 11 }, // base 7: AMMO.slag (fixed 0.75x belt speed)
    levels: { 2: { factory: { speed: 14, base: 120 } }, 3: { factory: { speed: 17, base: 150 } } },
  },
  assembly: {
    id: "assembly", name: "ASSEMBLY LINE", kind: "factory", rarity: "common", price: 5, size: 2, merchant: "ironmonger",
    desc: ["SLOW PLAIN SLUGS, AND", "ALL YOUR RIGS", "COME ONLINE SOONER."], tags: ["TEMPO", "SWARM"], // beltside-062c: RIG (DESIGN §1)
    factory: { ammo: "plain", speed: 17, commission: 0.5 },
    levels: {
      2: { factory: { speed: 17, commission: 0.25, base: 45 } },
      3: { factory: { speed: 17, commission: 0, hotStart: 4, base: 60 }, perk: "HOT START" },
    },
  },
  gantry: {
    id: "gantry", name: "GANTRY PRESS", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "tinker",
    desc: ["A FAST PRESS THAT", "FEEDS ONE BELT MORE", "THAN MOST, IN TURN."], tags: ["SWARM", "TWIN"], // bb-0.8.3 (M4): was "ONE PRESS, TWO OUTPUTS: FEEDS TWO INTAKES BY TURNS."
    // base 3: the plain slug's. bb-0.8.3 (REQ-BFG-042 D3): GANTRY PRESS keeps a lead of one belt over every bought
    // factory at every star (3 / 4 / 5); ★2 is FOURTH ARM (4 belts, interval 0.7 as THIRD ARM's), ★3 HEAVY GANTRY (5)
    factory: { ammo: "plain", speed: 25, lead: 1 },
    levels: {
      2: { factory: { speed: 43 }, perk: "FOURTH ARM" },
      3: { factory: { base: 60 }, perk: "HEAVY GANTRY" },
    },
  },
  scrapper: {
    id: "scrapper", name: "SCRAPPER", kind: "factory", rarity: "rare", price: 6, size: 2, merchant: "scrapper",
    desc: ["STAMPS SCRAP SLUGS", "WHEN HARASSMENT HITS", "FOE, OR EVERY 3S."], tags: ["HARASS", "SWARM"],
    factory: { ammo: "plain", speed: 10, trigger: "harass", scrapFlat: 30 },
    levels: { 2: { factory: { speed: 12, scrapFlat: 65 } }, 3: { factory: { speed: 15, scrapFlat: 105, bigHaul: true }, perk: "BIG HAUL" } },
  },
  sabot: {
    id: "sabot", name: "SABOT FOUNDRY", kind: "factory", rarity: "epic", price: 9, size: 2, merchant: "quartermaster",
    desc: ["TELEGRAPHED ROUNDS", "WRECK RIGS OR STUN", "OTHER MACHINERY."], tags: ["HARASS", "BURST"],
    // NUM-3 (R1's STUN fold): the stalls 5 / 4 / 3 s (belt tile / factory / turret) became one STUN 4 s; the bare-hull +60 is gone
    factory: { ammo: "sabot", speed: 5, round: { kind: "sabot", seconds: 4 } },
    levels: { 2: { factory: { speed: 11 } }, 3: { factory: { speed: 16, round: { kind: "sabot", seconds: 4, shrapnel: true } }, perk: "SHRAPNEL" } },
  },
  frostbite: {
    id: "frostbite", name: "FROSTBITE FOUNDRY", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "arcane",
    desc: ["FROST ROUNDS STUN", "THE ENEMY PART", "THEY HIT."], tags: ["HARASS"], // NUM-3 (R1's STUN fold): FREEZE became STUN
    // NUM-3 (N1 2.2): STUN 2 / 3 / 3 s (was 2.5 / 2.75 / 3)
    factory: { ammo: "frost", speed: 11, round: { kind: "frost", seconds: 2, spread: 0 } },
    levels: { 2: { factory: { round: { kind: "frost", seconds: 3, spread: 1 } }, perk: "HOARFROST" },
      3: { factory: { round: { kind: "frost", seconds: 3, spread: 2 } }, perk: "HOARFROST" } },
  },
  dragchain: {
    id: "dragchain", name: "DRAG CHAIN FOUNDRY", kind: "factory", rarity: "common", price: 5, size: 2, merchant: "scrapper",
    desc: ["CHAIN ROUNDS STUN", "THE ENEMY PART", "THEY HIT."], tags: ["HARASS", "TEMPO"],
    // NUM-3 (R1's STUN fold): the belt slow (x0.6 / x0.4 / x0.3 for 3 / 4.4 / 6 s over a rig-to-rig stretch), SNAG and the
    // factory +0.8 s / turret +0.5 s delays became one STUN on the part it hits: R1's 1 / 1.5, and ★3 2 (today's slow
    // grows x6 / 4.4 from ★2 to ★3: 1.5 x 1.36 = 2.05)
    factory: { ammo: "drag", speed: 17, round: { kind: "drag", seconds: 1 } },
    levels: { 2: { factory: { round: { kind: "drag", seconds: 2 } } }, // NUM-3 (N1 2.2): R1's 1.5 s is 2
      // FLIP-X2 (REVIEW-NUM3 F1): ★3 STUNs 3 s (was 2, the same as ★2), so the ladder reads 1 / 2 / 3 like STATIC BRUSH's
      3: { factory: { round: { kind: "drag", seconds: 3 } } } },
  },
  mimic: {
    id: "mimic", name: "MIMIC FORGE", kind: "factory", rarity: "legendary", price: 11, size: 2, merchant: "arcane",
    desc: ["STAMPS YOUR HERO'S", "SIGNATURE AMMO FROM", "A SECOND FACTORY."], tags: ["SWARM"], // bb-0.8.3 (M4): was "INTO A SECOND ROUTE."
    // bb-0.8.3 (REQ-BFG-042 D3): belt slots by stars as every bought factory's; ★3 TWIN SIGNET keeps intervalMul 0.8, and
    // where it makes FOUNDRY's blanks it pours 2 (Battle.factoryDef keeps `pour` only for a blank-ammo hero); below ★3, and
    // on every other hero, it feeds its belts one slug at a time, in turn
    factory: { ammo: "plain", speed: 30, rate: -29 },
    levels: { 2: { factory: { rate: 0 } }, 3: { factory: { rate: 25, pour: 2 }, perk: "TWIN SIGNET" } },
  },
  limpet: {
    id: "limpet", name: "LIMPET WORKS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "scrapper",
    desc: ["STICKY CHARGES BLOW", "3 SECONDS LATER FOR", "HULL DAMAGE."], tags: ["HARASS", "BURST"], // 0.6.2t 0b.1: no stall at 1 star
    factory: { ammo: "limpet", speed: 13, round: { kind: "limpet", delay: 3, blast: 80 } },
    levels: { 2: { factory: { round: { kind: "limpet", delay: 3, blast: 180, stall: 1 } } },
      3: { factory: { round: { kind: "limpet", delay: 3, blast: 280, stall: 2 } } } }, // NUM-3 (N1 2.2): the stall 1 / 2 s (was 1 / 1.6)
  },
  // --- processing gates ---
  temper: {
    id: "temper", name: "TEMPER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    desc: ["ADDS 1 BURN.", "EACH BURN DEALS 10", "A SECOND FOR 3S."], tags: ["FORGE"],
    gate: { burn: 1 },
    levels: { 2: { gate: { burn: 2 } }, 3: { gate: { burn: 4 } } },
  },
  whetstone: {
    id: "whetstone", name: "WHETSTONE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    desc: ["+20 DAMAGE.", "BEFORE A SPLITTER,", "BOTH COPIES GAIN IT."], tags: ["FORGE"],
    gate: { flat: 20 },
    levels: { 2: { gate: { flat: 40 } }, 3: { gate: { flat: 70 } } },
  },
  grease: {
    id: "grease", name: "GREASE WORKS", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker",
    desc: ["BELT RUNS 60% FASTER", "FROM ITS HIT. LOCKED", "BELTS GAIN DAMAGE."], tags: ["TEMPO"],
    gate: { speed: 1.6, lockedFlat: 10 },
    levels: { 2: { gate: { speed: 2.3, lockedFlat: 20 } }, 3: { gate: { speed: 3.1, lockedFlat: 40 } } },
  },
  brake: {
    id: "brake", name: "BRAKE SHOE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker",
    desc: ["HALF SPEED FROM HIT.", "LOCKED BELTS GAIN", "DAMAGE INSTEAD."], tags: ["FORGE", "TEMPO"],
    gate: { speed: 0.5, lockedFlat: 20 },
    levels: { // 0.6.1f: the slow stays at half speed (a deeper one starved the turret); the merge pays in friction heat
      2: { gate: { speed: 0.5, flat: 20, lockedFlat: 40 }, perk: "HOT SHOE" },
      3: { gate: { speed: 0.5, flat: 50, lockedFlat: 70 }, perk: "RED-HOT SHOE" },
    },
  },
  longhaul: {
    id: "longhaul", name: "LONG HAUL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "tinker", shape: "II",
    desc: ["MORE DAMAGE FOR EACH", "HIT THE PAYLOAD", "ALREADY TOOK."], tags: ["FORGE", "BURST"],
    gate: { perPriorGate: 10 },
    levels: { // 0.6.1p: priorCap applied (1 star counts every prior gate, as in 0.6.0)
      2: { gate: { perPriorGate: 20, priorCap: 6 } },
      3: { gate: { perPriorGate: 35, priorCap: 6 } },
    },
  },
  coil: {
    id: "coil", name: "GALVANIC COIL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist", shape: "L",
    desc: ["ADDS SHOCK. A SHOCK", "HIT STUNS THE ENEMY", "MACHINE IT STRIKES."], tags: ["HARASS"],
    gate: { shock: true }, // 1 star STUNs DISRUPT_TIME (NUM-3: 2 s; was 1.6 s, catalogue star1, as in 0.6.0)
    levels: { // 0.6.1p: the stall in seconds and SPARK JUMP are applied. NUM-3 (N1 2.2): STUN 2 / 2 / 3 s (was 1.6 / 1.8 / 2.8)
      2: { gate: { shockTime: 2, jump: 1 }, perk: "SPARK JUMP" },
      3: { gate: { shockTime: 3, jump: 1 }, perk: "SPARK JUMP" },
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
    desc: ["4 ARROWS: 3 TIMES THE", "SPEED; LOCKED BELTS", "GAIN DAMAGE."], tags: ["TEMPO"],
    gate: { speed: 3, lockedFlat: 30 },
    levels: { // 0.6.1p: AFTERBURNER's +3 flat applied; NUM-3: the guard flags keep enemy CHAIN / FROST rounds' STUNs off its tiles
      2: { gate: { speed: 4, flat: 10, lockedFlat: 50, guard: GUARD_SLOW }, perk: "REDLINE" },
      3: { gate: { speed: 5, flat: 30, lockedFlat: 110, guard: GUARD_SLOW | GUARD_FREEZE }, perk: "AFTERBURNER" },
    },
  },
  tollbooth: {
    id: "tollbooth", name: "TOLLBOOTH", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "ironmonger",
    desc: ["GUARDS ITS BELT", "FROM THE FIRST 2", "HARASSMENT HITS."], tags: ["HARASS", "PLATE"],
    gate: { toll: 2 }, levels: { 2: { gate: { toll: 4 } }, 3: { gate: { toll: 7, tollFactory: true }, perk: "FACTORY GUARD" } },
  },
  sifter: {
    id: "sifter", name: "SIFTER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist",
    // NUM-3 (R1's STUN fold): CHILL and SNAG are gone; SAP is the one mark left, and no piece gives it yet: ★1 and ★2 POLISH
    // do nothing in play, ★3 FINE MESH's siftClean lands on every payload. FLIP-X2: dormant (races/data.ts DORMANT_ITEMS)
    desc: ["REMOVES SAP FROM", "PASSING PAYLOADS."], tags: ["HARASS", "FORGE", "PLATE"],
    gate: { sift: 1 }, levels: { 2: { gate: { sift: "all", siftFlat: 10 }, perk: "POLISH" },
      3: { gate: { sift: "all", siftFlat: 20, siftClean: 10 }, perk: "FINE MESH" } },
  },
  surge: {
    id: "surge", name: "SURGE VALVE", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "tinker",
    desc: ["PULSES 3 TIMES SPEED", "FOR 1S EVERY 3S, AND", "EACH PULSE RIDDEN", "ADDS DAMAGE."], tags: ["TEMPO", "BURST", "FORGE"],
    // 0.6.2 (REQ-BFG-021): a tempo-locked belt ignores the pulse and its per-pulse flat, so, like every other speed rig,
    // SURGE pays locked belts damage instead: a rare's 3/6/10 (between BRAKE SHOE's 2/4/7 and OVERDRIVE's 3/6/11)
    // 0.6.2 FB-B (oracle 16085a6430e4cc6a): the per-pulse flat is 1/2/3 (was 0/1/2). At ★1 the pulse cut ride time on
    // ride-scaled ammo and added nothing when the turret was the bottleneck (Furnace's audit cell: 78.3 -> 71.5)
    gate: { pulse: { speed: 3, on: 1, period: 3, flat: 10 }, lockedFlat: 30 },
    // NUM-3 (N1 2.2): the period 3 / 3 / 2 s (was 3 / 2.5 / 2)
    levels: { 2: { gate: { pulse: { speed: 4, on: 1, period: 3, flat: 20 }, lockedFlat: 60 }, perk: "OVERPRESSURE" },
      3: { gate: { pulse: { speed: 5, on: 1, period: 2, flat: 30 }, lockedFlat: 100 }, perk: "HAMMER VALVE" } },
  },
  sorting: {
    id: "sorting", name: "SORTING ARM", kind: "gate", rarity: "epic", price: 7, size: 1, merchant: "tinker",
    desc: ["COPIES EVERY THIRD", "PAYLOAD AT FULL", "STRENGTH."], tags: ["SWARM"],
    gate: { sort: { every: 3, copies: 2 } }, levels: { 2: { gate: { sort: { every: 2, copies: 2 } }, perk: "QUICK SORT" },
      3: { gate: { sort: { every: 2, copies: 3 } }, perk: "TRIPLE SORT" } },
  },
  riveter: {
    id: "riveter", name: "RIVETER", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "ironmonger",
    desc: ["EACH PASSING SLUG", "HEALS YOUR HULL", "A LITTLE."], tags: ["SWARM", "PLATE"],
    gate: { heal: 6 }, levels: { 2: { gate: { heal: 13 } }, 3: { gate: { heal: 21 } } }, // SUS-A (REQ-BFG-069): repair -> heal
  },
  heatjacket: {
    id: "heatjacket", name: "HEAT JACKET", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "quartermaster",
    desc: ["ADDS +4 DAMAGE FOR", "EACH SECOND RIDDEN", "AFTER THIS RIG."], tags: ["FORGE"],
    gate: { heat: 4 }, levels: { 2: { gate: { heat: 9 } }, 3: { gate: { heat: 14 } } },
  },
  venom: {
    id: "venom", name: "VENOM DRIP", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "alchemist",
    desc: ["ADDS 2 POISON.", "POOL TICKS AND", "REFRESHES ON HIT."], tags: ["SWARM", "FORGE"],
    gate: { poison: 2 }, levels: { 2: { gate: { poison: 4 } }, 3: { gate: { poison: 7 } } },
  },
  overclocker: {
    id: "overclocker", name: "OVERCLOCKER", kind: "gate", rarity: "rare", price: 6, size: 1, merchant: "tinker",
    desc: ["DOUBLES THE NEXT", "BOOSTABLE RIG ONCE,", "THEN COOLS FOR 4S."], tags: ["FORGE", "BURST", "TEMPO"],
    gate: { overclockCooldown: 4 }, levels: { 2: { gate: { overclockCooldown: 2 } }, 3: { gate: { overclockCooldown: 1 } } }, // NUM-3 (N1 2.2): the rest 4 / 2 / 1 s (was 4 / 1.8 / 1.15)
  },
  keg: {
    id: "keg", name: "POWDER KEG", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "scrapper",
    desc: ["BLOWS AT 12S:", "PAYLOADS ON ITS BELT", "GAIN DAMAGE AND BURN."], tags: ["FORGE", "BURST", "TEMPO"],
    gate: { keg: { fuse: 12, flat: 60, burn: 1 } }, levels: { 2: { gate: { keg: { fuse: 10, flat: 130, burn: 2 } } },
      3: { gate: { keg: { fuse: 8, flat: 210, burn: 3, wide: true } }, perk: "WIDE BLAST" } },
  },
  bellows: {
    id: "bellows", name: "BELLOWS", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist",
    desc: ["ADDS BURN FROM", "RIDE TIME SO FAR,", "UP TO 4 STACKS."], tags: ["FORGE"],
    gate: { burnPerRide: { burn: 4, per: 10, max: 4 } }, levels: { 2: { gate: { burnPerRide: { burn: 9, per: 10, max: 9 } } },
      3: { gate: { burnPerRide: { burn: 14, per: 10, max: 14 } } } },
  },
  quench: {
    id: "quench", name: "QUENCH TANK", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "alchemist",
    desc: ["MORE DAMAGE TO EVERY", "PAYLOAD; TURNS UP TO", "4 BURN INTO DAMAGE."], tags: ["FORGE"],
    // 0.6.2 FB-B (oracle 16085a6430e4cc6a): a Burn stack deals 1 dmg/s for BURN_TIME (3 s), so each stack QUENCH spends
    // pays at least that (+3/+5/+7), and it spends only the 4/5/6 it pays for (more stays Burn). Every payload it hits
    // also hardens +1/+2/+3 (EDGE), below WHETSTONE's 2/4/7, so a QUENCH with no Burn to spend isn't dead but stays a
    // Burn payoff. Was: all Burn at +2/+4/+6 each, capped at +12/+26/+42 (★1 turned 2 Burn, 6 damage, into +4).
    gate: { quench: { flat: 10, perBurn: 30, stacks: 4 } }, levels: { 2: { gate: { quench: { flat: 20, perBurn: 50, stacks: 5 } } },
      3: { gate: { quench: { flat: 30, perBurn: 70, stacks: 6 } } } },
  },
  staticbrush: {
    id: "staticbrush", name: "STATIC BRUSH", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist",
    desc: ["BARE-HULL HITS", "STUN A RANDOM", "ENEMY TURRET."], tags: ["HARASS"],
    gate: { staticTime: 1 }, levels: { 2: { gate: { staticTime: 2 } }, 3: { gate: { staticTime: 3 } } }, // NUM-3 (N1 2.2): STUN 1 / 2 / 3 s (was 0.6 / 1.3 / 2.1)
  },
  lodestone: {
    id: "lodestone", name: "LODESTONE", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "arcane",
    desc: ["MORE DAMAGE ALWAYS,", "MORE FOR EACH ENEMY", "MACHINE STUNNED."], tags: ["HARASS", "FORGE"],
    // 0.6.2 TUNE-M T2 (the Prime's decision, as QUENCH TANK's oracle 16085a6430e4cc6a): a floor, +1/+2/+3 flat on every
    // payload it hits (below WHETSTONE's 2/4/7), with the per-stalled bonus on top. Was the per-stalled bonus alone, so
    // a deck with no stall source got nothing from it at any star (NO EFFECT on FB-A and RB; CAND-A ablation FURNACE
    // d10 -5.4).
    gate: { flat: 10, perStalled: { each: 10, max: 60 } }, levels: { 2: { gate: { flat: 20, perStalled: { each: 22, max: 130 } } },
      3: { gate: { flat: 30, perStalled: { each: 35, max: 210 } } } },
  },
  barbed: {
    id: "barbed", name: "BARBED SPOOL", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "quartermaster",
    desc: ["HITS ADD 1 FRAY.", "LATER HITS DEAL", "+2 FOR EACH STACK."], tags: ["SWARM", "FORGE"],
    gate: { fray: 1 }, levels: { 2: { gate: { fray: 2, frayCap: 3 }, perk: "RAZOR WIRE" },
      3: { gate: { fray: 3, frayCap: 6 }, perk: "RAZOR WIRE" } },
  },
  counterweight: {
    id: "counterweight", name: "COUNTERWEIGHT", kind: "gate", rarity: "rare", price: 4, size: 1, merchant: "scrapper",
    desc: ["+5 DAMAGE FOR EACH", "BELT TILE ALREADY", "RIDDEN, MAX +60."], tags: ["FORGE"],
    gate: { perTile: { each: 5, max: 60 } }, levels: { 2: { gate: { perTile: { each: 11, max: 130 } } },
      3: { gate: { perTile: { each: 18, max: 210 } } } },
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
    mod: { fireRate: 33 },
    levels: { 2: { mod: { fireRate: 72 } }, 3: { mod: { fireRate: 117 } } },
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
    desc: ["CHAMBER HOLDS 1 MORE", "LOAD; ITS LOAD TIME", "RUNS LONGER."], tags: ["BURST", "TEMPO"],
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
    desc: ["ARMORED TURRET:", "NO STUN CAN", "STOP IT."], tags: ["HARASS", "PLATE"],
    // NUM-3 (R1's STUN fold): immune to every STUN source from ★1 (was shock, static, arc and chain; ★2 added frost and
    // sabot; LIMPET's stall was in no star's list)
    mod: { immune: [...STUN_CAUSES] },
    levels: {
      // 0.6.2 FB-B (oracle 16085a6430e4cc6a): FULL PLATE also shields the belt tile feeding its turret (intakeGuard 1),
      // and the rigs working it (DESIGN §11 P6), against the same stalls. Freeze and sabot rounds almost never strike
      // the turret itself, so FULL PLATE alone changed no star-bench fight (the MANTLET ★2 NO EFFECT rows).
      // NUM-3: the perk is FULL GUARD (the sustain design's rename; was FULL PLATE); ★2 and ★3 keep only the tile shield
      2: { mod: { intakeGuard: 1 }, perk: "FULL GUARD" },
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
    desc: ["FIRES THE OLDEST", "LOAD FIRST. LOAD", "TIME 50% SHORTER."], tags: ["TEMPO"],
    core: { routine: "rotary", order: "FIFO", windowTime: 0.75 }, // NUM-3 (N1 2.2): LOAD 50% SHORTER, WINDOW_TIME 1.5 s x 50% (was 0.8 s)
    levels: {
      2: { core: { fireRate: 18 }, perk: "GREASED RACE" },
      3: { core: { fireRate: 43, noJam: true }, perk: "CLEAN FEED" },
    },
  },
  pressure: {
    // 0.6.2m (REQ-BFG-033): sold by the GUNSMITH (was the TINKER; see MERCHANTS)
    id: "pressure", name: "PRESSURE BREECH", kind: "core", rarity: "common", price: 4, size: 1, merchant: "gunsmith",
    desc: ["+12 DAMAGE FOR EACH", "PAYLOAD QUEUED AT", "IT. NEVER JAMS."], tags: ["SWARM", "BURST"],
    core: { routine: "pressure", perQueued: 12, maxCount: 5, noJam: true },
    levels: { 2: { core: { perQueued: 26 } }, 3: { core: { perQueued: 42 } } },
  },
  gatling: {
    id: "gatling", name: "GATLING SPOOL", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "gunsmith",
    // no loading window: a Prime-approved deviation from catalogue row 4 (oracle 5624d721a73a6282; cores.ts gatlingReady)
    desc: ["NEVER WAITS: FIRES", "EACH LOAD AT ONCE.", "EACH QUICK SHOT 6%", "FASTER, UP TO +67%."], tags: ["TEMPO", "SWARM"],
    core: { routine: "gatling", start: -17, step: 0.06, top: 67, gap: 2.5 },
    levels: { 2: { core: { step: 0.09, top: 150 } }, 3: { core: { step: 0.12, top: 245 } } },
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
    core: { routine: "drake", flatPerBurn: 20, addBurn: 1, burnTime: 4, flightMul: 0.7 },
    levels: {
      2: { core: { flatPerBurn: 15, addBurn: 2, burnTime: 5 } },
      3: { core: { flatPerBurn: 10, addBurn: 3, burnTime: 6 } },
    },
  },
  // The catalogue's merchant is the Quartermaster, who arrives with job 0.6.1d; the Gunsmith sells it until then.
  salvo: {
    id: "salvo", name: "SALVO RACK", kind: "core", rarity: "epic", price: 7, size: 1, merchant: "gunsmith",
    desc: ["WAITS FOR A FULL", "WINDOW, THEN FIRES", "IT ALL, HARDER."], tags: ["BURST"],
    core: { routine: "salvo", volleyFlat: 20, reloadMul: 1.6 },
    levels: { 2: { core: { volleyFlat: 44 } }, 3: { core: { volleyFlat: 70 } } },
  },
  mortar: {
    id: "mortar", name: "MORTAR TUBE", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "ironmonger",
    desc: ["ITS LOB FLIES LONGER", "AND SPLASHES ONE", "MORE TARGET AT 50%."], tags: ["BURST", "HARASS"],
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
    desc: ["HITS ARC TO THE", "NEAREST MACHINE FOR", "25% PLUS A 1S STUN."], tags: ["HARASS"],
    core: { routine: "tesla", arcs: 1, stall: 1, share: 0.25 }, // NUM-3 (N1 2.2): STUN 1 s at every star (was 0.8 / 0.9 / 0.93)
    levels: { 2: { core: { arcs: 2, stall: 1 } }, 3: { core: { arcs: 3, stall: 1, share: 0.3 } } },
  },
  capacitor: {
    id: "capacitor", name: "CAPACITOR BANK", kind: "core", rarity: "epic", price: 7, size: 1, merchant: "arcane",
    desc: ["IDLE TIME CHARGES", "ITS NEXT SHOT, FOR", "UP TO 5S."], tags: ["BURST", "TEMPO"],
    core: { routine: "capacitor", perSecond: 20, maxSeconds: 5 },
    levels: { 2: { core: { perSecond: 44 } }, 3: { core: { perSecond: 70 } } },
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
    desc: ["HEAVY TURRET.", "A STEADY GUN.", "HOLDS 3 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A heavy gun that takes a belt on both columns.",
    turret: { class: "heavy", speed: 30, window: 3, flight: 0.6, intake: "both" },
    levels: { 2: { turret: { speed: 33 } }, 3: { turret: { speed: 38 } } },
  },
  rampart: {
    id: "rampart", name: "RAMPART CANNON", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["HEAVY TURRET.", "A STEADY GUN.", "HOLDS 3 LOADS."], tags: ["BURST", "TEMPO", "TWIN"],
    reason: "A quicker heavy gun with a slower shell.",
    turret: { class: "heavy", speed: 40, window: 3, flight: 0.65, intake: "both" },
    levels: { 2: { turret: { speed: 44 } }, 3: { turret: { speed: 50 } } },
  },
  dartgun: {
    id: "dartgun", name: "DART GUN", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "A STEADY GUN.", "HOLDS 2 LOADS."], tags: ["SWARM"],
    reason: "A fast light gun on one inner column.",
    turret: { class: "light", speed: 55, window: 2, flight: 0.34, intake: "inner" },
    levels: { 2: { turret: { speed: 61 } }, 3: { turret: { speed: 68 } } },
  },
  spikegun: {
    id: "spikegun", name: "SPIKE GUN", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "A STEADY GUN.", "HOLDS 2 LOADS."], tags: ["SWARM"],
    reason: "A light gun on one inner column.",
    turret: { class: "light", speed: 50, window: 2, flight: 0.34, intake: "inner" },
    levels: { 2: { turret: { speed: 56 } }, 3: { turret: { speed: 63 } } },
  },
  carronade: {
    id: "carronade", name: "CARRONADE", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["MEDIUM TURRET.", "A STEADY GUN.", "HOLDS 2 LOADS."], tags: ["SWARM", "TWIN"],
    reason: "A medium gun that takes a belt on both columns.",
    turret: { class: "medium", speed: 38, window: 2, flight: 0.45, intake: "both" },
    levels: { 2: { turret: { speed: 42 } }, 3: { turret: { speed: 47 } } },
  },
  swivel: {
    id: "swivel", name: "SWIVEL GUN", kind: "turret", rarity: "common", price: TURRET_PRICE.common, size: 2, merchant: "gunsmith",
    desc: ["ADAPTABLE TURRET.", "A STEADY GUN.", "HOLDS 3 LOADS."], tags: ["TEMPO", "TWIN"],
    reason: "An adaptable gun on both columns.",
    turret: { class: "adaptable", speed: 43, window: 3, flight: 0.55, intake: "both" },
    levels: { 2: { turret: { speed: 48 } }, 3: { turret: { speed: 54 } } },
  },
  // 0.6.2s S3: seven more turrets, a rare and an epic of each of light, medium and heavy, and one legendary. Each
  // differs from its class's commons in fireInterval, window, flight or intake, and only in those (no new battle
  // mechanics). Same star values as the commons: ★2 fire interval x0.9, ★3 x0.8, window unchanged.
  twinneedle: {
    id: "twinneedle", name: "TWIN NEEDLE", kind: "turret", rarity: "rare", price: TURRET_PRICE.rare, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "A STEADY GUN.", "HOLDS 2 LOADS."], tags: ["SWARM", "TWIN"],
    reason: "A light gun that takes belts on both columns.",
    turret: { class: "light", speed: 55, window: 2, flight: 0.34, intake: "both" },
    levels: { 2: { turret: { speed: 61 } }, 3: { turret: { speed: 68 } } },
  },
  hailgun: {
    id: "hailgun", name: "HAIL GUN", kind: "turret", rarity: "epic", price: TURRET_PRICE.epic, size: 2, merchant: "gunsmith",
    desc: ["LIGHT TURRET.", "A STEADY GUN.", "HOLDS 3 LOADS."], tags: ["SWARM", "TEMPO"],
    reason: "The fastest gun, with 3 loads.", // FLIP-X2 (REVIEW-FLIPX1 answer 5): counts as digits (was "three loads")
    turret: { class: "light", speed: 67, window: 3, flight: 0.3, intake: "inner" },
    levels: { 2: { turret: { speed: 74 } }, 3: { turret: { speed: 83 } } },
  },
  deckgun: {
    id: "deckgun", name: "DECK GUN", kind: "turret", rarity: "rare", price: TURRET_PRICE.rare, size: 2, merchant: "gunsmith",
    desc: ["MEDIUM TURRET.", "A STEADY GUN.", "HOLDS 3 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A medium gun that holds 3 loads, so fewer loads wait.",
    turret: { class: "medium", speed: 38, window: 3, flight: 0.45, intake: "both" },
    levels: { 2: { turret: { speed: 42 } }, 3: { turret: { speed: 47 } } },
  },
  railgun: {
    id: "railgun", name: "RAIL GUN", kind: "turret", rarity: "epic", price: TURRET_PRICE.epic, size: 2, merchant: "gunsmith",
    desc: ["MEDIUM TURRET.", "A STEADY GUN.", "HOLDS 3 LOADS."], tags: ["TEMPO", "TWIN"],
    reason: "The quickest medium gun, and its shots fly the fastest.",
    turret: { class: "medium", speed: 43, window: 3, flight: 0.3, intake: "both" },
    levels: { 2: { turret: { speed: 48 } }, 3: { turret: { speed: 54 } } },
  },
  bombard: {
    id: "bombard", name: "BOMBARD", kind: "turret", rarity: "rare", price: TURRET_PRICE.rare, size: 2, merchant: "gunsmith",
    desc: ["HEAVY TURRET.", "A STEADY GUN.", "HOLDS 4 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A heavy gun that holds 4 loads.",
    turret: { class: "heavy", speed: 30, window: 4, flight: 0.6, intake: "both" },
    levels: { 2: { turret: { speed: 33 } }, 3: { turret: { speed: 38 } } },
  },
  siegegun: {
    id: "siegegun", name: "SIEGE GUN", kind: "turret", rarity: "epic", price: TURRET_PRICE.epic, size: 2, merchant: "gunsmith",
    desc: ["HEAVY TURRET.", "A STEADY GUN.", "HOLDS 4 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A heavy gun that holds 4 loads and fires faster than BOMBARD.", // FLIP-X2: digits (was "four loads")
    turret: { class: "heavy", speed: 35, window: 4, flight: 0.55, intake: "both" },
    levels: { 2: { turret: { speed: 39 } }, 3: { turret: { speed: 44 } } },
  },
  thunderer: {
    id: "thunderer", name: "THUNDERER", kind: "turret", rarity: "legendary", price: TURRET_PRICE.legendary, size: 2, merchant: "arcane",
    desc: ["HEAVY TURRET.", "A STEADY GUN.", "HOLDS 4 LOADS."], tags: ["BURST", "TWIN"],
    reason: "A quick heavy gun, with 4 gear slots.", // FLIP-X2: digits (was "four gear slots")
    turret: { class: "heavy", speed: 38, window: 4, flight: 0.5, intake: "both" },
    levels: { 2: { turret: { speed: 42 } }, 3: { turret: { speed: 47 } } },
  },
  // --- supplies (consumed on purchase). bb-0.8.6 (REQ-BFG-051, PACKS): the caravan's two fixed packs (PACKS below), out
  // of the rolled stock (itemsSoldBy); the ids stay (ghosts, validators and bots read them), the names are the packs' ---
  beltcrate: {
    id: "beltcrate", name: "BELT PACK", kind: "supply", rarity: "common", price: 2, size: 1, merchant: "ironmonger",
    desc: ["+4 BELT CAPACITY.", "LONGER ROUTES COOK", "HOTTER PAYLOADS."],
    supply: { belt: 4 },
  },
  plating: {
    id: "plating", name: "ARMOR PACK", kind: "supply", rarity: "rare", price: 5, size: 1, merchant: "ironmonger",
    desc: ["+250 MAX HULL", "FOR THE REST", "OF THE RUN."],
    supply: { hull: 250 },
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
    gate: { plate: 5 },
    levels: { 2: { gate: { plate: 11 } }, 3: { gate: { plate: 17 } } },
  },
  twingauge: {
    id: "twingauge", name: "TWIN GAUGE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker", shape: "I",
    desc: ["ADDS DAMAGE, MORE", "ON A BELT MATCHED", "TO ITS TWIN."], tags: ["TWIN", "FORGE"],
    gate: { gauge: { flat: 10, matched: 30 } },
    levels: { 2: { gate: { gauge: { flat: 22, matched: 66 } } }, 3: { gate: { gauge: { flat: 35, matched: 105 } } } },
  },
  pincer: {
    id: "pincer", name: "PINCER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist", shape: "I",
    desc: ["ADDS DAMAGE, MORE", "FOR EACH RIG ON", "ITS TILE."], tags: ["FORGE"],
    gate: { pincer: { flat: 10, each: 20, max: 3 } },
    levels: { 2: { gate: { pincer: { flat: 22, each: 44, max: 3 } } }, 3: { gate: { pincer: { flat: 35, each: 70, max: 3 } } } },
  },
  braceframe: {
    id: "braceframe", name: "BRACE FRAME", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "ironmonger", shape: "L",
    desc: ["ENEMY STUNS ON ITS", "TILES END SOONER,", "SOONER STILL PLATED."], tags: ["PLATE", "HARASS"],
    gate: { brace: { mul: 0.5, plated: 0.25 } },
    levels: { 2: { gate: { brace: { mul: 0.3, plated: 0.15 } } }, 3: { gate: { brace: { mul: 0.15, plated: 0.05 } } } },
  },
  twinlatch: {
    id: "twinlatch", name: "TWIN LATCH", kind: "gate", rarity: "rare", price: 6, size: 1, merchant: "tinker", shape: "II",
    desc: ["HOLDS A PAYLOAD FOR", "ITS OTHER BELT, THEN", "LETS BOTH GO."], tags: ["TWIN", "TEMPO"],
    gate: { latch: { hold: 1, flat: 10 } },
    levels: { 2: { gate: { latch: { hold: 1, flat: 22 } } }, 3: { gate: { latch: { hold: 1, flat: 35 } } } },
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
    gate: { breaker: { flat: 40, floor: 10 } },
    levels: { 2: { gate: { breaker: { flat: 88, floor: 22 } } }, 3: { gate: { breaker: { flat: 140, floor: 35 } } } },
  },
  shieldwall: { // SUS-B (cap's answer 3 to SUSTAIN-1): IRON WALL, so no name says SHIELD where it means PLATE (the id stays)
    id: "shieldwall", name: "IRON WALL", kind: "gate", rarity: "legendary", price: 10, size: 1, merchant: "ironmonger", shape: "X",
    desc: ["PLATES YOUR HULL,", "AND HITS HARDER", "WHILE WELL PLATED."], tags: ["PLATE", "FORGE"],
    gate: { plate: 10, plated: { min: 120, flat: 30 } },
    levels: { 2: { gate: { plate: 22, plated: { min: 120, flat: 66 } } }, 3: { gate: { plate: 35, plated: { min: 120, flat: 105 } } } },
  },
  twinmould: {
    id: "twinmould", name: "TWIN MOULD", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "tinker",
    desc: ["CASTS PLAIN SLUGS", "SEVERAL AT A TIME,", "ONE BELT EACH."], tags: ["TWIN", "SWARM"], // bb-0.8.3 (M4): was "CASTS A PLAIN SLUG ONTO EACH OF ITS BELTS AT ONCE."
    // base 3: the plain slug's. bb-0.8.3 (REQ-BFG-042 D3): belt slots by stars as every bought factory's; its lead is the
    // pour, 2 slugs a cast at ★1-2 and 3 at ★3 (THIRD SPRUE: the third slug of each pour), whatever its belts
    factory: { ammo: "plain", speed: 17, twin: true, pour: 2 },
    levels: { 2: { factory: { speed: 19, base: 50 } }, 3: { factory: { speed: 21, base: 60, pour: 3 }, perk: "THIRD SPRUE" } },
  },
  armorpress: {
    id: "armorpress", name: "ARMOR PRESS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "ironmonger",
    desc: ["PRESSES PLATING ONTO", "YOUR HULL AND STAMPS", "PLAIN SLUGS."], tags: ["PLATE", "SWARM"],
    factory: { ammo: "plain", speed: 19, plate: { every: 3, amount: 30 } }, // base 3: the plain slug's
    levels: { 2: { factory: { speed: 21, plate: { every: 3, amount: 66 } } }, 3: { factory: { speed: 25, plate: { every: 3, amount: 105 } } } },
  },
  anvil: {
    id: "anvil", name: "ANVIL BREECH", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "ironmonger",
    desc: ["SHOTS HIT HARDER", "THE MORE PLATING", "YOUR HULL HOLDS."], tags: ["PLATE", "BURST"],
    core: { routine: "anvil", anvilFlat: 25, perPlate: 1 },
    levels: { 2: { core: { anvilFlat: 55, perPlate: 2.2 } }, 3: { core: { anvilFlat: 88, perPlate: 3.5 } } },
  },
  steambreech: {
    id: "steambreech", name: "STEAM BREECH", kind: "core", rarity: "common", price: 4, size: 1, merchant: "gunsmith",
    desc: ["THE TURRET FIRES", "FASTER WHILE YOUR", "HULL IS PLATED."], tags: ["PLATE", "TEMPO"],
    core: { routine: "steam", steamPlated: 35, steamBare: 10 },
    levels: { 2: { core: { steamPlated: 70, steamBare: 20 } }, 3: { core: { steamPlated: 110, steamBare: 30 } } },
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
    mod: { spall: { every: 40, add: 10, max: 80 } },
    levels: { 2: { mod: { spall: { every: 40, add: 22, max: 176 } } }, 3: { mod: { spall: { every: 40, add: 35, max: 280 } } } },
  },
  seamwelder: {
    id: "seamwelder", name: "SEAM WELDER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "arcane",
    desc: ["PAIRS THIS TURRET", "TAKES PLATE YOUR", "HULL."], tags: ["TWIN", "PLATE"],
    mod: { seam: { pair: 10, lone: 2 } },
    levels: { 2: { mod: { seam: { pair: 22, lone: 4 } } }, 3: { mod: { seam: { pair: 35, lone: 7 } } } },
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

// ---------------------------------------------------------------------------------------------------- SUS-A (sustain)

/**
 * SUS-A (REQ-BFG-069): THE SUSTAIN SWITCH. WARD BELL, MEND PRESS and MENDING LOOM are ITEMS entries (ITEMS[id] resolves,
 * so the sim, the stars, the bench and the tests read them at any time), but while this is false they are hidden from
 * every listing of the catalogue (Object.keys/values(ITEMS)), as wave 3 was (setWave3): buyableModules() (the wares draw,
 * game/wares.ts), itemsSoldBy() (the caravan), the road-event pools, the captains' synergy swaps, the stand-in tools and
 * the par player never see one, so every seeded shop, bot and pool stays identical; validate.ts refuses a deck that holds
 * one. RUNES-2b turns them on with this one line and the one pool regeneration. When it does, cap's answer 4 to SUSTAIN-1
 * holds: they are rare or better and first offered on day 3 (RUNES-2b's draw must hold them back until then).
 * FLIP-X2 (REQ-BFG-069, release X): ON, together with runes.ts BOT_RUNES, before the one regeneration.
 */
export const SUSTAIN_LIVE: boolean = true;

/**
 * BOTS-X (REQ-BFG-069; cap's answer 4 to SUSTAIN-1 and answer 4 in REVIEW-SUSD): THE FIRST SUSTAIN DAY. With the switch on,
 * no sustain offer of any kind comes before the dawn of this day: WARD BELL, MEND PRESS and MENDING LOOM unlock on it in
 * every draw that reads the catalogue (game/wares.ts unlockDay, the shop's wares and through them the par player, the
 * caravan stand-ins and the road events; run.ts dayPool for a run without wares; harness/synergy.ts firstOfferDay), and the
 * 8 sustain runes join the dawn offer on it (runes.ts runeOffer; runeProblem refuses one taken at an earlier dawn). Day
 * 1-2 fights stay short and decisive. Read only while the switch is on: off, no draw holds a sustain piece or rune at all.
 */
export const SUSTAIN_FIRST_DAY = 3;

/** SUS-A: the three new sustain pieces (SUSTAIN-1 4.6, on the N1 scale; ★1 / ★2 / ★3). Their words are SUS-B's. */
export const SUSTAIN_ITEMS: Record<string, ItemDef> = {
  // SHIELD: EVERY 8 / 5 / 4 s: +1 SHIELD, the first at t = every (TurretState.bell). ★1 is the design's fallback (cap's
  // answer 3 to SUSTAIN-1; the design's 6 s): the acceptance bench's typ2r had FURNACE at 44.3% pooled (< 45%)
  wardbell: {
    id: "wardbell", name: "WARD BELL", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "tinker",
    // BOTS-X tags: PLATE alone (a guard: each SHIELD stops a whole hit, PLATE's "guards"); not TEMPO, whose pieces make
    // YOUR machines act sooner (belt speed, fire rate, load time): the bell's timer speeds nothing of yours
    // x2 merge (cap): NUM-4's desc words ("BLOCKS ONE HIT,": a SHIELD blocks one hit's damage) with BOTS-X's tags
    desc: ["RINGS A WARD THAT", "BLOCKS ONE HIT,", "AGAIN AND AGAIN."], tags: ["PLATE"], // SUS-B: its desc
    mod: { shield: { every: 8, amount: 1 } },
    levels: { 2: { mod: { shield: { every: 5, amount: 1 } } }, 3: { mod: { shield: { every: 4, amount: 1 } } } },
  },
  mendpress: { // HEAL: EVERY 3 s: HEAL 20 / 30 / 45; ARMOR PRESS's kind, timer, stall pause and stamping (FactoryState.healTimer)
    id: "mendpress", name: "MEND PRESS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "ironmonger",
    // BOTS-X tags (kept, now with a reason): ARMOR PRESS's own pair. PLATE: it mends the hull (PLATE's "repair"); SWARM: it
    // is a second factory stamping its own plain slugs down a belt (SWARM's "second factories"), so it adds a line
    desc: ["STAMPS PLAIN SLUGS", "AND MENDS YOUR HULL", "EVERY FEW SECONDS."], tags: ["PLATE", "SWARM"], // SUS-B: its desc
    factory: { ammo: "plain", speed: 19, heal: { every: 3, amount: 20 } }, // base 3: the plain slug's (ARMOR PRESS's speeds)
    levels: { 2: { factory: { speed: 21, heal: { every: 3, amount: 30 } } }, 3: { factory: { speed: 25, heal: { every: 3, amount: 45 } } } },
  },
  mendingloom: { // REGEN: YOUR HULL: REGEN 10 / 15 / 20 (TurretState.regen)
    id: "mendingloom", name: "MENDING LOOM", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "alchemist",
    // BOTS-X tags (kept, now with a reason): PLATE alone. REGEN gives back hull each second (PLATE's "repair"); it adds no
    // payload or hit (SWARM), changes no timing of yours (TEMPO) and no damage (FORGE, BURST)
    desc: ["WEAVES YOUR HULL", "WHOLE AGAIN, A", "LITTLE EACH SECOND."], tags: ["PLATE"], // SUS-B: its desc
    mod: { regen: 10 },
    levels: { 2: { mod: { regen: 15 } }, 3: { mod: { regen: 20 } } },
  },
};

/** SUS-A: the sustain pieces' ids. */
export const SUSTAIN_IDS: readonly string[] = Object.keys(SUSTAIN_ITEMS);

let sustainOn = false;

/** SUS-A: is `id` one of the new sustain pieces (whatever the switch)? */
export function isSustain(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUSTAIN_ITEMS, id);
}

/** SUS-A: are the sustain pieces in the game now (SUSTAIN_LIVE, or a withSustain call)? */
export function sustainLive(): boolean {
  return sustainOn;
}

/** SUS-A: put the sustain pieces in the game (on) or keep them out (off): setWave3's mechanism. Each stays an own property
 *  of ITEMS either way; only its enumerability follows the switch, and its place in ITEMS order (after wave 3) never moves. */
export function setSustain(on: boolean): void {
  for (const id of SUSTAIN_IDS) {
    Object.defineProperty(ITEMS, id, { value: SUSTAIN_ITEMS[id], enumerable: on, writable: true, configurable: true });
  }
  sustainOn = on;
}

/** SUS-A: run `fn` with the sustain pieces on (or off), then put the switch back as it was, even if `fn` throws. */
export function withSustain<T>(fn: () => T, on = true): T {
  const was = sustainOn;
  setSustain(on);
  try {
    return fn();
  } finally {
    setSustain(was);
  }
}

setSustain(SUSTAIN_LIVE);

export interface AmmoDef {
  name: string;
  base: number; // base damage
  rideScale: number; // damage per second of eligible ride time
  fray: number; // Fray stacks applied on hit
  rideCurve?: (ride: number) => number; // races: PENDULUM SLUG; replaces base + rideScale x ride
  fixedSpeed?: number; // 0.6.1c SLAG: always rides at this belt speed; speed gates and slows never change it (Battle.transport)
}

export const AMMO: Record<AmmoKind, AmmoDef> = {
  cinder: { name: "CINDER SLUG", base: 40, rideScale: 12, fray: 0 },
  thread: { name: "THREAD SLUG", base: 30, rideScale: 0, fray: 1 },
  plain: { name: "PLAIN SLUG", base: 30, rideScale: 0, fray: 0 },
  shot: { name: "BUCKSHOT", base: 10, rideScale: 0, fray: 0 }, // 0.6.1c SHOT TOWER: every per-payload gate hits each shot
  slag: { name: "SLAG SLUG", base: 70, rideScale: 0, fray: 0, fixedSpeed: 0.75 }, // 0.6.1c SLAG POT
  sabot: { name: "SABOT ROUND", base: 40, rideScale: 0, fray: 0 },
  frost: { name: "FROST ROUND", base: 20, rideScale: 0, fray: 0 },
  drag: { name: "CHAIN ROUND", base: 20, rideScale: 0, fray: 0 },
  limpet: { name: "LIMPET CHARGE", base: 20, rideScale: 0, fray: 0 },
  ...RACE_AMMO, // races: ALLOY BLANK, ALLOY SLUG, BULWARK SLUG, PENDULUM SLUG, LEECH SLUGS
};

export interface TurretDef {
  col0: number; // leftmost deck column under the turret
  width: number; // columns spanned
  connectors: number[]; // deck columns (forward row) whose belts feed this turret
  kind: TurretKind; // races: was "heavy" | "light"
  speed: number; // NUM-2: shots per 30 s (TurretSpec.speed; TURRET SPEED's levels included on a starting turret)
  window: number; // loading window size (LIFO stack)
  flight: number; // projectile flight time (s)
  empty?: boolean; // 0.6.2s: an empty TURRET SLOT (deck.ts hero(b)): no connectors, nothing fights there
}

/**
 * 0.6.1b: a turret's class factor k = clamp(fireInterval / 1.0 s, 0.4, 1.2) (ARSENAL.md §2.1 rule 4): heavy
 * 1.0, medium 0.75, light 0.55. A core's absolute per-shot numbers are multiplied by it, so a light turret,
 * which fires about 1.8x as often, gets about the same per-second value as a heavy one.
 */
/** NUM-2 (REQ-BFG-047): a factory's whole speed: its spec's, or MIMIC FORGE's, the hero's signature factory's (level 1)
 *  x its rate %, rounded half up once (was that factory's interval x intervalMul). */
export function factorySpeed(def: string, spec: { speed: number; rate?: number }, hero: HeroId): number {
  if (def !== "mimic") return spec.speed;
  const sig = ITEMS[HEROES[hero].factory]?.factory?.speed ?? SPEED_K;
  return Math.floor(sig * rateMul(spec.rate) + 0.5 + 1e-9);
}

export function classFactor(t: { speed: number }): number {
  // NUM-2 (REQ-BFG-047): the interval is 30 / speed; cores.ts scaleCore makes the whole class % of it in its one place
  return Math.min(1.2, Math.max(0.4, secPer(t.speed)));
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
    hull: 2000, factory: "kiln", ammo: "cinder", belt: 14,
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "heavy", speed: 30, window: 3, flight: 0.6 }],
    // Y1 (STAR-D 4.2; display only): the stale "AT 8+ TILES, BREECH FIRES EVERY 0.72S." takes the hero face's second line
    blurb: ["KILN SLUGS HEAT UP ON LONG", "BELTS. GUNS ON 8+ TILE", "BELTS FIRE 39% FASTER."],
    pattern: "DELAY TO COOK",
    core: "kilnbreech",
    slots: HULL_SLOTS.furnace,
  },
  weaver: {
    id: "weaver", name: "WEAVER", faction: "elf", factionName: "ELVEN SKYWRIGHTS",
    hull: 1800, factory: "loom", ammo: "thread", belt: 24,
    turrets: [
      { col0: 0, width: 2, connectors: [1], kind: "light", speed: 55, window: 2, flight: 0.34 },
      { col0: 4, width: 2, connectors: [4], kind: "light", speed: 55, window: 2, flight: 0.34 },
      { col0: 8, width: 2, connectors: [8], kind: "light", speed: 55, window: 2, flight: 0.34 },
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

/** What `m` stocks for the shop's roll (run.ts rollShop). bb-0.8.6 (REQ-BFG-051, PACKS P1): no supply: BELT PACK and ARMOR
 *  PACK (ITEMS.beltcrate, ITEMS.plating) are the caravan's two fixed offers outside the roll (PACKS below), so a rolled
 *  crate or plating beside them would be a dead offer (REQ-BFG-021). Their ITEMS entries and merchant stay. */
export function itemsSoldBy(m: MerchantId): ItemDef[] {
  return Object.values(ITEMS).filter((d) => d.merchant === m && d.kind !== "supply" && !DORMANT_ITEMS.has(d.id));
}

/**
 * bb-0.8.6 (REQ-BFG-051, job PACKS P1-P2): the caravan's two FIXED offers, on every visit beside the rolled ones: BELT
 * PACK (ITEMS.beltcrate: 2 gold, +4 belt capacity) and ARMOR PACK (ITEMS.plating: 5 gold, +25 max hull). Outside the roll,
 * like the upgrades: no offer slot, no draw from the shop's stream, and a reroll doesn't touch them. Bought again and
 * again while the gold lasts, no cap; the scout discount and free rerolls never apply (run.ts buyPack, packPrice). The
 * price and the amount are the ITEMS entry's (one source: validate.ts and roadCap.ts cost crates and plating with them).
 */
export type PackId = "belt" | "armor";
export const PACK_IDS: readonly PackId[] = ["belt", "armor"];
export const PACK_ITEM: Readonly<Record<PackId, "beltcrate" | "plating">> = { belt: "beltcrate", armor: "plating" };

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

/**
 * bb-0.8.3 (REQ-BFG-043, the operator's design of 2026-10-03): every hero's two gold upgrade tracks, for every run. Both
 * start at level 1 and go up to UPGRADE_MAX. They are bought in the caravan (build) phase, OUTSIDE the shop roll (run.ts
 * buyUpgrade): a purchase takes no offer slot, draws on no stream and changes nothing the shop shows.
 *  - "turret", TURRET SPEED: the hero's starting turrets (the installed turrets holding the free starting copy, merged or
 *    not: BuildTurret.free) fire faster (TURRET_SPEED, deck.ts turretSlots);
 *  - "factory", FACTORY: the hero's signature factory gains a belt slot and a faster cycle (its ItemDef.levels 2-4, read
 *    at stars.ts gradeOf; slots stars.ts BELT_SLOTS).
 * The levels live on the build (Build.upgrades), so they travel in the ghost snapshot and the save. No refund: selling,
 * stowing or merging never returns upgrade gold.
 */
export type UpgradeTrack = "turret" | "factory";
export const UPGRADE_TRACKS: readonly UpgradeTrack[] = ["turret", "factory"];
/** A build's upgrade levels, each 2..UPGRADE_MAX when bought; absent = level 1 (never written as 1). */
export interface Upgrades { turret?: number; factory?: number }
export const UPGRADE_MAX = 4;
/** The gold that buys level n of a track (index n): 10, 20, 30. THE OPERATOR SET THESE PRICES: never tune them. */
export const UPGRADE_PRICE: readonly number[] = [0, 0, 10, 20, 30];
/** TURRET SPEED: a starting turret's fire interval x this at level n (index n): x0.85 a level, level 4 about x0.61.
 *  NUM-2 (REQ-BFG-047, N1 2.2): whole steps instead: each level adds roundHalfUp(TURRET_SPEED % x its level-1 speed), so
 *  SCRAP CANNON 30 / 36 / 42 / 48 (was the interval x [1, 1, 0.85, 0.72, 0.61]); deck.ts turretSlots. The signature
 *  FACTORY's levels are its data (scripts/num2-speed.mjs: + 25% of level 1 a level). */
export const TURRET_SPEED = 20;
/** NUM-2: a speed at upgrade level `level` (1-4) of a track that adds `step` % of its level-1 speed `s1` a level. */
export const levelSpeed = (s1: number, level: number, step: number): number =>
  s1 + Math.max(0, level - 1) * Math.floor((s1 * step) / 100 + 0.5 + 1e-9);

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
