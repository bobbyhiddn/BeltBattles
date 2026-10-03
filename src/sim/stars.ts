// 0.6.1a: module stars (ARSENAL.md §4.2). Pure and sim-side: no RNG, no run state.
// Two copies of one fusible def at the same star level merge into one copy a level higher
// (src/game/fuse.ts). A copy's `stars` field is optional everywhere (absent = 1 star), so old
// saves, ghosts and fixtures need no rewrite; code never writes `stars: 1`.

import { HEROES, ITEMS, SIGNATURE_OFFER, type HeroId, type ItemDef } from "./content";

/** The highest star level: 1+1 make 2, 2+2 make 3, and 3 never fuses further. */
export const FUSE_MAX = 3;

/**
 * bb-0.8.3 (REQ-BFG-042 D2): every hero's signature factory (KILN, LOOM, CRUCIBLE, WARDWORKS, CLOCKWORKS, SUMP). Each
 * levels up by merging like any factory: the hero's starting copy is ★1, and a copy from the hero's own caravan merges
 * with it. None is sold by a merchant, and none ever sells or stows (run.ts storePlaced).
 */
export const SIGNATURE_FACTORIES: ReadonlySet<string> = new Set(Object.values(HEROES).map((h) => h.factory));

/** bb-0.8.3 (D2): is `def` a hero's signature factory (any hero's)? */
export const isSignatureFactory = (def: string): boolean => SIGNATURE_FACTORIES.has(def);

/** bb-0.8.3 (D9): `hero`'s own signature factory def. */
export const signatureOf = (hero: HeroId): string => HEROES[hero].factory;

/** A copy's star level: absent (or anything below 1) is 1, above FUSE_MAX is FUSE_MAX. */
export function starsOf(x: { stars?: number } | undefined): number {
  const s = x?.stars;
  if (typeof s !== "number" || !Number.isFinite(s) || s < 1) return 1;
  return Math.min(FUSE_MAX, Math.floor(s));
}

/**
 * True for every buyable gate, factory, mod and turret core (0.6.1b): they merge. Never for supplies
 * (consumed on purchase) or a hero signature (KILN, LOOM, the race factories: price 0, never in cargo;
 * signature cores are not ITEMS at all). bb-0.8.3 (REQ-BFG-042 D2, D9): a signature factory merges too, but it is no
 * shared part (no merchant, price 0: no wagon, road event or familiar draws it, and its caravan price is
 * SIGNATURE_OFFER's): `merges` is the merge rule, and this stays the shared parts that merge.
 */
export function fusible(def: string): boolean {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d) return false;
  // 0.6.2s (REQ-BFG-031 S6): turrets merge like every buyable module
  return (d.kind === "gate" || d.kind === "factory" || d.kind === "mod" || d.kind === "core" || d.kind === "turret") && d.price > 0;
}

/**
 * bb-0.8.3 (REQ-BFG-042 D2): does `def` level up by merging? Every fusible part, and every hero's signature factory,
 * which merges like any factory (the hero's starting copy is ★1; a copy from the hero's own caravan merges with it).
 * The merge machinery (game/fuse.ts) and the upload check's merge rules (net/validate.ts) read this.
 */
export function merges(def: string): boolean {
  return fusible(def) || SIGNATURE_FACTORIES.has(def);
}

const cache = new Map<string, ItemDef>();

/**
 * The item's def with its spec at `stars`: ItemDef.levels[2] (and then levels[3]) merged over the
 * 1-star gate/factory/mod spec. At 1 star, or for an item without levels, it is ITEMS[def] itself,
 * so 1-star decks fight exactly as in 0.6.0. Values in levels[n].pending are NOT applied (0.6.1p applied every
 * 0.6.1a pending perk, so no live module stores any: pendingAt is {} for each).
 * Throws for an unknown def, like deck.ts:defOf.
 */
export function effectAt(def: string, stars: number): ItemDef {
  const base = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!base) throw new Error(`unknown item ${def}`);
  const s = starsOf({ stars });
  if (s <= 1 || !base.levels) return base;
  const k = `${def}*${s}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const out: ItemDef = { ...base };
  for (let n = 2; n <= s; n++) {
    const lv = base.levels[n as 2 | 3];
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
 * bb-0.8.3 (REQ-BFG-042 D9): what a deck's or a run's copies (items, mods or cargo) are worth, summed: each copy's
 * valueOf, except that `hero`'s own signature factory counts its bought copies only. Its starting copy was free, so the
 * hero's factory is worth its price x (its copies, each counted as 2^(stars-1), minus 1): a FURNACE that bought three
 * KILN copies (a ★3) holds 3 prices, not 4. Another hero's signature counts in full (validate.ts refuses it anyway).
 * The one rule for every sum of value: validate.ts buildCost (the upload budget, roadCap's player mode through it),
 * rivals.ts deckCost, rivalBuilds.ts, and the harness through buildCost.
 */
export function partsValue(parts: Iterable<{ def: string; stars?: number }>, hero?: HeroId): number {
  const own = hero ? HEROES[hero]?.factory : undefined;
  let v = 0, held = false;
  for (const p of parts) {
    v += copyValue(p.def, starsOf(p));
    if (p.def === own) held = true;
  }
  return held ? v - copyValue(own!, 1) : v;
}

/**
 * bb-0.8.3 (REQ-BFG-042 D9): the gold a copy at `stars` is worth: valueOf, and for a signature factory (ItemDef price 0)
 * the copies its caravan sells, SIGNATURE_OFFER.price x 2^(stars-1). For one copy held alone (a ★1 waiting in cargo);
 * a deck or a run sums partsValue, which takes the free starting copy off.
 */
export function copyValue(def: string, stars = 1): number {
  const sig = SIGNATURE_FACTORIES.has(def) ? SIGNATURE_OFFER.price[def] : undefined;
  return sig !== undefined ? sig * 2 ** (starsOf({ stars }) - 1) : valueOf(def, stars);
}

/**
 * bb-0.8.3 (REQ-BFG-042 D1): a factory's belt slots by its star level (the index): 2 at ★1, and one more each time it
 * levels up by merging, 3 at ★2 and 4 at ★3.
 */
export const BELT_SLOTS: readonly number[] = [0, 2, 3, 4];

/**
 * The belts (routes) a factory can feed at `stars`, 0 for anything that is not a factory. bb-0.8.3 (REQ-BFG-042 D1-D3):
 * the one rule, for every factory, bought or a hero's signature: BELT_SLOTS[stars] plus its lead (FactorySpec.lead: the
 * LOOM and GANTRY PRESS 1, so 3 / 4 / 5). validate.ts, routeCheck.ts, the editor, the inspector and the harness all read
 * this. Throws for an unknown def, like effectAt.
 */
export function outputsAt(def: string, stars: number): number {
  const spec = effectAt(def, stars).factory;
  if (!spec) return 0;
  return BELT_SLOTS[starsOf({ stars })] + (spec.lead ?? 0);
}

/**
 * bb-0.8.3 (REQ-BFG-042 D4): a factory's pour size at `stars`, on a hero whose signature ammo is `heroAmmo`: one cast puts
 * a slug onto at most this many of its belts with room, on one tick, taking them in turn when it feeds more (races/
 * foundry.ts pourAll, rule R). 0: it feeds its belts one slug a cycle, in turn (Battle.stamp). TWIN MOULD 2 / 2 / 3; the
 * CRUCIBLE 2; a MIMIC FORGE only from ★3 (TWIN SIGNET: 2) and only where it makes the blanks (FOUNDRY: Battle.factoryDef
 * gives it the hero's ammo). Throws for an unknown def, like effectAt.
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
