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
//          nth(), onlineIn(), peakTiles(), n1(), n2()
// Adding a module: one ENTRIES row (text, gist, optional card and perkAt) built from these units;
// tests/abilityText.test.ts then needs its NUMBERS row, and every rule (T1-T7) applies to it unchanged. 0.6.2rel: the 13
// buyable turrets (REQ-BFG-031) share one block (TURRET, below), read from each one's TurretSpec at its stars.
// Numbers always come from the module's real spec at that star (effectAt; a core's absolute numbers x k, as scaleCore
// does), from the catalogue's exported constants, or from SIM below (engine numbers no spec carries, each checked
// against its source by tests/abilityText.test.ts). Turret modules the turret task adds route their text through here.
//
// THE VOCABULARY. Each effect is named once, here, and reads the same everywhere (T5):
//   DAMAGE      "2 DAMAGE", "10.5 MORE DAMAGE": at most one decimal. BONUS DAMAGE is what rigs and scrap add to a payload.
//   BURN        each burn deals the enemy hull 1 damage a second for 3 seconds (BURN_TIME) once its shot lands.
//   SHOCK       a shocked shot stalls the machine it hits (1.6 seconds, DISRUPT_TIME, unless a star says longer).
//   STALL       a stalled machine stops working for a while. A MACHINE is an enemy rig, factory, turret or belt tile.
//   FREEZE      a frozen machine stops and its timers pause; a frozen belt tile also chills the payloads on it.
//   POISON      each poison on the enemy hull deals 0.4 damage a second (up to 24 poison) until 6 seconds pass without a
//               poisoned hit.
//   FRAY        each fray on the enemy hull makes every later hit deal 0.2 more damage (up to 15 fray).
//   SPEED       a belt "60% FASTER", "3 TIMES AS FAST", "AT HALF SPEED" or "40% SLOWER", from the tile a speed rig hits
//               on. METRONOME's belts are locked at normal speed: speed rigs add damage there instead.
//   COPIES      SPLITTER and SORTING ARM make more payloads from one.
//   LOADS       a turret's chamber holds loads. It fires when the chamber is full or its LOAD TIME ends (1.5 seconds
//               after the first load, WINDOW_TIME). A turret with 4 payloads backed up at its intakes JAMS.
//   FIRE RATE   "THE TURRET FIRES 33% FASTER": the rate, from the fire interval (x0.75 fires 1 / 0.75 = 33% faster).
//   HARASSMENT  any stall, freeze, slow, wreck or rip that lands on an enemy machine.
//   MARKS       CHILL (from a frozen belt tile: 25% less damage) and SNAG (from a chain slow: 20% slower ride).
// 0.8.0 P1 (wave 3, DESIGN-wave3.md 3.2's glossary; each a shared sentence in S below):
//   PLATING     plating takes damage, burn and poison before your hull, up to 24 (PLATE_CAP); the dark wind goes straight
//               through it (S.plating). "2 PLATING", "0.5 PLATING": at most one decimal, the word PLATING as its unit.
//   PAIR        two loads that reach one turret through different intakes within 0.25 seconds (SYNC_WINDOW); a FOUNDRY
//               fusion is a pair (S.pair).
//   MATCHED     a belt with as many tiles as another belt into the same turret (S.matched).
//   WORKS FASTER a factory that works faster stamps and pours sooner, and its other timers run faster too (S.worksFaster).
// UNITS (T2): seconds as "2.75 SECONDS" or "1 SECOND" (at most two decimals); percentages whole, with "%"; damage with
// at most one decimal and the word DAMAGE. Never a bare multiplier (X2, 1.5X), a slash rate (/HIT, /S), a glued second
// (4S), an ordinal (3RD) or a "·". Labelled stat rows (the belt timeline, the turret rows) may keep short labels and SEC.

import {
  AMMO, BURN_TIME, CELL, BELT_SPEED, COMMISSION_BASE, COMMISSION_STEP, DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, HEROES, ITEMS,
  JAM_THRESHOLD, SHAPE_ARROWS, WINDOW_TIME, rigShape, type HarassCause, type HeroId, type ItemDef,
} from "../sim/content";
import { PEAK_SHIFT, PENDULUM } from "../sim/races/data";
import { BURN_DPS } from "../sim/content"; // NUM-1 (REQ-BFG-047): a Burn stack's damage a second
import { factorySpeed, rateMul, secPer } from "../sim/content"; // NUM-2 (REQ-BFG-047): SPEED (the faces keep SEC: 30 / speed)
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
  sabotBelt: 5, // battle.ts roundImpact: a sabot stalls a belt tile 5 s
  sabotFactory: 4, // ... a factory 4 s
  sabotTurret: 3, // ... a turret 3 s
  sabotHull: 60, // battle.ts impact: + 60 on bare hull (NUM-1: x10 of 6)
  shrapnel: 2, // battle.ts roundImpact: SHRAPNEL stalls the tiles either side 2 s
  chainFactory: 0.8, // battle.ts slowSegment: a factory's timer + 0.8 s
  chainTurret: 0.5, // ... a turret's fire cooldown + 0.5 s
  snag: 0.8, // battle.ts transport: a snagged payload rides x0.8 (20% slower)
  chill: 0.75, // harassment.ts debuffedDamage: a chilled payload deals x0.75 (25% less)
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
      return `ITS CRUCIBLE POURS A BLANK ONTO BOTH ITS BELTS AT ONCE, AND TWO BLANKS THAT REACH ONE GUN WITHIN ${seconds(SYNC_WINDOW)} FUSE INTO ONE SLUG WITH ${times2(FUSE_MULT)} THEIR DAMAGE.`;
    case "bastion":
      return `ITS BULWARK SLUGS PLATE YOUR HULL AS THEY LOAD, ${n1(PLATE_PER_SLUG)} EACH UP TO ${PLATE_CAP} PLATING, AND PLATING TAKES HITS AND BURN BEFORE YOUR HULL DOES.`;
    default:
      return h.blurb.join(" ");
  }
}

// ---------------------------------------------------------------------------------------------------------------- units

/** At most one decimal (damage, hull). */
export const n1 = (x: number): string => String(+x.toFixed(1));
/** At most two decimals (seconds). */
export const n2 = (x: number): string => String(+x.toFixed(2));
/** "2.75 SECONDS", "1 SECOND". */
export const seconds = (x: number): string => `${n2(x)} SECOND${n2(x) === "1" ? "" : "S"}`;
/** "2 DAMAGE", "1.8 DAMAGE". */
export const damage = (x: number): string => `${n1(x)} DAMAGE`;
/** "1.2 MORE DAMAGE". */
export const moreDamage = (x: number): string => `${n1(x)} MORE DAMAGE`;
/** 0.25 -> "25%". */
export const percent = (x: number): string => `${Math.round(x * 100)}%`;
/** "1 BELT", "3 BELTS". */
export const plural = (n: number, one: string, many = `${one}S`): string => `${n} ${n === 1 ? one : many}`;
/** "TWICE", "3 TIMES", "2.2 TIMES". */
export const times = (r: number): string => (n1(r) === "2" ? "TWICE" : `${n1(r)} TIMES`);
/** times() with two decimals, for a multiplier the sim keeps at two places: "1.15 TIMES" (0.8.0 B1: FUSE_MULT 1.15). */
export const times2 = (r: number): string => (n2(r) === "2" ? "TWICE" : `${n2(r)} TIMES`);
/** A rate or speed multiplier above 1: "33% FASTER" below 2, then "TWICE AS FAST", "2.3 TIMES AS FAST". */
export function faster(r: number): string {
  if (r >= 2 - 1e-9) return `${times(r)} AS FAST`;
  return `${Math.round((r - 1) * 100)}% FASTER`;
}
/** A belt speed state: "60% FASTER", "3 TIMES AS FAST", "AT HALF SPEED", "40% SLOWER". */
export function speedText(r: number): string {
  if (r >= 1) return faster(r);
  return Math.abs(r - 0.5) < 1e-9 ? "AT HALF SPEED" : `${Math.round((1 - r) * 100)}% SLOWER`;
}
/** A fire interval multiplier as the fire rate: x0.75 -> "33% FASTER" (1 / 0.75), x1.4 -> "29% SLOWER". */
export function rateText(intervalMul: number): string {
  const r = 1 / intervalMul;
  return r >= 1 ? faster(r) : `${Math.round((1 - r) * 100)}% SLOWER`;
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

/** The shared sentences: the same effect reads the same everywhere (T5). */
export const S = {
  burn: `EACH BURN DEALS THE ENEMY HULL ${BURN_DPS} DAMAGE A SECOND FOR ${seconds(BURN_TIME)}.`, // NUM-1: the sim's BURN_DPS (was a literal 1)
  /** What a shock does: "STALLS A MACHINE FOR 1.6 SECONDS" (n machines with a jump). */
  stalls: (t: number, n: number) => `STALLS ${n === 1 ? "A MACHINE" : `${n} MACHINES`} FOR ${seconds(t)}`,
  /** How a jump spreads a shock (or a freeze) after the machine the shot hits. */
  spread: (verb: string, n: number) => `THE SHOT ${verb} THE MACHINE IT HITS, THEN THE ${n === 1 ? "NEAREST OTHER ONE" : `${n} NEAREST OTHERS`}.`,
  hullShock: "A SHOT THAT HITS BARE HULL STALLS NOTHING.",
  /** A speed rig on METRONOME's locked belts: the lockedFlat it pays there (`more`: on top of its own damage). */
  locked: (d: number, more = false) =>
    `ON METRONOME'S LOCKED BELTS IT ADDS ${more ? moreDamage(d) : damage(d)} INSTEAD${more ? " OF THE SPEED CHANGE" : ""}.`,
  harassment: "HARASSMENT IS ANY STALL, FREEZE, SLOW, WRECK OR RIP ON AN ENEMY MACHINE.",
  poison: `EACH POISON ON THE ENEMY HULL DEALS ${n1(SIM.poisonTick)} DAMAGE A SECOND, UP TO ${SIM.poisonMax} POISON.`,
  poisonTime: `THE POISON CLEARS ${seconds(SIM.poisonTime)} AFTER THE LAST POISONED HIT.`,
  marks: `MARKS ARE CHILL FROM A FROZEN TILE (${percent(1 - SIM.chill)} LESS DAMAGE) AND SNAG FROM A CHAIN (${percent(1 - SIM.snag)} SLOWER RIDE).`,
  fray: (max?: number) => `EACH FRAY ON THE ENEMY HULL MAKES EVERY LATER HIT DEAL ${moreDamage(FRAY_BONUS)}${max ? `, UP TO ${max} FRAY` : ""}.`,
  online: `RIGS NORMALLY COME ONLINE ${seconds(COMMISSION_BASE)} INTO A BATTLE, ${seconds(COMMISSION_STEP)} LATER FOR EACH RIG BEFORE THEM ON THEIR BELT.`,
  bonus: "BONUS DAMAGE IS WHAT RIGS AND SCRAP ADD TO A PAYLOAD.",
  chamber: `A TURRET FIRES WHEN ITS CHAMBER IS FULL OR ITS LOAD TIME ENDS, ${seconds(WINDOW_TIME)} AFTER THE FIRST LOAD.`,
  jam: `A TURRET WITH ${JAM_THRESHOLD} PAYLOADS BACKED UP AT ITS INTAKES JAMS.`,
  gatling: "IT DOES NOTHING ON A GATLING SPOOL, WHICH NEVER WAITS FOR A FULL CHAMBER.",
  stamps: (what: string, secs: number) => `IT STAMPS ${what} ${every(secs)}.`,
  machines: "A SHOT AT A MACHINE STILL DAMAGES THE ENEMY HULL.",
  // 0.8.0 P1, wave 3's four glossary sentences (DESIGN-wave3.md 3.2): E1's pool on every hull (races/bastion.ts absorb
  // and PLATE_CAP; hullEffects' wind line skips it), E2's pair (races/foundry.ts inSync), E6's matched belt (deck.ts
  // matchedRoutes) and E3's stoked factory (Battle.produce: its stamp timer, trigger cooldown and plating timer)
  plating: `PLATING TAKES DAMAGE, BURN AND POISON BEFORE YOUR HULL, UP TO ${PLATE_CAP} PLATING; THE DARK WIND GOES STRAIGHT THROUGH IT.`,
  pair: `A PAIR IS TWO LOADS THAT REACH ONE TURRET THROUGH DIFFERENT INTAKES WITHIN ${seconds(SYNC_WINDOW)}; A FOUNDRY FUSION IS A PAIR.`,
  matched: "A MATCHED BELT HAS AS MANY TILES AS ANOTHER BELT INTO THE SAME TURRET.",
  worksFaster: "A FACTORY THAT WORKS FASTER STAMPS AND POURS SOONER, AND ITS OTHER TIMERS RUN FASTER TOO.",
};

/** 0.8.0 P1: a small count as a word ("TWO PLAIN SLUGS"), as DESIGN-wave3.md 3.3 writes TWIN MOULD's. */
const COUNT = ["NO", "ONE", "TWO", "THREE", "FOUR", "FIVE"];
const countWord = (n: number): string => COUNT[n] ?? String(n);

/** 0.6.2 FB-B: the stalls a MANTLET's turret ignores, in the words the shop uses for their sources (drag: DRAG CHAIN
 *  FOUNDRY, rip: GRAPNEL GUN); the spec's own list, in its order. */
export const STALL_WORD: Record<HarassCause, string> = {
  shock: "SHOCK", static: "STATIC", arc: "ARC", drag: "CHAIN", freeze: "FROST", sabot: "SABOT", rip: "GRAPNEL", limpet: "LIMPET", sap: "SAP",
};
function list(words: string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} AND ${words[words.length - 1]}`;
}
const immunities = (e: ItemDef): string => list((m(e).immune ?? []).map((k) => STALL_WORD[k]));
/** 0.6.2 FB-B: MANTLET ★2 FULL PLATE shields the last tile of each belt into its turret, ★3 BULWARK SKIRT the last 3
 *  (battle.ts makeSide: the last intakeGuard tiles of every connected route into it); a rig with an arrow on a shielded
 *  tile is shielded too (Battle.skirted), against the turret's own list. */
const shielded = (n: number): string => (n === 1
  ? "SO DO THE LAST TILE OF EACH BELT IN, AND THE RIGS WORKING IT."
  : `SO DO THE LAST ${n} TILES OF EACH BELT IN, AND THE RIGS WORKING THEM.`);
/** MANTLET's clause at a star: at ★1 the stalls it ignores; above, the stalls that star adds and the tiles it shields. */
function mantletGist(e: ItemDef, stars: number): string {
  const was = stars > 1 ? effectAt("mantlet", stars - 1).mod?.immune ?? [] : [];
  const added = (m(e).immune ?? []).filter((c) => !was.includes(c)), guard = m(e).intakeGuard ?? 0;
  return [
    ...(stars <= 1 ? [`IGNORES ${immunities(e)} STALLS`] : added.length ? [`IGNORES ${list(added.map((c) => STALL_WORD[c]))} TOO`] : []),
    ...(guard ? [`SHIELDS THE LAST ${guard === 1 ? "TILE" : `${guard} TILES`} OF EACH BELT IN`] : []),
  ].join(", ");
}

/** 0.6.2 FB-B (DESIGN §11 P6): the turret panel's sentence for a turret whose MANTLET ★2/★3 shields `n` belt tiles. */
export function shieldText(n: number): string {
  return `SHIELDED: THE LAST ${n === 1 ? "TILE" : `${n} TILES`} OF EACH BELT IN, AND THE RIGS WORKING ${n === 1 ? "IT" : "THEM"}.`;
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
  if (def === "hopper") return `${core}: THE HOPPER'S LONGER LOAD TIME DOES NOTHING HERE${effectAt(def, stars).mod?.store ? ", BUT ITS STORE STILL WORKS" : ""}.`;
  if (def === "ram" && routine === "gatling") return "GATLING SPOOL: NO FULL CHAMBER, SO THE FINISHER RAM DOES NOTHING.";
  // 0.8.0 P1 (DESIGN-wave3.md 3.3 module 13): TWIN TRIGGER's shorter load time, as HOPPER's longer one; its pair bonus
  // still works there (Battle.fire and fireCore read the pair mark, a COMPOUND shell's packed load too)
  if (def === "twintrigger") return `${core}: THE TWIN TRIGGER'S SHORTER LOAD TIME DOES NOTHING HERE, BUT PAIRS STILL HIT HARDER.`;
  return null;
}

/**
 * 0.6.2rel2 (the release owner's answer d957272806131146): a clash's short line, for a desk turret panel whose gear list
 * leaves no room for the whole sentence (gatlingClashText): the same trigger, one line for each clashing gear type. It
 * claims no more than the sentence does: only HOPPER's seconds do nothing (its slot and store still count), and FINISHER
 * RAM nothing on a GATLING SPOOL.
 */
export function clashShortText(def: string, routine = "gatling"): string | null {
  if (routine !== "gatling" && routine !== "compound") return null;
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
    text: (e) => [
      g(e).flat
        ? `SLOWS ${belts(e)} PAST IT TO HALF SPEED AND ADDS ${damage(g(e).flat!)} TO EACH PAYLOAD.`
        : `SLOWS ${belts(e)} PAST IT TO HALF SPEED.`,
      S.locked(g(e).lockedFlat!, !!g(e).flat),
    ],
    gist: (e) => (g(e).flat ? `ADDS ${damage(g(e).flat!)}` : "HALF SPEED"),
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
        ...(jump ? [S.spread("STALLS", jump)] : []),
        S.hullShock,
      ];
    },
    gist: (e) => `STALLS ${g(e).jump ? plural(1 + g(e).jump!, "MACHINE") : "A MACHINE"} FOR ${seconds(g(e).shockTime ?? DISRUPT_TIME)}`,
    card: (e) => `SHOCK STALLS FOR ${seconds(g(e).shockTime ?? DISRUPT_TIME)}`,
  },
  splitter: {
    text: (e) => [
      `SPLITS EACH PAYLOAD INTO ${g(e).split!.copies} COPIES AT ${percent(g(e).split!.mult)} DAMAGE.`,
      "EACH COPY KEEPS ALL OF THE BURN, POISON AND SHOCK.",
    ],
    gist: (e) => `${g(e).split!.copies} COPIES AT ${percent(g(e).split!.mult)} DAMAGE`,
    card: (e) => `SPLITS INTO ${g(e).split!.copies} AT ${percent(g(e).split!.mult)}`,
  },
  overdrive: {
    // ★2 REDLINE: GUARD_SLOW (chain slows can't slow its belts from its tiles on); ★3 AFTERBURNER: + 3 flat and
    // GUARD_FREEZE (frost can't freeze those tiles). Battle.acceptHarassment, routeGuardActive
    text: (e) => {
      const gt = g(e), guard = gt.guard ?? 0;
      return [
        `MAKES ${belts(e)} PAST IT ${speedText(gt.speed!)}${gt.flat ? ` AND ADDS ${damage(gt.flat)} TO EACH PAYLOAD` : ""}.`,
        ...(guard ? [`ENEMY CHAINS${guard & 2 ? " AND FROST" : ""} CAN'T SLOW${guard & 2 ? " OR FREEZE" : ""} ${belts(e)} PAST IT.`] : []),
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
    text: (e) => [
      `BLOCKS THE FIRST ${g(e).toll} ENEMY HARASSMENT HITS ON ITS BELTS${g(e).tollFactory ? " AND THEIR FACTORIES" : ""} EACH BATTLE.`,
      "IT ALSO GUARDS THE RIGS ON THOSE BELTS AND THE TURRETS THEY FEED.",
      S.harassment,
    ],
    gist: (e) => `BLOCKS ${g(e).toll} HITS${g(e).tollFactory ? ", FACTORIES TOO" : ""}`,
    card: (e) => `BLOCKS ${g(e).toll} HITS OF HARASSMENT`,
  },
  sifter: {
    // harassment.ts siftDebuffs: CHILL, SNAG, SAP order; ★2 POLISH / ★3 FINE MESH sift all, + flat per mark (+ clean)
    text: (e) => {
      const gt = g(e);
      if (gt.sift !== "all") return [`REMOVES ${gt.sift === 1 ? "ONE ENEMY MARK" : `${gt.sift} ENEMY MARKS`} FROM EACH PAYLOAD IT HITS, CHILL FIRST.`, S.marks];
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
    text: (e) => {
      const p = g(e).pulse!;
      return [
        `PULSES ITS BELTS ${speedText(p.speed)} FOR ${seconds(p.on)} ${every(p.period)}${p.flat ? `, EACH PULSE ADDING ${damage(p.flat)}` : ""}.`,
        ...(p.flat ? ["THE DAMAGE GOES TO EVERY PAYLOAD THE PULSE SPEEDS UP."] : []),
        "BETWEEN PULSES THE BELT RUNS AT NORMAL SPEED.",
        S.locked(g(e).lockedFlat!),
      ];
    },
    gist: (e) => `${speedText(g(e).pulse!.speed)}${g(e).pulse!.flat ? `, ${damage(g(e).pulse!.flat)} A PULSE` : ""}`,
    card: (e) => `PULSES BELTS ${speedText(g(e).pulse!.speed)}`,
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
    // SUS-A (REQ-BFG-069): the field is `heal` now (compile-driven); the words are SUS-B's
    text: (e) => [`REPAIRS YOUR HULL BY ${n1(g(e).heal!)} FOR EACH PAYLOAD IT HITS.`, "IT NEVER REPAIRS PAST YOUR FULL HULL."],
    gist: (e) => `REPAIRS ${n1(g(e).heal!)} FOR EACH PAYLOAD`,
    card: (e) => `REPAIRS ${n1(g(e).heal!)} HULL EACH HIT`,
  },
  heatjacket: {
    // transport: heatBonus += heat x ride, from the hit on; two jackets add up
    text: (e) => [`ADDS ${damage(g(e).heat!)} FOR EACH SECOND THE PAYLOAD RIDES AFTER IT.`, "TWO JACKETS ADD UP."],
    gist: (e) => `${damage(g(e).heat!)} FOR EACH SECOND`,
    card: (e) => `${damage(g(e).heat!)} A SECOND RIDDEN`,
  },
  venom: {
    text: (e) => [`ADDS ${g(e).poison} POISON TO EACH PAYLOAD IT HITS.`, S.poison, S.poisonTime],
    gist: (e) => `ADDS ${g(e).poison} POISON`,
  },
  overclocker: {
    // Battle.makeSide: each OVERCLOCKER boosts the first later boostable rig on its belt (overclock.ts boostable);
    // Battle.applyHit: the boosted hit is doubled (overclocked) and the booster recharges for overclockCooldown
    text: (e) => [
      `DOUBLES THE NEXT RIG'S HIT, THEN RECHARGES FOR ${seconds(g(e).overclockCooldown!)}.`,
      "THE NEXT RIG IS THE FIRST LATER RIG ON ITS BELT THAT CAN BE DOUBLED.",
      // 0.8.0 I1 M2 (REPORT-P1 section 13): wave 3's STOKER and BRACE FRAME act on no payload (overclock.ts boostable)
      "SPEED RIGS, TOLLBOOTHS, SIFTERS, RIVETERS, POWDER KEGS, STOKERS, BRACE FRAMES AND OVERCLOCKERS CAN'T.",
    ],
    gist: (e) => `RECHARGES IN ${seconds(g(e).overclockCooldown!)}`,
    card: () => "DOUBLES THE NEXT RIG'S HIT",
  },
  keg: {
    // Battle.detonateKeg: once, when the fuse (running while online, paused by a stall or freeze) ends; ★3 WIDE BLAST:
    // every belt beside the keg, not only those its arrows hit
    text: (e) => {
      const k = g(e).keg!;
      return [
        `ADDS ${damage(k.flat)} AND ${k.burn} BURN TO EVERY PAYLOAD ON ${k.wide ? "EVERY BELT BESIDE IT" : "ITS BELTS"} WHEN IT BLOWS UP.`,
        `IT BLOWS ONCE, ${seconds(k.fuse)} AFTER IT COMES ONLINE; A STALL OR FREEZE PAUSES THE FUSE.`,
        S.burn,
      ];
    },
    gist: (e) => `${damage(g(e).keg!.flat)} AND ${g(e).keg!.burn} BURN${g(e).keg!.wide ? " ON EVERY BELT BESIDE IT" : ` AFTER ${seconds(g(e).keg!.fuse)}`}`,
    card: (e) => `BLOWS UP: ${damage(g(e).keg!.flat)}, ${g(e).keg!.burn} BURN`,
  },
  bellows: {
    text: (e) => [
      `ADDS 1 BURN FOR EVERY ${seconds(g(e).burnPerRide!.seconds)} THE PAYLOAD HAS RIDDEN, UP TO ${g(e).burnPerRide!.max} BURN.`,
      S.burn,
    ],
    gist: (e) => `1 BURN ${every(g(e).burnPerRide!.seconds)}, UP TO ${g(e).burnPerRide!.max} BURN`,
    card: (e) => `BURN FOR RIDE TIME, UP TO ${g(e).burnPerRide!.max}`,
  },
  quench: {
    // 0.6.2 FB-B (Battle.applyHit): + flat on every payload it hits; then up to `stacks` of the payload's Burn, each
    // spent for perBurn more damage (a Burn is worth 1 damage a second for 3 seconds); any more Burn stays on it
    text: (e) => {
      const q = g(e).quench!;
      return [
        `ADDS ${damage(q.flat)} TO EACH PAYLOAD IT HITS, THEN TURNS UP TO ${q.stacks} OF ITS BURN INTO ${moreDamage(q.perBurn)} EACH.`,
        "ANY MORE BURN STAYS ON THE PAYLOAD.",
        S.burn,
      ];
    },
    gist: (e) => `ADDS ${damage(g(e).quench!.flat)}, THEN ${moreDamage(g(e).quench!.perBurn)} FOR EACH BURN, UP TO ${g(e).quench!.stacks} BURN`,
    card: () => "TURNS BURN INTO DAMAGE",
  },
  staticbrush: {
    // Battle.impact: a static payload that hits bare hull stalls a random enemy turret
    text: (e) => [`PAYLOADS IT HITS STALL AN ENEMY TURRET FOR ${seconds(g(e).staticTime!)} WHEN THEY HIT BARE HULL.`, "THE TURRET IS PICKED AT RANDOM."],
    gist: (e) => `STALLS A TURRET FOR ${seconds(g(e).staticTime!)}`,
    card: () => "HULL HITS STALL A TURRET",
  },
  lodestone: {
    // Battle.applyHit: the foe's rigs, factories and turrets stalled, frozen or wrecked as the payload passes.
    // 0.6.2rel3 (TUNE-M T2, adf77b2): the floor (gate.flat, +1/+2/+3) on every payload it hits, then the per-stalled
    // bonus on top, capped by perStalled.max; one sentence, so the floor never shows without the bonus or the other way.
    // As short as the sentence it replaces (it must still fit the phone band and the desk column whole)
    text: (e) => [
      `ADDS ${damage(g(e).flat ?? 0)}, AND ${n1(g(e).perStalled!.each)} FOR EACH ENEMY MACHINE STALLED, UP TO ${damage(g(e).perStalled!.max)}.`,
      "FROZEN AND WRECKED MACHINES COUNT; BELT TILES DON'T.",
    ],
    gist: (e) => `ADDS ${damage(g(e).flat ?? 0)}, AND ${n1(g(e).perStalled!.each)} FOR EACH STALLED MACHINE`,
    card: (e) => `${damage(g(e).flat ?? 0)}, MORE FOR EACH STALL`,
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
    text: (e) => [`ADDS ${damage(g(e).perTile!.each)} FOR EACH BELT TILE THE PAYLOAD HAS RIDDEN, UP TO ${damage(g(e).perTile!.max)}.`],
    gist: (e) => `${damage(g(e).perTile!.each)} FOR EACH TILE, UP TO ${damage(g(e).perTile!.max)}`,
    card: (e) => `${damage(g(e).perTile!.each)} FOR EACH TILE RIDDEN`,
  },
  // ------------------------------------------------------------------------------------------------------ factories
  press: {
    text: (e) => [`STAMPS ${f(e).base !== undefined ? "A SLUG" : "A PLAIN SLUG"} (${damage(slugBase(e))}) ${every(secPer(f(e).speed))}.`],
    gist: (e) => `${damage(slugBase(e))} SLUGS ${every(secPer(f(e).speed))}`,
    card: (e) => `A SLUG ${every(secPer(f(e).speed))}`,
  },
  doublestamp: {
    text: (e) => [
      `STAMPS ${f(e).batch} ${f(e).base !== undefined ? "SLUGS" : "PLAIN SLUGS"} (${damage(slugBase(e))} EACH) ${every(secPer(f(e).speed))}.`,
      "THEY LEAVE ONE BY ONE AS THE BELT MAKES ROOM.",
    ],
    gist: (e) => `${f(e).batch} SLUGS OF ${damage(slugBase(e))} ${every(secPer(f(e).speed))}`,
    card: (e) => `${f(e).batch} SLUGS ${every(secPer(f(e).speed))}`,
  },
  shottower: {
    text: (e) => [`DROPS ${f(e).batch} BUCKSHOT (${damage(slugBase(e))} EACH) ${every(secPer(f(e).speed))}.`, "RIGS HIT EACH BUCKSHOT ON ITS OWN."],
    gist: (e) => `${damage(slugBase(e))} BUCKSHOT ${every(secPer(f(e).speed))}`,
    card: (e) => `${f(e).batch} BUCKSHOT ${every(secPer(f(e).speed))}`,
  },
  hotswap: {
    // Battle.stamp: each stamp writes the next preset of the cycle (EMBER: + burn; SPARK: shock, + shockTime and jump)
    text: (e) => {
      const em = f(e).cycle!.find((p) => p.tint === "ember")!, sp = f(e).cycle!.find((p) => p.tint === "spark")!;
      return [
        `STAMPS EMBER SLUGS WITH ${em.burn ?? 0} BURN AND SPARK SLUGS WITH SHOCK, IN TURN.`,
        S.stamps("ONE", secPer(f(e).speed)),
        `THE SPARK'S SHOCK ${S.stalls(sp.shockTime ?? DISRUPT_TIME, 1 + (sp.jump ?? 0))}.`,
        S.burn,
      ];
    },
    gist: (e) => {
      const em = f(e).cycle!.find((p) => p.tint === "ember")!, sp = f(e).cycle!.find((p) => p.tint === "spark")!;
      return `${em.burn ?? 0} BURN, SHOCK STALLS ${sp.jump ? plural(1 + sp.jump, "MACHINE") : "A MACHINE"} FOR ${seconds(sp.shockTime ?? DISRUPT_TIME)}`;
    },
    card: () => "BURN AND SHOCK SLUGS IN TURN",
  },
  slagpot: {
    // Battle.transport: slag keeps AMMO.slag.fixedSpeed whatever the speed rigs, the speed lock and slows
    text: (e) => [
      `STAMPS A HEAVY SLAG SLUG (${damage(slugBase(e))}) ${every(secPer(f(e).speed))}.`,
      `SLAG ALWAYS RIDES AT ${percent(AMMO.slag.fixedSpeed!)} SPEED: SPEED RIGS AND ENEMY SLOWS CAN'T CHANGE IT.`,
    ],
    gist: (e) => `${damage(slugBase(e))} SLAG ${every(secPer(f(e).speed))}`,
    card: (e) => `HEAVY ${damage(slugBase(e))} SLAG SLUGS`,
  },
  assembly: {
    // Battle.makeSide (assemblyLines): while it feeds a turret, every rig's online time x commission; its own belts'
    // rigs at 0 s; ★3 HOT START overclocks its belts' rigs (every hit doubled) until hotStart seconds
    text: (e) => {
      const fs = f(e), k = fs.commission!;
      return [
        `WHILE IT FEEDS A TURRET, ${k <= 0 ? "ALL " : ""}YOUR RIGS COME ONLINE ${onlineIn(k)}.`,
        fs.hotStart ? `RIGS ON ITS OWN BELT HIT TWICE AS HARD FOR THE FIRST ${seconds(fs.hotStart)}.` : "RIGS ON ITS OWN BELT COME ONLINE AT ONCE.",
        S.stamps(`A PLAIN SLUG (${damage(slugBase(e))})`, secPer(fs.speed)),
        S.online,
      ];
    },
    perkAt: (e) => (f(e).hotStart ? 1 : 0),
    gist: (e) => `${f(e).commission! <= 0 ? "ALL " : ""}RIGS ONLINE ${onlineIn(f(e).commission!)}`,
    card: () => "RIGS ONLINE IN HALF THE TIME",
  },
  gantry: {
    text: (e, x) => [
      `FEEDS ${outputsAt(e.id, x.stars)} BELTS IN TURN, STAMPING ${f(e).base !== undefined ? "A SLUG" : "A PLAIN SLUG"} (${damage(slugBase(e))}) ${every(secPer(f(e).speed))}.`,
    ],
    // bb-0.8.3 (REQ-BFG-042 M4): the next-star and MERGES WITH lines lead with a factory's belts at that star (nextStarText),
    // so the gist says the rest: FOURTH ARM's faster stamp, HEAVY GANTRY's slugs. T47 (REQ-BFG-047): no seconds, so ★1
    // says its belts (0.8.4's gist) and FOURTH ARM says FASTER
    gist: (e, x) =>
      f(e).base !== undefined
        ? `${damage(slugBase(e))} SLUGS`
        : secPer(f(e).speed) < secPer(f(effectAt(e.id, 1)).speed)
          ? "FASTER PLAIN SLUGS"
          : `FEEDS ${outputsAt(e.id, x.stars)} BELTS`,
    card: (e, x) => `FEEDS ${outputsAt(e.id, x.stars)} BELTS IN TURN`,
  },
  scrapper: {
    // Battle.produce: the timer stamps every interval whatever happens, and each harassment the side lands queues one
    // more stamp (up to 3 waiting); ★3 BIG HAUL: a rig its sabots wreck queues one more (Battle.acceptHarassment)
    text: (e) => [
      `STAMPS SCRAP SLUGS THAT DEAL ${moreDamage(f(e).scrapFlat!)} THAN PLAIN ONES.`,
      `IT STAMPS ONE ${every(secPer(f(e).speed))}, AND ONE MORE EACH TIME YOUR HARASSMENT LANDS, UP TO ${SIM.scrapQueue} WAITING.`,
      // ★3 BIG HAUL: a sabot wreck is harassment (one stamp) and a wreck (one more): self-contained, as the phone band
      // may show it without the sentence before it
      ...(f(e).bigHaul ? ["A RIG YOUR SABOTS WRECK EARNS 2 SCRAP SLUGS, NOT 1."] : []),
      S.harassment,
    ],
    perkAt: (e) => (f(e).bigHaul ? 2 : 0),
    // the numbers that change; ★3's BIG HAUL is named after this clause (newPerk), and its sentence says what it does
    gist: (e) => `${moreDamage(f(e).scrapFlat!)}, ONE ${every(secPer(f(e).speed))}`,
    card: (e) => `SCRAP SLUGS, ${moreDamage(f(e).scrapFlat!)}`,
  },
  sabot: {
    // Battle.roundImpact: a rig is wrecked (for the battle), a belt tile stalls 5 s, a factory 4 s, a turret 3 s; bare hull
    // takes + 6 (Battle.impact); ★3 SHRAPNEL: the belt tiles either side of where it landed stall 2 s
    text: (e) => {
      const shrapnel = round<{ shrapnel?: boolean }>(e).shrapnel;
      return [
        "STAMPS SABOTS THAT WRECK THE ENEMY RIG THEY HIT FOR THE REST OF THE BATTLE.",
        S.stamps("ONE", secPer(f(e).speed)),
        ...(shrapnel ? [`ON A RIG OR BELT, IT ALSO STALLS THE TILES ON EITHER SIDE FOR ${seconds(SIM.shrapnel)}.`] : []),
        `A SABOT STALLS A BELT TILE FOR ${seconds(SIM.sabotBelt)}, A FACTORY FOR ${seconds(SIM.sabotFactory)} OR A TURRET FOR ${seconds(SIM.sabotTurret)}.`,
        `ON BARE HULL IT DEALS ${moreDamage(SIM.sabotHull)}.`,
      ];
    },
    perkAt: (e) => (round<{ shrapnel?: boolean }>(e).shrapnel ? 2 : 0),
    // ★3's SHRAPNEL is named after this clause (newPerk), so the clause doesn't name it too
    gist: (e) => `A SABOT ${every(secPer(f(e).speed))}`,
    card: () => "SABOTS WRECK ENEMY RIGS",
  },
  frostbite: {
    // Battle.roundImpact: freeze the machine it hits, then the `spread` nearest others (★2/★3 HOARFROST)
    text: (e) => {
      const r = round<{ seconds: number; spread: number }>(e);
      return [
        `STAMPS ROUNDS THAT FREEZE ${r.spread ? `${r.spread + 1} MACHINES` : "THE MACHINE THEY HIT"} FOR ${seconds(r.seconds)}.`,
        ...(r.spread ? [S.spread("FREEZES", r.spread)] : []),
        S.stamps("ONE", secPer(f(e).speed)),
        `A FROZEN MACHINE STOPS AND ITS TIMERS PAUSE; A FROZEN BELT TILE ALSO CHILLS ITS PAYLOADS (${percent(1 - SIM.chill)} LESS DAMAGE).`,
        "A ROUND THAT HITS BARE HULL FREEZES NOTHING.",
      ];
    },
    gist: (e) => {
      const r = round<{ seconds: number; spread: number }>(e);
      return `FREEZES ${r.spread ? plural(r.spread + 1, "MACHINE") : "A MACHINE"} FOR ${seconds(r.seconds)}`;
    },
    card: (e) => `FREEZES A MACHINE FOR ${seconds(round<{ seconds: number }>(e).seconds)}`,
  },
  dragchain: {
    // Battle.slowSegment: the stretch of belt between its rigs; snagged payloads ride 20% slower from then on
    text: (e) => {
      const r = round<{ mul: number; seconds: number }>(e);
      return [
        `STAMPS CHAIN ROUNDS THAT MAKE THE ENEMY BELT THEY HIT ${speedText(r.mul)} FOR ${seconds(r.seconds)}.`,
        `PAYLOADS ON IT ARE SNAGGED AND RIDE ${percent(1 - SIM.snag)} SLOWER FROM THEN ON.`,
        S.stamps("ONE", secPer(f(e).speed)),
        "THE SLOW COVERS THE STRETCH OF BELT BETWEEN TWO RIGS.",
        `A CHAIN ON A FACTORY DELAYS ITS NEXT SLUG BY ${seconds(SIM.chainFactory)}; ON A TURRET, ITS NEXT SHOT BY ${seconds(SIM.chainTurret)}.`,
      ];
    },
    gist: (e) => {
      const r = round<{ mul: number; seconds: number }>(e);
      return `${speedText(r.mul)} FOR ${seconds(r.seconds)}`;
    },
    card: (e) => `MAKES ENEMY BELTS ${speedText(round<{ mul: number }>(e).mul)}`,
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
        `TWO BLANKS THAT REACH ONE TURRET THROUGH DIFFERENT INTAKES WITHIN ${seconds(SYNC_WINDOW)} OF EACH OTHER FUSE INTO AN ALLOY SLUG WITH ${times2(FUSE_MULT)} THEIR DAMAGE.`,
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
      `EACH ONE THAT LOADS INTO A TURRET PLATES YOUR HULL BY ${n1(PLATE_PER_SLUG)}, UP TO ${PLATE_CAP} PLATING; A SPLITTER COPY PLATES BY ITS SHARE.`,
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
        ...(hero && sig ? [`FOR ${hero.name}, THAT IS ${an(ammo)} ${every(secPer(factorySpeed(e.id, fs, x.hero!)))}${pour ? `, POURED ONTO ${pour} BELTS AT ONCE` : ""}.`] : []),
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
        ...(r.stall ? [`THE BLAST ALSO STALLS THE MACHINE THE CHARGE STUCK TO FOR ${seconds(r.stall)}.`] : []),
        S.stamps("ONE", secPer(f(e).speed)),
      ];
    },
    gist: (e) => {
      const r = round<{ delay: number; blast: number; stall?: number }>(e);
      return `BLASTS FOR ${damage(r.blast)}${r.stall ? ` AND STALLS FOR ${seconds(r.stall)}` : ""}`;
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
    text: (e, x) => {
      const s = c(e, x);
      return [
        `CUTS THE LOAD TIME TO ${seconds(s.windowTime ?? WINDOW_TIME)} AND FIRES THE OLDEST LOAD FIRST.`,
        ...(s.fireRate ? [`IT FIRES ${rateText(imul(s.fireRate))}${s.noJam ? " AND NEVER JAMS" : ""}.`] : []),
        S.chamber,
      ];
    },
    perkAt: (e, x) => (c(e, x).fireRate ? 1 : 0),
    gist: (e, x) => {
      const s = c(e, x);
      return s.fireRate ? `FIRES ${rateText(imul(s.fireRate))}${s.noJam ? ", NEVER JAMS" : ""}` : `LOAD TIME ${seconds(s.windowTime ?? WINDOW_TIME)}`;
    },
    card: (e, x) => `CUTS LOAD TIME TO ${seconds(c(e, x).windowTime ?? WINDOW_TIME)}`,
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
        `IT STARTS ${rateText(imul(s.start))}; EACH SHOT WITHIN ${seconds(s.gap!)} OF THE LAST TAKES ${percent(s.step!)} OFF THE RELOAD.`,
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
      return [`EACH SHOT ALSO SPLASHES ${plural(s.splash!, "MORE TARGET")} FOR ${percent(s.share!)} OF ITS DAMAGE.`, `ITS SHOTS TAKE ${times(s.flightMul!)} AS LONG TO LAND.`];
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
        ...(x.stars >= 3 ? [`EACH PAYLOAD IT RIPS ADDS ${damage(x.k)} TO THIS TURRET'S NEXT SHOT.`] : []),
        "A HIT ON A POWDER KEG DISARMS IT.",
      ];
    },
    perkAt: (e, x) => (x.stars >= 3 ? 1 : 0),
    gist: (e, x) => `RIPS ${plural(c(e, x).rip!, "PAYLOAD")} WITHIN ${plural(c(e, x).reach!, "TILE")}`,
    card: () => "SHOTS RIP ENEMY PAYLOADS",
  },
  tesla: {
    // Battle.impact: arcs to the nearest targets of the struck one (secondary impact at share, and a stall)
    text: (e, x) => {
      const s = c(e, x);
      return [
        `EACH SHOT ARCS TO THE ${s.arcs === 1 ? "NEAREST ENEMY MACHINE AND STALLS IT" : `${s.arcs} NEAREST ENEMY MACHINES AND STALLS THEM`} FOR ${seconds(s.stall!)}.`,
        `EACH ARC DEALS ${percent(s.share!)} OF THE SHOT'S DAMAGE.`,
      ];
    },
    gist: (e, x) => `ARCS TO ${plural(c(e, x).arcs!, "MACHINE")} AND STALLS ${c(e, x).arcs === 1 ? "IT" : "THEM"} FOR ${seconds(c(e, x).stall!)}`,
    card: () => "SHOTS ARC AND STALL MACHINES",
  },
  capacitor: {
    // Battle.chambers: charge while the chamber is empty (up to maxSeconds), spent on the next shot
    text: (e, x) => [
      `CHARGES ITS NEXT SHOT ${damage(c(e, x).perSecond!)} FOR EACH SECOND ITS CHAMBER SITS EMPTY.`,
      `IT CHARGES FOR UP TO ${seconds(c(e, x).maxSeconds!)}.`,
    ],
    gist: (e, x) => `${damage(c(e, x).perSecond!)} FOR EACH EMPTY SECOND`,
    card: () => "CHARGES UP WHILE EMPTY",
  },
  compound: {
    text: (e, x) => [
      `PACKS 2 LOADS INTO ONE SHELL THAT DEALS ${percent(c(e, x).mult!)} OF THEIR DAMAGE.`,
      "BOTH LOADS' BURN, POISON AND SHOCK RIDE ALONG.",
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
    text: (e) => [`THE TURRET FIRES ${m(e).perShot} LOADS EACH SHOT${m(e).window ? `, AND ITS CHAMBER HOLDS ${plural(m(e).window!, "MORE LOAD")}` : ""}.`],
    gist: (e, x) => (x.stars >= 3 ? `FIRES ${m(e).perShot} LOADS EACH SHOT` : m(e).window ? `HOLDS ${plural(m(e).window!, "MORE LOAD")}` : `FIRES ${m(e).perShot} LOADS`),
    card: (e) => `FIRES ${m(e).perShot} LOADS A SHOT`,
  },
  calibrate: {
    text: (e) => [`THE TURRET FIRES ${rateText(imul(m(e).fireRate))}.`],
    gist: (e) => `FIRES ${rateText(imul(m(e).fireRate))}`,
  },
  flak: {
    // Battle.flight: one intercept roll per incoming harassing shot, at the side's best screen; a downed shot is gone
    text: (e) => [
      `SHOOTS DOWN ${percent(m(e).intercept!)} OF THE ENEMY'S HARASSMENT SHOTS BEFORE THEY LAND.`,
      "IT GUARDS YOUR WHOLE SHIP; ONLY YOUR BEST FLAK SCREEN COUNTS.",
      "HARASSMENT SHOTS ARE SHOCK, STATIC, ARC, GRAPNEL AND LANCE SHOTS, AND SABOT, FROST, CHAIN AND LIMPET ROUNDS.",
    ],
    gist: (e) => `SHOOTS DOWN ${percent(m(e).intercept!)}`,
    card: (e) => `SHOOTS DOWN ${percent(m(e).intercept!)} OF HARASSMENT`,
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
      return [
        `THE CHAMBER HOLDS ${plural(md.window!, "MORE LOAD")}, AND THE LOAD TIME IS ${seconds(md.windowTime!)} LONGER.`,
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
      return md.store ? `STORES ${plural(md.store, "LOAD")} WHILE IT FIRES${md.noJam ? ", NEVER JAMS" : ""}`
        : `HOLDS ${plural(md.window!, "MORE LOAD")}, LOAD TIME ${seconds(md.windowTime!)} LONGER`;
    },
    card: (e) => `CHAMBER HOLDS ${plural(m(e).window!, "MORE LOAD")}`,
  },
  mantlet: {
    // Battle.acceptHarassment: the turret ignores its immune causes (0.6.2 FB-B's words); ★2 FULL PLATE adds FROST and
    // SABOT and shields the last tile of each belt into the turret, ★3 BULWARK SKIRT the last 3, and the rigs working them
    text: (e) => [
      `THE TURRET IGNORES ${immunities(e)} STALLS.`,
      ...(m(e).intakeGuard ? [shielded(m(e).intakeGuard!)] : []),
    ],
    perkAt: (e) => (m(e).intakeGuard ? 1 : 0),
    gist: (e, x) => mantletGist(e, x.stars),
    card: () => "IGNORES SHOCK AND CHAIN STALLS",
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
      `ON METRONOME, PENDULUM SLUGS FROM THIS TURRET PEAK ${seconds(-PEAK_SHIFT.escapement)} EARLIER, AFTER ${peakTiles(PENDULUM.peak + PEAK_SHIFT.escapement)} TILES.`,
    ],
    gist: (e) => `FIRES ${rateText(imul(m(e).fireRate))}`,
  },
  longcase: {
    text: (e) => [
      `SHOTS FROM PAYLOADS THAT RODE ${seconds(m(e).longRideMin!)} OR MORE DEAL ${moreDamage(m(e).longRideFlat!)}.`,
      `PENDULUM SLUGS DON'T GET IT; ON METRONOME THEY PEAK ${seconds(PEAK_SHIFT.longcase)} LATER ON THIS TURRET, AFTER ${peakTiles(PENDULUM.peak + PEAK_SHIFT.longcase)} TILES.`,
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
    text: (e) => [`ROLLS ${n1(g(e).plate!)} PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.`, S.plating],
    gist: (e) => `ROLLS ${n1(g(e).plate!)} PLATING FOR EACH PAYLOAD`,
    card: () => "PLATES YOUR HULL AS SLUGS PASS",
  },
  twingauge: {
    // Battle.applyHit: + flat, or + matched on a matched belt (E6: deck.ts matchedRoutes, read once in Battle.makeSide)
    text: (e) => [`ADDS ${damage(g(e).gauge!.flat)} TO EACH PAYLOAD IT HITS, OR ${damage(g(e).gauge!.matched)} ON A MATCHED BELT.`, S.matched],
    gist: (e) => `ADDS ${damage(g(e).gauge!.flat)}, OR ${n1(g(e).gauge!.matched)} ON A MATCHED BELT`,
    card: () => "MORE DAMAGE ON A MATCHED BELT",
  },
  pincer: {
    // Battle.applyHit (E5): + flat, and + each for every other working rig hitting the tile (online, not stalled, frozen
    // or wrecked), up to max. 0.8.0 I1 (VERIFIED-P1 H5): the text names no cap: a belt tile has 4 sides and at least two
    // are belt, factory or turret, so at most 2 other rigs can ever hit a PINCER's tile and max (3) never binds; the code
    // keeps it
    text: (e) => {
      const p = g(e).pincer!;
      return [
        `ADDS ${damage(p.flat)} TO EACH PAYLOAD IT HITS, AND ${n1(p.each)} MORE FOR EACH OTHER RIG HITTING THAT TILE.`,
        "STALLED, FROZEN AND WRECKED RIGS DON'T COUNT.",
      ];
    },
    gist: (e) => `ADDS ${damage(g(e).pincer!.flat)}, AND ${n1(g(e).pincer!.each)} MORE FOR EACH OTHER RIG ON ITS TILE`,
    card: () => "MORE DAMAGE WITH RIGS ON ITS TILE",
  },
  braceframe: {
    // Battle.braceCut: an enemy stall, freeze or chain slow on a tile it hits, or on the brace itself, lasts x mul while
    // it works, x plated while the hull holds plating (E1)
    text: (e) => [
      `ENEMY STALLS, FREEZES AND CHAIN SLOWS ON THE BELT TILES IT HITS, AND ON ITSELF, LAST ${percent(1 - g(e).brace!.mul)} SHORTER.`,
      `WHILE YOUR HULL HOLDS PLATING THEY LAST ${percent(1 - g(e).brace!.plated)} SHORTER.`,
    ],
    gist: (e) => `${percent(1 - g(e).brace!.mul)} SHORTER, ${percent(1 - g(e).brace!.plated)} WHILE PLATED`,
    card: () => "SHORTER STALLS ON ITS TILES",
  },
  twinlatch: {
    // E4 (Battle.latchTick): it holds only while both arrows hit belts, each payload at most `hold` seconds. Into one
    // turret the longer remaining trip goes first and the other after the difference, so both arrive together (oracle
    // a0e94bc69949561f); into two turrets both go at once. Battle.applyHit adds flat to every payload it hits
    text: (e) => [
      // T6: DESIGN 3.3's "AT THE TILE IT HITS" moves to the second sentence, so the opening fits the phone band whole
      "HOLDS EACH PAYLOAD UNTIL ITS OTHER BELT BRINGS ONE, THEN LETS THEM GO SO THEY REACH THE GUN TOGETHER.",
      `IT HOLDS A PAYLOAD AT THE TILE IT HITS, AT MOST ${seconds(g(e).latch!.hold)}, AND ONLY WHEN BOTH ITS ARROWS HIT BELTS.`,
      `EACH PAYLOAD IT LETS GO GAINS ${damage(g(e).latch!.flat)}.`,
      "ON BELTS INTO TWO GUNS, IT LETS BOTH GO AT ONCE.",
    ],
    // T6: DESIGN 3.3's "EACH PAYLOAD IT LETS GO GAINS 2.2 DAMAGE" takes two phone lines; WHETSTONE's clause takes one
    gist: (e) => `ADDS ${damage(g(e).latch!.flat)}`,
    card: () => "LETS TWO BELTS GO TOGETHER",
  },
  stoker: {
    // E3: its arrows work factories (deck.ts stokeHits), never belts. Battle.stokedPace: the factory's timers x (1 + its
    // stokes), the stamping capped so it never outruns the turret its belt feeds (oracle a0e94bc69949561f)
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
    text: (e) => [
      `EACH PAYLOAD IT HITS TAKES 10 PLATING FROM YOUR HULL AND GAINS ${damage(g(e).breaker!.flat)}.`, // NUM-1: battle.ts spends 10
      `WITH NO PLATING TO TAKE, IT ADDS ${damage(g(e).breaker!.floor)}.`,
    ],
    gist: (e) => `${damage(g(e).breaker!.flat)} FOR 10 PLATING, ${n1(g(e).breaker!.floor)} WITHOUT`, // NUM-1: 10 plating
    card: () => "TURNS PLATING INTO DAMAGE", // DESIGN 3.3's "TURNS YOUR PLATING INTO DAMAGE" takes three card lines
  },
  shieldwall: {
    // Battle.applyHit: addPlate(plate) first, then + plated.flat while the hull holds plated.min plating or more
    text: (e) => [
      `ROLLS ${n1(g(e).plate!)} PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.`,
      `WHILE YOUR HULL HOLDS ${g(e).plated!.min} PLATING OR MORE, EACH OF THOSE PAYLOADS ALSO GAINS ${damage(g(e).plated!.flat)}.`,
      S.plating,
    ],
    gist: (e) => `${n1(g(e).plate!)} PLATING A PAYLOAD, ${damage(g(e).plated!.flat)} AT ${g(e).plated!.min} PLATING`,
    card: () => "PLATES YOUR HULL, HITS HARDER", // DESIGN 3.3's "..., HITS HARDER PLATED" takes three card lines
  },
  twinmould: {
    // Battle.produce (twin): one slug onto each of `pour` belts with room, on the same tick (races/foundry.ts pourAll);
    // bb-0.8.3 (REQ-BFG-042 D3): ★3 THIRD SPRUE is the third slug of each pour; with more belts it takes them in turn
    text: (e) => {
      const fs = f(e), n = countWord(fs.pour ?? 0);
      return [
        `CASTS ${n} ${fs.base !== undefined ? "SLUGS" : "PLAIN SLUGS"} (${damage(slugBase(e))} EACH) AT ONCE, ONE ONTO EACH OF ${n} BELTS, ${every(secPer(fs.speed))}.`,
        `WITH MORE BELTS, EACH CAST TAKES THE NEXT ${n} IN TURN.`,
        "ON MATCHED BELTS INTO ONE TURRET, EACH CAST ARRIVES AS A PAIR.",
      ];
    },
    gist: (e) => ((f(e).pour ?? 0) > 2
      ? `${f(e).pour} SLUGS OF ${damage(slugBase(e))}, ${every(secPer(f(e).speed))}`
      : `${damage(slugBase(e))} EACH, ${every(secPer(f(e).speed))}`),
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
        `PRESSES ${n1(fs.plate!.amount)} PLATING ONTO YOUR HULL ${every(fs.plate!.every)}, AND STAMPS ${fs.base !== undefined ? "A SLUG" : "A PLAIN SLUG"} (${damage(slugBase(e))}) ${every(secPer(fs.speed))}.`,
        "IT NEEDS A BELT TO A TURRET TO WORK.",
        S.plating,
      ];
    },
    gist: (e) => `${n1(f(e).plate!.amount)} PLATING ${every(f(e).plate!.every)}, A SLUG ${every(secPer(f(e).speed))}`,
    card: (e) => `PLATES YOUR HULL ${every(f(e).plate!.every)}`,
  },
  anvil: {
    // Battle.fireCore (anvil): + anvilFlat + perPlate x the hull's plating at fire time, both x k (cores.ts CORE_ABSOLUTE)
    text: (e, x) => [`EACH SHOT DEALS ${moreDamage(c(e, x).anvilFlat!)}, AND ${n1(c(e, x).perPlate!)} MORE FOR EACH PLATING ON YOUR HULL.`, S.plating],
    gist: (e, x) => `${moreDamage(c(e, x).anvilFlat!)}, AND ${n1(c(e, x).perPlate!)} MORE FOR EACH PLATING`,
    card: () => "MORE DAMAGE THE MORE PLATING",
  },
  steambreech: {
    // cores.ts ROUTINES.steam: the cadence x steamPlated while the hull holds plating, else x steamBare (rates: no k)
    text: (e, x) => [`THE TURRET FIRES ${rateText(imul(c(e, x).steamPlated))} WHILE YOUR HULL HOLDS PLATING, AND ${rateText(imul(c(e, x).steamBare))} WITHOUT IT.`],
    gist: (e, x) => `${rateText(imul(c(e, x).steamPlated))} PLATED, ${percent(c(e, x).steamBare! / 100)} WITHOUT`,
    card: () => "FIRES FASTER WHILE PLATED",
  },
  twintrigger: {
    // Battle.fire / fireCore: a paired load (E2; a COMPOUND shell packing one) x (1 + pairBonus), before FINISHER RAM.
    // makeTurret: the load time + windowTime (negative), never under LOAD_FLOOR; a GATLING SPOOL or a COMPOUND BREECH never
    // reads it (gatlingClashText)
    text: (e) => [
      `PAIRED LOADS IN THIS TURRET DEAL ${percent(m(e).pairBonus!)} MORE DAMAGE.`,
      S.pair,
      `ITS LOAD TIME IS ${seconds(-m(e).windowTime!)} SHORTER, BUT NEVER UNDER ${seconds(LOAD_FLOOR)}.`,
      "ON A GATLING SPOOL OR A COMPOUND BREECH THE SHORTER LOAD TIME DOES NOTHING.",
    ],
    gist: (e) => `PAIRS DEAL ${percent(m(e).pairBonus!)} MORE, LOAD TIME ${seconds(-m(e).windowTime!)} SHORTER`,
    card: (e) => `PAIRS HIT ${percent(m(e).pairBonus!)} HARDER`,
  },
  spallcatcher: {
    // Battle.spallCharge: add x (the hull's part + twice plating's part) / every, up to max, from impacts, limpet blasts,
    // burn and poison (never the dark wind); Battle.fire / fireCore add it to this turret's next shot
    text: (e) => {
      const sp = m(e).spall!;
      return [
        `EVERY ${damage(sp.every)} YOUR SHIP TAKES ADDS ${damage(sp.add)} TO THIS TURRET'S NEXT SHOT, UP TO ${damage(sp.max)}.`,
        "DAMAGE YOUR PLATING SOAKS COUNTS TWICE; THE DARK WIND DOESN'T COUNT.",
      ];
    },
    gist: (e) => `${damage(m(e).spall!.add)} FOR EVERY ${m(e).spall!.every}, UP TO ${n1(m(e).spall!.max)}`, // DESIGN 3.3's words
    card: () => "HITS YOU TAKE CHARGE ITS SHOT", // DESIGN 3.3's "... ITS NEXT SHOT" takes three card lines
  },
  seamwelder: {
    // Battle.loaded (E2): the load that makes a pair rolls seam.pair, any other load seam.lone (addPlate); a FOUNDRY fusion
    // is a pair (Battle.fusionPair)
    text: (e) => [
      `EACH PAIR THIS TURRET TAKES ROLLS ${n1(m(e).seam!.pair)} PLATING ONTO YOUR HULL, AND ANY OTHER LOAD ROLLS ${n1(m(e).seam!.lone)}.`,
      S.pair,
      S.plating,
    ],
    gist: (e) => `${n1(m(e).seam!.pair)} PLATING A PAIR, ${n1(m(e).seam!.lone)} FOR ANY OTHER LOAD`,
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
    const t = e.turret!, one = secPer(ITEMS[e.id].turret!.speed); // NUM-2: 30 / speed
    return [
      `${an(CLASS_WORD[t.class] ?? t.class.toUpperCase())} TURRET THAT FIRES ${every(secPer(t.speed))} AND HOLDS ${plural(t.window, "LOAD")}.`,
      ...(secPer(t.speed) < one - 1e-9 ? [`IT FIRES ${faster(one / secPer(t.speed))} THAN AT 1 STAR.`] : []),
      t.intake === "inner" ? "IT TAKES A BELT ON ITS INNER COLUMN ONLY." : "IT TAKES A BELT ON EACH OF ITS TWO COLUMNS.",
      `IT HAS ${plural(gearSlotsOf(e.id, x.stars), "GEAR SLOT")} AND 1 CORE SOCKET.`,
      `ITS SHOTS LAND ${seconds(t.flight)} AFTER IT FIRES.`,
    ];
  },
  gist: (e, x) => `FIRES ${every(secPer(e.turret!.speed))}, ${plural(gearSlotsOf(e.id, x.stars), "GEAR SLOT")}`,
  card: (e) => `FIRES ${every(secPer(e.turret!.speed))}`, // the landscape card's two lines hold the rate; the panel the rest
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
  if (e.overclockCooldown) return `${name} DOUBLES THE NEXT RIG, THEN WAITS ${n2(e.overclockCooldown)} SEC`;
  if (e.keg) return `${name} +${damage(e.keg.flat)} AND ${e.keg.burn} BURN AFTER ${n2(e.keg.fuse)} SEC`;
  // 0.6.2rel3 (TUNE-M T2): LODESTONE's floor is the hit's flat (walkRoute); its stall bonus waits for the battle
  if (e.perStalled) return `${name} ${h.flat ? `+${damage(h.flat)}, ` : ""}+${damage(e.perStalled.each)} FOR EACH STALLED MACHINE, UP TO ${damage(e.perStalled.max)}`;
  if (e.toll) return `${name} BLOCKS ${e.toll} HARASSMENT HITS`;
  if (e.sift) return `${name} REMOVES ${e.sift === "all" ? "EVERY MARK" : "ONE MARK"}${h.flat ? `, +${damage(h.flat)} IF CLEAN` : ""}`;
  if (e.heal) return `${name} REPAIRS ${n1(e.heal)} HULL`; // SUS-A: the field is `heal` (compile-driven)
  if (e.heat) return `${name} +${damage(e.heat)} FOR EACH SECOND AFTER`;
  if (e.staticTime) return `${name} STALLS A TURRET ${n2(e.staticTime)} SEC ON BARE HULL`;
  if (e.poison) return `${name} +${e.poison} POISON`;
  if (e.fray) return `${name} +${e.fray} FRAY`;
  // 0.6.2 FB-B: its flat, plus perBurn for each Burn stack it spent (deck.ts walkRoute's quenched)
  if (e.quench) return `${name} +${damage(h.flat ?? 0)}${h.quenched ? ` (${h.quenched} BURN SPENT)` : ""}`;
  // 0.8.0 P1, wave 3's rigs, from the walk's values (deck.ts walkRoute: its flat is the damage it counts there)
  if (e.gauge) return `${name} +${damage(h.flat ?? 0)}${h.matched ? " ON A MATCHED BELT" : ""}`;
  if (e.pincer) return `${name} +${damage(h.flat ?? 0)}${h.others ? `, CROSSFIRE WITH ${plural(h.others, "RIG")}` : ""}`;
  if (e.latch) return `${name} +${damage(h.flat ?? 0)}, HOLDS UP TO ${n2(e.latch.hold)} SEC`;
  if (e.breaker) return `${name} +${damage(e.breaker.flat)} FOR 10 PLATING, ELSE +${damage(e.breaker.floor)}`; // NUM-1: 10 plating
  if (e.brace) return `${name} ENEMY STALLS ${percent(1 - e.brace.mul)} SHORTER (${percent(1 - e.brace.plated)} SHORTER PLATED)`;
  if (e.plate) return `${name} +${n1(e.plate)} PLATING${e.plated ? `, +${damage(e.plated.flat)} AT ${e.plated.min} PLATING` : ""}`;
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
  if (belt !== "slag") return 0;
  let extra = 0;
  for (const row of rows) for (const h of row.hits) {
    if (h.split) extra *= h.split.mult;
    const p = effectAt(h.def, h.stars).gate?.pulse;
    if (p?.flat) extra += p.flat;
  }
  return extra;
}
