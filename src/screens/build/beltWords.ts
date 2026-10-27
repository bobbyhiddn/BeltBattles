// POLISH-2 (REQ-BFG-085 Q1, REQ-BFG-098 Q2; POLISH-1's follow-up F-b): WHAT A BELT'S READOUT COUNTS OF THE WORDS ON IT, AND WHAT IT SAYS IT LEAVES OUT.
//
// The belt panel's foot (DMG, BURN, SPD, TIME, SHOCK, COPIES) and its header strip come from the build view's walk (sim/deck.ts walkRoute, { gates: true }), which carries no
// enchantment: a FIERY IRON WALL ★3 read `BURN 0` (ROWS-1 run 3, question 2). In a fight the sim applies a word on the hit (battle.ts applyHit -> enchantFx.ts rigHitFx), when a
// factory makes a slug (slugMadeFx) and when a turret fires (shotFx). This module is the display layer's read of the same functions, for the parts of a word that are a FIXED
// AMOUNT per hit at build time; the sim is not touched (the numbers come from enchant.ts ENCHANT_NUM through the sim's own functions, so a bench change moves the readout too).
//
// THE TABLE (every word x kind; WORD_TABLE below holds it as data, the REPORT prints it):
//   FIERY    rig / factory / turret   COUNTED   +ENCHANT_NUM.burn x stars BURN on every hit / slug made / shot (rigHitFx, slugMadeFx, shotFx)
//   GROWING  rig / factory / turret   COUNTED   +growingStep x grow x stars DMG on every hit / slug / shot; `grow` is the piece's own counter, fixed from one dusk fight to the next
//   RISING   rig / factory / turret   NOT       the nth slug the rig has hit, the factory has made, the turret has fired: it climbs in the fight (the count starts over each fight)
//   ECHOING  rig / factory / turret   NOT       every fifth slug a rig hits (its stats twice), every fifth work a factory does (one more slug), every fifth shot: a count in the fight
//   MASSIVE  turret                   NOT       scales the shot's DMG (a share, not an amount) and halves the rate; SWIFT (factory) the same the other way
//   SWIFT    factory                  NOT       (the readout is per slug: it could show neither the rate nor the share without copying the walk's payload math)
//   WIDE     rig                      IN THE WALK  its added arrow is a hit like any other (deck.ts arrowsOf -> rigHits): the walk already counts what it does
//   WIDE     factory / turret         no slug     a belt slot / a gear slot: nothing on a slug
//   BRACED   rig / factory / turret   no slug     STUNs it swallows: nothing on a slug
// The parts of the walk that are READERS (SCALE-2a's ten rigs: IRON WALL ... TROPHY CHAIN) count fight state (their hit carries `reads`; the walk adds nothing for it): not counted either.
// The ORDER inside a hit follows applyHit: the rig's word lands at :1916 (after its own burn, before its split), so GROWING's DMG is shared by a later SPLITTER the way the rig's own
// flat is (the sum so far scales by each split's mult). A converter on the belt (GATES-1: FUSER, SCATTER MILL, SMELTER) changes the slug by the engine's own rules (convert.ts
// convertWalk), which this layer does not copy: on such a belt the words' amounts are NOT COUNTED and the line says so. (A QUENCH TANK that spends BURN exists only with SCALE_RIGS
// off, where it is not a reader; with the shipped switches it is KINDLING, a reader, and spends nothing.)
//
// Pure, no DOM. Used by inspector.ts beltPanel (the numbers and the one line) and the tests.

import type { Payload } from "../../sim/battle";
import { ITEMS } from "../../sim/content";
import { convertCells } from "../../sim/convert";
import { itemByUid, journeyOf, turretSlots, type Build, type RouteWalk } from "../../sim/deck";
import { ENCHANT_DEFS, enchantRules, type EnchantId, type EnchantKind } from "../../sim/enchant";
import { makeEnchantState, rigHitFx, shotFx, slugMadeFx } from "../../sim/enchantFx";
import { gradeOf, starsOf } from "../../sim/stars";
import { wordOn, type WordOn } from "../../ui/enchantFaces";

/** How the readout treats a word on a kind of piece (WORD_TABLE). */
export type WordCount =
  | { counted: true; why: string }
  | { counted: false; why: string; leftOut: boolean }; // leftOut: the line names it (it changes the slug); false: it changes nothing on a slug (or the walk counts it already)

/** Every word x kind, decided: what the readout does with it and why (the sim's file in `why`). A kind a word cannot go on is null. */
export const WORD_TABLE: Readonly<Record<EnchantId, Readonly<Record<EnchantKind, WordCount | null>>>> = {
  fiery: {
    rig: { counted: true, why: "+burn x stars BURN on every hit (battle.ts applyHit -> enchantFx.ts rigHitFx)" },
    factory: { counted: true, why: "+burn x grade BURN on every slug made (enchantFx.ts slugMadeFx)" },
    turret: { counted: true, why: "+burn x stars BURN on every shot (enchantFx.ts shotFx; battle.ts fire, fireCore)" },
  },
  growing: {
    rig: { counted: true, why: "+growingStep x grow x stars DMG on every hit; `grow` is the piece's own counter (rigHitFx)" },
    factory: { counted: true, why: "+growingStep x grow x grade DMG on every slug made (slugMadeFx)" },
    turret: { counted: true, why: "+growingStep x grow x stars DMG on every shot (shotFx)" },
  },
  rising: {
    rig: { counted: false, leftOut: true, why: "the nth slug the rig has hit gets +step x n x stars: it climbs in the fight (rigHitFx, rigRank)" },
    factory: { counted: false, leftOut: true, why: "the nth slug the factory makes: it climbs in the fight (slugMadeFx)" },
    turret: { counted: false, leftOut: true, why: "the nth shot the turret fires: it climbs in the fight (shotFx)" },
  },
  echoing: {
    rig: { counted: false, leftOut: true, why: "every fifth slug the rig hits gets its stats twice: a count in the fight (rigEchoes)" },
    factory: { counted: false, leftOut: true, why: "every fifth time it works it puts out one more slug: a count in the fight (slugMadeFx)" },
    turret: { counted: false, leftOut: true, why: "every fifth shot hits twice: a count in the fight (shotFx)" },
  },
  massive: {
    rig: null,
    factory: null,
    turret: { counted: false, leftOut: true, why: "scales the shot's DMG by a share (x3) and halves the rate: not a fixed amount (shotFx, enchantRate)" },
  },
  swift: {
    rig: null,
    factory: { counted: false, leftOut: true, why: "halves the slug's DMG share and doubles the rate: not a fixed amount (slugMadeFx scaleShare, enchantRate)" },
    turret: null,
  },
  wide: {
    rig: { counted: false, leftOut: false, why: "its added arrow is a hit like any other; the walk counts it already (deck.ts arrowsOf -> rigHits)" },
    factory: { counted: false, leftOut: false, why: "a belt slot: nothing on a slug (enchant.ts wideSlots)" },
    turret: { counted: false, leftOut: false, why: "a gear slot: nothing on a slug (deck.ts resolveSlots)" },
  },
  braced: {
    rig: { counted: false, leftOut: false, why: "the first STUNs on it do nothing: nothing on a slug (enchantFx.ts bracedSwallow)" },
    factory: { counted: false, leftOut: false, why: "the first STUNs on it do nothing: nothing on a slug (bracedSwallow)" },
    turret: { counted: false, leftOut: false, why: "the first STUNs on it do nothing: nothing on a slug (bracedSwallow)" },
  },
};

/** Why a thing is left out: it changes in the fight (a reader's amount, RISING's climb, ECHOING's count), it scales the DMG (SWIFT, MASSIVE), or a gate on the belt changes the slug. */
export type LeftWhy = "fight" | "scale" | "gate";

/** One thing the numbers leave out: its name as the line prints it, and why. */
export interface LeftOut {
  key: string;
  name: string;
  why: LeftWhy;
}

/** What a belt's words add to the walk's numbers, and what its numbers leave out, in the order the slug meets them (factory, hits, turret). */
export interface BeltWordFx {
  /** BURN the counted words add (a whole number). */
  burn: number;
  /** DMG (day 1's units, before the day's multiplier) the counted words add: a whole number added to the walk's `dmg`. */
  dmg: number;
  left: LeftOut[];
}

/** The sim's own per-hit amounts for one word on one kind of piece, from enchantFx.ts (a fresh state; FIERY and GROWING ignore the count): the BURN and DMG it adds. */
export function wordAmount(w: Pick<WordOn, "id" | "kind" | "stars" | "grow">): { burn: number; dmg: number } {
  const st = makeEnchantState({ ench: w.id, grow: w.grow }, w.stars);
  if (!st) return { burn: 0, dmg: 0 }; // the switch is off
  const p = { burn: 0, flat: 0, mult: 1 } as unknown as Payload; // the three keys these two words touch
  if (w.kind === "rig") rigHitFx(st, p, 1);
  else if (w.kind === "factory") slugMadeFx(st, p);
  else {
    const fx = shotFx(st, 0, 0); // dmg 0: the shot's DMG change is the whole result
    return { burn: fx.burn, dmg: fx.dmg };
  }
  return { burn: p.burn, dmg: p.flat };
}

/** Does a converter gate (GATES-1) stand on any belt of this belt's journey? Then the engine changes the slug in ways this layer does not copy. */
function gated(b: Build, index: number): boolean {
  const gates = convertCells(b);
  if (!gates.size) return false;
  return journeyOf(b, index).some((leg) => b.routes[leg.route]?.cells.some((k) => gates.has(k)));
}

/**
 * The words' share of belt `index`'s readout and the things it leaves out. `walk` is the build view's walk of this belt (walkRoute, { gates: true }); `turret` the slot of
 * the turret it feeds (RouteInfo.turret; -1: it feeds none). A belt with no word and no reader on it returns { burn: 0, dmg: 0, left: [] }.
 */
export function beltWordFx(b: Build, index: number, walk: RouteWalk, turret: number): BeltWordFx {
  const left: LeftOut[] = [], seen = new Set<string>();
  const leave = (key: string, name: string, why: LeftWhy): void => {
    if (!seen.has(key)) {
      seen.add(key);
      left.push({ key, name, why });
    }
  };
  const live = enchantRules();
  const gate = live && gated(b, index);
  let burn = 0, dmg = 0; // dmg: continuous until the end (a SPLITTER's share of a word's DMG may be a half)
  let late = 0; // a turret word's DMG lands on the shot after the slug's DMG is made: no split shares it
  /** One piece's word: count its amount, or name it. */
  const take = (w: WordOn | undefined, share: boolean): void => {
    if (!w) return;
    const rule = WORD_TABLE[w.id][w.kind];
    if (!rule) return;
    if (!rule.counted) {
      if (rule.leftOut) leave(`word:${w.id}`, ENCHANT_DEFS[w.id].name, w.id === "rising" || w.id === "echoing" ? "fight" : "scale");
      return;
    }
    if (gate) {
      leave(`word:${w.id}`, ENCHANT_DEFS[w.id].name, "gate");
      return;
    }
    const a = wordAmount(w);
    burn += a.burn;
    if (share) dmg += a.dmg;
    else late += a.dmg;
  };
  // the factory: its word is on every slug it makes, before the first tile
  const route = b.routes[index], f = route ? itemByUid(b, route.factory) : undefined;
  if (live && f && ITEMS[f.def]) take(wordOn(f, ITEMS[f.def], gradeOf(b, f)), true);
  // the hits, tile by tile in the walk's order: a rig's word lands on each of its arrows' hits, then the hit's own split shares the DMG so far (applyHit: rigHitFx, then e.split)
  for (const row of walk.timeline) {
    for (const h of row.hits) {
      if (h.reads) leave(`reader:${h.def}`, ITEMS[h.def]?.name ?? h.def.toUpperCase(), "fight");
      if (live) {
        const p = itemByUid(b, h.uid);
        if (p && ITEMS[p.def]) take(wordOn(p, ITEMS[p.def], h.stars), true);
      }
      if (h.split) dmg *= h.split.mult;
    }
  }
  // the turret: its word is on every shot it fires
  const slot = turret >= 0 ? turretSlots(b)[turret] : undefined, t = slot?.turret;
  if (live && t && ITEMS[t.def]) take(wordOn(t, ITEMS[t.def], starsOf(t)), false);
  return { burn, dmg: Math.round(dmg) + late, left };
}

// ---------------------------------------------------------------------------------------------------------------- the one line

/** The lead of the line. */
export const LEFT_LEAD = "NOT COUNTED:";

/** A reason as the line words it for `n` things (a verb that agrees). POLISH-2 R1 (PQ-05's one words-only fix round: 4 of 6 readers were FULL, the two misses doubted that the bracket after the last name, `RISING (CHANGE IN THE FIGHT)`,
 *  holds for every name before it): with two or more names the reason says it is for each of them (`BOTH CHANGE ...`, `ALL CHANGE ...`). One name reads as before. */
export function whyText(why: LeftWhy, n: number): string {
  const each = n === 2 ? "BOTH" : "ALL";
  if (why === "fight") return n === 1 ? "CHANGES IN THE FIGHT" : `${each} CHANGE IN THE FIGHT`;
  if (why === "scale") return n === 1 ? "SCALES THE DMG" : `${each} SCALE THE DMG`;
  return n === 1 ? "A GATE CHANGES IT" : "A GATE CHANGES THEM";
}

/**
 * The one line under the readout, as candidates from the fullest to the shortest, for the layout (Block.fit) to pick the first that fits the panel's text width in ONE line:
 *   NOT COUNTED: IRON WALL, RISING (BOTH CHANGE IN THE FIGHT).   the names, each group of one reason with its reason said once (for each name: whyText)
 *   NOT COUNTED: IRON WALL, RISING.                          the names
 *   NOT COUNTED: IRON WALL +1 MORE.                          the first, and how many more
 *   NOT COUNTED: 2 THINGS.                                   a count (the narrowest column)
 * Empty when nothing is left out.
 */
export function leftOutCandidates(left: readonly LeftOut[]): string[] {
  if (!left.length) return [];
  const names = left.map((l) => l.name);
  const groups: { why: LeftWhy; names: string[] }[] = [];
  for (const l of left) {
    const g = groups.find((q) => q.why === l.why);
    if (g) g.names.push(l.name);
    else groups.push({ why: l.why, names: [l.name] });
  }
  const out = [
    `${LEFT_LEAD} ${groups.map((g) => `${g.names.join(", ")} (${whyText(g.why, g.names.length)})`).join("; ")}.`,
    `${LEFT_LEAD} ${names.join(", ")}.`,
    ...(left.length > 1 ? [`${LEFT_LEAD} ${names[0]} +${left.length - 1} MORE.`] : []),
    `${LEFT_LEAD} ${left.length} ${left.length === 1 ? "THING" : "THINGS"}.`,
  ];
  return [...new Set(out)];
}
