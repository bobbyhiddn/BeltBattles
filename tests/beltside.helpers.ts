// Shared test helpers for 0.6.2 BELTSIDE (not a test file). The stand-in pool v1.1 was generated with gates
// ON belt tiles and is not regenerated in the BELTSIDE branch (ref/DESIGN-beltside.md D4: the harness
// re-bakes it natively later); decodeStandIn migrates each deck (D3) and drops, and logs, a rig with no free
// cell beside its tile. So a pool deck as the game loads it costs its generated cost minus what D3 dropped.
// The pool tests assert the generation's properties (full purse, stored cost) on the deck as generated,
// and exact equality once the pool is native (POOL_NATIVE: no deck needs the migration).
import { ITEMS, type HeroId } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import { buildCost } from "../src/net/validate";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { decodeStandIn, decodeStandInRaw, standInPickIndex } from "../src/sim/standInPool";

/** Rigs standing ON a belt tile (the pre-BELTSIDE placement). */
export function inlineRigs(b: Build) {
  const belt = new Set(b.routes.flatMap((r) => r.cells));
  return b.items.filter((p) => ITEMS[p.def]?.kind === "gate" && belt.has(key(p.x, p.y)));
}

const codeOf = (hero: HeroId, day: number, i: number): string => STAND_IN_DATA.pools[hero]![day - 1][1][i][3];

/** Gold the D3 migration dropped from pool entry `i` of (hero, day): generated cost minus loaded cost. */
export function poolLoss(hero: HeroId, day: number, i: number): number {
  const code = codeOf(hero, day, i);
  return buildCost(decodeStandInRaw(hero, code)).total - buildCost(decodeStandIn(hero, code)).total;
}

/** The same for standInPick(hero, day, seed). */
export function pickLoss(hero: HeroId, day: number, seed: number): number {
  return poolLoss(hero, day, standInPickIndex(hero, day, seed));
}

/** Pool entry `i` of (hero, day) as generated (no migration). */
export function poolRaw(hero: HeroId, day: number, i: number): Build {
  return decodeStandInRaw(hero, codeOf(hero, day, i));
}

/** True once the pool is re-baked natively (D4): no deck in it has a rig on a belt tile. */
export const POOL_NATIVE = (Object.keys(STAND_IN_DATA.pools) as HeroId[]).every((hero) =>
  STAND_IN_DATA.pools[hero]!.every((d) => d[1].every((t) => inlineRigs(decodeStandInRaw(hero, t[3])).length === 0)));
