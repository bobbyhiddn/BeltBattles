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
import { gameWords } from "./gameWords"; // CARD-3 (REQ-BFG-107): a sim string in the player's words
import { colourize, PERK_COLOUR, type Span } from "./richText";
import { statRow, type Stat } from "./icons";
import { fmtCount, fmtDmg, fmtPct, fmtSec, fmtSpeed } from "./statFormat";
import { livePerk, type TextOpts } from "./abilityText";
import { hullShown } from "../sim/hullScale"; // HULL-1a (REQ-BFG-079): the ARMOR PACK's face on the day's hull
import { dmgNow, shownOn, sustNow } from "./dayShown"; // HULL-1d (REQ-BFG-079): damage x D(d), sustain x S(d), on the face's day
import { upToLoads } from "./abilityText"; // Y7b1 (release Y; ruling Y7A-R2): EXT. CHAMBER's UP TO n with the star switch on
import { SIM } from "./abilityText"; // NUM-3: SCRAPPER's queue cap and SABOT's SHRAPNEL STUN (each checked against battle.ts)
import { startIn } from "./abilityText"; // TXT-096: ASSEMBLY LINE's "50% SOONER" / "AT ONCE", its sentence's words
import { cardText } from "./abilityText"; // PLAIN-1F (M3, F5): the desk card's effect line (cardEffect)
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
import { rigArrowCells } from "../sim/deck"; // SHAPES-1 (REQ-BFG-086 R2): a long rig's most hits
import { shapesRules } from "../sim/shapes"; // SHAPES-1: the shaped pieces' faces, lines and notes (SHAPES on only)
import { isShapes2Piece, shapes2Rules } from "../sim/deck"; // SHAPES-2 (REQ-BFG-114; deck.ts re-exports shapes2.ts: faceText.test.ts reads import paths as string literals, and a digit is not allowed in them): the six more shaped plain rigs: the same stat-row face path as PLAIN-1's six
import { scaleRules } from "../sim/scale"; // SCALE-2b (REQ-BFG-108): VENOM DRIP's plain POISON face (SCALE_RIGS on only)
import { isConverterItem } from "../sim/split"; // BUMP-1F (RULING-BUMP1F-R11 R11.3): the three gates' desk-card effect line is their star-1 stat row (cardEffect)
import { POISON_DPS } from "../sim/content"; // SCALE-2b: POISON's hull damage a second (its reminder)
import type { ReadCount } from "../sim/content"; // SCALE-2c (REQ-BFG-098): the reader faces' words, by count
import { isGatesPiece } from "../sim/deck"; // GATES-1 (REQ-BFG-052; deck.ts re-exports gates.ts): the three gates' faces, while they are in ITEMS (GATES on)
import { shareWord } from "./abilityText"; // GATES-1: a pellet's share in words, HALF or the whole %
import { SLOT_EVERY_CELLS, SLOT_FROM_CELLS, footBox, footCount, footSlots, isShaped } from "../sim/foot"; // SHAPES-1: the type line's shape, the size rule
import { WINDOW_TIME } from "../sim/content"; // Y4 (release Y; DESIGN-Y row 37): ROTARY BREECH's load time, % sooner
import { isPlainRig as isPlainSix } from "../sim/plainRigs"; // PLAIN-1 (REQ-BFG-084): the six plain stat rigs (PLAIN-1F M1: renamed here; faces.ts's own isPlainRig is the face test, and it holds them while they are in ITEMS)
import { shotFloor } from "../sim/deck"; // ENCHANT-1 (REQ-BFG-085): the least a slug deals, for a MASSIVE or SWIFT factory's DMG
import { enchantRate, enchantRules, isEnchantId } from "../sim/enchant"; // ENCHANT-1 (REQ-BFG-085): the word's rate, the switch
import { grownDmg, partNotes, slugDmg, type WordOn } from "./enchantFaces"; // ENCHANT-1 (REQ-BFG-085): the NOTES, the word's numbers; ENCHANT-2 (T4b): partNotes, line 1 by word

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
  /** WORDS-1 (REQ-BFG-081; TEXT-STYLE 1.4 as ruled 2026-10-10): plain lines under the stat row that say what its numbers
   *  mean (a turret's loads and gear slots: READ-1 6.1, measured in its round D). Not abilities: no label, no number key. */
  plain?: string[];
}

interface X {
  stars: number;
  k: number;
  hero?: HeroId;
  day?: number; // HULL-1a (REQ-BFG-079): TextOpts.day (only the ARMOR PACK's face reads it)
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
export function factoryStats(def: string, stars = 1, hero?: HeroId, w?: WordOn): Stat[] {
  const fs = effectAt(def, stars).factory!;
  let speed = fs.speed, base = fs.base ?? AMMO[fs.ammo].base, flat = fs.scrapFlat ?? 0, ammo = fs.ammo; // NUM-4 (REQ-BFG-047): its SPEED (RATE)
  if (def === "mimic") {
    // Battle.factoryDef: the hero's ammo at its own factory's interval x intervalMul; no hero, no cadence to show
    const h = hero ? HEROES[hero] : undefined, sig = h ? ITEMS[h.factory]?.factory : undefined;
    if (!h || !sig) return [["BELT", fmtCount(outputsAt(def, stars))]];
    speed = factorySpeed(def, fs, hero!); // NUM-2: the hero factory's speed x its rate %, rounded once
    base = AMMO[h.ammo].base;
    flat = 0;
    ammo = h.ammo;
  }
  // ENCHANT-1 (REQ-BFG-085; E7): `w`, the word the piece holds: MASSIVE and SWIFT work it at the other rate and share its slug's DMG (the
  // battle's: enchant.ts enchantRate, enchantFx.ts scaleShare, which slugDmg reads), GROWING adds its grown DMG, WIDE one belt slot.
  // Without a word every number below is the plain piece's, as before
  let dmg = w ? slugDmg(w, base, flat, shotFloor(ammo)) : base + flat;
  if (w) speed = enchantRate(w.id, speed);
  // Y2 (release Y; DESIGN-Y row 13): a LIMPET WORKS' DMG is its charge's blast (its base is 0: the 20 on impact joined the
  // blast)
  if (fs.round?.kind === "limpet") dmg += fs.round.blast;
  const wide = w?.id === "wide" ? 1 : 0; // ENCHANT-1: WIDE's belt slot (enchant.ts wideSlots)
  return [speedPair(speed), ["DMG", fmtDmg(dmgNow(dmg))], ...(showsBelts(def) || wide ? [["BELT", fmtCount(outputsAt(def, stars) + wide)] as Stat] : [])];
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
  if (ammo?.rideScale) out.push(["HEAT", fmtDmg(dmgNow(ammo.rideScale))]);
  if (ammo?.fray) out.push(["FRAY", fmtCount(ammo.fray)]);
  return out.length ? out : null;
}

/** A turret's stat pairs at `stars`: how often it fires, the loads its chamber holds, its gear slots (deck.ts). */
export function turretStats(def: string, stars = 1, w?: WordOn): Stat[] {
  const t = effectAt(def, stars).turret!;
  // ENCHANT-1 (REQ-BFG-085; E7): `w`, the word the turret holds: MASSIVE and SWIFT fire it at the other rate (enchant.ts enchantRate, as
  // deck.ts resolveSlots patches the battle's), WIDE gives one more gear slot (resolveSlots' gearSlots)
  const rate = w ? enchantRate(w.id, t.speed) : t.speed, wide = w?.id === "wide" ? 1 : 0;
  return [speedPair(rate), ["SLUG", fmtCount(t.window)], ["GEAR", fmtCount(gearSlotsOf(def, stars) + wide)]]; // NUM-4: its SPEED (RATE)
}

/** U2b: a rig's stat pairs (R1 C4: "Rigs and gear: none"): a rig's numbers are its rule's. This is the rig kind's one
 *  place for them, as factoryStats and turretStats are their kinds' (a later chip or cadence pair goes here). */
export function rigStats(def: string, stars = 1): Stat[] {
  if (!effectAt(def, stars).gate) throw new Error(`rigStats: ${def} is not a rig`);
  if (isPlainSix(def) || isShapes2Piece(def)) return plainRigStats(def, stars) ?? []; // PLAIN-1 (REQ-BFG-084): the six's row (PLAIN-1F M1: plainRigStats, the one stat-row path); SHAPES-2: and the six more's
  return [];
}

/** PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1 P4): the six plain stat rigs' stat row, as PLAIN-1's brief's table reads it: what
 *  each hit gives each slug ({DMG}, {BURN}, {STUN} and {PLATE}, each with its +; Battle.applyHit), or BALLAST's carrier
 *  stat, MAX {HULL} +n% while it works (Battle.makeSide). Whole numbers, through the formatters. PLAIN-1F (M1): PLAIN-1's
 *  plainStats, folded into plainRigStats (the one stat-row path); on `day` as EXPLAIN-1's rows are, and with no day on the
 *  face's own day (dayShown.ts), as plainStats read it. */
function sixStats(def: string, stars: number, day?: number): Stat[] {
  const e = effectAt(def, stars).gate!;
  const on = <T>(fn: () => T): T => (day === undefined ? fn() : shownOn(day, fn));
  if (e.maxHullPct) return [["HULL", `+${fmtPct(e.maxHullPct / 100)}`, "MAX"]];
  if (e.stun) return [["STUN", `+${fmtSec(e.stun)}`]];
  const out: Stat[] = [];
  if (e.slugPlate) out.push(["PLATE", `+${fmtDmg(on(() => sustNow(e.slugPlate!)))}`]); // HULL-1d: PLATE x S(d), as PLATE ROLLER's
  if (e.flat) out.push(["DMG", `+${fmtDmg(on(() => dmgNow(e.flat!)))}`]);
  if (e.burn) out.push(["BURN", `+${fmtCount(e.burn)}`]);
  return out;
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
  BURN: () => `EACH {*BURN}: ${fmtDmg(dmgNow(FACE_SIM.burnTick))} HULL DAMAGE A SEC FOR ${fmtSec(BURN_TIME)}{SEC}.`,
  STUN: (t = DISRUPT_TIME) => `{*STUN}: THE ENEMY PART IT HITS STOPS FOR ${fmtSec(t)}{SEC}.`,
  HEAT: (h = AMMO.cinder.rideScale) => `{*HEAT}: +${fmtDmg(dmgNow(h))} DAMAGE FOR EACH SEC IT RIDES.`,
  // U2b F3: a cap in a reminder names its unit, one form for every capped reminder ("MAX 15 {FRAY}.", not "UP TO 15")
  // WORDS-1 (REQ-BFG-081; READ-1 4: BARBED SPOOL, the one card all three readers got wrong; a reader took HIT for the rig
  // label): every later shot that hits the hull (battle.ts:2053; was "EVERY LATER HIT +2 DAMAGE.")
  FRAY: () => `EACH {*FRAY}: EVERY LATER SHOT THAT HITS THE HULL +${fmtDmg(dmgNow(FRAY_BONUS))} DAMAGE. MAX ${fmtCount(FRAY_MAX)} {FRAY}.`,
  // CARD-3 (REQ-BFG-107): the soak layer reads SHIELD ({*PLATE} draws ICON.PLATE then SHIELD: font.ts PLAYER_WORD), with
  // the genre's POINT FOR POINT: races/bastion.ts absorb takes min(SHIELD, damage) off each hit (impacts, limpet blasts,
  // BURN) before the hull; PLATE_CAP 240. HULL DAMAGE says where it stands (was "SOAKS DAMAGE BEFORE YOUR HULL.")
  // MERGE-099D: HULL-1d's (REQ-BFG-079) cap on the text's day, PLATE_CAP x S(d) (sustNow), in CARD-3's words
  PLATE: () => `{*PLATE}: SOAKS HULL DAMAGE POINT FOR POINT. MAX ${fmtDmg(sustNow(PLATE_CAP))} {PLATE}.`,
  // WORDS-1 (REQ-BFG-081; READ-1 4: readers took a pair for two slugs fired together): from two belts (races/foundry.ts
  // inSync: two loads by two intakes, a belt to an intake; was "TWO LOADS REACH ONE TURRET AT ONCE.")
  PAIR: () => "{*PAIR}: TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE.",
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1 and 4.9): SHIELD a count (fmtCount; content.ts SHIELD_CAP), HEAL and REGEN on hull.
  // REGEN's verb is HEAL's (GIVES BACK; 4.9 wrote HEALS, which would stand as a bare keyword: REQ-BFG-032 rule 3)
  // NUM-4 (REVIEW-SUSB F1): it blocks one hit's DAMAGE; that hit's BURN, FRAY, STUN and poison still land (battle.ts impact)
  // CARD-2 (REQ-BFG-081, K3 b): ALL OF one hit's damage, however big (battle.ts:2059 shieldHit returns 0 for the hit)
  // CARD-3 (REQ-BFG-107): the block reads WARD ({*SHIELD} draws ICON.SHIELD then WARD), in the rune reminder's words:
  // shieldHit breaks one (SHIELD_CAP 3) and returns 0 for the hit; never "WHOLE HIT" (REVIEW-SUSB F1)
  SHIELD: () => `{*SHIELD}: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS. MAX ${fmtCount(SHIELD_CAP)} {SHIELD}.`,
  // SHOPCARD-1b (REQ-BFG-081; READ-9 section 7, fix 5): HULL in words, not the {HULL} icon (it draws the heart, and 4 of the 5
  // readers who opened HEAL's note hedged between the hull and the run's hearts). battle.ts:1479-1501 heal() gives back
  // s.hull.hp, never past s.hull.max (1494-1496); sustainTick (1519-1537) heals the REGEN each whole second through it
  HEAL: () => "{*HEAL}: GIVES BACK HULL, NEVER PAST FULL.",
  REGEN: () => "{*REGEN}: GIVES BACK THIS MUCH HULL EACH SEC.",
  // SCALE-2b (REQ-BFG-108; REPORT-SCALE1 section 2, the design's keyword text in CARD-3's words, BURN's form): battle.ts
  // hullEffects, POISON_DPS (2; 3 until BUMP-1F P3 D2, RULING-BUMP1F-R13 R13.5) a POISON at each whole second x D(d) (dmgNow, as BURN's tick), no decay until the fight
  // ends; stacks add (impact); straight to hp, never absorb() ({*PLATE}: the soak layer, SHIELD to the player). Read only
  // while SCALE_RIGS is on (KEYWORDS holds POISON then: VENOM DRIP's face, its glossary row, the status row's chip). The
  // design's UNTIL THE FIGHT ENDS is UNTIL THE END: the whole text must fit the glossary's 2 lines of 5x7 at 225 px, and
  // with FIGHT ENDS it takes 3 (SHIELD. alone on the third; measured, REPORT-SCALE2b Findings)
  POISON: () => `EACH {*POISON}: ${fmtDmg(dmgNow(POISON_DPS))} HULL DAMAGE A SEC UNTIL THE END. THEY ADD UP AND GO PAST {*PLATE}.`,
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
/** WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: the speed rigs 1 of 12 answers right, then 11 of 12): where a speed rig's
 *  change starts, the tile its arrow points at (one arrow) or the tiles its arrows point at (more), on to the gun: Battle
 *  walks each tile's speed from the rig's own tile on (the SPEED tap note, glossary.ts). */
const fromHere = (e: ItemDef): string => (oneBelt(e) ? "FROM THIS TILE ON" : "FROM THESE TILES ON");

const FACES: Record<string, (e: ItemDef, x: X) => Rules> = {
  // --------------------------------------------------------------------------------------------------- factories
  press: () => rules([]),
  // U2e step 2 (REQ-BFG-070): a batch is the factory's own output, a stat ({SLUG}2 in its second stat row, carryStats):
  // was "STAMPS 2 SLUGS AT A TIME." and "DROPS 3 SLUGS; RIGS HIT EACH ONE."
  doublestamp: () => rules([]),
  // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.1 rank 4; READ-3 F-03): the batch's slugs are hit one by one (battle.ts stamp: they
  // leave one by one, each a payload a rig's arrow hits on its tile), the batch's count from the sim (3 at every star;
  // was "RIGS HIT EACH SLUG.")
  // CARD-2 run 2: not "EACH RIG HITS ALL 3 SLUGS." (run 1's, the brief's example): stamp deals a batch's slugs round-robin
  // over the tower's belts (battle.ts:1064-1090, f.rr), and a factory feeds up to 2 belts at ★1 (stars.ts BELT_SLOTS), so a
  // rig on one of two belts sees 2 or 1 of the 3. Each slug is its own payload, hit by the rigs on its belt: ON ITS OWN, as
  // the desk text says it (abilityText.ts shottower: RIGS HIT EACH BUCKSHOT ON ITS OWN). 217 px
  shottower: (e) => rules([{ text: `RIGS HIT EACH OF ITS ${fmtCount(f(e).batch ?? 1)} SLUGS ON ITS OWN.` }]),
  hotswap: (e) => {
    // Battle.stamp: EMBER slugs carry its burn, SPARK slugs a shock (DISRUPT_TIME, or the star's shockTime)
    // U2e step 2: its slugs' BURN and STUN are its own, stats ({BURN}2 {STUN}1.6, carryStats); the line says only that
    // they alternate (was "ITS SLUGS ALTERNATE: +2 {*BURN}, THEN {*STUN} 1.6.")
    const t = cyc(e, "spark").shockTime ?? DISRUPT_TIME;
    return rules([{ text: "ALTERNATES {*BURN} AND {*STUN} SLUGS." }], [], [REMINDER.BURN(), REMINDER.STUN(t)]);
  },
  slagpot: () => rules([{ text: "ITS SLUGS IGNORE BELT SPEED." }]),
  gantry: () => rules([]),
  // WORDS-1 (REQ-BFG-081; READ-1 6.1): STAMPS is a coined word with no note (was "STAMPS YOUR HERO'S SLUGS."); Battle.factoryDef
  // makes the hero's own ammo here, beside the hero's factory: TOO
  // SHOPCARD-1b (REQ-BFG-081; READ-9 section 3.2 and 9 fix 2: 6 of 6 readers took TOO as "its own slugs plus the hero's"): it
  // makes ONLY the hero's (battle.ts:929-938 factoryDef swaps its ammo for hero.ammo and its speed for the hero factory's
  // x its rate %), and the stat rows above are those slugs', so TOO goes
  mimic: () => rules([{ text: "MAKES YOUR HERO'S SLUGS." }]),
  limpet: (e) => {
    // DESIGN-Y row 13: its charges' blast is its DMG stat (factoryStats: the charge's 20 joined it, content.ts STAR_DIFF);
    // Battle.hullEffects: each charge blasts the enemy hull round.delay s after it hits. Was "CHARGES BLAST THE HULL: 80
    // {DMG}, 3{SEC} LATER." and ★2/★3's clause "ITS BLAST GIVES THE PART {*STUN} 1."
    const delay = fmtSec((f(e).round as { delay: number }).delay);
    // CARD-2 (REQ-BFG-081, K3 g; READ-3 6: THE HULL, THEY): battle.ts roundImpact pushes a charge on any hit (a part or the
    // hull) and 2342- blasts the hit side's hull (the foe's) round.delay s later: THE FOE'S HULL, AFTER A HIT (225 px, the op
    // band's one line; was "ITS {SLUG} BLAST THE HULL 3{SEC} AFTER THEY HIT.")
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 6: 5 of 6 readers couldn't tell whether the DMG number also lands on impact): the number
    // belongs to the blast. Its charge deals nothing on impact (content.ts limpet: base 0) and the blast is the DMG stat
    // (factoryStats), so the line says the FOE'S HULL TAKES that number delay s after a hit: battle.ts:2350 roundImpact queues
    // { at: t + delay, blast } on the hit side, 2431-2441 hullEffects takes blast (x D(day), after plating) off that side's
    // hull. 225 px of the 225 px band at 3 digits (was "ITS {SLUG} BLAST THE FOE'S HULL 3{SEC} AFTER A HIT.", 225 px)
    // SHOPCARD-1c (REQ-BFG-081; READ-10 G7, round T R/R/R -> P/P/R: two readers counted two hits of 180, the stat row's DMG and this
    // line's number): the stat row's [DMG] IS the blast (content.ts:532-539 base 0 + blast; factoryStats), so the line drops the number
    // and says ITS {DMG} is what the foe's hull takes, delay s after a hit (battle.ts:2350 roundImpact queues {at: t + delay, blast};
    // 2431-2441 hullEffects takes the blast, x D(day), after plating, off the hit side's hull). It does not say the hit deals nothing:
    // rigs on the belt can add damage to the charge's own impact. One row, 225 px at every star and day (no digits left in it).
    // The brief's "ITS {DMG} LANDS ON THE FOE'S HULL 3 SEC AFTER A HIT." is 241 px (two rows)
    // SHOPCARD-1d (REQ-BFG-081; READ-11 fix list 2: 2 of 6 readers (round A Opus, round T Haiku) still leaned to "a second dose on top
    // of the hit" or "again", and 2 of 3 tooltip readers asked whose ITS it was): name what lands, and say it lands once, as the blast.
    // The stat row's {DMG} IS the blast (content.ts:532-539 base 0 + round.blast; factoryStats adds the blast to the stat). A hit queues
    // one charge (battle.ts:2191 impact -> 2318-2350 roundImpact pushes {at: t + delay, blast} on the hit side, for a hit on ANY target);
    // delay s later (2428-2441 hullEffects) the blast, x D(day) and after plating, takes the hit side's hull down and the charge is gone
    // (2434 splice). So the DMG lands once per hit, as a blast on the foe's hull; no bare ITS. The line does not say the hit itself deals
    // nothing: deck.ts:585-588 shotFloor is 0 for a LIMPET charge, so its impact deals only what rigs (and runes) added to it (battle.ts:1919
    // payloadDamage with the slug's flat, 2133-2151 impact), and the foe's FRAY bonus. Two rows of the 225 px band (335 px; no digit but
    // the delay, so the same at every star and day). H3 round 1 (three fresh readers, rounds A and T) tried "A HIT STICKS A CHARGE: 3{SEC}
    // LATER IT BLASTS THE FOE'S HULL FOR THE {DMG}." (361 px): Sonnet took the stat row's DMG for each slug's own hit and the blast for
    // "another 180 ... a delayed second hit on top of the normal one" (A) and "a delayed second blast" (T), so this form says the DMG lands
    // ONCE. Other forms measured (px): "THE {DMG} LANDS ON THE FOE'S HULL AS A BLAST, 3{SEC} AFTER A HIT." 304, "THE {DMG} IS A BLAST THAT HITS
    // THE FOE'S HULL 3{SEC} AFTER A HIT." 307, "3{SEC} AFTER A HIT, A BLAST OF THE {DMG} LANDS ON THE FOE'S HULL." 304, "THE {DMG} IS A BLAST
    // THAT LANDS ON THE FOE'S HULL 3{SEC} AFTER A HIT." 329, "THE {DMG} IS A BLAST, NOT A HIT: ..." 376, "THE {DMG} IS ONE BLAST: IT LANDS ON
    // THE FOE'S HULL 3{SEC} AFTER A HIT." 331, "ALL OF THE {DMG} LANDS AS ONE BLAST ON THE FOE'S HULL, 3{SEC} AFTER A HIT." 354, "THE {DMG} LANDS
    // ONLY AS A BLAST ON THE FOE'S HULL, 3{SEC} AFTER A HIT." 332
    // SHOPCARD-1f (REQ-BFG-081; READ-13 fix list 3: 12 of 12 readers, rounds A and T, asked which hit the line means, and one T answer
    // left it in its DOES: "after a hit (I cannot tell which hit)"): the hit is its own slug's, on anything. A charge is pushed only when
    // a shot that carries one of ITS slugs' round lands (battle.ts:2191 impact: `if (pr.payload.harass) this.roundImpact(def, hit, ...)`,
    // the harass round being the LIMPET WORKS slug's payload), on a part or on the hull of the other side (impact runs for every shot that
    // lands; a WARD stops only that hit's damage, 2146, and a FLAK SCREEN can down only a shot that carries a stall, 2100-2108, which a
    // LIMPET charge does not); 2350 queues { at: t + round.delay, blast } on that side, and 2428-2444 hullEffects takes the blast off its
    // hull when `at` comes. A foe's own hit, a rig's hit on a slug (applyHit never calls roundImpact) or another factory's slug queues
    // nothing. Two rows (433 px: 220 / 208), the same at every star and day: the only digit is the delay, 3 at every star.
    // H3 (three fresh readers, rounds A and T, six LIMPET WORKS answers; mcheck/RESULTS.md): form 1 `... AFTER ONE OF ITS SLUGS HITS.` (425 px)
    // left `hits what? any part of the foe?` and `once per slug, or once per fight?` in 5 of 6 (grader's count; all six DOES right); form 2 (this
    // one) left `does a WARD, a part or my own part count as anything?` in 4 of 6 (all six DOES right): the bar, at most 1 of 6, was missed by
    // both and the better form is kept. Other forms measured (px): "... AFTER ITS SLUG HITS." 381, "... AFTER ITS SLUG HITS THE FOE." 425, "... AFTER A SHOT
    // WITH ITS SLUG HITS." 447 (second row 222 of 225), "... AFTER ONE OF ITS SLUGS HITS THE FOE." 469 and "... AFTER ITS SLUG HITS ANY PART OR THE HULL." 497
    // (three rows), "... AFTER EACH HIT BY ITS SLUGS." 425 (was "... AFTER A HIT.", 335)
    return rules([{ text: `THE {DMG} LANDS ONCE, AS A BLAST ON THE FOE'S HULL, ${delay}{SEC} AFTER ITS SLUG HITS ANYTHING.` }], [["delay", `${delay}{SEC}`]]);
  },
  // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 7): its pour is its {SLUG} stat (carryStats: 2 / 2 / 3), so the line names no
  // count. Was "CASTS A SLUG ONTO EACH BELT AT ONCE.", wrong at ★2/★3: it pours 2 slugs (★3 3) while it feeds 3 (4) belts
  twinmould: () => rules([{ text: "CASTS ITS {SLUG} ONTO SEPARATE BELTS AT ONCE." }]),
  armorpress: (e) => {
    const p = f(e).plate!, every = fmtSec(p.every), amount = fmtDmg(sustNow(p.amount)); // HULL-1d: x S(d)
    const label = `EVERY ${every}{SEC}:`;
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 3: 1 of 3 readers put the SHIELD on the gun): MENDING LOOM's form without YOUR, "HULL:"
    // (it read R, R, R with "YOUR HULL:"; that is 249 px at ★3, past the 225 px band, and HULL: is 221). battle.ts:1455-1461
    // pressPlate -> addPlate(s, pl.amount): plating on the side's own hull (s.plate, 1585-1595)
    // U2d F1: the period's NEXT★ form is SURGE's, without the label's colon (its period is one at every star today)
    // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q3, face rule 1; replaces cap's answer 5 to SUS-A): its condition is real, so the line
    // says it in ASSEMBLY LINE's words: battle.ts makeSide starts its plating timer only when one of its belts reaches a gun
    // (connected, or joined into a chain that feeds one), so a press with no belt to a gun gives nothing. The label stays in
    // brass after it (faces.ts ruleSpans, keywords.ts and levels.ts find it anywhere in the line); 185 px of the 225 px band
    // at ★3. Was "EVERY 3{SEC}: +30 {*PLATE}."
    return rules([{ text: `FEEDS A GUN: ${label} HULL: +${amount} {*PLATE}.`, label }], [["every", `EVERY ${every}{SEC}`], ["plate", `+${amount} {*PLATE}`]], [REMINDER.PLATE()]);
  },
  // NUM-3 (R1's STUN fold, REQ-BFG-046, REQ-BFG-070): the four STUN-fold factories. A SABOT, FROST or CHAIN round's STUN is
  // its own payload's, a stat ({STUN} in the second stat row, carryStats: R1's "ITS ROUNDS: {STUN} 2.5." line is a stat in
  // U2e's split); the reminder, with the round's seconds, stays for the tap
  scrapper: (e) => {
    // Battle.produce: one more stamp for each harassment its side lands (acceptHarassment); that wrecks and rips count too
    // and the queue's cap are interim caveats, ★3 BIG HAUL's wreck a clause. Its slugs' scrapFlat is in its DMG stat
    const n = fmtCount(FACE_SIM.scrapPerHarass);
    // CARD-5 (REQ-BFG-081, L; READ-5 12.6, parts/DAYNUM.md): the scrap damage the desk line says (abilityText.ts scrapper
    // card: moreDamage(scrapFlat), x D(d) on the read-out's day: day 1 30, day 5 60), printed where its rule is, from the
    // same source (battle.ts stamp adds scrapFlat to each slug it stamps; D grows the whole hit as it lands). The DMG stat
    // keeps the slug's whole damage (a plain slug's and this)
    const more = fmtDmg(dmgNow(f(e).scrapFlat ?? 0));
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.1 rank 2): the trigger first, as READ-2's words (its own slugs never stun; was
    // "+1 {SLUG} FOR EACH {*STUN} YOU LAND.")
    return rules([{ text: `EACH {*STUN} YOU LAND: ${n} EXTRA {SLUG}.` }, { text: `ITS {SLUG} DEAL ${more} MORE {DMG} THAN PLAIN.` }], [["scrap", `${more} MORE {DMG}`]]);
  },
  sabot: (e) => {
    // Battle.roundImpact: a round on a rig wrecks it for the battle; on any other part, a STUN of round.seconds (its stat)
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D): WRECK in plain words (was "ITS ROUNDS WRECK RIGS FOR THE FIGHT."). A
    // wreck is no STUN (TOLLBOOTH, MANTLET and LODESTONE don't count it), so the line says STOP, not STUN
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.1 rank 2, 7.4: two effects under one icon): both, one a line: battle.ts roundImpact
    // wrecks a rig it hits for the battle and STUNs a belt tile, factory or turret round.seconds (its {STUN} stat). Two lines
    // of 219 and 177 px, as the old 271 px sentence's two on the phone (was "ITS ROUNDS STOP AN ENEMY RIG FOR THE WHOLE FIGHT.")
    const t = fmtSec(rnd(e).seconds);
    return rules([{ text: "A RIG IT HITS STOPS FOR THE WHOLE FIGHT." }, { text: `ANY OTHER PART IT HITS: {*STUN} ${t}{SEC}.` }], [], [REMINDER.STUN(rnd(e).seconds)]);
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
    // Battle.pressHeal: heal.amount every heal.every s through heal(), at the stamping pace, while it feeds a turret.
    // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q3, face rule 1): the belt rule is on the face now, as ARMOR PRESS's (this replaces
    // cap's answer 5 to SUS-A, which kept it off): battle.ts makeSide starts its HEAL timer only when one of its belts reaches
    // a gun. 167 px of the 225 px band. Was "EVERY 3{SEC}: {*HEAL} 20."
    const h = f(e).heal!, every = fmtSec(h.every), amount = fmtDmg(sustNow(h.amount)); // HULL-1d: x S(d)
    const label = `EVERY ${every}{SEC}:`;
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 5): "HULL:" names what it heals, as MENDING LOOM's "YOUR HULL:" does and as ARMOR PRESS's
    // line now does (YOUR HULL: takes the line to 231 px at 3 digits, past the 225 px band; HULL: is 197). battle.ts:1465-1471
    // pressHeal -> heal(s, ...): the side's own hull, 1479-1501
    return rules([{ text: `FEEDS A GUN: ${label} HULL: {*HEAL} ${amount}.`, label }], [["every", `EVERY ${every}{SEC}`], ["heal", `{*HEAL} ${amount}`]], [REMINDER.HEAL()]);
  },
  // Y2-Y6 (release Y; folded at the flip, Y7b2): its first face, from the switch's faces
  assembly: (e) => {
    // DESIGN-Y row 32 (its stats factoryStats': RATE, its slugs' DMG, BELT): Battle.makeSide: while it feeds a turret every
    // rig on your side comes online at x commission of its time, its own belts' rigs too (no instant start); HOT START is
    // gone. Was the RULES text "WHILE IT FEEDS A TURRET, YOUR RIGS COME ONLINE IN HALF THE TIME." and 3 more sentences
    // TXT-096 (REQ-BFG-070; REVIEW-TXT095 Q2, rule 1): its condition is real, so the line says it: battle.ts assemblyLines
    // counts an ASSEMBLY LINE only when one of its belts reaches a turret (routeInfo connected), and then every rig on your
    // side starts at x commission (makeSide; its own belt's too, which YOUR RIGS says). ★3's commission is 0, so its rigs
    // come online on the first tick (commissionAt 0): AT ONCE, as its sentence says (abilityText.ts startIn). 217 px of the
    // 225 px band ("WHILE IT FEEDS A TURRET, ..." is 286). Was "YOUR RIGS START 50% SOONER." (★3: "100% SOONER.")
    const soon = startIn(f(e).commission!);
    // WORDS-1 (REQ-BFG-081): READ-1 6.1's one-off "START WORKING" takes the line to 263 px, past the op band's one line that
    // TXT-096 pinned (tests/txt096.faces), so the line stays (a known gap of WORDS-1's REPORT)
    // CARD-2 (REQ-BFG-081, K3 g; READ-3 6: START, run or fight): what starts sooner is the rigs' work (makeSide: each rig
    // comes online at x commission of its time while this feeds a gun): WORK (211 px; START WORKING is 263, past the op
    // band's one line; was "FEEDS A GUN: YOUR RIGS START 50% SOONER.")
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 4, round T: all three readers took "WORK 50% SOONER" for earlier along the belt, shorter
    // timers or rigs acting more often): START says when. battle.ts:714-736 each rig comes online at the fight's start at
    // COMMISSION_BASE + COMMISSION_STEP x its rank, x the best running ASSEMBLY LINE's factor (assemblyLines, 2574-2587;
    // battle.ts:979-981 brings it online when t >= commissionAt), so "START 50% SOONER" is that start-up time cut and ★3 (factor
    // 0) is AT ONCE. START WORKING ... IN EACH FIGHT is 341 px, past the 225 px band; START is 217 (was "YOUR RIGS WORK 50% SOONER.")
    // SHOPCARD-1c (REQ-BFG-081; READ-10 G8, round T P/P/R: "START" still left "start what? when?"): it says WHEN and WHAT. battle.ts:714-736
    // commissionAt = (COMMISSION_BASE + COMMISSION_STEP x rank) x the best running line's factor, set in makeSide at the start of EACH
    // fight, and 979-981 brings a rig online (it works) once t >= commissionAt: so EACH FIGHT, YOUR RIGS START WORKING 50% SOONER, and at
    // ★3 (factor 0) AT ONCE. Two rows (328 px; ★3 310 px): no one-row form says when ("FEEDS A GUN: YOUR RIGS START 50% SOONER." is
    // 217 px, "... EACH FIGHT, YOUR RIGS START 50% SOONER." 282, "FEEDS A GUN: RIGS START 50% SOONER EACH FIGHT." 251)
    // SHOPCARD-1e (REQ-BFG-081; READ-12 fix 1, E2): 3 of the 5 READ-12 answers below R were this line, all Haiku, in rounds A and T:
    // "I can't tell whether 'your rigs' means all of them or only those on its gun's belt." The truth is every rig on your side, the
    // ones on its own belt too (battle.ts makeSide 714-736: each rig's commissionAt x the best running line's factor, with no belt
    // test), so the line says ALL: 350 px at ★1 and ★2, 332 px at ★3 (AT ONCE), two rows of the 225 px band (was 328 and 310)
    // SHOPCARD-1f (REQ-BFG-081; READ-13 fix list 4: 9 of 12 readers asked whether a belt that reaches a turret is enough for FEEDS A GUN):
    // it IS the whole condition, and it is a standing one: battle.ts:2574-2587 assemblyLines counts a line only while one of its belts
    // reaches a turret (2582: `routeInfo(b, i, ...).connected`), the best (lowest) commission of those winning (2583), and makeSide
    // (714-736) reads that once per fight. WHILE IT FEEDS A GUN says it is a standing condition (400 px, two rows: 200 / 195; ★3 AT ONCE
    // 382). Other forms measured (px, ★1): "WHILE ITS BELT REACHES A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 50% SOONER." 446 (two
    // rows, 224 / 217 of 225), "WHILE IT FEEDS A GUN, ALL YOUR RIGS START WORKING 50% SOONER EACH FIGHT." 398, "WHILE IT FEEDS A GUN: EACH
    // FIGHT, ALL YOUR RIGS START 50% SOONER." 354, "WHILE A BELT OF IT REACHES A GUN: ..." 466 (three rows). Kept ALL YOUR RIGS (READ-13: hedges 3 of 12 -> 0)
    return rules([{ text: `WHILE IT FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING ${soon}.` }], [["soon", soon]]);
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
  wardworks: () => rules([{ text: `ITS SLUGS LOAD: +${fmtDmg(sustNow(PLATE_PER_SLUG))} {*PLATE}.`, label: "LOAD:" }], [], [REMINDER.PLATE()]),
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
    // TXT-096 (REQ-BFG-070; REVIEW-TXT095 Q2, rule 3): its cap is its own (cores.ts pressureBonus: min(maxCount, queued), 5 at
    // every star) and its SHOT tap says it (glossary.ts TAP_NOTES pressure); it fits the line in the faces' own load icon
    // (EXT. CHAMBER's, HOPPER's {SLUG}) with a cap that names its unit (U2b F3), 210 px of the 225 px band (", UP TO 5." and
    // "..., MAX 5 {SLUG}." after LOAD are 228; a bare "MAX 5." is T2's ban). Was "SHOT: +12 {DMG} FOR EACH LOAD WAITING."
    // SCALE-2c (REQ-BFG-098; BRIEF-SCALE2c section 2): with SCALE_RIGS on its def has no maxCount (MAX 5 dropped: scale.ts
    // SCALE_DEFS), so the line has no cap: REPORT-SCALE1 3.1's face line, the same key (its ⓘ ladder and NEXT★ as before)
    const per = fmtDmg(dmgNow(c(e, x).perQueued!));
    if (c(e, x).maxCount === undefined) return rules([shot(`+${per} {DMG} FOR EACH {SLUG} WAITING.`)], [["per", `+${per} {DMG}`]]);
    const max = fmtCount(c(e, x).maxCount!);
    return rules([shot(`+${per} {DMG} FOR EACH {SLUG} WAITING, MAX ${max} {SLUG}.`)], [["per", `+${per} {DMG}`]]);
  },
  gatling: (e, x) => {
    // rateText's rule: the spin's floor x0.6 of the interval fires 1 / 0.6 = 67% faster (N1 2.3: X% FASTER is the rate)
    const up = fmtPct(c(e, x).top! / 100); // NUM-2 (REQ-BFG-047): the stored whole rate % (was 1 / floor - 1)
    // Y1 (REQ-BFG-070; STAR-D 1.6, REVIEW-STARD): its spin step, the share of its reload each quick shot takes off (cores.ts
    // gatlingCadence: spin - step for a shot within `gap` s of the last), 6 / 9 / 12%, a number that changes with its stars:
    // keyed, so the ⓘ LEVELS ladder shows it ("+6%/+9%/+12% A QUICK SHOT") and NEXT★ with it. The face line is unchanged.
    // ("EACH QUICK SHOT" would take ★2's NEXT★ line to 230 px, past NEXT_LINE_W)
    const step = fmtPct(c(e, x).step!);
    // TXT-096 (REQ-BFG-070; REVIEW-TXT095 Q2, rule 1): its firing rule is unlike the default turret's, so the line says it:
    // the default (cores.ts IDENTITY ready) waits for a full chamber or windowTime after its first load; GATLING's
    // (gatlingReady) fires a load as soon as the barrel is ready and never waits for a full chamber: FIRES AT ONCE, its
    // shop card's words (abilityText.ts gatling card). SPINS UP keeps the spin firing builds (the ⓘ ladder's "+6% A QUICK
    // SHOT" says how). 212 px of the 225 px band ("FIRES EACH LOAD AT ONCE, ..." is 268). Was "SPINS UP TO 67% FASTER AS IT
    // FIRES."
    // WORDS-1 (REQ-BFG-081): READ-1 6.1's one-off (FIRES AT ONCE) has no plain form inside the op band's one line (268 px and
    // more), so the line stays (a known gap of WORDS-1's REPORT)
    // CARD-2 (REQ-BFG-081, K3 g; READ-3 6: FIRES AT ONCE): FINAL NAIL's note's truth, its own line (gatlingReady fires each
    // load as soon as the barrel is ready, never waiting for a full chamber); the spin a line of its own (153 and 125 px:
    // the op band's one line each; the two in one were 284; was "FIRES AT ONCE, SPINS UP TO 67% FASTER.")
    return rules([{ text: "FIRES EACH LOAD AS IT COMES." }, { text: `SPINS UP TO ${up} FASTER.` }], [["spin", `${up} FASTER`], ["step", `+${step} A QUICK SHOT`]]);
  },
  hullbreaker: (e, x) => {
    const more = fmtPct(c(e, x).hullMul! - 1);
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 3): one verb with its own amount, its trigger SHOT: in brass (was "SHOTS
    // ALWAYS HIT THE HULL, +30% {DMG}.", two clauses); the rule is as before (content.ts hullbreaker hullMul)
    // TXT-096 (REQ-BFG-070; REVIEW-TXT095 Q2, rule 1): what it can't hit is a real rule: Battle.fireCore aims its shot at
    // hullTarget() with no target draw (battle.ts fireCore), so it never hits a part (its slug's STUN lands on nothing), as its
    // sentence's NEVER A MACHINE says. 202 px of the 225 px band ("..., NEVER A PART." is 246). Was "SHOT: HITS THE HULL FOR
    // +30% {DMG}."
    return rules([shot(`HITS ONLY THE HULL, FOR +${more} {DMG}.`)], [["more", `+${more} {DMG}`]]);
  },
  salvo: (e, x) => {
    const flat = fmtDmg(dmgNow(c(e, x).volleyFlat!));
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 4): one verb with its own amount (was "EMPTIES THE CHAMBER AT ONCE, +20 {DMG}
    // EACH."); its wait and longer reload are its installed turret's RATE, the volley pace (inspector.ts turretPanel)
    return rules([shot(`FIRES THE CHAMBER AT +${flat} {DMG} EACH.`)], [["flat", `+${flat} {DMG}`]]);
  },
  mortar: (e, x) => {
    const n = c(e, x).splash!, more = fmtCount(n), share = fmtPct(c(e, x).share!);
    return rules([shot(`ALSO HITS ${more} MORE TARGET${s(n)} FOR ${share} {DMG}.`)], [["splash", `${more} MORE`], ["share", `${share} {DMG}`]]);
  },
  grapnel: (e, x) => {
    // TXT-096 (REQ-BFG-070; REVIEW-TXT095 Q2, rule 1): what it can hit is a real rule: Battle.rip takes slugs for a hit on an
    // enemy belt tile or an enemy rig (the slugs by that rig's tiles: battle.ts rip, t.kind "belt" or "gate"), as its
    // sentence's OR RIG says. WITHIN n TILES stays in its SHOT tap (glossary.ts TAP_NOTES grapnel; rule 3: "... WITHIN 2
    // TILES." is 281 px of the 225 px band). 194 px. Was "SHOT: RIPS 1 SLUG OFF AN ENEMY BELT."
    const n = c(e, x).rip!, rip = fmtCount(n);
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 7: 3 of 3 readers asked whose slug and whether it is destroyed or taken): the foe's belt
    // or rig LOSES them. battle.ts:2355-2386 rip() takes the nearest slugs off the HIT side's own belts (s.routes[...].ammo, the
    // foe's: the shot's target is an enemy belt tile or rig) with r.ammo.splice (2377): they are gone, nothing is added to the
    // shooter (Y2: no salvage), so LOSES, not "takes". DESTROYS 1 FOE SLUG is 234 px and ON A BELT OR RIG, RIPS 1 FOE SLUG 210
    // (whose, but not what happens); this is 197 px, 203 at ★3. The SHOT tap note keeps RIPS and the reach (was "ON A BELT OR RIG,
    // RIPS 1 SLUG.", 188 px)
    // SHOPCARD-1c (REQ-BFG-081; READ-10 G6, round T P/P/P: "LOSES" with no condition was read as "every shot takes a slug"): only a
    // shot that HITS a foe belt or rig rips a slug, the nearest one within `reach` tiles of the hit (battle.ts:2190 impact -> 2355-2386
    // rip(): returns 0 unless the target's kind is "belt" or "gate"; it splices the nearest slugs off the foe's belt, 2374-2377), and
    // the shot's own damage still lands (impact applies it, 2142-2151, before the rip), so the line says what a hit does and
    // nothing about the shot's damage. One verb, RIPS, as the ladder ("RIPS 1/2/3") and the SHOT note ("IT RIPS THE NEAREST SLUGS
    // WITHIN 1 TILE OF A HIT") use. Two rows (239 px, 245 at ★2/★3): "SHOT: A FOE BELT OR RIG HIT RIPS 1 SLUG." is 213 px but puts
    // the condition last and reads as a noun phrase; "SHOT: A HIT ON A FOE BELT RIPS 1 SLUG." 201 px drops the rig, a rule (TXT-096)
    // SHOPCARD-1f (REQ-BFG-081; READ-13 fix list 5: 10 of 12 readers asked whether the ripped slug is destroyed or taken for the shooter):
    // it is destroyed. battle.ts:2190 impact -> 2355-2386 rip(def, ...): `def` is the side that was hit, and `r.ammo.splice(...)` (2377)
    // takes the picked slugs off ITS belt (the nearest ones within `reach` tiles of the hit: 2366-2374, 1 tile at ★1, 2 at ★2: content.ts:843);
    // nothing is added to the shooter (Y2, 2189: SALVAGE LINE's next-shot damage is gone, its ★3 name stays as the ⓘ perk name). So DESTROYS,
    // NEAR IT (the hit belt tile, or a rig's arrows' tiles: an exact "ON IT" is false of a rig). Two rows (307 px; ★2/★3 313: the second
    // row 85 px of the 225 px band). Forms measured (px, ★1): "... DESTROYS 1 SLUG ON IT." 295, "... KNOCKS 1 SLUG OFF IT." 289, "... DESTROYS 1
    // FOE SLUG." 285, "... DESTROYS THE NEAREST SLUG." 321, "... RIPS 1 SLUG AND DESTROYS IT." 329, "... RIPS 1 SLUG: IT IS DESTROYED." 331, "...
    // RIPS 1 SLUG OFF IT FOR GOOD." 327 (was "... RIPS 1 SLUG.", 239). The ⓘ ladder and the SHOT note keep RIPS (LEVELS RIPS 1/2/3; not in this job)
    // PRESENT-1 (REQ-BFG-081; REVIEW-READ14 fix 2, FATE-ASK 3 of 12: three readers listed the ladder's RIPS and read it as destroys): the
    // ⓘ ladder says DESTROYS, the face's verb (was `RIPS ${rip}`: "RIPS 1/2/3", "NEXT ★2: RIPS 2")
    return rules([shot(`A HIT ON A FOE BELT OR RIG DESTROYS ${rip} SLUG${s(n)} NEAR IT.`)], [["rip", `DESTROYS ${rip}`]]);
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
    // WORDS-1 (REQ-BFG-081; READ-1 6.1's one-offs: FUSES): cores.ts:178 ready at 2 loads; battle.ts:1920-1923 one shell
    // of both loads at (dmg1 + dmg2) x mult (was "FUSES 2 {SLUG} INTO 1 AT +15% {DMG}.")
    return rules([shot(`FIRES ${from} {SLUG} AS ${into} SHOT AT +${more} {DMG}.`)], [["mult", `+${more} {DMG}`]]);
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
    const flat = fmtDmg(dmgNow(c(e, x).anvilFlat!)), per = fmtPct(c(e, x).perPlate!);
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
    const d = fmtDmg(dmgNow(c(e, x).flatPerBurn!)), n = fmtCount(FACE_SIM.drakeStacks);
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D 3 of 3 right): BONUS DAMAGE in plain words (was "EACH 25 BONUS DAMAGE IS 1
    // {*BURN}."). battle.ts:1907 converts the slug's flat, which its rigs add (1617-1671, 1146), and SCRAPPER's scrap and a
    // FOUNDRY fuse too (1078, races/foundry.ts:47): its SHOT tap note says those and that HEAT never counts (glossary.ts)
    return rules([shot(`EACH ${d} DAMAGE RIGS ADDED TO ITS SLUG BECOMES ${n} {*BURN}.`)], [["per", `EACH ${d}`]], [REMINDER.BURN()]);
  },
  capacitor: (e, x) => {
    // DESIGN-Y row 42: Battle.chambers / fireCore: + perSecond (x the class %: cores.ts scaleCore) for each second the chamber
    // sat empty before the shot, no cap (content.ts STAR_DIFF). Was the RULES text "CHARGES ITS NEXT SHOT 20 DAMAGE FOR EACH
    // SECOND ITS CHAMBER SITS EMPTY." with "IT CHARGES FOR UP TO 5 SECONDS."
    const d = fmtDmg(dmgNow(c(e, x).perSecond!));
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
    const d = fmtDmg(dmgNow(gt(e).flat!));
    return rules([hit(`+${d} {DMG}.`)], [["flat", `+${d} {DMG}`]]);
  },
  grease: (e) => {
    // speedText's rule: a belt speed x1.6 is 60% faster (N1 2.3: "X% FASTER" is the speed up X%); METRONOME's locked
    // belts (lockedFlat) are not playable (hero.ts ORDER), so R1 dropped that line
    const up = fmtPct(gt(e).speed! - 1);
    // WORDS-1 (REQ-BFG-081): where it starts (fromHere; was "ITS BELT RUNS 60% FASTER.", read as the whole belt)
    return rules([{ text: `${runs(e)} ${up} FASTER ${fromHere(e)}.` }], [["speed", `${up} FASTER`]]);
  },
  brake: (e) => {
    const sp = fmtPct(gt(e).speed!); // x0.5 at every star (0.6.1f); ★2 HOT SHOE / ★3 RED-HOT SHOE add flat (a clause)
    // WORDS-1 (REQ-BFG-081): where it starts (fromHere; was "ITS BELT RUNS AT 50% SPEED.")
    return rules([{ text: `${runs(e)} AT ${sp} SPEED ${fromHere(e)}.` }], [["speed", `${sp} SPEED`]]);
  },
  longhaul: (e) => {
    // Battle.applyHit: flat += perPriorGate x the rig hits before it on the payload (at most priorCap from ★2: a clause)
    const d = fmtDmg(dmgNow(gt(e).perPriorGate!));
    return rules([hit(`+${d} {DMG} FOR EACH RIG BEFORE IT.`)], [["per", `+${d} {DMG} EACH`]]);
  },
  coil: (e) => {
    // Battle.impact: a shocked payload stalls the part it hits for DISRUPT_TIME, or the star's shockTime (STUN today)
    const t = gt(e).shockTime ?? DISRUPT_TIME, stun = fmtSec(t);
    // Y1 (REQ-BFG-070, REQ-BFG-046; STAR-D row 1): ★2/★3 SPARK JUMP is a number, the parts its STUN hits: 1 + jump
    // (Battle.sparkJump: the shock also stalls the `jump` nearest other parts). Was "{*STUN} 2." and the clause "★2 SPARK
    // JUMP: {*STUN} HITS 2 PARTS."; the perk's name shows in the ⓘ LEVELS only (ruling R-1, faceBlocks.ts PERK_INFO_ONLY)
    const parts = 1 + (gt(e).jump ?? 0), n = fmtCount(parts);
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.1 rank 2): whose STUN on which part (Battle.impact: the shocked slug stops the part
    // it hits; sparkJump the jump nearest others): ITS {SLUG} {*STUN}S THE PART IT HITS (203 px), at ★2/★3 n PARTS (was
    // "HIT: {*STUN} 2 ON 1 PART.")
    return rules([hit(parts === 1 ? `ITS {SLUG} {*STUN}S THE PART IT HITS ${stun}{SEC}.` : `ITS {SLUG} {*STUN}S ${n} PARTS ${stun}{SEC}.`)],
      [["stun", `{*STUN} ${stun}`], ["parts", `${n} PART${s(parts)}`]], [REMINDER.STUN(t)]);
  },
  splitter: (e) => {
    const sp = gt(e).split!, n = fmtCount(sp.copies), share = fmtPct(sp.mult);
    return rules([hit(`SPLITS IT INTO ${n} AT ${share} {DMG}.`)], [["copies", `${n} COPIES`], ["mult", `${share} {DMG}`]]);
  },
  overdrive: (e) => {
    // ★2 REDLINE adds +1 and ★3 AFTERBURNER +3 to each payload (flat, a second rule); their guards are a clause
    const n = fmtCount(gt(e).speed!), flat = gt(e).flat;
    const d = flat ? fmtDmg(dmgNow(flat)) : "";
    // AZ-PREP (REQ-BFG-070; REVIEW-HULL1B section 5, BRIEF-AZPREP 2 (g)): with LADDER_FIX on, ★2 and ★3 keep 50% and 100% of
    // the ride their speed cuts (ladderFix.ts RIDE_KEEP on the fixed def's levels: Battle.transport and the walk count the
    // ride at 1x x keep + the real ride x (1 - keep)), so its belts' ride payoffs (HEAT, LONG RIDES) don't fall as they
    // speed up. A rule, and a keyed number for the LEVELS ladder (KEEPS -/50%/100% RIDE) and NEXT★. Off (the base def holds
    // no rideKeep) and at ★1 (0): no line, every word as today
    const keep = (gt(e) as { rideKeep?: number }).rideKeep ?? 0, k = keep ? fmtPct(keep) : "";
    // WORDS-1 (REQ-BFG-081): where it starts (fromHere; was "ITS BELTS RUN 3 TIMES AS FAST.")
    return rules([{ text: `${runs(e)} ${n} TIMES AS FAST ${fromHere(e)}.` }, ...(flat ? [hit(`+${d} {DMG}.`)] : []), ...(keep ? [{ text: `KEEPS ${k} OF THE RIDE IT CUTS.` }] : [])],
      [["speed", `${n} TIMES`], ...(flat ? [["flat", `+${d} {DMG}`] as [string, string]] : []), ...(keep ? [["keep", `KEEPS ${k} RIDE`] as [string, string]] : [])]);
  },
  surge: (e) => {
    // DESIGN-Y row 28 (REVIEW-STARD answer 5: the damage pulse): Battle.surgeTick: once each pulse period every slug on its
    // belts gains pulse.flat; the speed pulse is gone. Was "EVERY 3{SEC}: ITS BELTS SURGE 3 TIMES AS FAST FOR 1{SEC}, +10
    // {DMG}." (two effects; it wrapped at ★2)
    const p = gt(e).pulse!, every = fmtSec(p.period), d = fmtDmg(dmgNow(p.flat));
    const label = `EVERY ${every}{SEC}:`;
    return rules([{ text: `${label} +${d} {DMG} TO SLUGS ON ${itsBelts(e)}.`, label }], [["every", `EVERY ${every}{SEC}`], ["flat", `+${d} {DMG}`]]);
  },
  sorting: (e) => {
    // Battle.applyHit: every `every`th payload it hits becomes `copies` payloads at full strength
    // (no ordinal: T2 bans "3RD"; ONE is definitional, as U2a's "TWO LOADS FUSE")
    // TXT-096 (REQ-BFG-070; REVIEW-TXT095 Q2): FULL {DMG} is what sets it apart: a SPLITTER's copies share the slug's x
    // split.mult (60/72/85%: battle.ts applyHit cuts p.mult and p.flat before it copies), a SORTING ARM's copy is the slug as it
    // is ({ ...p }). 213 px of the 225 px band ("... AT FULL {DMG}." is 226). Was "HIT: OF EVERY 3 {SLUG}, ONE BECOMES 2."
    const so = gt(e).sort!, every = fmtCount(so.every), n = fmtCount(so.copies);
    return rules([hit(`OF EVERY ${every} {SLUG}, ONE BECOMES ${n}, FULL {DMG}.`)], [["every", `OF EVERY ${every}`], ["copies", `BECOMES ${n}`]]);
  },
  tollbooth: (e) => {
    // DESIGN-Y row 8: Battle.acceptHarassment: while it works, its first `toll` enemy STUNs on its belt's parts (its belt's
    // tiles, the rigs working them, the gun they feed and, from ★1, the belt's factory: PART, a glossary word) are
    // blocked; a wreck or a rip is no STUN (the shared rule). Was "BLOCKS THE FIRST 2 {*STUN} HITS ON ITS BELT." with two
    // caveats and ★3 FACTORY GUARD's clause
    const n = fmtCount(gt(e).toll!);
    // WORDS-1 (REQ-BFG-081; READ-1 6.1: BLOCKS 2 read as 2 seconds): battle.ts:2157-2167: the first `toll` STUNs each fight on
    // its belt's tiles, the rigs on it, its factory and its gun do nothing (657: set at the fight's start, never refilled);
    // PARTS is tappable there (the PART row: a rig, factory, turret or belt tile). Was "BLOCKS 2 {*STUN} ON ITS BELT'S PARTS."
    return rules([{ text: `THE FIRST ${n} {*STUN} ON ${oneBelt(e) ? "ITS BELT'S" : "ITS BELTS'"} PARTS EACH FIGHT DO NOTHING.` }], [["toll", `FIRST ${n}`]]);
  },
  riveter: (e) => {
    // SUS-B (REQ-BFG-069; SUSTAIN-1 4.9): its repair is HEAL, the same numbers (battle.ts heal(): never past your full hull,
    // half with BURN, none in the dark wind; the HEAL row says so); was "HIT: +6 {HULL}." keyed "repair"
    const d = fmtDmg(sustNow(gt(e).heal!)); // HULL-1d: x S(d)
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 5): "YOUR HULL:" names whose hull, as MENDING LOOM's does (battle.ts:1759 applyHit:
    // this.heal(s, e.heal, "riveter", g.uid), the rig's own side; 1479-1501 heal())
    return rules([hit(`YOUR HULL: {*HEAL} ${d}.`)], [["heal", `{*HEAL} ${d}`]], [REMINDER.HEAL()]);
  },
  heatjacket: (e) => {
    const h = gt(e).heat!, d = fmtDmg(dmgNow(h)); // + heat damage a second ridden after it (as KILN's cinder: HEAT)
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
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D 3 of 3 right: NEXT RIG'S read as the next rig in time): battle.ts:727-744
    // the first later rig down its belt (739), its hit doubled while charged (1607-1615), then the rest (was "DOUBLES THE
    // NEXT RIG'S HIT.")
    return rules([{ text: `${label} THE NEXT RIG DOWN ITS BELT HITS TWICE.`, label }], [["every", `EVERY ${t}{SEC}`]]);
  },
  plateroller: (e) => {
    const d = fmtDmg(sustNow(gt(e).plate!)); // HULL-1d: x S(d)
    return rules([hit(`+${d} {*PLATE}.`)], [["plate", `+${d} {*PLATE}`]], [REMINDER.PLATE()]);
  },
  stoker: (e) => {
    // Y7b1 (release Y; ruling Y7A-R1; DESIGN-Y row 31): Battle.stokedPace: the factories its arrows point at work up to
    // stoke faster, never past the gun their belts feed (its cap holds with the switch on, as at 0.9.2). UP TO says the cap
    // on the face's one line (the interim caveat "A FACTORY NEVER OUTRUNS ITS GUN." stays off: STAR_GONE_CAVEATS; its ⓘ
    // sentence names the gun). Was today's line "ITS FACTORIES WORK 20% FASTER." with no cap
    const up = fmtPct(gt(e).stoke!);
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 4, round T: "ITS FACTORIES" left open which factories): the ones it hits. deck.ts:432-447
    // stokeHits: a STOKER's arrow counts only where it points at a cell a factory fills (never through a belt), and
    // battle.ts:808-818 stokes exactly those factories' timers. "THE FACTORIES ITS ARROWS POINT AT" is 311 px, past the 225 px
    // band; "FACTORIES IT HITS" is 221 (was "ITS FACTORIES WORK UP TO 20% FASTER.", 199 px)
    // SHOPCARD-1c (REQ-BFG-081; READ-10 G5: "FACTORIES IT HITS" was SHOPCARD-1b's one regression: HIT is a rig's word for the slugs on
    // belt tiles it works, so Haiku stood the rig beside a belt, round A R/R/P; STOKER does nothing to a belt): no HIT, no HITS. It says
    // the factories its arrows POINT AT (deck.ts:432-447 stokeHits counts an arrow only where it points at a cell a factory fills;
    // battle.ts:808-818). Two rows of the 225 px band (289 px): no true one-row form keeps FASTER, the word its tap note hangs on
    // (glossary.ts TAP_NOTES stoker), and names the arrows' target: "ITS ARROWS SPEED UP FACTORIES: UP TO 20%." is 223 px but has
    // no FASTER, "FACTORIES IT POINTS AT WORK UP TO 20% FASTER." 249 px, "FACTORIES ITS ARROWS POINT AT: UP TO 20% FASTER." 263 px
    return rules([{ text: `FACTORIES ITS ARROWS POINT AT WORK UP TO ${up} FASTER.` }], [["stoke", `${up} FASTER`]]);
  },
  platebreaker: (e) => {
    // DESIGN-Y row 26: Battle.applyHit: with FACE_SIM.breakerPlate plating on your hull it spends that much for + flat;
    // with less, nothing (the ELSE floor is gone: content.ts STAR_DIFF). Was the same line and "ELSE: +10 {DMG}."
    const spend = fmtDmg(sustNow(FACE_SIM.breakerPlate)), flat = fmtDmg(dmgNow(gt(e).breaker!.flat)); // HULL-1d: a pool unit x S(d)
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 3: it spends your own hull's SHIELD, and the Haiku reader left whose open): OF YOUR
    // {*PLATE} (battle.ts:1710-1715 applyHit: spendPlate(s, unit) off the rig's own side's plating, 1598-1605; the shield is
    // spent, not given, so MENDING LOOM's "YOUR HULL: +n" form doesn't fit). SPENDS ... OF YOUR is 227 px at ★3 (+140), past the
    // 225 px band; USES is 215 (was "SPENDS 10 {*PLATE} FOR +40 {DMG}.", 177 px)
    return rules([hit(`USES ${spend} OF YOUR {*PLATE} FOR +${flat} {DMG}.`)], [["flat", `+${flat} {DMG}`]], [REMINDER.PLATE()]);
  },
  // Y2-Y6 (release Y; folded at the flip, Y7b2): its first face, from the switch's faces
  lodestone: (e) => {
    // DESIGN-Y row 15: Battle.applyHit: + each for each enemy part a STUN holds when it hits (rigs, factories, turrets, belt
    // tiles; a wrecked rig is no STUN), no floor, no cap. Was the RULES text "ADDS 10 DAMAGE, AND 10 FOR EACH ENEMY MACHINE
    // STUNNED, UP TO 60 DAMAGE." with "WRECKED MACHINES COUNT TOO; BELT TILES DON'T."
    const d = fmtDmg(dmgNow(gt(e).perStalled!.each));
    return rules([hit(`+${d} {DMG} FOR EACH {*STUN} ON THE FOE.`)], [["each", `{DMG} +${d} EACH`]]);
  },
  braceframe: (e) => {
    // DESIGN-Y row 16: Battle.braceCut: an enemy STUN on a belt tile its arrows hit lasts x brace.mul (the plated multiplier
    // and its brace of itself are gone). Was the RULES text "ENEMY STUNS ON THE BELT TILES IT HITS, AND ON ITSELF, LAST 50%
    // SHORTER." with "WHILE YOUR HULL HOLDS PLATING THEY LAST 75% SHORTER."
    const cut = fmtPct(1 - gt(e).brace!.mul);
    // CARD-4 (REQ-BFG-081, T; READ-4 3, 11 item 6: ITS TILES left open, the one card under 2 of 3 in round A): the FULL
    // RULE's words, TILES IT HITS (Battle.braceCut: an enemy STUN on a belt tile its arrows hit), in one 5x7 line on every
    // phone panel: FOE, the game's other word for the enemy (ENEMY ... ON TILES IT HITS took 229 px, past the band's 225;
    // ON THE BELT TILES IT HITS 255)
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 4, round T: two readers applied it to the parts on the tiles it hits, turrets and
    // factories included): BELT tiles. battle.ts:765-769 remembers a brace only on the belt tiles it hits (routes[..].braces) and
    // 2277-2296 braceCut shortens a STUN only where bracesAt(s, t) finds one, which is t.kind "belt" alone. FOE ... BELT TILES IT
    // HITS is 245 px, past the 225 px band; FOE leaves (a brace is yours, so the stuns it cuts are the foe's) and the line is 223
    // (was "FOE {*STUN} ON TILES IT HITS: 50% SHORTER.", 217 px)
    return rules([{ text: `{*STUN} ON BELT TILES IT HITS: ${cut} SHORTER.` }], [["cut", `${cut} SHORTER`]]);
  },
  pincer: (e) => {
    // DESIGN-Y row 20: Battle.applyHit: + each for each other working rig on its tile (crossfire: a STUNned rig stops, so it
    // doesn't count), no floor, no cap (content.ts STAR_DIFF). Was the RULES text "ADDS 10 DAMAGE TO EACH PAYLOAD IT HITS,
    // AND 20 MORE FOR EACH OTHER RIG HITTING THAT TILE." with "STUNNED AND WRECKED RIGS DON'T COUNT."
    const d = fmtDmg(dmgNow(gt(e).pincer!.each));
    // WORDS-1 (REQ-BFG-081): READ-1 6.1's one-off (ITS TILE) has no plain form inside the op band's one line (225 px at ★3
    // now; "ON THE SAME TILE" is 253), so the line stays (a known gap of WORDS-1's REPORT)
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.1 rank 3: ITS TILE, whose): each other working rig hitting the same slug (its tile's
    // rigs), 221 px at ★3 (READ-2's "... HITTING THAT TILE." is 233, past the op band's one line; was "... ON ITS TILE.")
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 1c: "IT" was left between the slug and the rig): the tile, as the rule counts it
    // (battle.ts:1350-1357 crossfire: the other working rigs in the hit's own tile list, s.routes[h.route].gateAt[h.tile];
    // applied at 1705). "... HITTING THAT TILE." is 261 px, past the 225 px band; "... ON THE TILE." is 225 at ★3 (was
    // "... HITTING IT.", 221 px)
    return rules([hit(`+${d} {DMG} FOR EACH OTHER RIG ON THE TILE.`)], [["each", `+${d} {DMG} EACH`]]);
  },
  twingauge: (e) => {
    // DESIGN-Y row 21: Battle.applyHit: + matched on a matched belt (MATCHED: its glossary tap), nothing off one. Was the
    // RULES text "ADDS 10 DAMAGE TO EACH PAYLOAD IT HITS, OR 30 DAMAGE ON A MATCHED BELT." with MATCHED's definition
    const d = fmtDmg(dmgNow(gt(e).gauge!.matched));
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D 3 of 3 right; the call: reworded, not a MATCHED tap): deck.ts:384 a belt is
    // matched when another belt into the same turret has as many tiles (1450-1452) (was "... ON A MATCHED BELT.")
    return rules([hit(`+${d} {DMG} IF ANOTHER BELT INTO ITS TURRET IS AS LONG.`)], [["matched", `+${d} {DMG}`]]);
  },
  bellows: (e) => {
    // DESIGN-Y row 22: Battle.applyHit: + burn BURN for each whole `per` s the slug has ridden, no cap. Was the RULES text
    // "ADDS 4 BURN FOR EACH 10 SECONDS THE PAYLOAD HAS RIDDEN, UP TO 4 BURN." with BURN's definition
    const br = gt(e).burnPerRide!, n = fmtCount(br.burn);
    return rules([hit(`+${n} {*BURN} FOR EACH ${fmtSec(br.per)}{SEC} RIDDEN.`)], [["burn", `+${n} {*BURN}`]], [REMINDER.BURN()]);
  },
  quench: (e) => {
    if (gt(e).reads) return readerFace(e); // SCALE-2c (REQ-BFG-098): KINDLING, SCALE_RIGS on (scale.ts SCALE_DEFS)
    // DESIGN-Y row 23: Battle.applyHit: every BURN stack on the slug turns into perBurn damage (no floor, no stack cap). Was
    // the RULES text "ADDS 10 DAMAGE TO EACH PAYLOAD IT HITS, THEN TURNS UP TO 4 OF ITS BURN INTO 30 MORE DAMAGE EACH." with
    // "ANY MORE BURN STAYS ON THE PAYLOAD." and BURN's definition
    const d = fmtDmg(dmgNow(gt(e).quench!.perBurn));
    // SHOPCARD-1c (REQ-BFG-081; READ-10 G10, optional: round A's Haiku left "whose BURN" open, UNCLEAR "I assume the target's"): the BURN
    // it turns is the slug's it hits (battle.ts applyHit: every BURN stack the slug carries turns into perBurn damage on that slug),
    // so ON A {SLUG}. One row at every star on days 1, 5 and 10 (219 px at 3 digits; "ON THE {SLUG}" is 231 px there). Was
    // "HIT: TURNS EACH {*BURN} INTO +72 {DMG}." (177 px)
    // SHOPCARD-1f (REQ-BFG-081; READ-13 fix list 6: the one answer below R in READ-13 was a desk Haiku on this line, "INTO (is the burn
    // removed or kept)"): it is used up. battle.ts:1729-1734 applyHit: `spent = Math.min(p.burn, e.quench.stacks ?? Infinity)`, `p.flat +=
    // flat + spent * perBurn`, `p.burn -= spent`: the spent BURN leaves the slug (1733). content.ts:682-687 gives QUENCH TANK no `stacks`
    // at any star (flat 0, perBurn 30 / 50 / 70), so EVERY stack is spent and none is left over; at a star with `stacks` the rest would
    // stay on the slug (the line would need an UP TO), and none has it. USES UP EACH BURN ... FOR +n DMG says the burn goes and the damage
    // comes (217 px, 223 at 3 digits: one row at every star on days 1, 5 and 10). H3 (mcheck/RESULTS.md): form 1 `HIT: SWAPS EACH {*BURN}
    // ON A {SLUG} FOR +72 {DMG}.` (207 px) left `whether the burn is lost for good` in 1 of 6 (T Sonnet); this form left none in A and one T
    // Opus question about the foe's burn damage that already takes the burn as used up (the grader counted it, the rule's text does not: 0 of
    // 6 by the rule, 1 of 6 by the grader). Other forms measured (px, 2 digits): "... SPENDS EACH ... FOR" 213, "... TRADES EACH ... FOR" 213,
    // "... TURNS EACH ... INTO +72 {DMG}, USING IT UP." 282 (two rows), "... TURNS EACH ... INTO +72 {DMG}, AND THE {*BURN} IS GONE." 338,
    // "... EACH {*BURN} ON A {SLUG} IS USED UP FOR +72 {DMG}." 233 (two rows) (was "... TURNS EACH ... INTO +72 {DMG}.", 213)
    return rules([hit(`USES UP EACH {*BURN} ON A {SLUG} FOR +${d} {DMG}.`)], [["per", `+${d} {DMG}`]], [REMINDER.BURN()]);
  },
  twinlatch: (e) => {
    // DESIGN-Y row 30: Battle.latchTick: while both its arrows hit belts it holds a slug at most `hold` s for its other belt,
    // so the two reach the gun together (a PAIR); no flat any more. The header's "n/2 ARROWS ON BELTS" shows the both-arrows
    // rule; belts into two guns have no pair to make. Was the RULES text "HOLDS EACH PAYLOAD UNTIL ITS OTHER BELT BRINGS ONE,
    // THEN LETS THEM GO SO THEY REACH THE GUN TOGETHER." and 3 more sentences (its 1 s, both arrows, +10, two guns)
    const t = fmtSec(gt(e).latch!.hold);
    // SHOPCARD-1d (REQ-BFG-081; READ-11 fix list 1: Haiku opened no note in either run and put it "beside a belt", round A P, the answer
    // the A bar turned on; the desk tooltip, which shows no notes, never said it either): the face now carries the condition, in the
    // words of its HIT note (glossary.ts TAP_NOTES.twinlatch: "ONLY WHEN BOTH ITS ARROWS POINT AT BELTS"). battle.ts:757-759 builds a
    // latch only for a TWIN LATCH with g.hits.length === 2 ("one arrow on a belt never holds"), g.hits being the arrows that land on a
    // belt tile (deck.ts:373-398 rigHits); a latch also needs to be online, not stalled, frozen or wrecked (battle.ts:1360 latchWorks,
    // as every rig does). One rule, two rows of the 225 px band (415 px; the hold sentence is 211 px and the new one 199 px, so the
    // panel wraps between them); the hold and the PAIR stay. Was "HIT: HOLDS A {SLUG} UP TO 1{SEC} TO MAKE A {*PAIR}." (211 px, one
    // row). Forms tried (px): as a block of its own "BOTH ITS ARROWS MUST POINT AT BELTS." 199 (two blocks, a gap between), "ONLY WHEN
    // BOTH ITS ARROWS POINT AT BELTS." 227 (a row of its own and one word over), "HIT: WITH BOTH ARROWS ON BELTS, HOLDS A {SLUG} UP TO
    // 1{SEC} TO MAKE A {*PAIR}." 360 (two rows), "HIT: IF BOTH ITS ARROWS POINT AT BELTS, HOLDS ..." 404 (two rows), "..., ONLY WHEN BOTH ITS
    // ARROWS POINT AT BELTS." 444 (three rows)
    return rules([hit(`HOLDS A {SLUG} UP TO ${t}{SEC} TO MAKE A {*PAIR}. BOTH ITS ARROWS MUST POINT AT BELTS.`)], [["hold", `UP TO ${t}{SEC}`]], [REMINDER.PAIR()]);
  },
  counterweight: (e) => {
    // DESIGN-Y row 41: Battle.applyHit: + each for each tile the slug has ridden on its journey, no cap (content.ts
    // STAR_DIFF). Was the RULES text "ADDS 5 DAMAGE FOR EACH BELT TILE THE PAYLOAD HAS RIDDEN, UP TO 60 DAMAGE."
    const d = fmtDmg(dmgNow(gt(e).perTile!.each));
    return rules([hit(`+${d} {DMG} FOR EACH TILE RIDDEN.`)], [["each", `+${d} {DMG} EACH`]]);
  },
  shieldwall: (e) => {
    if (gt(e).reads) return readerFace(e); // SCALE-2c (REQ-BFG-098): IRON WALL's reader line, SCALE_RIGS on
    // Y7b1 (release Y; ruling Y7A-R3d): its STAR_DIFF row is deleted, so with the switch on it reads its base def, 0.9.2's
    // rule: Battle.applyHit: addPlate(plate) for each slug it hits, then + plated.flat while your hull holds plated.min PLATE
    // or more (120+, as FURNACE's "8+ TILE BELTS"), both parts on one line (208 px at ★3), each on its own ⓘ ladder. Was
    // Y5's "HIT: +30 {DMG} AT 120 {*PLATE} OR MORE." (DESIGN-Y row 45: its own plating gone). Off it has no face (the RULES
    // text: "ROLLS 10 PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS." with the 120 sentence and PLATING's definition)
    const pl = gt(e).plated!, d = fmtDmg(dmgNow(pl.flat)), plate = fmtDmg(sustNow(gt(e).plate!)); // HULL-1d: D, S (its 120+ too)
    return rules([hit(`+${plate} {*PLATE}, +${d} {DMG} AT ${fmtDmg(sustNow(pl.min))}+ {*PLATE}.`)], [["plate", `+${plate} {*PLATE}`], ["flat", `+${d} {DMG}`]],
      [REMINDER.PLATE()]);
  },
  keg: (e) => {
    if (gt(e).reads) return readerFace(e); // SCALE-2c (REQ-BFG-098): POWDER KEG's reader line (its own hits), SCALE_RIGS on
    // DESIGN-Y row 46: Battle.kegTick: its fuse runs from the battle's start (a STUN or a wreck pauses it); each keg.fuse s it
    // blasts + flat onto every slug on its belts (beltPulse, SURGE VALVE's walk) and re-arms; its BURN and ★3 WIDE BLAST's
    // reach are gone (content.ts STAR_DIFF). Was the RULES text "ADDS 60 DAMAGE AND 1 BURN TO EVERY PAYLOAD ON ITS BELTS WHEN
    // IT BLOWS UP." with "IT BLOWS ONCE, 12 SECONDS AFTER IT COMES ONLINE; A STUN PAUSES THE FUSE." and BURN's definition
    const k = gt(e).keg!, every = fmtSec(k.fuse), d = fmtDmg(dmgNow(k.flat));
    const label = `EVERY ${every}{SEC}:`;
    // WORDS-1 (REQ-BFG-081; READ-1 6.1's POWDER KEG: ITS BELTS): battle.ts:1146 blasts every slug anywhere on each belt its
    // arrows hit, the whole belt, so READ-1's "THE BELT TILES ITS ARROWS POINT AT" would say less than the sim. The line stays
    // (one line of the op band, 209 px) and its EVERY label's tap says the whole belt, as SURGE VALVE's does (glossary.ts
    // TAP_NOTES keg)
    return rules([{ text: `${label} +${d} {DMG} TO SLUGS ON ${itsBelts(e)}.`, label }], [["every", `EVERY ${every}{SEC}`], ["flat", `+${d} {DMG}`]]);
  },
  venom: (e) => {
    // SCALE-2b (REQ-BFG-108; READ-3 E10, PLAIN-1's plain face): with SCALE_RIGS on its def holds POISON (sim/scale.ts
    // SCALE_DEFS): a plain stat rig, POISON +1/+2/+3 a slug it hits (Battle.applyHit), landing at impact. EMBER TROUGH's
    // form: the rule keeps LEVELS, NEXT★ and the chip; PLAIN_RIGS' path draws it as a stat row (plainRigStats); its
    // reminder is POISON's (the NOTES, after the rig sentence)
    if (gt(e).poison !== undefined) {
      const n = fmtCount(gt(e).poison!);
      return rules([hit(`+${n} {*POISON}.`)], [["poison", `+${n} {*POISON}`]], [REMINDER.POISON()]);
    }
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
    // WORDS-1 (REQ-BFG-081; READ-1 6.1's one-offs: BARE HULL): battle.ts:1996, 444-446 a pick of no part; 1991 picked again
    // (was "SHOTS AT BARE HULL GET 1 MORE AIM."); 213 px at ★3, one line of the op band
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.1 rank 2: AIM): AIM AGAIN, as READ-2's words (battle.ts pickTarget: a pick of no
    // part is picked again, up to rerolls times): ONCE, TWICE, 3 TIMES (209 / 215 / 225 px; was "... GET 1 MORE AIM."). The
    // number's key keeps its words (the ⓘ ladder's and NEXT★'s "1/2/3 MORE AIMS", and the phone chip's AIM+n read it)
    const again = r === 1 ? "ONCE" : r === 2 ? "TWICE" : `${n} TIMES`;
    return rules([{ text: `SHOTS AIMED AT NO PART AIM AGAIN ${again}.` }], [["rerolls", `${n} MORE AIM${s(r)}`]]);
  },
  escapement: (e) => {
    const up = fmtPct(md(e).fireRate! / 100); // METRONOME's pendulum line: not playable (R1 dropped it); NUM-2: stored
    return rules([{ text: `FIRES ${up} FASTER.` }], [["rate", `${up} FASTER`]]);
  },
  spallcatcher: (e) => {
    if (md(e).reads) return readerFace(e); // SCALE-2c (REQ-BFG-098): SPALL CATCHER's reader line (hits taken, at the SHOT)
    // DESIGN-Y row 47: Battle.spallCharge: + add for every `every` damage your ship takes (a PLATE soak counted once, not
    // twice), on this turret's next shot, no cap. Today's line; its cap's number (NEXT★'s MAX) and its caveat go
    const sp = md(e).spall!, every = fmtDmg(sp.every), add = fmtDmg(dmgNow(sp.add)); // HULL-1d: add x D(d); every counts landed damage
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
    // WORDS-1 (REQ-BFG-081): READ-1 6.1's one-off (LAST 1 TILE: battle.ts:808-809, the last tiles of each belt into its gun)
    // has no plain form inside the op band's one line (279 px and more), so the line stays (a known gap of WORDS-1's REPORT)
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 7: "LAST 1 TILE" was read as a stun's length): which tile, and that the {*STUN} is what is
    // ignored, not a length. battle.ts:852-853 flags the last `intakeGuard` cells of each connected route into the turret
    // (GUARD_SKIRT), and 2402-2405 skirted() makes them ignore what the gun ignores (2260 the gun itself). LAST BELT TILE is the
    // belt's end by the gun; "{*STUN} CAN'T STOP ITS GUN OR LAST BELT TILE." is 233 px and "... THE LAST TILE OF EACH BELT INTO
    // IT." 330, past the 225 px band; this is 221 at ★1 and 218 at ★2/★3 (was "{*STUN} CAN'T STOP ITS GUN OR LAST 1 TILE.", 215 px)
    const last = n === 1 ? "LAST BELT TILE" : `LAST ${fmtCount(n)} BELT TILES`;
    return rules([{ text: `ITS GUN${n === 1 ? " AND" : ","} ${last} IGNORE {*STUN}.` }], [["guard", `LAST ${tiles}`]]);
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
    const d = fmtDmg(sustNow(md(e).seam!.pair)), label = "{*PAIR}:";
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 3): "YOUR HULL:", MENDING LOOM's form (battle.ts:1629 loaded() and 1649 fusionPair:
    // this.addPlate(s, tu.seam.pair), the side's own plating)
    return rules([{ text: `${label} YOUR HULL: +${d} {*PLATE}.`, label }], [["plate", `+${d} {*PLATE}`]], [REMINDER.PAIR(), REMINDER.PLATE()]);
  },
  longcase: (e) => {
    // DESIGN-Y row 43: Battle.fire / fireCore: a shot from a slug that rode longRideMin s or more deals + longRideFlat (no
    // sim change). The METRONOME sentence leaves the face: a pendulum slug is an unplayable hero's, and races/data.ts
    // PEAK_SHIFT stays for METRONOME's bots. Was the RULES text "SHOTS FROM PAYLOADS THAT RODE 2 SECONDS OR MORE DEAL 15 MORE
    // DAMAGE." with "PENDULUM SLUGS DON'T GET IT; ON METRONOME THEY PEAK LATER ON THIS TURRET, AFTER 13 TILES."
    const d = fmtDmg(dmgNow(md(e).longRideFlat!)), t = fmtSec(md(e).longRideMin!);
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
    const r = fmtDmg(sustNow(md(e).regen!)); // HULL-1d: x S(d)
    // WORDS-1 (REQ-BFG-081; READ-1 6.2: REGEN merged into HEAL): battle.ts:1441-1454 each whole second the LOOMs' amount goes
    // through heal() (1402-1413: HEAL's rules), so it is a HEAL each second (was "YOUR HULL: {*REGEN} 5.")
    return rules([{ text: `YOUR HULL: {*HEAL} ${r} EACH SEC.` }], [["regen", `{*HEAL} ${r}`]], [REMINDER.HEAL()]);
  },
  // ------------------------------------------------------------------------------------------ U2b: the supplies
  // U2c group 0 fix 2: {BELT} means belts, a count (a factory's {BELT}3); belt capacity is tiles, in words (hero select's
  // "BELT 24 TILES")
  beltcrate: (e) => rules([{ text: `+${fmtCount(e.supply!.belt!)} BELT TILES FOR THE RUN.` }]),
  // HULL-1a (REQ-BFG-079): the day's number with HULL_SCALE on (x.day: the run's day); off, the pack's own
  // PRESENT-1 (REQ-BFG-081; REVIEW-SC0912B item 3): HULL in words, never the heart (families.ts:78-80; was "+250 {HULL} FOR THE RUN.")
  plating: (e, x) => rules([{ text: `+${fmtDmg(hullShown(e.supply!.hull!, x.day))} HULL FOR THE RUN.` }]),
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
  // WORDS-1 (REQ-BFG-081; READ-1 6.1): the whole rule, so it can't be read as "fits only an inner slot" (READ-1 T-04, T-05:
  // 8 misses). Battle.makeTurret / deck.ts: such a gun takes a belt into its inner column only; it fits any turret slot
  // (was "INNER COLUMN ONLY.")
  { id: "inner", until: "the board cues job: the turret's intake marks", applies: (e) => e.turret?.intake === "inner", text: () => "TAKES A BELT ON ITS INNER COLUMN ONLY." },
];


/** The turrets: a stat row and no rules text (R1 C3: a turret carries no rules text). */
const TURRET_FACE = (): Rules => rules([]);

/**
 * WORDS-1 (REQ-BFG-081; TEXT-STYLE 1.4 as ruled 2026-10-10; READ-1 6.1, round D: turrets 11 of 39 answers right, then 39 of
 * 39): a turret's two plain lines under its stat row, what its {SLUG} and {GEAR} numbers mean, from the same data as the
 * row (turretStats: TurretSpec.window, deck.ts gearSlotsOf). They describe the turret without a core (cores.ts IDENTITY:
 * one load a shot until the chamber is empty, then the reload); a core's own line says what it changes.
 */
export function turretPlain(def: string, stars = 1): string[] {
  return turretPlainOf(effectAt(def, stars).turret!.window, gearSlotsOf(def, stars));
}

/** EXPLAIN-1 (REQ-BFG-089, E4): the two plain lines for a chamber of `n` loads and `g` gear slots, the same words as
 *  turretPlain: an installed turret's ⓘ NOTES reads them at its own stat row's numbers (its window and its slot's gear
 *  slots), as turretPlain reads a card's. */
export function turretPlainOf(n: number, g: number): string[] {
  return [`HOLDS ${fmtCount(n)} {SLUG}: FIRES THEM ONE A SHOT, THEN RELOADS.`, `${fmtCount(g)} {GEAR} SLOT${s(g)} FOR TURRET GEAR.`];
}

// ------------------------------------------------------- EXPLAIN-1 (REQ-BFG-084 step 0b): three plain stat rigs

/**
 * EXPLAIN-1 (REQ-BFG-084 step 0b; PIECES-1 3.3 and 3.5): the three rigs whose one line was a bare hit stat ("HIT: +20
 * {DMG}.") draw a plain face: that stat as a stat row ({DMG}+20), no rule line. Face data only, on the panel's face
 * (screens/build/faceBlocks.ts): faceAt keeps their rule and numbers, so their LEVELS, NEXT★, phone chip, desk card and
 * tooltip are as before. HEAT JACKET (its desk card's condition), PLATE ROLLER and RIVETER (their stat goes to the ship)
 * keep their HIT: line. An explicit list, so no other rig moves.
 */
export const PLAIN_RIGS: readonly string[] = ["whetstone", "temper", "barbed"];

/** A plain rig's stat row's pairs at `stars`, from the sim's star data through the formatters faceAt's rule uses (gate
 *  flat, burn, fray); null for every other piece. MERGE-099C (HULL-1d, REQ-BFG-079): on `day`, the read-out's (the run's),
 *  as faceAt's rule line reads it: WHETSTONE's + DAMAGE x D(d) (dayShown.ts dmgNow); BURN and FRAY are counts, unscaled.
 *  No day, or HULL_SCALE off: day 1's, as before. */
export function plainRigStats(def: string, stars = 1, day?: number): Stat[] | null {
  if (shapesRules() && SHAPED_PLAIN_RIGS.includes(def)) return shapedPlainStats(def, stars, day); // SHAPES-1 (REQ-BFG-084)
  if ((isPlainSix(def) || isShapes2Piece(def)) && Object.prototype.hasOwnProperty.call(ITEMS, def)) return sixStats(def, stars, day); // PLAIN-1 (PLAIN_RIGS on); SHAPES-2 (SHAPES2 on): the six more's rows read the same way (slugPlate, flat, burn, stun)
  // SCALE-2b (REQ-BFG-108): VENOM DRIP with SCALE_RIGS on, its POISON count (unscaled, as BURN's and FRAY's)
  if (scaleRules() && SCALE_PLAIN_RIGS.includes(def)) return [["POISON", `+${fmtCount(effectAt(def, stars).gate!.poison!)}`]];
  if (!PLAIN_RIGS.includes(def)) return null;
  const g = effectAt(def, stars).gate!;
  if (def === "whetstone") return [["DMG", `+${fmtDmg(shownOn(day, () => dmgNow(g.flat!)))}`]];
  if (def === "temper") return [["BURN", `+${fmtCount(g.burn!)}`]];
  return [["FRAY", `+${fmtCount(g.fray!)}`]];
}

/** PIECES-1 3.5's fixed rig sentence: true of every slug-stat rig, so it is default rules text and never on a face; it
 *  leads a plain rig's ⓘ NOTES (inspector.ts explainPanel). Checked clause by clause against src/sim (REPORT section 10). */
export const RIG_SENTENCE = "EACH ARROW THAT POINTS AT A BELT TILE GIVES ITS STATS TO EVERY SLUG ON THAT TILE. ONE ARROW, ONE HIT.";

/** PLAIN-1F (REQ-BFG-084, REQ-BFG-089, M3; BRIEF-PLAIN1F M3, run 2's F8): SCALE GUARD's carry line, NOTES after the rig
 *  sentence, in CARD-3's words ({*PLATE} draws SHIELD). Checked against src/sim: battle.ts applyHit adds its slugPlate to
 *  the slug (Payload.plate, a split keeps its share); at your gun's chamber Battle.slugPlate gives it to your hull's pool
 *  by the bulwark rule (races/bastion.ts plateOnLoad: plateFor, x S(day), the pool's cap: {*PLATE}'s reminder says MAX). */
export const CARRY_LINE = "EACH SLUG IT HITS CARRIES THE {*PLATE} TO YOUR GUN. YOUR SHIP GAINS IT AS THE SLUG LOADS.";

/** PLAIN-1F (REQ-BFG-084, REQ-BFG-089, M3; BRIEF-PLAIN1F M3 BALLAST, REVIEW-PLAIN1 D4; PLAIN-1's ship line): BALLAST's
 *  NOTES line, when it works. Its stat is your ship's, never a slug's, so the rig sentence (GIVES ITS STATS TO EVERY SLUG)
 *  is not true of it and this line takes its place. Checked against src/sim: Battle.makeSide adds the working BALLASTs'
 *  % of the max hull to hull and max at the fight's start; a BALLAST works with at least one arrow on a belt tile (g.hits,
 *  the IDLE rule, read from the layout at the fight's start); else it is IDLE and gives nothing.
 *  SC-0912 (PACKET-SHOPCARD1 item 3): MAX HULL in words, not the {HULL} icon (the heart; SHOPCARD-1b's HEAL and REGEN notes say
 *  HULL in words for the same reason, READ-9 fix 5); its stat row says it too (icons.ts statRow). */
export const BALLAST_LINE = "WHILE AN ARROW POINTS AT A BELT TILE, IT RAISES YOUR SHIP'S MAX HULL. NO ARROW ON A BELT: IT IS IDLE.";

/** PLAIN-1F (M3): a plain rig whose stats ride the slugs it hits, so the rig sentence and HIT are true of it: every plain
 *  rig (isPlainRig) but a carrier stat's (BALLAST's max hull, GateEffect.maxHullPct). With PLAIN_RIGS off it is isPlainRig
 *  exactly (no base plain rig has a carrier stat). */
export function plainSlugRig(def: string): boolean {
  return isPlainRig(def) && !effectAt(def, 1).gate?.maxHullPct;
}

/** PLAIN-1F (REQ-BFG-089, M3): a plain rig's NOTES lead, default rules text behind the ⓘ, the desk hover or a tap
 *  (inspector.ts explainPanel, LAST CHANCE's partInfo): the rig sentence for a slug-stat rig (plainSlugRig), then SCALE
 *  GUARD's carry line where the rig puts {*PLATE} on the slug; BALLAST's own line in the rig sentence's place; [] for every
 *  other piece. With PLAIN_RIGS off: [RIG_SENTENCE] for a plain rig, as before (no base plain rig carries PLATE). */
export function plainNotes(def: string): string[] {
  if (!isPlainRig(def)) return [];
  const g = effectAt(def, 1).gate;
  if (g?.maxHullPct) return [BALLAST_LINE];
  return g?.slugPlate ? [RIG_SENTENCE, CARRY_LINE] : [RIG_SENTENCE];
}

// ------------------------------------------------------------ ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7): an enchanted piece's face

/** ENCHANT-1 (REQ-BFG-085; E7): an enchanted piece's NOTES, in plainNotes' and shapeNotes' form: default rules text behind the hover or the
 *  tap (inspector.ts explainPanel; enchantFaces.ts ENCHANT_NOTES: what an enchantment is, and that a new one replaces it). `word`: the
 *  word the piece holds (an ENCHANT_IDS id); [] for a piece with none, and for everything with the switch off.
 *  ENCHANT-2 (REQ-BFG-085; T4b): line 1 of a PART's NOTES is the word's own (enchantFaces.ts partNotes: it adds where the numbers above the word's
 *  line come from); a word's own CARD keeps ENCHANT_NOTES (wordFace). */
export function enchantNotes(word: string | undefined): string[] {
  return enchantRules() && isEnchantId(word) ? partNotes(word) : [];
}

/** A stat row's pair for `pair`'s icon: it replaces that icon's pair (the place kept), else it goes at the row's end. */
const withPair = (row: readonly Stat[], pair: Stat): Stat[] =>
  row.some(([k]) => k === pair[0]) ? row.map((st) => (st[0] === pair[0] ? pair : st)) : [...row, pair];

/** ENCHANT-1: a rig's stat row with its word: GROWING's grown DMG joins the row's DMG (WHETSTONE's) or ends the row, once it has grown (a hit's
 *  DMG is the rig's flat plus +5 x the dusk fights x the stars). ENCHANT-1c (C1): FIERY adds nothing here: its [BURN]+n shows once, in its line
 *  (enchantFaces.ts pieceLine), so a rig with its own BURN (TEMPER's) keeps that number in its row as it is. */
function rigWordRow(def: string, stars: number, w: WordOn, plain: Stat[]): Stat[] {
  const g = effectAt(def, stars).gate, has = (k: string): boolean => plain.some(([n]) => n === k);
  let row = plain;
  if (w.id === "growing" && w.grow > 0) row = withPair(row, ["DMG", `+${fmtDmg(dmgNow((has("DMG") ? g?.flat ?? 0 : 0) + grownDmg(w)))}`]);
  return row;
}

/** ENCHANT-1: a turret's stat row with its word's added stat at the end: GROWING's grown DMG, once it has grown (ENCHANT-1c C1: FIERY adds none,
 *  its [BURN]+n is in its line). */
function turretWordRow(row: Stat[], w: WordOn): Stat[] {
  if (w.id === "growing" && w.grow > 0) return [...row, ["DMG", `+${fmtDmg(dmgNow(grownDmg(w)))}`]];
  return row;
}

/** ENCHANT-1 (E7): an INSTALLED turret's stat row (inspector.ts turretPanel: its own numbers, the gear, the core and the TURRET SPEED level
 *  in, which already carry MASSIVE's and SWIFT's rate and WIDE's gear slot, as deck.ts resolveSlots patches them) with its word's stat at
 *  the end; `nums`: the indexes of the pairs the word changed or added, whose numbers are drawn in the word's colour. */
export function wordTurretRow(row: Stat[], w: WordOn): { row: Stat[]; nums: number[] } {
  const out = turretWordRow(row, w);
  const rate = w.id === "massive" || w.id === "swift", wide = w.id === "wide";
  return { row: out, nums: out.flatMap(([k], i) => (i >= row.length || (rate && k === "RATE") || (wide && k === "GEAR") ? [i] : [])) };
}

/** An enchanted piece's stat rows: `rows` as the word leaves them (a rig's one row, a turret's, a factory's two), `hue` for each row the
 *  indexes of its pairs the word added or changed, whose numbers are drawn in the word's colour (found by comparing the plain piece's row). */
export interface WordRows {
  rows: Stat[][];
  hue: number[][];
}

/**
 * ENCHANT-1 (REQ-BFG-085; E7): the stat rows of a piece holding the word `w`, at `stars` on `o`'s day and hero. A number the word CHANGES is
 * shown changed: MASSIVE's and SWIFT's RATE and a factory's DMG (the battle's: factoryStats, turretStats), GROWING's DMG with the grown
 * amount, WIDE's {BELT} or {GEAR} slots. ENCHANT-1c (C1): no word adds a stat of its own to a row any more (FIERY's [BURN]+n is in its line
 * only). A row the plain piece has not (a rule rig has no stat row) is made of the word's own pairs alone.
 */
export function wordRows(def: string, stars: number, o: TextOpts, w: WordOn): WordRows {
  return shownOn(o.day, () => {
    let plain: Stat[][], word: Stat[][];
    if (w.kind === "turret") {
      plain = [turretStats(def, stars)];
      word = [turretWordRow(turretStats(def, stars, w), w)];
    } else if (w.kind === "factory") {
      plain = [factoryStats(def, stars, o.hero), carryStats(def, stars, o.hero) ?? []];
      word = [factoryStats(def, stars, o.hero, w), carryStats(def, stars, o.hero) ?? []];
    } else {
      const p = plainRigStats(def, stars, o.day) ?? [];
      plain = [p];
      word = [rigWordRow(def, stars, w, p)];
    }
    const same = (r: number, i: number, st: Stat): boolean => !!plain[r][i] && plain[r][i][0] === st[0] && plain[r][i][1] === st[1];
    return { rows: word, hue: word.map((row, r) => row.flatMap((st, i) => (same(r, i, st) ? [] : [i]))) };
  });
}

/** PLAIN-1F (REQ-BFG-089, M3; cap's call on run 2's F5): the desk's wide shop card's effect line (chrome.ts drawCaravan):
 *  abilityText's cardText, else a plain rig's stat row at ★1 on the run's day (plainRigStats, in glyphs), so a plain rig
 *  with no kept text (the six) draws the wide face with its own numbers, not the narrow face inside the wide card (shop.ts
 *  drawCard's `wide` needs an effect), and no empty rule block. Every piece with a cardText line keeps it byte for byte. */
export function cardEffect(def: string, o: TextOpts = {}): string {
  const t = cardText(def, o);
  if (t) return t;
  const plain = plainRigStats(def, 1, o.day);
  if (plain) return statRow(plain);
  // BUMP-1F (RULING-BUMP1F-R11 R11.3; GATES-1's converters, REQ-BFG-052, REQ-BFG-115): a gate (FUSER, SCATTER MILL, SMELTER) has no cardText and no plain stat row, so the tap panel's one-line effect on the 360x640 strip
  // (inspector.ts, headerOnly) had none; its effect line is its own star-1 face stat row (faceLines(def, 1): statRow of the face's stats), as the plain rigs' is. No number, rule or sim code changes
  if (isConverterItem({ def })) return faceLines(def, 1, o)?.stats ?? "";
  return "";
}

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



/** PLAIN-1F (REQ-BFG-089, M3; cap's call on run 2's F7): a plain six's reminders at the star shown, one for each keyword
 *  its stat row holds at that star (sixStats' order: {*PLATE}, {*BURN}, {*STUN} with its own seconds), so a star without
 *  the keyword shows no reminder for it: BRANDING IRON's ★1 (DMG only, FIRSTDAY-1 F7) has none, on every surface that reads
 *  a face's reminders (LAST CHANCE's info box, a word's tap or hover box: glossary.ts glossaryText). Was a fixed list a
 *  rig (BRANDING IRON's BURN at every star). */
const sixReminders = (e: ItemDef): Rules => {
  const g = gt(e);
  return rules([], [], [...(g.slugPlate ? [REMINDER.PLATE()] : []), ...(g.burn ? [REMINDER.BURN()] : []), ...(g.stun ? [REMINDER.STUN(g.stun)] : [])]);
};

/** PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1 P4): the six plain stat rigs' faces. A face is the stat row (plainRigStats, through
 *  rigStats) and no rule line; the ⓘ view's ladder reads the row's numbers, and each keyword keeps its reminder.
 *  Kept apart from FACES so FACE_IDS (the base's faced pieces, which its tests walk) stays the base's; hasFace and faceOn
 *  read it only for a plain rig in ITEMS (PLAIN_RIGS on). PLAIN-1F (M3): the final faces, on EXPLAIN-1's layer: the
 *  reminders follow the star (sixReminders), the NOTES lead is plainNotes. */
const PLAIN_FACES: Record<string, (e: ItemDef, x: X) => Rules> = {
  // the numbers are the stat row's (rigStats), which the ⓘ ladder, NEXT★ and the shop chip read: no rule, so no nums
  rasp: sixReminders,
  sparkgap: sixReminders,
  scaleguard: sixReminders,
  ballast: sixReminders,
  grindstone: sixReminders,
  brandingiron: sixReminders,
  // SHAPES-2 (REQ-BFG-114): the six more shaped plain rigs, the same face: the stat row, and a reminder for each keyword it holds
  elbowguard: sixReminders,
  sawbar: sixReminders,
  sparkcomb: sixReminders,
  cinderhook: sixReminders,
  jawcrusher: sixReminders,
  pickaxe: sixReminders,
};

// ------------------------------------------------- GATES-1 (REQ-BFG-052, REQ-BFG-089, REQ-BFG-087): the three gates

/** A gate's numbers (the face reads the spec at its stars). */
const cvs = (e: ItemDef) => e.converter!;

/** A gate's stat row (PIECES-1 6.3; the mock ref/pieces1/cards-phone.png card 5): slugs in and out `{SLUG}2>1`, what it adds
 *  `{DMG}+50%` (FUSER) or `{BURN}+2` (SMELTER, in place of the slugs), and the time it costs `1{SEC}`. */
export function converterStats(def: string, stars = 1): Stat[] {
  const c = effectAt(def, stars).converter;
  if (!c) throw new Error(`converterStats: ${def} is not a gate`);
  const secs: Stat = ["SEC", fmtSec(c.secs)];
  if (c.how === "smelt") return [["BURN", `+${fmtCount(c.burn ?? 0)}`], secs];
  const io: Stat = ["SLUG", `${fmtCount(c.in)}>${fmtCount(c.out)}`];
  return c.how === "fuse" ? [io, ["DMG", `+${fmtPct((c.bonus ?? 0) / 100)}`], secs] : [io, secs];
}

/**
 * The gates' own lines, always on the face (REQ-BFG-089: a per-piece ability stays visible; PIECES-1 6.3's plainer words):
 * FUSER `2 SLUGS IN, 1 OUT: IT DEALS BOTH, +50%.`, SCATTER MILL `1 SLUG IN, 3 OUT, EACH AT HALF {DMG}.` (the share's whole % when
 * it isn't half: ★2), SMELTER `THE {SLUG} GAINS +2 {*BURN}.` with BURN's reminder. The numbers are the stat row's too, keyed so
 * two stars' faces diff (NEXT★, the ⓘ ladder). The general rule (A GATE: ...) is gateNotes, behind the hover or tap.
 */
const CONVERTER_FACES: Record<string, (e: ItemDef, x: X) => Rules> = {
  fuser: (e) => {
    // its number is the stat row's {DMG}+50% too, so the rule keys none (NEXT★ and the ⓘ ladder read the row once)
    return rules([{ text: `${fmtCount(cvs(e).in)} SLUGS IN, ${fmtCount(cvs(e).out)} OUT: IT DEALS BOTH, +${fmtPct(cvs(e).bonus! / 100)}.` }]);
  },
  scattermill: (e) => rules(
    [{ text: `${fmtCount(cvs(e).in)} SLUG IN, ${fmtCount(cvs(e).out)} OUT, EACH AT ${shareWord(cvs(e).share!)} {DMG}.` }],
    [["share", fmtPct(cvs(e).share! / 100)]], // the pellets are the stat row's {SLUG}1>3; the share is only the rule's
  ),
  smelter: (e) => {
    const n = fmtCount(cvs(e).burn!);
    return rules([{ text: `THE {SLUG} GAINS +${n} {*BURN}.` }], [], [REMINDER.BURN()]); // its number is the stat row's {BURN}+2 too
  },
};

/** GATES-1 (REQ-BFG-089, REQ-BFG-087; PIECES-1 6.3): the gate rule, default rules text behind the hover or tap (EXPLAIN-1's NOTES lead). */
export const GATE_RULE = "A GATE: DROP IT ON A BELT. THE BELT SPLITS AROUND IT.";
/** GATES-1b (BRIEF-GATES1B B4; the cold read's readers all asked what the outlined tiles are while a gate is carried): the carried gate
 *  outlines the tiles after it, in its rarity colour (cues.ts drawSplitGhost). NOTES only: behind the hover or tap (REQ-BFG-089). */
export const GATE_OUTLINE = "THE OUTLINED TILES ARE THE BELT AFTER THE GATE.";
/** GATES-1: what a conversion costs, in the gate's seconds. */
export const gateWait = (secs: number): string => `EACH SLUG WAITS ${fmtSec(secs)} SEC INSIDE IT.`;
/** GATES-1: the FUSER's placement puzzle (the fused slug rides on as two: convert.ts fusePayload). */
export const FUSER_ORDER = "RIGS BEFORE IT COUNT TWICE. RIGS AFTER IT COUNT ONCE.";

/** GATES-1: a gate's NOTES sentences (the gate rule, GATES-1b's outlined tiles, the wait, and for the FUSER its order); [] for every
 *  other piece and with GATES off (no gate exists). */
export function gateNotes(def: string): string[] {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d || d.kind !== "converter" || !d.converter) return [];
  return [GATE_RULE, GATE_OUTLINE, gateWait(d.converter.secs), ...(d.converter.how === "fuse" ? [FUSER_ORDER] : [])];
}

/** The pieces with a new face, in redesign.json's groups' order (tests and tools). */
export const FACE_IDS: readonly string[] = [
  ...Object.keys(FACES),
  ...Object.values(ITEMS).filter((d) => d.kind === "turret").map((d) => d.id),
];

/** True for a piece that draws its new face (every other piece keeps today's text). SHAPES-1: the three shaped plain
 *  rigs too, with SHAPES on (SHAPE_FACES). */
export function hasFace(def: string): boolean {
  // PLAIN-1 (REQ-BFG-084): a plain stat rig of the six has its face while it is in ITEMS (PLAIN_RIGS on)
  return FACE_IDS.includes(def) || (shapesRules() && Object.prototype.hasOwnProperty.call(SHAPE_FACES, def))
    || ((isPlainSix(def) || isShapes2Piece(def) || isGatesPiece(def)) && Object.prototype.hasOwnProperty.call(ITEMS, def)) // SHAPES-2: the six more while in ITEMS (SHAPES2 on); GATES-1: and the three gates (GATES on) (BUMP-1F: both sides' ORs)
    || (scaleRules() && Object.prototype.hasOwnProperty.call(SCALE_FACES, def)); // SCALE-2c: the seven new readers, switch on
}

// ------------------------------------------------- SHAPES-1 (REQ-BFG-086, REQ-BFG-084, REQ-BFG-089): the shaped pieces

/**
 * SHAPES-1 (REQ-BFG-084; BRIEF-SHAPES1 R4, S8): the three shaped plain stat rigs' faces, WHETSTONE's and TEMPER's (a hit
 * stat that PLAIN_RIGS' path draws as a stat row, no HIT: line; faceAt keeps the rule, so LEVELS, NEXT★ and the chip read
 * it). Apart from FACES, so FACE_IDS (the tests' and tools' list) stays 0.9.9's, and no reader meets an id that isn't in
 * ITEMS with SHAPES off; hasFace sees them only with SHAPES on (src/sim/shapes.ts).
 */
const SHAPE_FACES: Record<string, (e: ItemDef, x: X) => Rules> = {
  nailstrip: (e) => {
    const d = fmtDmg(dmgNow(gt(e).flat!));
    return rules([hit(`+${d} {DMG}.`)], [["flat", `+${d} {DMG}`]]);
  },
  embertrough: (e) => {
    const n = fmtCount(gt(e).burn!);
    return rules([hit(`+${n} {*BURN}.`)], [["burn", `+${n} {*BURN}`]], [REMINDER.BURN()]);
  },
  spikerail: (e) => {
    const d = fmtDmg(dmgNow(gt(e).flat!));
    return rules([hit(`+${d} {DMG}.`)], [["flat", `+${d} {DMG}`]]);
  },
};

/** SHAPES-1 (REQ-BFG-084): the shaped plain stat rigs (with SHAPES on, plainRigStats draws them as PLAIN_RIGS' are; that
 *  list stays 0.9.9's three, tests/explain1 pins it). */
export const SHAPED_PLAIN_RIGS: readonly string[] = ["nailstrip", "embertrough", "spikerail"];

/** SHAPES-1: a plain stat rig, the base's three or (SHAPES on) a shaped one: its face is a stat row and its NOTES lead
 *  with the rig sentence (inspector.ts explainPanel, keywords.ts). PLAIN-1F (M1, the isPlainRig fold): and PLAIN-1's six
 *  while they are in ITEMS (PLAIN_RIGS on; src/sim/plainRigs.ts isPlainRig, imported here as isPlainSix). */
export function isPlainRig(def: string): boolean {
  return PLAIN_RIGS.includes(def) || (shapesRules() && SHAPED_PLAIN_RIGS.includes(def))
    || ((isPlainSix(def) || isShapes2Piece(def)) && Object.prototype.hasOwnProperty.call(ITEMS, def)) // SHAPES-2 (REQ-BFG-114): and the six more (SHAPES2 on)
    || (scaleRules() && SCALE_PLAIN_RIGS.includes(def)); // SCALE-2b (REQ-BFG-108): VENOM DRIP's POISON row, switch on
}

/** SCALE-2b (REQ-BFG-108; BRIEF-SCALE2b section 3): the rigs that are plain stat rigs only while SCALE_RIGS is on: VENOM
 *  DRIP, a POISON stat row (sim/scale.ts SCALE_DEFS). Off, it keeps its Y6 face (ITS BURN LASTS +3s), exactly. */
export const SCALE_PLAIN_RIGS: readonly string[] = ["venom"];

/** SHAPES-1: a shaped plain rig's stat row at `stars`: NAIL STRIP's and SPIKE RAIL's DMG on `day` (WHETSTONE's rule),
 *  EMBER TROUGH's BURN count (TEMPER's). */
function shapedPlainStats(def: string, stars: number, day?: number): Stat[] {
  const g = effectAt(def, stars).gate!;
  if (g.burn) return [["BURN", `+${fmtCount(g.burn)}`]];
  return [["DMG", `+${fmtDmg(shownOn(day, () => dmgNow(g.flat!)))}`]];
}

/** SHAPES-1: a shaped deck piece (a rig of 2+ cells, a factory not 2x2): foot.ts isShaped for a rig or a factory only (a
 *  size-2 turret's foot reads 2x2, which isShaped counts as a shape: never one here). */
function deckShaped(d: ItemDef): boolean {
  return (d.kind === "gate" || d.kind === "factory") && isShaped(d);
}

/** SHAPES-1 (R2): the most hits a rig's shape can make: each arrow direction from every outside edge of its cells, one hit
 *  each (rigArrowCells at rot 0): NAIL STRIP and EMBER TROUGH 2, SPIKE RAIL 6. */
export function shapeMaxHits(def: string): number {
  return rigArrowCells(def, 0, 0, 0).length;
}

/**
 * SHAPES-1 (REQ-BFG-086.1, REQ-BFG-089; BRIEF-SHAPES1 S8; the mock ref/pieces1/cards-phone.png): a shaped piece's own
 * lines, always on its face: a long rig's `HITS EACH SLUG UP TO 2 TIMES.` (SHOPCARD-1b; was `UP TO 2 HITS`); a factory that its size gives belt slots (GANTRY PRESS's 2x3)
 * `FEEDS 4 BELTS IN TURN.` (its slots at `stars`) and `BIGGER: +1 {BELT}` (foot.ts footSlots). [] for every other piece,
 * so nothing else changes, and for everything with SHAPES off (no shaped piece exists).
 */
export function shapeLines(def: string, stars = 1): FaceRule[] {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d || !shapesRules() || !deckShaped(d)) return [];
  // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 1: "UP TO 2 HITS" was read as a total cap, and a hit as "an arrow or a slug"): the cap is
  // per slug. A slug that crosses a belt tile's centre takes one hit from each of the rig's arrows pointing at that tile
  // (battle.ts:1295-1301, 1661-1669), and a tile's centre is crossed once, so one slug takes at most one hit an arrow
  if (d.kind === "gate") return [{ text: `HITS EACH SLUG UP TO ${fmtCount(shapeMaxHits(def))} TIMES.` }];
  const more = footSlots(d);
  if (d.kind !== "factory" || !more) return [];
  // the markup drawn as faceLines draws a rule's (icons: {BELT} -> its glyph)
  return [{ text: `FEEDS ${fmtCount(outputsAt(def, stars))} BELTS IN TURN.` }, { text: icons(`BIGGER: +${fmtCount(more)} {BELT}`), label: "BIGGER:" }];
}

/** SHAPES-1 (REQ-BFG-089; S8): the default rules text for a shaped piece, behind the hover or tap (EXPLAIN-1's ⓘ NOTES):
 *  the shape rule for a long rig, the size rule for a shaped factory. */
export const SHAPE_RULE = "A LONG RIG'S ARROWS SHINE FROM EVERY OUTSIDE EDGE OF ITS CELLS.";
/** SHAPES-2 (REQ-BFG-114): the same rule in words that fit an L, a T and a 2x2 as well as a line ("LONG" would not): with SHAPES2
 *  on every shaped rig's NOTES read it (one rule, one sentence); with it off SHAPES-1's SHAPE_RULE stands, byte for byte. */
export const SHAPE_RULE_ANY = "A SHAPED RIG'S ARROWS SHINE FROM EVERY OUTSIDE EDGE OF ITS CELLS.";
// SHOPCARD-1f (REQ-BFG-081, REQ-BFG-115; READ-13 fix list 2: 4 of 6 phone readers stumbled on `A FACTORY'S EVERY 2 CELLS PAST 4 ADD A BELT
// SLOT.` in a 3-cell ASSEMBLY LINE's notes: "is a belt slot the same as [BELT]?" (both Opus), "how does a 3-cell factory get BELT 2?" (Haiku)):
// the note is written with the {BELT} icon the stat row draws (`EVERY 2 CELLS PAST 4 GIVE +1 {BELT}.`, 167 px, one row; was 265 px, two) and
// shapeNotes gives it only to a factory whose footprint is past SLOT_FROM_CELLS cells, as foot.ts footSlots reads it: outputsAt (stars.ts:161-165)
// adds footSlots(def) = floor(max(0, cells - 4) / 2) to the belts a factory can feed (GANTRY PRESS's 2x3 is 6 cells: +1, BIGGER: +1 {BELT});
// a 3-cell ASSEMBLY LINE gets none, so its notes carry no size note. It agrees with GANTRY PRESS's `BIGGER: +1 {BELT}` line (shapeLines: the
// same icon, the same +1). Stored with its icon glyph as shapeLines' BIGGER line is (the NOTES blocks draw their text as it stands)
export const SIZE_RULE = icons(`EVERY ${fmtCount(SLOT_EVERY_CELLS)} CELLS PAST ${fmtCount(SLOT_FROM_CELLS)} GIVE +${fmtCount(1)} {BELT}.`); // faceText.test: no digit in a face's string literal

/** SHAPES-1: a shaped piece's NOTES sentences ([] for every other piece and with SHAPES off). SHOPCARD-1f: a factory's size note only
 *  where its size gives a belt (foot.ts footSlots > 0: GANTRY PRESS's 2x3, not ASSEMBLY LINE's 3 cells). */
export function shapeNotes(def: string): string[] {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d || !shapesRules() || !deckShaped(d)) return [];
  return d.kind === "gate" ? [shapes2Rules() ? SHAPE_RULE_ANY : SHAPE_RULE] : d.kind === "factory" && footSlots(d) > 0 ? [SIZE_RULE] : []; // SHAPES-2: SHAPE_RULE_ANY while SHAPES2 is on
}

/** SHAPES-1 (REQ-BFG-086.1): the shape in a type line: `2 CELLS`, `3 CELLS` for a line or a bent shape, `2X3`, `3X3` for a
 *  block; null for a 1-cell rig, a 2x2 factory and anything with SHAPES off (their type line stays as it is). */
export function shapeWord(def: string): string | null {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d || !shapesRules() || !deckShaped(d)) return null;
  // a block (every cell of its box, 2+ each way: 2x3, 3x3) by its box, depth X width as the FootId names it; else its cells
  const b = footBox(d, 0), n = footCount(d);
  return n === b.w * b.h && b.w > 1 && b.h > 1 ? `${fmtCount(b.h)}X${fmtCount(b.w)}` : `${fmtCount(n)} CELLS`;
}

// ------------------------------------------- SCALE-2c (REQ-BFG-098, REQ-BFG-089, REQ-BFG-087, REQ-BFG-107): the readers

/** SCALE-2c (BRIEF-SCALE2c section 2's face lines; REPORT-SCALE1 3.1): what a reader line counts, in the face's words, the
 *  words after FOR EACH (IRON WALL's per, its day's PLATE, before its count). New text holds no plain PLATE or SHIELD: the
 *  tokens {*PLATE} (draws SHIELD, the soak layer) and {*SHIELD} (draws WARD) say them (REQ-BFG-107). */
const READ_WORDS: Readonly<Record<ReadCount, (per: string) => string>> = {
  foeBurn: () => "{*BURN} ON THE FOE",
  foePoison: () => "{*POISON} ON THE FOE",
  beltSlugs: () => "{SLUG} ON ITS BELT",
  ownPlate: (per) => `${per} {*PLATE} YOU HAVE`,
  ownShield: () => "{*SHIELD} YOU HAVE",
  hitsTaken: () => "HIT ON YOU",
  ownHits: () => "OF ITS HITS",
  heartsLost: () => "HEART LOST",
  wins: () => "WIN",
  waiting: () => "{SLUG} WAITING",
};

/**
 * SCALE-2c (REQ-BFG-098, REQ-BFG-089): a reader piece's face, from its own `reads` line at its star (a rig's gate.reads at
 * its HIT, a gun part's mod.reads at its SHOT: Battle.applyHit / Battle.fire): one ability line in REPORT-SCALE1 3.1's
 * words, `+n {DMG}` (x D(d): dmgNow) or `+n {*PLATE}` (x S(d): sustNow, as addPlate) FOR EACH what it counts, or LEECH
 * COIL's `{*HEAL} n TIMES THE FOE'S {*POISON}` (x S(d), as heal()); its number keyed "each" (the ⓘ LEVELS ladder, NEXT★
 * and the chip read it); a reminder for each keyword the line draws, in the line's order. The 3.2 hover line is NOTES only
 * (scaleNotes).
 */
function readerFace(e: ItemDef): Rules {
  const atShot = e.kind === "mod";
  const r = (atShot ? md(e) : gt(e)).reads!;
  const label = atShot ? shot : hit;
  let text: string, num: string;
  if (r.give === "heal") {
    const n = fmtDmg(sustNow(r.each));
    text = `{*HEAL} ${n} TIMES THE FOE'S ${READ_WORDS[r.count]("").replace(" ON THE FOE", "")}.`;
    num = `{*HEAL} ${n} TIMES`;
  } else {
    num = r.give === "plate" ? `+${fmtDmg(sustNow(r.each))} {*PLATE}` : `+${fmtDmg(dmgNow(r.each))} {DMG}`;
    // CINDER MAIL: {*PLATE} draws SHIELD, a letter longer than the design's PLATE, so the brief's "... ON THE FOE." is
    // 227-233 px against the 225 band at every star; "ON FOE." (203-209 px) is the least cut (REPORT Findings)
    const what = READ_WORDS[r.count](r.per ? fmtDmg(sustNow(r.per)) : "");
    text = `${num} FOR EACH ${r.give === "plate" ? what.replace(" ON THE FOE", " ON FOE") : what}.`;
  }
  const kws: KeywordName[] = [];
  for (const m of text.matchAll(/\{\*([A-Z]+)\}/g)) if (!kws.includes(m[1] as KeywordName)) kws.push(m[1] as KeywordName);
  // the ladder's words: "+3/+5/+8 {DMG} EACH", LEECH COIL's "{HEAL} 4/5/6 TIMES" (TIMES says it: no EACH after it)
  return rules([label(text)], [["each", r.give === "heal" ? num : `${num} EACH`]], kws.map((k) => REMINDER[k]()));
}

/** SCALE-2c (REQ-BFG-098): the seven new scaling rigs' faces (scale.ts SCALE_ITEMS), apart from FACES so FACE_IDS (the
 *  tests' and tools' list) stays M0's; hasFace sees them only with SCALE_RIGS on (SHAPE_FACES' form). The five reworks
 *  keep their FACES entries, each reading its own def (a `reads` line or no maxCount: the switch-on def). */
const SCALE_FACES: Record<string, (e: ItemDef, x: X) => Rules> = {
  cindermail: (e) => readerFace(e),
  rotgauge: (e) => readerFace(e),
  leechcoil: (e) => readerFace(e),
  crowdpress: (e) => readerFace(e),
  aegisspike: (e) => readerFace(e),
  grudgerod: (e) => readerFace(e),
  trophychain: (e) => readerFace(e),
};

/**
 * SCALE-2c (REQ-BFG-089; BRIEF-SCALE2c section 3; REPORT-SCALE1 3.2's hover column): each scaling piece's one edge-case
 * line, default rules text behind the hover or tap (the ⓘ NOTES, inspector.ts explainPanel, as shapeNotes), never on the
 * face. Its HIT or SHOT reminder and each keyword's reminder come from the face's words (the ⓘ KEYWORDS). No digit here:
 * IRON WALL's example reads PLATE_CAP and its own per.
 */
const SCALE_NOTES: Readonly<Record<string, (e: ItemDef) => string>> = {
  quench: () => "IT COUNTS THE {*BURN} ON THE FOE'S HULL AT THE HIT. THE SLUG KEEPS THE {DMG}.",
  pressure: () => "IT COUNTS THE {SLUG} IN ITS CHAMBER AND BACKED UP AT ITS INTAKES WHEN IT FIRES. IT NEVER JAMS.",
  shieldwall: (e) => {
    // SCALE-2e E6 (REQ-BFG-089; SCALE-2f carry-over 2, REPORT-SCALE2f 9.2 b): the example in the face's own units. The face says
    // FOR EACH <per> SHIELD with the day's per (sustNow: 10 on day 1, 28 on day 5), so the example is 3 x per - 1: it reads 2 TIMES
    // (day 1: `29 SHIELD IS 2 TIMES`, day 5: `83 SHIELD IS 2 TIMES`), not day 1's `239 SHIELD IS 23 TIMES` against a bigger per
    const per = Number(fmtDmg(sustNow(e.gate!.reads!.per ?? 1)));
    return `IT COUNTS YOUR {*PLATE} AT THE HIT, ROUNDED DOWN: ${fmtDmg(3 * per - 1)} {*PLATE} IS ${fmtCount(2)} TIMES.`;
  },
  spallcatcher: () => "IT COUNTS EVERY ENEMY HIT ON YOUR SHIP THIS FIGHT, BLOCKED OR NOT, WHEN IT FIRES.",
  keg: () => "IT COUNTS ITS OWN HITS THIS FIGHT, THIS ONE TOO. THE COUNT SHOWS ON IT.",
  cindermail: () => "IT COUNTS THE {*BURN} ON THE FOE'S HULL AT THE HIT.",
  rotgauge: () => "IT COUNTS THE {*POISON} ON THE FOE'S HULL AT THE HIT. THE SLUG KEEPS THE {DMG}.",
  leechcoil: () => "IT COUNTS THE {*POISON} ON THE FOE'S HULL AT THE HIT.",
  crowdpress: () => "IT COUNTS THE {SLUG} ON THE BELT IT HITS AT THE HIT, THE HIT ONE TOO. WAITING AT THE GUN COUNTS.",
  aegisspike: () => "IT COUNTS YOUR {*SHIELD} AT THE HIT.",
  grudgerod: () => "IT COUNTS THE HEARTS YOU HAVE LOST THIS RUN, AS THE RUN BAR SHOWS THEM.",
  trophychain: () => "IT COUNTS YOUR WINS THIS RUN, AS THE RUN BAR SHOWS THEM.",
};

/** SCALE-2c: a scaling piece's NOTES sentences in glyphs, as drawn (icons(); [] for every other piece and with SCALE_RIGS
 *  off). `markup`: in markup instead (tests, tools). */
export function scaleNotes(def: string, markup = false): string[] {
  if (!scaleRules() || !Object.prototype.hasOwnProperty.call(SCALE_NOTES, def) || !Object.prototype.hasOwnProperty.call(ITEMS, def)) return [];
  const t = SCALE_NOTES[def](ITEMS[def]);
  return [markup ? t : icons(t)];
}

/** A piece's face at `stars` as data (o: the turret class factor k for a core, the run's hero for MIMIC FORGE). Y7b2 (the
 *  flip): the interim perk clauses (U2b F6) are gone, every one with the star switch's rules (R4, the STAR batch), so a face
 *  has no clause; the interim caveats keep their one table (INNER COLUMN ONLY is the one row left). */
export function faceAt(def: string, stars = 1, o: TextOpts = {}): Face | null {
  if (!hasFace(def)) return null;
  // HULL-1d (REQ-BFG-079; BRIEF-HULL1D 2 (h)1): the face's numbers on o.day (dayShown.ts: damage x D(d), sustain x S(d));
  // no day, or the switch off: day 1's, as before. Every face read (faceLines, faceDiff, NEXT★, the chips, the ⓘ ladder)
  // comes through here
  return shownOn(o.day, () => faceOn(def, stars, o));
}

function faceOn(def: string, stars: number, o: TextOpts): Face {
  const e = effectAt(def, stars), x: X = { stars, k: o.k ?? 1, hero: o.hero, day: o.day }; // HULL-1a: the day
  const body = e.kind === "turret" ? TURRET_FACE() : (FACES[def] ?? SHAPE_FACES[def] ?? PLAIN_FACES[def] ?? SCALE_FACES[def] ?? CONVERTER_FACES[def])(e, x); // SHAPES-1: SHAPE_FACES; PLAIN-1: the six's; SCALE-2c: SCALE_FACES (BUMP-1E: both sides' tables); GATES-1: the gates' (BUMP-1F: CONVERTER_FACES last)
  const stats = e.kind === "turret" ? turretStats(def, stars) : e.kind === "factory" ? factoryStats(def, stars, o.hero)
    : e.kind === "core" ? coreStats(def, stars, x.k) : e.kind === "gate" ? rigStats(def, stars) : e.kind === "mod" ? gearStats(def, stars)
    : e.kind === "converter" ? converterStats(def, stars) // GATES-1: a gate's slugs in and out, what it adds, what it costs
    : supplyStats(def); // U2b: the rig, gear and supply kinds' data functions
  // U2b F5: the interim caveats (one table)
  const caveats = INTERIM_CAVEATS.filter((cv) => cv.applies(e)).map((cv) => cv.text(e));
  // U2e step 2: a factory's own payloads' stats, its second stat row
  const stats2 = e.kind === "factory" ? carryStats(def, stars, o.hero) : null;
  // WORDS-1 (REQ-BFG-081): a turret's plain lines under its stat row (turretPlain)
  const plain = e.kind === "turret" ? turretPlain(def, stars) : null;
  return {
    stats, ...(stats2 ? { stats2 } : {}), ...(plain ? { plain } : {}), ...body,
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
  /** WORDS-1 (REQ-BFG-081): the plain lines under the stat row (Face.plain), in glyphs. */
  plain?: string[];
}

export function faceLines(def: string, stars = 1, o: TextOpts = {}): FaceLines | null {
  const fc = faceAt(def, stars, o);
  if (!fc) return null;
  return {
    stats: fc.stats.length ? statRow(fc.stats) : null,
    ...(fc.stats2?.length ? { stats2: statRow(fc.stats2) } : {}),
    ...(fc.plain?.length ? { plain: fc.plain.map((t) => icons(t)) } : {}),
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
// CARD-3 (REQ-BFG-107): BASTION's PLATE AND ENDURE (races/data.ts pattern) reads SHIELD AND ENDURE: its bulwark slugs add
// SHIELD as they load (races/bastion.ts plateOnLoad); any other hero's pattern goes through gameWords
const PLAYSTYLE: Partial<Record<HeroId, string>> = { weaver: "THREADS FRAY HULLS", foundry: "PAIRS FUSE STRONGER", bastion: "SHIELD AND ENDURE" };
export const heroPlaystyle = (hero: HeroId): string => PLAYSTYLE[hero] ?? gameWords(HEROES[hero].pattern);
