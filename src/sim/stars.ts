// 0.6.1a: module stars (ARSENAL.md §4.2). Pure and sim-side: no RNG, no run state.
// Two copies of one fusible def at the same star level merge into one copy a level higher
// (src/game/fuse.ts). A copy's `stars` field is optional everywhere (absent = 1 star), so old
// saves, ghosts and fixtures need no rewrite; code never writes `stars: 1`.

import { ITEMS, type ItemDef } from "./content";

/** The highest star level: 1+1 make 2, 2+2 make 3, and 3 never fuses further. */
export const FUSE_MAX = 3;

/** A copy's star level: absent (or anything below 1) is 1, above FUSE_MAX is FUSE_MAX. */
export function starsOf(x: { stars?: number } | undefined): number {
  const s = x?.stars;
  if (typeof s !== "number" || !Number.isFinite(s) || s < 1) return 1;
  return Math.min(FUSE_MAX, Math.floor(s));
}

/**
 * True for every buyable gate, factory and mod (and, later, cores): they merge. Never for supplies
 * (consumed on purchase) or a hero signature (KILN, LOOM, the race factories: price 0, never in cargo).
 */
export function fusible(def: string): boolean {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d) return false;
  return (d.kind === "gate" || d.kind === "factory" || d.kind === "mod") && d.price > 0;
}

const cache = new Map<string, ItemDef>();

/**
 * The item's def with its spec at `stars`: ItemDef.levels[2] (and then levels[3]) merged over the
 * 1-star gate/factory/mod spec. At 1 star, or for an item without levels, it is ITEMS[def] itself,
 * so 1-star decks fight exactly as in 0.6.0. Values in levels[n].pending are NOT applied (0.6.1a).
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

/** Routes a factory can feed at `stars` (0 for anything that is not a factory). */
export function outputsAt(def: string, stars: number): number {
  return effectAt(def, stars).factory?.outputs ?? 0;
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
