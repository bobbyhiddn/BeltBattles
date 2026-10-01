// Balance harness: shop-luck tiers for the named NPC builds (0.6.2 TUNE-C, REQ-BFG-033). The operator's rule: "Named
// NPC plans grow through the caravan at luck tiers: stand-ins and Easy/Medium warlords at ordinary luck, Hard at good
// luck, and only the Iron Matriarch gets the stars-aligned deck." A tier is measured, not guessed: the par player
// (player.ts playerRun, the typical policy) plays LUCK_SEEDS real runs per hero through the game's caravan, and each
// dusk deck is read as LuckMeasures. Per hero-day, ORDINARY luck is the field's median of each measure (P50) and GOOD
// luck its P90; STARS-ALIGNED has no cap beyond the rules. tools/luckCaps.ts writes the table (luckCapsData.ts);
// tests/captains.luck.test.ts checks every captain deck against it.

import { hashSeed } from "../../core/rng";
import { HEROES, ITEMS, type HeroId, type Rarity } from "../content";
import { installedTurrets, type Build } from "../deck";
import { starsOf } from "../stars";
import { buildCost } from "../../net/validate";
import { PLAYER_DAYS, playerRun } from "./player";

/** A captain deck's luck: ordinary (untagged plan upgrades), good (+ "good"), stars (every upgrade). */
export type LuckTier = "ordinary" | "good" | "stars";
/** The tiers with a cap. */
export type CappedTier = Exclude<LuckTier, "stars">;

/** Par runs per hero that set the caps (seeds 1..LUCK_SEEDS). */
export const LUCK_SEEDS = 48;
/** The field percentile of each capped tier (nearest rank). */
export const LUCK_Q: Readonly<Record<CappedTier, number>> = { ordinary: 0.5, good: 0.9 };

/** What shop luck shows in a dusk deck. A PART is a deck item other than the hero's signature factory (rigs and
 *  bought factories), a piece of turret gear or a core, or an installed turret other than the hull's free 1-star
 *  starting copy (a bought turret, or a starting copy merged to 2+ stars). */
export interface LuckMeasures {
  value: number; // gold: the deck's buildCost (items, gear and cores, turrets, crates, plating)
  star2: number; // parts at 2 stars
  star3: number; // parts at 3 stars
  rare: number; // parts of rare rarity or better
  epic: number; // parts of epic rarity or better
  turrets: number; // bought turrets installed (not the hull's free starting copy, merged or not)
}

export const MEASURES: readonly (keyof LuckMeasures)[] = ["value", "star2", "star3", "rare", "epic", "turrets"];

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** The parts of a deck (see LuckMeasures): [def, stars] per part. */
export function luckParts(b: Build): { def: string; stars: number; bought: boolean }[] {
  const sig = HEROES[b.hero].factory;
  const out: { def: string; stars: number; bought: boolean }[] = [];
  for (const p of b.items) if (p.def !== sig) out.push({ def: p.def, stars: starsOf(p), bought: true });
  for (const m of b.mods) out.push({ def: m.def, stars: starsOf(m), bought: true });
  for (const v of installedTurrets(b)) {
    const s = starsOf(v.turret);
    if (v.turret.free && s <= 1) continue; // the hull's own starting copy: not a part
    out.push({ def: v.turret.def, stars: s, bought: !v.turret.free });
  }
  return out;
}

/** A deck's luck measures. */
export function luckMeasures(b: Build): LuckMeasures {
  const parts = luckParts(b);
  const rank = (def: string) => RANK[ITEMS[def].rarity];
  return {
    value: buildCost(b).total,
    star2: parts.filter((p) => p.stars === 2).length,
    star3: parts.filter((p) => p.stars >= 3).length,
    rare: parts.filter((p) => rank(p.def) >= RANK.rare).length,
    epic: parts.filter((p) => rank(p.def) >= RANK.epic).length,
    turrets: installedTurrets(b).filter((v) => !v.turret.free).length,
  };
}

/** Nearest-rank percentile: the smallest value with at least q of the sample at or below it. */
export function nearestRank(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/** Each measure's nearest-rank percentile q over a field of measures. */
export function capsOf(field: readonly LuckMeasures[], q: number): LuckMeasures {
  return Object.fromEntries(MEASURES.map((k) => [k, nearestRank(field.map((m) => m[k]), q)])) as unknown as LuckMeasures;
}

/** The measures of `m` above `cap` ("value 51 > 50"); empty when the deck fits. */
export function overCaps(m: LuckMeasures, cap: LuckMeasures): string[] {
  return MEASURES.filter((k) => m[k] > cap[k]).map((k) => `${k} ${m[k]} > ${cap[k]}`);
}

/** One hero-day's caps. */
export interface DayCaps { ordinary: LuckMeasures; good: LuckMeasures }

/** The committed caps table's shape (luckCapsData.ts): caps[hero][day - 1], and the par runs' fingerprint. */
export interface LuckCapsTable {
  seeds: number;
  fingerprint: Partial<Record<HeroId, string>>; // hex hash of seed 1's ten dusk decks per hero (the staleness sentinel)
  caps: Partial<Record<HeroId, DayCaps[]>>;
}

/** The heroes the par player plays (the caps' heroes). */
export const LUCK_HEROES: readonly HeroId[] = ["furnace", "weaver"];

/** The staleness sentinel: a hash of the par player's seed-`seed` run of `hero` (its ten dusk decks and buys), hex. A
 *  par-player change (policy, prices, the caravan, the rules) moves it; tests/captains.luck.test.ts recomputes it. */
export function parRunFingerprint(hero: HeroId, seed = 1): string {
  let h = 0;
  for (const d of playerRun(hero, PLAYER_DAYS, seed)) h = hashSeed("luck-fingerprint", h, JSON.stringify(d.build), JSON.stringify(d.buys));
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Every dusk deck's measures of the par field: out[day - 1][i] for seeds 1..seeds (typical policy). */
export function parLuckField(hero: HeroId, seeds = LUCK_SEEDS): LuckMeasures[][] {
  const out: LuckMeasures[][] = Array.from({ length: PLAYER_DAYS }, () => []);
  for (let s = 1; s <= seeds; s++) playerRun(hero, PLAYER_DAYS, s).forEach((d, i) => out[i].push(luckMeasures(d.build)));
  return out;
}

/** The caps table from the par field (LUCK_SEEDS runs per hero): what tools/luckCaps.ts writes. */
export function luckCapsTable(seeds = LUCK_SEEDS): LuckCapsTable {
  const caps: Partial<Record<HeroId, DayCaps[]>> = {}, fingerprint: Partial<Record<HeroId, string>> = {};
  for (const hero of LUCK_HEROES) {
    caps[hero] = parLuckField(hero, seeds).map((f) => ({ ordinary: capsOf(f, LUCK_Q.ordinary), good: capsOf(f, LUCK_Q.good) }));
    fingerprint[hero] = parRunFingerprint(hero);
  }
  return { seeds, fingerprint, caps };
}
