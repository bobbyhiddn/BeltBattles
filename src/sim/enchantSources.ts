// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E5, E6): WHERE THE WORDS COME FROM, pure and seeded (no run, no DOM): the client's caravan, the
// warlord pick and LAST CHANCE read it, and so does the server's upload check, which re-derives the same words from the run seed.
//
//  a. THE ENCHANTER, a 7th merchant: an extra wagon in the dawn caravan on days 3, 5, 7, 9 and every odd day after (a long run too),
//     never at the REFIT. Two DIFFERENT words a day from hashSeed(seed, "ench", day, "enchanter"), 4 G each; no sale, discount or
//     REROLL touches it. Buying is applying (game/enchanter.ts).
//  b. A WARLORD WIN: two picks at most per run, each a pick of 1 of 2 words from hashSeed(seed, "ench", day, "warlord"): the run's first
//     Hard-tier win on day 5 or later over a captain who is not the Iron Matriarch, and the win over the Iron Matriarch (the Hard slot
//     from day 8 until she is beaten). NO THANKS skips it, and the word is lost.
//  c. LAST CHANCE: its PART card arrives enchanted when it is a rig or a turret: a word from hashSeed(seed, "ench", day, "lastchance")
//     among those legal on that piece (WIDE on a rig: a seeded free side). Gear arrives plain.
//
// THE BOUNDS (E6.2, E6.4): a deck on day d holds at most maxEnchantsByDay(d, lastChanceTookPart) words; the ones the free sources
// (warlord picks, LAST CHANCE) can have given cost nothing, every other word was bought at ENCHANTER_PRICE.

import { Rng, hashSeed } from "../core/rng";
import { ITEMS } from "./content";
import { ENCHANT_IDS, enchantKindOf, enchantProblem, freeSides, type EnchantId } from "./enchant";

/** The ENCHANTER's price for each word (E5a): flat, no discount or sale applies. */
export const ENCHANTER_PRICE = 4;
/** Words on offer at the ENCHANTER each ENCHANTER day. */
export const ENCHANTER_OFFERS = 2;
/** The first ENCHANTER day: days 3, 5, 7, 9 and every odd day after. */
export const ENCHANTER_FIRST_DAY = 3;
/** The days the two warlord picks open from (E5b): pick 1 from day 5 (a Hard win over any captain but the Matriarch), pick 2 from day 8
 *  (the Iron Matriarch holds the Hard slot from rivals.ts MATRIARCH_DAY). */
export const WARLORD_PICK_FROM: readonly [number, number] = [5, 8];

/** Does the ENCHANTER ride in the caravan of `day` (days 3, 5, 7, 9 and every odd day after)? */
export const enchanterDay = (day: number): boolean => Number.isInteger(day) && day >= ENCHANTER_FIRST_DAY && day % 2 === 1;

/** How many ENCHANTER days there are up to and including `day`: 0 for days 1-2, 1 for 3-4, 2 for 5-6, 3 for 7-8, 4 for 9-10 ... */
export const enchanterDaysUpTo = (day: number): number => (Number.isInteger(day) && day >= ENCHANTER_FIRST_DAY ? Math.floor((day - 1) / 2) : 0);

/** Two DIFFERENT words from the stream hashSeed(seed, "ench", day, stream): the first draw takes one of the eight, the second one of
 *  the seven left. Pure: the same (seed, day, stream) is the same pair everywhere. */
function twoWords(seed: number, day: number, stream: "enchanter" | "warlord"): [EnchantId, EnchantId] {
  const rng = new Rng(hashSeed(seed, "ench", day, stream));
  const pool: EnchantId[] = [...ENCHANT_IDS];
  const a = pool.splice(rng.int(pool.length), 1)[0];
  const b = pool.splice(rng.int(pool.length), 1)[0];
  return [a, b];
}

/** The ENCHANTER's two words on `day` (E5a), or [] on a day it does not ride. */
export function enchanterWords(seed: number, day: number): EnchantId[] {
  return enchanterDay(day) ? twoWords(seed, day, "enchanter") : [];
}

/** The two words of a warlord pick won on `day` (E5b): the player takes one, or none (NO THANKS). */
export function warlordPickWords(seed: number, day: number): [EnchantId, EnchantId] {
  return twoWords(seed, day, "warlord");
}

/** How many warlord picks a deck on `day` can have had: none before day 5, one from day 5, two from day 8. */
export const warlordPicksByDay = (day: number): number => (day >= WARLORD_PICK_FROM[1] ? 2 : day >= WARLORD_PICK_FROM[0] ? 1 : 0);

/**
 * LAST CHANCE's PART card word (E5c): the word its part arrives with, or null (gear and anything that cannot take a word arrives
 * plain; the card catalogue is rigs, turrets and gear). One draw from hashSeed(seed, "ench", day, "lastchance") among the words legal on
 * that piece (enchant.ts enchantProblem: MASSIVE only on a turret, SWIFT only on a factory, ENCHANT-1b N1), and for WIDE on a rig a second draw from the same stream
 * picks one of its free sides. `day` is the day LAST CHANCE fired on (LastChance.day).
 */
export function lastChanceWord(seed: number, day: number, def: string): { ench: EnchantId; enchDir?: number } | null {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d) return null;
  const legal = ENCHANT_IDS.filter((id) => enchantProblem(d, id) === null);
  if (!legal.length) return null;
  const rng = new Rng(hashSeed(seed, "ench", day, "lastchance"));
  const ench = legal[rng.int(legal.length)];
  if (ench === "wide" && enchantKindOf(d) === "rig") {
    const free = freeSides(d);
    return { ench, enchDir: free[rng.int(free.length)] };
  }
  return { ench };
}

/** Words a deck can hold that no merchant sold: the warlord picks the day allows, plus LAST CHANCE's part when it took the part. */
export const freeEnchantsByDay = (day: number, lastChanceTookPart: boolean): number => warlordPicksByDay(day) + (lastChanceTookPart ? 1 : 0);

/** E6.2: the most words a deck on `day` can hold: 2 for each ENCHANTER day up to `day`, plus the free ones (freeEnchantsByDay). */
export const maxEnchantsByDay = (day: number, lastChanceTookPart: boolean): number =>
  ENCHANTER_OFFERS * enchanterDaysUpTo(day) + freeEnchantsByDay(day, lastChanceTookPart);

/**
 * E6.3: every word a deck on `day` could have been given, re-derived from the run seed: the ENCHANTER's offers on its days up to `day`,
 * the warlord picks' words on days 5 through `day`, and LAST CHANCE's word when it took the part (`lastChance`: the snapshot's own
 * record, day and the part's id). Looser than the run only in WHICH day a pick fell on (the server cannot know it).
 */
export function possibleWords(seed: number, day: number, lastChance?: { day: number; part?: string } | null): Set<EnchantId> {
  const out = new Set<EnchantId>();
  for (let d = ENCHANTER_FIRST_DAY; d <= day; d += 2) for (const w of enchanterWords(seed, d)) out.add(w);
  for (let d = WARLORD_PICK_FROM[0]; d <= day; d++) for (const w of warlordPickWords(seed, d)) out.add(w);
  if (lastChance?.part) {
    const w = lastChanceWord(seed, lastChance.day, lastChance.part);
    if (w) out.add(w.ench);
  }
  return out;
}
