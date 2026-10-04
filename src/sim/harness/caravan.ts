// 0.6.2 step 5 (REQ-BFG-033 clause 2): the caravan-bound stand-in population. The stand-in generator (standins.ts,
// `standins --source caravan`, the CLI default) draws its candidates and its gauntlet from par-player runs instead of
// full-purse builds: a candidate for hero h and day d is the dusk deck of day d of a run of player.ts playerRun, which
// buys only what the game's caravan offers (rollShop: fresh-first slots, the familiar slot), at the offer price, pays
// for its rerolls and merges through gainModule. Nothing here changes player.ts or par.ts; it only calls their exports.
//
// - Policies (a fixed mix by population index, so every population size 64, 128, 256 holds the same shares):
//   idx % 4 = 0 or 1: "typical" (the par policy, PLAYER_POLICY.typical); 2: "sharp" (no misjudging, no whims, best
//   spots, belts re-drawn to the best length); 3: "loose" = typical with impulse 1 (every pick that is not a merge is
//   any offer the deck can take: FB-C's "random" rung of the skill ladder, PAR-REPORT section 4f).
// - One run per (policy, seed) serves every day: candidate idx is the same player on day 1 and on day 10, and its
//   day-d deck is playerRun(hero, 10, seed)[d - 1] (player.ts caches the run).
// - Seeds are disjoint from the par field's (par.ts parSeeds: 1..PAR_K, 1..12) and from each other: candidate idx
//   plays run seed 10000 x (generator seed - 1) + 1000 + idx, gauntlet member i run seed 10000 x (seed - 1) + 5000 + i.
// - Candidates stop at 2 stars (maxStars STANDIN_MAX_STARS: the player never buys a copy whose merge would go above);
//   the gauntlet, like the par field, is uncapped (the typical policy, FUSE_MAX).
// - Gold: a run's deck value + reroll gold + sale losses + unspent gold = maxGoldByDay(day) (player.ts). The stored
//   cost is the deck's value (buildCost; the budget check is value <= maxGoldByDay); rerolls and sale losses are gold
//   SPENT, not deck value, so the spend floor (spendFloor: 90% of maxGoldByDay) is met when the gold spent,
//   maxGoldByDay - unspent (= value + rerolls + sale losses), reaches it.

import type { HeroId } from "../content";
import { hullSlots, turretList, type Build } from "../deck";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { FUSE_MAX, starsOf } from "../stars";
import { spendFloor } from "./gen";
import { PLAYER_DAYS, playerRun, type PlayerOpts } from "./player";
import { runeGrants } from "../runes"; // RUNES-2a (REQ-BFG-058): a bot's dawn-gold runes in its gold

/** Where the stand-in population comes from: "caravan" (par-player runs; the CLI default since step 5) or "fullpurse"
 *  (standInCandidate / fullPurseBuild, the pools up to v2.1; the library default when the option is absent). */
export type StandInSource = "caravan" | "fullpurse";

export type CaravanPolicy = "typical" | "sharp" | "loose";

/** The player options of each caravan policy (without maxStars, which the caller sets). */
export const CARAVAN_POLICY: Readonly<Record<CaravanPolicy, Readonly<PlayerOpts>>> = {
  typical: { policy: "typical" },
  sharp: { policy: "sharp" },
  loose: { policy: "typical", tune: { impulse: 1 } },
};

/** The fixed policy mix by population index (1/2 typical, 1/4 sharp, 1/4 loose). */
export const CARAVAN_MIX: readonly CaravanPolicy[] = ["typical", "typical", "sharp", "loose"];

export const CARAVAN_POP_SEED0 = 1000;
export const CARAVAN_GAUNTLET_SEED0 = 5000;
export const CARAVAN_SEED_STRIDE = 10_000;

export const caravanPolicyOf = (idx: number): CaravanPolicy => CARAVAN_MIX[idx % CARAVAN_MIX.length];

/** The run seed of population candidate idx under generator seed `seed`. */
export function caravanSeedOf(seed: number, idx: number): number {
  if (!Number.isInteger(idx) || idx < 0 || idx >= CARAVAN_GAUNTLET_SEED0 - CARAVAN_POP_SEED0) throw new Error(`caravan population index ${idx} is out of range`);
  return CARAVAN_SEED_STRIDE * (seed - 1) + CARAVAN_POP_SEED0 + idx;
}

/** The run seed of gauntlet member i under generator seed `seed`. */
export function caravanGauntletSeedOf(seed: number, i: number): number {
  if (!Number.isInteger(i) || i < 0 || i >= CARAVAN_SEED_STRIDE - CARAVAN_GAUNTLET_SEED0) throw new Error(`caravan gauntlet index ${i} is out of range`);
  return CARAVAN_SEED_STRIDE * (seed - 1) + CARAVAN_GAUNTLET_SEED0 + i;
}

/** What a caravan candidate carries besides its deck (reports; the stored tuple holds the deck's value as its cost). */
export interface CaravanMeta {
  policy: CaravanPolicy;
  seed: number; // the run seed
  spent: number; // maxGoldByDay(day) - unspent: deck value + reroll gold + sale losses (+ cargoGold)
  rerollGold: number; // days 1..day
  soldLoss: number; // days 1..day
  unspent: number; // gold carried into the next dawn
  cargoGold: number; // spent gold in neither the deck, the rerolls nor the sale losses (0 when the run's gold adds up)
}

export interface CaravanDeck { build: Build; value: number; floorMet: boolean; meta: CaravanMeta }

/** The day-`day` dusk deck of the (hero, policy, seed) run (a fresh copy), with its gold. RUNES-2a: `botRunes` (absent:
 *  runes.ts BOT_RUNES, off) has the player take a rune at each dawn; its dawn-gold runes' gold joins the day's gold. */
export function caravanDeck(hero: HeroId, day: number, seed: number, policy: CaravanPolicy, maxStars: number, botRunes?: boolean): CaravanDeck {
  const d = playerRun(hero, PLAYER_DAYS, seed, { ...CARAVAN_POLICY[policy], maxStars, ...(botRunes !== undefined ? { botRunes } : {}) })[day - 1];
  if (!d) throw new Error(`caravan deck: no day ${day} in a ${PLAYER_DAYS}-day run`);
  if (buildCost(d.build).total !== d.value) throw new Error(`caravan deck ${hero} d${day} ${policy} ${seed}: the run's value ${d.value} != buildCost ${buildCost(d.build).total}`);
  // RUNES-2a: as validate.ts reads a deck with runes: the bought deck's value (the HULL and BELT runes' own taken out of
  // hullBonus / beltCap) and the day's gold plus the dawn-gold runes' gold. Without runes both are exactly as before.
  const grant = runeGrants(d.build.runes, day);
  const value = grant.hull || grant.belt ? buildCost({ ...d.build, hullBonus: d.build.hullBonus - grant.hull, beltCap: d.build.beltCap - grant.belt }).total : d.value;
  const spent = maxGoldByDay(day) + grant.gold - d.gold;
  const meta: CaravanMeta = { policy, seed, spent, rerollGold: d.rerollGold, soldLoss: d.soldLoss, unspent: d.gold, cargoGold: spent - value - d.rerollGold - d.soldLoss };
  return { build: d.build, value, floorMet: spent >= spendFloor(day), meta };
}

/** Population candidate idx of (hero, day) under generator seed `seed`: its policy's run, capped at `maxStars`. */
export const caravanCandidate = (hero: HeroId, day: number, seed: number, idx: number, maxStars: number, botRunes?: boolean): CaravanDeck =>
  caravanDeck(hero, day, caravanSeedOf(seed, idx), caravanPolicyOf(idx), maxStars, botRunes);

/** Gauntlet member i of (hero, day) under generator seed `seed`: a typical player's run, uncapped (as the par field). */
export const caravanGauntlet = (hero: HeroId, day: number, seed: number, i: number, botRunes?: boolean): Build =>
  caravanDeck(hero, day, caravanGauntletSeedOf(seed, i), "typical", FUSE_MAX, botRunes).build;

/** Report counts of one deck (step 5 dry runs): merged copies by stars (items, modules and installed turrets), whether it
 *  carries Build.turrets, its starting turrets merged above 1 star (free copies in their own slot), its turrets beyond
 *  the starting layout (a bought copy, a copy in another slot than its start, or anything in the extra slot) and its
 *  joining belts. */
export interface DeckStats { star2: number; star3: number; turretsField: boolean; mergedStart: number; beyondStart: number; joins: number }

export function deckStats(b: Build): DeckStats {
  const all = [...b.items, ...b.mods, ...(b.turrets ?? [])];
  const slots = hullSlots(b.hero);
  const list = turretList(b);
  return {
    star2: all.filter((p) => starsOf(p) === 2).length,
    star3: all.filter((p) => starsOf(p) === 3).length,
    turretsField: !!b.turrets,
    mergedStart: list.filter((t) => t.free && slots[t.slot]?.start === t.def && starsOf(t) > 1).length,
    beyondStart: list.filter((t) => !t.free || slots[t.slot]?.start !== t.def).length,
    joins: b.routes.filter((r) => r.join !== undefined).length,
  };
}
