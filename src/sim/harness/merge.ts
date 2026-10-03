// 0.6.1a harness v2: merge-aware module intake. ARSENAL.md §9.2 says to import the game's own
// code, not re-implement it. src/game/fuse.ts's gainModule/mergePreview only read and write
// run.build, run.inventory, run.nextUid and run.fuseFx (checked against fuse.ts's own source:
// copiesOf, absorb, setStars and gainModule itself never touch anything else on Run) — so "the
// smallest Run that wraps the build" is a plain object literal; every other Run field is inert
// filler this module never reads back. Nothing here is browser-only: fuse.ts itself only imports
// ../sim/content, ../sim/deck and ../sim/stars, the same modules every other harness file uses,
// so this runs in plain Node exactly like the rest of the harness.
//
// 0.6.1b (harness v2 part 2): turret cores. A core gained onto a turret takes its socket and a bought
// core already there goes to CARGO with its stars (fuse.ts freeSocket, c432bee fuse.ts:139-144; ARSENAL.md
// §2.1 rule 6: a swap, not the gear rule). The harness keeps that cargo (Shopper.cargo): it doesn't fight
// (a Build has no cargo), but its gold was spent and a later copy can still merge with it, exactly as
// gainModule's survivor rules say (placed beats cargo, fuse.ts:74-85). With no cargo passed, every call
// wraps `inventory: []`, which is exactly the part-1 behaviour.

import type { HeroId } from "../content";
import { ITEMS } from "../content";
import type { Build } from "../deck";
import { fuseAll, gainModule, mergePreview, unfusedInRun, type FuseStep, type FuseWhere, type Gain, type GainAt } from "../../game/fuse";
import type { InvItem, Run } from "../../game/run";

export type { InvItem };
import { copyValue, FUSE_MAX, fusible, starsOf, valueOf } from "../stars";

/** A Run whose only live fields are `build`, `inventory`, `nextUid` and `fuseFx`. */
function wrap(b: Build, nextUid: number, inventory: InvItem[] = []): Run {
  const enemyHero: HeroId = b.hero === "furnace" ? "weaver" : "furnace";
  return {
    version: 0, seed: 0, runId: "harness", hero: b.hero, enemyHero,
    day: 1, gold: 0, lives: 1, wins: 0, losses: 0,
    build: b, inventory, shop: { wagons: [], rerolls: 0, discount: 0, free: 0 },
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
 * Otherwise the copy is placed at `at` (a free cell for a gate/factory, a free turret for a mod,
 * a turret's socket for a core: a bought core already there goes to `cargo`, fuse.ts freeSocket).
 * `cargo` (0.6.1b) is the run's cargo: read by the merge preview and the gain, and written back
 * (swapped-out cores arrive, absorbed cargo copies leave). Advances `s.uid` by exactly the one uid
 * gainModule minted.
 */
export function gainInto(s: UidSeed, b: Build, def: string, at: GainAt, cargo?: InvItem[]): Gain {
  const preview = mergePreview(wrap(b, s.uid, cargo ? cargo.map((i) => ({ ...i })) : []), def);
  const run = wrap(b, s.uid, cargo ? [...cargo] : []);
  const gain = gainModule(run, def, preview && preview.where !== "cargo" ? undefined : at);
  s.uid = run.nextUid;
  if (cargo) cargo.splice(0, cargo.length, ...run.inventory);
  return gain;
}

/** What gaining one more copy of `def` into `b` would do, without changing it (no `at`: mirrors
 *  run.ts's own use of mergePreview, which always previews a cargo gain regardless of drop target).
 *  `cargo` (0.6.1b): the run's cargo, which a gain can merge with too. */
export function previewMerge(b: Build, uidSeed: number, def: string, cargo?: InvItem[]): { toStars: number; survivorUid: number; where: FuseWhere } | null {
  return mergePreview(wrap(b, uidSeed, cargo ? cargo.map((i) => ({ ...i })) : []), def);
}

/** Every fusible copy on the deck (item, mod or 0.6.1b core) below FUSE_MAX: what the "merge"
 *  lever and the star bench have to grow. */
export interface FusibleCopy { uid: number; def: string; kind: "gate" | "factory" | "mod" | "core"; stars: number }

export function fusibleCopies(b: Build): FusibleCopy[] {
  const out: FusibleCopy[] = [];
  for (const p of b.items) if (fusible(p.def) && starsOf(p) < FUSE_MAX) out.push({ uid: p.uid, def: p.def, kind: ITEMS[p.def].kind as "gate" | "factory", stars: starsOf(p) });
  for (const m of b.mods) if (fusible(m.def) && starsOf(m) < FUSE_MAX) out.push({ uid: m.uid, def: m.def, kind: ITEMS[m.def].kind === "core" ? "core" : "mod", stars: starsOf(m) });
  return out;
}

/** 0.6.1b: the gold held in cargo (what was paid for it: valueOf at its stars). It doesn't fight. */
export function cargoValue(cargo: readonly InvItem[]): number {
  return cargo.reduce((s, i) => s + copyValue(i.def, starsOf(i)), 0); // bb-0.8.3 (D9): a waiting signature copy was bought
}

/** 0.6.1b: the run-level fuse invariant (fuse.ts unfusedInRun) over the deck AND its cargo. */
export function unfusedWithCargo(b: Build, cargo: readonly InvItem[]): string[] {
  return unfusedInRun(wrap(b, 0, cargo.map((i) => ({ ...i }))));
}

/** Part 2 (PAR~): a merged copy of `b` (not mutated), every same-def same-star pair fused with the game's own
 *  src/game/fuse.ts:fuseAll (lowest stars first, then uid; the §4.1 survivor rules; an absorbed gate cell stays
 *  belt, an absorbed factory drops its belts, an absorbed mod or core frees its spot). */
export function fuseDeck(b: Build): { build: Build; steps: FuseStep[] } {
  const c = JSON.parse(JSON.stringify(b)) as Build;
  const run = wrap(c, 1 + Math.max(0, ...c.items.map((p) => p.uid), ...c.mods.map((m) => m.uid)));
  const steps = fuseAll(run);
  return { build: run.build, steps };
}
