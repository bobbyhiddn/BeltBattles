// BUMP-1F P2 (F1 and Q5 of BUMP-1E's REPORT section 11; BRIEF-BUMP1F "THE WORLDS LEAVE ITEMS AS THEY FOUND IT").
//
// Five switches add, remove or swap defs in ITEMS (PLAIN_RIGS, SHAPES, SHAPES2, SCALE_RIGS, GATES) and LADDER_FIX swaps the fixed pieces' defs.
// A world (validate.ts: inRulesWorld, inShapesWorld, inShapes2World, inScaleWorld, inGatesWorld) turns some of them OFF to judge a record made
// under older rules and puts each back when it leaves. Putting a switch back re-adds its ids at the END of ITEMS (a key deleted and assigned
// again goes last) and its swap overwrites the def it finds, so the nest's order decided what ITEMS looked like AFTER the call:
//  - F1, first face: for rules older than bb-0.10.0, withLadderFix(false) sat OUTSIDE the scaling switch's off call, so on the way out the
//    ladder fix's restore overwrote KINDLING with QUENCH TANK (Q5: ITEMS.quench changed while scaleRules() stayed true);
//  - F1, second face: for rules older than bb-0.11.0 the scaling switch was the INNERMOST of the nest, so SHAPES2's six came back behind the
//    seven scaling ids and Object.keys(ITEMS) was permuted: every seeded draw after it in that process read another order.
// THE RULE: after any world call returns, ITEMS is the same keys in the same order holding the same def objects. keepItems makes the rule
// hold whatever the order of the nest: it records ITEMS, runs `fn`, and puts ITEMS back exactly if `fn` left it any other way (the star cache
// is cleared then, as every switch's own swap clears it). When nothing moved it touches nothing, so a world that switches nothing costs a
// compare. The worlds wrap only the call that turns a switch off; a nest of worlds keeps each level's state, and the outermost restore wins.
import { ITEMS, type ItemDef } from "./content";
import { clearStarCache } from "./stars";

// THE CANONICAL ORDER (found by the P2 tests: with GATES on in the code, where the three gates sit in ITEMS depended on which module an entry
// point loaded first: rulesGate.ts imports ./gates before ./scale, deck.ts the other way round). Each switch that ADDS ids registers them with a
// rank at module load and adds them with addRanked: the base's ids, then PLAIN_RIGS' six, SHAPES' three, SHAPES2's six, SCALE's seven, GATES' three,
// whatever the load order or the order the switches are turned on and off in. Swapping a def under an existing key never moves the key.
export const ITEM_RANK = { plain: 1, shapes: 2, shapes2: 3, scale: 4, gates: 5 } as const;
const RANK = new Map<string, number>();

/** A switch registers the ids it adds, once, when its module loads (before its first add). */
export function registerRanked(rank: number, ids: readonly string[]): void {
  for (const id of ids) RANK.set(id, rank);
}

/** Add `ids` (defs from `defs`) to ITEMS at their rank: after every base id and every lower rank, before the higher ranks (which are taken out and
 *  put back behind them). With nothing of a higher rank in ITEMS, the usual case, it is a plain append. */
export function addRanked(rank: number, defs: Readonly<Record<string, ItemDef>>, ids: readonly string[]): void {
  const items = ITEMS as Record<string, ItemDef>;
  const later = Object.keys(items).filter((k) => (RANK.get(k) ?? 0) > rank);
  const held = later.map((k) => items[k]);
  for (const k of later) delete items[k];
  for (const id of ids) items[id] = defs[id];
  for (let i = 0; i < later.length; i++) items[later[i]] = held[i];
}

/** What `keepItems` records: ITEMS' keys in order and the def object under each. */
export interface ItemsSnapshot {
  keys: string[];
  defs: ItemDef[];
}

/** ITEMS as it is now. */
export function snapshotItems(): ItemsSnapshot {
  const keys = Object.keys(ITEMS);
  return { keys, defs: keys.map((k) => ITEMS[k]) };
}

/** Is ITEMS exactly `s` now: the same keys in the same order, the same def object under each? */
export function itemsAre(s: ItemsSnapshot): boolean {
  const now = Object.keys(ITEMS);
  if (now.length !== s.keys.length) return false;
  for (let i = 0; i < now.length; i++) if (now[i] !== s.keys[i] || ITEMS[now[i]] !== s.defs[i]) return false;
  return true;
}

/** Put ITEMS back as `s` has it (in place: ITEMS is imported by value everywhere). True when something had to be put back. */
export function putItemsBack(s: ItemsSnapshot): boolean {
  if (itemsAre(s)) return false;
  const items = ITEMS as Record<string, ItemDef>;
  for (const k of Object.keys(items)) delete items[k];
  for (let i = 0; i < s.keys.length; i++) items[s.keys[i]] = s.defs[i];
  clearStarCache();
  return true;
}

/** Run `fn` and leave ITEMS as it was found, even if `fn` throws: the world functions in src/net/validate.ts wrap their switch-off calls in it. */
export function keepItems<T>(fn: () => T): T {
  const was = snapshotItems();
  try {
    return fn();
  } finally {
    putItemsBack(was);
  }
}
