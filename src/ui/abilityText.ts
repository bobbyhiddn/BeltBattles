// 0.6.2t (REQ-BFG-032, T3): THE GLOSSARY. Every ability line the game shows comes from here: the inspect panel of a
// rig, factory, turret core, turret gear or supply at every star (build screen: offer, cargo, placed, REFIT), the
// turret panel's core and gear lines, the belt timeline, the shop card's one-line effect and its hover tooltip, and the
// next-star and MERGES WITH lines (U2e: no merge progress). Text functions return whole sentences (full stops, no "·", no line
// breaks); the one wrap helper (src/ui/richText.ts wrapRich) breaks them to a panel's width at draw time.
//
// API (pure; `o` is TextOpts: { k: a turret core's class factor (default 1, heavy), hero: the run's hero (MIMIC FORGE) }):
//   abilityText(def, stars, o)   the module's sentences at that star. The first (the opening) says what it does, with
//                                its main number; the rest say how much, what triggers it and any limit, most important
//                                first. `perk` names the star's perk and the sentence it follows (T4: name after effect).
//   gist(def, stars, o)          that star's effect as a short clause, no full stop ("ADDS 4 BURN")
//   nextStarText(def, stars, o)  "NEXT STAR: ADDS 4 BURN." (null at the top star); newPerk(def, to) names a new perk;
//                                nextStarHeadline(def, stars, o) its first clause only, for a short phone band
//   mergesWithText(def, to, o)   "MERGES WITH YOUR TEMPER INTO ★2: ADDS 4 BURN."
//   cardText(def, o)             the shop card's one-line effect at 1 star, a whole sentence ("ADDS 2 BURN.")
//   hitText(h, belt)             one rig hit in a belt's timeline (a labelled stat row; belt: free, locked or slag);
//                                slagPulseExtra(rows, belt) the pulse damage a SLAG belt's walk counts but the sim never pays
//   hasAbilityText(def), livePerk(def, stars): which modules have text; a star's perk unless its values are pending
//   0.6.2rel, the turret panel's sentences: gatlingClashText(def, stars, routine) (gear that does nothing on a GATLING
//                                SPOOL; 0.6.2rel2: HOPPER's seconds on a COMPOUND BREECH too),
//                                shieldText(n) (a MANTLET ★2/★3's shielded belt tiles), STALL_WORD (FB-B's stall names)
//   units: seconds(), damage(), moreDamage(), percent(), faster(), speedText(), rateText(), times(), plural(), every(),
//          nth(), onlineIn(), peakTiles(), rate() (NUM-4: n1() and n2() are gone; every number through statFormat.ts)
// Adding a module: one ENTRIES row (text, gist, optional card and perkAt) built from these units;
// tests/abilityText.test.ts then needs its NUMBERS row, and every rule (T1-T7) applies to it unchanged. 0.6.2rel: the 13
// buyable turrets (REQ-BFG-031) share one block (TURRET, below), read from each one's TurretSpec at its stars.
// Numbers always come from the module's real spec at that star (effectAt; a core's absolute numbers x k, as scaleCore
// does), from the catalogue's exported constants, or from SIM below (engine numbers no spec carries, each checked
// against its source by tests/abilityText.test.ts). Turret modules the turret task adds route their text through here.
//
// THE VOCABULARY. Each effect is named once, here, and reads the same everywhere (T5):
//   DAMAGE      "20 DAMAGE", "105 MORE DAMAGE": whole (NUM-4: fmtDmg). BONUS DAMAGE is what rigs and scrap add to a payload.
//   BURN        each burn deals the enemy hull 1 damage a second for 3 seconds (BURN_TIME) once its shot lands.
//   SHOCK       a shocked shot stalls the machine it hits (2 seconds, DISRUPT_TIME, unless a star says longer; NUM-3 step 2: was 1.6).
//   STALL       a stalled machine stops working for a while. A MACHINE is an enemy rig, factory, turret or belt tile.
//   STUN        NUM-3 (R1's STUN fold, REQ-BFG-046): every stop is a STUN (Battle.disrupt, one timer): a shock, a stall, a
//               SABOT, FROSTBITE or DRAG CHAIN round (no FREEZE, CHILL, belt SLOW or SNAG any more); the new sentences
//               say STUN, STUNS, STUNNED (the glossary folds STALL and SHOCK into it).
//   POISON      each poison on the enemy hull deals 0.4 damage a second (up to 24 poison) until 6 seconds pass without a
//               poisoned hit.
//   FRAY        each fray on the enemy hull makes every later hit deal 0.2 more damage (up to 15 fray).
//   SPEED       a belt "60% FASTER", "3 TIMES AS FAST", "AT HALF SPEED" or "40% SLOWER", from the tile a speed rig hits
//               on. METRONOME's belts are locked at normal speed: speed rigs add damage there instead.
//   COPIES      SPLITTER and SORTING ARM make more payloads from one.
//   LOADS       a turret's chamber holds loads. It fires when the chamber is full or its LOAD TIME ends (1.5 seconds
//               after the first load, WINDOW_TIME). A turret with 4 payloads backed up at its intakes JAMS.
//   FIRE RATE   "THE TURRET FIRES 33% FASTER": the rate, from the fire interval (x0.75 fires 1 / 0.75 = 33% faster).
//   HARASSMENT  any STUN, wreck or rip that lands on an enemy machine (NUM-3: no freeze or slow any more).
//   MARKS       SAP, the one mark left (2 less damage; no piece gives it yet). NUM-3: CHILL and SNAG are gone.
// 0.8.0 P1 (wave 3, DESIGN-wave3.md 3.2's glossary; each a shared sentence in S below):
//   PLATING     plating takes damage, burn and poison before your hull, up to 24 (PLATE_CAP); the dark wind goes straight
//               through it (S.plating). "20 PLATING", "5 PLATING": whole (NUM-4: fmtDmg), the word PLATING as its unit.
//   PAIR        two loads that reach one turret through different intakes within 0.25 seconds (SYNC_WINDOW); a FOUNDRY
//               fusion is a pair (S.pair).
//   MATCHED     a belt with as many tiles as another belt into the same turret (S.matched).
//   WORKS FASTER a factory that works faster stamps and pours sooner, and its other timers run faster too (S.worksFaster).
// UNITS (T2; NUM-4): seconds as "3 SECONDS" or "1 SECOND" (whole, fmtSec); a cadence as "AT RATE 19" (fmtSpeed);
// percentages whole, with "%" (fmtPct); damage whole with the word DAMAGE (fmtDmg). Never a bare multiplier (X2, 1.5X), a slash rate (/HIT, /S), a glued second
// (4S), an ordinal (3RD) or a "·". Labelled stat rows (the belt timeline, the turret rows) may keep short labels and SEC.

import {
  AMMO, BURN_TIME, CELL, BELT_SPEED, COMMISSION_BASE, COMMISSION_STEP, DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS,
  JAM_THRESHOLD, SHAPE_ARROWS, WINDOW_TIME, rigShape, type HarassCause, type HeroId, type ItemDef,
} from "../sim/content";
import { STUN_CAUSES } from "../sim/content"; // NUM-3 (R1's STUN fold): MANTLET's immunity is every STUN source
import { PEAK_SHIFT, PENDULUM } from "../sim/races/data";
import { BURN_DPS } from "../sim/content"; // NUM-1 (REQ-BFG-047): a Burn stack's damage a second
import { factorySpeed, rateMul } from "../sim/content"; // NUM-2 (REQ-BFG-047): SPEED; NUM-4: printed as it is (rate())
import { SHIELD_CAP } from "../sim/content"; // SUS-B (REQ-BFG-069): WARD BELL's UP TO 3
import { SPEED_K } from "../sim/content"; // NUM-4 (REQ-BFG-047): a SPEED in words, "19 TIMES IN 30 SECONDS"
import { starRules } from "../sim/content"; // Y2 (release Y): the star switch (the STUN pieces' kept sentences, cards, timeline)
import { pct, roundHalfUp } from "../sim/pct"; // NUM-4: GRAPNEL's salvage as the sim rounds it
import { fmtCount, fmtDmg, fmtPct, fmtSec, fmtSpeed } from "./statFormat"; // NUM-4: every number through a formatter
// 0.8.0 I1 (the merge of H1 and P1): each name imported once; H1's signature text and P1's wave-3 entries both read them
import { FUSE_MULT, SYNC_WINDOW } from "../sim/races/foundry"; // 0.8.0 H1: FOUNDRY's CRUCIBLE; P1: the pair window
import { FURNACE_LONG_BELT, LOAD_FLOOR } from "../sim/battle"; // 0.8.0 H1: hero select's FURNACE sentence; P1: TWIN TRIGGER's floor
import { PLATE_CAP, PLATE_PER_SLUG } from "../sim/races/bastion"; // 0.8.0 H1: BASTION's WARDWORKS; P1: the plating cap
import { scaleCore } from "../sim/cores";
import { effectAt, FUSE_MAX, fusible, outputsAt, pendingAt, perkAt, pourAt } from "../sim/stars";
import * as stars from "../sim/stars"; // 0.8.0 B1 M2: OVERDRIVE's text reads the star's named perk
import { gearSlotsOf, type TimelineHit } from "../sim/deck";

/**
 * The engine's numbers that no module spec carries and the sim doesn't export. Each is quoted from its source
 * (tests/abilityText.test.ts reads the source and fails if one moves).
 */
export const SIM = {
  poisonMax: 24, // battle.ts impact: stacks = Math.min(24, stacks + poison)
  poisonTime: 6, // battle.ts impact: poison.t = 6
  poisonTick: 4, // battle.ts hullEffects: stacks * 4 damage a second (NUM-1: x10 of 0.4, once a second)
  // NUM-3 (R1's STUN fold): SABOT's 5 / 4 / 3 s stalls and bare-hull +60, DRAG CHAIN's factory and turret delays and SNAG's
  // x0.8, and CHILL's x0.75 are gone from the sim; a sabot, frost or chain round's STUN is its round.seconds (content.ts)
  shrapnel: 2, // battle.ts roundImpact: SHRAPNEL stuns the tiles either side 2 s
  sap: 20, // harassment.ts debuffedDamage: a SAP-marked payload deals 20 less (NUM-1: x10 of 2)
  scrapQueue: 3, // battle.ts produce: up to 3 triggered stamps wait
  lanceMax: 10, // battle.ts impact: a lance strikes at most 10 targets
  salvoWait: 2, // cores.ts salvo: fires once full, or after twice the load time
  furnaceLongTiles: 8, // battle.ts makeTurret: a FURNACE turret fed by a belt journey of at least 8 tiles (E1)
} as const;

/**
 * 0.8.0 H1 (REQ-BFG-011, REQ-BFG-032): each hero's trick in one plain sentence, for hero select, from the real values:
 * the Kiln's cinder ride scaling and FURNACE's long-belt breech (battle.ts FURNACE_LONG_BELT), the Loom's belts and the
 * thread slug's fray (FRAY_BONUS, FRAY_MAX), the Crucible's twin pour and fusion (SYNC_WINDOW, FUSE_MULT), and the bulwark
 * slug's plating (PLATE_PER_SLUG, PLATE_CAP). METRONOME and SIPHON (not offered yet) read their catalogue blurb.
 */
export function heroTrick(hero: HeroId): string {
  const h = HEROES[hero], fs = ITEMS[h.factory].factory!;
  switch (hero) {
    case "furnace":
      return `ITS KILN'S CINDER SLUGS GAIN ${damage(AMMO.cinder.rideScale)} FOR EACH SECOND THEY RIDE, AND A GUN FED BY A BELT OF ${SIM.furnaceLongTiles} TILES OR MORE FIRES ${faster(rateMul(FURNACE_LONG_BELT))}.`;
    case "weaver":
      return `ITS LOOM FEEDS UP TO ${plural(outputsAt(h.factory, 1), "BELT")} IN TURN, AND EACH THREAD SLUG THAT HITS FRAYS THE ENEMY HULL SO EVERY LATER HIT DEALS ${moreDamage(FRAY_BONUS)}, UP TO ${FRAY_MAX} FRAY.`;
    case "foundry":
      // bb-0.8.3 (REQ-BFG-042 D2, D4): the starting CRUCIBLE (★1) has 2 belt slots, its pour: both its belts at once
      // NUM-4 (REQ-BFG-047): the pair window (SYNC_WINDOW 0.25 s) is a hidden timer, said as the PAIR word AT ONCE (N1 2.2);
      // FUSE_MULT x1.15 as a whole % (was "1.15 TIMES")
      return `ITS CRUCIBLE POURS A BLANK ONTO BOTH ITS BELTS AT ONCE, AND TWO BLANKS THAT REACH ONE GUN AT ONCE FUSE INTO ONE SLUG THAT DEALS THEIR DAMAGE AND ${percent(FUSE_MULT - 1)} MORE.`;
    case "bastion":
      return `ITS BULWARK SLUGS PLATE YOUR HULL AS THEY LOAD, ${fmtDmg(PLATE_PER_SLUG)} EACH UP TO ${PLATE_CAP} PLATING, AND PLATING TAKES HITS AND BURN BEFORE YOUR HULL DOES.`;
    default:
      return h.blurb.join(" ");
  }
}

// ---------------------------------------------------------------------------------------------------------------- units

// NUM-4 (REQ-BFG-047; N1 2.5): n1 and n2 (toFixed(1) / toFixed(2)) are gone. Every number below goes through one of
// statFormat.ts's formatters, which print the sim's whole value as it is (a fraction is a finding there, never rounded).
/** "3 SECONDS", "1 SECOND" (whole seconds, fmtSec). */
export const seconds = (x: number): string => `${fmtSec(x)} SECOND${x === 1 ? "" : "S"}`;
/** "20 DAMAGE", "180 DAMAGE" (fmtDmg). */
export const damage = (x: number): string => `${fmtDmg(x)} DAMAGE`;
/** "12 MORE DAMAGE". */
export const moreDamage = (x: number): string => `${fmtDmg(x)} MORE DAMAGE`;
/** 0.25 -> "25%" (fmtPct: whole). */
export const percent = (x: number): string => fmtPct(x);
/** "1 BELT", "3 BELTS". */
export const plural = (n: number, one: string, many = `${one}S`): string => `${n} ${n === 1 ? one : many}`;
/** "TWICE", "3 TIMES" (a whole count). */
export const times = (r: number): string => (r === 2 ? "TWICE" : `${fmtCount(r)} TIMES`);
/** NUM-4: a SPEED in words, for the kept sentences (no icons there): "AT RATE 19", the RATE icon's number on the faces
 *  (fmtSpeed: shots or slugs in SPEED_K seconds), the word a tap explains (glossary.ts RATE row). Shorter than "19 TIMES
 *  IN 30 SECONDS", so the landscape card's two lines still hold it. */
export const rate = (speed: number): string => `AT RATE ${fmtSpeed(speed)}`;
/** A rate or speed multiplier above 1: "33% FASTER", "245% FASTER", or a whole "TWICE AS FAST", "3 TIMES AS FAST".
 *  NUM-4: never a float ratio ("3.4 TIMES AS FAST" was GATLING's +245%); the % is whole (fmtPct). */
export function faster(r: number): string {
  const n = Math.round(r);
  if (n >= 2 && Math.abs(r - n) < 1e-9) return `${times(n)} AS FAST`;
  return `${fmtPct(r - 1)} FASTER`;
}
/** A belt speed state: "60% FASTER", "3 TIMES AS FAST", "AT HALF SPEED", "40% SLOWER". */
export function speedText(r: number): string {
  if (r >= 1) return faster(r);
  return Math.abs(r - 0.5) < 1e-9 ? "AT HALF SPEED" : `${fmtPct(1 - r)} SLOWER`;
}
/** A fire interval multiplier as the fire rate: x0.75 -> "33% FASTER" (1 / 0.75), x1.4 -> "29% SLOWER". NUM-4: the %
 *  is whole (NUM-2's whole rate %, read back through imul). */
export function rateText(intervalMul: number): string {
  const r = 1 / intervalMul;
  return r >= 1 ? faster(r) : `${fmtPct(1 - r)} SLOWER`;
}
/** NUM-2 (REQ-BFG-047): a whole rate % as the interval share rateText reads (100 / (100 + X)): +33 -> "33% FASTER". */
const imul = (rate: number | undefined): number => 1 / rateMul(rate);
/** "EVERY 1.4 SECONDS". */
export const every = (secs: number): string => `EVERY ${seconds(secs)}`;
/** Every nth: "OTHER" (every other), "THIRD", "FOURTH". */
const NTH = ["", "", "OTHER", "THIRD", "FOURTH", "FIFTH", "SIXTH"];
export const nth = (n: number): string => NTH[n] ?? `${n}TH`;
/** "A" or "AN" before a word. */
const an = (w: string): string => (/^[AEIOU]/.test(w) ? `AN ${w}` : `A ${w}`);
/** How soon rigs come online at a commission factor (ASSEMBLY LINE): "IN HALF THE TIME", "AT ONCE". */
export function onlineIn(k: number): string {
  return k <= 0 ? "AT ONCE" : k === 0.5 ? "IN HALF THE TIME" : k === 0.25 ? "IN A QUARTER OF THE TIME" : `IN ${percent(k)} OF THE TIME`;
}
/** Y3 (release Y; DESIGN-Y row 32): how much sooner rigs start at a commission factor, the face's words: "50% SOONER",
 *  "AT ONCE" (no ONLINE: with the star switch on ASSEMBLY LINE's texts say START, as its face does). */
export const startIn = (k: number): string => (k <= 0 ? "AT ONCE" : `${percent(1 - k)} SOONER`);
/** Y3 (DESIGN-Y row 27): a BRAKE SHOE's belt speed with the star switch on: "HALF SPEED", "40% SPEED" (its face's %). */
const brakeSpeed = (r: number): string => (Math.abs(r - 0.5) < 1e-9 ? "HALF SPEED" : `${percent(r)} SPEED`);

// ----------------------------------------------------------------------------------------------------------- sentences

/** Options: k, a turret core's class factor (1 heavy, 0.75 medium, 0.55 light); hero, the run's hero (MIMIC FORGE). */
export interface TextOpts {
  k?: number;
  hero?: HeroId;
}

interface X {
  k: number;
  hero?: HeroId;
  stars: number;
}

/** A module's text at a star: whole sentences, the opening one first; `perk`: the star's perk, its star and the index
 *  of the sentence it names (the name is drawn right after that sentence). */
export interface AbilityText {
  sentences: string[];
  perk?: { name: string; stars: number; after: number };
}

/** One module's entry, read at spec `e` (effectAt at the star). */
interface Entry {
  /** The sentences: the opening one first, then the rest, most important first. */
  text: (e: ItemDef, x: X) => string[];
  /** The sentence the star's perk names (default 0, the opening one). */
  perkAt?: (e: ItemDef, x: X) => number;
  /** The star's effect as a short clause, no full stop ("ADDS 4 BURN"): the next-star and MERGES WITH lines. */
  gist: (e: ItemDef, x: X) => string;
  /** The shop card's one-line effect at 1 star, no full stop, where the gist isn't the best card line. */
  card?: (e: ItemDef, x: X) => string;
}

const g = (e: ItemDef) => e.gate!;
const f = (e: ItemDef) => e.factory!;
const m = (e: ItemDef) => e.mod!;
const c = (e: ItemDef, x: X) => scaleCore(e.core!, x.k);
/** A factory's slug damage at its stars: its dies (FactorySpec.base), else its ammo's (Battle.stamp). */
const slugBase = (e: ItemDef): number => f(e).base ?? AMMO[f(e).ammo].base;
/** "PAST IT" for a one-arrow rig's belt, "PAST IT" for every belt a many-arrow rig hits: the belts downstream of the
 *  tiles it hits. The noun: "THE BELT" (one arrow) or "THE BELTS" (more). */
const belts = (e: ItemDef): string => ((SHAPE_ARROWS[rigShape(e) ?? "I"]?.length ?? 1) > 1 ? "THE BELTS" : "THE BELT");
/** The round spec of a harassment factory. */
const round = <T>(e: ItemDef) => f(e).round as unknown as T;

/** SUS-B (REQ-BFG-069): the sustain words these sentences use, in one place, as the keyword data holds them (font.ts
 *  KEYWORDS, glossary.ts): a later swap of a word (the operator may yet rename PLATE to SHIELD) changes them here. */
const SW = { shield: "SHIELD", heals: "HEALS" } as const;

/** The shared sentences: the same effect reads the same everywhere (T5). */
export const S = {
  burn: `EACH BURN DEALS THE ENEMY HULL ${BURN_DPS} DAMAGE A SECOND FOR ${seconds(BURN_TIME)}.`, // NUM-1: the sim's BURN_DPS (was a literal 1)
  /** What a shock does: a STUN in whole seconds (fmtSec), "STUNS A MACHINE FOR 2 SECONDS" (n machines with a jump). */
  stalls: (t: number, n: number) => `STUNS ${n === 1 ? "A MACHINE" : `${n} MACHINES`} FOR ${seconds(t)}`,
  /** How a jump spreads a shock (or a FROSTBITE round's STUN) after the machine the shot hits. */
  spread: (verb: string, n: number) => `THE SHOT ${verb} THE MACHINE IT HITS, THEN THE ${n === 1 ? "NEAREST OTHER ONE" : `${n} NEAREST OTHERS`}.`,
  hullShock: "A SHOT THAT HITS BARE HULL STUNS NOTHING.",
  /** A speed rig on METRONOME's locked belts: the lockedFlat it pays there (`more`: on top of its own damage). */
  locked: (d: number, more = false) =>
    `ON METRONOME'S LOCKED BELTS IT ADDS ${more ? moreDamage(d) : damage(d)} INSTEAD${more ? " OF THE SPEED CHANGE" : ""}.`,
  harassment: "HARASSMENT IS ANY STUN, WRECK OR RIP ON AN ENEMY MACHINE.", // NUM-3: no freeze or slow any more
  poison: `EACH POISON ON THE ENEMY HULL DEALS ${fmtDmg(SIM.poisonTick)} DAMAGE A SECOND, UP TO ${SIM.poisonMax} POISON.`,
  poisonTime: `THE POISON CLEARS ${seconds(SIM.poisonTime)} AFTER THE LAST POISONED HIT.`,
  // NUM-3 (R1's STUN fold): CHILL and SNAG are gone; SAP is the one mark left, and no piece gives it yet (harassment.ts)
  marks: `SAP IS THE ONLY MARK: ITS PAYLOAD DEALS ${fmtDmg(SIM.sap)} LESS DAMAGE; NO PIECE GIVES IT YET.`,
  fray: (max?: number) => `EACH FRAY ON THE ENEMY HULL MAKES EVERY LATER HIT DEAL ${moreDamage(FRAY_BONUS)}${max ? `, UP TO ${max} FRAY` : ""}.`,
  // NUM-4 (REQ-BFG-047; N1 2.2): the commission timers (1.2 s, +0.6 s), the load window (1.5 s) and the pair window
  // (0.25 s) are hidden timers that no whole second can say: the sentences keep the rule, not the number
  online: "RIGS NORMALLY COME ONLINE SOON AFTER A BATTLE STARTS, A LITTLE LATER FOR EACH RIG BEFORE THEM ON THEIR BELT.",
  bonus: "BONUS DAMAGE IS WHAT RIGS AND SCRAP ADD TO A PAYLOAD.",
  chamber: "A TURRET FIRES WHEN ITS CHAMBER IS FULL OR ITS LOAD TIME ENDS, SOON AFTER THE FIRST LOAD.",
  jam: `A TURRET WITH ${JAM_THRESHOLD} PAYLOADS BACKED UP AT ITS INTAKES JAMS.`,
  gatling: "IT DOES NOTHING ON A GATLING SPOOL, WHICH NEVER WAITS FOR A FULL CHAMBER.",
  stamps: (what: string, speed: number) => `IT STAMPS ${what} ${rate(speed)}.`, // NUM-4: its SPEED (was every(30 / speed))
  machines: "A SHOT AT A MACHINE STILL DAMAGES THE ENEMY HULL.",
  // 0.8.0 P1, wave 3's four glossary sentences (DESIGN-wave3.md 3.2): E1's pool on every hull (races/bastion.ts absorb
  // and PLATE_CAP; hullEffects' wind line skips it), E2's pair (races/foundry.ts inSync), E6's matched belt (deck.ts
  // matchedRoutes) and E3's stoked factory (Battle.produce: its stamp timer, trigger cooldown and plating timer)
  plating: `PLATING TAKES DAMAGE, BURN AND POISON BEFORE YOUR HULL, UP TO ${PLATE_CAP} PLATING; THE DARK WIND GOES STRAIGHT THROUGH IT.`,
  pair: "A PAIR IS TWO LOADS THAT REACH ONE TURRET THROUGH DIFFERENT INTAKES AT ONCE; A FOUNDRY FUSION IS A PAIR.",
  matched: "A MATCHED BELT HAS AS MANY TILES AS ANOTHER BELT INTO THE SAME TURRET.",
  worksFaster: "A FACTORY THAT WORKS FASTER STAMPS AND POURS SOONER, AND ITS OTHER TIMERS RUN FASTER TOO.",
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.3): heal()'s two rules, the same for every heal (battle.ts heal: BURN halves it; from the
  // dark wind's start nothing heals)
  heal: `A HULL WITH BURN ${SW.heals} HALF, AND NOTHING ${SW.heals} IN THE DARK WIND.`,
};

/** Y3 (release Y; DESIGN-Y row 32): S.online in START's words, for ASSEMBLY LINE's texts with the star switch on (kept
 *  apart from S, whose sentences are the base's whatever the switch). */
export const S_STARTS = "RIGS NORMALLY START WORKING SOON AFTER A BATTLE STARTS, A LITTLE LATER FOR EACH RIG BEFORE THEM ON THEIR BELT.";

/** Y6 (release Y; DESIGN-Y section 4.1; BRIEF-Y6 words): S.plating without POISON, for the PLATE texts with the star switch
 *  on (POISON is retired: glossary.ts STAR_RETIRED; no switch-on payload or hull holds any). Kept apart from S, as S_STARTS
 *  is; `plating()` picks it. */
export const S_PLATING = `PLATING TAKES DAMAGE AND BURN BEFORE YOUR HULL, UP TO ${PLATE_CAP} PLATING; THE DARK WIND GOES STRAIGHT THROUGH IT.`;
/** Y6: PLATING's sentence as the switch has it (S_PLATING on; S.plating off, as before). */
const plating = (): string => (starRules() ? S_PLATING : S.plating);

/** Y7b1 (release Y; ruling Y7A-R2): the fewest loads any gun's chamber holds (TurretSpec.window at each of its stars; 2: DART,
 *  SPIKE, CARRONADE, TWIN NEEDLE). With the star switch on EXT. CHAMBER fires perShot loads a shot, at most what the chamber
 *  holds (Battle.chambers: rt.count from the stack), so a perShot above it reads UP TO n (true on every gun). */
export function fewestLoads(): number {
  let least = Infinity;
  for (const d of Object.values(ITEMS)) if (d.kind === "turret" && d.turret) for (let s = 1; s <= FUSE_MAX; s++) least = Math.min(least, effectAt(d.id, s).turret!.window);
  return least;
}
/** Y7b1 (ruling Y7A-R2): "UP TO " where a shot of `perShot` loads can fire fewer on some gun, else "" (★1's 2: every gun). */
export const upToLoads = (perShot: number): string => (perShot > fewestLoads() ? "UP TO " : "");
/** Y7b1 (ruling Y7A-R2): EXT. CHAMBER's rule as its ⓘ says it, with the star switch on. */
export const S_CHAMBER = "A SHOT NEVER FIRES MORE THAN ITS GUN'S CHAMBER HOLDS.";

/** 0.8.0 P1: a small count as a word ("TWO PLAIN SLUGS"), as DESIGN-wave3.md 3.3 writes TWIN MOULD's. */
const COUNT = ["NO", "ONE", "TWO", "THREE", "FOUR", "FIVE"];
const countWord = (n: number): string => COUNT[n] ?? String(n);

/** 0.6.2 FB-B: the stalls a MANTLET's turret ignores, in the words the shop uses for their sources (drag: DRAG CHAIN
 *  FOUNDRY, rip: GRAPNEL GUN); the spec's own list, in its order. */
export const STALL_WORD: Record<HarassCause, string> = {
  shock: "SHOCK", static: "STATIC", arc: "ARC", drag: "CHAIN", freeze: "FROST", sabot: "SABOT", rip: "GRAPNEL", limpet: "LIMPET", sap: "SAP",
  wreck: "SABOT", // Y2 (release Y): a SABOT wreck's own cause with the star switch on (no MANTLET list holds it: a turret is never wrecked)
};
function list(words: string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} AND ${words[words.length - 1]}`;
}
/** NUM-3 (R1's STUN fold): the stops a MANTLET's turret ignores: EVERY STUN when its list holds every STUN source
 *  (content.ts STUN_CAUSES, from ★1), else its list's words. */
const immunities = (e: ItemDef): string => {
  const im = m(e).immune ?? [];
  return STUN_CAUSES.every((k) => im.includes(k)) ? "EVERY STUN" : `${list(im.map((k) => STALL_WORD[k]))} STUNS`;
};
/** 0.6.2 FB-B: MANTLET ★2 FULL GUARD (NUM-3: was FULL PLATE) shields the last tile of each belt into its turret, ★3 BULWARK SKIRT the last 3
 *  (battle.ts makeSide: the last intakeGuard tiles of every connected route into it); a rig with an arrow on a shielded
 *  tile is shielded too (Battle.skirted), against the turret's own list. */
const shielded = (n: number): string => (starRules() // Y2 (release Y; DESIGN-Y row 14): with the star switch on, not their rigs
  ? (n === 1 ? "SO DOES THE LAST TILE OF EACH BELT IN." : `SO DO THE LAST ${n} TILES OF EACH BELT IN.`)
  : n === 1
    ? "SO DO THE LAST TILE OF EACH BELT IN, AND THE RIGS WORKING IT."
    : `SO DO THE LAST ${n} TILES OF EACH BELT IN, AND THE RIGS WORKING THEM.`);
/** MANTLET's clause at a star: at ★1 the stalls it ignores; above, the stalls that star adds and the tiles it shields. */
function mantletGist(e: ItemDef, stars: number): string {
  const was = stars > 1 ? effectAt("mantlet", stars - 1).mod?.immune ?? [] : [];
  const added = (m(e).immune ?? []).filter((c) => !was.includes(c)), guard = m(e).intakeGuard ?? 0;
  return [
    ...(stars <= 1 ? [`IGNORES ${immunities(e)}`] : added.length ? [`IGNORES ${list(added.map((c) => STALL_WORD[c]))} TOO`] : []),
    ...(guard ? [`GUARDS THE LAST ${guard === 1 ? "TILE" : `${guard} TILES`} OF EACH BELT IN`] : []),
  ].join(", ");
}

/** 0.6.2 FB-B (DESIGN §11 P6): the turret panel's sentence for a turret whose MANTLET ★2/★3 shields `n` belt tiles. */
export function shieldText(n: number): string {
  // NUM-4 (REVIEW-SUSB F3): MANTLET's word is GUARD (NUM-3's FULL GUARD); SHIELD is the sustain keyword (was SHIELDED)
  return `GUARDED: THE LAST ${n === 1 ? "TILE" : `${n} TILES`} OF EACH BELT IN, AND THE RIGS WORKING ${n === 1 ? "IT" : "THEM"}.`;
}

/**
 * 0.6.1p (the Prime's call) and 0.6.2 CAND-A: what a piece of gear can't do on a GATLING SPOOL, which never waits for a
 * full chamber (cores.ts gatlingReady never reads the load time): HOPPER's longer load time (0.6.2 FB-B: its ★2/★3 store
 * still takes loads while the barrel cools, tests/fb062.mech.test.ts) and FINISHER RAM's last load. 0.6.2rel2: a
 * COMPOUND BREECH (`routine` "compound") fires at 2 loads or after its own hold and never reads the load time either
 * (cores.ts ROUTINES.compound), so HOPPER's seconds do nothing there too; its slot still counts (makeTurret's window caps
 * what the chamber takes on every core), its store still works, and FINISHER RAM does fire there (the shot that empties
 * the chamber). Null for other gear, and on any other core.
 */
export function gatlingClashText(def: string, stars: number, routine = "gatling"): string | null {
  const core = routine === "gatling" ? "GATLING SPOOL" : routine === "compound" ? "COMPOUND BREECH" : null;
  if (!core) return null;
  // Y4 (release Y; DESIGN-Y rows 33-34): with the star switch on HOPPER holds no load time (its slots count on every core)
  // and TWIN TRIGGER has no shorter one (its pairs hit harder on every core): no clash
  if (starRules() && (def === "hopper" || def === "twintrigger")) return null;
  if (def === "hopper") return `${core}: THE HOPPER'S LONGER LOAD TIME DOES NOTHING HERE${effectAt(def, stars).mod?.store ? ", BUT ITS STORE STILL WORKS" : ""}.`;
  if (def === "ram" && routine === "gatling") return "GATLING SPOOL: NO FULL CHAMBER, SO THE FINISHER RAM DOES NOTHING.";
  // 0.8.0 P1 (DESIGN-wave3.md 3.3 module 13): TWIN TRIGGER's shorter load time, as HOPPER's longer one; its pair bonus
  // still works there (Battle.fire and fireCore read the pair mark, a COMPOUND shell's packed load too)
  if (def === "twintrigger") return `${core}: THE TWIN TRIGGER'S SHORTER LOAD TIME DOES NOTHING HERE, BUT PAIRS STILL HIT HARDER.`;
  return null;
}

/**
 * Y5 (release Y; DESIGN-Y row 44; REVIEW-STARD rule 7: FINISHER RAM's cue ships with its face): with the star switch on, is
 * gear `def` IDLE on a turret whose core runs `routine`? A FINISHER RAM on a GATLING SPOOL, which never waits for a full
 * chamber (gatlingClashText's RAM case): its gear row says IDLE (turretPanel.ts socketLines), the cue for the GATLING
 * sentence its face drops. Off, never (the rows as before).
 */
export function gearIdle(def: string, routine?: string): boolean {
  return starRules() && def === "ram" && routine === "gatling";
}

/**
 * 0.6.2rel2 (the release owner's answer d957272806131146): a clash's short line, for a desk turret panel whose gear list
 * leaves no room for the whole sentence (gatlingClashText): the same trigger, one line for each clashing gear type. It
 * claims no more than the sentence does: only HOPPER's seconds do nothing (its slot and store still count), and FINISHER
 * RAM nothing on a GATLING SPOOL.
 */
export function clashShortText(def: string, routine = "gatling"): string | null {
  if (routine !== "gatling" && routine !== "compound") return null;
  if (starRules() && (def === "hopper" || def === "twintrigger")) return null; // Y4: no clash with the star switch on (above)
  if (def === "hopper") return "HOPPER: ITS LONGER LOAD TIME DOES NOTHING HERE.";
  if (def === "ram" && routine === "gatling") return "FINISHER RAM: DOES NOTHING HERE.";
  if (def === "twintrigger") return "TWIN TRIGGER: ITS SHORTER LOAD TIME DOES NOTHING HERE."; // 0.8.0 P1
  return null;
}

/** The belt tiles a pendulum slug rides by `secs` on a METRONOME belt (locked at normal speed: a tile every CELL /
 *  BELT_SPEED seconds, half a tile in): ESCAPEMENT's 3 s peak is 7 tiles, CLOCKWORKS' 4.2 s is 10, LONGCASE's 5.4 s 13. */
export const peakTiles = (secs: number): number => Math.round((secs - CELL / 2 / BELT_SPEED) * BELT_SPEED / CELL);

/** MIMIC FORGE's rate against the hero's own factory (its interval x intervalMul). */
function mimicRate(e: ItemDef): string {
  const mul = imul(f(e).rate); // NUM-2: its whole rate % as the interval share rateText reads
  return Math.abs(mul - 1) < 1e-9 ? "AS OFTEN AS" : `${rateText(mul)} THAN`;
}

/** NUM-3 step 2 (REQ-BFG-047, N1 2.2's LOAD 50% SHORTER): how much shorter a core's load time is than WINDOW_TIME, as a
 *  whole percent (ROTARY BREECH's windowTime 0.75 of 1.5 s: 50%); its seconds were a non-whole number (0.8 s). */
const loadCut = (s: { windowTime?: number }): string => percent(1 - (s.windowTime ?? WINDOW_TIME) / WINDOW_TIME);

const ENTRIES: Record<string, Entry> = {
  // ----------------------------------------------------------------------------------------------------------- rigs
  temper: {
    text: (e) => [`ADDS ${g(e).burn} BURN TO EACH PAYLOAD IT HITS.`, S.burn],
    gist: (e) => `ADDS ${g(e).burn} BURN`,
  },
  whetstone: {
    text: (e) => [`ADDS ${damage(g(e).flat!)} TO EACH PAYLOAD IT HITS.`],
    gist: (e) => `ADDS ${damage(g(e).flat!)}`,
  },
  grease: {
    text: (e) => [`MAKES ${belts(e)} PAST IT ${speedText(g(e).speed!)}.`, S.locked(g(e).lockedFlat!)],
    gist: (e) => speedText(g(e).speed!),
    card: (e) => `MAKES BELTS ${speedText(g(e).speed!)}`,
  },
  brake: {
    // 0.6.1f: half speed at every star; ★2 HOT SHOE and ★3 RED-HOT SHOE add friction heat (flat damage)
    // Y3 (release Y; DESIGN-Y row 27): with the star switch on ★2/★3 slow the belt to 40% / 30% and add no damage
    text: (e) => (starRules() ? [`SLOWS ${belts(e)} PAST IT TO ${brakeSpeed(g(e).speed!)}.`, S.locked(g(e).lockedFlat!)] : [
      g(e).flat
        ? `SLOWS ${belts(e)} PAST IT TO HALF SPEED AND ADDS ${damage(g(e).flat!)} TO EACH PAYLOAD.`
        : `SLOWS ${belts(e)} PAST IT TO HALF SPEED.`,
      S.locked(g(e).lockedFlat!, !!g(e).flat),
    ]),
    gist: (e) => (starRules() ? brakeSpeed(g(e).speed!) : g(e).flat ? `ADDS ${damage(g(e).flat!)}` : "HALF SPEED"),
    card: () => "SLOWS BELTS TO HALF SPEED",
  },
  longhaul: {
    // Battle.applyHit: flat += perPriorGate x prior (at most priorCap from ★2); every applied hit counts (prior++)
    text: (e) => [
      `ADDS ${damage(g(e).perPriorGate!)} FOR EACH EARLIER RIG HIT${g(e).priorCap !== undefined ? `, UP TO ${g(e).priorCap} HITS` : ""}.`,
      "EVERY RIG HIT ON THE PAYLOAD COUNTS, SPEED RIGS TOO.",
    ],
    gist: (e) => `${damage(g(e).perPriorGate!)} FOR EACH EARLIER HIT${g(e).priorCap !== undefined ? `, UP TO ${g(e).priorCap} HITS` : ""}`,
    card: (e) => `${damage(g(e).perPriorGate!)} FOR EACH EARLIER HIT`,
  },
  coil: {
    // Battle.impact: a shocked shot stalls the machine it hits (DISRUPT_TIME, or the star's shockTime); ★2/★3 SPARK
    // JUMP: the shock also stalls the nearest other machine (Battle.sparkJump); a bare-hull hit stalls nothing
    text: (e) => {
      const t = g(e).shockTime ?? DISRUPT_TIME, jump = g(e).jump ?? 0;
      return [
        `ADDS SHOCK, WHICH ${S.stalls(t, 1 + jump)}.`,
        ...(jump ? [S.spread("STUNS", jump)] : []),
        S.hullShock,
      ];
    },
    gist: (e) => `STUNS ${g(e).jump ? plural(1 + g(e).jump!, "MACHINE") : "A MACHINE"} FOR ${seconds(g(e).shockTime ?? DISRUPT_TIME)}`,
    card: (e) => `SHOCK STUNS FOR ${seconds(g(e).shockTime ?? DISRUPT_TIME)}`,
  },
  splitter: {
    text: (e) => [
      `SPLITS EACH PAYLOAD INTO ${g(e).split!.copies} COPIES AT ${percent(g(e).split!.mult)} DAMAGE.`,
      // Y6 (release Y; DESIGN-Y 4.1): with the star switch on no POISON (retired); a copy keeps VENOM's BURN seconds too
      starRules() ? "EACH COPY KEEPS ALL OF THE BURN AND SHOCK." : "EACH COPY KEEPS ALL OF THE BURN, POISON AND SHOCK.",
    ],
    gist: (e) => `${g(e).split!.copies} COPIES AT ${percent(g(e).split!.mult)} DAMAGE`,
    card: (e) => `SPLITS INTO ${g(e).split!.copies} AT ${percent(g(e).split!.mult)}`,
  },
  overdrive: {
    // ★2 REDLINE: GUARD_SLOW (enemy CHAIN rounds can't STUN its belts from its tiles on); ★3 AFTERBURNER: + 3 flat and
    // GUARD_FREEZE (nor FROST rounds). Battle.acceptHarassment, routeGuardActive. NUM-3: no slow or freeze any more
    text: (e) => {
      const gt = g(e), guard = gt.guard ?? 0;
      return [
        `MAKES ${belts(e)} PAST IT ${speedText(gt.speed!)}${gt.flat ? ` AND ADDS ${damage(gt.flat)} TO EACH PAYLOAD` : ""}.`,
        ...(guard ? [`ENEMY CHAIN${guard & 2 ? " AND FROST" : ""} ROUNDS CAN'T STUN ${belts(e)} PAST IT.`] : []),
        S.locked(gt.lockedFlat!, !!gt.flat),
      ];
    },
    // ★2 REDLINE names the chain guard (the second sentence); ★3 AFTERBURNER its added damage (the opening). 0.8.0 B1 M2
    // (oracle 1cd5224fab866da2 (A)): REDLINE now adds +1 too, so the highlight and the gist follow the star's named perk
    // (stars.ts perkAt), not its flat
    perkAt: (e, x) => (stars.perkAt("overdrive", x.stars) === "REDLINE" ? 1 : 0),
    gist: (e, x) => `${speedText(g(e).speed!)}${stars.perkAt("overdrive", x.stars) === "REDLINE" ? ", SAFE FROM CHAINS" : g(e).flat ? `, ADDS ${damage(g(e).flat!)}` : ""}`,
    card: (e) => `MAKES BELTS ${speedText(g(e).speed!)}`,
  },
  tollbooth: {
    // Battle.acceptHarassment: while online, the toll covers the belts it hits, the rigs hitting them and the turrets
    // they feed; ★3 FACTORY GUARD (tollFactory) their factories too. g.tolls is set once a battle
    // Y2 (release Y; DESIGN-Y row 8): with the star switch on it blocks STUNs only (no HARASSMENT, the word retires), its
    // belts' factories from ★1
    text: (e) => (starRules() ? [
      `BLOCKS THE FIRST ${g(e).toll} ENEMY STUNS ON ITS BELTS AND THEIR FACTORIES EACH BATTLE.`,
      "IT ALSO GUARDS THE RIGS ON THOSE BELTS AND THE TURRETS THEY FEED.",
    ] : [
      `BLOCKS THE FIRST ${g(e).toll} ENEMY HARASSMENT HITS ON ITS BELTS${g(e).tollFactory ? " AND THEIR FACTORIES" : ""} EACH BATTLE.`,
      "IT ALSO GUARDS THE RIGS ON THOSE BELTS AND THE TURRETS THEY FEED.",
      S.harassment,
    ]),
    gist: (e) => (starRules() ? `BLOCKS ${g(e).toll} STUNS` : `BLOCKS ${g(e).toll} HITS${g(e).tollFactory ? ", FACTORIES TOO" : ""}`),
    card: (e) => (starRules() ? `BLOCKS ${g(e).toll} STUNS` : `BLOCKS ${g(e).toll} HITS OF HARASSMENT`),
  },
  sifter: {
    // harassment.ts siftDebuffs: NUM-3 (R1's STUN fold): SAP only (CHILL and SNAG are gone; no piece gives SAP yet, S.marks);
    // ★2 POLISH / ★3 FINE MESH sift all, + flat for each mark removed; ★3's siftClean on a payload with no mark
    text: (e) => {
      const gt = g(e);
      if (gt.sift !== "all") return [`REMOVES ${gt.sift === 1 ? "ONE ENEMY MARK" : `${gt.sift} ENEMY MARKS`} FROM EACH PAYLOAD IT HITS.`, S.marks];
      return [
        `REMOVES EVERY ENEMY MARK FROM EACH PAYLOAD AND ADDS ${damage(gt.siftFlat ?? 0)} FOR EACH.`,
        ...(gt.siftClean ? [`A PAYLOAD WITH NO MARK GETS ${damage(gt.siftClean)} INSTEAD.`] : []),
        S.marks,
      ];
    },
    perkAt: (e) => (g(e).siftClean ? 1 : 0),
    gist: (e) => (g(e).sift !== "all" ? "REMOVES ONE MARK"
      : g(e).siftClean ? `${damage(g(e).siftFlat ?? 0)} FOR EACH MARK, ${damage(g(e).siftClean!)} IF NONE`
        : `REMOVES EVERY MARK, ${damage(g(e).siftFlat ?? 0)} EACH`),
    card: () => "REMOVES ONE ENEMY MARK",
  },
  surge: {
    // Battle.tileSpeedAt: the pulse holds its tile `on` seconds of every `period` (else normal speed); transport: a
    // payload riding past it gains `flat` once a pulse (never on slag or a locked belt, like every speed effect)
    // T6: ★2 OVERPRESSURE's pulse damage joins the opening sentence (its name follows it), so the phone band holds it
    // Y3 (release Y; DESIGN-Y row 28; REVIEW-STARD answer 5): with the star switch on, the damage pulse (Battle.surgeTick):
    // once each period every payload on the belts it hits gains `flat`, wherever it is; no speed, no locked-belt line
    text: (e) => {
      const p = g(e).pulse!;
      if (starRules()) return [`EVERY ${seconds(p.period)}, EACH PAYLOAD ON ${belts(e)} IT HITS GAINS ${damage(p.flat)}.`, "PAYLOADS BEFORE ITS TILE GET IT TOO."];
      return [
        `PULSES ITS BELTS ${speedText(p.speed)} FOR ${seconds(p.on)} ${every(p.period)}${p.flat ? `, EACH PULSE ADDING ${damage(p.flat)}` : ""}.`,
        ...(p.flat ? ["THE DAMAGE GOES TO EVERY PAYLOAD THE PULSE SPEEDS UP."] : []),
        "BETWEEN PULSES THE BELT RUNS AT NORMAL SPEED.",
        S.locked(g(e).lockedFlat!),
      ];
    },
    gist: (e) => (starRules() ? `${damage(g(e).pulse!.flat)} ${every(g(e).pulse!.period)}`
      : `${speedText(g(e).pulse!.speed)}${g(e).pulse!.flat ? `, ${damage(g(e).pulse!.flat)} A PULSE` : ""}`),
    card: (e) => (starRules() ? `PULSES ${damage(g(e).pulse!.flat)} ONTO ITS BELTS` : `PULSES BELTS ${speedText(g(e).pulse!.speed)}`),
  },
  sorting: {
    // Battle.applyHit: g.sorted counts every arrow hit; every `every`-th makes copies - 1 more at full strength
    text: (e) => {
      const s = g(e).sort!;
      return [
        `COPIES EVERY ${nth(s.every)} PAYLOAD IT HITS${s.copies > 2 ? ` ${times(s.copies - 1)}` : ""}, AT FULL STRENGTH.`,
        "IT COUNTS EVERY PAYLOAD ITS ARROWS HIT, ON ANY BELT.",
      ];
    },
    gist: (e) => `COPIES EVERY ${nth(g(e).sort!.every)} PAYLOAD${g(e).sort!.copies > 2 ? ` ${times(g(e).sort!.copies - 1)}` : ""}`,
  },
  riveter: {
    // SUS-A (REQ-BFG-069): the field is `heal` now (compile-driven). SUS-B: its words are HEAL's (battle.ts heal(): never
    // past your full hull, half with BURN, none in the dark wind); was REPAIRS
    text: (e) => [`${SW.heals} YOUR HULL BY ${fmtDmg(g(e).heal!)} FOR EACH PAYLOAD IT HITS.`, `IT NEVER ${SW.heals} PAST YOUR FULL HULL.`, S.heal],
    gist: (e) => `${SW.heals} ${fmtDmg(g(e).heal!)} FOR EACH PAYLOAD`,
    card: (e) => `${SW.heals} ${fmtDmg(g(e).heal!)} HULL EACH HIT`,
  },
  heatjacket: {
    // transport: heatBonus += heat x ride, from the hit on; two jackets add up
    text: (e) => [`ADDS ${damage(g(e).heat!)} FOR EACH SECOND THE PAYLOAD RIDES AFTER IT.`, "TWO JACKETS ADD UP."],
    gist: (e) => `${damage(g(e).heat!)} FOR EACH SECOND`,
    card: (e) => `${damage(g(e).heat!)} A SECOND RIDDEN`,
  },
  venom: {
    // Battle.impact: the payload's poison joins the enemy hull's pool. Y6 (release Y; DESIGN-Y section 4.1): with the star
    // switch on it gives each payload it hits burnPlus seconds instead: each BURN stack of that payload's hit lasts BURN_TIME +
    // burnPlus (then SLOW EMBERS' %); it adds no BURN, so alone it deals nothing; no POISON (STAR_RETIRED). The card is the gist
    text: (e) => (starRules()
      ? [`EACH BURN ON THE PAYLOADS IT HITS LASTS ${seconds(g(e).burnPlus!)} LONGER.`, "IT ADDS NO BURN OF ITS OWN.", S.burn]
      : [`ADDS ${g(e).poison} POISON TO EACH PAYLOAD IT HITS.`, S.poison, S.poisonTime]),
    gist: (e) => (starRules() ? `BURN LASTS ${seconds(g(e).burnPlus!)} LONGER` : `ADDS ${g(e).poison} POISON`),
  },
  overclocker: {
    // Battle.makeSide: each OVERCLOCKER boosts the first later boostable rig on its belt (overclock.ts boostable);
    // Battle.applyHit: the boosted hit is doubled (overclocked) and the booster recharges for overclockCooldown
    // Y3 (release Y; DESIGN-Y row 29): with the star switch on it charges the next rig whatever it is (overclock.ts
    // chargeable), so the skip list's sentence (it still names the dormant SIFTER) leaves; off, as before
    text: (e) => (starRules() ? [
      `DOUBLES THE NEXT RIG'S HIT, THEN RECHARGES FOR ${seconds(g(e).overclockCooldown!)}.`,
      "THE NEXT RIG IS THE FIRST LATER RIG ON ITS BELT, WHATEVER IT IS.",
      "A RIG WITH NOTHING TO DOUBLE USES UP THE CHARGE.",
    ] : [
      `DOUBLES THE NEXT RIG'S HIT, THEN RECHARGES FOR ${seconds(g(e).overclockCooldown!)}.`,
      "THE NEXT RIG IS THE FIRST LATER RIG ON ITS BELT THAT CAN BE DOUBLED.",
      // 0.8.0 I1 M2 (REPORT-P1 section 13): wave 3's STOKER and BRACE FRAME act on no payload (overclock.ts boostable)
      "SPEED RIGS, TOLLBOOTHS, SIFTERS, RIVETERS, POWDER KEGS, STOKERS, BRACE FRAMES AND OVERCLOCKERS CAN'T.",
    ]),
    gist: (e) => `RECHARGES IN ${seconds(g(e).overclockCooldown!)}`,
    card: () => "DOUBLES THE NEXT RIG'S HIT",
  },
  keg: {
    // Battle.detonateKeg: once, when the fuse (running while online, paused by a STUN) ends; ★3 WIDE BLAST:
    // every belt beside the keg, not only those its arrows hit. Y5 (release Y; DESIGN-Y row 46): with the star switch on
    // Battle.kegTick: every fuse s from the battle's start (a STUN pauses the fuse) it blasts flat onto its belts; no BURN,
    // no WIDE BLAST, and no ONLINE (its fuse doesn't wait for it)
    text: (e) => {
      const k = g(e).keg!;
      if (starRules()) {
        return [
          `EVERY ${seconds(k.fuse)} IT BLOWS UP, ADDING ${damage(k.flat)} TO EVERY PAYLOAD ON ITS BELTS.`,
          "ITS FUSE RUNS FROM THE START OF THE BATTLE; A STUN PAUSES IT.",
        ];
      }
      return [
        `ADDS ${damage(k.flat)} AND ${k.burn} BURN TO EVERY PAYLOAD ON ${k.wide ? "EVERY BELT BESIDE IT" : "ITS BELTS"} WHEN IT BLOWS UP.`,
        `IT BLOWS ONCE, ${seconds(k.fuse)} AFTER IT COMES ONLINE; A STUN PAUSES THE FUSE.`, // NUM-3: no freeze any more
        S.burn,
      ];
    },
    gist: (e) => (starRules() ? `${damage(g(e).keg!.flat)} ${every(g(e).keg!.fuse)}`
      : `${damage(g(e).keg!.flat)} AND ${g(e).keg!.burn} BURN${g(e).keg!.wide ? " ON EVERY BELT BESIDE IT" : ` AFTER ${seconds(g(e).keg!.fuse)}`}`),
    card: (e) => (starRules() ? `BLOWS UP ${every(g(e).keg!.fuse)}` : `BLOWS UP: ${damage(g(e).keg!.flat)}, ${g(e).keg!.burn} BURN`),
  },
  bellows: {
    // NUM-3 step 2 (compile-driven): burnPerRide is { burn, per, max }: floor(ride x burn / per) BURN, at most max (deck.ts
    // walkRoute, Battle.applyHit); was 1 BURN every `seconds`. The same sentence, read from the new fields
    // NUM-3 step 2, batch C: FOR EACH (docs/TEXT-STYLE.md 8.4's word for a rate; was FOR EVERY), and the gist says FOR EACH
    // too, never EVERY n SECONDS, which reads as a timer (TEXT-STYLE 3.2): it adds the BURN once, as the payload passes
    // Y3 (release Y; DESIGN-Y row 22): with the star switch on, for each whole `per` s and no cap (no UP TO)
    text: (e) => [
      `ADDS ${g(e).burnPerRide!.burn} BURN FOR EACH ${seconds(g(e).burnPerRide!.per)} THE PAYLOAD HAS RIDDEN${starRules() ? "" : `, UP TO ${g(e).burnPerRide!.max} BURN`}.`,
      S.burn,
    ],
    gist: (e) => `${g(e).burnPerRide!.burn} BURN FOR EACH ${seconds(g(e).burnPerRide!.per)}${starRules() ? "" : `, UP TO ${g(e).burnPerRide!.max} BURN`}`,
    card: (e) => (starRules() ? "BURN FOR RIDE TIME" : `BURN FOR RIDE TIME, UP TO ${g(e).burnPerRide!.max}`),
  },
  quench: {
    // 0.6.2 FB-B (Battle.applyHit): + flat on every payload it hits; then up to `stacks` of the payload's Burn, each
    // spent for perBurn more damage (a Burn is worth 1 damage a second for 3 seconds); any more Burn stays on it
    // Y3 (release Y; DESIGN-Y row 23): with the star switch on, no flat and no stack cap: every BURN turns
    text: (e) => {
      const q = g(e).quench!;
      if (starRules()) return [`TURNS EACH BURN ON THE PAYLOADS IT HITS INTO ${damage(q.perBurn)}.`, S.burn];
      return [
        `ADDS ${damage(q.flat)} TO EACH PAYLOAD IT HITS, THEN TURNS UP TO ${q.stacks} OF ITS BURN INTO ${moreDamage(q.perBurn)} EACH.`,
        "ANY MORE BURN STAYS ON THE PAYLOAD.",
        S.burn,
      ];
    },
    gist: (e) => (starRules() ? `${damage(g(e).quench!.perBurn)} FOR EACH BURN`
      : `ADDS ${damage(g(e).quench!.flat)}, THEN ${moreDamage(g(e).quench!.perBurn)} FOR EACH BURN, UP TO ${g(e).quench!.stacks} BURN`),
    card: () => "TURNS BURN INTO DAMAGE",
  },
  staticbrush: {
    // Battle.impact: a static payload that hits bare hull stalls a random enemy turret
    text: (e) => [`PAYLOADS IT HITS STUN AN ENEMY TURRET FOR ${seconds(g(e).staticTime!)} WHEN THEY HIT BARE HULL.`, "THE TURRET IS PICKED AT RANDOM."],
    gist: (e) => `STUNS A TURRET FOR ${seconds(g(e).staticTime!)}`,
    card: () => "HULL HITS STUN A TURRET",
  },
  lodestone: {
    // Battle.applyHit: the foe's rigs, factories and turrets stalled, frozen or wrecked as the payload passes.
    // 0.6.2rel3 (TUNE-M T2, adf77b2): the floor (gate.flat, +1/+2/+3) on every payload it hits, then the per-stalled
    // bonus on top, capped by perStalled.max; one sentence, so the floor never shows without the bonus or the other way.
    // As short as the sentence it replaces (it must still fit the phone band and the desk column whole)
    // Y2 (release Y; DESIGN-Y row 15): with the star switch on, no floor and no cap; a stunned belt tile counts, a wrecked
    // rig doesn't (Battle.applyHit)
    text: (e) => (starRules() ? [
      `ADDS ${damage(g(e).perStalled!.each)} FOR EACH ENEMY MACHINE STUNNED, BELT TILES TOO.`,
      "WRECKED RIGS DON'T COUNT.",
    ] : [
      `ADDS ${damage(g(e).flat ?? 0)}, AND ${fmtDmg(g(e).perStalled!.each)} FOR EACH ENEMY MACHINE STUNNED, UP TO ${damage(g(e).perStalled!.max)}.`,
      "WRECKED MACHINES COUNT TOO; BELT TILES DON'T.", // NUM-3 (R1's STUN fold): nothing freezes any more
    ]),
    gist: (e) => (starRules() ? `ADDS ${damage(g(e).perStalled!.each)} FOR EACH STUN ON THE FOE`
      : `ADDS ${damage(g(e).flat ?? 0)}, AND ${fmtDmg(g(e).perStalled!.each)} FOR EACH STUNNED MACHINE`),
    card: (e) => (starRules() ? `${damage(g(e).perStalled!.each)} FOR EACH STUN` : `${damage(g(e).flat ?? 0)}, MORE FOR EACH STUN`),
  },
  barbed: {
    // Battle.impact: the hull's fray limit rises to FRAY_MAX + frayCap (★2/★3 RAZOR WIRE)
    text: (e) => [
      g(e).frayCap
        ? `ADDS ${g(e).fray} FRAY TO EACH PAYLOAD IT HITS AND LETS THE ENEMY HULL HOLD ${FRAY_MAX + g(e).frayCap!} FRAY.`
        : `ADDS ${g(e).fray} FRAY TO EACH PAYLOAD IT HITS.`,
      S.fray(g(e).frayCap ? undefined : FRAY_MAX),
    ],
    gist: (e) => `ADDS ${g(e).fray} FRAY${g(e).frayCap ? `, UP TO ${FRAY_MAX + g(e).frayCap!} FRAY` : ""}`,
  },
  counterweight: {
    // Y5 (release Y; DESIGN-Y row 41): with the star switch on there is no cap (its def has no max: content.ts STAR_DIFF)
    text: (e) => [`ADDS ${damage(g(e).perTile!.each)} FOR EACH BELT TILE THE PAYLOAD HAS RIDDEN${starRules() ? "" : `, UP TO ${damage(g(e).perTile!.max!)}`}.`],
    gist: (e) => `${damage(g(e).perTile!.each)} FOR EACH TILE${starRules() ? "" : `, UP TO ${damage(g(e).perTile!.max!)}`}`,
    card: (e) => `${damage(g(e).perTile!.each)} FOR EACH TILE RIDDEN`,
  },
  // ------------------------------------------------------------------------------------------------------ factories
  press: {
    text: (e) => [`STAMPS ${f(e).base !== undefined ? "A SLUG" : "A PLAIN SLUG"} (${damage(slugBase(e))}) ${rate(f(e).speed)}.`],
    gist: (e) => `${damage(slugBase(e))} SLUGS ${rate(f(e).speed)}`,
    card: (e) => `A SLUG ${rate(f(e).speed)}`,
  },
  doublestamp: {
    text: (e) => [
      `STAMPS ${f(e).batch} ${f(e).base !== undefined ? "SLUGS" : "PLAIN SLUGS"} (${damage(slugBase(e))} EACH) ${rate(f(e).speed)}.`,
      "THEY LEAVE ONE BY ONE AS THE BELT MAKES ROOM.",
    ],
    gist: (e) => `${f(e).batch} SLUGS OF ${damage(slugBase(e))} ${rate(f(e).speed)}`,
    card: (e) => `${f(e).batch} SLUGS ${rate(f(e).speed)}`,
  },
  shottower: {
    text: (e) => [`DROPS ${f(e).batch} BUCKSHOT (${damage(slugBase(e))} EACH) ${rate(f(e).speed)}.`, "RIGS HIT EACH BUCKSHOT ON ITS OWN."],
    gist: (e) => `${damage(slugBase(e))} BUCKSHOT ${rate(f(e).speed)}`,
    card: (e) => `${f(e).batch} BUCKSHOT ${rate(f(e).speed)}`,
  },
  hotswap: {
    // Battle.stamp: each stamp writes the next preset of the cycle (EMBER: + burn; SPARK: shock, + shockTime and jump)
    text: (e) => {
      const em = f(e).cycle!.find((p) => p.tint === "ember")!, sp = f(e).cycle!.find((p) => p.tint === "spark")!;
      return [
        `STAMPS EMBER SLUGS WITH ${em.burn ?? 0} BURN AND SPARK SLUGS WITH SHOCK, IN TURN.`,
        S.stamps("ONE", f(e).speed),
        `THE SPARK'S SHOCK ${S.stalls(sp.shockTime ?? DISRUPT_TIME, 1 + (sp.jump ?? 0))}.`,
        S.burn,
      ];
    },
    gist: (e) => {
      const em = f(e).cycle!.find((p) => p.tint === "ember")!, sp = f(e).cycle!.find((p) => p.tint === "spark")!;
      return `${em.burn ?? 0} BURN, SHOCK STUNS ${sp.jump ? plural(1 + sp.jump, "MACHINE") : "A MACHINE"} FOR ${seconds(sp.shockTime ?? DISRUPT_TIME)}`;
    },
    card: () => "BURN AND SHOCK SLUGS IN TURN",
  },
  slagpot: {
    // Battle.transport: slag keeps AMMO.slag.fixedSpeed whatever the speed rigs and the speed lock (NUM-3: no enemy slows)
    text: (e) => [
      `STAMPS A HEAVY SLAG SLUG (${damage(slugBase(e))}) ${rate(f(e).speed)}.`,
      `SLAG ALWAYS RIDES AT ${percent(AMMO.slag.fixedSpeed!)} SPEED: SPEED RIGS CAN'T CHANGE IT.`,
    ],
    gist: (e) => `${damage(slugBase(e))} SLAG ${rate(f(e).speed)}`,
    card: (e) => `HEAVY ${damage(slugBase(e))} SLAG SLUGS`,
  },
  assembly: {
    // Battle.makeSide (assemblyLines): while it feeds a turret, every rig's online time x commission; its own belts'
    // rigs at 0 s; ★3 HOT START overclocks its belts' rigs (every hit doubled) until hotStart seconds
    // Y3 (release Y; DESIGN-Y row 32): with the star switch on its own belt's rigs take the same factor and HOT START is
    // gone (Battle.makeSide); its texts say START, as its face does (no ONLINE)
    text: (e) => {
      const fs = f(e), k = fs.commission!;
      if (starRules()) {
        return [
          `WHILE IT FEEDS A TURRET, ${k <= 0 ? "ALL " : ""}YOUR RIGS START WORKING ${startIn(k)}, THOSE ON ITS OWN BELT TOO.`,
          S.stamps(`A PLAIN SLUG (${damage(slugBase(e))})`, fs.speed),
          S_STARTS,
        ];
      }
      return [
        `WHILE IT FEEDS A TURRET, ${k <= 0 ? "ALL " : ""}YOUR RIGS COME ONLINE ${onlineIn(k)}.`,
        fs.hotStart ? `RIGS ON ITS OWN BELT HIT TWICE AS HARD FOR THE FIRST ${seconds(fs.hotStart)}.` : "RIGS ON ITS OWN BELT COME ONLINE AT ONCE.",
        S.stamps(`A PLAIN SLUG (${damage(slugBase(e))})`, fs.speed),
        S.online,
      ];
    },
    perkAt: (e) => (f(e).hotStart ? 1 : 0),
    gist: (e) => (starRules() ? `${f(e).commission! <= 0 ? "ALL " : ""}RIGS START ${startIn(f(e).commission!)}`
      : `${f(e).commission! <= 0 ? "ALL " : ""}RIGS ONLINE ${onlineIn(f(e).commission!)}`),
    card: (e) => (starRules() ? `RIGS START ${startIn(f(e).commission!)}` : "RIGS ONLINE IN HALF THE TIME"),
  },
  gantry: {
    text: (e, x) => [
      `FEEDS ${outputsAt(e.id, x.stars)} BELTS IN TURN, STAMPING ${f(e).base !== undefined ? "A SLUG" : "A PLAIN SLUG"} (${damage(slugBase(e))}) ${rate(f(e).speed)}.`,
    ],
    // bb-0.8.3 (REQ-BFG-042 M4): the next-star and MERGES WITH lines lead with a factory's belts at that star (nextStarText),
    // so the gist says the rest: FOURTH ARM's faster stamp, HEAVY GANTRY's slugs. T47 (REQ-BFG-047): no seconds, so ★1
    // says its belts (0.8.4's gist) and FOURTH ARM says FASTER
    gist: (e, x) =>
      f(e).base !== undefined
        ? `${damage(slugBase(e))} SLUGS`
        : f(e).speed > f(effectAt(e.id, 1)).speed // NUM-4: compares the SPEEDs (was their intervals)
          ? "FASTER PLAIN SLUGS"
          : `FEEDS ${outputsAt(e.id, x.stars)} BELTS`,
    card: (e, x) => `FEEDS ${outputsAt(e.id, x.stars)} BELTS IN TURN`,
  },
  scrapper: {
    // Battle.produce: the timer stamps every interval whatever happens, and each harassment the side lands queues one
    // more stamp (up to 3 waiting); ★3 BIG HAUL: a rig its sabots wreck queues one more (Battle.acceptHarassment)
    // Y2 (release Y; DESIGN-Y row 9): with the star switch on it counts your STUNs only, with no cap, and BIG HAUL goes
    text: (e) => (starRules() ? [
      `STAMPS SCRAP SLUGS THAT DEAL ${moreDamage(f(e).scrapFlat!)} THAN PLAIN ONES.`,
      `IT STAMPS ONE ${rate(f(e).speed)}, AND ONE MORE EACH TIME YOUR STUN LANDS.`,
    ] : [
      `STAMPS SCRAP SLUGS THAT DEAL ${moreDamage(f(e).scrapFlat!)} THAN PLAIN ONES.`,
      `IT STAMPS ONE ${rate(f(e).speed)}, AND ONE MORE EACH TIME YOUR HARASSMENT LANDS, UP TO ${SIM.scrapQueue} WAITING.`,
      // ★3 BIG HAUL: a sabot wreck is harassment (one stamp) and a wreck (one more): self-contained, as the phone band
      // may show it without the sentence before it
      ...(f(e).bigHaul ? ["A RIG YOUR SABOTS WRECK EARNS 2 SCRAP SLUGS, NOT 1."] : []),
      S.harassment,
    ]),
    perkAt: (e) => (f(e).bigHaul && !starRules() ? 2 : 0),
    // the numbers that change; ★3's BIG HAUL is named after this clause (newPerk), and its sentence says what it does
    gist: (e) => `${moreDamage(f(e).scrapFlat!)}, ONE ${rate(f(e).speed)}`,
    card: (e) => `SCRAP SLUGS, ${moreDamage(f(e).scrapFlat!)}`,
  },
  sabot: {
    // Battle.roundImpact: a rig is wrecked (for the battle); NUM-3 (R1's STUN fold): any other part (a belt tile, a factory,
    // a turret) is STUNned for round.seconds (was 5 / 4 / 3 s by target; its bare-hull + 6 is gone); ★3 SHRAPNEL: the belt
    // tiles either side of where it landed are STUNned 2 s
    text: (e) => {
      const r = round<{ seconds: number; shrapnel?: boolean }>(e);
      return [
        "STAMPS SABOTS THAT WRECK THE ENEMY RIG THEY HIT FOR THE REST OF THE BATTLE.",
        S.stamps("ONE", f(e).speed),
        ...(r.shrapnel ? [`ON A RIG OR BELT, IT ALSO STUNS THE TILES ON EITHER SIDE FOR ${seconds(SIM.shrapnel)}.`] : []),
        `ANY OTHER MACHINE A SABOT HITS IS STUNNED FOR ${seconds(r.seconds)}.`,
      ];
    },
    perkAt: (e) => (round<{ shrapnel?: boolean }>(e).shrapnel ? 2 : 0),
    // ★3's SHRAPNEL is named after this clause (newPerk), so the clause doesn't name it too
    gist: (e) => `A SABOT ${rate(f(e).speed)}`,
    card: () => "SABOTS WRECK ENEMY RIGS",
  },
  frostbite: {
    // Battle.roundImpact: NUM-3 (R1's STUN fold): STUN the machine it hits (cause "freeze"), then the `spread` nearest
    // others (★2/★3 HOARFROST); was a freeze, whose frozen belt tile CHILLed its payloads
    text: (e) => {
      const r = round<{ seconds: number; spread: number }>(e);
      return [
        `STAMPS ROUNDS THAT STUN ${r.spread ? `${r.spread + 1} MACHINES` : "THE MACHINE THEY HIT"} FOR ${seconds(r.seconds)}.`,
        ...(r.spread ? [S.spread("STUNS", r.spread)] : []),
        S.stamps("ONE", f(e).speed),
        "A ROUND THAT HITS BARE HULL STUNS NOTHING.",
      ];
    },
    gist: (e) => {
      const r = round<{ seconds: number; spread: number }>(e);
      return `STUNS ${r.spread ? plural(r.spread + 1, "MACHINE") : "A MACHINE"} FOR ${seconds(r.seconds)}`;
    },
    card: (e) => `STUNS A MACHINE FOR ${seconds(round<{ seconds: number }>(e).seconds)}`,
  },
  dragchain: {
    // Battle.roundImpact: NUM-3 (R1's STUN fold): STUN the machine it hits (cause "drag"); was a belt slow over the stretch
    // between two rigs with SNAG (20% slower ride), or a factory's next slug + 0.8 s and a turret's next shot + 0.5 s
    text: (e) => {
      const r = round<{ seconds: number }>(e);
      return [
        `STAMPS CHAIN ROUNDS THAT STUN THE ENEMY MACHINE THEY HIT FOR ${seconds(r.seconds)}.`,
        S.stamps("ONE", f(e).speed),
        "A ROUND THAT HITS BARE HULL STUNS NOTHING.",
      ];
    },
    gist: (e) => `STUNS A MACHINE FOR ${seconds(round<{ seconds: number }>(e).seconds)}`,
    card: (e) => `CHAIN ROUNDS STUN FOR ${seconds(round<{ seconds: number }>(e).seconds)}`,
  },
  // 0.8.0 H1 (REQ-BFG-032, REQ-BFG-011): the two playable race heroes' signature factories, never sold (no card, no
  // stars). Each says what its ammo does too, from the race rules' own numbers (races/foundry.ts, races/bastion.ts).
  crucible: {
    // races/foundry.ts crucibleProduce (the twin pour), tryFuse/inSync (another intake, SYNC_WINDOW), fuse (FUSE_MULT)
    // bb-0.8.3 (REQ-BFG-044 D10, D4): its belt slots at its FACTORY level (2 / 3 / 4 / 5) and its pour of 2: at level 1 its
    // slots are its pour (0.8.0's sentence); from level 2 each pour takes 2 of its belts in turn (rule R)
    text: (e, x) => {
      const n = outputsAt(e.id, x.stars), pour = f(e).pour ?? 2;
      return [
        n <= pour
          ? `POURS AN ALLOY BLANK ONTO EACH OF ITS ${plural(n, "BELT")} AT THE SAME MOMENT.`
          : `POURS AN ALLOY BLANK ONTO ${pour} OF ITS ${n} BELTS AT THE SAME MOMENT, TAKING ITS BELTS IN TURN.`,
        `AN ALLOY BLANK DEALS ${damage(slugBase(e))}.`, // bb-0.8.3: the same at every level (its levels grow its cycle only)
        `TWO BLANKS THAT REACH ONE TURRET THROUGH DIFFERENT INTAKES AT ONCE FUSE INTO AN ALLOY SLUG THAT DEALS THEIR DAMAGE AND ${percent(FUSE_MULT - 1)} MORE.`, // NUM-4: no 0.25 s, no 1.15 TIMES
        "A BLANK WITH NO PARTNER FIRES ON ITS OWN.",
      ];
    },
    // bb-0.8.3 (oracle 6c20deea1363d0bb): a level grows the cycle only (the blank's damage is the same at every level)
    gist: (e) => `POURS ${f(e).pour} ALLOY BLANKS`, // T47 (REQ-BFG-047): no seconds
  },
  // bb-0.8.3 (REQ-BFG-043, REQ-BFG-044 D10, M4): FURNACE's, WEAVER's, METRONOME's and SIPHON's own factories level up
  // through the hero's FACTORY upgrade, so their panels read their numbers at their level, as a sold module's do at its
  // stars (they read only their catalogue desc before). Battle.stamp deals one slug a cycle onto their belts in turn.
  kiln: {
    // payloadDamage: the slug's base (the same at every level: oracle 6c20deea1363d0bb) + AMMO.cinder.rideScale a second
    // of ride. A level changes its cycle and its belts, nothing else
    text: (e, x) => [
      `STAMPS CINDER SLUGS ONTO UP TO ${plural(outputsAt(e.id, x.stars), "BELT")} IN TURN.`,
      `A CINDER SLUG DEALS ${damage(slugBase(e))}, AND MORE THE LONGER IT RIDES.`, // T47 (REQ-BFG-047): no decimal
    ],
    gist: () => "CINDER SLUGS", // T47 (REQ-BFG-047): no seconds
  },
  loom: {
    // races-free: AMMO.thread (FRAY_BONUS a fray stack on every later hit, up to FRAY_MAX), the slug's base
    text: (e, x) => [
      `WEAVES THREAD SLUGS ONTO UP TO ${plural(outputsAt(e.id, x.stars), "BELT")} IN TURN.`,
      `A THREAD SLUG DEALS ${damage(slugBase(e))}, AND EACH ONE THAT HITS FRAYS THE ENEMY HULL SO EVERY LATER HIT DEALS MORE DAMAGE, UP TO ${FRAY_MAX} FRAY.`, // T47 (REQ-BFG-047): no decimal
    ],
    gist: () => "THREAD SLUGS", // T47 (REQ-BFG-047): no seconds
  },
  clockworks: {
    // races/data.ts pendulumCurve: PENDULUM.floor, rising to floor + swing at PENDULUM.peak seconds of ride, then falling
    text: (e, x) => [
      `STAMPS PENDULUM SLUGS ONTO UP TO ${plural(outputsAt(e.id, x.stars), "BELT")} IN TURN.`,
      `A PENDULUM SLUG DEALS ${damage(PENDULUM.floor)}, RISING TO ${damage(PENDULUM.floor + PENDULUM.swing)} PARTWAY THROUGH ITS RIDE, THEN FALLING AGAIN.`, // T47 (REQ-BFG-047)
    ],
    gist: () => "PENDULUM SLUGS", // T47 (REQ-BFG-047): no seconds
  },
  sump: {
    // races/siphon.ts sumpProduce (in turn, each slug marked for the gun its belt feeds: DRAG or ECHO)
    text: (e, x) => [
      `STAMPS LEECH SLUGS ONTO UP TO ${plural(outputsAt(e.id, x.stars), "BELT")} IN TURN.`,
      `A LEECH SLUG DEALS ${damage(slugBase(e))}.`,
    ],
    gist: () => "LEECH SLUGS", // T47 (REQ-BFG-047): no seconds
  },
  wardworks: {
    // races/bastion.ts plateOnLoad (PLATE_PER_SLUG x the split multiplier, at load, PLATE_CAP) and absorb (impacts and
    // Burn); battle.ts: the dark wind never meets the plating
    text: (e, x) => [
      `STAMPS BULWARK SLUGS ONTO UP TO ${plural(outputsAt(e.id, x.stars), "BELT")} IN TURN.`, // bb-0.8.3 (M4)
      `A BULWARK SLUG DEALS ${damage(slugBase(e))}.`, // bb-0.8.3: the same at every level (oracle 6c20deea1363d0bb)
      `EACH ONE THAT LOADS INTO A TURRET PLATES YOUR HULL BY ${fmtDmg(PLATE_PER_SLUG)}, UP TO ${PLATE_CAP} PLATING; A SPLITTER COPY PLATES BY ITS SHARE.`,
      "PLATING TAKES HITS AND BURN BEFORE YOUR HULL DOES, AND IT LASTS UNTIL THE BATTLE ENDS.",
      "THE DARK WIND IGNORES PLATING.",
    ],
    gist: () => "BULWARK SLUGS", // bb-0.8.3 (M4); T47 (REQ-BFG-047): no seconds
  },
  mimic: {
    // Battle.factoryDef: the hero's ammo at the hero factory's interval x intervalMul; bb-0.8.3 (REQ-BFG-042 D3): its belt
    // slots grow with its stars as every bought factory's; ★3 TWIN SIGNET pours 2 where it makes FOUNDRY's blanks (pourAt)
    text: (e, x) => {
      const fs = f(e);
      const hero = x.hero ? HEROES[x.hero] : undefined, sig = hero ? ITEMS[hero.factory]?.factory : undefined;
      const ammo = hero ? AMMO[hero.ammo].name.replace(/:.*$/, "") : "";
      const pour = hero ? pourAt(e.id, x.stars, hero.ammo) : 0;
      return [
        `STAMPS YOUR HERO'S SIGNATURE AMMO ${mimicRate(e)} ITS OWN FACTORY.`,
        ...(hero && sig ? [`FOR ${hero.name}, THAT IS ${an(ammo)} ${rate(factorySpeed(e.id, fs, x.hero!))}${pour ? `, POURED ONTO ${pour} BELTS AT ONCE` : ""}.`] : []),
      ];
    },
    // 0.6.2t2 (F3): the hero's example belongs to the rate it spells out, so it sits before ★3 TWIN SIGNET and the perk
    // ends the text (after it, "FOR FURNACE, ..." read on from the name); without a hero there is no example
    perkAt: (_e, x) => (x.hero ? 1 : 0),
    gist: (e, x) => {
      const mul = imul(f(e).rate), pour = x.hero ? pourAt(e.id, x.stars, HEROES[x.hero].ammo) : 0;
      const more = pour ? `, POURS ${pour} AT ONCE` : "";
      return Math.abs(mul - 1) < 1e-9 ? `AS OFTEN AS YOUR HERO'S FACTORY${more}` : `${rateText(mul)}${more}`;
    },
    card: () => "STAMPS YOUR HERO'S AMMO",
  },
  limpet: {
    // Battle.roundImpact / hullEffects: the charge sticks where it lands and blasts the enemy hull `delay` seconds
    // later; from ★2 the blast also stalls what it stuck to (round.stall; a 1-star charge never stalls: 0b.1)
    text: (e) => {
      const r = round<{ delay: number; blast: number; stall?: number }>(e);
      return [
        `STAMPS CHARGES THAT BLAST THE ENEMY HULL FOR ${damage(r.blast)}, ${seconds(r.delay)} AFTER THEY LAND.`,
        ...(r.stall ? [`THE BLAST ALSO STUNS THE MACHINE THE CHARGE STUCK TO FOR ${seconds(r.stall)}.`] : []),
        S.stamps("ONE", f(e).speed),
      ];
    },
    gist: (e) => {
      const r = round<{ delay: number; blast: number; stall?: number }>(e);
      return `BLASTS FOR ${damage(r.blast)}${r.stall ? ` AND STUNS FOR ${seconds(r.stall)}` : ""}`;
    },
    card: (e) => `BLASTS THE HULL FOR ${damage(round<{ blast: number }>(e).blast)}`,
  },
  // -------------------------------------------------------------------------------------------------- turret cores
  scatter: {
    // Battle.fireCore: `pellets` shots at `share` each, a target draw each; burn divided (rounded up), shock on each
    text: (e, x) => [
      `BURSTS EACH SHOT INTO ${c(e, x).pellets} PELLETS WITH ${percent(c(e, x).share!)} OF ITS DAMAGE EACH.`,
      "EACH PELLET PICKS ITS OWN TARGET.",
      "THE BURN IS SPLIT BETWEEN THE PELLETS; EACH PELLET KEEPS THE SHOCK.",
    ],
    gist: (e, x) => `${c(e, x).pellets} PELLETS, ${percent(c(e, x).share!)} EACH`,
    card: (e, x) => `SHOTS BURST INTO ${c(e, x).pellets} PELLETS`,
  },
  rotary: {
    // cores.ts ROUTINES.rotary: FIFO; its windowTime; ★2 GREASED RACE / ★3 CLEAN FEED: intervalMul (and noJam)
    // NUM-3 step 2 (REQ-BFG-047, N1 2.2): its load time as the whole % shorter (loadCut: windowTime 0.75 of WINDOW_TIME's
    // 1.5 s, 50%); was CUTS THE LOAD TIME TO 0.8 SECONDS, gist LOAD TIME 0.8 SECONDS, card CUTS LOAD TIME TO 0.8 SECONDS
    text: (e, x) => {
      const s = c(e, x);
      // Y4 (release Y; DESIGN-Y row 37): with the star switch on, its one rule: a part-full chamber fires loadCut sooner
      // (its windowTime 0.75 / 0.525 / 0.3 s of WINDOW_TIME's 1.5 s); no fire rate, no NEVER JAMS, no LOAD TIME
      if (starRules()) return [`IT FIRES A PART-FULL CHAMBER ${loadCut(s)} SOONER, THE OLDEST LOAD FIRST.`];
      return [
        `ITS LOAD TIME IS ${loadCut(s)} SHORTER, AND IT FIRES THE OLDEST LOAD FIRST.`,
        ...(s.fireRate ? [`IT FIRES ${rateText(imul(s.fireRate))}${s.noJam ? " AND NEVER JAMS" : ""}.`] : []),
        S.chamber,
      ];
    },
    perkAt: (e, x) => (c(e, x).fireRate ? 1 : 0),
    gist: (e, x) => {
      const s = c(e, x);
      if (starRules()) return `PART-FULL CHAMBERS ${loadCut(s)} SOONER`; // Y4
      return s.fireRate ? `FIRES ${rateText(imul(s.fireRate))}${s.noJam ? ", NEVER JAMS" : ""}` : `LOAD ${loadCut(s)} SHORTER`;
    },
    card: (e, x) => (starRules() ? `PART-FULL CHAMBERS ${loadCut(c(e, x))} SOONER` : `LOAD TIME ${loadCut(c(e, x))} SHORTER`), // Y4
  },
  pressure: {
    // cores.ts pressureBonus: waiting at its intakes plus in its chamber, this load included, up to maxCount
    text: (e, x) => [
      `SHOTS DEAL ${moreDamage(c(e, x).perQueued!)} FOR EACH PAYLOAD WAITING, UP TO ${plural(c(e, x).maxCount!, "PAYLOAD")}.`,
      "WAITING MEANS IN THE CHAMBER OR BACKED UP AT ITS INTAKES.",
      "THE TURRET NEVER JAMS.",
    ],
    gist: (e, x) => `${moreDamage(c(e, x).perQueued!)} FOR EACH PAYLOAD WAITING`,
    card: (e, x) => `EACH WAITING LOAD ADDS ${damage(c(e, x).perQueued!)}`,
  },
  gatling: {
    // cores.ts gatlingReady / gatlingCadence: no window; the cooldown is the interval x spin, spin from `start` down by
    // `step` for each shot within `gap` seconds of the last, to `floor`; a longer pause halves the spin
    text: (e, x) => {
      const s = c(e, x);
      return [
        `FIRES EACH LOAD AS SOON AS THE BARREL IS READY, SPINNING UP TO ${rateText(imul(s.top))}.`,
        `IT STARTS ${rateText(imul(s.start))}; EACH SHOT SOON AFTER THE LAST TAKES ${percent(s.step!)} OFF THE RELOAD.`, // NUM-4: the 2.5 s gap is a hidden timer (N1 2.2)
        "A LONGER PAUSE LOSES HALF THE SPIN.",
      ];
    },
    gist: (e, x) => `SPINS UP TO ${rateText(imul(c(e, x).top))}`,
    card: () => "FIRES AT ONCE, SPINS UP",
  },
  hullbreaker: {
    text: (e, x) => [`EVERY SHOT HITS THE ENEMY HULL FOR ${percent(c(e, x).hullMul! - 1)} MORE DAMAGE, NEVER A MACHINE.`],
    gist: (e, x) => `${percent(c(e, x).hullMul! - 1)} MORE HULL DAMAGE`,
  },
  drake: {
    // cores.ts drakeConvert: floor(flat / flatPerBurn) burns; + addBurn (x k, rounded half up, at least 1); burnTime;
    // flight x flightMul
    text: (e, x) => {
      const s = c(e, x);
      // Y4 (release Y; DESIGN-Y row 40): with the star switch on, its one rule (flatPerBurn 25 / 18 / 13: Y7b1, ruling Y7A-R4's fallback;
      // Y4's 10 / 7 / 5) and what BONUS
      // DAMAGE is; the free BURN, the longer BURN and the quicker shot are gone
      if (starRules()) return [`TURNS EACH SHOT'S BONUS DAMAGE INTO BURN: 1 BURN FOR EVERY ${damage(s.flatPerBurn!)}.`, S.bonus];
      return [
        `TURNS EACH SHOT'S BONUS DAMAGE INTO BURN: 1 BURN FOR EVERY ${damage(s.flatPerBurn!)}.`,
        `EACH SHOT GETS ${s.addBurn} MORE BURN, AND ITS BURN LASTS ${seconds(s.burnTime!)} INSTEAD OF ${seconds(BURN_TIME)}.`,
        S.bonus,
        `ITS SHOTS LAND ${percent(1 - s.flightMul!)} SOONER.`,
      ];
    },
    gist: (e, x) => `1 BURN FOR EVERY ${damage(c(e, x).flatPerBurn!)}`,
    card: () => "TURNS BONUS DAMAGE INTO BURN",
  },
  salvo: {
    // cores.ts ROUTINES.salvo: waits for a full chamber (or twice the load time), fires it all, reloads x reloadMul
    text: (e, x) => [
      `FIRES A FULL CHAMBER AT ONCE, EACH SHELL DEALING ${moreDamage(c(e, x).volleyFlat!)}.`,
      `IT WAITS FOR A FULL CHAMBER, OR ${times(SIM.salvoWait)} ITS LOAD TIME.`,
      `AFTER A VOLLEY ITS RELOAD TAKES ${percent(c(e, x).reloadMul! - 1)} LONGER.`,
    ],
    gist: (e, x) => `${moreDamage(c(e, x).volleyFlat!)} FOR EACH SHELL`,
    card: () => "FIRES A FULL CHAMBER AT ONCE",
  },
  mortar: {
    text: (e, x) => {
      const s = c(e, x);
      return [`EACH SHOT ALSO SPLASHES ${plural(s.splash!, "MORE TARGET")} FOR ${percent(s.share!)} OF ITS DAMAGE.`, "ITS SHOTS TAKE LONGER TO LAND."]; // NUM-4: its x2.2 flight is a hidden timer (N1 2.2)
    },
    gist: (e, x) => `SPLASHES ${c(e, x).splash} MORE AT ${percent(c(e, x).share!)}`,
    card: (e, x) => `SPLASHES ${plural(c(e, x).splash!, "MORE TARGET")}`,
  },
  grapnel: {
    // Battle.rip: a hit on a belt tile or rig takes the nearest payloads within reach; ★3 SALVAGE LINE: + k damage for
    // each ripped payload on the turret's next shot
    text: (e, x) => {
      const s = c(e, x);
      return [
        `SHOTS THAT HIT AN ENEMY BELT OR RIG RIP OFF THE ${s.rip === 1 ? "NEAREST PAYLOAD" : `${s.rip} NEAREST PAYLOADS`} WITHIN ${plural(s.reach!, "TILE")}.`,
        // NUM-4 (REQ-BFG-047): the sim's pct(10, k%) a rip (battle.ts impact; was damage(k), the x1 scale's 1 x k)
        // Y2 (release Y; DESIGN-Y row 19): with the star switch on, no salvage and no keg disarm
        ...(x.stars >= 3 && !starRules() ? [`EACH PAYLOAD IT RIPS ADDS ${damage(pct(10, roundHalfUp(100 * x.k)))} TO THIS TURRET'S NEXT SHOT.`] : []),
        ...(starRules() ? [] : ["A HIT ON A POWDER KEG DISARMS IT."]),
      ];
    },
    perkAt: (e, x) => (x.stars >= 3 && !starRules() ? 1 : 0),
    gist: (e, x) => `RIPS ${plural(c(e, x).rip!, "PAYLOAD")} WITHIN ${plural(c(e, x).reach!, "TILE")}`,
    card: () => "SHOTS RIP ENEMY PAYLOADS",
  },
  tesla: {
    // Battle.impact: arcs to the nearest targets of the struck one (secondary impact at share, and a stall)
    text: (e, x) => {
      const s = c(e, x);
      return [
        `EACH SHOT ARCS TO THE ${s.arcs === 1 ? "NEAREST ENEMY MACHINE AND STUNS IT" : `${s.arcs} NEAREST ENEMY MACHINES AND STUNS THEM`} FOR ${seconds(s.stall!)}.`,
        `EACH ARC DEALS ${percent(s.share!)} OF THE SHOT'S DAMAGE.`,
      ];
    },
    gist: (e, x) => `ARCS TO ${plural(c(e, x).arcs!, "MACHINE")} AND STUNS ${c(e, x).arcs === 1 ? "IT" : "THEM"} FOR ${seconds(c(e, x).stall!)}`,
    card: () => "SHOTS ARC AND STUN MACHINES",
  },
  capacitor: {
    // Battle.chambers: charge while the chamber is empty (up to maxSeconds), spent on the next shot. Y5 (release Y; DESIGN-Y
    // row 42): with the star switch on there is no cap, so the cap's sentence goes
    text: (e, x) => [
      `CHARGES ITS NEXT SHOT ${damage(c(e, x).perSecond!)} FOR EACH SECOND ITS CHAMBER SITS EMPTY.`,
      ...(starRules() ? [] : [`IT CHARGES FOR UP TO ${seconds(c(e, x).maxSeconds!)}.`]),
    ],
    gist: (e, x) => `${damage(c(e, x).perSecond!)} FOR EACH EMPTY SECOND`,
    card: () => "CHARGES UP WHILE EMPTY",
  },
  compound: {
    text: (e, x) => [
      `PACKS 2 LOADS INTO ONE SHELL THAT DEALS ${percent(c(e, x).mult!)} OF THEIR DAMAGE.`,
      // Y6 (release Y; DESIGN-Y 4.1): with the star switch on no POISON (retired); the shell keeps both loads' BURN seconds
      starRules() ? "BOTH LOADS' BURN AND SHOCK RIDE ALONG." : "BOTH LOADS' BURN, POISON AND SHOCK RIDE ALONG.",
      `A LONE LOAD FIRES AFTER ${seconds(c(e, x).hold!)}.`,
    ],
    gist: (e, x) => `ONE SHELL AT ${percent(c(e, x).mult!)}`,
    card: () => "PACKS 2 LOADS INTO ONE SHELL",
  },
  lance: {
    // Battle.impact: the hull, then every target in the struck columns (at most 10) at share
    text: (e, x) => [
      `EVERY SHOT HITS THE ENEMY HULL, AND EVERY MACHINE IN ${plural(c(e, x).columns!, "DECK COLUMN")} FOR ${percent(c(e, x).share!)} OF ITS DAMAGE.`,
      `IT STRIKES UP TO ${SIM.lanceMax} MACHINES.`,
    ],
    gist: (e, x) => `${plural(c(e, x).columns!, "COLUMN")} AT ${percent(c(e, x).share!)}`,
    card: () => "HITS HULL AND A DECK COLUMN",
  },
  // --------------------------------------------------------------------------------------------------- turret gear
  chamber: {
    // Y7b1 (release Y; ruling Y7A-R2: the rule as built, the words true): with the star switch on a shot fires perShot loads,
    // at most what its gun's chamber holds (Battle.chambers), so ★2/★3's 3/4 read UP TO (upToLoads; ★1's 2 is every gun's)
    // and a second sentence says the rule (S_CHAMBER). Y4's "THE TURRET FIRES 3 LOADS EACH SHOT." and gist / card "FIRES 3
    // LOADS A SHOT" were false on a 2-load gun. Off, as before
    text: (e) => (starRules() ? [`THE TURRET FIRES ${upToLoads(m(e).perShot!)}${m(e).perShot} LOADS EACH SHOT.`, S_CHAMBER]
      : [`THE TURRET FIRES ${m(e).perShot} LOADS EACH SHOT${m(e).window ? `, AND ITS CHAMBER HOLDS ${plural(m(e).window!, "MORE LOAD")}` : ""}.`]),
    // Y4 (release Y; DESIGN-Y row 36): with the star switch on, its one number at every star (no slot)
    gist: (e, x) => (starRules() ? `FIRES ${upToLoads(m(e).perShot!)}${m(e).perShot} LOADS A SHOT`
      : x.stars >= 3 ? `FIRES ${m(e).perShot} LOADS EACH SHOT` : m(e).window ? `HOLDS ${plural(m(e).window!, "MORE LOAD")}` : `FIRES ${m(e).perShot} LOADS`),
    card: (e) => (starRules() ? `FIRES ${upToLoads(m(e).perShot!)}${m(e).perShot} LOADS A SHOT` : `FIRES ${m(e).perShot} LOADS A SHOT`),
  },
  calibrate: {
    text: (e) => [`THE TURRET FIRES ${rateText(imul(m(e).fireRate))}.`],
    gist: (e) => `FIRES ${rateText(imul(m(e).fireRate))}`,
  },
  flak: {
    // Battle.flight: one intercept roll per incoming harassing shot, at the side's best screen; a downed shot is gone
    // Y2 (release Y; DESIGN-Y row 10): with the star switch on it rolls for shots that carry a STUN only, each screen on
    // its own (Battle.flight)
    text: (e) => (starRules() ? [
      `SHOOTS DOWN ${percent(m(e).intercept!)} OF THE ENEMY'S STUN SHOTS BEFORE THEY LAND.`,
      "IT GUARDS YOUR WHOLE SHIP; EACH FLAK SCREEN ROLLS ON ITS OWN.",
    ] : [
      `SHOOTS DOWN ${percent(m(e).intercept!)} OF THE ENEMY'S HARASSMENT SHOTS BEFORE THEY LAND.`,
      "IT GUARDS YOUR WHOLE SHIP; ONLY YOUR BEST FLAK SCREEN COUNTS.",
      "HARASSMENT SHOTS ARE SHOCK, STATIC, ARC, GRAPNEL AND LANCE SHOTS, AND SABOT, FROST, CHAIN AND LIMPET ROUNDS.",
    ]),
    gist: (e) => `SHOOTS DOWN ${percent(m(e).intercept!)}`,
    card: (e) => (starRules() ? `SHOOTS DOWN ${percent(m(e).intercept!)} OF STUN SHOTS` : `SHOOTS DOWN ${percent(m(e).intercept!)} OF HARASSMENT`),
  },
  spotter: {
    // Battle.pickTarget: rerolls a bare-hull pick; ★2 FACTORY SPOT weighs factories; ★3 EAGLE EYE machines only
    text: (e) => {
      const md = m(e);
      if (md.alwaysMachine) {
        return [`THE TURRET ALWAYS AIMS AT AN ENEMY MACHINE, NEVER BARE HULL, AND PICKS FACTORIES ${times(md.factoryWeight ?? 1)} AS OFTEN.`, S.machines];
      }
      return [
        `WHEN THE TURRET AIMS AT BARE HULL, IT AIMS AGAIN${(md.rerolls ?? 1) === 1 ? " ONCE" : ` UP TO ${times(md.rerolls!)}`}${md.factoryWeight ? `, AND IT PICKS FACTORIES ${times(md.factoryWeight)} AS OFTEN` : ""}.`,
        S.machines,
      ];
    },
    gist: (e) => (m(e).alwaysMachine ? "ALWAYS AIMS AT A MACHINE"
      : (m(e).rerolls ?? 1) === 1 ? "AIMS AGAIN ONCE OFF BARE HULL" : `AIMS AGAIN UP TO ${times(m(e).rerolls!)}`),
    card: () => "RE-AIMS SHOTS OFF BARE HULL",
  },
  hopper: {
    // makeTurret: + window slots, + seconds to the load time (a GATLING never reads it). 0.6.2 FB-B: every star keeps
    // ★1's +1 slot and +0.5 s; ★2/★3 add a store (TurretState.storeMax 1/2: loads taken off the belt while the gun
    // fires, dropped into the next chamber, Battle.chambers); ★3 BOTTOMLESS never jams
    text: (e) => {
      const md = m(e), store = md.store ?? 0;
      // Y4 (release Y; DESIGN-Y row 33): with the star switch on, its one rule (window +1 / +2 / +3); no load time, store
      // or NEVER JAMS, and no chamber rule naming LOAD TIME
      if (starRules()) return [`THE TURRET'S CHAMBER HOLDS ${plural(md.window!, "MORE LOAD")}.`];
      return [
        `THE CHAMBER HOLDS ${plural(md.window!, "MORE LOAD")}, AND THE LOAD TIME IS LONGER.`, // NUM-4: HOPPER's +0.5 s is a hidden timer (N1 2.2)
        ...(store ? [`WHILE THE TURRET FIRES, IT STORES ${plural(store, "LOAD")} FROM THE BELT FOR ITS NEXT CHAMBER.`] : []),
        ...(md.noJam ? ["THE TURRET NEVER JAMS."] : []),
        S.chamber,
        // 0.6.2rel2: a COMPOUND BREECH never reads the load time either (cores.ts ROUTINES.compound: 2 loads or its hold)
        "ON A GATLING SPOOL OR A COMPOUND BREECH THE LONGER LOAD TIME DOES NOTHING.",
      ];
    },
    perkAt: (e) => (m(e).noJam ? (m(e).store ? 2 : 1) : 0),
    gist: (e) => {
      const md = m(e);
      if (starRules()) return `HOLDS ${plural(md.window!, "MORE LOAD")}`; // Y4 (DESIGN-Y row 33)
      return md.store ? `STORES ${plural(md.store, "LOAD")} WHILE IT FIRES${md.noJam ? ", NEVER JAMS" : ""}`
        : `HOLDS ${plural(md.window!, "MORE LOAD")}, LONGER LOAD TIME`;
    },
    card: (e) => `CHAMBER HOLDS ${plural(m(e).window!, "MORE LOAD")}`,
  },
  mantlet: {
    // Battle.acceptHarassment: the turret ignores its immune causes; NUM-3 (R1's STUN fold): every STUN source from ★1
    // (was SHOCK, STATIC, ARC and CHAIN, ★2 FULL PLATE + FROST and SABOT); ★2 FULL GUARD shields the last tile of each belt
    // into the turret, ★3 BULWARK SKIRT the last 3, and the rigs working them
    text: (e) => [
      `THE TURRET IGNORES ${immunities(e)}.`,
      ...(m(e).intakeGuard ? [shielded(m(e).intakeGuard!)] : []),
    ],
    perkAt: (e) => (m(e).intakeGuard ? 1 : 0),
    gist: (e, x) => mantletGist(e, x.stars),
    card: (e) => `IGNORES ${immunities(e)}`,
  },
  ram: {
    text: (e) => [`THE LOAD THAT EMPTIES THE CHAMBER DEALS ${percent(m(e).finisher!)} MORE DAMAGE.`, S.gatling],
    gist: (e) => `${percent(m(e).finisher!)} MORE DAMAGE`,
    card: (e) => `LAST LOAD DEALS ${percent(m(e).finisher!)} MORE`,
  },
  escapement: {
    // races/data.ts PEAK_SHIFT: pendulum slugs fired from this turret peak 1.2 s earlier (races/metronome.ts)
    text: (e) => [
      `THE TURRET FIRES ${rateText(imul(m(e).fireRate))}.`,
      // NUM-4 (REQ-BFG-047): the 1.2 s shift is no whole second; the tiles say where the peak moves
      `ON METRONOME, PENDULUM SLUGS FROM THIS TURRET PEAK EARLIER, AFTER ${peakTiles(PENDULUM.peak + PEAK_SHIFT.escapement)} TILES.`,
    ],
    gist: (e) => `FIRES ${rateText(imul(m(e).fireRate))}`,
  },
  longcase: {
    text: (e) => [
      `SHOTS FROM PAYLOADS THAT RODE ${seconds(m(e).longRideMin!)} OR MORE DEAL ${moreDamage(m(e).longRideFlat!)}.`,
      `PENDULUM SLUGS DON'T GET IT; ON METRONOME THEY PEAK LATER ON THIS TURRET, AFTER ${peakTiles(PENDULUM.peak + PEAK_SHIFT.longcase)} TILES.`, // NUM-4: no 1.2 s
    ],
    gist: (e) => moreDamage(m(e).longRideFlat!),
    card: (e) => `LONG RIDES: ${moreDamage(m(e).longRideFlat!)}`,
  },
  // ------------------------------------------------------------------------------------ wave 3 (0.8.0 P1, REQ-BFG-032)
  // DESIGN-wave3.md 3.3's text at every star in the 0.6.2 standard, its numbers read from the spec at that star; the four
  // glossary words are S.plating, S.pair, S.matched and S.worksFaster. Two lines follow the Prime's design calls (oracle
  // a0e94bc69949561f): STOKER never makes a factory outrun its gun, and TWIN LATCH times its release. The text exists
  // whatever the switch (content.ts WAVE3_LIVE); nothing shows it while wave 3 is dormant.
  plateroller: {
    // Battle.applyHit (tier 1): addPlate(s, plate) for each payload it hits (E1)
    text: (e) => [`ROLLS ${fmtDmg(g(e).plate!)} PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.`, plating()], // Y6: plating()
    gist: (e) => `ROLLS ${fmtDmg(g(e).plate!)} PLATING FOR EACH PAYLOAD`,
    card: () => "PLATES YOUR HULL AS SLUGS PASS",
  },
  twingauge: {
    // Battle.applyHit: + flat, or + matched on a matched belt (E6: deck.ts matchedRoutes, read once in Battle.makeSide)
    // Y3 (release Y; DESIGN-Y row 21): with the star switch on, nothing off a matched belt (no floor)
    text: (e) => (starRules() ? [`ADDS ${damage(g(e).gauge!.matched)} TO EACH PAYLOAD IT HITS ON A MATCHED BELT.`, S.matched]
      : [`ADDS ${damage(g(e).gauge!.flat)} TO EACH PAYLOAD IT HITS, OR ${damage(g(e).gauge!.matched)} ON A MATCHED BELT.`, S.matched]),
    gist: (e) => (starRules() ? `${damage(g(e).gauge!.matched)} ON A MATCHED BELT` : `ADDS ${damage(g(e).gauge!.flat)}, OR ${fmtDmg(g(e).gauge!.matched)} ON A MATCHED BELT`),
    card: () => (starRules() ? "DAMAGE ON A MATCHED BELT" : "MORE DAMAGE ON A MATCHED BELT"),
  },
  pincer: {
    // Battle.applyHit (E5): + flat, and + each for every other working rig hitting the tile (online, not stalled, frozen
    // or wrecked), up to max. 0.8.0 I1 (VERIFIED-P1 H5): the text names no cap: a belt tile has 4 sides and at least two
    // are belt, factory or turret, so at most 2 other rigs can ever hit a PINCER's tile and max (3) never binds; the code
    // keeps it
    // Y3 (release Y; DESIGN-Y row 20): with the star switch on, no floor (and no max in its data)
    text: (e) => {
      const p = g(e).pincer!;
      if (starRules()) return [`ADDS ${damage(p.each)} TO EACH PAYLOAD IT HITS FOR EACH OTHER RIG HITTING THAT TILE.`, "STUNNED AND WRECKED RIGS DON'T COUNT."];
      return [
        `ADDS ${damage(p.flat)} TO EACH PAYLOAD IT HITS, AND ${fmtDmg(p.each)} MORE FOR EACH OTHER RIG HITTING THAT TILE.`,
        "STUNNED AND WRECKED RIGS DON'T COUNT.", // NUM-3 (R1's STUN fold): nothing freezes any more
      ];
    },
    gist: (e) => (starRules() ? `${damage(g(e).pincer!.each)} FOR EACH OTHER RIG ON ITS TILE`
      : `ADDS ${damage(g(e).pincer!.flat)}, AND ${fmtDmg(g(e).pincer!.each)} MORE FOR EACH OTHER RIG ON ITS TILE`),
    card: () => (starRules() ? "DAMAGE FOR EACH RIG ON ITS TILE" : "MORE DAMAGE WITH RIGS ON ITS TILE"),
  },
  braceframe: {
    // Battle.braceCut: an enemy STUN on a tile it hits, or on the brace itself, lasts x mul while it works, x plated while
    // the hull holds plating (E1). NUM-3 (R1's STUN fold): no freeze or chain slow any more (Battle.disrupt cuts every STUN)
    // Y2 (release Y; DESIGN-Y row 16): with the star switch on, no plated multiplier and no brace of itself
    text: (e) => (starRules() ? [`ENEMY STUNS ON THE BELT TILES IT HITS LAST ${percent(1 - g(e).brace!.mul)} SHORTER.`] : [
      `ENEMY STUNS ON THE BELT TILES IT HITS, AND ON ITSELF, LAST ${percent(1 - g(e).brace!.mul)} SHORTER.`,
      `WHILE YOUR HULL HOLDS PLATING THEY LAST ${percent(1 - g(e).brace!.plated)} SHORTER.`,
    ]),
    gist: (e) => (starRules() ? `${percent(1 - g(e).brace!.mul)} SHORTER` : `${percent(1 - g(e).brace!.mul)} SHORTER, ${percent(1 - g(e).brace!.plated)} WHILE PLATED`),
    card: () => "SHORTER STUNS ON ITS TILES",
  },
  twinlatch: {
    // E4 (Battle.latchTick): it holds only while both arrows hit belts, each payload at most `hold` seconds. Into one
    // turret the longer remaining trip goes first and the other after the difference, so both arrive together (oracle
    // a0e94bc69949561f); into two turrets both go at once. Battle.applyHit adds flat to every payload it hits
    // Y3 (release Y; DESIGN-Y row 30): with the star switch on it adds no damage (no flat) and holds up to 1/2/3 s
    text: (e) => [
      // T6: DESIGN 3.3's "AT THE TILE IT HITS" moves to the second sentence, so the opening fits the phone band whole
      "HOLDS EACH PAYLOAD UNTIL ITS OTHER BELT BRINGS ONE, THEN LETS THEM GO SO THEY REACH THE GUN TOGETHER.",
      `IT HOLDS A PAYLOAD AT THE TILE IT HITS, AT MOST ${seconds(g(e).latch!.hold)}, AND ONLY WHEN BOTH ITS ARROWS HIT BELTS.`,
      ...(starRules() ? [] : [`EACH PAYLOAD IT LETS GO GAINS ${damage(g(e).latch!.flat)}.`]),
      "ON BELTS INTO TWO GUNS, IT LETS BOTH GO AT ONCE.",
    ],
    // T6: DESIGN 3.3's "EACH PAYLOAD IT LETS GO GAINS 2.2 DAMAGE" takes two phone lines; WHETSTONE's clause takes one
    gist: (e) => (starRules() ? `HOLDS UP TO ${seconds(g(e).latch!.hold)}` : `ADDS ${damage(g(e).latch!.flat)}`),
    card: () => "LETS TWO BELTS GO TOGETHER",
  },
  stoker: {
    // E3: its arrows work factories (deck.ts stokeHits), never belts. Battle.stokedPace: the factory's timers x (1 + its
    // stokes), the stamping capped so it never outruns the turret its belt feeds (oracle a0e94bc69949561f)
    // Y7b1 (release Y; ruling Y7A-R1): the cap holds with the star switch on too, so the sentence says it on and off (Y3's
    // switch-on "A FACTORY IT STOKES MAY FEED ITS GUN MORE THAN IT TAKES, AND JAM IT." left with the overfeed trap)
    text: (e) => [
      `EACH FACTORY ITS ARROWS POINT AT WORKS ${percent(g(e).stoke!)} FASTER.`,
      "IT NEVER MAKES A FACTORY OUTRUN ITS GUN.",
      S.worksFaster,
      "ITS ARROWS DO NOTHING TO BELTS.",
    ],
    gist: (e) => `ITS FACTORIES WORK ${percent(g(e).stoke!)} FASTER`,
    // DESIGN 3.3's "FACTORIES IT POINTS AT WORK FASTER" takes three lines on the wide card (two at most)
    card: () => "MAKES FACTORIES WORK FASTER",
  },
  platebreaker: {
    // Battle.applyHit (tier 1): with 1 plating or more on the hull it takes 1 (a plate event) and adds flat, else floor
    // Y3 (release Y; DESIGN-Y row 26): with the star switch on, no floor: with less plating it adds nothing
    text: (e) => [
      `EACH PAYLOAD IT HITS TAKES 10 PLATING FROM YOUR HULL AND GAINS ${damage(g(e).breaker!.flat)}.`, // NUM-1: battle.ts spends 10
      starRules() ? "WITH LESS PLATING THAN THAT, IT ADDS NOTHING." : `WITH NO PLATING TO TAKE, IT ADDS ${damage(g(e).breaker!.floor)}.`,
    ],
    gist: (e) => (starRules() ? `${damage(g(e).breaker!.flat)} FOR 10 PLATING` : `${damage(g(e).breaker!.flat)} FOR 10 PLATING, ${fmtDmg(g(e).breaker!.floor)} WITHOUT`), // NUM-1: 10 plating
    card: () => "TURNS PLATING INTO DAMAGE", // DESIGN 3.3's "TURNS YOUR PLATING INTO DAMAGE" takes three card lines
  },
  shieldwall: {
    // Battle.applyHit: addPlate(plate) first, then + plated.flat while the hull holds plated.min plating or more. Y7b1
    // (release Y; ruling Y7A-R3d): with the star switch on it reads its base def too (its STAR_DIFF row is deleted), so its
    // texts are the base's, PLATING's sentence as the switch has it (plating(): no POISON on). Y5's switch-on texts (no
    // plating of its own: "WHILE YOUR HULL HOLDS 120 PLATING OR MORE, EACH PAYLOAD IT HITS GAINS 30 DAMAGE.", gist "30 DAMAGE
    // AT 120 PLATING", card "HITS HARDER WHILE PLATED") left with it
    text: (e) => [
      `ROLLS ${fmtDmg(g(e).plate!)} PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.`,
      `WHILE YOUR HULL HOLDS ${g(e).plated!.min} PLATING OR MORE, EACH OF THOSE PAYLOADS ALSO GAINS ${damage(g(e).plated!.flat)}.`,
      plating(),
    ],
    gist: (e) => `${fmtDmg(g(e).plate!)} PLATING A PAYLOAD, ${damage(g(e).plated!.flat)} AT ${g(e).plated!.min} PLATING`,
    card: () => "PLATES YOUR HULL, HITS HARDER", // DESIGN 3.3's "..., HITS HARDER PLATED" takes three card lines
  },
  twinmould: {
    // Battle.produce (twin): one slug onto each of `pour` belts with room, on the same tick (races/foundry.ts pourAll);
    // bb-0.8.3 (REQ-BFG-042 D3): ★3 THIRD SPRUE is the third slug of each pour; with more belts it takes them in turn
    text: (e) => {
      const fs = f(e), n = countWord(fs.pour ?? 0);
      return [
        `CASTS ${n} ${fs.base !== undefined ? "SLUGS" : "PLAIN SLUGS"} (${damage(slugBase(e))} EACH) AT ONCE, ONE ONTO EACH OF ${n} BELTS, ${rate(fs.speed)}.`,
        `WITH MORE BELTS, EACH CAST TAKES THE NEXT ${n} IN TURN.`,
        "ON MATCHED BELTS INTO ONE TURRET, EACH CAST ARRIVES AS A PAIR.",
      ];
    },
    gist: (e) => ((f(e).pour ?? 0) > 2
      ? `${f(e).pour} SLUGS OF ${damage(slugBase(e))}, ${rate(f(e).speed)}`
      : `${damage(slugBase(e))} EACH, ${rate(f(e).speed)}`),
    card: (e) => `CASTS ${countWord(f(e).pour ?? 0)} SLUGS AT ONCE`,
  },
  armorpress: {
    // Battle.pressPlate: plate.amount every plate.every seconds while it feeds a turret and isn't stalled or frozen (at
    // its timers' pace, a STOKER's full stoke included); its slugs stamp as STAMP PRESS's do. 0.8.0 B1 M4 (G1's F2): STOKER's
    // cap (oracle a0e94bc69949561f) holds back only the stamping, so a stoke speeds the plating in full even while a full
    // gun holds the stamping (G1: plating 20 / 44 / 70% faster at 1-3 stars, stamping 1.0x). These sentences state no pace;
    // the STOKER's capped line says it where it applies (inspector.ts stokeCapBlocks: "... SO ONLY ITS PLATING WORKS 44%
    // FASTER."), and STOKER's own text ("ITS OTHER TIMERS RUN FASTER TOO") already fits
    text: (e) => {
      const fs = f(e);
      return [
        `PRESSES ${fmtDmg(fs.plate!.amount)} PLATING ONTO YOUR HULL ${every(fs.plate!.every)}, AND STAMPS ${fs.base !== undefined ? "A SLUG" : "A PLAIN SLUG"} (${damage(slugBase(e))}) ${rate(fs.speed)}.`,
        "IT NEEDS A BELT TO A TURRET TO WORK.",
        plating(), // Y6: plating()
      ];
    },
    gist: (e) => `${fmtDmg(f(e).plate!.amount)} PLATING ${every(f(e).plate!.every)}, A SLUG ${rate(f(e).speed)}`,
    card: (e) => `PLATES YOUR HULL ${every(f(e).plate!.every)}`,
  },
  anvil: {
    // Battle.fireCore (anvil): + anvilFlat + perPlate x the hull's plating at fire time, both x k (cores.ts CORE_ABSOLUTE)
    // NUM-4: perPlate as the sim keeps it, a whole % of the hull's plating (was "2.2 MORE FOR EACH PLATING")
    // Y7b1 (release Y; ruling Y7A-R3c): with the star switch on it reads its base def too (its STAR_DIFF row is deleted), so
    // its sentences are the base's, PLATING's sentence as the switch has it (plating(): no POISON on). Y4's fold ("EACH SHOT
    // DEALS 125% OF THE PLATING ON YOUR HULL AS MORE DAMAGE."; gist "125% OF YOUR PLATING AS DAMAGE") left with it
    text: (e, x) => [`EACH SHOT DEALS ${moreDamage(c(e, x).anvilFlat!)}, PLUS ${percent(c(e, x).perPlate!)} OF THE PLATING ON YOUR HULL.`, plating()],
    gist: (e, x) => `${moreDamage(c(e, x).anvilFlat!)}, PLUS ${percent(c(e, x).perPlate!)} OF YOUR PLATING`,
    card: () => "MORE DAMAGE THE MORE PLATING",
  },
  steambreech: {
    // cores.ts ROUTINES.steam: the cadence x steamPlated while the hull holds plating, else x steamBare (rates: no k)
    // Y4 (release Y; DESIGN-Y row 39): with the star switch on there is no bare rate (no steamBare): at its own rate
    text: (e, x) => (starRules()
      ? [`THE TURRET FIRES ${rateText(imul(c(e, x).steamPlated))} WHILE YOUR HULL HOLDS PLATING.`]
      : [`THE TURRET FIRES ${rateText(imul(c(e, x).steamPlated))} WHILE YOUR HULL HOLDS PLATING, AND ${rateText(imul(c(e, x).steamBare))} WITHOUT IT.`]),
    gist: (e, x) => (starRules() ? `${rateText(imul(c(e, x).steamPlated))} PLATED`
      : `${rateText(imul(c(e, x).steamPlated))} PLATED, ${percent(c(e, x).steamBare! / 100)} WITHOUT`),
    card: () => "FIRES FASTER WHILE PLATED",
  },
  twintrigger: {
    // Battle.fire / fireCore: a paired load (E2; a COMPOUND shell packing one) x (1 + pairBonus), before FINISHER RAM.
    // makeTurret: the load time + windowTime (negative), never under LOAD_FLOOR; a GATLING SPOOL or a COMPOUND BREECH never
    // reads it (gatlingClashText)
    // Y4 (release Y; DESIGN-Y row 34): with the star switch on there is no shorter load time (pairBonus 30 / 60 / 95)
    text: (e) => (starRules() ? [`PAIRED LOADS IN THIS TURRET DEAL ${percent(m(e).pairBonus!)} MORE DAMAGE.`, S.pair] : [
      `PAIRED LOADS IN THIS TURRET DEAL ${percent(m(e).pairBonus!)} MORE DAMAGE.`,
      S.pair,
      "ITS LOAD TIME IS SHORTER, DOWN TO A FLOOR.", // NUM-4: its -0.25 / -0.4 / -0.55 s and the 0.3 s floor are hidden timers (N1 2.2)
      "ON A GATLING SPOOL OR A COMPOUND BREECH THE SHORTER LOAD TIME DOES NOTHING.",
    ]),
    gist: (e) => (starRules() ? `PAIRS DEAL ${percent(m(e).pairBonus!)} MORE` : `PAIRS DEAL ${percent(m(e).pairBonus!)} MORE, SHORTER LOAD TIME`),
    card: (e) => `PAIRS HIT ${percent(m(e).pairBonus!)} HARDER`,
  },
  spallcatcher: {
    // Battle.spallCharge: add x (the hull's part + twice plating's part) / every, up to max, from impacts, limpet blasts,
    // burn and poison (never the dark wind); Battle.fire / fireCore add it to this turret's next shot
    text: (e) => {
      const sp = m(e).spall!;
      // Y5 (release Y; DESIGN-Y row 47): with the star switch on there is no cap, and what plating soaks counts once
      if (starRules()) {
        return [
          `EVERY ${damage(sp.every)} YOUR SHIP TAKES ADDS ${damage(sp.add)} TO THIS TURRET'S NEXT SHOT.`,
          "DAMAGE YOUR PLATING SOAKS COUNTS TOO; THE DARK WIND DOESN'T COUNT.",
        ];
      }
      return [
        `EVERY ${damage(sp.every)} YOUR SHIP TAKES ADDS ${damage(sp.add)} TO THIS TURRET'S NEXT SHOT, UP TO ${damage(sp.max!)}.`,
        "DAMAGE YOUR PLATING SOAKS COUNTS TWICE; THE DARK WIND DOESN'T COUNT.",
      ];
    },
    gist: (e) => `${damage(m(e).spall!.add)} FOR EVERY ${m(e).spall!.every}${starRules() ? "" : `, UP TO ${fmtDmg(m(e).spall!.max!)}`}`, // DESIGN 3.3's words
    card: () => "HITS YOU TAKE CHARGE ITS SHOT", // DESIGN 3.3's "... ITS NEXT SHOT" takes three card lines
  },
  seamwelder: {
    // Battle.loaded (E2): the load that makes a pair rolls seam.pair, any other load seam.lone (addPlate); a FOUNDRY fusion
    // is a pair (Battle.fusionPair)
    // Y4 (release Y; DESIGN-Y row 35): with the star switch on a lone load rolls none (seam.lone 0): pairs only
    text: (e) => [
      starRules() ? `EACH PAIR THIS TURRET TAKES ROLLS ${fmtDmg(m(e).seam!.pair)} PLATING ONTO YOUR HULL.`
        : `EACH PAIR THIS TURRET TAKES ROLLS ${fmtDmg(m(e).seam!.pair)} PLATING ONTO YOUR HULL, AND ANY OTHER LOAD ROLLS ${fmtDmg(m(e).seam!.lone)}.`,
      S.pair,
      plating(), // Y6: plating()
    ],
    gist: (e) => (starRules() ? `${fmtDmg(m(e).seam!.pair)} PLATING A PAIR` : `${fmtDmg(m(e).seam!.pair)} PLATING A PAIR, ${fmtDmg(m(e).seam!.lone)} FOR ANY OTHER LOAD`),
    card: () => "PAIRS PLATE YOUR HULL",
  },
  // ------------------------------------------------------------------------------------------------------ supplies
  beltcrate: {
    text: (e) => [`LETS YOU LAY ${e.supply!.belt} MORE BELT TILES FOR THE REST OF THE RUN.`],
    gist: (e) => `${e.supply!.belt} MORE BELT TILES`,
  },
  plating: {
    text: (e) => [`ADDS ${e.supply!.hull} TO YOUR HULL FOR THE REST OF THE RUN.`],
    gist: (e) => `ADDS ${e.supply!.hull} HULL`,
  },
  // ------------------------------------------------------------- SUS-B (REQ-BFG-069): the sustain pieces (SUS-A's rules)
  wardbell: {
    // TurretState.bell: + amount SHIELD every `every` s, the first at t = every, never past SHIELD_CAP; a STUN or freeze on
    // its turret pauses it (Battle.sustainTick); Battle.shieldHit: a SHIELD stops one whole hit
    text: (e) => [
      `YOUR HULL GAINS ${countWord(m(e).shield!.amount)} ${SW.shield} ${every(m(e).shield!.every)}, UP TO ${SHIELD_CAP}.`,
      // NUM-4 (REVIEW-SUSB F1): a SHIELD blocks one impact's damage; that hit's BURN, FRAY, STUN and poison still land
      // (battle.ts impact()), and BURN, poison and the wind deal their damage past it
      // Y6 (release Y; DESIGN-Y 4.1): with the star switch on no POISON (retired: no switch-on hit or hull carries any)
      starRules() ? `EACH ${SW.shield} BLOCKS ONE HIT'S DAMAGE, THEN BREAKS; THAT HIT'S BURN, FRAY AND STUN STILL LAND.`
        : `EACH ${SW.shield} BLOCKS ONE HIT'S DAMAGE, THEN BREAKS; THAT HIT'S BURN, FRAY, STUN AND POISON STILL LAND.`,
      starRules() ? "BURN AND THE DARK WIND DEAL THEIR DAMAGE PAST IT." : "BURN, POISON AND THE DARK WIND DEAL THEIR DAMAGE PAST IT.",
      "A STUN ON ITS TURRET PAUSES IT.", // NUM-4 (REVIEW-NUM3 F2): one word for one stop (was "A STALL OR FREEZE")
    ],
    gist: (e) => `${countWord(m(e).shield!.amount)} ${SW.shield} ${every(m(e).shield!.every)}`,
    // FLIP-X2 (cap's ruling 207816b18a9fbfdb C): verb-first, in ARMOR PRESS's form (was `+${amount} ${SW.shield} ${every}`)
    card: (e) => `${SW.shield}S YOUR HULL ${every(m(e).shield!.every)}`,
  },
  mendpress: {
    // Battle.pressHeal: heal.amount every heal.every s through heal() while it feeds a turret and isn't stalled or frozen
    // (ARMOR PRESS's timer and pace); its slugs stamp as ARMOR PRESS's do
    text: (e) => {
      const fs = f(e);
      return [
        `${SW.heals} YOUR HULL BY ${fmtDmg(fs.heal!.amount)} ${every(fs.heal!.every)}, AND STAMPS A PLAIN SLUG (${damage(slugBase(e))}) ${rate(fs.speed)}.`,
        "IT NEEDS A BELT TO A TURRET TO WORK.",
        S.heal,
      ];
    },
    gist: (e) => `${SW.heals} ${fmtDmg(f(e).heal!.amount)} ${every(f(e).heal!.every)}, A SLUG ${rate(f(e).speed)}`,
    card: (e) => `${SW.heals} YOUR HULL ${every(f(e).heal!.every)}`,
  },
  mendingloom: {
    // TurretState.regen: at each whole second your living hull heals its working looms' REGEN through heal() (Battle.
    // sustainTick); a STUN or freeze on its turret pauses it
    text: (e) => [`${SW.heals} YOUR HULL BY ${fmtDmg(m(e).regen!)} EVERY SECOND.`, "A STUN ON ITS TURRET PAUSES IT.", S.heal],
    gist: (e) => `${SW.heals} ${fmtDmg(m(e).regen!)} EVERY SECOND`,
    card: (e) => `${SW.heals} ${fmtDmg(m(e).regen!)} HULL EVERY SECOND`,
  },
};

/** 0.6.2rel: a turret class as a word ("AN ADAPTABLE TURRET"). */
const CLASS_WORD: Record<string, string> = { heavy: "HEAVY", medium: "MEDIUM", light: "LIGHT", adaptable: "ADAPTABLE" };

/**
 * 0.6.2rel (REQ-BFG-031 S2-S4, S6): the turret block, every buyable turret's entry (content.ts, kind "turret"), read
 * from its TurretSpec at the star (effectAt): what it is (its class, how often it fires and the loads its chamber holds),
 * the star's fire rate against 1 star (★2 fires every x0.9 of the interval, ★3 x0.8, said as a rate: x0.9 fires
 * 1 / 0.9 = 11% faster), the columns it takes belts on (S2: both, or the inner one), its gear slots (S4: the rarity's
 * GEAR_SLOTS + 1 for each star above 1, deck.ts gearSlotsOf) and its one core socket, and how soon its shots land.
 */
const TURRET: Entry = {
  text: (e, x) => {
    // NUM-4 (REQ-BFG-047): its SPEED in words (rate(): the RATE number on its face); a star's gain as the whole difference
    // of the two SPEEDs (was "10% FASTER THAN AT 1 STAR", a rounded float ratio); the flight time (0.3-0.65 s) is a hidden
    // timer, never shown (N1 2.2: "the board shows the shell's flight"), so its sentence goes
    const t = e.turret!, one = ITEMS[e.id].turret!.speed;
    return [
      `${an(CLASS_WORD[t.class] ?? t.class.toUpperCase())} TURRET THAT FIRES ${rate(t.speed)} AND HOLDS ${plural(t.window, "LOAD")}.`,
      ...(t.speed > one ? [`ITS RATE IS ${fmtSpeed(t.speed - one)} MORE THAN AT 1 STAR.`] : []), // a SPEED difference (fmtSpeed)
      t.intake === "inner" ? "IT TAKES A BELT ON ITS INNER COLUMN ONLY." : "IT TAKES A BELT ON EACH OF ITS TWO COLUMNS.",
      `IT HAS ${plural(gearSlotsOf(e.id, x.stars), "GEAR SLOT")} AND 1 CORE SOCKET.`,
    ];
  },
  gist: (e, x) => `FIRES ${rate(e.turret!.speed)}, ${plural(gearSlotsOf(e.id, x.stars), "GEAR SLOT")}`,
  card: (e) => `FIRES ${rate(e.turret!.speed)}`, // the landscape card's two lines hold the rate; the panel the rest
};
for (const d of Object.values(ITEMS)) if (d.kind === "turret") ENTRIES[d.id] = TURRET;

/** The modules with ability text: every buyable module (0.6.2rel: the turrets too) and both supplies. A hero's signature
 *  factory (never sold) has none: its panel shows its catalogue desc (flavour.ts). */
export function hasAbilityText(def: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENTRIES, def);
}

function ctxOf(stars: number, o: TextOpts = {}): X {
  return { k: o.k ?? 1, hero: o.hero, stars };
}

/** The perk named at `stars`, unless the sim doesn't apply its values yet (levels[n].pending; 0.6.1r F5). */
export function livePerk(def: string, stars: number): string | undefined {
  return Object.keys(pendingAt(def, stars)).length ? undefined : perkAt(def, stars);
}

/** A module's ability text at `stars` (see the file comment); { sentences: [] } for a def without an entry. */
export function abilityText(def: string, stars = 1, o: TextOpts = {}): AbilityText {
  const en = hasAbilityText(def) ? ENTRIES[def] : undefined;
  if (!en) return { sentences: [] };
  const x = ctxOf(stars, o), e = effectAt(def, stars);
  const sentences = en.text(e, x);
  const name = stars > 1 ? livePerk(def, stars) : undefined;
  if (!name) return { sentences };
  const after = Math.min(sentences.length - 1, en.perkAt ? en.perkAt(e, x) : 0);
  return { sentences, perk: { name, stars, after } };
}

/** The star's effect as a short clause without a full stop ("ADDS 4 BURN"); "" for a def without text. */
export function gist(def: string, stars = 1, o: TextOpts = {}): string {
  const en = hasAbilityText(def) ? ENTRIES[def] : undefined;
  return en ? en.gist(effectAt(def, stars), ctxOf(stars, o)) : "";
}

/** The shop card's one-line effect at 1 star, a whole sentence ("ADDS 2 BURN."); "" for a def without text. */
export function cardText(def: string, o: TextOpts = {}): string {
  const en = hasAbilityText(def) ? ENTRIES[def] : undefined;
  if (!en) return "";
  return `${(en.card ?? en.gist)(effectAt(def, 1), ctxOf(1, o))}.`;
}

/** The perk a star brings that the star below doesn't name (and the sim applies), else undefined. */
export function newPerk(def: string, to: number): string | undefined {
  const p = livePerk(def, to);
  return p && p !== perkAt(def, to - 1) ? p : undefined;
}

/** T5: "NEXT STAR: ADDS 7 BURN." for a fusible module below the top star, else null (newPerk names the perk it brings). */
export function nextStarText(def: string, stars: number, o: TextOpts = {}): string | null {
  // bb-0.8.3 (REQ-BFG-043 D10): a hero's signature factory has no stars (its panel says its level and next level instead)
  if (!fusible(def) || stars >= FUSE_MAX || !hasAbilityText(def)) return null;
  return `NEXT STAR: ${starGist(def, stars + 1, o)}.`;
}

/**
 * bb-0.8.3 (REQ-BFG-042 M4): a star's effect for the next-star and MERGES WITH lines: its gist, and a factory's belt
 * slots at that star last ("5 DAMAGE SLUGS EVERY 1.1 SECONDS, 3 BELTS": stars.ts outputsAt, one more each star). Last,
 * so the phone band's short form (nextStarHeadline, the first clause) stays the line it was.
 */
function starGist(def: string, stars: number, o: TextOpts = {}): string {
  const eff = gist(def, stars, o), belts = ITEMS[def]?.kind === "factory" ? plural(outputsAt(def, stars), "BELT") : "";
  return belts ? (eff ? `${eff}, ${belts}` : belts) : eff;
}

/** T6: the next-star line's headline for a short band: the first clause of that star's effect ("NEXT STAR: 5 TIMES AS
 *  FAST." for "5 TIMES AS FAST, 2 DAMAGE A PULSE"); null when the full line is already one clause. */
export function nextStarHeadline(def: string, stars: number, o: TextOpts = {}): string | null {
  if (!nextStarText(def, stars, o)) return null;
  const all = starGist(def, stars + 1, o), head = all.split(", ")[0]; // bb-0.8.3 (M4): the belts close the full line
  return head !== all ? `NEXT STAR: ${head}.` : null;
}

/** T5: an offer that merges on purchase: "MERGES WITH YOUR TEMPER INTO ★2: ADDS 4 BURN." (newPerk follows it). */
export function mergesWithText(def: string, to: number, o: TextOpts = {}): string {
  const eff = starGist(def, to, o); // bb-0.8.3 (M4): a factory's belts at that star lead
  return `MERGES WITH YOUR ${ITEMS[def].name} INTO ★${to}${eff ? `: ${eff}` : ""}.`;
}

// ------------------------------------------------------------------------------------------- the belt timeline (V4)

/** What a belt does to speed: free (speed rigs work), locked (METRONOME: speed rigs add damage instead) or slag (a
 *  SLAG POT's belt: its slugs keep their fixed speed, so speed rigs do nothing to them, and nothing is locked). */
export type BeltKind = "free" | "locked" | "slag";

/**
 * 0.6.2t (0b.4): a belt timeline entry, one rig hit, from the walk's real values (deck.ts walkRoute). A labelled stat
 * row (T2's exception: short labels are fine). On a SLAG belt a speed hit changes nothing and pays no locked bonus, so
 * a speed-only rig reads "NO EFFECT ON SLAG"; a rig that also adds damage there (HOT SHOE, AFTERBURNER) shows that part.
 * SURGE's pulse damage isn't paid on slag either (Battle.transport skips fixed-speed ammo; the walk counts it, so it is
 * taken off here and in slagPulseExtra). On a METRONOME (locked) belt a speed rig reads its damage and "(LOCKED)".
 */
export function hitText(h: TimelineHit, belt: BeltKind): string {
  const name = ITEMS[h.def].name, e = effectAt(h.def, h.stars).gate ?? {};
  // Y3 (release Y; DESIGN-Y rows 20, 21, 26, 28, 30): with the star switch on SURGE VALVE is a damage pulse on any belt (no
  // speed, slag and locked belts too), and the rigs whose floor or flat left say what they do instead of "+0 DAMAGE"
  if (starRules()) {
    if (e.pulse) return `${name} +${damage(e.pulse.flat)} EVERY ${fmtSec(e.pulse.period)} SEC`;
    if (e.gauge && !h.matched) return `${name}: NO EFFECT ON AN UNMATCHED BELT`;
    if (e.pincer && !h.others) return `${name}: NO OTHER RIG ON ITS TILE`;
    if (e.latch) return `${name} HOLDS UP TO ${fmtSec(e.latch.hold)} SEC`;
    if (e.breaker) return `${name} +${damage(e.breaker.flat)} FOR 10 PLATING`; // NUM-1: 10 plating
    // Y5 (DESIGN-Y row 45) gave IRON WALL a row of its own here (no plating: "+30 DAMAGE AT 120 PLATING"); Y7b1 (ruling
    // Y7A-R3d) puts its plating back with the switch on, so its row is the base's, below
    // Y5 (DESIGN-Y row 46): POWDER KEG re-arms (Battle.kegTick), with no BURN
    if (e.keg) return `${name} +${damage(e.keg.flat)} EVERY ${fmtSec(e.keg.fuse)} SEC`;
    // Y6 (DESIGN-Y 4.1): VENOM DRIP lengthens the slug's BURN (Battle.impact), no POISON
    if (e.burnPlus) return `${name}: ITS BURN LASTS +${fmtSec(e.burnPlus)} SEC`;
  }
  if (e.speed !== undefined || e.pulse) {
    if (belt === "locked") return `${name} +${damage(h.flat ?? 0)} (LOCKED)`;
    if (belt === "slag") {
      const flat = (h.flat ?? 0) - (e.pulse?.flat ?? 0);
      return flat > 1e-9 ? `${name} +${damage(flat)}, NO SPEED CHANGE ON SLAG` : `${name}: NO EFFECT ON SLAG`;
    }
    const what = e.pulse ? `PULSES ${speedText(e.pulse.speed)}` : speedText(e.speed!);
    return `${name} ${what}${h.flat ? `, +${damage(h.flat)}` : ""}${h.won === false ? " (BEATEN)" : ""}`;
  }
  if (e.perPriorGate) {
    const cap = h.capped !== undefined ? ` (UP TO ${h.capped} HITS)` : ` (${plural(h.prior ?? 0, "HIT")} BEFORE)`;
    return `${name} +${damage(h.flat ?? 0)}${cap}`;
  }
  // 0.6.2t2 (F2): every number in a row says what it is ("AT 60% DAMAGE", "UP TO 6 DAMAGE"), as the ability text does
  if (e.split) return `${name} ${h.split?.copies ?? e.split.copies} COPIES AT ${percent(h.split?.mult ?? e.split.mult)} DAMAGE`;
  if (e.sort) return `${name} COPIES EVERY ${nth(e.sort.every)} PAYLOAD${e.sort.copies > 2 ? ` ${times(e.sort.copies - 1)}` : ""}`;
  if (e.overclockCooldown) return `${name} DOUBLES THE NEXT RIG, THEN WAITS ${fmtSec(e.overclockCooldown)} SEC`;
  if (e.keg) return `${name} +${damage(e.keg.flat)} AND ${e.keg.burn} BURN AFTER ${fmtSec(e.keg.fuse)} SEC`;
  // 0.6.2rel3 (TUNE-M T2): LODESTONE's floor is the hit's flat (walkRoute); its stall bonus waits for the battle
  // Y2 (release Y; DESIGN-Y rows 15, 8): with the star switch on, LODESTONE has no floor or cap and TOLLBOOTH blocks STUNs
  if (e.perStalled && starRules()) return `${name} +${damage(e.perStalled.each)} FOR EACH STUNNED MACHINE`;
  if (e.perStalled) return `${name} ${h.flat ? `+${damage(h.flat)}, ` : ""}+${damage(e.perStalled.each)} FOR EACH STUNNED MACHINE, UP TO ${damage(e.perStalled.max)}`;
  if (e.toll) return starRules() ? `${name} BLOCKS ${e.toll} STUNS` : `${name} BLOCKS ${e.toll} HARASSMENT HITS`;
  if (e.sift) return `${name} REMOVES ${e.sift === "all" ? "EVERY MARK" : "ONE MARK"}${h.flat ? `, +${damage(h.flat)} IF CLEAN` : ""}`;
  if (e.heal) return `${name} ${SW.heals} ${fmtDmg(e.heal)} HULL`; // SUS-A: the field is `heal`; SUS-B: HEAL's word (was REPAIRS)
  if (e.heat) return `${name} +${damage(e.heat)} FOR EACH SECOND AFTER`;
  if (e.staticTime) return `${name} STUNS A TURRET ${fmtSec(e.staticTime)} SEC ON BARE HULL`;
  if (e.poison) return `${name} +${e.poison} POISON`;
  if (e.fray) return `${name} +${e.fray} FRAY`;
  // 0.6.2 FB-B: its flat, plus perBurn for each Burn stack it spent (deck.ts walkRoute's quenched)
  if (e.quench) return `${name} +${damage(h.flat ?? 0)}${h.quenched ? ` (${h.quenched} BURN SPENT)` : ""}`;
  // 0.8.0 P1, wave 3's rigs, from the walk's values (deck.ts walkRoute: its flat is the damage it counts there)
  if (e.gauge) return `${name} +${damage(h.flat ?? 0)}${h.matched ? " ON A MATCHED BELT" : ""}`;
  if (e.pincer) return `${name} +${damage(h.flat ?? 0)}${h.others ? `, CROSSFIRE WITH ${plural(h.others, "RIG")}` : ""}`;
  if (e.latch) return `${name} +${damage(h.flat ?? 0)}, HOLDS UP TO ${fmtSec(e.latch.hold)} SEC`;
  if (e.breaker) return `${name} +${damage(e.breaker.flat)} FOR 10 PLATING, ELSE +${damage(e.breaker.floor)}`; // NUM-1: 10 plating
  if (e.brace) return starRules() ? `${name} ENEMY STUNS ${percent(1 - e.brace.mul)} SHORTER` // Y2 (DESIGN-Y row 16): no plated cut
    : `${name} ENEMY STUNS ${percent(1 - e.brace.mul)} SHORTER (${percent(1 - e.brace.plated)} SHORTER PLATED)`;
  if (e.plate) return `${name} +${fmtDmg(e.plate)} PLATING${e.plated ? `, +${damage(e.plated.flat)} AT ${e.plated.min} PLATING` : ""}`;
  const parts = [
    ...(h.flat ? [`+${damage(h.flat)}`] : []),
    ...(h.burn ? [`+${h.burn} BURN`] : []),
    ...(h.shock ? ["SHOCK"] : []),
  ];
  return parts.length ? `${name} ${parts.join(", ")}` : name;
}

/**
 * 0.6.2t (0b.4): the damage the walk counts on a SLAG belt that the sim doesn't pay: SURGE VALVE's pulse bonus (the walk
 * adds it on any unlocked belt; Battle.transport never gives it to fixed-speed ammo), scaled by each later split as the
 * walk scales it. 0 on any other belt. The belt readout subtracts it, so it says what the sim does.
 */
export function slagPulseExtra(rows: readonly { hits: readonly TimelineHit[] }[], belt: BeltKind): number {
  // Y3 (release Y; DESIGN-Y row 28): with the star switch on Battle.surgeTick pays slag too, so the walk's count stands
  if (belt !== "slag" || starRules()) return 0;
  let extra = 0;
  for (const row of rows) for (const h of row.hits) {
    if (h.split) extra *= h.split.mult;
    const p = effectAt(h.def, h.stars).gate?.pulse;
    if (p?.flat) extra += p.flat;
  }
  return extra;
}
