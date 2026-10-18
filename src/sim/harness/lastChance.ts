// LC-1 (REQ-BFG-073): the bots' LAST CHANCE pick. Each card is rated with the bots' own deck rating (deckRating.ts rateDeck,
// as the par player reads it: player.ts rateOn, the day's fight length and the day's sustain value), and the bot takes the
// card that rates highest; no RNG beyond the cards' own seeded placement (botRunePick in runes.ts is the precedent: the
// pick reads the board, never a stream). Deterministic for (offer, hero, board, day, wins).
//  - HULL: the board with +offer.hull (rateDeck's defense is the hull: h.hull + hullBonus).
//  - PART: the board with the part where the bots would place it (player.ts placeFreePart: the par player's own judgment
//    of an offer at price 0), or in cargo, unchanged, if it rates no gain anywhere.
//  - RUNE: rateDeck reads no rune (its walk prices the deck's pieces only), so the rune is priced in the rating's own
//    currency (value = offense x defense: in a duel of steady damage the larger product wins, and the ratio of two
//    products is the ratio of their times to kill): the board's value x the rune's DUEL FACTOR, measured on the board
//    itself, a mirror fight with and without the rune (MIRROR_SEEDS seeds; each side's hull lost to the other, the wind
//    taken out): factor = (foe's loss / own loss with the rune) / (the same without). A HULL or BELT rune is the board
//    plus its grant; a gold rune is the gold it pays by day 10 spent on ARMOR PACKs (the least a gold can buy).
// Nothing in the game imports this file; the bench (tools/lastChanceBench.ts) and the bots' modeled runs do.

import { hashSeed, Rng } from "../../core/rng";
import { simulate } from "../battle";
import { ITEMS, PACK_ITEM, RUN_DAYS, type HeroId } from "../content";
import { cloneBuild, type Build } from "../deck";
import { RUNES, runeGrants } from "../runes";
import type { Boon, LastChanceOffer } from "../lastChance";
import { newRun, type Run } from "../../game/run";
import { partSaleHull, placeFreePart, rateOn } from "./player";
import { scaleRules } from "../scale"; // SCALE-2e E1 (REQ-BFG-098): the mirror's hearts lost, SCALE_RIGS on only
import { carryCount, runCounts } from "../scaleRating";

/** The seeds of the rune's mirror fights (a pair each: with and without the rune). */
export const MIRROR_SEEDS = 3;
/** The duel factor's bounds (a rune the mirror can't separate from noise can't run away with the pick). */
export const FACTOR_MIN = 0.5, FACTOR_MAX = 3;
/** Smoothing for a hull that lost nothing in a mirror (hull units, x10 scale). */
const LOSS_FLOOR = 50;

export interface LastChanceRating {
  base: number; // the board's value now (rateOn)
  rune: number; // -Infinity when the offer has no rune
  part: number; // -Infinity when the offer has no part
  hull: number;
  factor?: number; // the rune's duel factor (battle runes only)
  placed?: boolean; // the part found a spot (else cargo)
}

export interface BotLastChance {
  boon: Boon;
  rating: LastChanceRating;
}

/** The board's wins for WARLORD'S DUE in the mirror (both sides alike). */
export interface BotLastChanceOpts {
  wins?: number;
  /** The run the board belongs to (its cargo for merges, its uids); absent: a fresh run around the board. */
  run?: Run;
}

/** A run around `board` on `day` for the part's placement (cargo empty, uids after the board's). */
function boardRun(board: Build, hero: HeroId, day: number, from?: Run): Run {
  if (from) return { ...from, build: cloneBuild(board), inventory: from.inventory.map((i) => ({ ...i })), fuseFx: [], fuseAnim: [], gold: 0 } as Run;
  const run = newRun(hero, hashSeed("lastchance-bot-run", hero, day), `lc-bot-${hero}-${day}`);
  run.build = cloneBuild(board);
  run.day = day;
  run.gold = 0;
  const uids = [...board.items, ...board.mods, ...(board.turrets ?? [])].map((p) => p.uid);
  run.nextUid = Math.max(100, ...uids) + 1;
  return run;
}

/** The hull one ARMOR PACK buys for its price (gold -> hull, the gold runes' floor). */
const ARMOR = ITEMS[PACK_ITEM.armor];
const hullPerGold = (): number => (ARMOR.supply?.hull ?? 0) / Math.max(1, ARMOR.price);

/** Each side's hull lost to the other in one fight (the wind taken out). SCALE-2e E1 (REQ-BFG-098): with SCALE_RIGS on, the
 *  mirror carries the run's hearts lost too (`lost`, else the par run model's for the day: scaleRating.ts runCounts, whole
 *  by a seeded carry), so a GRUDGE ROD on the board reads a count in it; off, no `lost` is passed (the call as before). */
export function losses(a: Build, b: Build, seed: number, wins: number, day?: number, lost?: number): [number, number] {
  const hl = scaleRules() ? (lost ?? (day !== undefined ? runCounts(day).lost : undefined)) : undefined;
  const lc = hl === undefined ? undefined : carryCount(hl, seed);
  const bt = simulate(a, b, seed, undefined, [wins, wins], day, lc === undefined ? undefined : [lc, lc]); // HULL-1a (REQ-BFG-079): the day
  return [0, 1].map((i) => {
    const s = bt.sides[i];
    return Math.max(0, s.hull.max - s.hull.hp - s.stats.windTaken);
  }) as [number, number];
}

/** The rune's duel factor on `board` (see the header): > 1 when the rune makes the board win its mirror faster. */
export function runeDuelFactor(board: Build, id: string, day: number, wins = 0): number {
  const withRune: Build = { ...cloneBuild(board), runes: [...(board.runes ?? []), { id }] };
  let num = 0, den = 0;
  for (let i = 0; i < MIRROR_SEEDS; i++) {
    const seed = hashSeed("lastchance-mirror", board.hero, day, i);
    const [w0, w1] = losses(withRune, board, seed, wins, day);
    const [b0, b1] = losses(board, board, seed, wins, day);
    num += (w1 + LOSS_FLOOR) / (w0 + LOSS_FLOOR);
    den += (b1 + LOSS_FLOOR) / (b0 + LOSS_FLOOR);
  }
  return Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, num / den));
}

/** The gold rune `id` pays from the dawn after `day` to day RUN_DAYS's dusk if taken now (runeGrants' own count, with it
 *  as the LAST CHANCE rune right after `held` dawn runes). */
function goldBy10(board: Build, id: string, day: number): number {
  const held = board.runes ?? [];
  const list = [...held, { id }];
  const at = held.length;
  return runeGrants(list, RUN_DAYS, at).gold - runeGrants(held, RUN_DAYS).gold;
}

/** The rune card's rating (see the header). */
export function runeRating(board: Build, id: string, day: number, wins = 0): { value: number; factor?: number } {
  const d = RUNES[id];
  const base = rateOn(board, day);
  if (d.kind === "hull" || d.kind === "belt") {
    const b = cloneBuild(board);
    if (d.kind === "hull") b.hullBonus += d.amount.n;
    else b.beltCap += d.amount.n;
    return { value: rateOn(b, day) };
  }
  if (d.kind === "dawnGold" || d.kind === "runeTithe" || d.kind === "victorGold") {
    const b = cloneBuild(board);
    b.hullBonus += Math.floor(goldBy10(board, id, day) * hullPerGold());
    return { value: rateOn(b, day) };
  }
  const factor = runeDuelFactor(board, id, day, wins);
  return { value: base * factor, factor };
}

/**
 * The bots' LAST CHANCE pick on `board` (the deck that just lost dusk `day`), from `offer` (lastChance.ts lastChanceOffer):
 * the card whose board rates highest (see the header); ties go to the screen's order (rune, part, hull).
 */
export function botLastChancePick(offer: LastChanceOffer, hero: HeroId, board: Build, day: number, opts: BotLastChanceOpts = {}): BotLastChance {
  const base = rateOn(board, day);
  const hb = cloneBuild(board);
  hb.hullBonus += offer.hull;
  const hull = rateOn(hb, day);
  let part = -Infinity, placed: boolean | undefined;
  if (offer.part) {
    const run = boardRun(board, hero, day, opts.run);
    const r = placeFreePart(run, offer.part, new Rng(hashSeed("lastchance-place", hero, run.seed, day)), undefined, offer.partStars ?? 1); // HULL-1d: at its star
    placed = r.placed;
    part = rateOn(run.build, day);
    // BUMP-1E C2 (S8 item 7): a part is never worth less than its sale spent on ARMOR PACKs (player.ts partSaleHull); a part that finds
    // no spot (cargo, the board unchanged) rated "no gain" and so lost to every other card by construction
    const sold = cloneBuild(board);
    sold.hullBonus += partSaleHull(offer.part, offer.partStars ?? 1);
    part = Math.max(part, rateOn(sold, day));
  }
  let rune = -Infinity, factor: number | undefined;
  if (offer.rune) {
    const r = runeRating(board, offer.rune.id, day, opts.wins ?? 0);
    rune = r.value;
    factor = r.factor;
  }
  const rating: LastChanceRating = { base, rune, part, hull, ...(factor !== undefined ? { factor } : {}), ...(placed !== undefined ? { placed } : {}) };
  let boon: Boon = "rune", best = rune;
  if (part > best) { boon = "part"; best = part; }
  if (hull > best) { boon = "hull"; best = hull; }
  return { boon, rating };
}
