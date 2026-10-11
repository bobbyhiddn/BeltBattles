// 0.6.1a: module stars (ARSENAL.md §4.2). Pure and sim-side: no RNG, no run state.
// Two copies of one fusible def at the same star level merge into one copy a level higher
// (src/game/fuse.ts). A copy's `stars` field is optional everywhere (absent = 1 star), so old
// saves, ghosts and fixtures need no rewrite; code never writes `stars: 1`.

import {
  HEROES, ITEMS, UPGRADE_MAX, UPGRADE_PRICE, UPGRADE_TRACKS, type HeroId, type ItemDef, type Upgrades, type UpgradeTrack,
} from "./content";
import { footSlots } from "./foot"; // SHAPES-1 (REQ-BFG-086 R3): the size's belt slots

/** The highest star level: 1+1 make 2, 2+2 make 3, and 3 never fuses further. */
export const FUSE_MAX = 3;

/**
 * bb-0.8.3 (REQ-BFG-043, REQ-BFG-044 D10): every hero's signature factory (KILN, LOOM, CRUCIBLE, WARDWORKS, CLOCKWORKS,
 * SUMP). None merges or has stars, no merchant sells one and no shop offers one; none ever sells or stows (run.ts
 * storePlaced). It levels 1-4 through its hero's FACTORY upgrade (Build.upgrades.factory; gradeOf).
 */
export const SIGNATURE_FACTORIES: ReadonlySet<string> = new Set(Object.values(HEROES).map((h) => h.factory));

/** bb-0.8.3 (D10): is `def` a hero's signature factory (any hero's)? */
export const isSignatureFactory = (def: string): boolean => SIGNATURE_FACTORIES.has(def);

/** bb-0.8.3 (D10): `hero`'s own signature factory def. */
export const signatureOf = (hero: HeroId): string => HEROES[hero].factory;

/** A copy's star level: absent (or anything below 1) is 1, above FUSE_MAX is FUSE_MAX. */
export function starsOf(x: { stars?: number } | undefined): number {
  const s = x?.stars;
  if (typeof s !== "number" || !Number.isFinite(s) || s < 1) return 1;
  return Math.min(FUSE_MAX, Math.floor(s));
}

/**
 * bb-0.8.3 (REQ-BFG-043 D10): an upgrade level: absent (or anything below 1) is 1, above UPGRADE_MAX is UPGRADE_MAX. The
 * strict decoder and validate.ts refuse anything outside 1..UPGRADE_MAX before a level is ever read here.
 */
export function levelOf(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(UPGRADE_MAX, Math.floor(n));
}

/** bb-0.8.3 (D10): a build's level on `track` (absent = 1). */
export function upgradeLevel(b: { upgrades?: Upgrades } | undefined, track: UpgradeTrack): number {
  return levelOf(b?.upgrades?.[track]);
}

/** bb-0.8.3 (D10): the gold paid to reach `level` on one track: 0 / 10 / 30 / 60 at levels 1 / 2 / 3 / 4. */
export function trackGold(level: number): number {
  let g = 0;
  for (let n = 2; n <= levelOf(level); n++) g += UPGRADE_PRICE[n];
  return g;
}

/**
 * bb-0.8.3 (REQ-BFG-043 D10): the upgrade gold a build's levels paid, both tracks: 0 / 10 / 30 / 60 each. THE one rule for
 * every sum of a deck's or a run's value or spend (validate.ts buildCost, so the upload budget and roadCap's player mode;
 * rivals.ts deckCost; rivalBuilds; the harness through buildCost; the rating's value terms; the road and the save).
 */
export function upgradeGold(b: { upgrades?: Upgrades } | undefined): number {
  return UPGRADE_TRACKS.reduce((s, t) => s + trackGold(upgradeLevel(b, t)), 0);
}

/**
 * bb-0.8.3 (REQ-BFG-043, REQ-BFG-044 D10): the grade a factory's spec and belt slots are read at: the hero's signature
 * factory's FACTORY level (1-4, the build's), any other copy's stars (1-3). Every reader of a placed factory's numbers
 * (the battle, the forecast and rating, the editor, the inspector, routeCheck, validate, the harness) goes through it.
 */
export function gradeOf(b: { upgrades?: Upgrades } | undefined, p: { def: string; stars?: number }): number {
  return SIGNATURE_FACTORIES.has(p.def) ? upgradeLevel(b, "factory") : starsOf(p);
}

/** bb-0.8.3 (D10): `grade` bounded for `def`: 1..UPGRADE_MAX for a signature factory, 1..FUSE_MAX (stars) otherwise. */
function gradeFor(def: string, grade: number): number {
  return SIGNATURE_FACTORIES.has(def) ? levelOf(grade) : starsOf({ stars: grade });
}

/**
 * True for every buyable gate, factory, mod and turret core (0.6.1b): they merge. Never for supplies
 * (consumed on purchase) or a hero signature (KILN, LOOM, the race factories: price 0, never in cargo;
 * signature cores are not ITEMS at all).
 */
export function fusible(def: string): boolean {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d) return false;
  // 0.6.2s (REQ-BFG-031 S6): turrets merge like every buyable module
  return (d.kind === "gate" || d.kind === "factory" || d.kind === "mod" || d.kind === "core" || d.kind === "turret") && d.price > 0;
}

const cache = new Map<string, ItemDef>();

/** HULL-1b (REQ-BFG-070): forget every cached star def. ladderFix.ts setLadderFix calls it when it swaps a fixed piece's
 *  def in ITEMS (nothing else does: with LADDER_FIX off the cache lives as before). */
export function clearStarCache(): void {
  cache.clear();
}

/**
 * The item's def with its spec at `stars`: ItemDef.levels[2] (and then levels[3]) merged over the
 * 1-star gate/factory/mod spec. At 1 star, or for an item without levels, it is ITEMS[def] itself,
 * so 1-star decks fight exactly as in 0.6.0. Values in levels[n].pending are NOT applied (0.6.1p applied every
 * 0.6.1a pending perk, so no live module stores any: pendingAt is {} for each).
 * bb-0.8.3 (D10): for a hero's signature factory `stars` is its FACTORY level, 1..UPGRADE_MAX (gradeOf): levels[2..4].
 * Throws for an unknown def, like deck.ts:defOf.
 */
export function effectAt(def: string, stars: number): ItemDef {
  const base = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!base) throw new Error(`unknown item ${def}`);
  const s = gradeFor(def, stars);
  if (s <= 1 || !base.levels) return base;
  const k = `${def}*${s}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const out: ItemDef = { ...base };
  for (let n = 2; n <= s; n++) {
    const lv = base.levels[n as 2 | 3 | 4];
    if (!lv) continue;
    if (lv.gate) out.gate = { ...out.gate, ...lv.gate };
    if (lv.factory) out.factory = { ...out.factory!, ...lv.factory };
    if (lv.mod) out.mod = { ...out.mod, ...lv.mod };
    if (lv.core) out.core = { ...out.core!, ...lv.core }; // 0.6.1b: a turret core's star values
    if (lv.turret) out.turret = { ...out.turret!, ...lv.turret }; // 0.6.2s: a turret's star values
  }
  cache.set(k, out);
  return out;
}

/** Star values stored for `stars` but not applied by the 0.6.1a sim (the pending perks), merged 2 then 3. */
export function pendingAt(def: string, stars: number): Record<string, number> {
  const base = ITEMS[def];
  const out: Record<string, number> = {};
  for (let n = 2; n <= starsOf({ stars }); n++) Object.assign(out, base?.levels?.[n as 2 | 3]?.pending ?? {});
  return out;
}

/** The named perk at `stars`, if any (the highest level that names one). */
export function perkAt(def: string, stars: number): string | undefined {
  let perk: string | undefined;
  for (let n = 2; n <= starsOf({ stars }); n++) perk = ITEMS[def]?.levels?.[n as 2 | 3]?.perk ?? perk;
  return perk;
}

/** Value (ARSENAL.md §5.1): price x 2^(stars - 1), so a merged module is worth exactly its copies. Unknown ids are 0. */
export function valueOf(def: string, stars = 1): number {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  return d ? d.price * 2 ** (stars - 1) : 0;
}

/**
 * bb-0.8.3 (REQ-BFG-044 D1, D10): a factory's belt slots by its grade (the index): 2 at ★1, 3 at ★2 and 4 at ★3 for a
 * bought factory (its stars); 2 / 3 / 4 / 5 at levels 1-4 for a hero's signature factory (its FACTORY level).
 */
export const BELT_SLOTS: readonly number[] = [0, 2, 3, 4, 5];

/**
 * The belts (routes) a factory can feed at `stars` (bb-0.8.3: its grade, gradeOf), 0 for anything that is not a factory.
 * bb-0.8.3 (REQ-BFG-044 D1-D3, D10): the one rule, for every factory, bought or a hero's signature: BELT_SLOTS[grade] plus
 * its lead (FactorySpec.lead: the LOOM and GANTRY PRESS 1, so the LOOM 3 / 4 / 5 / 6 and GANTRY PRESS 3 / 4 / 5).
 * validate.ts, routeCheck.ts, the editor, the inspector and the harness all read this. Throws for an unknown def.
 */
export function outputsAt(def: string, stars: number): number {
  const spec = effectAt(def, stars).factory;
  if (!spec) return 0;
  // SHAPES-1 (REQ-BFG-086 R3): + one slot for every 2 cells beyond 4 (foot.ts footSlots: a 2x3 1, a 3x3 2; a 2x2 0)
  return BELT_SLOTS[gradeFor(def, stars)] + (spec.lead ?? 0) + footSlots(ITEMS[def]);
}

/**
 * bb-0.8.3 (REQ-BFG-042 D4): a factory's pour size at `stars` (its grade), on a hero whose signature ammo is `heroAmmo`:
 * one cast puts a slug onto at most this many of its belts with room, on one tick, taking them in turn when it feeds more
 * (races/foundry.ts pourAll, rule R). 0: it feeds its belts one slug a cycle, in turn (Battle.stamp). TWIN MOULD 2 / 2 /
 * 3; the CRUCIBLE 2; a MIMIC FORGE only from ★3 (TWIN SIGNET: 2) and only where it makes the blanks (FOUNDRY:
 * Battle.factoryDef gives it the hero's ammo). Throws for an unknown def, like effectAt.
 */
export function pourAt(def: string, stars: number, heroAmmo?: string): number {
  const pour = effectAt(def, stars).factory?.pour ?? 0;
  return def === "mimic" && heroAmmo !== "blank" ? 0 : pour;
}

/** The optional star field for a copy: {} at 1 star (never written as 1), else { stars }. */
export function starField(stars: number): { stars?: number } {
  const s = starsOf({ stars });
  return s > 1 ? { stars: s } : {};
}

/** Player text for a star level: "★★" (the 5x7 font has a ★ glyph). */
export function starText(stars: number): string {
  return "★".repeat(starsOf({ stars }));
}
