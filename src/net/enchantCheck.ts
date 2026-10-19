// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E6): THE SERVER'S UPLOAD CHECK FOR ENCHANTMENTS, beyond the piece check validate.ts already
// holds (E6.1: each word is one of the eight, sits on a kind it can go on; enchDir only with WIDE on a rig, on a free side). Pure, with no
// run and no DOM: validate.ts calls it from validateBuild (both modes), and the client's own pre-upload check (game/online.ts) runs the
// same function, so a deck the server refuses is refused on the device first. It does nothing while the rules world has no ENCHANT
// (validate.ts inEnchantWorld has put the switch to the deck's own rules' answer), and nothing for a deck that holds no word and no
// counter, so with ENCHANT off every verdict and every cost is what it was.
//
//  E6.2  the count: the pieces holding a word (rigs, factories, turrets) are at most maxEnchantsByDay(day, LAST CHANCE took the part).
//  E6.3  each held word was on offer: it is in possibleWords(seed, day, lastChance), re-derived from the run seed as runeProblem and
//        lastChanceProblem re-derive theirs (only with the seed: a served ghost, a stand-in and a pool deck carry none). Then the
//        offers are also counted (below): a word is taken once per offer.
//  E6.4  the gold: every word past the free sources' bound (freeEnchantsByDay: the warlord picks the day allows and LAST CHANCE's
//        part, when that part can carry a word: ENCHANT-1b N4(c), gear arrives plain) was bought at the ENCHANTER for ENCHANTER_PRICE,
//        so it joins buildCost (validate.ts) and the day's budget covers it.
//  E6.5  GROWING's counter `grow` is at most day - 1 (the dusk fights fought before this snapshot) and sits only on a piece that
//        holds GROWING (the strict decoder refuses it elsewhere; this is the same rule for a caller that skipped the decoder).
//        ENCHANT-1b N4(d): with the seed it is at most the dusk fights since the first day GROWING could have reached the deck.
//
// THE OFFERS ARE COUNTED (E6.3, the part past the brief's set test): the set test alone would let a deck hold three FIERY when the seed
// offered FIERY once. Every way a word reaches the deck is a SLOT that gives at most one word to one piece: each of the ENCHANTER's two
// offers on each ENCHANTER day (bought once), the run's two warlord picks, and LAST CHANCE's part (its seeded word, on that very part,
// WIDE on a rig on its seeded side). The held words must fit the slots, one piece to one slot (a bipartite match, so a word a merge, a
// sale or a replace lost leaves its slot unused and costs nothing).
// ENCHANT-1b N4(a), THE TWO WARLORD PICKS: each takes ONE word of ONE pick day's pair (hashSeed(seed, "ench", day, "warlord")), and the two
// picks come from DIFFERENT days (pick 1 from day WARLORD_PICK_FROM[0] = 5 on, pick 2 from day WARLORD_PICK_FROM[1] = 8 on; one warlord
// fight a day). The server does not know which days they fell on, so the match is tried for each choice of the two days (the same pair
// of word sets is tried once): a deck passes when SOME choice of days fits every held word. So both words of one day's pair, or two copies
// of a word offered once, no longer pass; one word each from two different pick days does.

import { ITEMS } from "../sim/content";
import type { Build } from "../sim/deck";
import { ENCHANT_DEFS, enchantKindOf, enchantRules, isEnchantId, type EnchantId } from "../sim/enchant";
import {
  ENCHANTER_FIRST_DAY, ENCHANTER_PRICE, WARLORD_PICK_FROM, enchanterWords, freeEnchantsByDay, lastChanceWord, maxEnchantsByDay, possibleWords, warlordPickWords,
} from "../sim/enchantSources";
import type { TakenLastChance } from "../sim/lastChance";
import { npcDropPairs, npcDropWords, npcDropsByDay, npcPairKey } from "../sim/npcWords"; // ENCHANT-2 (REQ-BFG-085, T2): a warlord's drop keeps its rival's word

/** What the check reads beside the deck: the snapshot's run seed (absent on a served ghost, a stand-in and a pool deck) and its taken LAST CHANCE. */
export interface EnchantContext {
  seed?: number;
  lastChance?: TakenLastChance;
}

/** A piece that may hold a word: a deck rig or factory (Placed) or an installed turret (BuildTurret). */
interface Held {
  uid: number;
  def: string;
  ench?: string;
  enchDir?: number;
  grow?: number;
}

const pieces = (b: Build): Held[] => [...b.items, ...(b.turrets ?? [])];
const nameOf = (p: Held): string => (Object.prototype.hasOwnProperty.call(ITEMS, p.def) ? ITEMS[p.def].name : p.def);
const wordOf = (id: string): string => (isEnchantId(id) ? ENCHANT_DEFS[id].name : String(id).toUpperCase());

/** How many pieces of the deck hold a word (rigs, factories, turrets; gear and cores cannot). */
export const enchantCount = (b: Build): number => pieces(b).filter((p) => p.ench !== undefined).length;

/**
 * ENCHANT-1b N4(c): did the deck's LAST CHANCE part come with a word? A rig, factory or turret part does (enchantSources.ts lastChanceWord
 * draws one); GEAR arrives plain, so it adds no free word. A part boon with no id, or an id that is no item, is no part at all (lastChanceProblem
 * refuses it), so it adds none either.
 */
export function lcPartCarriesWord(lc: TakenLastChance | undefined): boolean {
  if (lc?.boon !== "part" || typeof lc.id !== "string") return false;
  return enchantKindOf(Object.prototype.hasOwnProperty.call(ITEMS, lc.id) ? ITEMS[lc.id] : undefined) !== undefined;
}

/**
 * ENCHANT-2 (REQ-BFG-085, T2): the words past ENCHANT-1's sources that cost nothing at the ENCHANTER: a warlord's drop keeps the word its rival's copy
 * held (one warlord fight a day, so one drop a day from day 5: npcWords.ts npcDropsByDay; "bound 1 until D1's receipts", PIECES-1 4.7.3).
 * enchantSources.ts freeEnchantsByDay and maxEnchantsByDay take it as their `extra`.
 */
export const enchantExtraWords = (day: number): number => npcDropsByDay(day);

/** E6.4: the words the free sources can have given (the warlord picks the day allows, plus LAST CHANCE's part when it can carry a word, plus ENCHANT-2's
 *  drops: enchantExtraWords) for a deck on `day`. */
export const enchantFreeWords = (day: number, lc?: TakenLastChance): number => freeEnchantsByDay(day, lcPartCarriesWord(lc), enchantExtraWords(day));

/** E6.4: how many held words were BOUGHT, at the least: every word past the `free` ones. 0 while the rules world has no ENCHANT. */
export const enchantPaidWords = (b: Build, free: number): number => (enchantRules() ? Math.max(0, enchantCount(b) - Math.max(0, free)) : 0);

/** E6.4: the gold the deck's bought words cost at the ENCHANTER (ENCHANTER_PRICE each); buildCost adds it, so the day's budget covers it. */
export const enchantGold = (b: Build, free: number): number => enchantPaidWords(b, free) * ENCHANTER_PRICE;

/**
 * E6.4: the budget refusal in words that name the enchantments: the cost the budget lines print is the total (items, mods, supplies and
 * the ENCHANTER's gold), so a deck over only by its words would show a total its itemisation does not reach. An error that is not the
 * budget's, and any deck that bought no word, is returned as it was.
 */
export function enchantBudgetNote(error: string, b: Build, free: number): string {
  const paid = enchantPaidWords(b, free);
  if (!paid || !error.startsWith("budget: build costs")) return error;
  return `${error} (that includes ${paid * ENCHANTER_PRICE} gold for ${paid} enchantment${paid > 1 ? "s" : ""} past the ${free} free: ${ENCHANTER_PRICE} each at the ENCHANTER)`;
}

/** One way a word can have reached a deck: the words it could have given, and (LAST CHANCE's part) the part it came on and the side it took. */
interface Slot {
  words: ReadonlySet<EnchantId>;
  def?: string;
  dir?: number;
  /** ENCHANT-2 (T2): a warlord drop's slot: the piece's (def, word[/side]) key (npcWords.ts npcPairKey) must be one some rival holds by the day. */
  pairs?: ReadonlySet<string>;
}

/** The slots that do not depend on a pick day: each ENCHANTER offer on each ENCHANTER day up to `day`, LAST CHANCE's part, and (ENCHANT-2, T2) one slot a
 *  warlord fight from day 5 on for the word its drop kept (ENCHANT-1b N4(a): the two warlord picks are chosen on top of these, pickSlots). */
function baseSlots(seed: number, day: number, lc?: TakenLastChance): Slot[] {
  const slots: Slot[] = [];
  for (let d = 1; d <= day; d++) for (const w of enchanterWords(seed, d)) slots.push({ words: new Set([w]) });
  if (lc?.boon === "part" && lc.id !== undefined) {
    const w = lastChanceWord(seed, lc.day, lc.id);
    if (w) slots.push({ words: new Set([w.ench]), def: lc.id, ...(w.enchDir !== undefined ? { dir: w.enchDir } : {}) });
  }
  const pairs = npcDropPairs(day), words = npcDropWords(day); // ENCHANT-2 (T2): a drop's word is one a rival holds on a day from 5 up to `day`, on the piece it sits on
  for (let i = 0; i < npcDropsByDay(day); i++) slots.push({ words, pairs });
  return slots;
}

/** ENCHANT-1b N4(a): the days a warlord pick could have fallen on, for pick 1 (day 5 on) and pick 2 (day 8 on), up to `day`. */
const pickDays = (which: 0 | 1, day: number): number[] => {
  const out: number[] = [];
  for (let d = WARLORD_PICK_FROM[which]; d <= day; d++) out.push(d);
  return out;
};

/** A warlord pick's slot for one pick day: ONE word of that day's pair. */
const pickSlot = (seed: number, d: number): Slot => ({ words: new Set(warlordPickWords(seed, d)) });

/** The slots with the two picks as the LOOSE bound has them (a necessary condition, the ENCHANT-1 rule): each pick takes a word of any day it could have fallen on. */
function looseSlots(seed: number, day: number, lc?: TakenLastChance): Slot[] {
  const slots = baseSlots(seed, day, lc);
  for (const which of [0, 1] as const) {
    const words = new Set<EnchantId>();
    for (const d of pickDays(which, day)) for (const w of warlordPickWords(seed, d)) words.add(w);
    if (words.size) slots.push({ words });
  }
  return slots;
}

/** Can the piece have got its word from the slot? Its word is one the slot gives; LAST CHANCE's slot is that part, and its seeded side. */
const fits = (p: Held, s: Slot): boolean =>
  isEnchantId(p.ench) && s.words.has(p.ench) && (s.def === undefined || p.def === s.def) && (s.dir === undefined || p.enchDir === s.dir)
  && (s.pairs === undefined || s.pairs.has(npcPairKey(p))); // ENCHANT-2 (T2)

/** The pieces left over when the held pieces are matched to the slots one to one as far as they go (Kuhn's augmenting paths). */
function unmatched(held: Held[], slots: Slot[]): Held[] {
  const owner: number[] = slots.map(() => -1);
  const place = (i: number, seen: boolean[]): boolean => {
    for (let j = 0; j < slots.length; j++) {
      if (seen[j] || !fits(held[i], slots[j])) continue;
      seen[j] = true;
      if (owner[j] < 0 || place(owner[j], seen)) {
        owner[j] = i;
        return true;
      }
    }
    return false;
  };
  return held.filter((_, i) => !place(i, slots.map(() => false)));
}

/**
 * ENCHANT-1b N4(a): the held pieces left over once they are matched to the ENCHANTER's offers, LAST CHANCE's part and the two warlord picks, [] when
 * they all fit. First the loose bound (each pick may take a word of any pick day: the ENCHANT-1 rule, a necessary condition, cheap); if even that
 * leaves some over, those are the answer. Then the exact rule: the two picks fall on DIFFERENT days, each takes ONE word of that day's pair, so every
 * choice of (pick 1's day, pick 2's day) is tried (the same two word sets are tried once) and the deck passes when one of them fits all. When none
 * does, the leftover of the closest choice (the fewest pieces over) is named.
 */
function unmatchedWords(held: Held[], seed: number, day: number, lc?: TakenLastChance): Held[] {
  const loose = unmatched(held, looseSlots(seed, day, lc));
  if (loose.length) return loose;
  const base = baseSlots(seed, day, lc);
  const d1s = pickDays(0, day), d2s = pickDays(1, day);
  if (!d1s.length) return unmatched(held, base); // before day 5 no pick exists
  const key = (d: number | undefined): string => (d === undefined ? "-" : [...warlordPickWords(seed, d)].sort().join("+"));
  const tried = new Set<string>();
  let best: Held[] | null = null;
  for (const d1 of d1s) {
    for (const d2 of d2s.length ? d2s : [undefined]) {
      if (d1 === d2) continue; // the two picks come from different days
      const k = `${key(d1)}|${key(d2)}`;
      if (tried.has(k)) continue;
      tried.add(k);
      const left = unmatched(held, [...base, pickSlot(seed, d1), ...(d2 === undefined ? [] : [pickSlot(seed, d2)])]);
      if (!left.length) return [];
      if (!best || left.length < best.length) best = left;
    }
  }
  return best ?? loose;
}

/**
 * ENCHANT-1b N4(d): the first day GROWING could have reached a deck on `day`, re-derived from the seed: the earliest of an ENCHANTER day whose offers hold
 * it (bought at that dawn, so that day's dusk fight is its first), a warlord pick day (day 5 on) whose pair holds it (taken before that day's dusk),
 * and the day after LAST CHANCE fired when its part comes with GROWING. undefined when the seed offered it by no source (E6.3 refuses the word).
 */
export function firstGrowingDay(seed: number, day: number, lc?: TakenLastChance): number | undefined {
  let first: number | undefined;
  const at = (d: number): void => { if (first === undefined || d < first) first = d; };
  for (let d = ENCHANTER_FIRST_DAY; d <= day; d += 2) if (enchanterWords(seed, d).includes("growing")) at(d);
  for (let d = WARLORD_PICK_FROM[0]; d <= day; d++) if (warlordPickWords(seed, d).includes("growing")) at(d);
  if (lc?.boon === "part" && lc.id !== undefined && lastChanceWord(seed, lc.day, lc.id)?.ench === "growing") at(lc.day + 1);
  return first;
}

/**
 * E6.2, E6.3, E6.5: why the deck's words and counters can't stand, as short lines (each starts `enchant:`), or [] when they can. The
 * piece check (E6.1) and the gold (E6.4, buildCost) are validate.ts's. `day` is the deck's own day; `ctx.lastChance` the snapshot's taken
 * LAST CHANCE; `ctx.seed` the run seed (without it the offers are not re-derived). Does nothing while the rules world has no ENCHANT.
 */
export function enchantProblems(b: Build, day: number, ctx: EnchantContext = {}): string[] {
  if (!enchantRules()) return [];
  const all = pieces(b);
  const out: string[] = [];
  // E6.5: GROWING's counter is at most day - 1 (the dusk fights fought before this snapshot) and sits only on a piece that holds GROWING
  for (const p of all) {
    if (p.grow === undefined) continue;
    if (p.ench !== "growing") out.push(`enchant: uid ${p.uid} ${nameOf(p)} has a grow counter but holds no GROWING`);
    else if (!Number.isInteger(p.grow) || p.grow < 0 || p.grow > day - 1) {
      out.push(`enchant: uid ${p.uid} ${nameOf(p)} has grow ${p.grow}, but only ${Math.max(0, day - 1)} dusk fight${day - 1 === 1 ? "" : "s"} came before day ${day}`);
    } else if (ctx.seed !== undefined) {
      // ENCHANT-1b N4(d): with the seed, the dusk fights since the first day GROWING could have reached the deck (a seed that offered it by no source: E6.3 below refuses the word)
      const first = firstGrowingDay(ctx.seed, day, ctx.lastChance);
      if (first !== undefined && p.grow > day - first) {
        out.push(`enchant: uid ${p.uid} ${nameOf(p)} has grow ${p.grow}, but this run's seed first offered GROWING on day ${first}, so only ${Math.max(0, day - first)} dusk fight${day - first === 1 ? "" : "s"} came after it by day ${day}`);
      }
    }
  }
  const held = all.filter((p) => p.ench !== undefined);
  if (!held.length) return out;
  // E6.2: the count (ENCHANT-1b N4(c): LAST CHANCE's part counts only when it can carry a word; gear arrives plain)
  const lc = ctx.lastChance, tookPart = lcPartCarriesWord(lc);
  const most = maxEnchantsByDay(day, tookPart, enchantExtraWords(day)); // ENCHANT-2 (T2): + the warlord drops
  if (held.length > most) out.push(`enchant: ${held.length} enchanted part${held.length === 1 ? "" : "s"}, but day ${day} allows at most ${most}${tookPart ? " with LAST CHANCE's part" : ""}`);
  // E6.3: each held word was on offer (needs the seed), then the offers are used once each
  if (ctx.seed === undefined) return out;
  const part = tookPart && lc!.id !== undefined ? { day: lc!.day, part: lc!.id } : null;
  const offered = possibleWords(ctx.seed, day, part);
  for (const w of npcDropWords(day)) offered.add(w); // ENCHANT-2 (T2): and the words some rival holds by `day` (a drop keeps its rival's word)
  const never = held.filter((p) => !isEnchantId(p.ench) || !offered.has(p.ench));
  for (const p of never) out.push(`enchant: uid ${p.uid} ${nameOf(p)} holds ${wordOf(p.ench!)}, which this run's seed did not offer by day ${day}`);
  if (never.length) return out;
  for (const p of unmatchedWords(held, ctx.seed, day, lc)) { // ENCHANT-1b N4(a): the two warlord picks take one word of one day's pair each, from different days
    out.push(`enchant: uid ${p.uid} ${nameOf(p)} holds ${wordOf(p.ench!)}, but the seed's offers of it by day ${day} are used up by other parts`);
  }
  return out;
}
