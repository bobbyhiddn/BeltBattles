// U2a (REQ-BFG-046, REQ-BFG-047): THE FACE KIT and the new faces of the first half of the pieces (R1 MEMO C4; redesign.md
// and redesign.json's AFTER faces as amended by cap's R1 review, calls 1 and 3-7; N1 REPORT section 6 items 1-8).
//
// A face is one idea per piece, read top to bottom:
//   the STATS row   icon + number pairs from the piece kind's one data function (factoryStats, turretStats), at most 3
//                   (statRow); the speed pair comes from speedPair, the one place NUMBERS turns SEC into RATE
//   the RULE line   a trigger label in brass where the rule has one (HIT:, SHOT:, LOAD:, {*PAIR}:, EVERY 3{SEC}:), then
//                   the effect; a keyword in panel style ({*BURN}: its icon then its word, in its colour)
//   the REMINDER    each keyword's reminder text (C1) with the piece's own number filled in (never "n": the font has no
//                   lower case, N1 6.7); U2e step 4 (REQ-BFG-070): no longer drawn on the face: a word tap, the desk's
//                   hover tooltip and the ⓘ view's KEYWORDS show it (glossary.ts)
//   NEXT★           one line, computed: the next star's numbers that differ from this star's (faceNext diffs the two
//                   stars' data; nothing here is hand-written per star); U2e step 5: the ⓘ view's LEVELS show it, after
//                   a ladder per number that changes with the stars (screens/build/levels.ts), never the face
//   U2e step 2: the second STATS row (stats2, carryStats): what a factory's own payloads carry, icon + number
// Every number comes from sim data (content.ts, races/*.ts, the star levels, the hero and the turret class factor k)
// through one formatter of src/ui/statFormat.ts. No template here holds a digit (tests/faceText.test.ts reads this
// file's string literals and fails on one).
//
// Which pieces (BRIEF-U2a): kind hero, factory, core and turret with flag TEXT in redesign.json, except N1's crit piece
// (CAPACITOR BANK), which keeps today's text, as every RULES piece does (FURNACE's ability, ASSEMBLY LINE, DRAKE NOZZLE,
// STEAM BREECH): they have no entry here, so every panel draws them exactly as today.
// NUM-3 (R1's STUN fold, REQ-BFG-046, REQ-BFG-070): the 7 STUN-fold pieces have faces now (R1's after faces in U2e's
// stat / ability split): SCRAPPER, SABOT, FROSTBITE and DRAG CHAIN FOUNDRY (a round's STUN is its own: carryStats),
// TOLLBOOTH, FLAK SCREEN and MANTLET.
// THE INTERIM (N1 2.6): the faces are held for stage A's NUMBERS release; until then the formatters print today's values.

import { icons, textWidth, type KeywordName } from "../render/font";
import { colourize, PERK_COLOUR, type Span } from "./richText";
import { statRow, type Stat } from "./icons";
import { fmtCount, fmtDmg, fmtPct, fmtSec, fmtSpeed } from "./statFormat";
import { livePerk, type TextOpts } from "./abilityText";
import { upToLoads } from "./abilityText"; // Y7b1 (release Y; ruling Y7A-R2): EXT. CHAMBER's UP TO n with the star switch on
import { SIM } from "./abilityText"; // NUM-3: SCRAPPER's queue cap and SABOT's SHRAPNEL STUN (each checked against battle.ts)
import {
  AMMO, BURN_TIME, DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS, type HeroId, type ItemDef, type PayloadPreset,
} from "../sim/content";
import { SHIELD_CAP } from "../sim/content"; // SUS-B (REQ-BFG-069): SHIELD's MAX 3
import { GUARD_FREEZE, SHAPE_ARROWS, rigShape } from "../sim/content"; // U2b: the rigs' belts and OVERDRIVE's guards
import { GUARD_SLOW, STUN_CAUSES } from "../sim/content"; // NUM-3: OVERDRIVE's chain guard; MANTLET's immunity
import { factorySpeed } from "../sim/content"; // NUM-2 (REQ-BFG-047): SPEED; NUM-4: the RATE pair prints it
import { BURN_DPS } from "../sim/content"; // NUM-4: a Burn stack's damage a second (FACE_SIM.burnTick)
import { FURNACE_LONG_BELT } from "../sim/battle"; // Y1: FURNACE's hero face, its long-belt rate % (E1)
import { pct, roundHalfUp } from "../sim/pct"; // NUM-4: GRAPNEL's salvage as the sim rounds it
import { FUSE_MULT } from "../sim/races/foundry";
import { PLATE_CAP, PLATE_PER_SLUG } from "../sim/races/bastion";
import { scaleCore } from "../sim/cores";
import { effectAt, FUSE_MAX, fusible, outputsAt } from "../sim/stars";
import { perkAt } from "../sim/stars"; // U2b F6: HOT SWAP's spark carries GALVANIC COIL's SPARK JUMP (content.ts hotswap)
import { pourAt } from "../sim/stars"; // Y1: a factory's pour as a {SLUG} stat (carryStats)
import { gearSlotsOf } from "../sim/deck";
import { WINDOW_TIME } from "../sim/content"; // Y4 (release Y; DESIGN-Y row 37): ROTARY BREECH's load time, % sooner

/**
 * The engine's numbers a reminder needs that no spec carries (as abilityText.ts SIM): each quoted from its source.
 */
export const FACE_SIM = {
  // NUM-4 (REQ-BFG-047): three numbers here were still on the x1 scale after NUM-1 (a finding each; NUM-4's report):
  burnTick: BURN_DPS, // battle.ts hullEffects: each Burn stack deals the enemy hull BURN_DPS (10) a second (was 1)
  // U2b: battle.ts applyHit: a PLATE BREAKER takes 10 plating from your hull for its flat (NUM-1: plate >= 10, spendPlate
  // 10; was 1)
  breakerPlate: 10,
  // U2b F6: battle.ts impact: a ★3 GRAPNEL GUN's next shot gains pct(10, k%) damage for each payload it rips (NUM-1: x10,
  // the class factor as a whole %, rounded once; was 1 x k, a fraction on every class)
  salvagePerRip: 10,
  // NUM-3: battle.ts produce: a SCRAPPER queues one stamp for each harassment its side lands (harassAccepted - seenHarass)
  scrapPerHarass: 1,
  // NUM-3: ... and with ★3 BIG HAUL one more for each wreck (wreckAccepted - seenWreck)
  scrapPerWreck: 1,
  // Y1 (STAR-D row 5): cores.ts ROUTINES.compound is ready at 2 loads in the chamber, and Battle.fireCore fires them as one
  // shell (the second load rides in the first, p.compound): COMPOUND BREECH's "FUSES 2 {SLUG} INTO 1"
  compoundLoads: 2,
  compoundShells: 1,
  // Y4 (release Y; DESIGN-Y row 40): cores.ts drakeConvert: a DRAKE NOZZLE turns each flatPerBurn of a shot's bonus damage
  // into one BURN stack (floor(flat / flatPerBurn) stacks): "EACH 25 BONUS DAMAGE IS 1 {BURN}" (Y7b1, ruling Y7A-R4's fallback; Y4: 10)
  drakeStacks: 1,
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
  /** U2e step 2 (REQ-BFG-070, the operator: "an item giving burn is an ability but an item with burn is just a stat"):
   *  the stat row's second row, where a face's own stats need one: what a factory's own payloads carry (KILN's {HEAT},
   *  LOOM's {FRAY}, HOT SWAP's {BURN} and {STUN}, a batch's {SLUG}), icon + number pairs from carryStats. */
  stats2?: Stat[];
  rules: FaceRule[];
  reminders: string[];
  nums: [string, string][];
  /** U2b F6: the star's interim perk clause, its label "★2 SPARK JUMP:" in brass; kept, outside the budget. Y7b2 (the
   *  flip): no face has one any more (every interim clause left with the star switch's rules); the field stays for its
   *  readers. */
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

/** THE speed pair (N1 6.2): a repeating action's cadence. NUM-4 (REQ-BFG-047; N1 2.2): ["RATE", speed], its SPEED, shots
 *  or slugs per 30 s ({RATE}19), here and nowhere else (was ["SEC", interval], today's interval with SEC after it). */
export const speedPair = (speed: number): Stat => ["RATE", fmtSpeed(speed)];

/** A factory shows its belts when it is a hero's (BELTS levels add belts) or when any star feeds more than one. */
const showsBelts = (def: string): boolean => !fusible(def) || [1, 2, 3].some((n) => outputsAt(def, n) > 1);

/** A factory's stat pairs at `stars` (MIMIC FORGE's for `hero`): its stamp's cadence, its slug's damage and, where it
 *  shows them, its belts. The slug damage is its dies' (FactorySpec.base), else its ammo's (Battle.stamp), and a
 *  SCRAPPER's scrapFlat on top (NUM-3: Battle.stamp adds it to each slug it stamps). */
export function factoryStats(def: string, stars = 1, hero?: HeroId): Stat[] {
  const fs = effectAt(def, stars).factory!;
  let speed = fs.speed, dmg = (fs.base ?? AMMO[fs.ammo].base) + (fs.scrapFlat ?? 0); // NUM-4 (REQ-BFG-047): its SPEED (RATE)
  if (def === "mimic") {
    // Battle.factoryDef: the hero's ammo at its own factory's interval x intervalMul; no hero, no cadence to show
    const h = hero ? HEROES[hero] : undefined, sig = h ? ITEMS[h.factory]?.factory : undefined;
    if (!h || !sig) return [["BELT", fmtCount(outputsAt(def, stars))]];
    speed = factorySpeed(def, fs, hero!); // NUM-2: the hero factory's speed x its rate %, rounded once
    dmg = AMMO[h.ammo].base;
  }
  // Y2 (release Y; DESIGN-Y row 13): a LIMPET WORKS' DMG is its charge's blast (its base is 0: the 20 on impact joined the
  // blast)
  if (fs.round?.kind === "limpet") dmg += fs.round.blast;
  return [speedPair(speed), ["DMG", fmtDmg(dmg)], ...(showsBelts(def) ? [["BELT", fmtCount(outputsAt(def, stars))] as Stat] : [])];
}

/**
 * U2e step 2 (REQ-BFG-070): STATS APART FROM ABILITIES. The test: when the effect happens, whose shot, payload or effect
 * is it? The piece's own is a STAT (icon + number in the stat row, never a sentence); one given to something else
 * (payloads passing a rig, the turret a core or gear sits on, the belt, your hull, the run) is an ABILITY (a rule line).
 * So a factory's own payloads' keywords and its batch are stats: the stat row's second row (the first holds its cadence,
 * damage and belts). PLATE always lands on your hull, so ARMOR PRESS's and WARDWORKS' plating stays an ability. Null for
 * a piece whose payloads carry nothing of their own.
 */
export function carryStats(def: string, stars = 1, hero?: HeroId): Stat[] | null {
  const fs = effectAt(def, stars).factory;
  if (!fs) return null;
  // Battle.factoryDef: MIMIC FORGE stamps the hero's ammo (factoryStats), so its slugs carry what the hero's carry
  const h = def === "mimic" && hero ? HEROES[hero] : undefined;
  const out: Stat[] = [];
  // Battle.stamp: a batch's slugs leave one by one (DOUBLE STAMP, SHOT TOWER)
  if (fs.batch && fs.batch > 1) out.push(["SLUG", fmtCount(fs.batch)]);
  // Y1 (REQ-BFG-070; STAR-D row 6): where a MIMIC FORGE makes the hero's blanks (FOUNDRY), the slugs one cycle puts onto
  // its belts are its own output, a stat: 1, and 2 at ★3 TWIN SIGNET (stars.ts pourAt; Battle.factoryDef keeps `pour`
  // only for a blank-ammo hero). On every other hero it stamps one slug a cycle, in turn, as before: no row
  if (h && h.ammo === "blank") out.push(["SLUG", fmtCount(Math.max(1, pourAt(def, stars, h.ammo)))]);
  // Y1 (STAR-D row 7): TWIN MOULD's pour, the slugs one cast puts onto separate belts at once: 2, and 3 at ★3 THIRD SPRUE
  // (battle.ts: a twin factory's pourAll, onto at most spec.pour belts with room), whatever its belts (2 / 3 / 4)
  if (fs.twin) out.push(["SLUG", fmtCount(pourAt(def, stars))]);
  // Battle.stamp: HOT SWAP's EMBER slugs carry its burn, its SPARK slugs a shock (DISRUPT_TIME, or the star's shockTime)
  const ember = fs.cycle?.find((p) => p.tint === "ember"), spark = fs.cycle?.find((p) => p.tint === "spark");
  if (ember?.burn) out.push(["BURN", fmtCount(ember.burn)]);
  if (spark?.shock) out.push(["STUN", fmtSec(spark.shockTime ?? DISRUPT_TIME)]);
  // NUM-3 (R1's STUN fold): a SABOT, FROST or CHAIN round STUNs the part it hits for round.seconds (Battle.roundImpact)
  const r = fs.round;
  if (r && (r.kind === "sabot" || r.kind === "frost" || r.kind === "drag")) out.push(["STUN", fmtSec(r.seconds)]);
  // the ammo's own: a CINDER SLUG's HEAT (its rideScale), a THREAD SLUG's FRAY (KILN, LOOM)
  const ammo = AMMO[h ? h.ammo : fs.ammo];
  if (ammo?.rideScale) out.push(["HEAT", fmtDmg(ammo.rideScale)]);
  if (ammo?.fray) out.push(["FRAY", fmtCount(ammo.fray)]);
  return out.length ? out : null;
}

/** A turret's stat pairs at `stars`: how often it fires, the loads its chamber holds, its gear slots (deck.ts). */
export function turretStats(def: string, stars = 1): Stat[] {
  const t = effectAt(def, stars).turret!;
  return [speedPair(t.speed), ["SLUG", fmtCount(t.window)], ["GEAR", fmtCount(gearSlotsOf(def, stars))]]; // NUM-4: its SPEED (RATE)
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

/** A turret core's stat pairs: none, but TESLA ARC's arc damage (Y1). U2e step 2 (REQ-BFG-070): a core's numbers act on
 *  the turret it is fitted to, so they are its abilities, its rule's (SCATTER CHOKE's pellet share, "{DMG}40% EACH" here
 *  until U2e, joins its rule). `k`: the turret's class factor (cores.ts scaleCore). */
export function coreStats(def: string, stars = 1, k = 1): Stat[] {
  const cs = scaleCore(effectAt(def, stars).core!, k);
  if (!cs) throw new Error(`coreStats: ${def} is not a turret core`);
  // Y1 (REQ-BFG-070; REVIEW-STARD, found outside STAR-D's list): TESLA ARC's arc deals tesla.share of the shot's damage to
  // each part it arcs to (Battle.impact: secondaryImpact(..., share, "arc")), 25% / 25% / 30%, a number no face said: its
  // own stat, {DMG}25%, so the ⓘ ladder reads "{DMG} 25%/25%/30%" (a share, not scaled by k: cores.ts scaleCore)
  if (def === "tesla" && cs.share) return [["DMG", fmtPct(cs.share)]];
  return [];
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
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1 and 4.9): SHIELD a count (fmtCount; content.ts SHIELD_CAP), HEAL and REGEN on hull.
  // REGEN's verb is HEAL's (GIVES BACK; 4.9 wrote HEALS, which would stand as a bare keyword: REQ-BFG-032 rule 3)
  // NUM-4 (REVIEW-SUSB F1): it blocks one hit's DAMAGE; that hit's BURN, FRAY, STUN and poison still land (battle.ts impact)
  SHIELD: () => `EACH {*SHIELD}: BLOCKS ONE HIT'S DAMAGE. MAX ${fmtCount(SHIELD_CAP)} {SHIELD}.`,
  HEAL: () => "{*HEAL}: GIVES BACK {HULL}, NEVER PAST FULL.",
  REGEN: () => "{*REGEN}: GIVES BACK THIS MUCH {HULL} EACH SEC.",
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
/** NUM-3: a SABOT, FROST or CHAIN round's spec (its STUN's seconds; FROSTBITE's spread, SABOT's shrapnel). */
const rnd = (e: ItemDef) => f(e).round as { seconds: number; spread?: number; shrapnel?: boolean };
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
  // U2e step 2 (REQ-BFG-070): a batch is the factory's own output, a stat ({SLUG}2 in its second stat row, carryStats):
  // was "STAMPS 2 SLUGS AT A TIME." and "DROPS 3 SLUGS; RIGS HIT EACH ONE."
  doublestamp: () => rules([]),
  shottower: () => rules([{ text: "RIGS HIT EACH SLUG." }]),
  hotswap: (e) => {
    // Battle.stamp: EMBER slugs carry its burn, SPARK slugs a shock (DISRUPT_TIME, or the star's shockTime)
    // U2e step 2: its slugs' BURN and STUN are its own, stats ({BURN}2 {STUN}1.6, carryStats); the line says only that
    // they alternate (was "ITS SLUGS ALTERNATE: +2 {*BURN}, THEN {*STUN} 1.6.")
    const t = cyc(e, "spark").shockTime ?? DISRUPT_TIME;
    return rules([{ text: "ALTERNATES {*BURN} AND {*STUN} SLUGS." }], [], [REMINDER.BURN(), REMINDER.STUN(t)]);
  },
  slagpot: () => rules([{ text: "ITS SLUGS IGNORE BELT SPEED." }]),
  gantry: () => rules([]),
  mimic: () => rules([{ text: "STAMPS YOUR HERO'S SLUGS." }]),
  limpet: (e) => {
    // DESIGN-Y row 13: its charges' blast is its DMG stat (factoryStats: the charge's 20 joined it, content.ts STAR_DIFF);
    // Battle.hullEffects: each charge blasts the enemy hull round.delay s after it hits. Was "CHARGES BLAST THE HULL: 80
    // {DMG}, 3{SEC} LATER." and ★2/★3's clause "ITS BLAST GIVES THE PART {*STUN} 1."
    const delay = fmtSec((f(e).round as { delay: number }).delay);
    return rules([{ text: `ITS {SLUG} BLAST THE HULL ${delay}{SEC} AFTER THEY HIT.` }], [["delay", `${delay}{SEC}`]]);
  },
  // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 7): its pour is its {SLUG} stat (carryStats: 2 / 2 / 3), so the line names no
  // count. Was "CASTS A SLUG ONTO EACH BELT AT ONCE.", wrong at ★2/★3: it pours 2 slugs (★3 3) while it feeds 3 (4) belts
  twinmould: () => rules([{ text: "CASTS ITS {SLUG} ONTO SEPARATE BELTS AT ONCE." }]),
  armorpress: (e) => {
    const p = f(e).plate!, every = fmtSec(p.every), amount = fmtDmg(p.amount);
    const label = `EVERY ${every}{SEC}:`;
    // U2d F1: the period's NEXT★ form is SURGE's, without the label's colon (its period is one at every star today)
    return rules([{ text: `${label} +${amount} {*PLATE}.`, label }], [["every", `EVERY ${every}{SEC}`], ["plate", `+${amount} {*PLATE}`]], [REMINDER.PLATE()]);
  },
  // NUM-3 (R1's STUN fold, REQ-BFG-046, REQ-BFG-070): the four STUN-fold factories. A SABOT, FROST or CHAIN round's STUN is
  // its own payload's, a stat ({STUN} in the second stat row, carryStats: R1's "ITS ROUNDS: {STUN} 2.5." line is a stat in
  // U2e's split); the reminder, with the round's seconds, stays for the tap
  scrapper: () => {
    // Battle.produce: one more stamp for each harassment its side lands (acceptHarassment); that wrecks and rips count too
    // and the queue's cap are interim caveats, ★3 BIG HAUL's wreck a clause. Its slugs' scrapFlat is in its DMG stat
    const n = fmtCount(FACE_SIM.scrapPerHarass);
    return rules([{ text: `+${n} {SLUG} FOR EACH {*STUN} YOU LAND.` }]);
  },
  sabot: (e) => {
    // Battle.roundImpact: a round on a rig wrecks it for the battle; on any other part, a STUN of round.seconds (its stat)
    return rules([{ text: "ITS ROUNDS WRECK RIGS FOR THE FIGHT." }], [], [REMINDER.STUN(rnd(e).seconds)]);
  },
  // Battle.roundImpact: a frost or chain round STUNs the part it hits (its stat)
  frostbite: (e) => {
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 2): ★2/★3 HOARFROST is a number, the parts its round's STUN hits: 1 + spread
    // (Battle.roundImpact: the round also STUNs the `spread` nearest other parts). Was no line, and the clause "★2
    // HOARFROST: {*STUN} HITS 2 PARTS."; the perk's name shows in the ⓘ LEVELS only (ruling R-1, faceBlocks.ts PERK_INFO_ONLY)
    const parts = 1 + (rnd(e).spread ?? 0), n = fmtCount(parts);
    return rules([{ text: `ITS {*STUN} HITS ${n} PART${s(parts)}.` }], [["parts", `${n} PART${s(parts)}`]], [REMINDER.STUN(rnd(e).seconds)]);
  },
  dragchain: (e) => rules([], [], [REMINDER.STUN(rnd(e).seconds)]),
  mendpress: (e) => {
    // SUS-B (REQ-BFG-069, REQ-BFG-070; SUSTAIN-1 4.9): ARMOR PRESS's face with HEAL, its stat row ARMOR PRESS's (factoryStats).
    // Battle.pressHeal: heal.amount every heal.every s through heal(), at the stamping pace, while it feeds a turret (the
    // belt rule stays off the face, as ARMOR PRESS's: cap's answer 5 to SUS-A)
    const h = f(e).heal!, every = fmtSec(h.every), amount = fmtDmg(h.amount);
    const label = `EVERY ${every}{SEC}:`;
    return rules([{ text: `${label} {*HEAL} ${amount}.`, label }], [["every", `EVERY ${every}{SEC}`], ["heal", `{*HEAL} ${amount}`]], [REMINDER.HEAL()]);
  },
  // Y2-Y6 (release Y; folded at the flip, Y7b2): its first face, from the switch's faces
  assembly: (e) => {
    // DESIGN-Y row 32 (its stats factoryStats': RATE, its slugs' DMG, BELT): Battle.makeSide: while it feeds a turret every
    // rig on your side comes online at x commission of its time, its own belts' rigs too (no instant start); HOT START is
    // gone. Was the RULES text "WHILE IT FEEDS A TURRET, YOUR RIGS COME ONLINE IN HALF THE TIME." and 3 more sentences
    const soon = fmtPct(1 - f(e).commission!);
    return rules([{ text: `YOUR RIGS START ${soon} SOONER.` }], [["soon", `${soon} SOONER`]]);
  },
  // the heroes' signature factories (never sold: no stars, no NEXT★)
  // U2e step 2 (REQ-BFG-070): a slug's HEAT or FRAY is its own, a stat ({HEAT}1.2, {FRAY}1: carryStats), never a
  // sentence (were "ITS SLUGS HAVE {*HEAT} 1.2." and "ITS SLUGS HAVE {*FRAY} 1."); the reminder stays for the tap
  kiln: (e) => rules([], [], [REMINDER.HEAT(AMMO[f(e).ammo].rideScale)]),
  loom: () => rules([], [], [REMINDER.FRAY()]),
  crucible: () => {
    // races/foundry.ts: crucibleProduce pours onto every belt at once; two blanks in sync fuse at FUSE_MULT
    const label = "{*PAIR}:";
    return rules([{ text: "POURS ONTO ALL ITS BELTS AT ONCE." }, { text: `${label} BLANKS FUSE, +${fmtPct(FUSE_MULT - 1)} {DMG}.`, label }],
      [], [REMINDER.PAIR()]);
  },
  wardworks: () => rules([{ text: `ITS SLUGS LOAD: +${fmtDmg(PLATE_PER_SLUG)} {*PLATE}.`, label: "LOAD:" }], [], [REMINDER.PLATE()]),
  // ------------------------------------------------------------------------------------- turret cores (numbers x k)
  scatter: (e, x) => {
    // U2e step 2 (REQ-BFG-070): its pellets' share acts on the turret's shot, an ability: it joins the rule (was its stat
    // pair "{DMG}40% EACH", coreStats)
    const n = fmtCount(c(e, x).pellets!), share = fmtPct(c(e, x).share!);
    return rules([shot(`BURSTS INTO ${n} PELLETS, ${share} {DMG} EACH.`)], [["pellets", `${n} PELLETS`], ["share", `${share} {DMG}`]]);
  },
  rotary: (e, x) => {
    // DESIGN-Y row 37: cores.ts ROUTINES.rotary: its chamber's load time is windowTime (0.75 / 0.525 / 0.3 s), so a part-full
    // chamber fires that much sooner than WINDOW_TIME's (50% / 65% / 80%); ★2/★3's fire rate and ★3's no-jam are gone. Was
    // "FIRES PART-FULL CHAMBERS SOONER." and the clauses "★2 GREASED RACE: FIRES 18% FASTER." and "★3 CLEAN FEED: FIRES 43%
    // FASTER, NEVER JAMS."
    const soon = fmtPct(1 - (c(e, x).windowTime ?? WINDOW_TIME) / WINDOW_TIME);
    return rules([{ text: `FIRES PART-FULL CHAMBERS ${soon} SOONER.` }], [["soon", `${soon} SOONER`]]);
  },
  pressure: (e, x) => {
    const per = fmtDmg(c(e, x).perQueued!);
    return rules([shot(`+${per} {DMG} FOR EACH LOAD WAITING.`)], [["per", `+${per} {DMG}`]]);
  },
  gatling: (e, x) => {
    // rateText's rule: the spin's floor x0.6 of the interval fires 1 / 0.6 = 67% faster (N1 2.3: X% FASTER is the rate)
    const up = fmtPct(c(e, x).top! / 100); // NUM-2 (REQ-BFG-047): the stored whole rate % (was 1 / floor - 1)
    // Y1 (REQ-BFG-070; STAR-D 1.6, REVIEW-STARD): its spin step, the share of its reload each quick shot takes off (cores.ts
    // gatlingCadence: spin - step for a shot within `gap` s of the last), 6 / 9 / 12%, a number that changes with its stars:
    // keyed, so the ⓘ LEVELS ladder shows it ("+6%/+9%/+12% A QUICK SHOT") and NEXT★ with it. The face line is unchanged.
    // ("EACH QUICK SHOT" would take ★2's NEXT★ line to 230 px, past NEXT_LINE_W)
    const step = fmtPct(c(e, x).step!);
    return rules([{ text: `SPINS UP TO ${up} FASTER AS IT FIRES.` }], [["spin", `${up} FASTER`], ["step", `+${step} A QUICK SHOT`]]);
  },
  hullbreaker: (e, x) => {
    const more = fmtPct(c(e, x).hullMul! - 1);
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 3): one verb with its own amount, its trigger SHOT: in brass (was "SHOTS
    // ALWAYS HIT THE HULL, +30% {DMG}.", two clauses); the rule is as before (content.ts hullbreaker hullMul)
    return rules([shot(`HITS THE HULL FOR +${more} {DMG}.`)], [["more", `+${more} {DMG}`]]);
  },
  salvo: (e, x) => {
    const flat = fmtDmg(c(e, x).volleyFlat!);
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 4): one verb with its own amount (was "EMPTIES THE CHAMBER AT ONCE, +20 {DMG}
    // EACH."); its wait and longer reload are its installed turret's RATE, the volley pace (inspector.ts turretPanel)
    return rules([shot(`FIRES THE CHAMBER AT +${flat} {DMG} EACH.`)], [["flat", `+${flat} {DMG}`]]);
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
    // U2f step 3 (REQ-BFG-046): one line of the op band at every star (was "ENEMY PART", 231-237 px at ★2/★3; MORTAR's
    // "ALSO HITS 1 MORE TARGET" names no ENEMY either)
    return rules([shot(`ALSO ARCS TO ${arcs} PART${s(n)}: {*STUN} ${stun}.`)],
      [["arcs", `${arcs} PART${s(n)}`], ["stun", `{*STUN} ${stun}`]], [REMINDER.STUN(t)]);
  },
  compound: (e, x) => {
    const more = fmtPct(c(e, x).mult! - 1);
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 5): one verb with its own amount (was "TWO LOADS FUSE INTO ONE SHELL, +15%
    // {DMG}.", two clauses); the counts through fmtCount (FACE_SIM)
    const from = fmtCount(FACE_SIM.compoundLoads), into = fmtCount(FACE_SIM.compoundShells);
    return rules([shot(`FUSES ${from} {SLUG} INTO ${into} AT +${more} {DMG}.`)], [["mult", `+${more} {DMG}`]]);
  },
  lance: (e, x) => {
    const n = c(e, x).columns!, cols = fmtCount(n), share = fmtPct(c(e, x).share!);
    // U2f step 3 (REQ-BFG-046): one line of the op band (was "EVERY ENEMY PART IN 1 COLUMN", 280-286 px)
    return rules([shot(`ALSO HITS ${cols} WHOLE COLUMN${s(n)}, ${share} {DMG}.`)],
      [["columns", `${cols} COLUMN${s(n)}`], ["share", `${share} {DMG}`]]);
  },
  anvil: (e, x) => {
    // Y7b1 (release Y; ruling Y7A-R3c): its STAR_DIFF row is deleted, so with the switch on it reads its base def, 0.9.2's
    // two parts: Battle.fireCore: + anvilFlat + pct(plate, 100 x perPlate) (x the class %: cores.ts scaleCore), both on one
    // line (180 px at ★3, k 1), each on its own ⓘ ladder. Was Y4's fold (DESIGN-Y row 38) "SHOT: +125% OF YOUR {*PLATE} AS
    // {DMG}." (125% / 275% / 438%, no flat)
    const flat = fmtDmg(c(e, x).anvilFlat!), per = fmtPct(c(e, x).perPlate!);
    return rules([shot(`+${flat} {DMG}, +${per} OF YOUR {*PLATE}.`)], [["flat", `+${flat} {DMG}`], ["per", `+${per} OF {PLATE}`]],
      [REMINDER.PLATE()]);
  },
  // Y2-Y6 (release Y; folded at the flip, Y7b2): its first face, from the switch's faces
  steambreech: (e, x) => {
    // DESIGN-Y row 39: cores.ts steamInterval: while your hull holds plating it fires steamPlated% faster, without it at its
    // own rate (steamBare is gone). Was the RULES text "THE TURRET FIRES 35% FASTER WHILE YOUR HULL HOLDS PLATING, AND 10%
    // FASTER WITHOUT IT."
    const up = fmtPct(c(e, x).steamPlated! / 100);
    return rules([{ text: `FIRES ${up} FASTER IF YOU HAVE {*PLATE}.` }], [["rate", `${up} FASTER`]], [REMINDER.PLATE()]);
  },
  drake: (e, x) => {
    // DESIGN-Y row 40: Battle.fireCore (cores.ts drakeConvert): each flatPerBurn of the shot's bonus damage (BONUS DAMAGE: its
    // glossary tap) becomes FACE_SIM.drakeStacks BURN; the free BURN, its longer BURN and its quicker flight are gone. Was the
    // RULES text "TURNS EACH SHOT'S BONUS DAMAGE INTO BURN: 1 BURN FOR EVERY 20 DAMAGE." and 3 more sentences
    const d = fmtDmg(c(e, x).flatPerBurn!), n = fmtCount(FACE_SIM.drakeStacks);
    return rules([shot(`EACH ${d} BONUS DAMAGE IS ${n} {*BURN}.`)], [["per", `EACH ${d}`]], [REMINDER.BURN()]);
  },
  capacitor: (e, x) => {
    // DESIGN-Y row 42: Battle.chambers / fireCore: + perSecond (x the class %: cores.ts scaleCore) for each second the chamber
    // sat empty before the shot, no cap (content.ts STAR_DIFF). Was the RULES text "CHARGES ITS NEXT SHOT 20 DAMAGE FOR EACH
    // SECOND ITS CHAMBER SITS EMPTY." with "IT CHARGES FOR UP TO 5 SECONDS."
    const d = fmtDmg(c(e, x).perSecond!);
    return rules([shot(`+${d} {DMG} FOR EACH SEC IT SAT EMPTY.`)], [["per", `+${d} {DMG}`]]);
  },
  // ------------------------------------------------------------------- U2b: the TEXT rigs (HIT: in brass; no stat row)
  // IRON WALL (SHIELD WALL until SUS-B; N1 3.3's crit piece) keeps today's text, as every RULES rig does. NUM-3: TOLLBOOTH
  // (a STUN-fold face) has its face (below SORTING ARM).
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
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 1): ★2/★3 SPARK JUMP is a number, the parts its STUN hits: 1 + jump
    // (Battle.sparkJump: the shock also stalls the `jump` nearest other parts). Was "{*STUN} 2." and the clause "★2 SPARK
    // JUMP: {*STUN} HITS 2 PARTS."; the perk's name shows in the ⓘ LEVELS only (ruling R-1, faceBlocks.ts PERK_INFO_ONLY)
    const parts = 1 + (gt(e).jump ?? 0), n = fmtCount(parts);
    return rules([hit(`{*STUN} ${stun} ON ${n} PART${s(parts)}.`)],
      [["stun", `{*STUN} ${stun}`], ["parts", `${n} PART${s(parts)}`]], [REMINDER.STUN(t)]);
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
    // DESIGN-Y row 28 (REVIEW-STARD answer 5: the damage pulse): Battle.surgeTick: once each pulse period every slug on its
    // belts gains pulse.flat; the speed pulse is gone. Was "EVERY 3{SEC}: ITS BELTS SURGE 3 TIMES AS FAST FOR 1{SEC}, +10
    // {DMG}." (two effects; it wrapped at ★2)
    const p = gt(e).pulse!, every = fmtSec(p.period), d = fmtDmg(p.flat);
    const label = `EVERY ${every}{SEC}:`;
    return rules([{ text: `${label} +${d} {DMG} TO SLUGS ON ${itsBelts(e)}.`, label }], [["every", `EVERY ${every}{SEC}`], ["flat", `+${d} {DMG}`]]);
  },
  sorting: (e) => {
    // Battle.applyHit: every `every`th payload it hits becomes `copies` payloads at full strength
    // (no ordinal: T2 bans "3RD"; ONE is definitional, as U2a's "TWO LOADS FUSE")
    const so = gt(e).sort!, every = fmtCount(so.every), n = fmtCount(so.copies);
    return rules([hit(`OF EVERY ${every} {SLUG}, ONE BECOMES ${n}.`)], [["every", `OF EVERY ${every}`], ["copies", `BECOMES ${n}`]]);
  },
  tollbooth: (e) => {
    // DESIGN-Y row 8: Battle.acceptHarassment: while it works, its first `toll` enemy STUNs on its belt's parts (its belt's
    // tiles, the rigs working them, the gun they feed and, from ★1, the belt's factory: PART, a glossary word) are
    // blocked; a wreck or a rip is no STUN (the shared rule). Was "BLOCKS THE FIRST 2 {*STUN} HITS ON ITS BELT." with two
    // caveats and ★3 FACTORY GUARD's clause
    const n = fmtCount(gt(e).toll!);
    return rules([{ text: `BLOCKS ${n} {*STUN} ON ${oneBelt(e) ? "ITS BELT'S" : "ITS BELTS'"} PARTS.` }], [["toll", `BLOCKS ${n}`]]);
  },
  riveter: (e) => {
    // SUS-B (REQ-BFG-069; SUSTAIN-1 4.9): its repair is HEAL, the same numbers (battle.ts heal(): never past your full hull,
    // half with BURN, none in the dark wind; the HEAL row says so); was "HIT: +6 {HULL}." keyed "repair"
    const d = fmtDmg(gt(e).heal!);
    return rules([hit(`{*HEAL} ${d}.`)], [["heal", `{*HEAL} ${d}`]], [REMINDER.HEAL()]);
  },
  heatjacket: (e) => {
    const h = gt(e).heat!, d = fmtDmg(h); // + heat damage a second ridden after it (as KILN's cinder: HEAT)
    return rules([hit(`{*HEAT} ${d}.`)], [["heat", `{*HEAT} ${d}`]], [REMINDER.HEAT(h)]);
  },
  staticbrush: (e) => {
    // Battle.impact: a static payload that hits bare hull stalls a random enemy turret for staticTime (STUN today)
    const t = gt(e).staticTime!, stun = fmtSec(t);
    // U2f step 3 (REQ-BFG-046): one line of the op band (was "ITS SLUGS ... ON A RANDOM ENEMY GUN.", 279 px): the slugs
    // as their icon (SORTING ARM's "OF EVERY 3 {SLUG}"), and STUN, which only ever stops an enemy part, names no ENEMY
    return rules([{ text: `ITS {SLUG} HIT HULL: {*STUN} ${stun} ON A RANDOM GUN.` }], [["stun", `{*STUN} ${stun}`]], [REMINDER.STUN(t)]);
  },
  barbed: (e) => {
    const n = fmtCount(gt(e).fray!); // ★2/★3 RAZOR WIRE raises the hull's FRAY cap (frayCap): a clause
    return rules([hit(`+${n} {*FRAY}.`)], [["fray", `+${n} {*FRAY}`]], [REMINDER.FRAY()]);
  },
  overclocker: (e) => {
    // DESIGN-Y row 29: Battle.makeSide / applyHit: it charges the first later rig on its belt, whatever it is (overclock.ts
    // chargeable), which doubles its hit, then rests overclockCooldown; a rig with nothing to double spends the charge. Was
    // "DOUBLES THE NEXT RIG'S HIT, RESTS 4{SEC}." with the caveat "IT SKIPS RIGS IT CAN'T DOUBLE."
    const t = fmtSec(gt(e).overclockCooldown!);
    const label = `EVERY ${t}{SEC}:`;
    return rules([{ text: `${label} DOUBLES THE NEXT RIG'S HIT.`, label }], [["every", `EVERY ${t}{SEC}`]]);
  },
  plateroller: (e) => {
    const d = fmtDmg(gt(e).plate!);
    return rules([hit(`+${d} {*PLATE}.`)], [["plate", `+${d} {*PLATE}`]], [REMINDER.PLATE()]);
  },
  stoker: (e) => {
    // Y7b1 (release Y; ruling Y7A-R1; DESIGN-Y row 31): Battle.stokedPace: the factories its arrows point at work up to
    // stoke faster, never past the gun their belts feed (its cap holds with the switch on, as at 0.9.2). UP TO says the cap
    // on the face's one line (the interim caveat "A FACTORY NEVER OUTRUNS ITS GUN." stays off: STAR_GONE_CAVEATS; its ⓘ
    // sentence names the gun). Was today's line "ITS FACTORIES WORK 20% FASTER." with no cap
    const up = fmtPct(gt(e).stoke!);
    return rules([{ text: `ITS FACTORIES WORK UP TO ${up} FASTER.` }], [["stoke", `${up} FASTER`]]);
  },
  platebreaker: (e) => {
    // DESIGN-Y row 26: Battle.applyHit: with FACE_SIM.breakerPlate plating on your hull it spends that much for + flat;
    // with less, nothing (the ELSE floor is gone: content.ts STAR_DIFF). Was the same line and "ELSE: +10 {DMG}."
    const spend = fmtDmg(FACE_SIM.breakerPlate), flat = fmtDmg(gt(e).breaker!.flat);
    return rules([hit(`SPENDS ${spend} {*PLATE} FOR +${flat} {DMG}.`)], [["flat", `+${flat} {DMG}`]], [REMINDER.PLATE()]);
  },
  // Y2-Y6 (release Y; folded at the flip, Y7b2): its first face, from the switch's faces
  lodestone: (e) => {
    // DESIGN-Y row 15: Battle.applyHit: + each for each enemy part a STUN holds when it hits (rigs, factories, turrets, belt
    // tiles; a wrecked rig is no STUN), no floor, no cap. Was the RULES text "ADDS 10 DAMAGE, AND 10 FOR EACH ENEMY MACHINE
    // STUNNED, UP TO 60 DAMAGE." with "WRECKED MACHINES COUNT TOO; BELT TILES DON'T."
    const d = fmtDmg(gt(e).perStalled!.each);
    return rules([hit(`+${d} {DMG} FOR EACH {*STUN} ON THE FOE.`)], [["each", `{DMG} +${d} EACH`]]);
  },
  braceframe: (e) => {
    // DESIGN-Y row 16: Battle.braceCut: an enemy STUN on a belt tile its arrows hit lasts x brace.mul (the plated multiplier
    // and its brace of itself are gone). Was the RULES text "ENEMY STUNS ON THE BELT TILES IT HITS, AND ON ITSELF, LAST 50%
    // SHORTER." with "WHILE YOUR HULL HOLDS PLATING THEY LAST 75% SHORTER."
    const cut = fmtPct(1 - gt(e).brace!.mul);
    return rules([{ text: `ENEMY {*STUN} ON ITS TILES: ${cut} SHORTER.` }], [["cut", `${cut} SHORTER`]]);
  },
  pincer: (e) => {
    // DESIGN-Y row 20: Battle.applyHit: + each for each other working rig on its tile (crossfire: a STUNned rig stops, so it
    // doesn't count), no floor, no cap (content.ts STAR_DIFF). Was the RULES text "ADDS 10 DAMAGE TO EACH PAYLOAD IT HITS,
    // AND 20 MORE FOR EACH OTHER RIG HITTING THAT TILE." with "STUNNED AND WRECKED RIGS DON'T COUNT."
    const d = fmtDmg(gt(e).pincer!.each);
    return rules([hit(`+${d} {DMG} FOR EACH OTHER RIG ON ITS TILE.`)], [["each", `+${d} {DMG} EACH`]]);
  },
  twingauge: (e) => {
    // DESIGN-Y row 21: Battle.applyHit: + matched on a matched belt (MATCHED: its glossary tap), nothing off one. Was the
    // RULES text "ADDS 10 DAMAGE TO EACH PAYLOAD IT HITS, OR 30 DAMAGE ON A MATCHED BELT." with MATCHED's definition
    const d = fmtDmg(gt(e).gauge!.matched);
    return rules([hit(`+${d} {DMG} ON A MATCHED BELT.`)], [["matched", `+${d} {DMG}`]]);
  },
  bellows: (e) => {
    // DESIGN-Y row 22: Battle.applyHit: + burn BURN for each whole `per` s the slug has ridden, no cap. Was the RULES text
    // "ADDS 4 BURN FOR EACH 10 SECONDS THE PAYLOAD HAS RIDDEN, UP TO 4 BURN." with BURN's definition
    const br = gt(e).burnPerRide!, n = fmtCount(br.burn);
    return rules([hit(`+${n} {*BURN} FOR EACH ${fmtSec(br.per)}{SEC} RIDDEN.`)], [["burn", `+${n} {*BURN}`]], [REMINDER.BURN()]);
  },
  quench: (e) => {
    // DESIGN-Y row 23: Battle.applyHit: every BURN stack on the slug turns into perBurn damage (no floor, no stack cap). Was
    // the RULES text "ADDS 10 DAMAGE TO EACH PAYLOAD IT HITS, THEN TURNS UP TO 4 OF ITS BURN INTO 30 MORE DAMAGE EACH." with
    // "ANY MORE BURN STAYS ON THE PAYLOAD." and BURN's definition
    const d = fmtDmg(gt(e).quench!.perBurn);
    return rules([hit(`TURNS EACH {*BURN} INTO +${d} {DMG}.`)], [["per", `+${d} {DMG}`]], [REMINDER.BURN()]);
  },
  twinlatch: (e) => {
    // DESIGN-Y row 30: Battle.latchTick: while both its arrows hit belts it holds a slug at most `hold` s for its other belt,
    // so the two reach the gun together (a PAIR); no flat any more. The header's "n/2 ARROWS ON BELTS" shows the both-arrows
    // rule; belts into two guns have no pair to make. Was the RULES text "HOLDS EACH PAYLOAD UNTIL ITS OTHER BELT BRINGS ONE,
    // THEN LETS THEM GO SO THEY REACH THE GUN TOGETHER." and 3 more sentences (its 1 s, both arrows, +10, two guns)
    const t = fmtSec(gt(e).latch!.hold);
    return rules([hit(`HOLDS A {SLUG} UP TO ${t}{SEC} TO MAKE A {*PAIR}.`)], [["hold", `UP TO ${t}{SEC}`]], [REMINDER.PAIR()]);
  },
  counterweight: (e) => {
    // DESIGN-Y row 41: Battle.applyHit: + each for each tile the slug has ridden on its journey, no cap (content.ts
    // STAR_DIFF). Was the RULES text "ADDS 5 DAMAGE FOR EACH BELT TILE THE PAYLOAD HAS RIDDEN, UP TO 60 DAMAGE."
    const d = fmtDmg(gt(e).perTile!.each);
    return rules([hit(`+${d} {DMG} FOR EACH TILE RIDDEN.`)], [["each", `+${d} {DMG} EACH`]]);
  },
  shieldwall: (e) => {
    // Y7b1 (release Y; ruling Y7A-R3d): its STAR_DIFF row is deleted, so with the switch on it reads its base def, 0.9.2's
    // rule: Battle.applyHit: addPlate(plate) for each slug it hits, then + plated.flat while your hull holds plated.min PLATE
    // or more (120+, as FURNACE's "8+ TILE BELTS"), both parts on one line (208 px at ★3), each on its own ⓘ ladder. Was
    // Y5's "HIT: +30 {DMG} AT 120 {*PLATE} OR MORE." (DESIGN-Y row 45: its own plating gone). Off it has no face (the RULES
    // text: "ROLLS 10 PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS." with the 120 sentence and PLATING's definition)
    const pl = gt(e).plated!, d = fmtDmg(pl.flat), plate = fmtDmg(gt(e).plate!);
    return rules([hit(`+${plate} {*PLATE}, +${d} {DMG} AT ${fmtDmg(pl.min)}+ {*PLATE}.`)], [["plate", `+${plate} {*PLATE}`], ["flat", `+${d} {DMG}`]],
      [REMINDER.PLATE()]);
  },
  keg: (e) => {
    // DESIGN-Y row 46: Battle.kegTick: its fuse runs from the battle's start (a STUN or a wreck pauses it); each keg.fuse s it
    // blasts + flat onto every slug on its belts (beltPulse, SURGE VALVE's walk) and re-arms; its BURN and ★3 WIDE BLAST's
    // reach are gone (content.ts STAR_DIFF). Was the RULES text "ADDS 60 DAMAGE AND 1 BURN TO EVERY PAYLOAD ON ITS BELTS WHEN
    // IT BLOWS UP." with "IT BLOWS ONCE, 12 SECONDS AFTER IT COMES ONLINE; A STUN PAUSES THE FUSE." and BURN's definition
    const k = gt(e).keg!, every = fmtSec(k.fuse), d = fmtDmg(k.flat);
    const label = `EVERY ${every}{SEC}:`;
    return rules([{ text: `${label} +${d} {DMG} TO SLUGS ON ${itsBelts(e)}.`, label }], [["every", `EVERY ${every}{SEC}`], ["flat", `+${d} {DMG}`]]);
  },
  venom: (e) => {
    // DESIGN-Y row 48: Battle.applyHit gives each slug it hits burnPlus seconds; Battle.impact: each BURN stack of that slug's
    // hit lasts BURN_TIME + burnPlus (then SLOW EMBERS' %). It adds no BURN of its own. Was the RULES text "ADDS 2 POISON TO
    // EACH PAYLOAD IT HITS." with POISON's two sentences (its pool, its clock)
    const t = fmtSec(gt(e).burnPlus!);
    return rules([hit(`ITS {*BURN} LASTS +${t}{SEC}.`)], [["plus", `+${t}{SEC}`]], [REMINDER.BURN()]);
  },

  // ------------------------------------------------- U2b: the TEXT turret gear (it describes the turret it sits on)
  // LONGCASE and FINISHER RAM (N1 3.3's crit pieces) keep today's text, as every RULES gear does. NUM-3: FLAK SCREEN and
  // MANTLET (STUN-fold faces) have theirs (below SPALL CATCHER).
  chamber: (e) => {
    // Y7b1 (release Y; ruling Y7A-R2: the rule as built, the face true; text only): Battle.chambers: a shot fires perShot
    // loads (2/3/4), at most what its gun's chamber holds. The smallest chamber holds 2 (abilityText.ts fewestLoads), so ★1's
    // FIRES 2 is exact on every gun and ★2/★3 read UP TO 3 / UP TO 4 (upToLoads). Its ⓘ: the tap note on UP TO
    // (glossary.ts STAR_TAP_NOTES chamber) says a shot never fires more than its gun's chamber holds. The ladder keeps one
    // template (FIRES UP TO 2/3/4 {SLUG}: a shot's most at each star). Was today's line "EACH SHOT FIRES 3 {SLUG}." at ★2 (4 at
    // ★3), false on a 2-load gun (and ★3's on a 3-load gun: REVIEW-Y7A section 6)
    const n = md(e).perShot!, c = fmtCount(n);
    return rules([{ text: `EACH SHOT FIRES ${upToLoads(n)}${c} {SLUG}.` }], [["shot", `FIRES UP TO ${c} {SLUG}`]]);
  },
  calibrate: (e) => {
    const up = fmtPct(md(e).fireRate! / 100); // rateText's rule: an interval x0.75 fires 33% faster (N1 2.3); NUM-2: stored
    return rules([{ text: `FIRES ${up} FASTER.` }], [["rate", `${up} FASTER`]]);
  },
  spotter: (e) => {
    // Battle.pickTarget: a pick of bare hull is rerolled up to `rerolls` times; ★2/★3 weigh factories (a clause)
    const r = md(e).rerolls ?? 1, n = fmtCount(r);
    return rules([{ text: `SHOTS AT BARE HULL GET ${n} MORE AIM${s(r)}.` }], [["rerolls", `${n} MORE AIM${s(r)}`]]);
  },
  escapement: (e) => {
    const up = fmtPct(md(e).fireRate! / 100); // METRONOME's pendulum line: not playable (R1 dropped it); NUM-2: stored
    return rules([{ text: `FIRES ${up} FASTER.` }], [["rate", `${up} FASTER`]]);
  },
  spallcatcher: (e) => {
    // DESIGN-Y row 47: Battle.spallCharge: + add for every `every` damage your ship takes (a PLATE soak counted once, not
    // twice), on this turret's next shot, no cap. Today's line; its cap's number (NEXT★'s MAX) and its caveat go
    const sp = md(e).spall!, every = fmtDmg(sp.every), add = fmtDmg(sp.add);
    return rules([{ text: `EVERY ${every} {DMG} YOU TAKE: NEXT SHOT +${add} {DMG}.` }], [["add", `+${add} {DMG}`]]);
  },
  flak: (e) => {
    // NUM-3 (R1's STUN fold): Battle.flight: one roll at mid-flight for each enemy harassing shot (isHarassingProjectile),
    // at the side's best screen; the shots that carry no STUN and the best screen are interim caveats. (No chip: its share
    // is no STUN's.)
    const p = fmtPct(md(e).intercept!);
    return rules([{ text: `SHOOTS DOWN ${p} OF ENEMY {*STUN} SHOTS.` }], [["intercept", `SHOOTS DOWN ${p}`]]);
  },
  mantlet: (e) => {
    // DESIGN-Y row 14 (REVIEW-STARD rule 1: one zone, the gun end of its belts): Battle.acceptHarassment: its turret ignores
    // every STUN source (content.ts STUN_CAUSES), and so do the last intakeGuard tiles of each belt into it (1/2/3 from ★1;
    // their rigs no longer share it). Was "IMMUNE TO {*STUN}." and ★2 FULL GUARD's and ★3 BULWARK SKIRT's clauses
    const n = md(e).intakeGuard ?? 0, tiles = `${fmtCount(n)} TILE${s(n)}`;
    return rules([{ text: `{*STUN} CAN'T STOP ITS GUN OR LAST ${tiles}.` }], [["guard", `LAST ${tiles}`]]);
  },
  // Y2-Y6 (release Y; folded at the flip, Y7b2): its first face, from the switch's faces
  hopper: (e) => {
    // DESIGN-Y row 33: makeTurret: its turret's chamber holds `window` more loads (+1/+2/+3); the +0.5 s load time, the
    // store and ★3's no-jam are gone (content.ts STAR_DIFF). Was the RULES text "THE CHAMBER HOLDS 1 MORE LOAD, AND THE LOAD
    // TIME IS LONGER." with the chamber's rule, the GATLING/COMPOUND line, ★2/★3's store and ★3's "THE TURRET NEVER JAMS."
    const n = fmtCount(md(e).window!);
    return rules([{ text: `ITS CHAMBER HOLDS +${n} {SLUG}.` }], [["window", `+${n} {SLUG}`]]);
  },
  twintrigger: (e) => {
    // DESIGN-Y row 34: Battle.fire / fireCore: a paired load (E2; a COMPOUND shell packing one) deals x (1 + pairBonus); its
    // shorter load time is gone. Was the RULES text "PAIRED LOADS IN THIS TURRET DEAL 25% MORE DAMAGE." with PAIR's
    // definition, "ITS LOAD TIME IS SHORTER, DOWN TO A FLOOR." and the GATLING/COMPOUND line
    const more = fmtPct(md(e).pairBonus!), label = "{*PAIR}:";
    return rules([{ text: `${label} +${more} {DMG}.`, label }], [["bonus", `+${more} {DMG}`]], [REMINDER.PAIR()]);
  },
  seamwelder: (e) => {
    // DESIGN-Y row 35: Battle.loaded / fusionPair: each pair this turret takes rolls seam.pair plating onto your hull; a lone
    // load's is gone (lone 0). Was the RULES text "EACH PAIR THIS TURRET TAKES ROLLS 10 PLATING ONTO YOUR HULL, AND ANY OTHER
    // LOAD ROLLS 2." with PAIR's and PLATING's definitions
    const d = fmtDmg(md(e).seam!.pair), label = "{*PAIR}:";
    return rules([{ text: `${label} +${d} {*PLATE}.`, label }], [["plate", `+${d} {*PLATE}`]], [REMINDER.PAIR(), REMINDER.PLATE()]);
  },
  longcase: (e) => {
    // DESIGN-Y row 43: Battle.fire / fireCore: a shot from a slug that rode longRideMin s or more deals + longRideFlat (no
    // sim change). The METRONOME sentence leaves the face: a pendulum slug is an unplayable hero's, and races/data.ts
    // PEAK_SHIFT stays for METRONOME's bots. Was the RULES text "SHOTS FROM PAYLOADS THAT RODE 2 SECONDS OR MORE DEAL 15 MORE
    // DAMAGE." with "PENDULUM SLUGS DON'T GET IT; ON METRONOME THEY PEAK LATER ON THIS TURRET, AFTER 13 TILES."
    const d = fmtDmg(md(e).longRideFlat!), t = fmtSec(md(e).longRideMin!);
    return rules([shot(`+${d} {DMG} IF ITS {SLUG} RODE ${t}{SEC}.`)], [["flat", `+${d} {DMG}`]]);
  },
  ram: (e) => {
    // DESIGN-Y row 44: Battle.chambers / fire: the load that empties the chamber deals x (1 + finisher) (no sim change). Its
    // GATLING sentence leaves the face; the cue takes its place (REVIEW-STARD rule 7): on a GATLING SPOOL's turret its gear
    // row says IDLE (turretPanel.ts socketLines, abilityText.ts gearIdle). Was the RULES text "THE LOAD THAT EMPTIES THE
    // CHAMBER DEALS 40% MORE DAMAGE." with "IT DOES NOTHING ON A GATLING SPOOL, WHICH NEVER WAITS FOR A FULL CHAMBER."
    const more = fmtPct(md(e).finisher!);
    return rules([shot(`THE CHAMBER'S LAST {SLUG} +${more} {DMG}.`)], [["more", `+${more} {DMG}`]]);
  },
  // SUS-B (REQ-BFG-069, REQ-BFG-070; SUSTAIN-1 4.9): the sustain gear. Each gives your hull its effect: an ability line
  wardbell: (e) => {
    // TurretState.bell: + amount SHIELD every `every` s (★1 8 s, SUS-A's measured fallback; ★2 5 s, ★3 4 s), the first at
    // t = every, never past SHIELD_CAP; its turret's STUN or freeze pauses it. Its count is keyed too, for the shop chip
    const sh = md(e).shield!, every = fmtSec(sh.every), n = fmtCount(sh.amount);
    const label = `EVERY ${every}{SEC}:`;
    return rules([{ text: `${label} +${n} {*SHIELD}.`, label }], [["every", `EVERY ${every}{SEC}`], ["shield", `+${n} {*SHIELD}`]], [REMINDER.SHIELD()]);
  },
  mendingloom: (e) => {
    // TurretState.regen: your hull heals this much at each whole second (Battle.sustainTick). "YOUR HULL:" says whose it
    // is, not when: no trigger, so no brass label (TEXT-STYLE 3.2, 3.3)
    const r = fmtDmg(md(e).regen!);
    return rules([{ text: `YOUR HULL: {*REGEN} ${r}.` }], [["regen", `{*REGEN} ${r}`]], [REMINDER.REGEN()]);
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
];


/** The turrets: a stat row only (R1 C3: a turret carries no rules text). */
const TURRET_FACE = (): Rules => rules([]);

// ------------------------------------------------------------- Y2 (release Y): the STUN pieces with the switch on

/**
 * Y2 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 8-19; ruling R-2): with the star switch on
 * (content.ts starRules) harassment is a STUN, and each of these 12 pieces shows one ability line with its star changes as
 * ladder numbers: no caveat, no star clause (STAR_GONE_CLAUSES, STAR_GONE_CAVEATS), its perk's name in the ⓘ view only
 * (ruling R-1: faceBlocks.ts perkInfoOnly). Off, every face is as before.
 */
export const Y2_PIECES: readonly string[] = [
  "tollbooth", "scrapper", "flak", "sabot", "hotswap", "limpet", "mantlet", "lodestone", "braceframe", "spotter", "overdrive", "grapnel",
];

/**
 * Y3 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 20-32; ruling R-2): THE 13 RIGS, one number each. With
 * the star switch on each shows one ability line, its floors, caps, caveats and star clauses gone (STAR_GONE_CLAUSES,
 * STAR_GONE_CAVEATS), every ★2/★3 change a number on its ⓘ ladder, its perk's name in the ⓘ view only (ruling R-1:
 * faceBlocks.ts perkInfoOnly). The six RULES pieces (PINCER, TWIN GAUGE, BELLOWS, QUENCH TANK, TWIN LATCH, ASSEMBLY LINE)
 * get their first face here; off, each keeps today's text, and every face is as before.
 */
export const Y3_PIECES: readonly string[] = [
  "pincer", "twingauge", "bellows", "quench", "longhaul", "barbed", "platebreaker", "brake", "surge", "overclocker", "twinlatch", "stoker", "assembly",
];

/**
 * Y4 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 33-40; ruling R-2): THE 4 GEAR AND 4 CORES, one number
 * each. With the star switch on each shows one ability line, its RULES sentences, floors, caveats and star clauses gone
 * (STAR_GONE_CLAUSES: ROTARY's fire rate, EXT. CHAMBER's slot), every ★2/★3 change a number on its ⓘ ladder, its perk's
 * name in the ⓘ view only (ruling R-1: faceBlocks.ts perkInfoOnly). The five RULES pieces (HOPPER, TWIN TRIGGER, SEAM
 * WELDER, STEAM BREECH, DRAKE NOZZLE) get their first face here; off, each keeps today's text, and every face is as before.
 */
export const Y4_PIECES: readonly string[] = [
  "hopper", "twintrigger", "seamwelder", "chamber", "rotary", "anvil", "steambreech", "drake",
];

/**
 * Y5 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 41-47; ruling R-2; REVIEW-STARD answer 2): THE
 * CRIT-FREE ONE-LINERS, one number each (no crit or ramp: a later CRIT/RAMP job replaces these faces wholesale). With the
 * star switch on each shows one ability line, its RULES sentences, caps, caveats and star clauses gone (STAR_GONE_CAVEATS:
 * SPALL CATCHER's), every ★2/★3 change a number on its ⓘ ladder, its perk's name in the ⓘ view only (ruling R-1:
 * faceBlocks.ts perkInfoOnly). The RULES pieces among them get their first face here; off, each keeps today's text, and
 * every face is as before.
 */
export const Y5_PIECES: readonly string[] = [
  "counterweight", "capacitor", "longcase", "ram", "shieldwall", "keg", "spallcatcher",
];

/**
 * Y6 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3 row 48 and section 4.1, R1's R2; ruling R-2): VENOM DRIP, a
 * BURN-length engine. With the star switch on it gets its first face, one ability line (its RULES sentences and POISON gone:
 * glossary.ts STAR_RETIRED), its ★2/★3 change a number on its ⓘ ladder; it has no perk names (ruling R-1: faceBlocks.ts
 * perkInfoOnly reads this list as it reads Y2_PIECES .. Y5_PIECES). Off, it keeps today's text.
 */
export const Y6_PIECES: readonly string[] = ["venom"];



/** The pieces with a new face, in redesign.json's groups' order (tests and tools). */
export const FACE_IDS: readonly string[] = [
  ...Object.keys(FACES),
  ...Object.values(ITEMS).filter((d) => d.kind === "turret").map((d) => d.id),
];

/** True for a piece that draws its new face (every other piece keeps today's text). */
export function hasFace(def: string): boolean {
  return FACE_IDS.includes(def);
}

/** A piece's face at `stars` as data (o: the turret class factor k for a core, the run's hero for MIMIC FORGE). Y7b2 (the
 *  flip): the interim perk clauses (U2b F6) are gone, every one with the star switch's rules (R4, the STAR batch), so a face
 *  has no clause; the interim caveats keep their one table (INNER COLUMN ONLY is the one row left). */
export function faceAt(def: string, stars = 1, o: TextOpts = {}): Face | null {
  if (!hasFace(def)) return null;
  const e = effectAt(def, stars), x: X = { stars, k: o.k ?? 1, hero: o.hero };
  const body = e.kind === "turret" ? TURRET_FACE() : FACES[def](e, x);
  const stats = e.kind === "turret" ? turretStats(def, stars) : e.kind === "factory" ? factoryStats(def, stars, o.hero)
    : e.kind === "core" ? coreStats(def, stars, x.k) : e.kind === "gate" ? rigStats(def, stars) : e.kind === "mod" ? gearStats(def, stars)
    : supplyStats(def); // U2b: the rig, gear and supply kinds' data functions
  // U2b F5: the interim caveats (one table)
  const caveats = INTERIM_CAVEATS.filter((cv) => cv.applies(e)).map((cv) => cv.text(e));
  // U2e step 2: a factory's own payloads' stats, its second stat row
  const stats2 = e.kind === "factory" ? carryStats(def, stars, o.hero) : null;
  return {
    stats, ...(stats2 ? { stats2 } : {}), ...body,
    ...(caveats.length ? { caveats } : {}),
  };
}

/** A face's lines in glyphs: the stat row (null when it has none), the rule lines (each with its label) and the
 *  reminders; U2b: the interim perk clause (F6) and caveats (F5), where it has them. */
export interface FaceLines {
  stats: string | null;
  /** U2e step 2: the second stat row (Face.stats2), where the face has one. */
  stats2?: string;
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
    ...(fc.stats2?.length ? { stats2: statRow(fc.stats2) } : {}),
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
  // U2e step 2: both stat rows (a second row's pairs are the face's own stats too), each row's changed pairs as a row
  const changed = (bs: readonly Stat[], as: readonly Stat[]): Stat[] => bs.filter(([ic, v]) => as.find(([ic2]) => ic2 === ic)?.[1] !== v);
  const rows = [changed(b.stats, a.stats), changed(b.stats2 ?? [], a.stats2 ?? [])].filter((r) => r.length).map((r) => statRow(r));
  const nums = b.nums.filter(([k, v]) => a.nums.find(([k2]) => k2 === k)?.[1] !== v).map(([, v]) => icons(v, "alone"));
  return [...rows, ...nums].join(", ");
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
 *  cap's review call 5: WEAVER's is LOOM SLUGS HAVE FRAY 1). Y1: FURNACE's too, as two one-line abilities (it kept
 *  heroTrick's two-clause sentence until Y1). */
const HERO_FACES: Partial<Record<HeroId, () => Rules>> = {
  // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D 4.2, REVIEW-STARD R5: the long-belt bonus stays in release Y): a hero takes up to
  // 2 rule lines (CRUCIBLE's face has 2). Its KILN's cinder slugs' HEAT (AMMO rideScale), as WEAVER's line, and E1's long
  // belt (battle.ts makeTurret: a FURNACE gun fed by a belt journey of SIM.furnaceLongTiles or more tiles fires
  // FURNACE_LONG_BELT% faster). Was heroTrick's "ITS KILN'S CINDER SLUGS GAIN 12 DAMAGE FOR EACH SECOND THEY RIDE, AND A GUN
  // FED BY A BELT OF 8 TILES OR MORE FIRES 39% FASTER." (692 px, two clauses)
  furnace: () => {
    const h = HEROES.furnace, heat = AMMO[h.ammo].rideScale;
    return rules([
      { text: `${ITEMS[h.factory].name} SLUGS HAVE {*HEAT} ${fmtDmg(heat ?? 0)}.` },
      { text: `GUNS ON ${fmtCount(SIM.furnaceLongTiles)}+ TILE BELTS FIRE ${fmtPct(FURNACE_LONG_BELT / 100)} FASTER.` },
    ], [], [REMINDER.HEAT(heat)]);
  },
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
