// 0.6.1a harness v2: merge-aware module intake. ARSENAL.md §9.2 says to import the game's own
// code, not re-implement it. src/game/fuse.ts's gainModule/mergePreview only read and write
// run.build, run.inventory, run.nextUid and run.fuseFx (checked against fuse.ts's own source:
// copiesOf, absorb, setStars and gainModule itself never touch anything else on Run) — so "the
// smallest Run that wraps the build" is a plain object literal; every other Run field is inert
// filler this module never reads back. Nothing here is browser-only: fuse.ts itself only imports
// ../sim/content, ../sim/deck and ../sim/stars, the same modules every other harness file uses,
// so this runs in plain Node exactly like the rest of the harness.

import type { HeroId } from "../content";
import { ITEMS } from "../content";
import type { Build } from "../deck";
import { gainModule, mergePreview, type FuseWhere, type Gain, type GainAt } from "../../game/fuse";
import type { Run } from "../../game/run";
import { FUSE_MAX, fusible, starsOf } from "../stars";

/** A Run whose only live fields are `build`, `inventory`, `nextUid` and `fuseFx`. */
function wrap(b: Build, nextUid: number): Run {
  const enemyHero: HeroId = b.hero === "furnace" ? "weaver" : "furnace";
  return {
    version: 0, seed: 0, runId: "harness", hero: b.hero, enemyHero,
    day: 1, gold: 0, lives: 1, wins: 0, losses: 0,
    build: b, inventory: [], shop: { wagons: [], rerolls: 0, discount: 0, free: 0 },
    nextUid, history: [], over: null,
    stage: "caravan", event: null, nextShop: { discount: 0, free: 0 }, events: [], dusk: null,
    road: null, warlord: null, warlords: [], matriarchBeatenOn: null, bounty: null, sabotage: null,
  };
}

/** A ticket threading a shared uid counter through repeated gains; Shopper satisfies this directly. */
export interface UidSeed { uid: number }

/**
 * Gain one 1-star copy of `def` into `b` (mutated in place) through the real game rules
 * (src/game/fuse.ts:gainModule): if a same-def, same-star twin is already placed, the new copy
 * fuses into it immediately (the survivor keeps its cell/turret, ARSENAL.md §4.1 rule 4) and `at`
 * is ignored, exactly like run.ts:buyOffer's `pv && pv.where !== "cargo" ? undefined : at`.
 * Otherwise the copy is placed at `at` (a free cell for a gate/factory, a free turret for a mod).
 * Advances `s.uid` by exactly the one uid gainModule minted.
 */
export function gainInto(s: UidSeed, b: Build, def: string, at: GainAt): Gain {
  const preview = mergePreview(wrap(b, s.uid), def);
  const run = wrap(b, s.uid);
  const gain = gainModule(run, def, preview && preview.where !== "cargo" ? undefined : at);
  s.uid = run.nextUid;
  return gain;
}

/** What gaining one more copy of `def` into `b` would do, without changing it (no `at`: mirrors
 *  run.ts's own use of mergePreview, which always previews a cargo gain regardless of drop target). */
export function previewMerge(b: Build, uidSeed: number, def: string): { toStars: number; survivorUid: number; where: FuseWhere } | null {
  return mergePreview(wrap(b, uidSeed), def);
}

/** Every fusible copy on the deck (item or mod) below FUSE_MAX: what the "merge" lever and the
 *  star bench have to grow. */
export interface FusibleCopy { uid: number; def: string; kind: "gate" | "factory" | "mod"; stars: number }

export function fusibleCopies(b: Build): FusibleCopy[] {
  const out: FusibleCopy[] = [];
  for (const p of b.items) if (fusible(p.def) && starsOf(p) < FUSE_MAX) out.push({ uid: p.uid, def: p.def, kind: ITEMS[p.def].kind as "gate" | "factory", stars: starsOf(p) });
  for (const m of b.mods) if (fusible(m.def) && starsOf(m) < FUSE_MAX) out.push({ uid: m.uid, def: m.def, kind: "mod", stars: starsOf(m) });
  return out;
}
