// U2a (REQ-BFG-046, REQ-BFG-047): THE FACE KIT and the new faces of the first half of the pieces (R1 MEMO C4; redesign.md
// and redesign.json's AFTER faces as amended by cap's R1 review, calls 1 and 3-7; N1 REPORT section 6 items 1-8).
//
// A face is one idea per piece, read top to bottom:
//   the STATS row   icon + number pairs from the piece kind's one data function (factoryStats, turretStats), at most 3
//                   (statRow); the speed pair comes from speedPair, the one place NUMBERS turns SEC into RATE
//   the RULE line   a trigger label in brass where the rule has one (HIT:, SHOT:, LOAD:, {*PAIR}:, EVERY 3{SEC}:), then
//                   the effect; a keyword in panel style ({*BURN}: its icon then its word, in its colour)
//   the REMINDER    dim, 3x5: each keyword's reminder text (C1) with the piece's own number filled in (never "n": the font
//                   has no lower case, N1 6.7)
//   NEXT★           one line, computed: the next star's numbers that differ from this star's (faceNext diffs the two
//                   stars' data; nothing here is hand-written per star)
// Every number comes from sim data (content.ts, races/*.ts, the star levels, the hero and the turret class factor k)
// through one formatter of src/ui/statFormat.ts. No template here holds a digit (tests/faceText.test.ts reads this
// file's string literals and fails on one).
//
// Which pieces (BRIEF-U2a): kind hero, factory, core and turret with flag TEXT in redesign.json, except the STUN-fold
// face (SCRAPPER) and N1's crit piece (CAPACITOR BANK), which keep today's text, as every RULES piece does (FURNACE's
// ability, ASSEMBLY LINE, SABOT and FROSTBITE FOUNDRY, DRAG CHAIN FOUNDRY, DRAKE NOZZLE, STEAM BREECH): they have no
// entry here, so every panel draws them exactly as today.
// THE INTERIM (N1 2.6): the faces are held for stage A's NUMBERS release; until then the formatters print today's values.

import { icons, textWidth, type KeywordName } from "../render/font";
import { colourize, PERK_COLOUR, type Span } from "./richText";
import { statRow, type Stat } from "./icons";
import { fmtCount, fmtDmg, fmtPct, fmtSec, fmtSpeed } from "./statFormat";
import { livePerk, type TextOpts } from "./abilityText";
import {
  AMMO, BURN_TIME, DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS, type HeroId, type ItemDef, type PayloadPreset,
} from "../sim/content";
import { GUARD_FREEZE, SHAPE_ARROWS, rigShape } from "../sim/content"; // U2b: the rigs' belts and OVERDRIVE's guards
import { FUSE_MULT } from "../sim/races/foundry";
import { PLATE_CAP, PLATE_PER_SLUG } from "../sim/races/bastion";
import { scaleCore } from "../sim/cores";
import { effectAt, FUSE_MAX, fusible, outputsAt } from "../sim/stars";
import { perkAt } from "../sim/stars"; // U2b F6: HOT SWAP's spark carries GALVANIC COIL's SPARK JUMP (content.ts hotswap)
import { gearSlotsOf } from "../sim/deck";

/**
 * The engine's numbers a reminder needs that no spec carries (as abilityText.ts SIM): each quoted from its source.
 */
export const FACE_SIM = {
  burnTick: 1, // battle.ts hullEffects: each Burn stack deals the enemy hull 1 damage a second (abilityText S.burn)
  // U2b: battle.ts applyHit: a PLATE BREAKER takes 1 plating from your hull for its flat (s.plate.plate >= 1, spendPlate 1)
  breakerPlate: 1,
  // U2b F6: battle.ts impact: a ★3 GRAPNEL GUN's next shot gains 1 damage x its class factor k for each payload it rips
  salvagePerRip: 1,
} as const;

/** One rule line: markup ({NAME}, {*NAME}); `label`, its brass trigger label, a part of `text` ("SHOT:"). */
export interface FaceRule {
  text: string;
  label?: string;
}

/** A piece's face at a star, as data: its stat pairs, rule lines, reminders, and its rule's numbers, each keyed and in
 *  its NEXT★ form (markup), so two stars' faces diff. */
export interface Face {
  stats: Stat[];
  rules: FaceRule[];
  reminders: string[];
  nums: [string, string][];
  /** U2b F6: the star's interim perk clause (INTERIM_CLAUSES), its label "★2 SPARK JUMP:" in brass; kept, outside the
   *  budget. */
  clause?: FaceRule;
  /** U2b F5: the interim caveats (INTERIM_CAVEATS): kept, 3x5, in the reminder's colour, outside the budget. */
  caveats?: string[];
}

interface X {
  stars: number;
  k: number;
  hero?: HeroId;
}

// ------------------------------------------------------------------------------------------------- the stat pairs

/** THE speed pair (N1 6.2): a repeating action's cadence. Until NUMBERS, ["SEC", interval], drawn as today's interval
 *  with SEC after it; NUMBERS makes it ["RATE", speed] here and nowhere else. */
export const speedPair = (interval: number): Stat => ["SEC", fmtSpeed(interval)];

/** A factory shows its belts when it is a hero's (BELTS levels add belts) or when any star feeds more than one. */
const showsBelts = (def: string): boolean => !fusible(def) || [1, 2, 3].some((n) => outputsAt(def, n) > 1);

/** A factory's stat pairs at `stars` (MIMIC FORGE's for `hero`): its stamp's cadence, its slug's damage and, where it
 *  shows them, its belts. The slug damage is its dies' (FactorySpec.base), else its ammo's (Battle.stamp). */
export function factoryStats(def: string, stars = 1, hero?: HeroId): Stat[] {
  const fs = effectAt(def, stars).factory!;
  let interval = fs.interval, dmg = fs.base ?? AMMO[fs.ammo].base;
  if (def === "mimic") {
    // Battle.factoryDef: the hero's ammo at its own factory's interval x intervalMul; no hero, no cadence to show
    const h = hero ? HEROES[hero] : undefined, sig = h ? ITEMS[h.factory]?.factory : undefined;
    if (!h || !sig) return [["BELT", fmtCount(outputsAt(def, stars))]];
    interval = sig.interval * (fs.intervalMul ?? 1);
    dmg = AMMO[h.ammo].base;
  }
  return [speedPair(interval), ["DMG", fmtDmg(dmg)], ...(showsBelts(def) ? [["BELT", fmtCount(outputsAt(def, stars))] as Stat] : [])];
}

/** A turret's stat pairs at `stars`: how often it fires, the loads its chamber holds, its gear slots (deck.ts). */
export function turretStats(def: string, stars = 1): Stat[] {
  const t = effectAt(def, stars).turret!;
  return [speedPair(t.fireInterval), ["SLUG", fmtCount(t.window)], ["GEAR", fmtCount(gearSlotsOf(def, stars))]];
}

/** U2b: a rig's stat pairs (R1 C4: "Rigs and gear: none"): a rig's numbers are its rule's. This is the rig kind's one
 *  place for them, as factoryStats and turretStats are their kinds' (a later chip or cadence pair goes here). */
export function rigStats(def: string, stars = 1): Stat[] {
  if (!effectAt(def, stars).gate) throw new Error(`rigStats: ${def} is not a rig`);
  return [];
}

/** U2b: a piece of turret gear's stat pairs (C4: none; its rule describes the turret it sits on). */
export function gearStats(def: string, stars = 1): Stat[] {
  if (!effectAt(def, stars).mod) throw new Error(`gearStats: ${def} is not turret gear`);
  return [];
}

/** U2b: a supply's stat pairs (none: its one rule is its number for the run). */
export function supplyStats(def: string): Stat[] {
  if (!ITEMS[def]?.supply) throw new Error(`supplyStats: ${def} is not a supply`);
  return [];
}

/** A turret core's stat pairs (R1 C4: a core is its share, "{DMG}40% EACH"): SCATTER CHOKE's pellet share; every other
 *  core's numbers are its rule's. `k`: the turret's class factor (cores.ts scaleCore; a share isn't scaled). */
export function coreStats(def: string, stars = 1, k = 1): Stat[] {
  const core = scaleCore(effectAt(def, stars).core!, k);
  return def === "scatter" ? [["DMG", `${fmtPct(core.share!)} EACH`]] : [];
}

// -------------------------------------------------------------------------------------------------- the reminders

/** C1's reminder texts, each with the piece's own number filled in; the keyword in panel style (its colour, as the
 *  flavour keeps a keyword's colour), the rest dim. */
export const REMINDER: Record<KeywordName, (n?: number) => string> = {
  BURN: () => `EACH {*BURN}: ${fmtDmg(FACE_SIM.burnTick)} HULL DAMAGE A SEC FOR ${fmtSec(BURN_TIME)}{SEC}.`,
  STUN: (t = DISRUPT_TIME) => `{*STUN}: THE ENEMY PART IT HITS STOPS FOR ${fmtSec(t)}{SEC}.`,
  HEAT: (h = AMMO.cinder.rideScale) => `{*HEAT}: +${fmtDmg(h)} DAMAGE FOR EACH SEC IT RIDES.`,
  // U2b F3: a cap in a reminder names its unit, one form for every capped reminder ("MAX 15 {FRAY}.", not "UP TO 15")
  FRAY: () => `EACH {*FRAY}: EVERY LATER HIT +${fmtDmg(FRAY_BONUS)} DAMAGE. MAX ${fmtCount(FRAY_MAX)} {FRAY}.`,
  PLATE: () => `{*PLATE}: SOAKS DAMAGE BEFORE YOUR HULL. MAX ${fmtDmg(PLATE_CAP)} {PLATE}.`,
  PAIR: () => "{*PAIR}: TWO LOADS REACH ONE TURRET AT ONCE.",
};

// ------------------------------------------------------------------------------------------------------ the faces

type Rules = Omit<Face, "stats">;
const f = (e: ItemDef) => e.factory!;
const c = (e: ItemDef, x: X) => scaleCore(e.core!, x.k);
/** A plural ending for a count. */
const s = (n: number): string => (n === 1 ? "" : "S");
const rules = (rs: FaceRule[], nums: [string, string][] = [], reminders: string[] = []): Rules => ({ rules: rs, reminders, nums });
const shot = (text: string): FaceRule => ({ text: `SHOT: ${text}`, label: "SHOT:" });
/** HOT SWAP's step of the cycle by its tint. */
const cyc = (e: ItemDef, tint: PayloadPreset["tint"]): PayloadPreset => f(e).cycle!.find((p) => p.tint === tint)!;
/** U2b: a rig's rule, its trigger HIT: in brass (cap's review call 5: rigs keep HIT:, as the board's "1 HIT"). */
const hit = (text: string): FaceRule => ({ text: `HIT: ${text}`, label: "HIT:" });
const gt = (e: ItemDef) => e.gate!;
const md = (e: ItemDef) => e.mod!;
/** U2b: one arrow works one belt ("ITS BELT RUNS"), more work more ("ITS BELTS RUN"): SHAPE_ARROWS, as abilityText's
 *  belts() reads it. */
const oneBelt = (e: ItemDef): boolean => (SHAPE_ARROWS[rigShape(e) ?? "I"]?.length ?? 1) <= 1;
const itsBelts = (e: ItemDef): string => (oneBelt(e) ? "ITS BELT" : "ITS BELTS");
const runs = (e: ItemDef): string => (oneBelt(e) ? "ITS BELT RUNS" : "ITS BELTS RUN");

const FACES: Record<string, (e: ItemDef, x: X) => Rules> = {
  // --------------------------------------------------------------------------------------------------- factories
  press: () => rules([]),
  doublestamp: (e) => {
    const n = fmtCount(f(e).batch!);
    return rules([{ text: `STAMPS ${n} SLUGS AT A TIME.` }], [["batch", `{SLUG}${n}`]]);
  },
  shottower: (e) => {
    const n = fmtCount(f(e).batch!);
    return rules([{ text: `DROPS ${n} SLUGS; RIGS HIT EACH ONE.` }], [["batch", `{SLUG}${n}`]]);
  },
  hotswap: (e) => {
    // Battle.stamp: EMBER slugs carry its burn, SPARK slugs a shock (DISRUPT_TIME, or the star's shockTime)
    const t = cyc(e, "spark").shockTime ?? DISRUPT_TIME, burn = fmtCount(cyc(e, "ember").burn ?? 0), stun = fmtSec(t);
    return rules([{ text: `ITS SLUGS ALTERNATE: +${burn} {*BURN}, THEN {*STUN} ${stun}.` }],
      [["burn", `+${burn} {*BURN}`], ["stun", `{*STUN} ${stun}`]], [REMINDER.BURN(), REMINDER.STUN(t)]);
  },
  slagpot: () => rules([{ text: "ITS SLUGS IGNORE BELT SPEED." }]),
  gantry: () => rules([]),
  mimic: () => rules([{ text: "STAMPS YOUR HERO'S SLUGS." }]),
  limpet: (e) => {
    const r = f(e).round as { delay: number; blast: number };
    const blast = fmtDmg(r.blast), delay = fmtSec(r.delay);
    return rules([{ text: `ITS CHARGES BLAST THE HULL: ${blast} {DMG}, ${delay}{SEC} LATER.` }],
      [["blast", `${blast} {DMG}`], ["delay", `${delay}{SEC}`]]);
  },
  twinmould: () => rules([{ text: "CASTS A SLUG ONTO EACH BELT AT ONCE." }]),
  armorpress: (e) => {
    const p = f(e).plate!, every = fmtSec(p.every), amount = fmtDmg(p.amount);
    const label = `EVERY ${every}{SEC}:`;
    // U2d F1: the period's NEXT★ form is SURGE's, without the label's colon (its period is one at every star today)
    return rules([{ text: `${label} +${amount} {*PLATE}.`, label }], [["every", `EVERY ${every}{SEC}`], ["plate", `+${amount} {*PLATE}`]], [REMINDER.PLATE()]);
  },
  // the heroes' signature factories (never sold: no stars, no NEXT★)
  kiln: (e) => {
    const h = AMMO[f(e).ammo].rideScale;
    return rules([{ text: `ITS SLUGS HAVE {*HEAT} ${fmtDmg(h)}.` }], [], [REMINDER.HEAT(h)]);
  },
  loom: (e) => rules([{ text: `ITS SLUGS HAVE {*FRAY} ${fmtCount(AMMO[f(e).ammo].fray)}.` }], [], [REMINDER.FRAY()]),
  crucible: () => {
    // races/foundry.ts: crucibleProduce pours onto every belt at once; two blanks in sync fuse at FUSE_MULT
    const label = "{*PAIR}:";
    return rules([{ text: "POURS ONTO ALL ITS BELTS AT ONCE." }, { text: `${label} BLANKS FUSE, +${fmtPct(FUSE_MULT - 1)} {DMG}.`, label }],
      [], [REMINDER.PAIR()]);
  },
  wardworks: () => rules([{ text: `ITS SLUGS LOAD: +${fmtDmg(PLATE_PER_SLUG)} {*PLATE}.`, label: "LOAD:" }], [], [REMINDER.PLATE()]),
  // ------------------------------------------------------------------------------------- turret cores (numbers x k)
  scatter: (e, x) => {
    const n = fmtCount(c(e, x).pellets!); // its share is its stat pair (coreStats)
    return rules([shot(`BURSTS INTO ${n} PELLETS.`)], [["pellets", `${n} PELLETS`]]);
  },
  rotary: () => rules([{ text: "FIRES PART-FULL CHAMBERS SOONER." }]),
  pressure: (e, x) => {
    const per = fmtDmg(c(e, x).perQueued!);
    return rules([shot(`+${per} {DMG} FOR EACH LOAD WAITING.`)], [["per", `+${per} {DMG}`]]);
  },
  gatling: (e, x) => {
    // rateText's rule: the spin's floor x0.6 of the interval fires 1 / 0.6 = 67% faster (N1 2.3: X% FASTER is the rate)
    const up = fmtPct(1 / c(e, x).floor! - 1);
    return rules([{ text: `SPINS UP TO ${up} FASTER AS IT FIRES.` }], [["spin", `${up} FASTER`]]);
  },
  hullbreaker: (e, x) => {
    const more = fmtPct(c(e, x).hullMul! - 1);
    return rules([{ text: `SHOTS ALWAYS HIT THE HULL, +${more} {DMG}.` }], [["more", `+${more} {DMG}`]]);
  },
  salvo: (e, x) => {
    const flat = fmtDmg(c(e, x).volleyFlat!);
    return rules([shot(`EMPTIES THE CHAMBER AT ONCE, +${flat} {DMG} EACH.`)], [["flat", `+${flat} {DMG}`]]);
  },
  mortar: (e, x) => {
    const n = c(e, x).splash!, more = fmtCount(n), share = fmtPct(c(e, x).share!);
    return rules([shot(`ALSO HITS ${more} MORE TARGET${s(n)} FOR ${share} {DMG}.`)], [["splash", `${more} MORE`], ["share", `${share} {DMG}`]]);
  },
  grapnel: (e, x) => {
    const n = c(e, x).rip!, rip = fmtCount(n);
    return rules([shot(`RIPS ${rip} SLUG${s(n)} OFF AN ENEMY BELT.`)], [["rip", `RIPS ${rip}`]]);
  },
  tesla: (e, x) => {
    const n = c(e, x).arcs!, arcs = fmtCount(n), t = c(e, x).stall!, stun = fmtSec(t);
    return rules([shot(`ALSO ARCS TO ${arcs} ENEMY PART${s(n)}: {*STUN} ${stun}.`)],
      [["arcs", `${arcs} PART${s(n)}`], ["stun", `{*STUN} ${stun}`]], [REMINDER.STUN(t)]);
  },
  compound: (e, x) => {
    const more = fmtPct(c(e, x).mult! - 1);
    return rules([shot(`TWO LOADS FUSE INTO ONE SHELL, +${more} {DMG}.`)], [["mult", `+${more} {DMG}`]]);
  },
  lance: (e, x) => {
    const n = c(e, x).columns!, cols = fmtCount(n), share = fmtPct(c(e, x).share!);
    return rules([shot(`ALSO HITS EVERY ENEMY PART IN ${cols} COLUMN${s(n)}, ${share} {DMG}.`)],
      [["columns", `${cols} COLUMN${s(n)}`], ["share", `${share} {DMG}`]]);
  },
  anvil: (e, x) => {
    const flat = fmtDmg(c(e, x).anvilFlat!), per = fmtDmg(c(e, x).perPlate!);
    return rules([shot(`+${flat} {DMG}, +${per} MORE FOR EACH {*PLATE}.`)], [["flat", `+${flat} {DMG}`], ["per", `+${per} EACH`]],
      [REMINDER.PLATE()]);
  },
  // ------------------------------------------------------------------- U2b: the TEXT rigs (HIT: in brass; no stat row)
  // TOLLBOOTH (a STUN-fold face) and SHIELD WALL (N1 3.3's crit piece) keep today's text, as every RULES rig does.
  temper: (e) => {
    const n = fmtCount(gt(e).burn!); // Battle.applyHit: + burn stacks on each payload it hits
    return rules([hit(`+${n} {*BURN}.`)], [["burn", `+${n} {*BURN}`]], [REMINDER.BURN()]);
  },
  whetstone: (e) => {
    const d = fmtDmg(gt(e).flat!);
    return rules([hit(`+${d} {DMG}.`)], [["flat", `+${d} {DMG}`]]);
  },
  grease: (e) => {
    // speedText's rule: a belt speed x1.6 is 60% faster (N1 2.3: "X% FASTER" is the speed up X%); METRONOME's locked
    // belts (lockedFlat) are not playable (hero.ts ORDER), so R1 dropped that line
    const up = fmtPct(gt(e).speed! - 1);
    return rules([{ text: `${runs(e)} ${up} FASTER.` }], [["speed", `${up} FASTER`]]);
  },
  brake: (e) => {
    const sp = fmtPct(gt(e).speed!); // x0.5 at every star (0.6.1f); ★2 HOT SHOE / ★3 RED-HOT SHOE add flat (a clause)
    return rules([{ text: `${runs(e)} AT ${sp} SPEED.` }], [["speed", `${sp} SPEED`]]);
  },
  longhaul: (e) => {
    // Battle.applyHit: flat += perPriorGate x the rig hits before it on the payload (at most priorCap from ★2: a clause)
    const d = fmtDmg(gt(e).perPriorGate!);
    return rules([hit(`+${d} {DMG} FOR EACH RIG BEFORE IT.`)], [["per", `+${d} {DMG} EACH`]]);
  },
  coil: (e) => {
    // Battle.impact: a shocked payload stalls the part it hits for DISRUPT_TIME, or the star's shockTime (STUN today)
    const t = gt(e).shockTime ?? DISRUPT_TIME, stun = fmtSec(t);
    return rules([hit(`{*STUN} ${stun}.`)], [["stun", `{*STUN} ${stun}`]], [REMINDER.STUN(t)]);
  },
  splitter: (e) => {
    const sp = gt(e).split!, n = fmtCount(sp.copies), share = fmtPct(sp.mult);
    return rules([hit(`SPLITS IT INTO ${n} AT ${share} {DMG}.`)], [["copies", `${n} COPIES`], ["mult", `${share} {DMG}`]]);
  },
  overdrive: (e) => {
    // ★2 REDLINE adds +1 and ★3 AFTERBURNER +3 to each payload (flat, a second rule); their guards are a clause
    const n = fmtCount(gt(e).speed!), flat = gt(e).flat;
    const d = flat ? fmtDmg(flat) : "";
    return rules([{ text: `${runs(e)} ${n} TIMES AS FAST.` }, ...(flat ? [hit(`+${d} {DMG}.`)] : [])],
      [["speed", `${n} TIMES`], ...(flat ? [["flat", `+${d} {DMG}`] as [string, string]] : [])]);
  },
  surge: (e) => {
    // Battle: every period its belts pulse (speed x pulse.speed for pulse.on s; the belt shows it) and each payload the
    // pulse speeds up gains pulse.flat
    // U2c group 0 fix 1 (U2b question 3): the pulse is its main effect, so the face says it: its speed (as OVERDRIVE's
    // "n TIMES AS FAST") and its length; NEXT★ shows the next speed; the tap text (glossary SURGE) explains the pulse
    const p = gt(e).pulse!, every = fmtSec(p.period), d = fmtDmg(p.flat), n = fmtCount(p.speed), on = fmtSec(p.on);
    const label = `EVERY ${every}{SEC}:`;
    // U2d F1 (cap's U2c question 1): its period changes with its stars (content.ts surge), so it is keyed too and NEXT★
    // shows it ("NEXT ★2: EVERY 2.5{SEC}, 4 TIMES, +2 {DMG}"); where the line and the star's perk name would pass the band,
    // the name gives way (faceNext)
    return rules([{ text: `${label} ${itsBelts(e)} ${oneBelt(e) ? "SURGES" : "SURGE"} ${n} TIMES AS FAST FOR ${on}{SEC}, +${d} {DMG}.`, label }],
      [["every", `EVERY ${every}{SEC}`], ["speed", `${n} TIMES`], ["flat", `+${d} {DMG}`]]);
  },
  sorting: (e) => {
    // Battle.applyHit: every `every`th payload it hits becomes `copies` payloads at full strength
    // (no ordinal: T2 bans "3RD"; ONE is definitional, as U2a's "TWO LOADS FUSE")
    const so = gt(e).sort!, every = fmtCount(so.every), n = fmtCount(so.copies);
    return rules([hit(`OF EVERY ${every} {SLUG}, ONE BECOMES ${n}.`)], [["every", `OF EVERY ${every}`], ["copies", `BECOMES ${n}`]]);
  },
  riveter: (e) => {
    const d = fmtDmg(gt(e).repair!); // never past your full hull (the sim; the hull bar shows it)
    return rules([hit(`+${d} {HULL}.`)], [["repair", `+${d} {HULL}`]]);
  },
  heatjacket: (e) => {
    const h = gt(e).heat!, d = fmtDmg(h); // + heat damage a second ridden after it (as KILN's cinder: HEAT)
    return rules([hit(`{*HEAT} ${d}.`)], [["heat", `{*HEAT} ${d}`]], [REMINDER.HEAT(h)]);
  },
  staticbrush: (e) => {
    // Battle.impact: a static payload that hits bare hull stalls a random enemy turret for staticTime (STUN today)
    const t = gt(e).staticTime!, stun = fmtSec(t);
    return rules([{ text: `ITS SLUGS HIT HULL: {*STUN} ${stun} ON A RANDOM ENEMY GUN.` }], [["stun", `{*STUN} ${stun}`]], [REMINDER.STUN(t)]);
  },
  barbed: (e) => {
    const n = fmtCount(gt(e).fray!); // ★2/★3 RAZOR WIRE raises the hull's FRAY cap (frayCap): a clause
    return rules([hit(`+${n} {*FRAY}.`)], [["fray", `+${n} {*FRAY}`]], [REMINDER.FRAY()]);
  },
  overclocker: (e) => {
    // Battle.makeSide / applyHit: it doubles the first later rig on its belt that can be doubled (overclock.ts boostable),
    // then recharges for overclockCooldown; the rigs it skips are an interim caveat (call 7)
    const t = fmtSec(gt(e).overclockCooldown!);
    return rules([{ text: `DOUBLES THE NEXT RIG'S HIT, THEN RESTS ${t}{SEC}.` }], [["rest", `RESTS ${t}{SEC}`]]);
  },
  plateroller: (e) => {
    const d = fmtDmg(gt(e).plate!);
    return rules([hit(`+${d} {*PLATE}.`)], [["plate", `+${d} {*PLATE}`]], [REMINDER.PLATE()]);
  },
  stoker: (e) => {
    // Battle.stokedPace: the factories its arrows point at work stoke faster (capped by their gun: a caveat, call 7)
    const up = fmtPct(gt(e).stoke!);
    return rules([{ text: `ITS FACTORIES WORK ${up} FASTER.` }], [["stoke", `${up} FASTER`]]);
  },
  platebreaker: (e) => {
    const b = gt(e).breaker!, spend = fmtDmg(FACE_SIM.breakerPlate), flat = fmtDmg(b.flat), floor = fmtDmg(b.floor);
    return rules([hit(`SPENDS ${spend} {*PLATE} FOR +${flat} {DMG}.`), { text: `ELSE: +${floor} {DMG}.` }],
      [["flat", `+${flat} {DMG}`], ["floor", `ELSE +${floor}`]], [REMINDER.PLATE()]);
  },
  // ------------------------------------------------- U2b: the TEXT turret gear (it describes the turret it sits on)
  // FLAK SCREEN (a STUN-fold face), LONGCASE and FINISHER RAM (N1 3.3's crit pieces) keep today's text, as every RULES
  // gear does.
  chamber: (e) => {
    const n = fmtCount(md(e).perShot!); // ★2 WIDE BREECH / ★3 TRIPLE BREECH: + window (a clause)
    return rules([{ text: `EACH SHOT FIRES ${n} {SLUG}.` }], [["shot", `FIRES ${n} {SLUG}`]]);
  },
  calibrate: (e) => {
    const up = fmtPct(1 / md(e).fireMul! - 1); // rateText's rule: an interval x0.75 fires 33% faster (N1 2.3)
    return rules([{ text: `FIRES ${up} FASTER.` }], [["rate", `${up} FASTER`]]);
  },
  spotter: (e) => {
    // Battle.pickTarget: a pick of bare hull is rerolled up to `rerolls` times; ★2/★3 weigh factories (a clause)
    const r = md(e).rerolls ?? 1, n = fmtCount(r);
    return rules([{ text: `SHOTS AT BARE HULL GET ${n} MORE AIM${s(r)}.` }], [["rerolls", `${n} MORE AIM${s(r)}`]]);
  },
  escapement: (e) => {
    const up = fmtPct(1 / md(e).fireMul! - 1); // METRONOME's pendulum line: not playable (R1 dropped it)
    return rules([{ text: `FIRES ${up} FASTER.` }], [["rate", `${up} FASTER`]]);
  },
  spallcatcher: (e) => {
    // Battle.spallCharge: + add for every `every` damage your ship takes, on this turret's next shot (its cap and
    // plating's double count are an interim caveat, call 7)
    const sp = md(e).spall!, every = fmtDmg(sp.every), add = fmtDmg(sp.add);
    // U2d F1: its cap (the interim caveat's MAX, INTERIM_CAVEATS spallcatcher) changes with its stars: keyed, so NEXT★ shows it
    return rules([{ text: `EVERY ${every} {DMG} YOU TAKE: NEXT SHOT +${add} {DMG}.` }], [["add", `+${add} {DMG}`], ["max", `MAX ${fmtDmg(sp.max)} {DMG}`]]);
  },
  // ------------------------------------------------------------------------------------------ U2b: the supplies
  // U2c group 0 fix 2: {BELT} means belts, a count (a factory's {BELT}3); belt capacity is tiles, in words (hero select's
  // "BELT 24 TILES")
  beltcrate: (e) => rules([{ text: `+${fmtCount(e.supply!.belt!)} BELT TILES FOR THE RUN.` }]),
  plating: (e) => rules([{ text: `+${fmtDmg(e.supply!.hull!)} {HULL} FOR THE RUN.` }]),
};

// ------------------------------------------------------------------------------- U2b: the interim lines (F5, F6)

/** One interim caveat (U2b F5): a rule a face dropped that stays visible until U4 draws it. */
export interface InterimCaveat {
  id: string;
  /** What replaces it, so U4 removes the row when that ships. */
  until: string;
  applies: (e: ItemDef) => boolean;
  text: (e: ItemDef) => string;
}

/**
 * U2b F5: THE ONE TABLE of interim caveats. Each is a kept 3x5 line in the reminder's colour (inspector role
 * "caveat"), outside the budget; U4 deletes a row when its board cue ships. Data-driven where the sim is: a turret takes
 * a belt on its inner column only when its TurretSpec says intake "inner" (abilityText TURRET). Cap's review call 7's
 * three caveats are STOKER's cap, SPALL CATCHER's double count (with its cap) and OVERCLOCKER's exclusions.
 */
export const INTERIM_CAVEATS: readonly InterimCaveat[] = [
  { id: "inner", until: "the board cues job: the turret's intake marks", applies: (e) => e.turret?.intake === "inner", text: () => "INNER COLUMN ONLY." },
  // Battle.stokedPace: the stamping is capped so it never outruns the gun its belt feeds (deckRating stokeKeep)
  { id: "stoker", until: "the board cues job: the factory's real interval with a MAX badge", applies: (e) => !!e.gate?.stoke, text: () => "A FACTORY NEVER OUTRUNS ITS GUN." },
  // Battle.spallCharge: taken = hull + 2 x plating's part; the charge is capped at spall.max
  {
    id: "spallcatcher", until: "the board cues job: the turret's charge gauge", applies: (e) => !!e.mod?.spall,
    text: (e) => `{*PLATE} SOAKS COUNT TWICE. MAX ${fmtDmg(e.mod!.spall!.max)} {DMG}.`,
  },
  // overclock.ts boostable: no speed rig (speed, pulse), TOLLBOOTH, SIFTER, RIVETER, POWDER KEG, OVERCLOCKER, nor a rig
  // that acts on no payload (STOKER, BRACE FRAME); U2c's tap text can list them
  { id: "overclocker", until: "the board cues job: the link to the rig it will double", applies: (e) => !!e.gate?.overclockCooldown, text: () => "IT SKIPS RIGS IT CAN'T DOUBLE." },
];

/** One interim perk clause (U2b F6): its text, its numbers keyed for NEXT★, any keyword reminder, and a perk name where
 *  the star's data names none of its own. */
interface Clause {
  text: string;
  nums: [string, string][];
  reminders?: string[];
  perk?: string;
}

/**
 * U2b F6: a face never says less than the sim when it ships. Until R4 (the STAR batch) turns these perks into numbers,
 * the star that has one shows a short clause after its perk name ("★2 SPARK JUMP: {STUN} HITS 2 PARTS."), written from
 * the sim, every number through a formatter. Cap's 4 (HOT SWAP, LIMPET WORKS, ROTARY BREECH, GRAPNEL GUN), then the
 * TEXT rigs' and gear's own STAR-batch perks (R1 redesign.json "-> STAR batch"). R4 deletes this table.
 */
const INTERIM_CLAUSES: Record<string, (e: ItemDef, x: X) => Clause | null> = {
  hotswap: (e) => {
    // Battle.impact: a spark slug with jump also stalls the `jump` nearest other parts (sparkJump); content.ts: the
    // spark tracks GALVANIC COIL, whose ★2 perk names it SPARK JUMP
    const j = cyc(e, "spark").jump;
    if (!j) return null;
    const n = fmtCount(1 + j);
    return { text: `{*STUN} HITS ${n} PARTS.`, nums: [["jump", `${n} PARTS`]], perk: perkAt("coil", FUSE_MAX) };
  },
  limpet: (e) => {
    // Battle.hullEffects: a charge with a stall stalls the part it stuck to when it blasts (disrupt "limpet")
    const t = (f(e).round as { stall?: number }).stall;
    if (!t) return null;
    const stun = fmtSec(t);
    // (a keyword never takes a suffix: "{*STUN}S" would draw its word in the base colour, REQ-BFG-032 rule 3)
    return { text: `ITS BLAST GIVES THE PART {*STUN} ${stun}.`, nums: [["stall", `{*STUN} ${stun}`]], reminders: [REMINDER.STUN(t)] };
  },
  rotary: (e, x) => {
    // cores.ts ROUTINES.rotary: ★2 GREASED RACE / ★3 CLEAN FEED: the interval x intervalMul (rateText), ★3 noJam
    const cs = c(e, x);
    if (!cs.intervalMul) return null;
    const up = fmtPct(1 / cs.intervalMul - 1);
    return { text: `FIRES ${up} FASTER${cs.noJam ? ", NEVER JAMS" : ""}.`, nums: [["rate", `${up} FASTER`]] }; // (NEVER JAMS is the clause's: NEXT★ stays one line)
  },
  grapnel: (e, x) => {
    // battle.ts impact: the salvage needs a ★3 core (gun.core.stars >= 3, FUSE_MAX); it pays on the next shot
    if (x.stars < FUSE_MAX) return null;
    const d = fmtDmg(FACE_SIM.salvagePerRip * x.k);
    // U2d F1: its number is keyed, so NEXT★ shows it ("RIPS 3, +1 {DMG} EACH"); the perk name gives way past the band
    return { text: `NEXT SHOT +${d} {DMG} FOR EACH SLUG IT RIPS.`, nums: [["salvage", `+${d} {DMG} EACH`]] };
  },
  // the TEXT rigs' own STAR-batch perks
  brake: (e) => {
    const flat = gt(e).flat; // ★2 HOT SHOE / ★3 RED-HOT SHOE: friction heat (0.6.1f)
    if (!flat) return null;
    const d = fmtDmg(flat);
    return { text: `+${d} {DMG} ON EACH HIT.`, nums: [["flat", `+${d} {DMG}`]] };
  },
  longhaul: (e) => {
    const cap = gt(e).priorCap; // Battle.applyHit: at most priorCap rig hits count (from ★2)
    if (cap === undefined) return null;
    const n = fmtCount(cap);
    return { text: `MAX ${n} RIGS.`, nums: [["cap", `MAX ${n} RIGS`]] };
  },
  coil: (e) => {
    const j = gt(e).jump; // Battle.sparkJump: the shock also stalls the `jump` nearest other parts
    if (!j) return null;
    const n = fmtCount(1 + j);
    return { text: `{*STUN} HITS ${n} PARTS.`, nums: [["jump", `${n} PARTS`]] };
  },
  overdrive: (e) => {
    // Battle.acceptHarassment / routeGuardActive: GUARD_SLOW keeps enemy chains from slowing its belts from its tiles on,
    // GUARD_FREEZE keeps frost from freezing them (today's harassments; STUN keeps today's meaning, N1 INPUTS 5)
    const guard = gt(e).guard ?? 0;
    if (!guard) return null;
    const frost = (guard & GUARD_FREEZE) !== 0;
    // (no NEXT★ number: the line names the perk, and the clause says it at that star)
    return { text: `ENEMY CHAINS${frost ? " AND FROST" : ""} CAN'T SLOW${frost ? " OR FREEZE" : ""} ${itsBelts(e)}.`, nums: [] };
  },
  barbed: (e) => {
    const cap = gt(e).frayCap; // Battle.impact: the hull's FRAY cap is FRAY_MAX + frayCap
    if (!cap) return null;
    const n = fmtCount(FRAY_MAX + cap);
    return { text: `MAX ${n} {FRAY}.`, nums: [["cap", `MAX ${n} {FRAY}`]] };
  },
  // the TEXT gear's own STAR-batch perks
  chamber: (e) => {
    const w = md(e).window; // TurretState.window: the chamber holds `window` more loads (★2 WIDE BREECH)
    if (!w) return null;
    const n = fmtCount(w);
    return { text: `HOLDS +${n} {SLUG}.`, nums: [["window", `HOLDS +${n} {SLUG}`]] };
  },
  spotter: (e) => {
    // Battle.pickTarget: factories weigh factoryWeight x; ★3 EAGLE EYE (alwaysMachine) never picks bare hull
    const m = md(e);
    if (!m.factoryWeight) return null;
    const n = fmtCount(m.factoryWeight);
    return {
      text: `${m.alwaysMachine ? "ALWAYS AIMS AT A PART, AND " : ""}PICKS FACTORIES ${n} TIMES AS OFTEN.`,
      // U2d F1: its number changes with its stars (FACTORY SPOT, EAGLE EYE): keyed, so NEXT★ shows it; the perk name gives
      // way where the line would pass the band (meaning before names)
      nums: [["weight", `FACTORIES ${n} TIMES`]],
    };
  },
};

/** The turrets: a stat row only (R1 C3: a turret carries no rules text). */
const TURRET_FACE = (): Rules => rules([]);

/** The pieces with a new face, in redesign.json's groups' order (tests and tools). */
export const FACE_IDS: readonly string[] = [
  ...Object.keys(FACES),
  ...Object.values(ITEMS).filter((d) => d.kind === "turret").map((d) => d.id),
];

/** True for a piece that draws its new face (every other piece keeps today's text). */
export function hasFace(def: string): boolean {
  return FACE_IDS.includes(def);
}

/** A piece's face at `stars` as data (o: the turret class factor k for a core, the run's hero for MIMIC FORGE). */
export function faceAt(def: string, stars = 1, o: TextOpts = {}): Face | null {
  if (!hasFace(def)) return null;
  const e = effectAt(def, stars), x: X = { stars, k: o.k ?? 1, hero: o.hero };
  const body = e.kind === "turret" ? TURRET_FACE() : FACES[def](e, x);
  const stats = e.kind === "turret" ? turretStats(def, stars) : e.kind === "factory" ? factoryStats(def, stars, o.hero)
    : e.kind === "core" ? coreStats(def, stars, x.k) : e.kind === "gate" ? rigStats(def, stars) : e.kind === "mod" ? gearStats(def, stars)
    : supplyStats(def); // U2b: the rig, gear and supply kinds' data functions
  // U2b F6: the star's interim perk clause, after its perk name; its numbers join the face's (NEXT★ diffs them)
  const cl = INTERIM_CLAUSES[def]?.(e, x) ?? null;
  const perk = cl ? cl.perk ?? livePerk(def, stars) : undefined;
  const label = `★${stars}${perk ? ` ${perk}` : ""}:`;
  // U2b F5: the interim caveats (one table)
  const caveats = INTERIM_CAVEATS.filter((cv) => cv.applies(e)).map((cv) => cv.text(e));
  return {
    stats, ...body,
    ...(cl ? { nums: [...body.nums, ...cl.nums], reminders: [...body.reminders, ...(cl.reminders ?? [])], clause: { text: `${label} ${cl.text}`, label } } : {}),
    ...(caveats.length ? { caveats } : {}),
  };
}

/** A face's lines in glyphs: the stat row (null when it has none), the rule lines (each with its label) and the
 *  reminders; U2b: the interim perk clause (F6) and caveats (F5), where it has them. */
export interface FaceLines {
  stats: string | null;
  rules: FaceRule[];
  reminders: string[];
  clause?: FaceRule;
  caveats?: string[];
}

export function faceLines(def: string, stars = 1, o: TextOpts = {}): FaceLines | null {
  const fc = faceAt(def, stars, o);
  if (!fc) return null;
  return {
    stats: fc.stats.length ? statRow(fc.stats) : null,
    rules: fc.rules.map((r) => ({ text: icons(r.text), ...(r.label ? { label: icons(r.label) } : {}) })),
    reminders: fc.reminders.map((r) => icons(r)),
    ...(fc.clause ? { clause: { text: icons(fc.clause.text), label: icons(fc.clause.label!) } } : {}),
    ...(fc.caveats ? { caveats: fc.caveats.map((t) => icons(t)) } : {}),
  };
}

/** The numbers that differ from star `from` to star `to`, in glyphs: the changed stat pairs as one stat row, then each
 *  changed rule number in its NEXT★ form, a keyword as its icon alone (C7: numbers only, in the face's own icons). */
export function faceDiff(def: string, from: number, to: number, o: TextOpts = {}): string | null {
  const a = faceAt(def, from, o), b = faceAt(def, to, o);
  if (!a || !b) return null;
  const stats = b.stats.filter(([ic, v]) => a.stats.find(([ic2]) => ic2 === ic)?.[1] !== v);
  const nums = b.nums.filter(([k, v]) => a.nums.find(([k2]) => k2 === k)?.[1] !== v).map(([, v]) => icons(v, "alone"));
  return [...(stats.length ? [statRow(stats)] : []), ...nums].join(", ");
}

/** U2d F1: the width (art px) a NEXT★ line keeps to: one line of 5x7 on the op view's band (T1 2.6; GLOSSARY_WRAP_W). */
export const NEXT_LINE_W = 225;

/** NEXT★ (C7): "NEXT ★2:" (the brass label) and the next star's changed numbers; `perk`, the perk that star brings (the
 *  sim applies it), for a line whose numbers say nothing of it. Null at the top star, for a piece that never fuses (a
 *  hero's factory) or without a face. U2d F1 (cap's U2c question 1): meaning before names: where the perk's name ("★2
 *  OVERPRESSURE", drawn after the numbers) would take the line past NEXT_LINE_W, the name gives way and the numbers say
 *  what the star brings; a line with no changed number keeps it (the name is all it says). */
export function faceNext(def: string, stars: number, o: TextOpts = {}): { label: string; text: string; perk?: string } | null {
  if (!hasFace(def) || !fusible(def) || stars >= FUSE_MAX) return null;
  const label = `NEXT ★${stars + 1}:`, diff = faceDiff(def, stars, stars + 1, o) ?? "";
  const p = livePerk(def, stars + 1);
  const text = diff ? `${label} ${diff}` : label;
  const fits = (name: string): boolean => !diff || textWidth(`${text} ★${stars + 1} ${name}`) <= NEXT_LINE_W;
  const perk = p && p !== livePerk(def, stars) && fits(p) ? p : undefined;
  return { label, text, ...(perk ? { perk } : {}) };
}

/** C7's merge line for an offer that merges on purchase: "MERGES INTO ★2: +4 [BURN]" (the numbers ★1 doesn't have). */
export function faceMerge(def: string, to: number, o: TextOpts = {}): string | null {
  if (!hasFace(def)) return null;
  const diff = faceDiff(def, 1, to, o);
  return `MERGES INTO ★${to}${diff ? `: ${diff}` : ""}.`;
}

/** A face's rules as one clause without its last full stop, for the turret panel's compact core row (as gist). */
export function faceGist(def: string, stars: number, o: TextOpts = {}): string | null {
  const fl = faceLines(def, stars, o);
  if (!fl) return null;
  const t = fl.rules.map((r) => r.text).join(" ") || fl.stats || "";
  return t.replace(/\.$/, "");
}

/** A rule line's spans: its brass label (a keyword in it keeps its colour), the rest as rich text in `base`. */
export function ruleSpans(text: string, label: string | undefined, base: string): Span[] {
  const at = label ? text.indexOf(label) : -1;
  if (!label || at < 0) return colourize(text, base);
  const pre = text.slice(0, at).trim(), post = text.slice(at + label.length).trim();
  return [
    ...(pre ? [...colourize(pre, base), { t: " ", c: base }] : []),
    ...colourize(label, PERK_COLOUR, PERK_COLOUR),
    ...(post ? [{ t: " ", c: base }, ...colourize(post, base)] : []),
  ];
}

// ------------------------------------------------------------------------------------------------------ the heroes

/** C6: each TEXT hero's ability at hero select as its face (its signature factory's rule, said of the factory's slugs;
 *  cap's review call 5: WEAVER's is LOOM SLUGS HAVE FRAY 1). FURNACE's is a RULES change: it keeps heroTrick. */
const HERO_FACES: Partial<Record<HeroId, () => Rules>> = {
  weaver: () => {
    const h = HEROES.weaver;
    return rules([{ text: `${ITEMS[h.factory].name} SLUGS HAVE {*FRAY} ${fmtCount(AMMO[h.ammo].fray)}.` }], [], [REMINDER.FRAY()]);
  },
  foundry: () => {
    const label = "{*PAIR}:";
    return rules([{ text: `${label} ${ITEMS[HEROES.foundry.factory].name} BLANKS FUSE, +${fmtPct(FUSE_MULT - 1)} {DMG}.`, label }], [], [REMINDER.PAIR()]);
  },
  bastion: () => rules([{ text: `${ITEMS[HEROES.bastion.factory].name} SLUGS LOAD: +${fmtDmg(PLATE_PER_SLUG)} {*PLATE}.`, label: "LOAD:" }],
    [], [REMINDER.PLATE()]),
};

/** A hero's ability face for hero select, in glyphs (null: the hero keeps heroTrick's sentence). */
export function heroFace(hero: HeroId): { rules: FaceRule[]; reminders: string[] } | null {
  const fn = HERO_FACES[hero];
  if (!fn) return null;
  const r = fn();
  return {
    rules: r.rules.map((q) => ({ text: icons(q.text), ...(q.label ? { label: icons(q.label) } : {}) })),
    reminders: r.reminders.map((q) => icons(q)),
  };
}

/** C6's identity in three words (PLAYSTYLE), for the TEXT heroes whose words change; every other hero keeps its own. */
const PLAYSTYLE: Partial<Record<HeroId, string>> = { weaver: "THREADS FRAY HULLS", foundry: "PAIRS FUSE STRONGER" };
export const heroPlaystyle = (hero: HeroId): string => PLAYSTYLE[hero] ?? HEROES[hero].pattern;
