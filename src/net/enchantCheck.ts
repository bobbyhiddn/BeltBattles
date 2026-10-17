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
//        part) was bought at the ENCHANTER for ENCHANTER_PRICE, so it joins buildCost (validate.ts) and the day's budget covers it.
//  E6.5  GROWING's counter `grow` is at most day - 1 (the dusk fights fought before this snapshot) and sits only on a piece that
//        holds GROWING (the strict decoder refuses it elsewhere; this is the same rule for a caller that skipped the decoder).
//
// THE OFFERS ARE COUNTED (E6.3, the part past the brief's set test): the set test alone would let a deck hold three FIERY when the seed
// offered FIERY once. Every way a word reaches the deck is a SLOT that gives at most one word to one piece: each of the ENCHANTER's two
// offers on each ENCHANTER day (bought once), the run's two warlord picks (one word of any pick day from day 5, and from day 8), and
// LAST CHANCE's part (its seeded word, on that very part, WIDE on a rig on its seeded side). The held words must fit the slots, one
// piece to one slot (a bipartite match, so a word a merge, a sale or a replace lost leaves its slot unused and costs nothing). The
// day a pick fell on is not known to the server, so a pick's slot takes the words of every pick day it could have fallen on.

import { ITEMS } from "../sim/content";
import type { Build } from "../sim/deck";
import { ENCHANT_DEFS, enchantRules, isEnchantId, type EnchantId } from "../sim/enchant";
import {
  ENCHANTER_PRICE, WARLORD_PICK_FROM, enchanterWords, freeEnchantsByDay, lastChanceWord, maxEnchantsByDay, possibleWords, warlordPickWords,
} from "../sim/enchantSources";
import type { TakenLastChance } from "../sim/lastChance";

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

/** E6.4: the words the free sources can have given (the warlord picks the day allows, plus LAST CHANCE's part) for a deck on `day`. */
export const enchantFreeWords = (day: number, lc?: TakenLastChance): number => freeEnchantsByDay(day, lc?.boon === "part");

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
}

/** Every slot a deck on `day` could have filled, from the seed (the ENCHANTER's offers, the two warlord picks, LAST CHANCE's part). */
function slotsFor(seed: number, day: number, lc?: TakenLastChance): Slot[] {
  const slots: Slot[] = [];
  const pick1 = new Set<EnchantId>(), pick2 = new Set<EnchantId>();
  for (let d = 1; d <= day; d++) {
    for (const w of enchanterWords(seed, d)) slots.push({ words: new Set([w]) });
    if (d >= WARLORD_PICK_FROM[0]) for (const w of warlordPickWords(seed, d)) pick1.add(w);
    if (d >= WARLORD_PICK_FROM[1]) for (const w of warlordPickWords(seed, d)) pick2.add(w);
  }
  if (pick1.size) slots.push({ words: pick1 });
  if (pick2.size) slots.push({ words: pick2 });
  if (lc?.boon === "part" && lc.id !== undefined) {
    const w = lastChanceWord(seed, lc.day, lc.id);
    if (w) slots.push({ words: new Set([w.ench]), def: lc.id, ...(w.enchDir !== undefined ? { dir: w.enchDir } : {}) });
  }
  return slots;
}

/** Can the piece have got its word from the slot? Its word is one the slot gives; LAST CHANCE's slot is that part, and its seeded side. */
const fits = (p: Held, s: Slot): boolean =>
  isEnchantId(p.ench) && s.words.has(p.ench) && (s.def === undefined || p.def === s.def) && (s.dir === undefined || p.enchDir === s.dir);

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
    }
  }
  const held = all.filter((p) => p.ench !== undefined);
  if (!held.length) return out;
  // E6.2: the count
  const lc = ctx.lastChance, tookPart = lc?.boon === "part";
  const most = maxEnchantsByDay(day, tookPart);
  if (held.length > most) out.push(`enchant: ${held.length} enchanted part${held.length === 1 ? "" : "s"}, but day ${day} allows at most ${most}${tookPart ? " with LAST CHANCE's part" : ""}`);
  // E6.3: each held word was on offer (needs the seed), then the offers are used once each
  if (ctx.seed === undefined) return out;
  const part = tookPart && lc!.id !== undefined ? { day: lc!.day, part: lc!.id } : null;
  const offered = possibleWords(ctx.seed, day, part);
  const never = held.filter((p) => !isEnchantId(p.ench) || !offered.has(p.ench));
  for (const p of never) out.push(`enchant: uid ${p.uid} ${nameOf(p)} holds ${wordOf(p.ench!)}, which this run's seed did not offer by day ${day}`);
  if (never.length) return out;
  for (const p of unmatched(held, slotsFor(ctx.seed, day, lc))) {
    out.push(`enchant: uid ${p.uid} ${nameOf(p)} holds ${wordOf(p.ench!)}, but the seed's offers of it by day ${day} are used up by other parts`);
  }
  return out;
}
