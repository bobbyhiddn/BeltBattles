// Shared test helpers for 0.6.2 BELTSIDE (not a test file). The stand-in pool v1.1 was generated with gates
// ON belt tiles and is not regenerated in the BELTSIDE branch (ref/DESIGN-beltside.md D4: the harness
// re-bakes it natively later); decodeStandIn migrates each deck (D3) and drops, and logs, a rig with no free
// cell beside its tile. So a pool deck as the game loads it costs its generated cost minus what D3 dropped.
// The pool tests assert the generation's properties (full purse, stored cost) on the deck as generated,
// and exact equality once the pool is native (POOL_NATIVE: no deck needs the migration).
// beltside-062-on-061 (ref/DESIGN-beltside.md §13 P15): since the 0.6.1 flip the shipped pool is v2, whose codes carry
// stars (*2), and the loader decodes with decodeStarred, a load boundary exactly as decodeStandIn is. The same rules
// hold for v2: "as generated" is decodeStarredRaw (the star-aware raw decode), "as loaded" is decodeStarred.
import { ITEMS, type HeroId } from "../src/sim/content";
import { arrowCell, hitsOfRig, key, kx, ky, occupancy, opposite, rigHits, setRot, type Build } from "../src/sim/deck";
import { freeForRig, hitsIfPlaced, migrateInlineGates, neighbourOrder, rotations, rotFacing } from "../src/sim/beltside";
import { buildCost } from "../src/net/validate";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { decodeStarred, decodeStarredRaw, standInPickIndex } from "../src/sim/standInPool";

/** Rigs standing ON a belt tile (the pre-BELTSIDE placement). */
export function inlineRigs(b: Build) {
  const belt = new Set(b.routes.flatMap((r) => r.cells));
  return b.items.filter((p) => ITEMS[p.def]?.kind === "gate" && belt.has(key(p.x, p.y)));
}

const codeOf = (hero: HeroId, day: number, i: number): string => STAND_IN_DATA.pools[hero]![day - 1][1][i][3];

/** Gold the D3 migration dropped from pool entry `i` of (hero, day): generated cost minus loaded cost. */
export function poolLoss(hero: HeroId, day: number, i: number): number {
  const code = codeOf(hero, day, i);
  return buildCost(decodeStarredRaw(hero, code)).total - buildCost(decodeStarred(hero, code)).total;
}

/** The same for standInPick(hero, day, seed). */
export function pickLoss(hero: HeroId, day: number, seed: number): number {
  return poolLoss(hero, day, standInPickIndex(hero, day, seed));
}

/** Pool entry `i` of (hero, day) as generated (no migration). */
export function poolRaw(hero: HeroId, day: number, i: number): Build {
  return decodeStarredRaw(hero, codeOf(hero, day, i));
}

/**
 * beltside-062-on-061 (F1-style ports of harness v2's test decks, DESIGN §13 P16): the deck exactly as the v2 test
 * built it, gates standing on belt tiles, made native: D3 (migrateInlineGates) moves each gate beside its tile, facing
 * it, and every moved rig must then work exactly the tile its gate stood on (one hit, there). Where D3's spot lands a
 * second arrow on a belt too, the rig takes the first placement that works exactly its tile, trying the tile's free
 * sides in D3 order and, at each, every rotation (its first arrow facing the tile first), as F1's hand ports did.
 * Mutates and returns `b`; throws if a gate is stranded or no placement works exactly its tile.
 */
export function nativeRigs<T extends Build>(b: T): T {
  const m = migrateInlineGates(b);
  if (m.stranded.length) throw new Error(`nativeRigs: ${m.stranded.map((p) => `${p.def} ${p.uid}`).join(", ")} stranded`);
  for (const mv of m.moved) {
    const got = hitsOfRig(b, mv.uid, rigHits(b)).map((h) => h.cell);
    if (got.length === 1 && got[0] === mv.from) continue;
    const p = b.items.find((q) => q.uid === mv.uid)!;
    const at = beltAt(b, mv.from);
    const occ = occupancy(b);
    let done = false;
    for (const d of neighbourOrder(b, at[0], at[1])) {
      const k = arrowCell(kx(mv.from), ky(mv.from), d);
      if (k < 0 || (k !== key(p.x, p.y) && !freeForRig(b, k, occ))) continue;
      const face = rotFacing(p.def, opposite(d));
      for (const rot of [face, ...rotations(p.def).filter((r) => r !== face)]) {
        const hs = hitsIfPlaced({ ...b, items: b.items.filter((q) => q.uid !== p.uid) }, p.def, kx(k), ky(k), rot);
        if (hs.length !== 1 || hs[0].cell !== mv.from) continue;
        p.x = kx(k);
        p.y = ky(k);
        setRot(p, rot);
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) throw new Error(`nativeRigs: ${mv.def} ${mv.uid} works ${JSON.stringify(got)}, and no spot works exactly its old tile ${mv.from}`);
  }
  return b;
}

/** [route, tile] of belt cell k (the first route holding it). */
function beltAt(b: Build, k: number): [number, number] {
  for (let ri = 0; ri < b.routes.length; ri++) {
    const ti = b.routes[ri].cells.indexOf(k);
    if (ti >= 0) return [ri, ti];
  }
  throw new Error(`beltAt: ${k} is no belt tile`);
}

/** Where a new rig of `def` goes to work belt cell `k` of `b` (D3's spot: the first free neighbour, left of travel
 *  first, facing k), as a gainModule target { x, y, rot }; the harness v2 tests' "a gate on free belt cell k". */
export function spotBeside(b: Build, def: string, k: number): { x: number; y: number; rot: number } {
  const c: Build = JSON.parse(JSON.stringify(b));
  c.items.push({ uid: -1, def, x: k % 10, y: Math.floor(k / 10) });
  const m = migrateInlineGates(c);
  const mv = m.moved.find((x) => x.uid === -1);
  if (!mv) throw new Error(`spotBeside: no free cell beside ${k}`);
  return { x: mv.to % 10, y: Math.floor(mv.to / 10), rot: mv.rot };
}

/** True once the pool is re-baked natively (D4): no deck in it has a rig on a belt tile. */
export const POOL_NATIVE = (Object.keys(STAND_IN_DATA.pools) as HeroId[]).every((hero) =>
  STAND_IN_DATA.pools[hero]!.every((d) => d[1].every((t) => inlineRigs(decodeStarredRaw(hero, t[3])).length === 0)));
